import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  indexImputations,
  paiementsDisponibles,
  resteDu,
  montantImpute,
  type ImputationLite,
  type FactureLite,
} from '@/lib/imputations';

export interface ImputationModalFacture extends FactureLite {
  numero_facture: string;
  statut?: string | null;
}

interface Props {
  facture: ImputationModalFacture;
  client: { id: string; nom: string };
  facturesClient: ImputationModalFacture[];
  imputationsClient: ImputationLite[];
  currentUserId: string | null;
  onClose: () => void;
  onDone: () => void;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function ImputationModal({
  facture,
  client,
  facturesClient,
  imputationsClient,
  currentUserId,
  onClose,
  onDone,
}: Props) {
  const [montants, setMontants] = useState<Record<string, string>>({});
  const [commentaire, setCommentaire] = useState('');
  const [saving, setSaving] = useState(false);

  const idx = useMemo(() => indexImputations(imputationsClient), [imputationsClient]);
  const dispo = useMemo(
    () => paiementsDisponibles(facturesClient, idx),
    [facturesClient, idx]
  );

  const imputationsExistantes = useMemo(
    () => idx.byFacture.get(facture.id) ?? [],
    [idx, facture.id]
  );

  const paiementById = useMemo(() => {
    const m = new Map<string, ImputationModalFacture>();
    for (const f of facturesClient) m.set(f.id, f);
    return m;
  }, [facturesClient]);

  const montantInitial = Number(facture.montant) || 0;
  const dejaImpute = montantImpute(facture, idx);
  const resteFacture = resteDu(facture, idx);

  const handleDelete = async (imputationId: string) => {
    if (!confirm('Supprimer cette imputation ? Le reste dû reviendra à son état antérieur.')) return;
    const { error } = await supabase
      .from('imputations_paiement')
      .delete()
      .eq('id', imputationId);
    if (error) {
      toast.error(`Suppression impossible : ${error.message}`);
      return;
    }
    toast.success('Imputation supprimée');
    onDone();
    onClose();
  };

  const totalSaisi = useMemo(() => {
    return Object.values(montants).reduce((s, v) => {
      const n = parseFloat(v.replace(',', '.'));
      return s + (isNaN(n) || n < 0 ? 0 : n);
    }, 0);
  }, [montants]);

  const resteApresImputation = Math.max(0, resteFacture - totalSaisi);
  const tropImpute = totalSaisi > resteFacture + 0.001;

  // Validation par paiement : pas plus que le reste imputable
  const erreursParPaiement = useMemo(() => {
    const errs: Record<string, string | null> = {};
    for (const p of dispo) {
      const raw = montants[p.facture.id];
      if (!raw || raw.trim() === '') {
        errs[p.facture.id] = null;
        continue;
      }
      const n = parseFloat(raw.replace(',', '.'));
      if (isNaN(n) || n < 0) {
        errs[p.facture.id] = 'Montant invalide';
      } else if (n > p.resteImputable + 0.001) {
        errs[p.facture.id] = `Max ${formatCurrency(p.resteImputable)}`;
      } else {
        errs[p.facture.id] = null;
      }
    }
    return errs;
  }, [montants, dispo]);

  const hasErreur = Object.values(erreursParPaiement).some(e => e !== null);
  const canSubmit = totalSaisi > 0 && !tropImpute && !hasErreur && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);

    type Allocation = { paiementId: string; numero: string; montant: number };
    const allocations: Allocation[] = [];
    for (const p of dispo) {
      const raw = montants[p.facture.id];
      if (!raw || raw.trim() === '') continue;
      const n = parseFloat(raw.replace(',', '.'));
      if (!isNaN(n) && n > 0) {
        allocations.push({ paiementId: p.facture.id, numero: p.numero, montant: Math.round(n * 100) / 100 });
      }
    }

    if (allocations.length === 0) {
      setSaving(false);
      return;
    }

    const rows = allocations.map(a => ({
      paiement_id: a.paiementId,
      facture_id: facture.id,
      client_id: client.id,
      montant_impute: a.montant,
      commentaire: commentaire.trim() || null,
      created_by: currentUserId,
    }));

    const { error: insertError } = await supabase.from('imputations_paiement').insert(rows);
    if (insertError) {
      toast.error(`Erreur lors de l'imputation : ${insertError.message}`);
      setSaving(false);
      return;
    }

    // Audit dans actions_relance — une seule ligne pour le batch.
    const today = new Date().toISOString().split('T')[0];
    const totalImpute = allocations.reduce((s, a) => s + a.montant, 0);
    const resteAfter = Math.max(0, resteFacture - totalImpute);
    const detail = allocations
      .map(a => `${formatCurrency(a.montant)} de ${a.numero}`)
      .join(', ');
    const noteText =
      `Imputation manuelle : ${detail} sur la facture ${facture.numero_facture}` +
      ` (reste dû ${formatCurrency(resteAfter)}).` +
      (commentaire.trim() ? ` Commentaire : "${commentaire.trim()}"` : '');

