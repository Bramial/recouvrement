-- Rattrapage : absorber les crédits REC/NCRE non appliqués dans les FACT/NDEB ouvertes.
-- La migration initiale du 08/04 a laissé 11 clients avec des crédits flottants (REC/NCRE
-- avec solde_restant = montant, tout en étant marqués payee). Ici on ré-applique la même
-- logique d'absorption mais sans filtrer les REC/NCRE par statut (sauf perte).
DO $$
DECLARE
  r RECORD;
  credit_remaining NUMERIC;
  inv RECORD;
BEGIN
  FOR r IN
    SELECT client_id, mois_extraction,
           ABS(SUM(COALESCE(solde_restant, montant))) AS total_credits
    FROM factures
    WHERE type_document IN ('REC', 'NCRE')
      AND statut NOT IN ('perte', 'pertes_profits')
      AND COALESCE(solde_restant, montant) < 0
    GROUP BY client_id, mois_extraction
    HAVING SUM(COALESCE(solde_restant, montant)) < 0
  LOOP
    credit_remaining := r.total_credits;

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
        UPDATE factures SET solde_restant = 0, statut = 'payee' WHERE id = inv.id;
        credit_remaining := credit_remaining - inv.solde;
      ELSE
        UPDATE factures SET solde_restant = inv.solde - credit_remaining WHERE id = inv.id;
        credit_remaining := 0;
      END IF;
    END LOOP;
  END LOOP;

  -- Règle des moins de 5 € : passer en perte les factures dont le solde net résiduel < 5 €
  FOR r IN
    SELECT client_id, mois_extraction,
           SUM(COALESCE(solde_restant, montant)) AS solde_net
    FROM factures
    WHERE statut IN ('en_cours', 'litige', 'retention_dgd')
      AND type_document IN ('FACT', 'NDEB')
    GROUP BY client_id, mois_extraction
    HAVING ABS(SUM(COALESCE(solde_restant, montant))) < 5
      AND SUM(COALESCE(solde_restant, montant)) != 0
  LOOP
    UPDATE factures
    SET statut = 'perte', solde_restant = COALESCE(solde_restant, montant)
    WHERE client_id = r.client_id
      AND mois_extraction = r.mois_extraction
      AND statut IN ('en_cours', 'litige', 'retention_dgd')
      AND type_document IN ('FACT', 'NDEB');
  END LOOP;
END $$;
