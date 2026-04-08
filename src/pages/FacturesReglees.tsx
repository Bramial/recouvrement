import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { useCountryFilter } from '@/hooks/useCountryFilter';
import { CountryFilter } from '@/components/CountryFilter';

interface FacturePayee {
  id: string;
  client_id: string;
  numero_facture: string;
  montant: number;
  date_emission: string;
  mois_extraction: string | null;
  clients: { nom: string; code_client: string } | null;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n);
}

export default function FacturesReglees() {
  const [factures, setFactures] = useState<FacturePayee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moisFilter, setMoisFilter] = useState('all');
  const { country } = useCountryFilter();

  useEffect(() => {
    const load = async () => {
      const joinType = country !== 'all' ? 'clients!inner' : 'clients';
      let query = supabase
        .from('factures')
        .select(`id, client_id, numero_facture, montant, date_emission, mois_extraction, ${joinType}(nom, code_client)`)
        .eq('statut', 'payee')
        .order('mois_extraction', { ascending: false });
      if (country !== 'all') query = query.ilike('clients.code_client', `${country}_%`);
      const { data } = await query;
      setFactures((data || []) as unknown as FacturePayee[]);
      setLoading(false);
    };
    load();
  }, [country]);

  const moisOptions = useMemo(() => {
    const set = new Set<string>();
    factures.forEach(f => { if (f.mois_extraction) set.add(f.mois_extraction); });
    return Array.from(set).sort().reverse();
  }, [factures]);

  const filtered = useMemo(() => {
    let res = factures;
    if (moisFilter !== 'all') {
      res = res.filter(f => f.mois_extraction === moisFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      res = res.filter(f => f.clients?.nom.toLowerCase().includes(s) || f.numero_facture.toLowerCase().includes(s));
    }
    return res;
  }, [factures, search, moisFilter]);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Factures réglées</h1>
        <CountryFilter />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher client ou facture..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={moisFilter} onValueChange={setMoisFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les périodes</SelectItem>
            {moisOptions.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              {filtered.map(f => (
                <tr key={f.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{f.clients?.nom}</td>
                  <td className="p-3 text-muted-foreground">{f.numero_facture}</td>
                  <td className="p-3 text-right">{formatCurrency(f.montant)}</td>
                  <td className="p-3 text-muted-foreground">{f.date_emission}</td>
                  <td className="p-3">{f.mois_extraction || '—'}</td>
                  <td className="p-3">
                    <Badge variant="secondary">
                      {f.clients?.code_client.startsWith('FR_') ? '🇫🇷 FR' : f.clients?.code_client.startsWith('PT_') ? '🇵🇹 PT' : '—'}
                    </Badge>
                  </td>
                </tr>
              ))}
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
