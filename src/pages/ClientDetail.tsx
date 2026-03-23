import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getMaxMoisExtraction } from '@/lib/supabaseHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save, Archive, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Client {
  id: string; code_client: string; nom: string; email: string | null;
  telephone: string | null; pays: string | null; conditions_paiement: string | null;
  exclusion_relance: boolean; archive: boolean;
}
interface Facture {
  id: string; numero_facture: string; montant: number; solde_restant: number | null;
  date_echeance: string; date_emission: string; statut: string; type_document: string;
}
interface Action {
  id: string; type_action: string; date_prevue: string; date_executee: string | null;
  statut: string; notes: string | null;
  factures: { numero_facture: string } | null;
}

const TYPE_ACTION_LABELS: Record<string, string> = {
  email_j7: 'Email J+7', appel_j15: 'Appel J+15', mise_en_demeure_j30: 'Mise en demeure',
};
const STATUT_LABELS: Record<string, string> = {
  a_faire: 'À faire', fait: 'Fait', ignore: 'Ignoré', reporte: 'Reporté',
};

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [invoices, setInvoices] = useState<Facture[]>([]);
  const [movements, setMovements] = useState<Facture[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [conditions, setConditions] = useState('');
  const [exclusion, setExclusion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const maxMois = await getMaxMoisExtraction();
      let facturesQuery = supabase.from('factures').select('*').eq('client_id', id).eq('statut', 'en_cours');
      if (maxMois) facturesQuery = facturesQuery.eq('mois_extraction', maxMois);

      const [cRes, fRes, aRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', id).single(),
        facturesQuery,
        supabase.from('actions_relance').select('*, factures(numero_facture)').eq('client_id', id).order('date_prevue', { ascending: false }),
      ]);

      const c = cRes.data as unknown as Client;
      if (c) {
        setClient({ ...c, archive: c.archive ?? false });
        setEmail(c.email || '');
        setTelephone(c.telephone || '');
        setConditions(c.conditions_paiement || '');
        setExclusion(c.exclusion_relance);
      }

      const allFactures = (fRes.data || []) as unknown as Facture[];
      setInvoices(allFactures.filter(f => f.type_document === 'FACT' && (f.solde_restant ?? f.montant) > 0));
      setMovements(allFactures.filter(f => f.type_document !== 'FACT'));
      setActions((aRes.data || []) as unknown as Action[]);
    };
    load();
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    await supabase.from('clients').update({
      email: email || null, telephone: telephone || null,
      conditions_paiement: conditions || 'comptant', exclusion_relance: exclusion,
    }).eq('id', id);
    toast.success('Client mis à jour');
    setSaving(false);
  };

  const handleArchiveToggle = async () => {
    if (!id || !client) return;
    const newVal = !client.archive;
    await supabase.from('clients').update({ archive: newVal }).eq('id', id);
    setClient({ ...client, archive: newVal });
    toast.success(newVal ? 'Client archivé' : 'Client restauré');
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n);

  if (!client) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" onClick={() => navigate('/clients')} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Retour
      </Button>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{client.nom}</h1>
        {client.archive && <Badge variant="outline" className="text-xs">Archivé</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{client.code_client} • {client.pays}</p>

      <Card>
        <CardHeader><CardTitle className="text-base">Informations</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Conditions paiement</Label>
              <Input value={conditions} onChange={(e) => setConditions(e.target.value)} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={exclusion} onCheckedChange={setExclusion} />
              <Label>Exclure des relances</Label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-1" /> Enregistrer</Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant={client.archive ? 'outline' : 'destructive'} size="sm">
                  {client.archive ? <><RotateCcw className="h-4 w-4 mr-1" /> Restaurer</> : <><Archive className="h-4 w-4 mr-1" /> Archiver</>}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{client.archive ? 'Restaurer ce client ?' : 'Archiver ce client ?'}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {client.archive
                      ? 'Le client réapparaîtra dans les listes principales.'
                      : "Il n'apparaîtra plus dans les listes principales mais restera accessible dans la section Archives."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={handleArchiveToggle}>Confirmer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Factures en cours ({invoices.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3">N°</th>
              <th className="text-right p-3">Montant</th>
              <th className="text-right p-3">Reste dû</th>
              <th className="text-left p-3">Échéance</th>
            </tr></thead>
            <tbody>
              {invoices.map(f => (
                <tr key={f.id} className="border-b">
                  <td className="p-3">{f.numero_facture}</td>
                  <td className="p-3 text-right text-muted-foreground">{formatCurrency(f.montant)}</td>
                  <td className="p-3 text-right font-medium">{formatCurrency(f.solde_restant ?? f.montant)}</td>
                  <td className="p-3">{f.date_echeance}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && <p className="text-center text-muted-foreground py-4">Aucune facture en cours.</p>}
        </CardContent>
      </Card>

      {movements.length > 0 && (
        <Collapsible open={movementsOpen} onOpenChange={setMovementsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30">
                <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                  {movementsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Mouvements financiers ({movements.length})
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm text-muted-foreground">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="text-left p-3">N°</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-right p-3">Montant</th>
                    <th className="text-left p-3">Date</th>
                  </tr></thead>
                  <tbody>
                    {movements.map(f => (
                      <tr key={f.id} className="border-b">
                        <td className="p-3">{f.numero_facture}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{f.type_document}</Badge></td>
                        <td className="p-3 text-right">{formatCurrency(f.solde_restant ?? f.montant)}</td>
                        <td className="p-3">{f.date_emission}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Historique des relances</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {actions.length === 0 && <p className="text-sm text-muted-foreground">Aucune relance.</p>}
          {actions.map(a => (
            <div key={a.id} className="border rounded-md p-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{TYPE_ACTION_LABELS[a.type_action] || a.type_action} — {a.factures?.numero_facture}</span>
                <Badge variant={a.statut === 'fait' ? 'default' : 'secondary'}>{STATUT_LABELS[a.statut] || a.statut}</Badge>
              </div>
              <p className="text-muted-foreground">Prévue: {a.date_prevue} {a.date_executee && `| Exécutée: ${a.date_executee}`}</p>
              {a.notes && <p className="text-xs whitespace-pre-line">{a.notes}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
