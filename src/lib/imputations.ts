import { supabase } from '@/integrations/supabase/client';

export interface ImputationLite {
  id: string;
  paiement_id: string;
  facture_id: string;
  client_id: string;
  montant_impute: number;
  commentaire: string | null;
  created_by: string | null;
  created_at: string;
}

export interface FactureLite {
  id: string;
  type_document: string | null;
  montant: number;
  solde_restant: number | null;
}

export interface ImputationsIndex {
  parFacture: Map<string, number>;
  parPaiement: Map<string, number>;
  byFacture: Map<string, ImputationLite[]>;
  byPaiement: Map<string, ImputationLite[]>;
}

export function indexImputations(imputations: ImputationLite[]): ImputationsIndex {
  const parFacture = new Map<string, number>();
  const parPaiement = new Map<string, number>();
  const byFacture = new Map<string, ImputationLite[]>();
  const byPaiement = new Map<string, ImputationLite[]>();
  for (const imp of imputations) {
    const m = Number(imp.montant_impute) || 0;
    parFacture.set(imp.facture_id, (parFacture.get(imp.facture_id) ?? 0) + m);
    parPaiement.set(imp.paiement_id, (parPaiement.get(imp.paiement_id) ?? 0) + m);
    if (!byFacture.has(imp.facture_id)) byFacture.set(imp.facture_id, []);
    byFacture.get(imp.facture_id)!.push(imp);
    if (!byPaiement.has(imp.paiement_id)) byPaiement.set(imp.paiement_id, []);
    byPaiement.get(imp.paiement_id)!.push(imp);
  }
  return { parFacture, parPaiement, byFacture, byPaiement };
}

const EMPTY_INDEX: ImputationsIndex = {
  parFacture: new Map(),
  parPaiement: new Map(),
  byFacture: new Map(),
  byPaiement: new Map(),
};

export function emptyIndex(): ImputationsIndex {
  return {
    parFacture: new Map(),
    parPaiement: new Map(),
    byFacture: new Map(),
    byPaiement: new Map(),
  };
}

function isInvoice(type: string | null): boolean {
  return type === 'FACT' || type === 'NDEB';
}

function isPayment(type: string | null): boolean {
  return type === 'REC' || type === 'NCRE';
}

/**
 * Reste dû "signé" d'une ligne facture, prêt à être sommé pour obtenir le total
 * client. Convention :
 *   - FACT/NDEB → ≥ 0 (reste à encaisser)
 *   - REC/NCRE  → ≤ 0 (crédit non encore imputé sur une facture)
 *
 * Quand des imputations manuelles existent pour la ligne, elles font autorité
 * et écrasent le solde_restant existant. Sinon on retombe sur solde_restant ??
 * montant — comportement actuel préservé pour les lignes non touchées par le
 * rapprochement manuel.
 */
export function resteDuSigne(
  facture: FactureLite,
  idx: ImputationsIndex = EMPTY_INDEX
): number {
  const montant = Number(facture.montant) || 0;
  if (isInvoice(facture.type_document)) {
    const imp = idx.parFacture.get(facture.id) ?? 0;
    if (imp > 0) {
      return Math.max(0, montant - imp);
    }
    return Number(facture.solde_restant ?? montant);
  }
  if (isPayment(facture.type_document)) {
    const imp = idx.parPaiement.get(facture.id) ?? 0;
    if (imp > 0) {
      const restant = Math.max(0, Math.abs(montant) - imp);
      return restant === 0 ? 0 : -restant;
    }
    return Number(facture.solde_restant ?? montant);
  }
  return Number(facture.solde_restant ?? montant);
}

/**
 * Reste dû non signé d'une facture FACT/NDEB (utilisé pour l'affichage du
 * "reste à payer" dans la fiche client et la mise en demeure). Pour les
 * REC/NCRE, retourne le reste à imputer (≥ 0).
 */
export function resteDu(
  facture: FactureLite,
  idx: ImputationsIndex = EMPTY_INDEX
): number {
  return Math.abs(resteDuSigne(facture, idx));
}

