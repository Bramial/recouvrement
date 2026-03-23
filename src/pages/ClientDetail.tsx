import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  id: string; code_client: string; nom: string; email: string | null;
  telephone: string | null; pays: string | null; conditions_paiement: string | null;
  exclusion_relance: boolean;
}
interface Facture {
  id: string; numero_facture: string; montant: number; solde_restant: number | null;
  date_echeance: string; statut: string; type_document: string;
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
  const [factures, setFactures] = useState<Facture[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [conditions, setConditions] = useState('');
  const [exclusion, setExclusion] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('factures').select('*').eq('client_id', id).eq('statut', 'en_cours'),
      supabase.from('actions_relance').select('*, factures(numero_facture)').eq('client_id', id).order('date_prevue', { ascending: false }),
    ]).then(([cRes, fRes, aRes]) => {
      const c = cRes.data as unknown as Client;
      if (c) {
        setClient(c);
        setEmail(c.email || '');
        setTelephone(c.telephone || '');
        setConditions(c.conditions_paiement || '');
        setExclusion(c.exclusion_relance);
      }
      setFactures((fRes.data || []) as unknown as Facture[]);
      setActions((aRes.data || []) as unknown as Action[]);
    });
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

  const formatCurrency = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n);

  if (!client) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" onClick={() => navigate('/clients')} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Retour
      </Button>
      <h1 className="text-2xl font-bold">{client.nom}</h1>
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
          <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-1" /> Enregistrer</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Factures en cours ({factures.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3">N°</th><th className="text-left p-3">Type</th>
              <th className="text-right p-3">Montant</th><th className="text-left p-3">Échéance</th>
            </tr></thead>
            <tbody>
              {factures.map(f => (
                <tr key={f.id} className="border-b">
                  <td className="p-3">{f.numero_facture}</td><td className="p-3">{f.type_document}</td>
                  <td className="p-3 text-right font-medium">{formatCurrency(f.solde_restant ?? f.montant)}</td>
                  <td className="p-3">{f.date_echeance}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {factures.length === 0 && <p className="text-center text-muted-foreground py-4">Aucune facture en cours.</p>}
        </CardContent>
      </Card>

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
