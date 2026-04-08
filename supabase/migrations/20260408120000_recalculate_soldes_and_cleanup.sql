-- 1. Supprimer toutes les actions_relance liées à des factures REC ou NCRE
DELETE FROM actions_relance
WHERE facture_id IN (
  SELECT id FROM factures WHERE type_document IN ('REC', 'NCRE')
);

-- 2. Recalculer le solde_restant des factures positives (FACT/NDEB)
--    en répartissant les montants négatifs (REC/NCRE) sur les factures les plus anciennes
DO $$
DECLARE
  r RECORD;
  credit_remaining NUMERIC;
  inv RECORD;
BEGIN
  -- Pour chaque client ayant des lignes négatives
  FOR r IN
    SELECT client_id, mois_extraction,
           ABS(SUM(COALESCE(solde_restant, montant))) AS total_credits
    FROM factures
    WHERE type_document IN ('REC', 'NCRE')
      AND statut IN ('en_cours', 'litige', 'retention_dgd')
    GROUP BY client_id, mois_extraction
    HAVING SUM(COALESCE(solde_restant, montant)) < 0
  LOOP
    credit_remaining := r.total_credits;

    -- Répartir sur les factures positives les plus anciennes
    FOR inv IN
      SELECT id, COALESCE(solde_restant, montant) AS solde
      FROM factures
      WHERE client_id = r.client_id
        AND mois_extraction = r.mois_extraction
        AND type_document IN ('FACT', 'NDEB')
        AND statut IN ('en_cours', 'litige', 'retention_dgd')
        AND COALESCE(solde_restant, montant) > 0
      ORDER BY date_emission ASC, date_echeance ASC
    LOOP
      EXIT WHEN credit_remaining <= 0;

      IF credit_remaining >= inv.solde THEN
        -- Le crédit couvre entièrement cette facture
        UPDATE factures SET solde_restant = 0, statut = 'payee' WHERE id = inv.id;
        credit_remaining := credit_remaining - inv.solde;
      ELSE
        -- Le crédit couvre partiellement cette facture
        UPDATE factures SET solde_restant = inv.solde - credit_remaining WHERE id = inv.id;
        credit_remaining := 0;
      END IF;
    END LOOP;
  END LOOP;

  -- 3. Règle des moins de 5 € : passer en perte les factures des clients dont le solde net < 5 €
  -- D'abord, identifier les clients concernés
  FOR r IN
    SELECT client_id, mois_extraction,
           SUM(COALESCE(solde_restant, montant)) AS solde_net
    FROM factures
    WHERE statut IN ('en_cours', 'litige', 'retention_dgd')
    GROUP BY client_id, mois_extraction
    HAVING ABS(SUM(COALESCE(solde_restant, montant))) < 5
      AND SUM(COALESCE(solde_restant, montant)) != 0
  LOOP
    -- Passer toutes les factures restantes de ce client en perte
    UPDATE factures
    SET statut = 'perte', solde_restant = COALESCE(solde_restant, montant)
    WHERE client_id = r.client_id
      AND mois_extraction = r.mois_extraction
      AND statut IN ('en_cours', 'litige', 'retention_dgd');

    -- Supprimer les actions de relance en attente pour ce client
    DELETE FROM actions_relance
    WHERE client_id = r.client_id
      AND statut = 'a_faire'
      AND facture_id IN (
        SELECT id FROM factures
        WHERE client_id = r.client_id AND mois_extraction = r.mois_extraction
      );
  END LOOP;
END $$;

-- 4. Mettre les factures REC/NCRE en statut payee (elles ont été absorbées)
UPDATE factures
SET statut = 'payee'
WHERE type_document IN ('REC', 'NCRE')
  AND statut IN ('en_cours', 'litige', 'retention_dgd');
