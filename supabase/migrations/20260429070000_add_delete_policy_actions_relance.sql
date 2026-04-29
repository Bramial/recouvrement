-- Politique DELETE manquante sur actions_relance : sans elle, le delete RLS-checked
-- depuis le client échoue silencieusement, ce qui empêchait notamment la suppression
-- de l'audit 'passage_perte' lors de la restauration d'une facture.
CREATE POLICY "auth_delete_actions" ON actions_relance
  FOR DELETE TO authenticated
  USING (true);
