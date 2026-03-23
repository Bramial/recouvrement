
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_client TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  pays TEXT CHECK (pays IN ('PT', 'FR')),
  conditions_paiement TEXT DEFAULT 'comptant',
  exclusion_relance BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE factures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  numero_facture TEXT NOT NULL,
  type_document TEXT CHECK (type_document IN ('FACT', 'NDEB', 'NCRE', 'REC')),
  montant NUMERIC(12,2) NOT NULL,
  date_emission DATE NOT NULL,
  date_echeance DATE NOT NULL,
  solde_restant NUMERIC(12,2),
  statut TEXT DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'payee', 'litige', 'pertes_profits')),
  source TEXT CHECK (source IN ('PT', 'FR')),
  mois_extraction TEXT,
  premiere_apparition DATE,
  derniere_apparition DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE actions_relance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id UUID REFERENCES factures(id),
  client_id UUID REFERENCES clients(id),
  type_action TEXT CHECK (type_action IN ('email_j7', 'appel_j15', 'mise_en_demeure_j30')),
  date_prevue DATE NOT NULL,
  date_executee DATE,
  statut TEXT DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'fait', 'ignore', 'reporte')),
  contenu_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rapports_quotidiens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_rapport DATE NOT NULL UNIQUE,
  total_creances NUMERIC(12,2),
  total_en_retard NUMERIC(12,2),
  nb_factures_en_cours INTEGER,
  nb_actions_jour INTEGER,
  nb_emails_j7 INTEGER,
  nb_appels_j15 INTEGER,
  nb_mises_en_demeure_j30 INTEGER,
  factures_payees_depuis_dernier TEXT,
  nouvelles_factures TEXT,
  resume_ia TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_fichier TEXT NOT NULL,
  source TEXT CHECK (source IN ('PT', 'FR')),
  mois TEXT NOT NULL,
  date_import TIMESTAMPTZ DEFAULT now(),
  nb_lignes_brutes INTEGER,
  nb_lignes_parsees INTEGER,
  statut TEXT DEFAULT 'ok' CHECK (statut IN ('ok', 'erreur', 'partiel')),
  erreurs TEXT
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions_relance ENABLE ROW LEVEL SECURITY;
ALTER TABLE rapports_quotidiens ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_clients" ON clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_update_clients" ON clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_insert_clients" ON clients FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_select_factures" ON factures FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_update_factures" ON factures FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_insert_factures" ON factures FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_select_actions" ON actions_relance FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_update_actions" ON actions_relance FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_insert_actions" ON actions_relance FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_select_rapports" ON rapports_quotidiens FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_rapports" ON rapports_quotidiens FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_select_imports" ON imports FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_imports" ON imports FOR INSERT TO authenticated WITH CHECK (true);
