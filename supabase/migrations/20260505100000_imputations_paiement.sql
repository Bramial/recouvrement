-- Exigence 8.3 : rapprochement manuel paiements / factures.
-- Source de vérité pour les imputations manuelles d'un règlement (REC) ou avoir
-- (NCRE) sur une facture (FACT/NDEB). Permet à Sarah/Pauline de déclarer "ce REC
-- couvre 10 000 € de cette facture" sans dépendre d'un FIFO chronologique
-- automatique (cf. cas Phages : règlement de mars sur facture de mars en sautant
-- janvier).
--
-- Le "vrai" reste dû d'une facture est recalculé côté client par
-- src/lib/imputations.ts à partir de cette table — la colonne factures.solde_restant
-- existante reste maintenue par l'import et sert de fallback quand aucune
-- imputation manuelle n'existe pour la facture concernée.

CREATE TABLE public.imputations_paiement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paiement_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  facture_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  montant_impute NUMERIC(12,2) NOT NULL CHECK (montant_impute > 0),
  commentaire TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_imputations_paiement_paiement ON public.imputations_paiement(paiement_id);
CREATE INDEX idx_imputations_paiement_facture ON public.imputations_paiement(facture_id);
CREATE INDEX idx_imputations_paiement_client ON public.imputations_paiement(client_id);

-- Trigger de cohérence : empêche d'imputer plus que ce qui est disponible
-- (côté paiement et côté facture), vérifie les types de documents et que le
-- paiement et la facture appartiennent au même client.
CREATE OR REPLACE FUNCTION public.check_imputation_paiement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_paiement RECORD;
  v_facture RECORD;
  v_total_impute_paiement NUMERIC;
  v_total_impute_facture NUMERIC;
BEGIN
  SELECT id, client_id, type_document, montant INTO v_paiement
  FROM factures WHERE id = NEW.paiement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paiement % introuvable', NEW.paiement_id;
  END IF;
  IF v_paiement.type_document NOT IN ('REC', 'NCRE') THEN
    RAISE EXCEPTION 'paiement_id doit pointer vers un REC ou NCRE (got %)', v_paiement.type_document;
  END IF;

  SELECT id, client_id, type_document, montant INTO v_facture
  FROM factures WHERE id = NEW.facture_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture % introuvable', NEW.facture_id;
  END IF;
  IF v_facture.type_document NOT IN ('FACT', 'NDEB') THEN
    RAISE EXCEPTION 'facture_id doit pointer vers une FACT ou NDEB (got %)', v_facture.type_document;
  END IF;

  IF v_paiement.client_id IS DISTINCT FROM v_facture.client_id THEN
    RAISE EXCEPTION 'Paiement et facture appartiennent à des clients différents';
  END IF;
  IF NEW.client_id IS DISTINCT FROM v_paiement.client_id THEN
    RAISE EXCEPTION 'client_id incohérent avec celui du paiement et de la facture';
  END IF;

  -- Total déjà imputé sur ce paiement (en excluant la ligne en cours d'update)
  SELECT COALESCE(SUM(montant_impute), 0) INTO v_total_impute_paiement
  FROM imputations_paiement
  WHERE paiement_id = NEW.paiement_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF v_total_impute_paiement + NEW.montant_impute > ABS(v_paiement.montant) + 0.001 THEN
    RAISE EXCEPTION 'Imputation dépasse le montant disponible du paiement (%.2f > %.2f)',
      v_total_impute_paiement + NEW.montant_impute, ABS(v_paiement.montant);
  END IF;

  -- Total déjà imputé sur cette facture (en excluant la ligne en cours d'update)
  SELECT COALESCE(SUM(montant_impute), 0) INTO v_total_impute_facture
  FROM imputations_paiement
  WHERE facture_id = NEW.facture_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF v_total_impute_facture + NEW.montant_impute > v_facture.montant + 0.001 THEN
    RAISE EXCEPTION 'Imputation dépasse le montant initial de la facture (%.2f > %.2f)',
      v_total_impute_facture + NEW.montant_impute, v_facture.montant;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_imputation_paiement
  BEFORE INSERT OR UPDATE ON public.imputations_paiement
  FOR EACH ROW EXECUTE FUNCTION public.check_imputation_paiement();

-- RLS : aligné sur les autres tables métier.
ALTER TABLE public.imputations_paiement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_imputations_paiement" ON public.imputations_paiement
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_imputations_paiement" ON public.imputations_paiement
  FOR INSERT TO authenticated WITH CHECK (public.can_write());
CREATE POLICY "update_imputations_paiement" ON public.imputations_paiement
  FOR UPDATE TO authenticated USING (public.can_write());
CREATE POLICY "delete_imputations_paiement" ON public.imputations_paiement
  FOR DELETE TO authenticated USING (public.can_write());

-- Étendre la CHECK constraint de actions_relance pour inclure 'imputation_manuelle'
-- (entrée d'audit générée à chaque batch d'imputations).
ALTER TABLE actions_relance DROP CONSTRAINT actions_relance_type_action_check;
ALTER TABLE actions_relance ADD CONSTRAINT actions_relance_type_action_check
  CHECK (type_action = ANY (ARRAY[
    'email_j7','appel_j15','mise_en_demeure_j30','rappel_dgd',
    'appel_manuel','email_manuel','relance_manuel','courrier_manuel',
    'mise_en_demeure_manuel','autre_manuel',
    'passage_perte','annulation_avoir','imputation_manuelle'
  ]));
