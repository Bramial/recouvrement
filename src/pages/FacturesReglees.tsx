import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import { useCountryFilter } from '@/hooks/useCountryFilter';
import { CountryFilter } from '@/components/CountryFilter';

interface FacturePayee {
  id: string;
  client_id: string;
  numero_facture: string;
  montant: number;
  date_emission: string;
  derniere_apparition: string | null;
  updated_at: string | null;
  clients: { nom: string; code_client: string; client_interne: boolean } | null;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n);
}

function detectionDate(f: FacturePayee): string | null {
  return (f.updated_at ? f.updated_at.slice(0, 10) : null) || f.derniere_apparition;
}

export default function FacturesReglees() {
  const [factures, setFactures] = useState<FacturePayee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyDisparues, setOnlyDisparues] = useState(true);
  const [latestApparition, setLatestApparition] = useState<string | null>(null);
  const { country } = useCountryFilter();

  useEffect(() => {
    const load = async () => {
      const { data: latestRow } = await supabase
        .from('factures')
        .select('derniere_apparition')
        .not('derniere_apparition', 'is', null)
        .order('derniere_apparition', { ascending: false })
        .limit(1)
        .maybeSingle();
      const latest = (latestRow?.derniere_apparition as string | undefined) ?? null;
      setLatestApparition(latest);

      const joinType = country !== 'all' ? 'clients!inner' : 'clients';
      let query = supabase
        .from('factures')
        .select(`id, client_id, numero_facture, montant, date_emission, derniere_apparition, updated_at, ${joinType}(nom, code_client, client_interne)`)
        .eq('statut', 'payee')
        .in('type_document', ['FACT', 'NDEB'])
        .order('updated_at', { ascending: false });
      if (country !== 'all') query = query.ilike('clients.code_client', `${country}_%`);
      const { data } = await query;
      const rows = ((data || []) as unknown as FacturePayee[])
        .filter(f => !f.clients?.client_interne);
      setFactures(rows);
      setLoading(false);
    };
    load();
  }, [country]);

  const filtered = useMemo(() => {
    let res = factures;
    if (onlyDisparues && latestApparition) {
      res = res.filter(f => f.derniere_apparition && f.derniere_apparition < latestApparition);
    }
    if (search) {
      const s = search.toLowerCase();
      res = res.filter(f => f.clients?.nom.toLowerCase().includes(s) || f.numero_facture.toLowerCase().includes(s));
    }
    return res;
  }, [factures, search, onlyDisparues, latestApparition]);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Factures réglées</h1>
        <CountryFilter />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher client ou facture..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Switch id="only-disparues" checked={onlyDisparues} onCheckedChange={setOnlyDisparues} />
          <Label htmlFor="only-disparues" className="text-sm text-muted-foreground">Détectées au dernier import seulement</Label>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3">Client</th>
                <th className="text-left p-3">N° Facture</th>
                <th className="text-right p-3">Montant</th>
                <th className="text-left p-3">Date émission</th>
                <th className="text-left p-3">Paiement détecté</th>
                <th className="text-left p-3">Pays</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => {
                const detected = detectionDate(f);
                const tooltip = f.derniere_apparition ? `Dernière présence en pendentes : ${f.derniere_apparition}` : undefined;
                return (
                  <tr key={f.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{f.clients?.nom}</td>
                    <td className="p-3 text-muted-foreground">{f.numero_facture}</td>
                    <td className="p-3 text-right">{formatCurrency(f.montant)}</td>
                    <td className="p-3 text-muted-foreground">{f.date_emission}</td>
                    <td className="p-3 text-muted-foreground" title={tooltip}>{detected || '—'}</td>
                    <td className="p-3">
                      <Badge variant="secondary">
                        {f.clients?.code_client.startsWith('FR_') ? '🇫🇷 FR' : f.clients?.code_client.startsWith('PT_') ? '🇵🇹 PT' : '—'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-muted/30 font-semibold">
                  <td className="p-3">{filtered.length} factures</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-right">{formatCurrency(filtered.reduce((s, f) => s + f.montant, 0))}</td>
                  <td className="p-3" colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Aucune facture réglée trouvée.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
