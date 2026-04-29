-- Date "Emitido em" lue dans le header du fichier Pendentes uploadé.
-- Sert de garde-fou : on refuse l'import si la date est antérieure à la dernière
-- date enregistrée pour la même source.
ALTER TABLE imports ADD COLUMN IF NOT EXISTS emitido_em DATE;
CREATE INDEX IF NOT EXISTS idx_imports_source_emitido_em
  ON imports (source, emitido_em DESC);
