-- Bootstrap : pierre@addeus.ai est admin. Idempotent — passe en no-op si le
-- compte n'existe pas encore (premier déploiement avant signup) ou si la
-- ligne user_roles est déjà là.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'pierre@addeus.ai'
ON CONFLICT (user_id, role) DO NOTHING;
