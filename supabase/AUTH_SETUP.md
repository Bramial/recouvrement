# Auth setup — gestion des droits

Configuration manuelle Supabase à faire une fois par environnement (dev/prod) pour activer le flow d'invitation, le reset mot de passe et la fonction `manage-users`. Le code et les migrations sont déjà versionnés ; ce qui suit n'est pas reproductible en SQL et doit être fait dans le dashboard.

## 1. Resend (SMTP transactionnel)

Le SMTP par défaut de Supabase est limité à ~3 emails/heure et n'est pas autorisé en prod. On utilise Resend.

1. Créer un compte sur [resend.com](https://resend.com), vérifier le domaine d'envoi (DNS records SPF + DKIM). Domaine recommandé : `bramial.pt` ou un sous-domaine type `mail.bramial.pt`.
2. Générer une API key dans Resend → Settings → API Keys.
3. Dans Supabase dashboard → **Project Settings → Auth → SMTP Settings** :
   - Enable Custom SMTP : **on**
   - Sender email : `auth@bramial.pt` (ou ce qu'on a vérifié)
   - Sender name : `Bramial`
   - Host : `smtp.resend.com`
   - Port : `465`
   - Username : `resend`
   - Password : la clé API Resend
4. Sauvegarder, puis envoyer un test via **Auth → Templates → Send test email**.

## 2. URL Configuration

Dashboard → **Auth → URL Configuration** :
- Site URL : URL du frontend (ex : `https://collect.bramial.pt`)
- Redirect URLs : ajouter
  - `https://collect.bramial.pt/update-password`
  - `https://collect.bramial.pt/set-password`
  - `http://localhost:8080/update-password` (dev)
  - `http://localhost:8080/set-password` (dev)

Sans ces redirect URLs, les liens des emails de reset/invite seront refusés.

## 3. Email templates

Dashboard → **Auth → Email Templates** — personnaliser au minimum `Reset Password` et `Invite User` en français. Le `{{ .ConfirmationURL }}` reste le placeholder par défaut.

## 4. Edge function `manage-users`

L'edge function tourne en service_role et bypass RLS. Elle vérifie elle-même que l'appelant est admin via `user_roles`.

### Variables d'environnement (Supabase)

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement. Ajouter manuellement :

```
APP_URL=https://collect.bramial.pt
```

Dashboard → **Edge Functions → manage-users → Secrets**.

`APP_URL` sert de redirect dans le lien d'invitation. Si absent, Supabase prend le Site URL.

### Déploiement

```bash
supabase functions deploy manage-users
```

## 5. Premier admin

La migration `20260429180000_bootstrap_admin.sql` insère le rôle `admin` pour `pierre@addeus.ai` si le compte existe. Pour les autres environnements, modifier l'email avant de jouer la migration, ou exécuter manuellement :

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = '<email>';
```

## 6. Smoke test

1. Login avec le compte admin → la sidebar affiche "Utilisateurs", `/users` est accessible.
2. Inviter un user `reader` → l'email Resend arrive, le lien ouvre `/set-password`, on définit le mdp, on est redirigé sur `/`.
3. En `reader`, tous les boutons d'écriture sont absents (Pertes, Historique, Creances, ClientDetail, RapportDuJour, Clients).
4. Tenter un POST direct sur `actions_relance` via la console DevTools du reader → 403 RLS.
5. `/login` → "Mot de passe oublié" → email arrive, lien ouvre `/update-password`, le nouveau mdp fonctionne.
