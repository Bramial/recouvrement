import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getMaxMoisExtraction } from '@/lib/supabaseHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Search, Plus, XOctagon, RotateCcw, ArrowUp, ArrowDown, Undo2, Scale, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useCountryFilter } from '@/hooks/useCountryFilter';
import { CountryFilter } from '@/components/CountryFilter';

interface Facture {
  id: string;
  client_id: string;
  numero_facture: string;
  type_document: string;
  montant: number;
  date_emission: string;
  date_echeance: string;
  solde_restant: number | null;
  statut: string;
  source: string | null;
  date_reception_dgd: string | null;
  clients: { nom: string; code_client: string; exclusion_relance: boolean; client_interne: boolean } | null;
}

interface ActionRelance {
  id: string;
  type_action: string;
  date_prevue: string;
  date_executee: string | null;
  statut: string;
  notes: string | null;
}

function joursRetard(dateEcheance: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ech = new Date(dateEcheance); ech.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - ech.getTime()) / (1000 * 60 * 60 * 24));
}

function retardBadge(jours: number) {
  if (jours > 30) return { label: `${jours}j`, className: 'bg-badge-danger text-badge-danger-foreground' };
  if (jours > 15) return { label: `${jours}j`, className: 'bg-badge-warning text-badge-warning-foreground' };
  if (jours > 7) return { label: `${jours}j`, className: 'bg-badge-warning/80 text-badge-warning-foreground' };
  if (jours > 0) return { label: `${jours}j`, className: 'bg-badge-success text-badge-success-foreground' };
  return { label: 'À jour', className: 'bg-muted text-muted-foreground' };
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n);
}

const TYPE_ACTION_LABELS: Record<string, string> = {
  email_j7: 'Email J+7', appel_j15: 'Appel J+15', mise_en_demeure_j30: 'Mise en demeure', rappel_dgd: 'Rappel DGD',
  appel_manuel: 'Appel', email_manuel: 'Email', relance_manuel: 'Relance',
  courrier_manuel: 'Courrier', mise_en_demeure_manuel: 'Mise en demeure', autre_manuel: 'Autre',
};
const STATUT_LABELS: Record<string, string> = {
  a_faire: 'À faire', fait: 'Fait', ignore: 'Ignoré', reporte: 'Reporté',
};

const MANUAL_ACTION_TYPES = [
  { value: 'appel_manuel', label: 'Appel téléphonique' },
  { value: 'email_manuel', label: 'Email envoyé' },
  { value: 'relance_manuel', label: 'Relance' },
  { value: 'courrier_manuel', label: 'Courrier envoyé' },
  { value: 'mise_en_demeure_manuel', label: 'Mise en demeure' },
  { value: 'autre_manuel', label: 'Autre' },
];

