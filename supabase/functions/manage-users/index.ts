// Edge function admin pour gérer les comptes : lister, inviter, changer rôle,
// supprimer. Tourne en service_role et bypass RLS — donc on vérifie nous-même
// que l'appelant est bien admin avant chaque action.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? '';

type AppRole = 'admin' | 'user' | 'reader';

const VALID_ROLES: AppRole[] = ['admin', 'user', 'reader'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    // Client "as caller" pour récupérer l'identité depuis le JWT.
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) return json({ error: 'Invalid session' }, 401);

    // Client admin (service_role) pour les opérations privilégiées.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Vérifie le rôle admin via user_roles (la fonction has_role est SECURITY DEFINER).
    const { data: roleRow, error: roleErr } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleErr) return json({ error: roleErr.message }, 500);
    if (!roleRow) return json({ error: 'Forbidden: admin role required' }, 403);

    const body = await req.json();
    const action: string = body.action;

    if (action === 'list') {
      const { data: usersList, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (listErr) return json({ error: listErr.message }, 500);
      const userIds = usersList.users.map((u) => u.id);
      const { data: roles, error: rolesErr } = await admin
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);
      if (rolesErr) return json({ error: rolesErr.message }, 500);
      const rolesByUser = new Map<string, AppRole>(
        (roles ?? []).map((r) => [r.user_id as string, r.role as AppRole]),
      );
      const result = usersList.users.map((u) => ({
        id: u.id,
        email: u.email,
        role: rolesByUser.get(u.id) ?? null,
        last_sign_in_at: u.last_sign_in_at,
        created_at: u.created_at,
        invited_at: u.invited_at,
      }));
      return json({ users: result });
    }

    if (action === 'invite') {
      const { email, role } = body as { email?: string; role?: AppRole };
      if (!email || !role || !VALID_ROLES.includes(role)) {
        return json({ error: 'email and a valid role are required' }, 400);
      }
      const redirectTo = APP_URL ? `${APP_URL}/set-password` : undefined;
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      );
      if (inviteErr || !invited.user) return json({ error: inviteErr?.message ?? 'invite failed' }, 500);
      const { error: insErr } = await admin.from('user_roles').insert({
        user_id: invited.user.id,
        role,
      });
      if (insErr) {
        // Rollback partiel : on supprime le user pour rester cohérent.
        await admin.auth.admin.deleteUser(invited.user.id);
        return json({ error: insErr.message }, 500);
      }
      return json({ ok: true, user_id: invited.user.id });
    }

    if (action === 'update_role') {
      const { user_id, role } = body as { user_id?: string; role?: AppRole };
      if (!user_id || !role || !VALID_ROLES.includes(role)) {
        return json({ error: 'user_id and a valid role are required' }, 400);
      }
      if (user_id === caller.id && role !== 'admin') {
        return json({ error: 'Cannot demote yourself' }, 400);
      }
      // Un seul rôle par user côté UI : on remplace.
      const { error: delErr } = await admin.from('user_roles').delete().eq('user_id', user_id);
      if (delErr) return json({ error: delErr.message }, 500);
      const { error: insErr } = await admin.from('user_roles').insert({ user_id, role });
      if (insErr) return json({ error: insErr.message }, 500);
      return json({ ok: true });
    }

    if (action === 'delete') {
      const { user_id } = body as { user_id?: string };
      if (!user_id) return json({ error: 'user_id required' }, 400);
      if (user_id === caller.id) return json({ error: 'Cannot delete yourself' }, 400);
      const { error: delErr } = await admin.auth.admin.deleteUser(user_id);
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unexpected error';
    console.error('manage-users error:', err);
    return json({ error: msg }, 500);
  }
});
