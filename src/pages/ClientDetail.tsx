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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, XOctagon, RotateCcw, ChevronDown, ChevronRight, Undo2, Scale, ShieldCheck, Plus, CheckCircle, X, Paperclip, Download, Trash2, Upload } from 'lucide-react';
import type { FileObject } from '@supabase/storage-js';
import { toast } from 'sonner';

interface Client {
  id: string; code_client: string; nom: string; email: string | null;
  telephone: string | null; pays: string | null; conditions_paiement: string | null;
  exclusion_relance: boolean; client_interne: boolean;
}
interface Facture {
  id: string; numero_facture: string; montant: number; solde_restant: number | null;
  date_echeance: string; date_emission: string; statut: string; type_document: string;
  notes_litige: string | null; date_reception_dgd: string | null;
  derniere_apparition: string | null; updated_at: string | null;
}

type HistoryRow =
  | { kind: 'doc'; facture: Facture; sortDate: string }
  | { kind: 'payment_detected'; facture: Facture; sortDate: string; detectedAt: string };
interface Action {
  id: string; type_action: string; date_prevue: string; date_executee: string | null;
  statut: string; notes: string | null;
  factures: { numero_facture: string } | null;
}

const TYPE_ACTION_META: Record<string, { label: string; icon: string }> = {
  email_j7: { label: 'Email J+7', icon: '📧' },
  appel_j15: { label: 'Appel J+15', icon: '📞' },
  mise_en_demeure_j30: { label: 'Mise en demeure', icon: '📄' },
  rappel_dgd: { label: 'Rappel DGD', icon: '🛡️' },
  appel_manuel: { label: 'Appel', icon: '📞' },
  email_manuel: { label: 'Email', icon: '📧' },
  relance_manuel: { label: 'Relance', icon: '🔔' },
  courrier_manuel: { label: 'Courrier', icon: '✉️' },
  mise_en_demeure_manuel: { label: 'Mise en demeure', icon: '📄' },
  autre_manuel: { label: 'Autre', icon: '📋' },
};

