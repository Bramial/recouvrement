# Auth setup — gestion des droits

Configuration manuelle Supabase à faire une fois par environnement (dev/prod) pour activer la fonction `manage-users`. Le code et les migrations sont déjà versionnés ; ce qui suit n'est pas reproductible en SQL et doit être fait dans le dashboard.

Aucun email n'est envoyé par Supabase : la création de compte et la réinitialisation de mot de passe se font directement depuis la page `/users`, le mot de passe est généré côté serveur et affiché une seule fois à l'admin qui le transmet à l'utilisateur. Pas besoin de SMTP, de templates email ni de redirect URLs.

## 1. Désactiver les emails Supabase (optionnel mais recommandé)

Dashboard → **Auth → Providers → Email** : décocher *Confirm email* (les comptes sont créés avec `email_confirm: true` côté serveur). Aucun template email n'a besoin d'être configuré.

## 2. Edge function `manage-users`

L'edge function tourne en service_role et bypass RLS. Elle vérifie elle-même que l'appelant est admin via `user_roles`. `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement, aucun secret supplémentaire à configurer.

### Déploiement

```bash
supabase functions deploy manage-users
```

## 3. Premier admin

La migration `20260429180000_bootstrap_admin.sql` insère le rôle `admin` pour `pierre@addeus.ai` si le compte existe. Pour les autres environnements, modifier l'email avant de jouer la migration, ou exécuter manuellement :

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = '<email>';
```

Pour créer ce premier compte, soit créer l'utilisateur depuis le dashboard Supabase (Auth → Users → Add user → "Create new user" avec un mot de passe), soit (si un admin existe déjà) utiliser `/users`.

## 4. Smoke test

1. Login avec le compte admin → la sidebar affiche "Utilisateurs", `/users` est accessible.
2. "Créer un utilisateur" avec rôle `reader` → un mot de passe temporaire s'affiche. Login avec ce mot de passe → OK, redirige sur `/`.
3. En `reader`, tous les boutons d'écriture sont absents (Pertes, Historique, Creances, ClientDetail, RapportDuJour, Clients).
4. Tenter un POST direct sur `actions_relance` via la console DevTools du reader → 403 RLS.
5. Connecté en `reader`, ouvrir le menu Admin → "Mon mot de passe" → en définir un nouveau → re-login avec ce mot de passe → OK.
6. En tant qu'admin, sur `/users`, cliquer l'icône clé sur la ligne du reader → un nouveau mot de passe s'affiche → l'ancien ne fonctionne plus, le nouveau si.
