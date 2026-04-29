import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getMaxMoisExtraction } from '@/lib/supabaseHelpers';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, ArrowUp, ArrowDown, CheckSquare, XSquare, ShieldOff } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useCountryFilter } from '@/hooks/useCountryFilter';
import { CountryFilter } from '@/components/CountryFilter';

interface Client {
  id: string;
  code_client: string;
  nom: string;
  pays: string | null;
  email: string | null;
  telephone: string | null;
  conditions_paiement: string | null;
  exclusion_relance: boolean;
  client_interne: boolean;
  facture_count?: number;
  total_du?: number;
  total_original?: number;
  retard_max?: number;
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'total_du' | 'retard_max' | 'total_original'>('total_du');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExcludedOnly, setShowExcludedOnly] = useState(false);
  const [showSoldes, setShowSoldes] = useState(false);
  const navigate = useNavigate();
  const { country } = useCountryFilter();

  const fetchClients = async () => {
    const maxMois = await getMaxMoisExtraction();
    let clientsQuery = supabase.from('clients').select('*');
    if (country !== 'all') clientsQuery = clientsQuery.ilike('code_client', `${country}_%`);
    const { data: clientsData } = await clientsQuery;
    // Tous types confondus en statut='en_cours' — NCRE/REC négatifs réduisent le reste dû
    let facturesQuery = supabase.from('factures').select('client_id, solde_restant, montant, type_document, date_echeance')
      .eq('statut', 'en_cours');
    if (maxMois) facturesQuery = facturesQuery.eq('mois_extraction', maxMois);
    const { data: facturesData } = await facturesQuery;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const facStats: Record<string, { count: number; total: number; totalOriginal: number; retardMax: number }> = {};
    (facturesData || []).forEach((f: any) => {
      if (!facStats[f.client_id]) facStats[f.client_id] = { count: 0, total: 0, totalOriginal: 0, retardMax: 0 };
      facStats[f.client_id].count++;
      facStats[f.client_id].total += Number(f.solde_restant ?? f.montant ?? 0);
      facStats[f.client_id].totalOriginal += Number(f.montant ?? 0);
      if (f.type_document === 'FACT' && f.date_echeance) {
        const ech = new Date(f.date_echeance); ech.setHours(0, 0, 0, 0);
        const jours = Math.floor((today.getTime() - ech.getTime()) / (1000 * 60 * 60 * 24));
        if (jours > facStats[f.client_id].retardMax) facStats[f.client_id].retardMax = jours;
      }
    });

    const enriched = (clientsData || []).map((c: any) => ({
      ...c,
      facture_count: facStats[c.id]?.count || 0,
      total_du: facStats[c.id]?.total || 0,
      total_original: facStats[c.id]?.totalOriginal || 0,
      retard_max: facStats[c.id]?.retardMax || 0,
    })) as Client[];

    setClients(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, [country]);

  const toggleExclusion = async (client: Client) => {
    await supabase.from('clients').update({ exclusion_relance: !client.exclusion_relance }).eq('id', client.id);
    toast.success(client.exclusion_relance ? 'Relances réactivées' : 'Client exclu des relances');
    fetchClients();
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const sorted = [...clients].sort((a, b) => {
    const va = sortField === 'total_du' ? (a.total_du || 0) : sortField === 'total_original' ? (a.total_original || 0) : (a.retard_max || 0);
    const vb = sortField === 'total_du' ? (b.total_du || 0) : sortField === 'total_original' ? (b.total_original || 0) : (b.retard_max || 0);
    return sortAsc ? va - vb : vb - va;
  });

  const filtered = sorted.filter(c => {
    if (!showSoldes && (c.total_du || 0) === 0) return false;
    if (showExcludedOnly && !c.exclusion_relance) return false;
    if (search && !c.nom.toLowerCase().includes(search.toLowerCase()) && !c.code_client.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const selectionTotal = useMemo(
    () => filtered.filter(c => selectedIds.has(c.id)).reduce((s, c) => s + (c.total_du || 0), 0),
    [filtered, selectedIds]
  );

  const getCountryFlag = (codeClient: string) => codeClient.startsWith('FR_') ? '🇫🇷' : codeClient.startsWith('PT_') ? '🇵🇹' : '';

  const formatCurrency = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <CountryFilter />
      </div>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={showSoldes} onCheckedChange={setShowSoldes} id="filter-soldes" />
            <Label htmlFor="filter-soldes" className="text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
              Clients soldés
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={showExcludedOnly} onCheckedChange={setShowExcludedOnly} id="filter-excluded" />
            <Label htmlFor="filter-excluded" className="text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
              Exclus uniquement
            </Label>
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-lg border bg-background/95 backdrop-blur px-5 py-3 shadow-lg">
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedIds.size} client{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''} — Total créances : {formatCurrency(selectionTotal)}
          </span>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedIds(new Set())}>
            <XSquare className="h-3.5 w-3.5 mr-1" /> Désélectionner
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 w-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
                </th>
                <th className="text-left p-3">Code</th>
                <th className="text-left p-3">Nom</th>
                <th className="text-left p-3">Pays</th>
                <th className="text-right p-3">Documents</th>
                <th className="text-right p-3 cursor-pointer select-none hover:bg-muted" onClick={() => toggleSort('total_original')}>
                  <span className="inline-flex items-center gap-1 justify-end">
                    Montant total
                    {sortField === 'total_original' ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowDown className="h-3 w-3 text-muted-foreground/40" />}
                  </span>
                </th>
                <th className="text-right p-3 cursor-pointer select-none hover:bg-muted" onClick={() => toggleSort('total_du')}>
                  <span className="inline-flex items-center gap-1 justify-end">
                    Reste dû
                    {sortField === 'total_du' ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowDown className="h-3 w-3 text-muted-foreground/40" />}
                  </span>
                </th>
                <th className="text-center p-3 cursor-pointer select-none hover:bg-muted" onClick={() => toggleSort('retard_max')}>
                  <span className="inline-flex items-center gap-1 justify-center">
                    Retard max
                    {sortField === 'retard_max' ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowDown className="h-3 w-3 text-muted-foreground/40" />}
                  </span>
                </th>
                <th className="text-left p-3">Conditions</th>
                <th className="text-center p-3">Exclu relance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className={`border-b hover:bg-muted/30 cursor-pointer ${selectedIds.has(c.id) ? 'bg-primary/5' : ''}`} onClick={() => navigate(`/clients/${c.id}`)}>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                  </td>
                  <td className="p-3 text-muted-foreground">{c.code_client}</td>
                  <td className="p-3 font-medium">
                    {c.nom}
                    {c.client_interne && <Badge variant="outline" className="ml-2 text-xs text-blue-500 border-blue-200">Interne</Badge>}
                    {c.exclusion_relance && <Badge variant="outline" className="ml-2 text-xs text-muted-foreground">Exclu</Badge>}
                  </td>
                  <td className="p-3"><Badge variant="secondary">{getCountryFlag(c.code_client)} {c.code_client.startsWith('FR_') ? 'FR' : c.code_client.startsWith('PT_') ? 'PT' : '—'}</Badge></td>
                  <td className="p-3 text-right">{c.facture_count}</td>
                  <td className="p-3 text-right text-muted-foreground">{formatCurrency(c.total_original || 0)}</td>
                  <td className="p-3 text-right font-medium">{formatCurrency(c.total_du || 0)}</td>
                  <td className="p-3 text-center">
                    {(c.retard_max || 0) > 0 ? (
                      <Badge className={
                        (c.retard_max || 0) > 30 ? 'bg-badge-danger text-badge-danger-foreground' :
                        (c.retard_max || 0) > 15 ? 'bg-badge-warning text-badge-warning-foreground' :
                        'bg-badge-success text-badge-success-foreground'
                      }>{c.retard_max}j</Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3 text-muted-foreground">{c.conditions_paiement}</td>
                  <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Switch checked={c.exclusion_relance} onCheckedChange={() => toggleExclusion(c)} />
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-muted/30 font-semibold">
                  <td className="p-3" colSpan={4}></td>
                  <td className="p-3 text-right">{filtered.reduce((s, c) => s + (c.facture_count || 0), 0)}</td>
                  <td className="p-3 text-right">{formatCurrency(filtered.reduce((s, c) => s + (c.total_original || 0), 0))}</td>
                  <td className="p-3 text-right">{formatCurrency(filtered.reduce((s, c) => s + (c.total_du || 0), 0))}</td>
                  <td className="p-3" colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Aucun client trouvé.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