export default function Creances() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualModal, setManualModal] = useState<Facture | null>(null);
  const [manualMode, setManualMode] = useState<'past' | 'scheduled'>('past');
  const [manualType, setManualType] = useState('appel_manuel');
  const [manualDate, setManualDate] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const [search, setSearch] = useState('');
  const { country } = useCountryFilter();
  const [retardFilter, setRetardFilter] = useState('all');
  const [sortField, setSortField] = useState<'retard' | 'montant' | 'nom'>('retard');
  const [sortAsc, setSortAsc] = useState(false);
  const [showLitiges, setShowLitiges] = useState(false);
  const [selected, setSelected] = useState<Facture | null>(null);
  const [actionsHistory, setActionsHistory] = useState<ActionRelance[]>([]);
  const [litigeModal, setLitigeModal] = useState<Facture | null>(null);
  const [litigeNote, setLitigeNote] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const maxMois = await getMaxMoisExtraction();
      const joinType = country !== 'all' ? 'clients!inner' : 'clients';
      let query = supabase.from('factures').select(`*, clients!inner(nom, code_client, exclusion_relance, client_interne)`)
        .in('statut', ['en_cours', 'litige', 'retention_dgd'])
        .in('type_document', ['FACT', 'NDEB'])
        .eq('clients.client_interne', false);
      if (maxMois) query = query.eq('mois_extraction', maxMois);
      if (country !== 'all') query = query.ilike('clients.code_client', `${country}_%`);
      query = query.order('date_echeance', { ascending: true });
      const { data } = await query;
      setFactures((data || []) as unknown as Facture[]);
      setLoading(false);
    };
    load();
  }, [country]);

  const { filtered, totalAlgebrique } = useMemo(() => {
    let res = factures;
    // Exclure les clients internes
    res = res.filter(f => !f.clients?.client_interne);
    // Filter by statut view mode
    if (showLitiges) {
      res = res.filter(f => f.statut === 'litige');
    } else {
      res = res.filter(f => f.statut === 'en_cours' || f.statut === 'retention_dgd');
    }
    if (search) {
      const s = search.toLowerCase();
      res = res.filter(f => f.clients?.nom.toLowerCase().includes(s) || f.numero_facture.toLowerCase().includes(s));
    }
    if (retardFilter !== 'all') {
      res = res.filter(f => {
        const j = joursRetard(f.date_echeance);
        if (retardFilter === '<7') return j >= 0 && j < 7;
        if (retardFilter === '7-15') return j >= 7 && j <= 15;
        if (retardFilter === '15-30') return j > 15 && j <= 30;
        if (retardFilter === '>30') return j > 30;
        return true;
      });
    }
    // Total des créances (soldes recalculés, uniquement FACT/NDEB)
    const totalAlgebrique = res.reduce((s, f) => s + (f.solde_restant ?? f.montant), 0);
    res = [...res].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'retard') cmp = joursRetard(b.date_echeance) - joursRetard(a.date_echeance);
      else if (sortField === 'montant') cmp = (b.solde_restant ?? b.montant) - (a.solde_restant ?? a.montant);
      else cmp = (a.clients?.nom || '').localeCompare(b.clients?.nom || '');
      return sortAsc ? -cmp : cmp;
    });
    return { filtered: res, totalAlgebrique };
  }, [factures, search, retardFilter, sortField, sortAsc, showLitiges]);

  const perteFacture = async (f: Facture, perte: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatut = perte ? 'perte' : 'en_cours';
    await supabase.from('factures').update({ statut: newStatut }).eq('id', f.id);
    setFactures(prev => prev.map(fac => fac.id === f.id ? { ...fac, statut: newStatut } : fac));
    toast.success(perte ? `Facture ${f.numero_facture} passée en perte` : `Facture ${f.numero_facture} restaurée`);
  };

  const openDetail = async (f: Facture) => {
    setSelected(f);
    const { data } = await supabase.from('actions_relance').select('*').eq('facture_id', f.id).order('date_prevue', { ascending: false });
    setActionsHistory((data || []) as unknown as ActionRelance[]);
  };

  const openManualModal = (f: Facture, e: React.MouseEvent) => {
    e.stopPropagation();
    setManualModal(f);
    setManualMode('past');
    setManualType('appel_manuel');
    setManualDate(new Date().toISOString().split('T')[0]);
    setManualNotes('');
  };

  const addManualAction = async () => {
    if (!manualModal || !manualDate || !manualNotes.trim()) return;
    setSavingManual(true);
    const isScheduled = manualMode === 'scheduled';
    const { error } = await supabase.from('actions_relance').insert({
      client_id: manualModal.client_id,
      facture_id: manualModal.id,
      type_action: manualType,
      date_prevue: manualDate,
      date_executee: isScheduled ? null : manualDate,
      statut: isScheduled ? 'a_faire' : 'fait',
      notes: manualNotes.trim(),
    });
    if (error) {
      toast.error('Erreur lors de la sauvegarde de l\'action');
      setSavingManual(false);
      return;
    }
    toast.success(isScheduled ? `Action programmée pour le ${manualDate}` : 'Action ajoutée à l\'historique');
    setManualModal(null);
    setSavingManual(false);
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const reopenAction = async (actionId: string) => {
    if (!confirm('Remettre cette action en attente ?')) return;
    await supabase.from('actions_relance').update({ statut: 'a_faire', date_executee: null }).eq('id', actionId);
    toast.success('Action remise en attente');
    if (selected) {
      const { data } = await supabase.from('actions_relance').select('*').eq('facture_id', selected.id).order('date_prevue', { ascending: false });
      setActionsHistory((data || []) as unknown as ActionRelance[]);
    }
  };

  const handleLitige = async () => {
    if (!litigeModal || !litigeNote.trim()) return;
    await supabase.from('factures').update({ statut: 'litige', notes_litige: litigeNote.trim() }).eq('id', litigeModal.id);
    setFactures(prev => prev.map(f => f.id === litigeModal.id ? { ...f, statut: 'litige' } : f));
    toast.success(`Facture ${litigeModal.numero_facture} marquée en litige`);
    setLitigeModal(null);
    setLitigeNote('');
  };

  const removeLitige = async (f: Facture, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Retirer le litige et remettre la facture en cours ?')) return;
    await supabase.from('factures').update({ statut: 'en_cours', notes_litige: null }).eq('id', f.id);
    setFactures(prev => prev.map(fac => fac.id === f.id ? { ...fac, statut: 'en_cours' } : fac));
    toast.success(`Litige retiré pour ${f.numero_facture}`);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Créances en cours</h1>
        <CountryFilter />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher client ou facture..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={retardFilter} onValueChange={setRetardFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tout retard</SelectItem>
            <SelectItem value="<7">{'< 7 jours'}</SelectItem>
            <SelectItem value="7-15">7-15 jours</SelectItem>
            <SelectItem value="15-30">15-30 jours</SelectItem>
            <SelectItem value=">30">{'>  30 jours'}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={showLitiges ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowLitiges(!showLitiges)}
        >
          <Scale className="h-4 w-4 mr-1" />
          {showLitiges ? 'Voir actifs' : 'Litiges'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/pertes')}
        >
          <XOctagon className="h-4 w-4 mr-1" />
          Pertes
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 cursor-pointer select-none hover:bg-muted" onClick={() => toggleSort('nom')}>
                  <span className="inline-flex items-center gap-1">Client {sortField === 'nom' ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}</span>
                </th>
                <th className="text-left p-3">N° Facture</th>
                <th className="text-right p-3 cursor-pointer select-none hover:bg-muted" onClick={() => toggleSort('montant')}>
                  <span className="inline-flex items-center gap-1 justify-end">Montant dû {sortField === 'montant' ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowDown className="h-3 w-3 text-muted-foreground/40" />}</span>
                </th>
                <th className="text-left p-3">Échéance</th>
                <th className="text-center p-3 cursor-pointer select-none hover:bg-muted" onClick={() => toggleSort('retard')}>
                  <span className="inline-flex items-center gap-1 justify-center">Retard {sortField === 'retard' ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowDown className="h-3 w-3 text-muted-foreground/40" />}</span>
                </th>
                <th className="text-left p-3">Pays</th>
                <th className="text-center p-3">Action</th>
                <th className="text-center p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const retard = joursRetard(f.date_echeance);
                const badge = retardBadge(retard);
                return (
                  <tr key={f.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(f)}>
                    <td className="p-3 font-medium" onClick={(e) => e.stopPropagation()}>
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
                      {f.statut === 'litige' && <Badge className="ml-2 bg-badge-danger text-badge-danger-foreground">Litige</Badge>}
                      {f.statut === 'retention_dgd' && (
                        <Badge className="ml-2 bg-badge-info text-badge-info-foreground">
                          DGD {f.date_reception_dgd && `→ ${new Date(new Date(f.date_reception_dgd).setFullYear(new Date(f.date_reception_dgd).getFullYear() + 1)).toLocaleDateString('fr-FR')}`}
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-right font-medium">{formatCurrency(f.solde_restant ?? f.montant)}</td>
                    <td className="p-3 text-muted-foreground">{f.date_echeance}</td>
                    <td className="p-3 text-center"><Badge className={badge.className}>{badge.label}</Badge></td>
                    <td className="p-3">{f.clients?.code_client.startsWith('FR_') ? '🇫🇷 FR' : f.clients?.code_client.startsWith('PT_') ? '🇵🇹 PT' : f.source}</td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1"
                        onClick={(e) => openManualModal(f, e)}
                        title="Ajouter une action de relance"
                      >
                        <Plus className="h-3.5 w-3.5" /> Action
                      </Button>
                    </td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {f.statut === 'litige' ? (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={(e) => removeLitige(f, e)} title="Retirer le litige">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={(e) => { e.stopPropagation(); setLitigeModal(f); setLitigeNote(''); }} title="Marquer en litige">
                              <Scale className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={(e) => perteFacture(f, true, e)} title="Passer en perte">
                              <XOctagon className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-muted/30 font-semibold">
                  <td className="p-3">{filtered.length} documents</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-right">{formatCurrency(totalAlgebrique)}</td>
                  <td className="p-3" colSpan={5}></td>
                </tr>
              </tfoot>
            )}
          </table>
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Aucune facture trouvée.</p>}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="overflow-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Facture {selected.numero_facture}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Client</span><span className="font-medium">{selected.clients?.nom}</span>
                  <span className="text-muted-foreground">Montant original</span><span>{formatCurrency(selected.montant)}</span>
                  <span className="text-muted-foreground">Reste dû</span><span className="font-medium">{formatCurrency(selected.solde_restant ?? selected.montant)}</span>
                  <span className="text-muted-foreground">Émission</span><span>{selected.date_emission}</span>
                  <span className="text-muted-foreground">Échéance</span><span>{selected.date_echeance}</span>
                  <span className="text-muted-foreground">Retard</span><span>{joursRetard(selected.date_echeance)}j</span>
                  <span className="text-muted-foreground">Type</span><span>{selected.type_document}</span>
                  <span className="text-muted-foreground">Source</span><span>{selected.source}</span>
                </div>
                <h4 className="font-semibold text-sm mt-6">Historique des relances</h4>
                {actionsHistory.length === 0 && <p className="text-sm text-muted-foreground">Aucune relance.</p>}
                {actionsHistory.map(a => (
                  <div key={a.id} className="border rounded-md p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{TYPE_ACTION_LABELS[a.type_action] || a.type_action}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={a.statut === 'fait' ? 'default' : 'secondary'}>{STATUT_LABELS[a.statut] || a.statut}</Badge>
                        {a.statut === 'fait' && (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => reopenAction(a.id)} title="Réouvrir">
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-muted-foreground">Prévue: {a.date_prevue} {a.date_executee && `| Exécutée: ${a.date_executee}`}</p>
                    {a.notes && <p className="text-xs whitespace-pre-line mt-1">{a.notes}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {manualModal && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold">{manualMode === 'scheduled' ? 'Programmer une action' : 'Ajouter une action passée'}</h3>
            <p className="text-sm text-muted-foreground">
              Facture <span className="font-medium text-foreground">{manualModal.numero_facture}</span> — {manualModal.clients?.nom}
            </p>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              <button
                className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${manualMode === 'past' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setManualMode('past')}
              >
                Action passée
              </button>
              <button
                className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${manualMode === 'scheduled' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setManualMode('scheduled')}
              >
                Programmer
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {manualMode === 'scheduled'
                ? 'Cette action apparaîtra dans le rapport du jour à la date prévue.'
                : 'Tracez une action de relance déjà effectuée.'}
            </p>
            <div className="space-y-2">
              <Label>Type d'action</Label>
              <Select value={manualType} onValueChange={setManualType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MANUAL_ACTION_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{manualMode === 'scheduled' ? 'Date prévue' : "Date de l'action"}</Label>
              <Input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{manualMode === 'scheduled' ? 'Description de l\'action à réaliser' : 'Description / Notes'}</Label>
              <textarea
                className="w-full border rounded-md p-3 text-sm min-h-[80px] bg-background"
                placeholder={manualMode === 'scheduled' ? 'Ex: Appeler le client suite au dernier mail de relance...' : 'Ex: Appel au client, laissé un message vocal concernant les factures impayées...'}
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setManualModal(null)}>Annuler</Button>
              <Button onClick={addManualAction} disabled={!manualDate || !manualNotes.trim() || savingManual}>
                {manualMode === 'scheduled' ? 'Programmer' : 'Ajouter à l\'historique'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {litigeModal && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold">Marquer en litige</h3>
            <p className="text-sm text-muted-foreground">
              Facture <span className="font-medium text-foreground">{litigeModal.numero_facture}</span> — {litigeModal.clients?.nom}
            </p>
            <textarea
              className="w-full border rounded-md p-3 text-sm min-h-[80px] bg-background"
              placeholder="Décrivez le motif du litige..."
              value={litigeNote}
              onChange={(e) => setLitigeNote(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLitigeModal(null)}>Annuler</Button>
              <Button variant="destructive" onClick={handleLitige} disabled={!litigeNote.trim()}>Confirmer le litige</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
