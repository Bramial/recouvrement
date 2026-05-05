import { describe, it, expect } from 'vitest';
import {
  indexImputations,
  resteDu,
  resteDuSigne,
  montantImpute,
  aImputations,
  paiementsDisponibles,
  type ImputationLite,
  type FactureLite,
} from './imputations';

const factFiveId = 'fact-12000';
const factSixId = 'fact-12600';
const recId = 'rec-1';
const ncreId = 'ncre-1';

const factFive: FactureLite & { numero_facture: string; statut: string } = {
  id: factFiveId,
  numero_facture: 'F12000',
  type_document: 'FACT',
  montant: 12000,
  solde_restant: 12000,
  statut: 'en_cours',
};

const factSix: FactureLite & { numero_facture: string; statut: string } = {
  id: factSixId,
  numero_facture: 'F12600',
  type_document: 'FACT',
  montant: 12600,
  solde_restant: 12600,
  statut: 'en_cours',
};

const recAcompte: FactureLite & { numero_facture: string; statut: string } = {
  id: recId,
  numero_facture: 'REC-001',
  type_document: 'REC',
  montant: -22000,
  solde_restant: -22000,
  statut: 'en_cours',
};

function makeImp(paiement_id: string, facture_id: string, montant: number, id = `${paiement_id}->${facture_id}`): ImputationLite {
  return {
    id,
    paiement_id,
    facture_id,
    client_id: 'client-sgm',
    montant_impute: montant,
    commentaire: null,
    created_by: null,
    created_at: new Date().toISOString(),
  };
}

describe('imputations helper', () => {
  it('cas SGM : 12 000 € sur F12000 + 10 000 € sur F12600 → reste dû 2 600 € sur F12600 et 0 € sur F12000', () => {
    const idx = indexImputations([
      makeImp(recId, factFiveId, 12000),
      makeImp(recId, factSixId, 10000),
    ]);
    expect(resteDu(factFive, idx)).toBe(0);
    expect(resteDuSigne(factFive, idx)).toBe(0);
    expect(resteDu(factSix, idx)).toBe(2600);
    expect(resteDuSigne(factSix, idx)).toBe(2600);
    // Le REC est totalement imputé (12000 + 10000 = 22000)
    expect(resteDuSigne(recAcompte, idx)).toBe(0);
    expect(montantImpute(recAcompte, idx)).toBe(22000);
    expect(aImputations(recAcompte, idx)).toBe(true);
  });

  it('cas Bourgiade : 50/50 d\'un même règlement sur deux factures → les deux restent affichées', () => {
    const rec = { ...recAcompte, montant: -10000, solde_restant: -10000 };
    const idx = indexImputations([
      makeImp(rec.id, factFiveId, 5000),
      makeImp(rec.id, factSixId, 5000),
    ]);
    expect(resteDu(factFive, idx)).toBe(7000);
    expect(resteDu(factSix, idx)).toBe(7600);
    expect(resteDuSigne(rec, idx)).toBe(0);
  });

  it('cas Phages : règlement sur la facture de mars en sautant celle de janvier', () => {
    const factJan = { ...factFive, id: 'fact-jan', montant: 5000, solde_restant: 5000 };
    const factMars = { ...factSix, id: 'fact-mars', montant: 7000, solde_restant: 7000 };
    const recMars = { ...recAcompte, id: 'rec-mars', montant: -7000, solde_restant: -7000 };
    const idx = indexImputations([makeImp(recMars.id, factMars.id, 7000)]);
    expect(resteDu(factJan, idx)).toBe(5000); // Pas touchée
    expect(resteDu(factMars, idx)).toBe(0); // Soldée par imputation
    expect(resteDuSigne(recMars, idx)).toBe(0);
  });

  it('aucune imputation → fallback sur solde_restant', () => {
    const idx = indexImputations([]);
    expect(resteDu(factFive, idx)).toBe(12000);
    expect(resteDuSigne(factFive, idx)).toBe(12000);
    expect(resteDuSigne(recAcompte, idx)).toBe(-22000);
  });

  it('aucune imputation et solde_restant ajusté par auto-absorption → on respecte solde_restant', () => {
    const idx = indexImputations([]);
    const fact = { ...factFive, solde_restant: 3500 };
    expect(resteDu(fact, idx)).toBe(3500);
    expect(resteDuSigne(fact, idx)).toBe(3500);
  });

  it('paiementsDisponibles filtre les paiements totalement imputés', () => {
    const idx = indexImputations([makeImp(recId, factFiveId, 22000)]);
    const dispo = paiementsDisponibles([factFive, factSix, recAcompte], idx);
    expect(dispo.length).toBe(0);
  });

  it('paiementsDisponibles retourne le reste imputable des paiements partiellement utilisés', () => {
    const idx = indexImputations([makeImp(recId, factFiveId, 12000)]);
    const dispo = paiementsDisponibles([factFive, factSix, recAcompte], idx);
    expect(dispo.length).toBe(1);
    expect(dispo[0].numero).toBe('REC-001');
    expect(dispo[0].dejaImpute).toBe(12000);
    expect(dispo[0].resteImputable).toBe(10000);
  });

  it('paiementsDisponibles ignore les paiements en perte', () => {
    const recPerte = { ...recAcompte, statut: 'perte' };
    const idx = indexImputations([]);
    const dispo = paiementsDisponibles([factFive, recPerte], idx);
    expect(dispo.length).toBe(0);
  });

  it('paiementsDisponibles inclut les NCRE (avoirs) à imputer comme les REC', () => {
    const ncre: FactureLite & { numero_facture: string; statut: string } = {
      id: ncreId,
      numero_facture: 'NCRE-1',
      type_document: 'NCRE',
      montant: -500,
      solde_restant: -500,
      statut: 'en_cours',
    };
    const idx = indexImputations([]);
    const dispo = paiementsDisponibles([factFive, ncre], idx);
    expect(dispo.length).toBe(1);
    expect(dispo[0].numero).toBe('NCRE-1');
    expect(dispo[0].resteImputable).toBe(500);
  });

  it('annulation : index sans cette imputation → reste dû revient à l\'état antérieur', () => {
    const idxAvant = indexImputations([makeImp(recId, factFiveId, 12000)]);
    expect(resteDu(factFive, idxAvant)).toBe(0);
    const idxApres = indexImputations([]);
    expect(resteDu(factFive, idxApres)).toBe(12000);
  });

  it('total des restes dûs FACT/NDEB d\'un client = somme correcte', () => {
    const idx = indexImputations([
      makeImp(recId, factFiveId, 12000),
      makeImp(recId, factSixId, 10000),
    ]);
    const factures = [factFive, factSix];
    const total = factures.reduce((s, f) => s + resteDuSigne(f, idx), 0);
    expect(total).toBe(2600);
  });
});
