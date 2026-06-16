import { useEffect, useState } from 'react';
import { lookupDish } from '../services/api';
import type { DishLookupResponse } from '../types';

const lookupCache = new Map<string, DishLookupResponse>();

function cacheKey(dishId?: string | null, dishName?: string | null): string {
  const id = dishId?.trim();
  if (id) return `id:${id}`;
  const name = dishName?.trim().toLowerCase();
  return name ? `name:${name}` : '';
}

/**
 * Resolves a catalog dish id (and optional image URLs) from the backend when only a name is known.
 */
export function useResolvedDish(
  dishId?: string | null,
  dishName?: string | null,
): { dishId: string | null; imageUrls?: DishLookupResponse['image_urls']; loading: boolean } {
  const trimmedId = dishId?.trim() ?? '';
  const [resolved, setResolved] = useState<DishLookupResponse | null>(() => {
    if (trimmedId) return { id: trimmedId, name: dishName?.trim() ?? '', meal_types: [], cuisine: '', cook_time_mins: 0 };
    const key = cacheKey(dishId, dishName);
    return key ? lookupCache.get(key) ?? null : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (trimmedId) {
      setResolved({
        id: trimmedId,
        name: dishName?.trim() ?? '',
        meal_types: [],
        cuisine: '',
        cook_time_mins: 0,
      });
      return;
    }
    const key = cacheKey(dishId, dishName);
    if (!key) {
      setResolved(null);
      return;
    }
    const cached = lookupCache.get(key);
    if (cached) {
      setResolved(cached);
      return;
    }

    let active = true;
    setLoading(true);
    void lookupDish({ name: dishName ?? undefined })
      .then((hit) => {
        if (!active) return;
        lookupCache.set(key, hit);
        lookupCache.set(`id:${hit.id}`, hit);
        setResolved(hit);
      })
      .catch(() => {
        if (active) setResolved(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [trimmedId, dishId, dishName]);

  return {
    dishId: resolved?.id ?? (trimmedId || null),
    imageUrls: resolved?.image_urls,
    loading,
  };
}
