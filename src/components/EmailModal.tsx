import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertTriangle, Copy, Send, CheckCircle } from 'lucide-react';
import { renderTemplate } from '@/lib/templateRenderer';

interface EmailModalProps {
  action: {
    id: string;
    type_action: string;
    contenu_email: string | null;
    clients: {
      nom: string;
      email: string | null;
      code_client: string;
      conditions_paiement?: string | null;
    } | null;
    factures: {
      numero_facture: string;
      montant?: number | null;
      solde_restant?: number | null;
      date_echeance?: string | null;
    } | null;
  };
  onClose: () => void;
  onDone: () => void;
}

interface TemplateRow {
  id: string;
  name: string;
  body: string;
  is_default: boolean;
  type_action: string;
}

export function EmailModal({ action, onClose, onDone }: EmailModalProps) {
  const [content, setContent] = useState(action.contenu_email || '');
  const [sending, setSending] = useState(false);
  const [marking, setMarking] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const clientEmail = action.clients?.email;

  const ctx = useMemo(() => ({
    facture: action.factures ?? undefined,
    client: action.clients ?? undefined,
  }), [action]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('email_templates')
        .select('id, name, body, is_default, type_action')
        .eq('type_action', action.type_action)
        .order('is_default', { ascending: false })
        .order('name');
      if (cancelled) return;
      setTemplates((data || []) as TemplateRow[]);
      // Si la modal s'ouvre sans contenu et qu'il y a un default, pré-remplir avec le template rendu
      if (!action.contenu_email && data && data.length > 0) {
        const def = data.find((t: any) => t.is_default) as TemplateRow | undefined;
        if (def) {
          setContent(renderTemplate(def.body, ctx));
          setSelectedTemplateId(def.id);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.id, action.type_action]);

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (!t) return;
    setContent(renderTemplate(t.body, ctx));
  };

  const handleSend = async () => {
    if (!clientEmail) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-relance-email', {
        body: { actionId: action.id, to: clientEmail, subject: `Relance facture ${action.factures?.numero_facture}`, body: content },
      });
      if (error) throw error;
      await supabase.from('actions_relance').update({ statut: 'fait', date_executee: new Date().toISOString().split('T')[0], contenu_email: content }).eq('id', action.id);
      toast.success('Email envoyé');
      onClose();
      onDone();
    } catch (err: any) {
      toast.error('Erreur envoi: ' + (err.message || 'Inconnue'));
    } finally {
      setSending(false);
    }
  };

  const handleMarkManual = async () => {
    setMarking(true);
    try {
      const { error } = await supabase.from('actions_relance').update({
        statut: 'fait',
        date_executee: new Date().toISOString().split('T')[0],
        contenu_email: content,
      }).eq('id', action.id);
      if (error) throw error;
      toast.success('Action marquée comme envoyée manuellement');
      onClose();
      onDone();
    } catch (err: any) {
      toast.error('Erreur: ' + (err.message || 'Inconnue'));
    } finally {
      setMarking(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    toast.success('Copié dans le presse-papier');
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email de relance — {action.clients?.nom}</DialogTitle>
        </DialogHeader>
        {!clientEmail && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-badge-warning/10 text-badge-warning text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Email client manquant. <a href={`/clients`} className="underline">Renseigner l'email</a></span>
          </div>
        )}
        {clientEmail && <p className="text-sm text-muted-foreground">À : {clientEmail}</p>}

        {templates.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Template</Label>
            <Select value={selectedTemplateId} onValueChange={applyTemplate}>
              <SelectTrigger><SelectValue placeholder="Choisir un template..." /></SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{t.is_default ? ' (défaut)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <textarea
          className="w-full border rounded-md p-3 text-sm min-h-[200px] bg-background font-mono"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="flex justify-end gap-2 flex-wrap">
          <Button variant="outline" onClick={handleCopy}><Copy className="h-3.5 w-3.5 mr-1" /> Copier</Button>
          <Button variant="outline" onClick={handleMarkManual} disabled={marking}>
            <CheckCircle className="h-3.5 w-3.5 mr-1" /> {marking ? '...' : 'Marquer envoyé manuellement'}
          </Button>
          <Button onClick={handleSend} disabled={!clientEmail || sending}>
            <Send className="h-3.5 w-3.5 mr-1" /> {sending ? 'Envoi...' : 'Envoyer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
