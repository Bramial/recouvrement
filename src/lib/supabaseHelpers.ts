import { supabase } from '@/integrations/supabase/client';

export async function getMaxMoisExtraction(): Promise<string | null> {
  const { data } = await supabase
    .from('factures')
    .select('mois_extraction')
    .order('mois_extraction', { ascending: false })
    .limit(1)
    .single();
  return data?.mois_extraction ?? null;
}
