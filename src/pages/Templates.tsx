import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { renderTemplate, TEMPLATE_VARIABLES, type TemplateContext } from '@/lib/templateRenderer';

interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  type_action: 'email_j7' | 'mise_en_demeure_j30';
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const TYPE_LABELS: Record<EmailTemplate['type_action'], string> = {
  email_j7: 'Email J+7',
  mise_en_demeure_j30: 'Mise en demeure',
};

interface SampleData {
  facture: NonNullable<TemplateContext['facture']>;
  client: NonNullable<TemplateContext['client']>;
}

export default function Templates() {
  const { canWrite } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [sample, setSample] = useState<SampleData | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('type_action')
      .order('is_default', { ascending: false })
      .order('name');
    if (error) toast.error('Erreur de chargement');
    setTemplates((data || []) as EmailTemplate[]);
    setLoading(false);
  };

  const loadSample = async () => {
    // Première facture en_cours d'un client non-interne pour la prévisualisation
    const { data } = await supabase
      .from('factures')
      .select('numero_facture, montant, solde_restant, date_echeance, clients(nom, code_client, conditions_paiement, client_interne)')
      .eq('statut', 'en_cours')
      .in('type_document', ['FACT', 'NDEB'])
      .limit(20);
    const row = (data || []).find((r: any) => !r.clients?.client_interne) ?? data?.[0];
    if (!row) return;
    setSample({
      facture: {
        numero_facture: row.numero_facture,
        montant: row.montant,
        solde_restant: row.solde_restant,
        date_echeance: row.date_echeance,
      },
      client: {
        nom: (row as any).clients?.nom ?? '',
        code_client: (row as any).clients?.code_client ?? '',
        conditions_paiement: (row as any).clients?.conditions_paiement ?? null,
      },
    });
  };

  useEffect(() => {
    load();
    loadSample();
  }, []);

  const grouped = useMemo(() => {
    const m: Record<string, EmailTemplate[]> = { email_j7: [], mise_en_demeure_j30: [] };
    for (const t of templates) {
      (m[t.type_action] ??= []).push(t);
    }
    return m;
  }, [templates]);

  const startNew = () => {
    setIsNew(true);
    setEditing({
      id: '', name: '', description: '', type_action: 'email_j7',
      body: '', is_default: false, created_at: '', updated_at: '',
    });
  };

  const startEdit = (t: EmailTemplate) => {
    setIsNew(false);
    setEditing({ ...t });
  };

  const closeEditor = () => { setEditing(null); setIsNew(false); };

  const remove = async (t: EmailTemplate) => {
    if (!confirm(`Supprimer le template "${t.name}" ?`)) return;
    const { error } = await supabase.from('email_templates').delete().eq('id', t.id);
    if (error) { toast.error('Erreur suppression'); return; }
    toast.success('Template supprimé');
    load();
  };

  const setDefault = async (t: EmailTemplate) => {
    // Démarquer le default existant pour ce type, puis marquer celui-ci.
    await supabase.from('email_templates').update({ is_default: false })
      .eq('type_action', t.type_action).eq('is_default', true);
    const { error } = await supabase.from('email_templates').update({ is_default: true }).eq('id', t.id);
    if (error) { toast.error('Erreur'); return; }
    toast.success(`"${t.name}" défini par défaut`);
    load();
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates d'emails</h1>
          <p className="text-sm text-muted-foreground">Modèles utilisés pour les emails de relance — variables `{`{{client_nom}}, {{facture_montant}}, …`}`</p>
        </div>
        {canWrite && (
          <Button onClick={startNew}>
            <Plus className="h-4 w-4 mr-1" /> Nouveau template
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>
      ) : (
        <div className="space-y-6">
          {(['email_j7', 'mise_en_demeure_j30'] as const).map((typeAction) => (
            <Card key={typeAction}>
              <CardHeader>
                <CardTitle className="text-base">{TYPE_LABELS[typeAction]} ({grouped[typeAction]?.length ?? 0})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(grouped[typeAction] ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Aucun template.</p>
                ) : grouped[typeAction].map(t => (
                  <div key={t.id} className="border rounded-md p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{t.name}</span>
                        {t.is_default && (
                          <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 border-blue-200">Par défaut</Badge>
                        )}
                      </div>
                      {t.description && <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>}
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 whitespace-pre-line">{t.body}</p>
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-1 shrink-0">
                        {!t.is_default && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDefault(t)} title="Définir par défaut">
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(t)} title="Éditer">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(t)} title="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditor
          template={editing}
          isNew={isNew}
          sample={sample}
          onClose={closeEditor}
          onSaved={() => { closeEditor(); load(); }}
        />
      )}
    </div>
  );
}

function TemplateEditor({ template, isNew, sample, onClose, onSaved }: {
  template: EmailTemplate;
  isNew: boolean;
  sample: SampleData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? '');
  const [typeAction, setTypeAction] = useState<EmailTemplate['type_action']>(template.type_action);
  const [body, setBody] = useState(template.body);
  const [isDefault, setIsDefault] = useState(template.is_default);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (varName: string) => {
    const ta = bodyRef.current;
    const token = `{{${varName}}}`;
    if (!ta) {
      setBody((b) => b + token);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const preview = useMemo(() => {
    if (!sample) return body;
    return renderTemplate(body, sample);
  }, [body, sample]);

  const save = async () => {
    if (!name.trim() || !body.trim()) { toast.error('Nom et corps requis'); return; }
    setSaving(true);
    if (isNew) {
      // Si on crée avec is_default=true, démarquer l'ancien default
      if (isDefault) {
        await supabase.from('email_templates').update({ is_default: false })
          .eq('type_action', typeAction).eq('is_default', true);
      }
      const { error } = await supabase.from('email_templates').insert({
        name: name.trim(),
        description: description.trim() || null,
        type_action: typeAction,
        body,
        is_default: isDefault,
      });
      if (error) { toast.error('Erreur création : ' + error.message); setSaving(false); return; }
      toast.success('Template créé');
    } else {
      // Si on passe is_default à true et qu'il y a déjà un autre default, démarquer
      if (isDefault && !template.is_default) {
        await supabase.from('email_templates').update({ is_default: false })
          .eq('type_action', typeAction).eq('is_default', true);
      }
      const { error } = await supabase.from('email_templates').update({
        name: name.trim(),
        description: description.trim() || null,
        type_action: typeAction,
        body,
        is_default: isDefault,
      }).eq('id', template.id);
      if (error) { toast.error('Erreur mise à jour : ' + error.message); setSaving(false); return; }
      toast.success('Template mis à jour');
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Nouveau template' : 'Éditer le template'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: J+7 standard" />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optionnel)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="À quoi sert ce template ?" />
            </div>
            <div className="space-y-1.5">
              <Label>Type d'action</Label>
              <Select value={typeAction} onValueChange={(v) => setTypeAction(v as EmailTemplate['type_action'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email_j7">Email J+7</SelectItem>
                  <SelectItem value="mise_en_demeure_j30">Mise en demeure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} id="tmpl-default" />
              <Label htmlFor="tmpl-default" className="text-sm">Définir comme template par défaut pour ce type</Label>
            </div>

            <div className="space-y-1.5 pt-2">
              <Label>Variables disponibles</Label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map(v => (
                  <Button
                    key={v.name}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => insertVariable(v.name)}
                    title={v.description}
                  >
                    {`{{${v.name}}}`}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <Label>Corps du message</Label>
              <textarea
                ref={bodyRef}
                className="w-full border rounded-md p-3 text-sm min-h-[260px] bg-background font-mono"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={`Bonjour {{client_nom}},\n\nVotre facture {{facture_numero}} d'un montant de {{facture_montant}}…`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Aperçu</Label>
            {sample ? (
              <p className="text-xs text-muted-foreground">
                Prévisualisé avec : <span className="font-medium">{sample.client.nom}</span>, facture {sample.facture.numero_facture}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Aucune facture en cours pour la prévisualisation — les variables resteront affichées telles quelles.</p>
            )}
            <div className="border rounded-md p-3 text-sm bg-muted/30 whitespace-pre-line min-h-[260px]">
              {preview || <span className="text-muted-foreground">— vide —</span>}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving || !name.trim() || !body.trim()}>
            {saving ? 'Enregistrement...' : (isNew ? 'Créer' : 'Mettre à jour')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
