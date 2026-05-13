import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, UserPlus, Loader2, KeyRound, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface ManagedUser {
  id: string;
  email: string | null;
  role: AppRole | null;
  last_sign_in_at: string | null;
  created_at: string | null;
}

const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Admin',
  user: 'Utilisateur',
  reader: 'Lecture seule',
};

const ROLE_BADGE: Record<AppRole, string> = {
  admin: 'bg-badge-danger text-badge-danger-foreground',
  user: 'bg-badge-success text-badge-success-foreground',
  reader: 'bg-badge-info text-badge-info-foreground',
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState<AppRole>('user');
  const [submitting, setSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string; title: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'list' },
    });
    if (error) {
      toast.error(`Chargement: ${error.message}`);
      setLoading(false);
      return;
    }
    setUsers(((data?.users ?? []) as ManagedUser[]).sort((a, b) => (a.email ?? '').localeCompare(b.email ?? '')));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!createEmail.trim()) return;
    setSubmitting(true);
    const email = createEmail.trim();
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'create', email, role: createRole },
    });
    setSubmitting(false);
    if (error || data?.error) {
      toast.error(`Création: ${error?.message ?? data?.error}`);
      return;
    }
    setCreateOpen(false);
    setCreateEmail('');
    setCreateRole('user');
    setCredentials({ email, password: data.password as string, title: 'Compte créé' });
    load();
  };

  const resetPassword = async (u: ManagedUser) => {
    if (!confirm(`Réinitialiser le mot de passe de ${u.email} ?`)) return;
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'reset_password', user_id: u.id },
    });
    if (error || data?.error) {
      toast.error(`Réinitialisation: ${error?.message ?? data?.error}`);
      return;
    }
    setCredentials({ email: u.email ?? '', password: data.password as string, title: 'Nouveau mot de passe' });
  };

  const updateRole = async (userId: string, role: AppRole) => {
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'update_role', user_id: userId, role },
    });
    if (error || data?.error) {
      toast.error(`Mise à jour: ${error?.message ?? data?.error}`);
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    toast.success('Rôle mis à jour');
  };

  const remove = async (u: ManagedUser) => {
    if (!confirm(`Supprimer ${u.email} ? Cette action est irréversible.`)) return;
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'delete', user_id: u.id },
    });
    if (error || data?.error) {
      toast.error(`Suppression: ${error?.message ?? data?.error}`);
      return;
    }
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    toast.success('Utilisateur supprimé');
  };

  const copyPassword = async () => {
    if (!credentials) return;
    await navigator.clipboard.writeText(credentials.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const closeCredentials = () => {
    setCredentials(null);
    setCopied(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">Gérez les comptes et leurs droits d'accès.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Créer un utilisateur
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Comptes ({users.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Chargement…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Rôle</th>
                  <th className="text-left p-3">Dernière connexion</th>
                  <th className="text-left p-3">Créé le</th>
                  <th className="p-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="border-b">
                      <td className="p-3 font-medium">{u.email ?? '—'}{isSelf && <span className="text-xs text-muted-foreground ml-2">(vous)</span>}</td>
                      <td className="p-3">
                        {u.role ? (
                          <Select value={u.role} onValueChange={(v) => updateRole(u.id, v as AppRole)} disabled={isSelf}>
                            <SelectTrigger className="w-40 h-8">
                              <SelectValue>
                                <Badge className={ROLE_BADGE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                              <SelectItem value="user">{ROLE_LABEL.user}</SelectItem>
                              <SelectItem value="reader">{ROLE_LABEL.reader}</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">aucun rôle</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('fr-FR') : 'jamais'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          {!isSelf && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => resetPassword(u)}
                              title="Réinitialiser le mot de passe"
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                          )}
                          {!isSelf && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(u)}
                              title="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer un utilisateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Un mot de passe temporaire sera généré et affiché une seule fois. Communiquez-le à l'utilisateur, il pourra le modifier après connexion.
            </p>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="prenom.nom@addeus.ai"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={createRole} onValueChange={(v) => setCreateRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{ROLE_LABEL.admin} — peut tout faire dont gérer les users</SelectItem>
                  <SelectItem value="user">{ROLE_LABEL.user} — peut tout faire sauf gérer les users</SelectItem>
                  <SelectItem value="reader">{ROLE_LABEL.reader} — accès en lecture uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button onClick={create} disabled={!createEmail.trim() || submitting}>
              {submitting ? 'Création…' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!credentials} onOpenChange={(open) => { if (!open) closeCredentials(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{credentials?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              Mot de passe pour <span className="font-medium">{credentials?.email}</span>. Copiez-le maintenant — il ne sera plus jamais affiché.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-md bg-muted font-mono text-sm select-all">
                {credentials?.password}
              </code>
              <Button size="icon" variant="outline" onClick={copyPassword} title="Copier">
                {copied ? <Check className="h-4 w-4 text-badge-success-foreground" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={closeCredentials}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
