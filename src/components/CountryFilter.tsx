import { useCountryFilter } from '@/hooks/useCountryFilter';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function CountryFilter() {
  const { country, setCountry } = useCountryFilter();

  return (
    <ToggleGroup
      type="single"
      value={country}
      onValueChange={(v) => { if (v) setCountry(v as 'all' | 'FR' | 'PT'); }}
      variant="outline"
      size="sm"
    >
      <ToggleGroupItem value="all" className="text-xs px-3">Tous</ToggleGroupItem>
      <ToggleGroupItem value="FR" className="text-xs px-3">🇫🇷 FR</ToggleGroupItem>
      <ToggleGroupItem value="PT" className="text-xs px-3">🇵🇹 PT</ToggleGroupItem>
    </ToggleGroup>
  );
}
