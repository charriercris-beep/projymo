import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, isConfigured } from '@/lib/supabase';
import { defaultBrand, mergeBrand, type Brand } from '@/lib/brand';

const BrandContext = createContext<Brand>(defaultBrand);
export const useBrand = () => useContext(BrandContext);

export function BrandProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ['brand'],
    enabled: isConfigured,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'brand').maybeSingle();
      if (error) throw error;
      return data?.value ?? null;
    },
  });
  const brand = useMemo(() => mergeBrand(data), [data]);
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}
