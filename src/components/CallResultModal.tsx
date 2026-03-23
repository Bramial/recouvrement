import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface CallResultModalProps {
  action: {
    id: string;
    notes: string | null;
    clients: { nom: string; telephone: string | null } | null;
  };
  onClose: () => void;
  onDone: () => void;
}

export function CallResultModal({ action, onClose, onDone }: CallResultModalProps) {
  const [resultat, setResultat] = useState('');
  const [datePromise, setDatePromise] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const noteParts = [`[Appel] Résultat: ${resultat}`];
    if (datePromise) noteParts.push(`Date promise: ${datePromise}`);
    if (note) noteParts.push(note);
    const fullNote = action.notes ? `${action.notes}\n${noteParts.join(' | ')}` : noteParts.join(' | ');

    await supabase.from('actions_relance').update({
      statut: 'fait',
      date_executee: new Date().toISOString().split('T')[0],
      notes: fullNote,
    }).eq('id', action.id);

    toast.success('Appel enregistré');
    onClose();
    onDone();
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Résultat d'appel — {action.clients?.nom}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Résultat</Label>
            <Select value={resultat} onValueChange={setResultat}>
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="engagement">Engagement de paiement</SelectItem>
                <SelectItem value="litige">Litige</SelectItem>
                <SelectItem value="injoignable">Injoignable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {resultat === 'engagement' && (
            <div className="space-y-2">
              <Label>Date promise</Label>
              <Input type="date" value={datePromise} onChange={(e) => setDatePromise(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label>Note libre</Label>
            <textarea className="w-full border rounded-md p-3 text-sm min-h-[60px] bg-background" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={handleSave} disabled={!resultat || saving}>Enregistrer</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
