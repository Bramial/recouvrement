import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ReportModalProps {
  action: { id: string };
  onClose: () => void;
  onDone: () => void;
}

export function ReportModal({ action, onClose, onDone }: ReportModalProps) {
  const [date, setDate] = useState<Date>();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!date) return;
    setSaving(true);
    await supabase.from('actions_relance').update({
      statut: 'reporte',
      date_prevue: format(date, 'yyyy-MM-dd'),
    }).eq('id', action.id);
    toast.success('Action reportée');
    onClose();
    onDone();
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reporter l'action</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-full justify-start text-left', !date && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, 'PPP', { locale: fr }) : 'Choisir une date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={date} onSelect={setDate} disabled={(d) => d < new Date()} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={handleSave} disabled={!date || saving}>Confirmer</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
