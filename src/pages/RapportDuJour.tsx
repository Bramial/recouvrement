import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getMaxMoisExtraction } from '@/lib/supabaseHelpers';
import { KPICard } from '@/components/KPICard';
import { EmailModal } from '@/components/EmailModal';
import { CallResultModal } from '@/components/CallResultModal';
import { ReportModal } from '@/components/ReportModal';
import { NoteModal } from '@/components/NoteModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Euro, AlertTriangle, ListChecks, CheckCircle, Mail, Phone, Calendar, X, MessageSquare, FileText, Receipt, Globe, Scale, XOctagon } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { useCountryFilter } from '@/hooks/useCountryFilter';
import { CountryFilter } from '@/components/CountryFilter';
import { useAuth } from '@/hooks/useAuth';

interface Action {
  id: string;
  facture_id: string;
  client_id: string;
  type_action: string;
  date_prevue: string;
  statut: string;
  contenu_email: string | null;
  notes: string | null;
  factures: { numero_facture: string; montant: number; date_echeance: string; solde_restant: number | null; statut: string; type_document: string } | null;
  clients: { nom: string; email: string | null; telephone: string | null; code_client: string; client_interne: boolean } | null;
}

interface Rapport {
  total_creances: number | null;
  total_en_retard: number | null;
  nb_factures_en_cours: number | null;
  nb_actions_jour: number | null;
  resume_ia: string | null;
  factures_payees_depuis_dernier: string | null;
}

interface FactureResume {
  numero_facture: string;
  montant: number;
  solde_restant: number | null;
  source: string | null;
  client_nom: string;
}

interface KpiExtras {
  totalCreances: number;
  totalCreancesPrev: number;
  totalEnRetard: number;
  totalFR: number;
  totalPT: number;
  facturesReglees: FactureResume[];
  nouvellesFactures: FactureResume[];
  reglementsRecus: FactureResume[];
  litiges: FactureResume[];
  pertes: FactureResume[];
  totalLitiges: number;
  totalLitigesPrev: number;
  nbLitiges: number;
  totalPertes: number;
  totalPertesPrev: number;
}

const TYPE_ACTION_ORDER: Record<string, number> = {
  mise_en_demeure_j30: 0,
  appel_j15: 1,
  email_j7: 2,
  rappel_dgd: 3,
};

