import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { FoodExchange } from '@/types';

interface UseFoodExchangesReturn {
  foods: FoodExchange[];
  loading: boolean;
  error: string | null;
}

export function useFoodExchanges(): UseFoodExchangesReturn {
  const [foods, setFoods] = useState<FoodExchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from('food_exchanges')
      .select('*')
      .order('category', { ascending: true })
      .then(({ data, error: sbError }) => {
        if (cancelled) return;
        if (sbError) {
          setError('خطا در دریافت داده‌های غذایی.');
        } else {
          setFoods((data as FoodExchange[]) ?? []);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { foods, loading, error };
}
