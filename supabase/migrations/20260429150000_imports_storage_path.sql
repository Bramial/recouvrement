-- Chemin exact de l'objet dans le bucket pendentes_imports, retourné par
-- supabase.storage.upload(). Source de vérité pour retrouver le fichier
-- depuis une ligne imports (statut='a_traiter') sans rejouer la slugification.
ALTER TABLE imports ADD COLUMN IF NOT EXISTS storage_path TEXT;