const MANUAL_ACTION_TYPES = [
  { value: 'appel_manuel', label: 'Appel téléphonique' },
  { value: 'email_manuel', label: 'Email envoyé' },
  { value: 'relance_manuel', label: 'Relance' },
  { value: 'courrier_manuel', label: 'Courrier envoyé' },
  { value: 'mise_en_demeure_manuel', label: 'Mise en demeure' },
  { value: 'autre_manuel', label: 'Autre' },
];
const STATUT_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  a_faire: { label: 'À faire', variant: 'secondary' },
  fait: { label: 'Fait', variant: 'default' },
  ignore: { label: 'Ignoré', variant: 'outline' },
  reporte: { label: 'Reporté', variant: 'secondary' },
};

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [conditions, setConditions] = useState('');
  const [exclusion, setExclusion] = useState(false);
  const [clientInterne, setClientInterne] = useState(false);
  const [saving, setSaving] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [showPertes, setShowPertes] = useState(false);
  const [allFactures, setAllFactures] = useState<Facture[]>([]);
  const [litigeModal, setLitigeModal] = useState<Facture | null>(null);
  const [litigeNote, setLitigeNote] = useState('');
  const [litigeDetailModal, setLitigeDetailModal] = useState<Facture | null>(null);
  const [newLitigeNote, setNewLitigeNote] = useState('');
  const [savingLitigeNote, setSavingLitigeNote] = useState(false);
  const [dgdModal, setDgdModal] = useState<Facture | null>(null);
  const [dgdDate, setDgdDate] = useState('');
  const [documentsModal, setDocumentsModal] = useState<Facture | null>(null);
  const [documents, setDocuments] = useState<FileObject[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [manualActionModal, setManualActionModal] = useState(false);
  const [manualMode, setManualMode] = useState<'past' | 'scheduled'>('past');
  const [manualType, setManualType] = useState('appel_manuel');
  const [manualDate, setManualDate] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualFactureId, setManualFactureId] = useState('none');
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const maxMois = await getMaxMoisExtraction();
      // Charger TOUTES les factures du client (tous types, tous statuts)
      let facturesQuery = supabase.from('factures').select('*').eq('client_id', id);
      if (maxMois) facturesQuery = facturesQuery.eq('mois_extraction', maxMois);

      const [cRes, fRes, aRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', id).single(),
        facturesQuery,
        supabase.from('actions_relance').select('*, factures(numero_facture)').eq('client_id', id).order('date_prevue', { ascending: false }),
      ]);

      const c = cRes.data as unknown as Client;
      if (c) {
        setClient(c);
        setEmail(c.email || '');
        setTelephone(c.telephone || '');
        setConditions(c.conditions_paiement || '');
        setExclusion(c.exclusion_relance);
        setClientInterne(c.client_interne);
      }

      setAllFactures((fRes.data || []) as unknown as Facture[]);
      setActions((aRes.data || []) as unknown as Action[]);
    };
    load();
  }, [id]);

  const activeFactures = allFactures.filter(f => showPertes ? f.statut === 'perte' : (f.statut === 'en_cours' || f.statut === 'litige' || f.statut === 'retention_dgd'));
  const invoices = activeFactures.filter(f => f.type_document === 'FACT' || f.type_document === 'NDEB');
  const totalResteDu = invoices.reduce((s, f) => s + Number(f.solde_restant ?? f.montant ?? 0), 0);
  const pertesCount = allFactures.filter(f => f.statut === 'perte').length;
  // Historique complet : documents + lignes virtuelles "Paiement détecté" pour les
  // FACT/NDEB passées en payee. La date affichée est updated_at (quand le système a
  // basculé la facture en payee), pas derniere_apparition (dernière présence en pendentes).
  const historique: HistoryRow[] = (() => {
    const rows: HistoryRow[] = allFactures.map(f => ({ kind: 'doc' as const, facture: f, sortDate: f.date_emission }));
    for (const f of allFactures) {
      const isInvoice = f.type_document === 'FACT' || f.type_document === 'NDEB';
      if (!isInvoice || f.statut !== 'payee') continue;
      const detectedAt = (f.updated_at ? f.updated_at.slice(0, 10) : null) || f.derniere_apparition;
      if (!detectedAt) continue;
      rows.push({ kind: 'payment_detected', facture: f, sortDate: detectedAt, detectedAt });
    }
    return rows.sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
  })();
  // Solde net = somme des solde_restant des FACT/NDEB uniquement (les REC/NCRE sont déjà absorbés dans ces soldes)
  const soldeNet = allFactures
    .filter(f => f.type_document === 'FACT' || f.type_document === 'NDEB')
    .reduce((s, f) => s + Number(f.solde_restant ?? f.montant ?? 0), 0);

  const perteFacture = async (facture: Facture, perte: boolean) => {
    const newStatut = perte ? 'perte' : 'en_cours';
    await supabase.from('factures').update({ statut: newStatut }).eq('id', facture.id);
    setAllFactures(prev => prev.map(f => f.id === facture.id ? { ...f, statut: newStatut } : f));
    toast.success(perte ? `Facture ${facture.numero_facture} passée en perte` : `Facture ${facture.numero_facture} restaurée`);
  };

  const handleLitige = async () => {
    if (!litigeModal || !litigeNote.trim()) return;
    await supabase.from('factures').update({ statut: 'litige', notes_litige: litigeNote.trim() }).eq('id', litigeModal.id);
    setAllFactures(prev => prev.map(f => f.id === litigeModal.id ? { ...f, statut: 'litige', notes_litige: litigeNote.trim() } : f));
    toast.success(`Facture ${litigeModal.numero_facture} marquée en litige`);
    setLitigeModal(null);
    setLitigeNote('');
  };

  const addLitigeNote = async () => {
    if (!litigeDetailModal || !newLitigeNote.trim()) return;
    setSavingLitigeNote(true);
    const today = new Date().toLocaleDateString('fr-FR');
    const existing = litigeDetailModal.notes_litige || '';
    const updated = existing ? `${existing}\n[${today}] ${newLitigeNote.trim()}` : `[${today}] ${newLitigeNote.trim()}`;
    await supabase.from('factures').update({ notes_litige: updated }).eq('id', litigeDetailModal.id);
    setAllFactures(prev => prev.map(f => f.id === litigeDetailModal.id ? { ...f, notes_litige: updated } : f));
    setLitigeDetailModal(prev => prev ? { ...prev, notes_litige: updated } : null);
    setNewLitigeNote('');
    setSavingLitigeNote(false);
    toast.success('Note ajoutée');
  };

  const removeLitige = async (facture: Facture) => {
    if (!confirm('Retirer le litige et remettre la facture en cours ?')) return;
    await supabase.from('factures').update({ statut: 'en_cours', notes_litige: null }).eq('id', facture.id);
    setAllFactures(prev => prev.map(f => f.id === facture.id ? { ...f, statut: 'en_cours', notes_litige: null } : f));
    toast.success(`Litige retiré pour ${facture.numero_facture}`);
  };

  const handleDgd = async () => {
    if (!dgdModal || !dgdDate || !client) return;
    const rappelDate = new Date(dgdDate);
    rappelDate.setFullYear(rappelDate.getFullYear() + 1);
    const rappelStr = rappelDate.toISOString().split('T')[0];

    await supabase.from('factures').update({ statut: 'retention_dgd', date_reception_dgd: dgdDate }).eq('id', dgdModal.id);
    await supabase.from('actions_relance').insert({
      facture_id: dgdModal.id,
      client_id: client.id,
      type_action: 'rappel_dgd',
      date_prevue: rappelStr,
      statut: 'a_faire',
      notes: `Réception travaux: ${dgdDate} — Rappel DGD prévu le ${rappelStr}`,
    });

    setAllFactures(prev => prev.map(f => f.id === dgdModal.id ? { ...f, statut: 'retention_dgd', date_reception_dgd: dgdDate } : f));
    const { data } = await supabase.from('actions_relance').select('*, factures(numero_facture)').eq('client_id', id).order('date_prevue', { ascending: false });
    setActions((data || []) as unknown as Action[]);
    toast.success(`Rétention DGD activée — rappel prévu le ${rappelStr}`);
    setDgdModal(null);
    setDgdDate('');
  };

  const removeDgd = async (facture: Facture) => {
    if (!confirm('Retirer la rétention DGD et remettre la facture en cours ?')) return;
    await supabase.from('factures').update({ statut: 'en_cours', date_reception_dgd: null }).eq('id', facture.id);
    setAllFactures(prev => prev.map(f => f.id === facture.id ? { ...f, statut: 'en_cours', date_reception_dgd: null } : f));
    toast.success(`Rétention DGD retirée pour ${facture.numero_facture}`);
  };

  const loadDocuments = async (factureId: string) => {
    setDocumentsLoading(true);
    const { data, error } = await supabase.storage
      .from('pertes_documents')
      .list(factureId, { sortBy: { column: 'created_at', order: 'desc' } });
    if (error) toast.error('Erreur de chargement des pièces jointes');
    setDocuments(data || []);
    setDocumentsLoading(false);
  };

  const openDocumentsModal = (facture: Facture) => {
    setDocumentsModal(facture);
    setDocuments([]);
    loadDocuments(facture.id);
  };

  const slugifyFilename = (name: string) => {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    const cleaned = base
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${cleaned || 'fichier'}${ext.toLowerCase()}`;
  };

  const parseFileName = (storedName: string) => storedName.replace(/^\d+-/, '');

  const uploadDocuments = async (fileList: FileList | File[]) => {
    if (!documentsModal) return;
    const factureId = documentsModal.id;
    setUploading(true);
    const allowedMimes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic'];
    const maxBytes = 10 * 1024 * 1024;
    let okCount = 0;
    for (const file of Array.from(fileList)) {
      if (!allowedMimes.includes(file.type)) {
        toast.error(`${file.name} : type non autorisé (PDF/images uniquement)`);
        continue;
      }
      if (file.size > maxBytes) {
        toast.error(`${file.name} : trop volumineux (max 10 MB)`);
        continue;
      }
      const path = `${factureId}/${Date.now()}-${slugifyFilename(file.name)}`;
      const { error } = await supabase.storage.from('pertes_documents').upload(path, file);
      if (error) {
        toast.error(`${file.name} : ${error.message}`);
      } else {
        okCount++;
      }
    }
    if (okCount > 0) toast.success(`${okCount} fichier${okCount > 1 ? 's ajoutés' : ' ajouté'}`);
    setUploading(false);
    await loadDocuments(factureId);
  };

  const downloadDocument = async (storedName: string) => {
    if (!documentsModal) return;
    const path = `${documentsModal.id}/${storedName}`;
    const { data, error } = await supabase.storage.from('pertes_documents').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast.error('Impossible de générer le lien de téléchargement');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const deleteDocument = async (storedName: string) => {
    if (!documentsModal) return;
    if (!confirm(`Supprimer ${parseFileName(storedName)} ?`)) return;
    const path = `${documentsModal.id}/${storedName}`;
    const { error } = await supabase.storage.from('pertes_documents').remove([path]);
    if (error) {
      toast.error('Erreur lors de la suppression');
      return;
    }
    toast.success('Pièce supprimée');
    await loadDocuments(documentsModal.id);
  };

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    await supabase.from('clients').update({
      email: email || null, telephone: telephone || null,
      conditions_paiement: conditions || 'comptant', exclusion_relance: exclusion, client_interne: clientInterne,
    }).eq('id', id);
    toast.success('Client mis à jour');
    setSaving(false);
  };

  const reloadActions = async () => {
    const { data } = await supabase.from('actions_relance').select('*, factures(numero_facture)').eq('client_id', id).order('date_prevue', { ascending: false });
    setActions((data || []) as unknown as Action[]);
  };

  const reopenAction = async (actionId: string) => {
    if (!confirm('Remettre cette action en attente ?')) return;
    await supabase.from('actions_relance').update({ statut: 'a_faire', date_executee: null }).eq('id', actionId);
    toast.success('Action remise en attente');
    reloadActions();
  };

  const markActionDone = async (actionId: string) => {
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('actions_relance').update({ statut: 'fait', date_executee: today }).eq('id', actionId);
    toast.success('Action marquée comme faite');
    reloadActions();
  };

  const ignoreAction = async (actionId: string) => {
    if (!confirm('Ignorer cette action ?')) return;
    await supabase.from('actions_relance').update({ statut: 'ignore' }).eq('id', actionId);
    toast.success('Action ignorée');
    reloadActions();
  };

  const addManualAction = async () => {
    if (!client || !manualDate || !manualNotes.trim()) return;
    setSavingManual(true);
    const isScheduled = manualMode === 'scheduled';
    const { error } = await supabase.from('actions_relance').insert({
      client_id: client.id,
      facture_id: manualFactureId !== 'none' ? manualFactureId : null,
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
    await reloadActions();
    toast.success(isScheduled ? `Action programmée pour le ${manualDate}` : 'Action ajoutée à l\'historique');
    setManualActionModal(false);
    setManualMode('past');
    setManualType('appel_manuel');
    setManualDate('');
    setManualNotes('');
    setManualFactureId('none');
    setSavingManual(false);
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
      </div>
      <p className="text-sm text-muted-foreground">
        {client.code_client.startsWith('FR_') ? '🇫🇷' : client.code_client.startsWith('PT_') ? '🇵🇹' : ''} {client.code_client}
      </p>

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
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={clientInterne} onCheckedChange={setClientInterne} />
              <Label>Client interne</Label>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-1" /> Enregistrer</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{showPertes ? 'Factures en perte' : 'Factures en cours'} ({invoices.length}) — Reste dû total : {formatCurrency(totalResteDu)}</CardTitle>
            <div className="flex items-center gap-2">
              <Switch checked={showPertes} onCheckedChange={setShowPertes} id="show-pertes" />
              <Label htmlFor="show-pertes" className="text-xs text-muted-foreground whitespace-nowrap">
                Pertes{pertesCount > 0 && ` (${pertesCount})`}
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3">N°</th>
              <th className="text-right p-3">Montant</th>
              <th className="text-right p-3">Reste dû</th>
              <th className="text-left p-3">Échéance</th>
              <th className="text-center p-3"></th>
            </tr></thead>
            <tbody>
              {invoices.map(f => (
                <tr key={f.id} className="border-b">
                  <td className="p-3">
                    {f.numero_facture}
                    {f.statut === 'litige' && (
                      <Badge
                        className="ml-2 bg-badge-danger text-badge-danger-foreground cursor-pointer hover:opacity-80"
                        onClick={() => { setLitigeDetailModal(f); setNewLitigeNote(''); }}
                      >Litige</Badge>
                    )}
                    {f.statut === 'retention_dgd' && (
                      <Badge className="ml-2 bg-badge-info text-badge-info-foreground" title={f.date_reception_dgd ? `Rappel le ${new Date(new Date(f.date_reception_dgd).setFullYear(new Date(f.date_reception_dgd).getFullYear() + 1)).toLocaleDateString('fr-FR')}` : ''}>
                        DGD {f.date_reception_dgd && `→ ${new Date(new Date(f.date_reception_dgd).setFullYear(new Date(f.date_reception_dgd).getFullYear() + 1)).toLocaleDateString('fr-FR')}`}
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">{formatCurrency(f.montant)}</td>
                  <td className="p-3 text-right font-medium">{formatCurrency(f.solde_restant ?? f.montant)}</td>
                  <td className="p-3">{f.date_echeance}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                    {f.statut === 'retention_dgd' ? (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => removeDgd(f)} title="Retirer la rétention DGD">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    ) : f.statut === 'litige' ? (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => removeLitige(f)} title="Retirer le litige">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    ) : showPertes ? (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => openDocumentsModal(f)} title="Pièces jointes">
                          <Paperclip className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => perteFacture(f, false)} title="Restaurer">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => { setDgdModal(f); setDgdDate(''); }} title="Rétention DGD">
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => { setLitigeModal(f); setLitigeNote(''); }} title="Marquer en litige">
                          <Scale className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => perteFacture(f, true)} title="Passer en perte">
                          <XOctagon className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && <p className="text-center text-muted-foreground py-4">{showPertes ? 'Aucune facture en perte.' : 'Aucune facture en cours.'}</p>}
        </CardContent>
      </Card>

      {historique.length > 0 && (
        <Collapsible open={movementsOpen} onOpenChange={setMovementsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30">
                <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                  {movementsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Historique factures & règlements ({historique.length})
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="text-left p-3">N°</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-right p-3">Montant</th>
                    <th className="text-right p-3">Solde restant</th>
                    <th className="text-left p-3">Date</th>
                  </tr></thead>
                  <tbody>
                    {historique.map(row => {
                      if (row.kind === 'payment_detected') {
                        const f = row.facture;
                        const tooltip = `Facture ${f.numero_facture} passée en payée (disparue des pendentes)${f.derniere_apparition ? ` — dernière présence le ${f.derniere_apparition}` : ''}`;
                        return (
                          <tr key={`pay-${f.id}`} className="border-b bg-green-50/40">
                            <td className="p-3 text-muted-foreground italic">— Paiement —</td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-200">
                                Paiement détecté
                              </Badge>
                            </td>
                            <td className="p-3 text-right text-green-700">-{formatCurrency(f.montant)}</td>
                            <td className="p-3 text-right text-muted-foreground">—</td>
                            <td className="p-3 text-muted-foreground" title={tooltip}>{row.detectedAt}</td>
                          </tr>
                        );
                      }
                      const f = row.facture;
                      const typeBadge: Record<string, { label: string; className: string }> = {
                        FACT: { label: 'Facture', className: 'bg-blue-100 text-blue-700 border-blue-200' },
                        NDEB: { label: 'Note de débit', className: 'bg-blue-100 text-blue-700 border-blue-200' },
                        REC: { label: 'Règlement', className: 'bg-green-100 text-green-700 border-green-200' },
                        NCRE: { label: 'Avoir', className: 'bg-orange-100 text-orange-700 border-orange-200' },
                      };
                      const badge = typeBadge[f.type_document] || { label: f.type_document, className: '' };
                      const isInvoice = f.type_document === 'FACT' || f.type_document === 'NDEB';
                      const solde = Number(f.solde_restant ?? f.montant ?? 0);
                      return (
                        <tr key={f.id} className="border-b">
                          <td className="p-3">{f.numero_facture}</td>
                          <td className="p-3"><Badge variant="outline" className={`text-xs ${badge.className}`}>{badge.label}</Badge></td>
                          <td className="p-3 text-right text-muted-foreground">{formatCurrency(f.montant)}</td>
                          <td className={`p-3 text-right font-medium ${isInvoice ? (solde === 0 ? 'text-green-600' : '') : 'text-muted-foreground'}`}>
                            {isInvoice ? formatCurrency(solde) : '—'}
                          </td>
                          <td className="p-3 text-muted-foreground">{f.date_emission}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30 font-semibold">
                      <td className="p-3" colSpan={3}>Solde net</td>
                      <td className={`p-3 text-right ${soldeNet <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {soldeNet <= 0 ? `${formatCurrency(soldeNet)} — Soldé` : formatCurrency(soldeNet)}
                      </td>
                      <td className="p-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Historique des relances ({actions.length})</CardTitle>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => { setManualActionModal(true); setManualDate(new Date().toISOString().split('T')[0]); }}>
              <Plus className="h-3.5 w-3.5" /> Ajouter une action
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune relance.</p>
          ) : (
            <div className="relative ml-4">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-6">
                {actions.map(a => {
                  const meta = TYPE_ACTION_META[a.type_action] || { label: a.type_action, icon: '📋' };
                  const statut = STATUT_META[a.statut] || { label: a.statut, variant: 'secondary' as const };
                  const displayDate = a.date_executee || a.date_prevue;
                  return (
                    <div key={a.id} className="relative pl-8">
                      <span className="absolute left-0 top-0 flex items-center justify-center w-6 h-6 rounded-full bg-card border text-sm">
                        {meta.icon}
                      </span>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">{displayDate}</span>
                          <span className="font-medium text-sm">{meta.label}</span>
                          <Badge variant={statut.variant}>{statut.label}</Badge>
                          {a.statut === 'a_faire' && (
                            <>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => markActionDone(a.id)}>
                                <CheckCircle className="h-3 w-3" /> Fait
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1 text-muted-foreground" onClick={() => ignoreAction(a.id)}>
                                <X className="h-3 w-3" /> Ignorer
                              </Button>
                            </>
                          )}
                          {a.statut === 'fait' && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => reopenAction(a.id)}>
                              <Undo2 className="h-3 w-3" /> Réouvrir
                            </Button>
                          )}
                          {a.statut === 'ignore' && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => reopenAction(a.id)}>
                              <Undo2 className="h-3 w-3" /> Réouvrir
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Facture #{a.factures?.numero_facture}
                          {a.date_executee && a.date_prevue !== a.date_executee && ` · Prévue le ${a.date_prevue}`}
                        </p>
                        {a.notes && (
                          <p className="text-sm whitespace-pre-line bg-muted/50 rounded-md px-3 py-2 mt-1">{a.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {dgdModal && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold">Rétention DGD</h3>
            <p className="text-sm text-muted-foreground">
              Facture <span className="font-medium text-foreground">{dgdModal.numero_facture}</span> — {formatCurrency(dgdModal.solde_restant ?? dgdModal.montant)}
            </p>
            <div className="space-y-2">
              <Label>Date de réception des travaux</Label>
              <Input type="date" value={dgdDate} onChange={(e) => setDgdDate(e.target.value)} />
            </div>
            {dgdDate && (
              <p className="text-sm text-muted-foreground">
                Rappel DGD prévu le <span className="font-medium text-foreground">{new Date(new Date(dgdDate).setFullYear(new Date(dgdDate).getFullYear() + 1)).toLocaleDateString('fr-FR')}</span> (réception + 365j)
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDgdModal(null)}>Annuler</Button>
              <Button onClick={handleDgd} disabled={!dgdDate}>Confirmer</Button>
            </div>
          </div>
        </div>
      )}

      {litigeDetailModal && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold">Litige — Facture {litigeDetailModal.numero_facture}</h3>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes du litige</p>
              {litigeDetailModal.notes_litige ? (
                <div className="bg-muted/50 rounded-md px-3 py-2 text-sm whitespace-pre-line max-h-48 overflow-y-auto">
                  {litigeDetailModal.notes_litige}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Aucune note.</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ajouter une note</p>
              <textarea
                className="w-full border rounded-md p-3 text-sm min-h-[60px] bg-background"
                placeholder="Nouvelle note..."
                value={newLitigeNote}
                onChange={(e) => setNewLitigeNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLitigeDetailModal(null)}>Fermer</Button>
              <Button onClick={addLitigeNote} disabled={!newLitigeNote.trim() || savingLitigeNote}>Ajouter</Button>
            </div>
          </div>
        </div>
      )}

      {manualActionModal && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold">{manualMode === 'scheduled' ? 'Programmer une action' : 'Ajouter une action passée'}</h3>
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
              <Label>Facture concernée <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
              <Select value={manualFactureId} onValueChange={setManualFactureId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune (action générale)</SelectItem>
                  {allFactures.filter(f => f.type_document === 'FACT').map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.numero_facture} — {formatCurrency(f.solde_restant ?? f.montant)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Button variant="outline" onClick={() => setManualActionModal(false)}>Annuler</Button>
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
              Facture <span className="font-medium text-foreground">{litigeModal.numero_facture}</span>
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

      {documentsModal && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4" onClick={() => setDocumentsModal(null)}>
          <div className="bg-card rounded-lg p-6 w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Pièces jointes</h3>
              <Button size="sm" variant="ghost" onClick={() => setDocumentsModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Facture <span className="font-medium text-foreground">{documentsModal.numero_facture}</span>
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length > 0) uploadDocuments(e.dataTransfer.files);
              }}
              className={`border-2 border-dashed rounded-md p-6 text-center text-sm transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground mb-2">Glissez-déposez ici ou</p>
              <label className="inline-block">
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/png,image/jpeg,image/webp,image/heic"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      uploadDocuments(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
                <span className="inline-flex h-8 px-3 items-center text-xs font-medium rounded-md border bg-background hover:bg-muted cursor-pointer">
                  Choisir des fichiers
                </span>
              </label>
              <p className="text-xs text-muted-foreground mt-2">PDF, PNG, JPG, WebP, HEIC — 10 MB max</p>
              {uploading && <p className="text-xs text-muted-foreground mt-2">Upload en cours...</p>}
            </div>

            <div className="overflow-y-auto mt-4 space-y-2">
              {documentsLoading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Chargement...</p>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Aucune pièce jointe.</p>
              ) : documents.map(doc => {
                const displayName = parseFileName(doc.name);
                const size = doc.metadata?.size ?? 0;
                const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('fr-FR') : '—';
                return (
                  <div key={doc.id ?? doc.name} className="border rounded-md p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{displayName}</p>
                      <p className="text-xs text-muted-foreground">{date} · {formatBytes(size)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadDocument(doc.name)} title="Télécharger">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteDocument(doc.name)} title="Supprimer">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
