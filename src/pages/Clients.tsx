import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Client {
  id: string;
  code_client: string;
  nom: string;
  pays: string | null;
  email: string | null;
  telephone: string | null;
  conditions_paiement: string | null;
  exclusion_relance: boolean;
  facture_count?: number;
  total_du?: number;
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchClients = async () => {
    const { data: clientsData } = await supabase.from('clients').select('*');
    const { data: facturesData } = await supabase.from('factures').select('client_id, solde_restant, montant').eq('statut', 'en_cours');

    const facStats: Record<string, { count: number; total: number }> = {};
    (facturesData || []).forEach((f: any) => {
      if (!facStats[f.client_id]) facStats[f.client_id] = { count: 0, total: 0 };
      facStats[f.client_id].count++;
      facStats[f.client_id].total += Number(f.solde_restant ?? f.montant ?? 0);
    });

    const enriched = (clientsData || []).map((c: any) => ({
      ...c,
      facture_count: facStats[c.id]?.count || 0,
      total_du: facStats[c.id]?.total || 0,
    })) as Client[];

    setClients(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, []);

  const toggleExclusion = async (client: Client) => {
    await supabase.from('clients').update({ exclusion_relance: !client.exclusion_relance }).eq('id', client.id);
    toast.success(client.exclusion_relance ? 'Relances réactivées' : 'Client exclu des relances');
    fetchClients();
  };

  const filtered = search
    ? clients.filter(c => c.nom.toLowerCase().includes(search.toLowerCase()) || c.code_client.toLowerCase().includes(search.toLowerCase()))
    : clients;

  const formatCurrency = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold">Clients</h1>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3">Code</th>
                <th className="text-left p-3">Nom</th>
                <th className="text-left p-3">Pays</th>
                <th className="text-right p-3">Factures</th>
                <th className="text-right p-3">Total dû</th>
                <th className="text-left p-3">Conditions</th>
                <th className="text-center p-3">Exclu relance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/clients/${c.id}`)}>
                  <td className="p-3 text-muted-foreground">{c.code_client}</td>
                  <td className="p-3 font-medium">{c.nom}</td>
                  <td className="p-3"><Badge variant="secondary">{c.pays || '—'}</Badge></td>
                  <td className="p-3 text-right">{c.facture_count}</td>
                  <td className="p-3 text-right font-medium">{formatCurrency(c.total_du || 0)}</td>
                  <td className="p-3 text-muted-foreground">{c.conditions_paiement}</td>
                  <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Switch checked={c.exclusion_relance} onCheckedChange={() => toggleExclusion(c)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
