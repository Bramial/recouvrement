import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertTriangle, Copy, Send } from 'lucide-react';

interface EmailModalProps {
  action: {
    id: string;
    contenu_email: string | null;
    clients: { nom: string; email: string | null; code_client: string } | null;
    factures: { numero_facture: string } | null;
  };
  onClose: () => void;
  onDone: () => void;
}

export function EmailModal({ action, onClose, onDone }: EmailModalProps) {
  const [content, setContent] = useState(action.contenu_email || '');
  const [sending, setSending] = useState(false);
  const clientEmail = action.clients?.email;

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
        <textarea
          className="w-full border rounded-md p-3 text-sm min-h-[200px] bg-background font-mono"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleCopy}><Copy className="h-3.5 w-3.5 mr-1" /> Copier</Button>
          <Button onClick={handleSend} disabled={!clientEmail || sending}>
            <Send className="h-3.5 w-3.5 mr-1" /> {sending ? 'Envoi...' : 'Envoyer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
