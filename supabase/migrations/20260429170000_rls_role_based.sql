-- Bascule toutes les policies d'écriture des tables métier sur can_write()
-- (admin OU user). Les SELECT restent ouvertes à tout authentifié — les
-- 3 rôles (admin/user/reader) peuvent lire.

-- clients
DROP POLICY IF EXISTS "auth_update_clients" ON clients;
DROP POLICY IF EXISTS "auth_insert_clients" ON clients;
CREATE POLICY "write_clients" ON clients
  FOR UPDATE TO authenticated
  USING (public.can_write());
CREATE POLICY "insert_clients" ON clients
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write());

-- factures
DROP POLICY IF EXISTS "auth_update_factures" ON factures;
DROP POLICY IF EXISTS "auth_insert_factures" ON factures;
CREATE POLICY "write_factures" ON factures
  FOR UPDATE TO authenticated
  USING (public.can_write());
CREATE POLICY "insert_factures" ON factures
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write());

-- actions_relance (DELETE existe déjà depuis 20260429070000)
DROP POLICY IF EXISTS "auth_update_actions" ON actions_relance;
DROP POLICY IF EXISTS "auth_insert_actions" ON actions_relance;
DROP POLICY IF EXISTS "auth_delete_actions" ON actions_relance;
CREATE POLICY "write_actions" ON actions_relance
  FOR UPDATE TO authenticated
  USING (public.can_write());
CREATE POLICY "insert_actions" ON actions_relance
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write());
CREATE POLICY "delete_actions" ON actions_relance
  FOR DELETE TO authenticated
  USING (public.can_write());

-- rapports_quotidiens
DROP POLICY IF EXISTS "auth_insert_rapports" ON rapports_quotidiens;
CREATE POLICY "insert_rapports" ON rapports_quotidiens
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write());

-- imports (DELETE existe depuis 20260429130000)
DROP POLICY IF EXISTS "auth_insert_imports" ON imports;
DROP POLICY IF EXISTS "auth_delete_imports" ON imports;
CREATE POLICY "insert_imports" ON imports
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write());
CREATE POLICY "delete_imports" ON imports
  FOR DELETE TO authenticated
  USING (public.can_write());

-- Storage : pertes_documents (créé dans 20260421170000)
-- SELECT reste ouverte (reader peut consulter les pièces justificatives).
DROP POLICY IF EXISTS "auth_insert_pertes_documents" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_pertes_documents" ON storage.objects;
CREATE POLICY "insert_pertes_documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pertes_documents' AND public.can_write());
CREATE POLICY "delete_pertes_documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'pertes_documents' AND public.can_write());

-- Storage : pendentes_imports (créé dans 20260429120000)
DROP POLICY IF EXISTS "auth_insert_pendentes_imports" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_pendentes_imports" ON storage.objects;
CREATE POLICY "insert_pendentes_imports" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pendentes_imports' AND public.can_write());
CREATE POLICY "delete_pendentes_imports" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'pendentes_imports' AND public.can_write());
