import { useCallback, useEffect, useState } from 'react';
import { restaurantFetch } from '../services/api';
import { CatalogIngredient } from '../types';

let cachedCatalog: CatalogIngredient[] | null = null;
let cachePromise: Promise<CatalogIngredient[]> | null = null;

async function loadCatalog(): Promise<CatalogIngredient[]> {
  if (cachedCatalog) return cachedCatalog;
  if (!cachePromise) {
    cachePromise = restaurantFetch<CatalogIngredient[]>('/restaurant/ingredients')
      .then((items) => {
        cachedCatalog = items ?? [];
        return cachedCatalog;
      })
      .catch(() => {
        cachePromise = null;
        return [] as CatalogIngredient[];
      });
  }
  return cachePromise;
}

/** Shared home-kitchen ingredient catalog (Postgres), via restaurant API. */
export function useIngredientCatalog() {
  const [catalog, setCatalog] = useState<CatalogIngredient[]>(cachedCatalog ?? []);
  const [loading, setLoading] = useState(!cachedCatalog);

  const refresh = useCallback(async () => {
    cachedCatalog = null;
    cachePromise = null;
    setLoading(true);
    try {
      const items = await loadCatalog();
      setCatalog(items);
    } catch {
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedCatalog) {
      setCatalog(cachedCatalog);
      setLoading(false);
      return;
    }
    void refresh();
  }, [refresh]);

  return { catalog, loading, refresh };
}
