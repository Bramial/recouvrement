import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Upload, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Rapport {
  id: string; date_rapport: string; total_creances: number | null;
  total_en_retard: number | null; nb_factures_en_cours: number | null;
  nb_actions_jour: number | null; resume_ia: string | null;
  nb_emails_j7: number | null; nb_appels_j15: number | null;
  nb_mises_en_demeure_j30: number | null;
}
interface Import {
  id: string; nom_fichier: string; source: string | null; mois: string;
  date_import: string; nb_lignes_brutes: number | null;
  nb_lignes_parsees: number | null; statut: string;
  emitido_em: string | null;
  storage_path: string | null;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n);
}

function slugifyFilename(name: string) {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const cleaned = base
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${cleaned || 'fichier'}${ext.toLowerCase()}`;
}

function detectSource(name: string): 'FR' | 'PT' | null {
  const lower = name.toLowerCase();
  if (/portu/.test(lower)) return 'PT';
  if (/fran[cç]/.test(lower)) return 'FR';
  if (/(^|[^a-z])pt([^a-z]|$)/.test(lower)) return 'PT';
  if (/(^|[^a-z])fr([^a-z]|$)/.test(lower)) return 'FR';
  return null;
}

function parseAnyDate(s: string): Date | null {
  const iso = s.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    if (!isNaN(d.getTime())) return d;
  }
  const dm = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dm) {
    let year = Number(dm[3]);
    if (year < 100) year += 2000;
    const month = Number(dm[2]);
    const day = Number(dm[1]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 100000) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateFR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

async function extractEmitidoEm(file: File): Promise<Date | null> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const labelRe = /emitido|emiss[aã]o|data\s+(de\s+)?emiss[aã]o|pendentes\s+em/i;
  const debugRows: unknown[][] = [];

  const dateFromCell = (cell: unknown): Date | null => {
    if (cell instanceof Date && !isNaN(cell.getTime())) return cell;
    if (typeof cell === 'number') return excelSerialToDate(cell);
    if (typeof cell === 'string') return parseAnyDate(cell);
    return null;
  };

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    for (let r = 0; r < Math.min(rows.length, 50); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      debugRows.push(row);
      const hasLabel = row.some((c) => typeof c === 'string' && labelRe.test(c));
      if (!hasLabel) continue;
      for (const cell of row) {
        const d = dateFromCell(cell);
        if (d) return d;
      }
    }
  }

  console.warn('[extractEmitidoEm] aucun champ emitido/emissão détecté. Premières lignes scannées:', debugRows.slice(0, 15));
  return null;
}

export default function Historique() {
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [imports, setImports] = useState<Import[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { canWrite } = useAuth();

  useEffect(() => {
    Promise.all([
      supabase.from('rapports_quotidiens').select('*').order('date_rapport', { ascending: false }),
      supabase.from('imports').select('*').order('date_import', { ascending: false }),
    ]).then(([rRes, iRes]) => {
      setRapports((rRes.data || []) as unknown as Rapport[]);
      setImports((iRes.data || []) as unknown as Import[]);
      setLoading(false);
    });
  }, []);

  const chartData = [...rapports].reverse().map(r => ({
    date: r.date_rapport,
    creances: Number(r.total_creances) || 0,
    retard: Number(r.total_en_retard) || 0,
  }));

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const allowedExts = ['.xls', '.xlsx'];
    const maxBytes = 20 * 1024 * 1024;
    const currentMonth = new Date().toISOString().slice(0, 7);
    let okCount = 0;
    const newImports: Import[] = [];
    for (const file of Array.from(fileList)) {
      const dot = file.name.lastIndexOf('.');
      const ext = dot > 0 ? file.name.slice(dot).toLowerCase() : '';
      if (!allowedExts.includes(ext)) {
        toast.error(`${file.name} : format non supporté (.xls / .xlsx uniquement)`);
        continue;
      }
      if (file.size > maxBytes) {
        toast.error(`${file.name} : trop volumineux (max 20 MB)`);
        continue;
      }
      let emitidoEm: Date | null = null;
      try {
        emitidoEm = await extractEmitidoEm(file);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'erreur inconnue';
        toast.error(`${file.name} : lecture du fichier impossible (${msg})`);
        continue;
      }
      if (!emitidoEm) {
        toast.error(`${file.name} : champ "Emitido em" introuvable dans le fichier`);
        continue;
      }
      const emitidoIso = toIsoDate(emitidoEm);

      const detectedSource = detectSource(file.name);
      // On ne vérifie l'antériorité que si on connaît la source — comparer entre sources
      // différentes (FR vs PT) n'a pas de sens (deux flux indépendants). Si la détection
      // automatique échoue, on laisse uploader et on demande à l'utilisateur de fixer la
      // source manuellement via le menu de la ligne d'import.
      if (detectedSource) {
        const { data: latestRows } = await supabase
          .from('imports')
          .select('emitido_em, source, nom_fichier')
          .eq('source', detectedSource)
          .not('emitido_em', 'is', null)
          .order('emitido_em', { ascending: false })
          .limit(1);
        const latest = latestRows?.[0];
        if (latest?.emitido_em && emitidoIso < latest.emitido_em) {
          toast.error(
            `${file.name} : "Emitido em" ${formatDateFR(emitidoIso)} antérieur au dernier import ${detectedSource} (${formatDateFR(latest.emitido_em)})`
          );
          continue;
        }
      } else {
        toast.warning(
          `${file.name} : source FR/PT non détectée dans le nom du fichier. Pense à la sélectionner après l'upload.`
        );
      }

      const uploadKey = `${Date.now()}-${slugifyFilename(file.name)}`;
      const { data: uploaded, error: upErr } = await supabase.storage
        .from('pendentes_imports')
        .upload(uploadKey, file);
      if (upErr || !uploaded) {
        toast.error(`${file.name} : ${upErr?.message ?? 'upload échoué'}`);
        continue;
      }
      const { data: row, error: dbErr } = await supabase
        .from('imports')
        .insert({
          nom_fichier: file.name,
          source: detectedSource,
          mois: currentMonth,
          statut: 'a_traiter',
          emitido_em: emitidoIso,
          storage_path: uploaded.path,
        })
        .select()
        .single();
      if (dbErr || !row) {
        await supabase.storage.from('pendentes_imports').remove([uploaded.path]);
        toast.error(`${file.name} : ${dbErr?.message ?? 'enregistrement échoué'}`);
        continue;
      }
      okCount++;
      newImports.push(row as unknown as Import);
    }
    if (okCount > 0) {
      toast.success(`${okCount} fichier${okCount > 1 ? 's uploadés' : ' uploadé'} — à traiter`);
      setImports((prev) => [...newImports, ...prev]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSourceChange = async (imp: Import, newSource: 'FR' | 'PT') => {
    if (imp.source === newSource) return;
    // Vérifier l'antériorité contre la nouvelle source choisie.
    if (imp.emitido_em) {
      const { data: latestRows } = await supabase
        .from('imports')
        .select('emitido_em, nom_fichier')
        .eq('source', newSource)
        .neq('id', imp.id)
        .not('emitido_em', 'is', null)
        .order('emitido_em', { ascending: false })
        .limit(1);
      const latest = latestRows?.[0];
      if (latest?.emitido_em && imp.emitido_em < latest.emitido_em) {
        const ok = confirm(
          `Cet import est daté du ${formatDateFR(imp.emitido_em)}, antérieur au dernier import ${newSource} (${formatDateFR(latest.emitido_em)}). Continuer ?`
        );
        if (!ok) return;
      }
    }
    const { error } = await supabase
      .from('imports')
      .update({ source: newSource })
      .eq('id', imp.id);
    if (error) {
      toast.error(`Source non mise à jour : ${error.message}`);
      return;
    }
    setImports((prev) => prev.map((i) => (i.id === imp.id ? { ...i, source: newSource } : i)));
    toast.success(`Source ${newSource} appliquée`);
  };

  const handleDelete = async (imp: Import) => {
    if (imp.statut !== 'a_traiter') return;
    if (!confirm(`Supprimer ${imp.nom_fichier} ?`)) return;
    if (imp.storage_path) {
      const { error: rmErr } = await supabase.storage
        .from('pendentes_imports')
        .remove([imp.storage_path]);
      if (rmErr) {
        toast.error(`Suppression fichier : ${rmErr.message}`);
        return;
      }
    }
    const { error } = await supabase.from('imports').delete().eq('id', imp.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setImports((prev) => prev.filter((i) => i.id !== imp.id));
    toast.success('Import supprimé');
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-8 max-w-6xl">
      <h1 className="text-2xl font-bold">Historique</h1>

      {chartData.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Évolution des créances</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Line type="monotone" dataKey="creances" name="Total créances" stroke="hsl(220, 55%, 22%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="retard" name="En retard" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Rapports quotidiens</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rapports.length === 0 && <p className="text-sm text-muted-foreground">Aucun rapport.</p>}
          {rapports.map(r => (
            <Collapsible key={r.id} open={openId === r.id} onOpenChange={(o) => setOpenId(o ? r.id : null)}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 border rounded-md hover:bg-muted/30 text-sm">
                <div className="flex items-center gap-3">
                  {openId === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-medium">{r.date_rapport}</span>
                </div>
                <div className="flex items-center gap-4 text-muted-foreground">
                  <span>{formatCurrency(r.total_creances || 0)}</span>
                  <span>{r.nb_actions_jour || 0} actions</span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3">
                <div className="mt-3 space-y-3 border-l-2 border-primary/20 pl-4">
                  {r.resume_ia && <p className="text-sm bg-ia-bg rounded-md p-3 text-ia-foreground">{r.resume_ia}</p>}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Créances:</span> {formatCurrency(r.total_creances || 0)}</div>
                    <div><span className="text-muted-foreground">En retard:</span> {formatCurrency(r.total_en_retard || 0)}</div>
                    <div><span className="text-muted-foreground">Factures:</span> {r.nb_factures_en_cours || 0}</div>
                    <div><span className="text-muted-foreground">Actions:</span> {r.nb_actions_jour || 0}</div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Imports</CardTitle>
          {canWrite && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? 'Upload…' : 'Uploader pendentes (Excel)'}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3">Fichier</th><th className="text-left p-3">Source</th>
              <th className="text-left p-3">Mois</th>
              <th className="text-right p-3">Lignes</th>
              <th className="text-center p-3">Statut</th><th className="text-left p-3">Date</th>
              <th className="p-3 w-10"></th>
            </tr></thead>
            <tbody>
              {imports.map(i => (
                <tr key={i.id} className="border-b">
                  <td className="p-3">{i.nom_fichier}</td>
                  <td className="p-3">
                    {i.statut === 'a_traiter' && canWrite ? (
                      <Select value={i.source ?? ''} onValueChange={(v) => handleSourceChange(i, v as 'FR' | 'PT')}>
                        <SelectTrigger className="h-7 w-[80px] text-xs">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FR">FR</SelectItem>
                          <SelectItem value="PT">PT</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : i.source ? (
                      <Badge variant="secondary">{i.source}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">{i.mois}</td>
                  <td className="p-3 text-right">{i.nb_lignes_parsees ?? '—'}/{i.nb_lignes_brutes ?? '—'}</td>
                  <td className="p-3 text-center">
                    <Badge className={
                      i.statut === 'ok' ? 'bg-badge-success text-badge-success-foreground' :
                      i.statut === 'erreur' ? 'bg-badge-danger text-badge-danger-foreground' :
                      i.statut === 'a_traiter' ? 'bg-badge-info text-badge-info-foreground' :
                      'bg-badge-warning text-badge-warning-foreground'
                    }>
                      {i.statut === 'a_traiter' ? 'à traiter' : i.statut}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(i.date_import).toLocaleDateString('fr-FR')}</td>
                  <td className="p-3 text-right">
                    {i.statut === 'a_traiter' && canWrite && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(i)}
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {imports.length === 0 && <p className="text-center text-muted-foreground py-4">Aucun import.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