    const { error: auditError } = await supabase.from('actions_relance').insert({
      client_id: client.id,
      facture_id: facture.id,
      type_action: 'imputation_manuelle',
      date_prevue: today,
      date_executee: today,
      statut: 'fait',
      notes: noteText,
    });
    if (auditError) {
      toast.error("Imputation enregistrée mais l'audit n'a pas pu être créé");
    } else {
      toast.success(
        allocations.length > 1
          ? `${allocations.length} imputations enregistrées (${formatCurrency(totalImpute)})`
          : `Imputation de ${formatCurrency(totalImpute)} enregistrée`
      );
    }

    setSaving(false);
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg p-6 w-full max-w-xl max-h-[85vh] flex flex-col gap-4">
        <div>
          <h3 className="font-semibold">Imputer un règlement</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Facture <span className="font-medium text-foreground">{facture.numero_facture}</span>
            {' — '}
            {client.nom}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/30 p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Montant initial</p>
            <p className="font-medium">{formatCurrency(montantInitial)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Déjà imputé</p>
            <p className="font-medium">{formatCurrency(dejaImpute)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reste dû</p>
            <p className={`font-medium ${resteFacture === 0 ? 'text-green-600' : ''}`}>
              {formatCurrency(resteFacture)}
            </p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 -mx-2 px-2 space-y-4">
          {imputationsExistantes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Imputations actuelles
              </p>
              {imputationsExistantes.map((imp) => {
                const paiement = paiementById.get(imp.paiement_id);
                const numero = paiement?.numero_facture ?? '—';
                return (
                  <div key={imp.id} className="border rounded-md p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{formatCurrency(Number(imp.montant_impute))}</span>
                        {' depuis '}
                        <span className="text-muted-foreground">{numero}</span>
                      </p>
                      {imp.commentaire && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">"{imp.commentaire}"</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(imp.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive shrink-0"
                      onClick={() => handleDelete(imp.id)}
                      title="Supprimer cette imputation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          {dispo.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aucun règlement disponible à imputer pour ce client.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Règlements / avoirs disponibles
              </p>
              {dispo.map(p => {
                const err = erreursParPaiement[p.facture.id];
                const isAvoir = p.facture.type_document === 'NCRE';
                return (
                  <div key={p.facture.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {p.numero}{' '}
                          <span className="text-xs text-muted-foreground font-normal">
                            ({isAvoir ? 'Avoir' : 'Acompte'})
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(p.montantInitialAbs)} · déjà imputé {formatCurrency(p.dejaImpute)}
                          {' · '}
                          <span className="font-medium text-foreground">
                            reste {formatCurrency(p.resteImputable)}
                          </span>
                        </p>
                      </div>
                      <div className="shrink-0 w-32">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={montants[p.facture.id] ?? ''}
                          onChange={(e) =>
                            setMontants((prev) => ({ ...prev, [p.facture.id]: e.target.value }))
                          }
                          className={err ? 'border-destructive' : ''}
                        />
                      </div>
                    </div>
                    {err && <p className="text-xs text-destructive">{err}</p>}
                    {!err && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => {
                            const max = Math.min(p.resteImputable, resteFacture).toFixed(2);
                            setMontants((prev) => ({ ...prev, [p.facture.id]: max }));
                          }}
                        >
                          Imputer le max
                        </button>
                        {montants[p.facture.id] && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:underline"
                            onClick={() =>
                              setMontants((prev) => {
                                const next = { ...prev };
                                delete next[p.facture.id];
                                return next;
                              })
                            }
                          >
                            Effacer
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="imp-commentaire">Commentaire (facultatif)</Label>
          <textarea
            id="imp-commentaire"
            className="w-full border rounded-md p-2 text-sm min-h-[60px] bg-background"
            placeholder="Ex: Acompte chantier janvier"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
          />
        </div>

        <div className="rounded-md bg-muted/30 p-3 text-sm flex items-center justify-between">
          <div>
            <span className="text-muted-foreground">Total à imputer : </span>
            <span className="font-semibold">{formatCurrency(totalSaisi)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Reste dû après : </span>
            <span className={`font-semibold ${resteApresImputation === 0 ? 'text-green-600' : ''}`}>
              {formatCurrency(resteApresImputation)}
            </span>
          </div>
        </div>
        {tropImpute && (
          <p className="text-xs text-destructive -mt-2">
            Le total saisi dépasse le reste dû de la facture.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? 'Enregistrement…' : 'Imputer'}
          </Button>
        </div>
      </div>
    </div>
  );
}
