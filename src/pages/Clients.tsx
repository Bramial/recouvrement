import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getMaxMoisExtraction } from '@/lib/supabaseHelpers';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Archive, RotateCcw } from 'lucide-react';
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
  archive: boolean;
  facture_count?: number;
  total_du?: number;
  total_original?: number;
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();

  const fetchClients = async () => {
    const maxMois = await getMaxMoisExtraction();
    const { data: clientsData } = await supabase.from('clients').select('*');
    let facturesQuery = supabase.from('factures').select('client_id, solde_restant, montant, type_document').eq('statut', 'en_cours');
    if (maxMois) facturesQuery = facturesQuery.eq('mois_extraction', maxMois);
    const { data: facturesData } = await facturesQuery;

    const facStats: Record<string, { count: number; total: number }> = {};
    (facturesData || []).forEach((f: any) => {
      // Only count FACT with positive solde_restant
      if (f.type_document !== 'FACT' || (f.solde_restant ?? f.montant) <= 0) return;
      if (!facStats[f.client_id]) facStats[f.client_id] = { count: 0, total: 0, totalOriginal: 0 };
      facStats[f.client_id].count++;
      facStats[f.client_id].total += Number(f.solde_restant ?? f.montant ?? 0);
      facStats[f.client_id].totalOriginal += Number(f.montant ?? 0);
    });

    const enriched = (clientsData || []).map((c: any) => ({
      ...c,
      archive: c.archive ?? false,
      facture_count: facStats[c.id]?.count || 0,
      total_du: facStats[c.id]?.total || 0,
      total_original: facStats[c.id]?.totalOriginal || 0,
    })) as Client[];

    // Sort by total_du descending
    enriched.sort((a, b) => (b.total_du || 0) - (a.total_du || 0));

    setClients(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, []);

  const toggleExclusion = async (client: Client) => {
    await supabase.from('clients').update({ exclusion_relance: !client.exclusion_relance }).eq('id', client.id);
    toast.success(client.exclusion_relance ? 'Relances réactivées' : 'Client exclu des relances');
    fetchClients();
  };

  const toggleArchive = async (client: Client, archive: boolean) => {
    await supabase.from('clients').update({ archive }).eq('id', client.id);
    toast.success(archive ? 'Client archivé' : 'Client restauré');
    fetchClients();
  };

  const displayedClients = clients.filter(c => c.archive === showArchived);
  const filtered = search
    ? displayedClients.filter(c => c.nom.toLowerCase().includes(search.toLowerCase()) || c.code_client.toLowerCase().includes(search.toLowerCase()))
    : displayedClients;

  const formatCurrency = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold">Clients</h1>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button
          variant={showArchived ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowArchived(!showArchived)}
        >
          <Archive className="h-4 w-4 mr-1" />
          {showArchived ? 'Voir actifs' : 'Archives'}
          {clients.filter(c => c.archive).length > 0 && !showArchived && (
            <Badge variant="secondary" className="ml-2">{clients.filter(c => c.archive).length}</Badge>
          )}
        </Button>
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
                <th className="text-right p-3">Montant total</th>
                <th className="text-right p-3">Reste dû</th>
                <th className="text-left p-3">Conditions</th>
                {!showArchived && <th className="text-center p-3">Exclu relance</th>}
                <th className="text-center p-3">{showArchived ? 'Restaurer' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/clients/${c.id}`)}>
                  <td className="p-3 text-muted-foreground">{c.code_client}</td>
                  <td className="p-3 font-medium">
                    {c.nom}
                    {showArchived && <Badge variant="outline" className="ml-2 text-xs">Archivé</Badge>}
                  </td>
                  <td className="p-3"><Badge variant="secondary">{c.pays || '—'}</Badge></td>
                  <td className="p-3 text-right">{c.facture_count}</td>
                  <td className="p-3 text-right font-medium">{formatCurrency(c.total_du || 0)}</td>
                  <td className="p-3 text-muted-foreground">{c.conditions_paiement}</td>
                  {!showArchived && (
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Switch checked={c.exclusion_relance} onCheckedChange={() => toggleExclusion(c)} />
                    </td>
                  )}
                  <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                    {showArchived ? (
                      <Button size="sm" variant="outline" onClick={() => toggleArchive(c, false)}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurer
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">{showArchived ? 'Aucun client archivé.' : 'Aucun client trouvé.'}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
