import { useCallback, useEffect, useState } from 'react';
import { restaurantFetch } from '../services/api';
import { CatalogIngredient } from '../types';

export function useIngredientCatalog() {
  const [catalog, setCatalog] = useState<CatalogIngredient[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const items = await restaurantFetch<CatalogIngredient[]>('/restaurant/ingredients');
      setCatalog(items ?? []);
    } catch {
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { catalog, loading, refresh };
}