/**
 * Montant déjà imputé sur (FACT/NDEB) ou depuis (REC/NCRE) cette ligne.
 * Retourne 0 si aucune imputation.
 */
export function montantImpute(
  facture: FactureLite,
  idx: ImputationsIndex = EMPTY_INDEX
): number {
  if (isInvoice(facture.type_document)) return idx.parFacture.get(facture.id) ?? 0;
  if (isPayment(facture.type_document)) return idx.parPaiement.get(facture.id) ?? 0;
  return 0;
}

/**
 * Vrai si la ligne (FACT/NDEB ou REC/NCRE) a au moins une imputation manuelle.
 * Sert à décider d'afficher le montant initial barré dans la fiche client.
 */
export function aImputations(
  facture: FactureLite,
  idx: ImputationsIndex = EMPTY_INDEX
): boolean {
  return montantImpute(facture, idx) > 0;
}

export interface PaiementDisponible {
  facture: FactureLite;
  numero: string;
  montantInitialAbs: number;
  dejaImpute: number;
  resteImputable: number;
}

/**
 * Liste des REC/NCRE d'un client utilisables comme source d'imputation,
 * avec leur reste imputable. Filtre les paiements totalement imputés et les
 * lignes en perte / annulées.
 */
export function paiementsDisponibles<T extends FactureLite & { numero_facture: string; statut?: string | null }>(
  facturesClient: T[],
  idx: ImputationsIndex = EMPTY_INDEX
): PaiementDisponible[] {
  return facturesClient
    .filter(f => isPayment(f.type_document))
    .filter(f => f.statut !== 'perte' && f.statut !== 'pertes_profits')
    .map(f => {
      const montantInitialAbs = Math.abs(Number(f.montant) || 0);
      const dejaImpute = idx.parPaiement.get(f.id) ?? 0;
      const resteImputable = Math.max(0, montantInitialAbs - dejaImpute);
      return {
        facture: f,
        numero: f.numero_facture,
        montantInitialAbs,
        dejaImpute,
        resteImputable,
      };
    })
    .filter(p => p.resteImputable > 0);
}

interface ImputationRow {
  id: string;
  paiement_id: string;
  facture_id: string;
  client_id: string;
  montant_impute: number | string;
  commentaire: string | null;
  created_by: string | null;
  created_at: string;
}

function rowToLite(r: ImputationRow): ImputationLite {
  return {
    id: r.id,
    paiement_id: r.paiement_id,
    facture_id: r.facture_id,
    client_id: r.client_id,
    montant_impute: Number(r.montant_impute) || 0,
    commentaire: r.commentaire,
    created_by: r.created_by,
    created_at: r.created_at,
  };
}

export async function fetchImputationsForClient(clientId: string): Promise<ImputationLite[]> {
  const { data, error } = await supabase
    .from('imputations_paiement')
    .select('id, paiement_id, facture_id, client_id, montant_impute, commentaire, created_by, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data || []) as unknown as ImputationRow[]).map(rowToLite);
}

export async function fetchImputationsForClients(clientIds: string[]): Promise<ImputationLite[]> {
  if (clientIds.length === 0) return [];
  const { data, error } = await supabase
    .from('imputations_paiement')
    .select('id, paiement_id, facture_id, client_id, montant_impute, commentaire, created_by, created_at')
    .in('client_id', clientIds);
  if (error) throw error;
  return ((data || []) as unknown as ImputationRow[]).map(rowToLite);
}

export async function fetchImputationsForFactures(factureIds: string[]): Promise<ImputationLite[]> {
  if (factureIds.length === 0) return [];
  // On récupère les imputations dont la facture OU le paiement est dans la liste,
  // pour pouvoir afficher correctement les soldes des deux côtés.
  const { data, error } = await supabase
    .from('imputations_paiement')
    .select('id, paiement_id, facture_id, client_id, montant_impute, commentaire, created_by, created_at')
    .or(`facture_id.in.(${factureIds.join(',')}),paiement_id.in.(${factureIds.join(',')})`);
  if (error) throw error;
  return ((data || []) as unknown as ImputationRow[]).map(rowToLite);
}
