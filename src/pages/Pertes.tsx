import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useCountryFilter } from '@/hooks/useCountryFilter';
import { CountryFilter } from '@/components/CountryFilter';

interface FacturePerte {
  id: string;
  client_id: string;
  numero_facture: string;
  type_document: string;
  montant: number;
  date_emission: string;
  date_echeance: string;
  solde_restant: number | null;
  mois_extraction: string | null;
  clients: { nom: string; code_client: string } | null;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n);
}

export default function Pertes() {
  const [factures, setFactures] = useState<FacturePerte[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { country } = useCountryFilter();
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const joinType = country !== 'all' ? 'clients!inner' : 'clients';
      let query = supabase
        .from('factures')
        .select(`id, client_id, numero_facture, type_document, montant, date_emission, date_echeance, solde_restant, mois_extraction, ${joinType}(nom, code_client)`)
        .eq('statut', 'perte')
        .order('date_echeance', { ascending: false });
      if (country !== 'all') query = query.ilike('clients.code_client', `${country}_%`);
      const { data } = await query;
      setFactures((data || []) as unknown as FacturePerte[]);
      setLoading(false);
    };
    load();
  }, [country]);

  const filtered = useMemo(() => {
    if (!search) return factures;
    const s = search.toLowerCase();
    return factures.filter(f => f.clients?.nom.toLowerCase().includes(s) || f.numero_facture.toLowerCase().includes(s));
  }, [factures, search]);

  const restaurer = async (f: FacturePerte) => {
    await supabase.from('factures').update({ statut: 'en_cours' }).eq('id', f.id);
    setFactures(prev => prev.filter(fac => fac.id !== f.id));
    toast.success(`Facture ${f.numero_facture} restaurée`);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pertes</h1>
        <CountryFilter />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher client ou facture..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3">Client</th>
                <th className="text-left p-3">N° Facture</th>
                <th className="text-right p-3">Montant dû</th>
                <th className="text-left p-3">Échéance</th>
                <th className="text-left p-3">Pays</th>
                <th className="text-center p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">
                    <button
                      className="text-left text-primary hover:underline"
                      onClick={() => navigate(`/clients/${f.client_id}`)}
                    >
                      {f.clients?.nom}
                    </button>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {f.numero_facture}
                    {f.type_document !== 'FACT' && <Badge variant="outline" className="ml-2 text-xs">{f.type_document}</Badge>}
                  </td>
                  <td className="p-3 text-right font-medium">{formatCurrency(f.solde_restant ?? f.montant)}</td>
                  <td className="p-3 text-muted-foreground">{f.date_echeance}</td>
                  <td className="p-3">
                    <Badge variant="secondary">
                      {f.clients?.code_client.startsWith('FR_') ? '🇫🇷 FR' : f.clients?.code_client.startsWith('PT_') ? '🇵🇹 PT' : '—'}
                    </Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => restaurer(f)} title="Restaurer">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-muted/30 font-semibold">
                  <td className="p-3">{filtered.length} factures</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-right">{formatCurrency(filtered.reduce((s, f) => s + (f.solde_restant ?? f.montant), 0))}</td>
                  <td className="p-3" colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Aucune facture en perte.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
