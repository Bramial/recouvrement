-- Templates d'emails de relance — un catalogue éditable par l'utilisateur (admin/user)
-- avec un default par type_action utilisé par défaut dans EmailModal.
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type_action TEXT NOT NULL CHECK (type_action IN ('email_j7','mise_en_demeure_j30')),
  body TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un seul default par type_action — l'index unique garantit l'invariant côté DB
CREATE UNIQUE INDEX email_templates_default_per_type
  ON public.email_templates (type_action) WHERE is_default = true;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_templates" ON public.email_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_templates" ON public.email_templates
  FOR INSERT TO authenticated WITH CHECK (public.can_write());
CREATE POLICY "update_templates" ON public.email_templates
  FOR UPDATE TO authenticated USING (public.can_write());
CREATE POLICY "delete_templates" ON public.email_templates
  FOR DELETE TO authenticated USING (public.can_write());

CREATE OR REPLACE FUNCTION public.touch_email_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER email_templates_set_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_email_templates_updated_at();
