import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from '@/components/KPICard';
import { EmailModal } from '@/components/EmailModal';
import { CallResultModal } from '@/components/CallResultModal';
import { ReportModal } from '@/components/ReportModal';
import { NoteModal } from '@/components/NoteModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Euro, AlertTriangle, ListChecks, CheckCircle, Mail, Phone, FileWarning, Calendar, X, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

interface Action {
  id: string;
  facture_id: string;
  client_id: string;
  type_action: string;
  date_prevue: string;
  statut: string;
  contenu_email: string | null;
  notes: string | null;
  factures: { numero_facture: string; montant: number; date_echeance: string; solde_restant: number | null } | null;
  clients: { nom: string; email: string | null; telephone: string | null; code_client: string } | null;
}

interface Rapport {
  total_creances: number | null;
  total_en_retard: number | null;
  nb_factures_en_cours: number | null;
  nb_actions_jour: number | null;
  resume_ia: string | null;
  factures_payees_depuis_dernier: string | null;
}

const TYPE_ACTION_ORDER: Record<string, number> = {
  mise_en_demeure_j30: 0,
  appel_j15: 1,
  email_j7: 2,
};

const TYPE_ACTION_LABELS: Record<string, { label: string; className: string }> = {
  mise_en_demeure_j30: { label: 'Mise en demeure', className: 'bg-badge-danger text-badge-danger-foreground' },
  appel_j15: { label: 'Appel J+15', className: 'bg-badge-warning text-badge-warning-foreground' },
  email_j7: { label: 'Email J+7', className: 'bg-badge-info text-badge-info-foreground' },
};

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '0 €';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function joursRetard(dateEcheance: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ech = new Date(dateEcheance);
  ech.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - ech.getTime()) / (1000 * 60 * 60 * 24));
}

export default function RapportDuJour() {
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);

  const [emailModal, setEmailModal] = useState<Action | null>(null);
  const [callModal, setCallModal] = useState<Action | null>(null);
  const [reportModal, setReportModal] = useState<Action | null>(null);
  const [noteModal, setNoteModal] = useState<Action | null>(null);
  const [ignoreModal, setIgnoreModal] = useState<Action | null>(null);
  const [ignoreNote, setIgnoreNote] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');

  const fetchData = async () => {
    setLoading(true);
    const [rapportRes, actionsRes] = await Promise.all([
      supabase.from('rapports_quotidiens').select('*').eq('date_rapport', today).maybeSingle(),
      supabase.from('actions_relance').select('*, factures(numero_facture, montant, date_echeance, solde_restant), clients(nom, email, telephone, code_client)').eq('statut', 'a_faire').lte('date_prevue', today),
    ]);
    setRapport(rapportRes.data as Rapport | null);
    const sorted = ((actionsRes.data || []) as unknown as Action[]).sort(
      (a, b) => (TYPE_ACTION_ORDER[a.type_action] ?? 9) - (TYPE_ACTION_ORDER[b.type_action] ?? 9)
    );
    setActions(sorted);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleIgnore = async () => {
    if (!ignoreModal || !ignoreNote.trim()) return;
    await supabase.from('actions_relance').update({
      statut: 'ignore',
      notes: ignoreModal.notes ? `${ignoreModal.notes}\n[Ignoré] ${ignoreNote}` : `[Ignoré] ${ignoreNote}`,
    }).eq('id', ignoreModal.id);
    toast.success('Action ignorée');
    setIgnoreModal(null);
    setIgnoreNote('');
    fetchData();
  };

  const pctRetard = rapport?.total_creances && rapport?.total_en_retard
    ? Math.round((rapport.total_en_retard / rapport.total_creances) * 100)
    : 0;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-2xl font-bold">Rapport du jour</h1>
      <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</p>

      {rapport?.resume_ia && (
        <div className="rounded-lg border border-ia-border bg-ia-bg p-5">
          <p className="text-ia-foreground leading-relaxed whitespace-pre-line">{rapport.resume_ia}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total créances" value={formatCurrency(rapport?.total_creances)} icon={Euro} />
        <KPICard title="Total en retard" value={formatCurrency(rapport?.total_en_retard)} subtitle={`${pctRetard}% du total`} icon={AlertTriangle} variant="danger" />
        <KPICard title="Actions du jour" value={String(actions.length)} icon={ListChecks} />
        <KPICard title="Factures réglées" value={rapport?.factures_payees_depuis_dernier || '0'} icon={CheckCircle} variant="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Actions à réaliser</CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">Aucune action prévue aujourd'hui. 🎉</p>
          ) : (
            <div className="space-y-3">
              {actions.map((action) => {
                const retard = action.factures ? joursRetard(action.factures.date_echeance) : 0;
                const badge = TYPE_ACTION_LABELS[action.type_action] || { label: action.type_action, className: 'bg-muted text-muted-foreground' };
                const isEmail = action.type_action === 'email_j7' || action.type_action === 'mise_en_demeure_j30';
                const isCall = action.type_action === 'appel_j15';

                return (
                  <div key={action.id} className="border rounded-lg p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={badge.className}>{badge.label}</Badge>
                        <span className="font-semibold text-sm">{action.clients?.nom}</span>
                        <span className="text-xs text-muted-foreground">#{action.factures?.numero_facture}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                        <span>{formatCurrency(action.factures?.solde_restant ?? action.factures?.montant ?? 0)}</span>
                        <span className={retard > 30 ? 'text-badge-danger font-medium' : retard > 15 ? 'text-badge-warning font-medium' : ''}>
                          {retard > 0 ? `${retard}j de retard` : 'À échéance'}
                        </span>
                        {isCall && action.clients?.telephone && (
                          <a href={`tel:${action.clients.telephone}`} className="text-primary underline">{action.clients.telephone}</a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {isEmail && (
                        <Button size="sm" variant="default" onClick={() => setEmailModal(action)}>
                          <Mail className="h-3.5 w-3.5 mr-1" /> Voir email
                        </Button>
                      )}
                      {isCall && (
                        <Button size="sm" variant="default" onClick={() => setCallModal(action)}>
                          <Phone className="h-3.5 w-3.5 mr-1" /> Appel fait
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setReportModal(action)}>
                        <Calendar className="h-3.5 w-3.5 mr-1" /> Reporter
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setIgnoreModal(action); setIgnoreNote(''); }}>
                        <X className="h-3.5 w-3.5 mr-1" /> Ignorer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setNoteModal(action)}>
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {emailModal && <EmailModal action={emailModal} onClose={() => setEmailModal(null)} onDone={fetchData} />}
      {callModal && <CallResultModal action={callModal} onClose={() => setCallModal(null)} onDone={fetchData} />}
      {reportModal && <ReportModal action={reportModal} onClose={() => setReportModal(null)} onDone={fetchData} />}
      {noteModal && <NoteModal action={noteModal} onClose={() => setNoteModal(null)} onDone={fetchData} />}

      {ignoreModal && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold">Ignorer cette action</h3>
            <p className="text-sm text-muted-foreground">Une note est obligatoire pour traçabilité.</p>
            <textarea
              className="w-full border rounded-md p-3 text-sm min-h-[80px] bg-background"
              placeholder="Raison..."
              value={ignoreNote}
              onChange={(e) => setIgnoreNote(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIgnoreModal(null)}>Annuler</Button>
              <Button onClick={handleIgnore} disabled={!ignoreNote.trim()}>Confirmer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
