import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n);
}

export default function Historique() {
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [imports, setImports] = useState<Import[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

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
        <CardHeader><CardTitle className="text-base">Imports</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3">Fichier</th><th className="text-left p-3">Source</th>
              <th className="text-left p-3">Mois</th><th className="text-right p-3">Lignes</th>
              <th className="text-center p-3">Statut</th><th className="text-left p-3">Date</th>
            </tr></thead>
            <tbody>
              {imports.map(i => (
                <tr key={i.id} className="border-b">
                  <td className="p-3">{i.nom_fichier}</td>
                  <td className="p-3"><Badge variant="secondary">{i.source}</Badge></td>
                  <td className="p-3">{i.mois}</td>
                  <td className="p-3 text-right">{i.nb_lignes_parsees}/{i.nb_lignes_brutes}</td>
                  <td className="p-3 text-center">
                    <Badge className={i.statut === 'ok' ? 'bg-badge-success text-badge-success-foreground' : i.statut === 'erreur' ? 'bg-badge-danger text-badge-danger-foreground' : 'bg-badge-warning text-badge-warning-foreground'}>
                      {i.statut}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(i.date_import).toLocaleDateString('fr-FR')}</td>
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
