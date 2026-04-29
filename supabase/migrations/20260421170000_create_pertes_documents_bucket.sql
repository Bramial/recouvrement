-- Bucket privé pour les pièces justificatives attachées aux factures en perte.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pertes_documents',
  'pertes_documents',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Politiques : tout utilisateur authentifié peut lister/uploader/supprimer dans ce bucket.
-- Aligné sur les politiques flat des autres tables de l'app (auth_select_*, auth_insert_*).
CREATE POLICY "auth_select_pertes_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pertes_documents');

CREATE POLICY "auth_insert_pertes_documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pertes_documents');

CREATE POLICY "auth_delete_pertes_documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'pertes_documents');
