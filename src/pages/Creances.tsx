import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getMaxMoisExtraction } from '@/lib/supabaseHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Search, Mail, Phone, AlertTriangle, Loader2, Archive, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

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
  clients: { nom: string; code_client: string; archive: boolean | null } | null;
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
  email_j7: 'Email J+7', appel_j15: 'Appel J+15', mise_en_demeure_j30: 'Mise en demeure',
};
const STATUT_LABELS: Record<string, string> = {
  a_faire: 'À faire', fait: 'Fait', ignore: 'Ignoré', reporte: 'Reporté',
};

function getActionType(joursRetard: number): { type: string; label: string; icon: typeof Mail } | null {
  if (joursRetard > 30) return { type: 'mise_en_demeure_j30', label: 'Mise en demeure', icon: AlertTriangle };
  if (joursRetard > 15) return { type: 'appel_j15', label: 'Appel J+15', icon: Phone };
  if (joursRetard > 7) return { type: 'email_j7', label: 'Email J+7', icon: Mail };
  return null;
}

export default function Creances() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [paysFilter, setPaysFilter] = useState('all');
  const [retardFilter, setRetardFilter] = useState('all');
  const [showAllMovements, setShowAllMovements] = useState(false);
  const [sortField, setSortField] = useState<'retard' | 'montant' | 'nom'>('retard');
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Facture | null>(null);
  const [actionsHistory, setActionsHistory] = useState<ActionRelance[]>([]);

  useEffect(() => {
    const load = async () => {
      const maxMois = await getMaxMoisExtraction();
      let query = supabase.from('factures').select('*, clients(nom, code_client, archive)').eq('statut', 'en_cours');
      if (maxMois) query = query.eq('mois_extraction', maxMois);
      const { data } = await query;
      setFactures((data || []) as unknown as Facture[]);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let res = factures;
    // Filter out archived clients
    res = res.filter(f => !f.clients?.archive);
    // By default show only FACT with solde > 0, unless toggle is on
    if (!showAllMovements) {
      res = res.filter(f => f.type_document === 'FACT' && (f.solde_restant ?? f.montant) > 0);
    }
    if (paysFilter !== 'all') res = res.filter(f => f.source === paysFilter);
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
    res = [...res].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'retard') cmp = joursRetard(b.date_echeance) - joursRetard(a.date_echeance);
      else if (sortField === 'montant') cmp = (b.solde_restant ?? b.montant) - (a.solde_restant ?? a.montant);
      else cmp = (a.clients?.nom || '').localeCompare(b.clients?.nom || '');
      return sortAsc ? -cmp : cmp;
    });
    return res;
  }, [factures, search, paysFilter, retardFilter, sortField, sortAsc, showAllMovements]);

  const openDetail = async (f: Facture) => {
    setSelected(f);
    const { data } = await supabase.from('actions_relance').select('*').eq('facture_id', f.id).order('date_prevue', { ascending: false });
    setActionsHistory((data || []) as unknown as ActionRelance[]);
  };

  const generateAction = async (f: Facture, e: React.MouseEvent) => {
    e.stopPropagation();
    const retard = joursRetard(f.date_echeance);
    const actionDef = getActionType(retard);
    if (!actionDef) return;

    setGeneratingId(f.id);
    const today = new Date().toISOString().split('T')[0];

    // Check if an active action already exists for this invoice
    const { data: existing } = await supabase
      .from('actions_relance')
      .select('id')
      .eq('facture_id', f.id)
      .eq('type_action', actionDef.type)
      .eq('statut', 'a_faire')
      .limit(1);

    if (existing && existing.length > 0) {
      toast.warning('Une action de ce type existe déjà pour cette facture.');
      setGeneratingId(null);
      return;
    }

    const { error } = await supabase.from('actions_relance').insert({
      facture_id: f.id,
      client_id: f.client_id,
      type_action: actionDef.type,
      date_prevue: today,
      statut: 'a_faire',
    });

    if (error) {
      toast.error("Erreur lors de la création de l'action.");
    } else {
      toast.success(`Action "${actionDef.label}" créée pour ${f.clients?.nom}`);
    }
    setGeneratingId(null);
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-2xl font-bold">Créances en cours</h1>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher client ou facture..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={paysFilter} onValueChange={setPaysFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous pays</SelectItem>
            <SelectItem value="PT">Portugal</SelectItem>
            <SelectItem value="FR">France</SelectItem>
          </SelectContent>
        </Select>
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
        <div className="flex items-center gap-2">
          <Switch checked={showAllMovements} onCheckedChange={setShowAllMovements} id="show-all" />
          <Label htmlFor="show-all" className="text-sm whitespace-nowrap">Tous mouvements</Label>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 cursor-pointer hover:bg-muted" onClick={() => toggleSort('nom')}>Client {sortField === 'nom' && (sortAsc ? '↑' : '↓')}</th>
                <th className="text-left p-3">N° Facture</th>
                <th className="text-left p-3">Type</th>
                <th className="text-right p-3 cursor-pointer hover:bg-muted" onClick={() => toggleSort('montant')}>Montant {sortField === 'montant' && (sortAsc ? '↑' : '↓')}</th>
                <th className="text-right p-3">Reste dû</th>
                <th className="text-left p-3">Échéance</th>
                <th className="text-center p-3 cursor-pointer hover:bg-muted" onClick={() => toggleSort('retard')}>Retard {sortField === 'retard' && (sortAsc ? '↑' : '↓')}</th>
                <th className="text-left p-3">Pays</th>
                <th className="text-center p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const retard = joursRetard(f.date_echeance);
                const badge = retardBadge(retard);
                const isMovement = f.type_document !== 'FACT';
                const actionDef = !isMovement ? getActionType(retard) : null;
                const ActionIcon = actionDef?.icon;
                return (
                  <tr key={f.id} className={`border-b hover:bg-muted/30 cursor-pointer ${isMovement ? 'text-muted-foreground bg-muted/20' : ''}`} onClick={() => openDetail(f)}>
                    <td className="p-3 font-medium">{f.clients?.nom}</td>
                    <td className="p-3 text-muted-foreground">{f.numero_facture}</td>
                    <td className="p-3">
                      {isMovement ? <Badge variant="outline" className="text-xs">{f.type_document}</Badge> : f.type_document}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">{formatCurrency(f.montant)}</td>
                    <td className="p-3 text-right font-medium">{formatCurrency(f.solde_restant ?? f.montant)}</td>
                    <td className="p-3 text-muted-foreground">{f.date_echeance}</td>
                    <td className="p-3 text-center"><Badge className={badge.className}>{badge.label}</Badge></td>
                    <td className="p-3">{f.source}</td>
                    <td className="p-3 text-center">
                      {actionDef && ActionIcon ? (
                        <Button
                          size="sm"
                          variant={actionDef.type === 'mise_en_demeure_j30' ? 'destructive' : actionDef.type === 'appel_j15' ? 'outline' : 'default'}
                          className="text-xs gap-1"
                          disabled={generatingId === f.id}
                          onClick={(e) => generateAction(f, e)}
                        >
                          {generatingId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ActionIcon className="h-3 w-3" />}
                          {actionDef.label}
                        </Button>
                      ) : !isMovement ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
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
                      <Badge variant={a.statut === 'fait' ? 'default' : 'secondary'}>{STATUT_LABELS[a.statut] || a.statut}</Badge>
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
    </div>
  );
}
