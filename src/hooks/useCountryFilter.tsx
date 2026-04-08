import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type CountryFilter = 'all' | 'FR' | 'PT';

interface CountryFilterContextValue {
  country: CountryFilter;
  setCountry: (c: CountryFilter) => void;
}

const CountryFilterContext = createContext<CountryFilterContextValue>({
  country: 'all',
  setCountry: () => {},
});

const STORAGE_KEY = 'bramial_country_filter';

export function CountryFilterProvider({ children }: { children: ReactNode }) {
  const [country, setCountryState] = useState<CountryFilter>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored === 'FR' || stored === 'PT') ? stored : 'all';
  });

  const setCountry = (c: CountryFilter) => {
    setCountryState(c);
    localStorage.setItem(STORAGE_KEY, c);
  };

  return (
    <CountryFilterContext.Provider value={{ country, setCountry }}>
      {children}
    </CountryFilterContext.Provider>
  );
}

export function useCountryFilter() {
  return useContext(CountryFilterContext);
}