const TYPE_ACTION_LABELS: Record<string, { label: string; className: string }> = {
  mise_en_demeure_j30: { label: 'Mise en demeure', className: 'bg-badge-danger text-badge-danger-foreground' },
  appel_j15: { label: 'Appel J+15', className: 'bg-badge-warning text-badge-warning-foreground' },
  email_j7: { label: 'Email J+7', className: 'bg-badge-info text-badge-info-foreground' },
  rappel_dgd: { label: 'Rappel DGD', className: 'bg-badge-info text-badge-info-foreground' },
  appel_manuel: { label: 'Appel', className: 'bg-badge-warning text-badge-warning-foreground' },
  email_manuel: { label: 'Email', className: 'bg-badge-info text-badge-info-foreground' },
  relance_manuel: { label: 'Relance', className: 'bg-badge-info text-badge-info-foreground' },
  courrier_manuel: { label: 'Courrier', className: 'bg-muted text-muted-foreground' },
  mise_en_demeure_manuel: { label: 'Mise en demeure', className: 'bg-badge-danger text-badge-danger-foreground' },
  autre_manuel: { label: 'Autre', className: 'bg-muted text-muted-foreground' },
};

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '0,00 €';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
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
  const [kpiExtras, setKpiExtras] = useState<KpiExtras | null>(null);
  const [loading, setLoading] = useState(true);

  const [emailModal, setEmailModal] = useState<Action | null>(null);
  const [callModal, setCallModal] = useState<Action | null>(null);
  const [reportModal, setReportModal] = useState<Action | null>(null);
  const [noteModal, setNoteModal] = useState<Action | null>(null);
  const [ignoreModal, setIgnoreModal] = useState<Action | null>(null);
  const [ignoreNote, setIgnoreNote] = useState('');
  const [showRegleesModal, setShowRegleesModal] = useState(false);
  const [showNouvellesModal, setShowNouvellesModal] = useState(false);
  const [showReglementsModal, setShowReglementsModal] = useState(false);
  const [showLitigesModal, setShowLitigesModal] = useState(false);
  const [showPertesModal, setShowPertesModal] = useState(false);
  const { country } = useCountryFilter();
  const { canWrite } = useAuth();

  const today = format(new Date(), 'yyyy-MM-dd');

  const fetchData = async () => {
    setLoading(true);
    const clientsJoin = country !== 'all' ? 'clients!inner' : 'clients';
    let actionsQuery = supabase.from('actions_relance')
      .select(`*, factures(numero_facture, montant, date_echeance, solde_restant, statut, type_document), ${clientsJoin}(nom, email, telephone, code_client, client_interne)`)
      .eq('statut', 'a_faire').lte('date_prevue', today);
    if (country !== 'all') actionsQuery = actionsQuery.ilike('clients.code_client', `${country}_%`);

    // Get current and previous mois_extraction
    const maxMois = await getMaxMoisExtraction();

    const [rapportRes, actionsRes] = await Promise.all([
      supabase.from('rapports_quotidiens').select('*').order('date_rapport', { ascending: false }).limit(1).maybeSingle(),
      actionsQuery,
    ]);
    setRapport(rapportRes.data as Rapport | null);
    // Filter out actions for internal clients, perte and litige invoices
    const allActions = ((actionsRes.data || []) as unknown as Action[])
      .filter(a => !a.clients?.client_interne && a.factures?.statut !== 'perte' && a.factures?.statut !== 'litige' && a.factures?.type_document !== 'REC' && a.factures?.type_document !== 'NCRE')
      .sort((a, b) => (TYPE_ACTION_ORDER[a.type_action] ?? 9) - (TYPE_ACTION_ORDER[b.type_action] ?? 9));
    setActions(allActions);

    // Fetch extra KPIs from factures
    if (maxMois) {
      // Compute previous month from mois_extraction (format "YYYY-MM-DD" or "YYYY-MM")
      const [y, m] = maxMois.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1); // m-1 is current (0-indexed), m-2 is previous
      const prevMois = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;

      // Latest apparition date across all factures — used to detect invoices that
      // disappeared from the most recent pendentes import (= newly paid).
      const { data: latestAppRow } = await supabase
        .from('factures')
        .select('derniere_apparition')
        .not('derniere_apparition', 'is', null)
        .order('derniere_apparition', { ascending: false })
        .limit(1)
        .maybeSingle();
      const latestApparition = latestAppRow?.derniere_apparition as string | undefined;

      // Total créances : SUM(solde_restant) WHERE statut='en_cours' tous types confondus.
      // Les NCRE/REC négatifs réduisent le dû net — pas de filtre par type_document.
      let currentQuery = supabase.from('factures')
        .select('solde_restant, source, client_id, clients(code_client, client_interne)')
        .eq('mois_extraction', maxMois)
        .eq('statut', 'en_cours');
      if (country !== 'all') currentQuery = currentQuery.eq('source', country);

      // Previous month: même règle pour la comparaison de tendance
      let prevQuery = supabase.from('factures')
        .select('solde_restant, clients(client_interne)')
        .eq('mois_extraction', prevMois)
        .eq('statut', 'en_cours');
      if (country !== 'all') prevQuery = prevQuery.eq('source', country);

      // Factures réglées: payee + disparue du dernier import (derniere_apparition < latest).
      // FACT/NDEB only — REC/NCRE are absorption artifacts, not real invoice payments.
      let regleesQuery = supabase.from('factures')
        .select('numero_facture, montant, solde_restant, source, clients(nom, client_interne)')
        .eq('statut', 'payee')
        .in('type_document', ['FACT', 'NDEB']);
      if (latestApparition) regleesQuery = regleesQuery.lt('derniere_apparition', latestApparition);
      if (country !== 'all') regleesQuery = regleesQuery.eq('source', country);

      // Nouvelles factures: FACT/NDEB apparues pour la 1ère fois au dernier import
      let nouvellesQuery = supabase.from('factures')
        .select('numero_facture, montant, solde_restant, source, clients(nom, client_interne)')
        .in('type_document', ['FACT', 'NDEB']);
      if (latestApparition) nouvellesQuery = nouvellesQuery.eq('premiere_apparition', latestApparition);
      if (country !== 'all') nouvellesQuery = nouvellesQuery.eq('source', country);

      // Règlements reçus: REC/NCRE apparus pour la 1ère fois au dernier import (crédits non encore imputés)
      let reglementsQuery = supabase.from('factures')
        .select('numero_facture, montant, solde_restant, source, clients(nom, client_interne)')
        .in('type_document', ['REC', 'NCRE']);
      if (latestApparition) reglementsQuery = reglementsQuery.eq('premiere_apparition', latestApparition);
      if (country !== 'all') reglementsQuery = reglementsQuery.eq('source', country);

      // En retard: factures en cours avec échéance dépassée (pour recalculer côté client, sans internes)
      const today = format(new Date(), 'yyyy-MM-dd');
      let retardQuery = supabase.from('factures')
        .select('solde_restant, clients(client_interne)')
        .eq('mois_extraction', maxMois)
        .in('statut', ['en_cours', 'retention_dgd'])
        .in('type_document', ['FACT', 'NDEB'])
        .lt('date_echeance', today);
      if (country !== 'all') retardQuery = retardQuery.eq('source', country);

      // Litiges current (détail pour modal) & previous (solde only pour trend)
      let litigesQuery = supabase.from('factures')
        .select('numero_facture, montant, solde_restant, source, clients(nom, client_interne)')
        .eq('mois_extraction', maxMois).eq('statut', 'litige');
      if (country !== 'all') litigesQuery = litigesQuery.eq('source', country);
      let litigesPrevQuery = supabase.from('factures')
        .select('solde_restant, clients(client_interne)').eq('mois_extraction', prevMois).eq('statut', 'litige');
      if (country !== 'all') litigesPrevQuery = litigesPrevQuery.eq('source', country);

      // Pertes current (détail pour modal) & previous (inclut 'perte' manuelle + 'pertes_profits' importé)
      let pertesQuery = supabase.from('factures')
        .select('numero_facture, montant, solde_restant, source, clients(nom, client_interne)')
        .eq('mois_extraction', maxMois).in('statut', ['perte', 'pertes_profits']);
      if (country !== 'all') pertesQuery = pertesQuery.eq('source', country);
      let pertesPrevQuery = supabase.from('factures')
        .select('solde_restant, clients(client_interne)').eq('mois_extraction', prevMois).in('statut', ['perte', 'pertes_profits']);
      if (country !== 'all') pertesPrevQuery = pertesPrevQuery.eq('source', country);

      const [currentRes, prevRes, regleesRes, nouvellesRes, reglementsRes, retardRes, litigesRes, litigesPrevRes, pertesRes, pertesPrevRes] = await Promise.all([
        currentQuery, prevQuery, regleesQuery, nouvellesQuery, reglementsQuery, retardQuery, litigesQuery, litigesPrevQuery, pertesQuery, pertesPrevQuery,
      ]);

      const currentData = ((currentRes.data || []) as { solde_restant: number | null; source: string | null; clients: { client_interne: boolean } | null }[])
        .filter(f => !f.clients?.client_interne);
      const prevData = ((prevRes.data || []) as { solde_restant: number | null; clients: { client_interne: boolean } | null }[])
        .filter(f => !f.clients?.client_interne);

      type FactureRow = { numero_facture: string; montant: number; solde_restant: number | null; source: string | null; clients: { nom: string; client_interne?: boolean } | null };
      const toResume = (f: FactureRow): FactureResume => ({
        numero_facture: f.numero_facture,
        montant: f.montant,
        solde_restant: f.solde_restant,
        source: f.source,
        client_nom: f.clients?.nom || '—',
      });

      const facturesReglees = ((regleesRes.data || []) as FactureRow[])
        .filter(f => !f.clients?.client_interne)
        .map(toResume);

      const nouvellesFactures = ((nouvellesRes.data || []) as FactureRow[])
        .filter(f => !f.clients?.client_interne)
        .map(toResume);

      const reglementsRecus = ((reglementsRes.data || []) as FactureRow[])
        .filter(f => !f.clients?.client_interne)
        .map(toResume);

      const totalCreances = currentData.reduce((sum, f) => sum + (f.solde_restant || 0), 0);
      const totalCreancesPrev = prevData.reduce((sum, f) => sum + (f.solde_restant || 0), 0);
      const totalFR = currentData.filter(f => f.source === 'FR').reduce((sum, f) => sum + (f.solde_restant || 0), 0);
      const totalPT = currentData.filter(f => f.source === 'PT').reduce((sum, f) => sum + (f.solde_restant || 0), 0);

      type StatRow = { solde_restant: number | null; clients: { client_interne: boolean } | null };
      const excludeInterne = (rows: StatRow[]) => rows.filter(r => !r.clients?.client_interne);
      const retardData = excludeInterne((retardRes.data || []) as StatRow[]);
      const litigesPrevData = excludeInterne((litigesPrevRes.data || []) as StatRow[]);
      const pertesPrevData = excludeInterne((pertesPrevRes.data || []) as StatRow[]);
      const totalEnRetard = retardData.reduce((s, f) => s + (f.solde_restant || 0), 0);

      const litiges = ((litigesRes.data || []) as FactureRow[])
        .filter(f => !f.clients?.client_interne);
      const pertes = ((pertesRes.data || []) as FactureRow[])
        .filter(f => !f.clients?.client_interne);

      setKpiExtras({
        totalCreances,
        totalCreancesPrev,
        totalEnRetard,
        totalFR,
        totalPT,
        facturesReglees,
        nouvellesFactures,
        reglementsRecus,
        litiges: litiges.map(toResume),
        pertes: pertes.map(toResume),
        totalLitiges: litiges.reduce((s, f) => s + (f.solde_restant || 0), 0),
        totalLitigesPrev: litigesPrevData.reduce((s, f) => s + (f.solde_restant || 0), 0),
        nbLitiges: litiges.length,
        totalPertes: pertes.reduce((s, f) => s + (f.solde_restant || 0), 0),
        totalPertesPrev: pertesPrevData.reduce((s, f) => s + (f.solde_restant || 0), 0),
      });
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [country]);

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

  const pctRetard = kpiExtras && kpiExtras.totalCreances > 0
    ? Math.round((kpiExtras.totalEnRetard / kpiExtras.totalCreances) * 100)
    : 0;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rapport du jour</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</p>
        </div>
        <CountryFilter />
      </div>

      {rapport?.resume_ia && (
        <div className="rounded-lg border border-ia-border bg-ia-bg p-5">
          <p className="text-ia-foreground leading-relaxed whitespace-pre-line">{rapport.resume_ia}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total créances"
          value={kpiExtras ? formatCurrency(kpiExtras.totalCreances) : formatCurrency(rapport?.total_creances)}
          icon={Euro}
          trend={kpiExtras && kpiExtras.totalCreancesPrev > 0 ? (() => {
            const diff = kpiExtras.totalCreances - kpiExtras.totalCreancesPrev;
            const pct = Math.round(Math.abs(diff) / kpiExtras.totalCreancesPrev * 100);
            if (pct === 0) return null;
            return {
              direction: diff > 0 ? 'up' as const : 'down' as const,
              label: `${diff > 0 ? '+' : '-'}${pct}% vs mois préc.`,
              positive: diff <= 0, // baisse = positif pour les créances
            };
          })() : null}
        />
        <KPICard title="Total en retard" value={formatCurrency(kpiExtras?.totalEnRetard ?? 0)} subtitle={`${pctRetard}% du total`} icon={AlertTriangle} variant="danger" />
        <KPICard title="Actions du jour" value={String(actions.length)} icon={ListChecks} />
        <KPICard
          title="Factures réglées"
          value={String(kpiExtras?.facturesReglees.length ?? 0)}
          icon={CheckCircle}
          variant="success"
          onClick={() => setShowRegleesModal(true)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {country === 'all' && (
          <>
            <KPICard title="Créances France" value={formatCurrency(kpiExtras?.totalFR ?? 0)} icon={Globe} />
            <KPICard title="Créances Portugal" value={formatCurrency(kpiExtras?.totalPT ?? 0)} icon={Globe} />
          </>
        )}
        <KPICard
          title="Nouvelles factures"
          value={String(kpiExtras?.nouvellesFactures.length ?? 0)}
          icon={FileText}
          onClick={() => setShowNouvellesModal(true)}
        />
        <KPICard
          title="Règlements reçus"
          value={String(kpiExtras?.reglementsRecus.length ?? 0)}
          icon={Receipt}
          variant="success"
          onClick={() => setShowReglementsModal(true)}
        />
        <KPICard
          title="Litiges en cours"
          value={formatCurrency(kpiExtras?.totalLitiges ?? 0)}
          subtitle={`${kpiExtras?.nbLitiges ?? 0} facture${(kpiExtras?.nbLitiges ?? 0) > 1 ? 's' : ''}`}
          icon={Scale}
          variant="warning"
          onClick={() => setShowLitigesModal(true)}
          trend={kpiExtras && kpiExtras.totalLitigesPrev > 0 ? (() => {
            const diff = (kpiExtras.totalLitiges) - (kpiExtras.totalLitigesPrev);
            const pct = Math.round(Math.abs(diff) / kpiExtras.totalLitigesPrev * 100);
            if (pct === 0) return null;
            return {
              direction: diff > 0 ? 'up' as const : 'down' as const,
              label: `${diff > 0 ? '+' : '-'}${pct}% vs mois préc.`,
              positive: diff <= 0,
            };
          })() : null}
        />
        <KPICard
          title="Pertes cumulées"
          value={formatCurrency(kpiExtras?.totalPertes ?? 0)}
          icon={XOctagon}
          variant="danger"
          onClick={() => setShowPertesModal(true)}
          trend={kpiExtras && kpiExtras.totalPertesPrev > 0 ? (() => {
            const diff = (kpiExtras.totalPertes) - (kpiExtras.totalPertesPrev);
            const pct = Math.round(Math.abs(diff) / kpiExtras.totalPertesPrev * 100);
            if (pct === 0) return null;
            return {
              direction: diff > 0 ? 'up' as const : 'down' as const,
              label: `${diff > 0 ? '+' : '-'}${pct}% vs mois préc.`,
              positive: diff <= 0,
            };
          })() : null}
        />
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
                const isManual = action.type_action.endsWith('_manuel');

                return (
                  <div key={action.id} className="border rounded-lg p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={badge.className}>{badge.label}</Badge>
                        <span className="font-semibold text-sm">{action.clients?.nom}</span>
                        {action.factures?.numero_facture && <span className="text-xs text-muted-foreground">#{action.factures.numero_facture}</span>}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                        {action.factures && <span>{formatCurrency(action.factures.solde_restant ?? action.factures.montant ?? 0)}</span>}
                        {action.factures ? (
                          <span className={retard > 30 ? 'text-badge-danger font-medium' : retard > 15 ? 'text-badge-warning font-medium' : ''}>
                            {retard > 0 ? `${retard}j de retard` : 'À échéance'}
                          </span>
                        ) : null}
                        {isCall && action.clients?.telephone && (
                          <a href={`tel:${action.clients.telephone}`} className="text-primary underline">{action.clients.telephone}</a>
                        )}
                      </div>
                      {action.notes && <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-line">{action.notes}</p>}
                    </div>
                    {canWrite && (
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
                        {isManual && (
                          <Button size="sm" variant="default" onClick={() => setCallModal(action)}>
                            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Fait
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
                    )}
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

      {showRegleesModal && kpiExtras && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRegleesModal(false)}>
          <div className="bg-card rounded-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Factures réglées ({kpiExtras.facturesReglees.length})</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowRegleesModal(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="overflow-y-auto space-y-2">
              {kpiExtras.facturesReglees.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Aucune facture réglée ce mois.</p>
              ) : kpiExtras.facturesReglees.map((f) => (
                <div key={f.numero_facture} className="border rounded-md p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.client_nom}</p>
                    <p className="text-xs text-muted-foreground">#{f.numero_facture} · {f.source}</p>
                  </div>
                  <p className="text-sm font-semibold whitespace-nowrap">{formatCurrency(f.montant)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showNouvellesModal && kpiExtras && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNouvellesModal(false)}>
          <div className="bg-card rounded-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Nouvelles factures ({kpiExtras.nouvellesFactures.length})</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowNouvellesModal(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="overflow-y-auto space-y-2">
              {kpiExtras.nouvellesFactures.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Aucune nouvelle facture ce mois.</p>
              ) : kpiExtras.nouvellesFactures.map((f) => (
                <div key={f.numero_facture} className="border rounded-md p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.client_nom}</p>
                    <p className="text-xs text-muted-foreground">#{f.numero_facture} · {f.source}</p>
                  </div>
                  <p className="text-sm font-semibold whitespace-nowrap">{formatCurrency(f.solde_restant ?? f.montant)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showReglementsModal && kpiExtras && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4" onClick={() => setShowReglementsModal(false)}>
          <div className="bg-card rounded-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Règlements reçus ({kpiExtras.reglementsRecus.length})</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowReglementsModal(false)}><X className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">REC/NCRE apparus au dernier import — crédits non encore imputés.</p>
            <div className="overflow-y-auto space-y-2">
              {kpiExtras.reglementsRecus.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Aucun règlement reçu au dernier import.</p>
              ) : kpiExtras.reglementsRecus.map((f) => (
                <div key={f.numero_facture} className="border rounded-md p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.client_nom}</p>
                    <p className="text-xs text-muted-foreground">#{f.numero_facture} · {f.source}</p>
                  </div>
                  <p className="text-sm font-semibold whitespace-nowrap">{formatCurrency(f.montant)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showLitigesModal && kpiExtras && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4" onClick={() => setShowLitigesModal(false)}>
          <div className="bg-card rounded-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Litiges en cours ({kpiExtras.litiges.length})</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowLitigesModal(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="overflow-y-auto space-y-2">
              {kpiExtras.litiges.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Aucun litige.</p>
              ) : kpiExtras.litiges.map((f) => (
                <div key={f.numero_facture} className="border rounded-md p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.client_nom}</p>
                    <p className="text-xs text-muted-foreground">#{f.numero_facture} · {f.source}</p>
                  </div>
                  <p className="text-sm font-semibold whitespace-nowrap">{formatCurrency(f.solde_restant ?? f.montant)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPertesModal && kpiExtras && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4" onClick={() => setShowPertesModal(false)}>
          <div className="bg-card rounded-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Pertes cumulées ({kpiExtras.pertes.length})</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowPertesModal(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="overflow-y-auto space-y-2">
              {kpiExtras.pertes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Aucune perte.</p>
              ) : kpiExtras.pertes.map((f) => (
                <div key={f.numero_facture} className="border rounded-md p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.client_nom}</p>
                    <p className="text-xs text-muted-foreground">#{f.numero_facture} · {f.source}</p>
                  </div>
                  <p className="text-sm font-semibold whitespace-nowrap">{formatCurrency(f.solde_restant ?? f.montant)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
