-- Permet la suppression d'un import 'a_traiter' (et son fichier en storage)
-- depuis l'interface Historique.
CREATE POLICY "auth_delete_imports" ON imports
  FOR DELETE TO authenticated
  USING (true);
