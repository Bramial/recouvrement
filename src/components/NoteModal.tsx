import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface NoteModalProps {
  action: { id: string; notes: string | null };
  onClose: () => void;
  onDone: () => void;
}

export function NoteModal({ action, onClose, onDone }: NoteModalProps) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!note.trim()) return;
    setSaving(true);
    const fullNote = action.notes ? `${action.notes}\n${note}` : note;
    await supabase.from('actions_relance').update({ notes: fullNote }).eq('id', action.id);
    toast.success('Note ajoutée');
    onClose();
    onDone();
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter une note</DialogTitle>
        </DialogHeader>
        {action.notes && (
          <div className="text-sm bg-muted rounded-md p-3 max-h-32 overflow-auto whitespace-pre-line">{action.notes}</div>
        )}
        <textarea className="w-full border rounded-md p-3 text-sm min-h-[80px] bg-background" placeholder="Votre note..." value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={!note.trim() || saving}>Enregistrer</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
