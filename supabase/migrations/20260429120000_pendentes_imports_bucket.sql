-- Bucket privé pour les fichiers Excel pendentes uploadés depuis l'app,
-- en attente de traitement par la session Cowork qui parse et upsert dans factures.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pendentes_imports',
  'pendentes_imports',
  false,
  20971520, -- 20 MB
  ARRAY[
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_select_pendentes_imports" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pendentes_imports');

CREATE POLICY "auth_insert_pendentes_imports" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pendentes_imports');

CREATE POLICY "auth_delete_pendentes_imports" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'pendentes_imports');

-- Étend le statut 'imports' pour inclure 'a_traiter' (fichier uploadé, pas encore parsé).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'imports'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%statut%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE imports DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE imports ADD CONSTRAINT imports_statut_check
  CHECK (statut IN ('ok', 'erreur', 'partiel', 'a_traiter'));
