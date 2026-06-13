import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { restaurantFetch } from '../services/api';
import { OutletRef } from '../types';
import { clearActiveKitchenId, loadActiveKitchenId, saveActiveKitchenId } from '../utils/activeKitchenStorage';
import { useAuth } from './AuthContext';

/** Active outlet the user is working in (menu, stock, orders). API still uses kitchen_id in URLs. */
type RestaurantContextValue = {
  outlet: OutletRef | null;
  outlets: OutletRef[];
  /** True when user has multiple outlets and must pick one (no saved preference). */
  needsOutletPick: boolean;
  /** @deprecated Use outlet */
  kitchen: OutletRef | null;
  /** @deprecated Use outlets */
  kitchens: OutletRef[];
  loading: boolean;
  refreshKitchen: (opts?: { silent?: boolean }) => Promise<void>;
  setKitchen: (k: OutletRef | null) => void;
  switchKitchen: (outletId: string) => Promise<void>;
  clearOutletPick: () => void;
  /** @deprecated Use switchKitchen */
  switchOutlet: (outletId: string) => Promise<void>;
};

const RestaurantContext = createContext<RestaurantContextValue>({
  outlet: null,
  outlets: [],
  needsOutletPick: false,
  kitchen: null,
  kitchens: [],
  loading: true,
  refreshKitchen: async () => {},
  setKitchen: () => {},
  switchKitchen: async () => {},
  clearOutletPick: () => {},
  switchOutlet: async () => {},
});

export function useRestaurant() {
  return useContext(RestaurantContext);
}

function normalizeOutletRef(row: OutletRef): OutletRef {
  const id = row.outlet_id?.trim() || row.kitchen_id?.trim() || '';
  return { ...row, outlet_id: id, kitchen_id: id };
}

function pickActiveOutlet(list: OutletRef[], preferredId: string | null): OutletRef | null {
  if (list.length === 0) return null;
  if (preferredId) {
    const match = list.find((k) => k.outlet_id === preferredId || k.kitchen_id === preferredId);
    if (match) return match;
  }
  return list[0];
}

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [outlets, setOutlets] = useState<OutletRef[]>([]);
  const [outlet, setOutletState] = useState<OutletRef | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOutletPick, setNeedsOutletPick] = useState(false);

  const applyOutlet = useCallback(async (next: OutletRef | null) => {
    setOutletState(next);
    const id = next?.outlet_id || next?.kitchen_id;
    if (id) {
      await saveActiveKitchenId(id);
    } else {
      await clearActiveKitchenId();
    }
  }, []);

  const refreshKitchen = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) {
      setOutlets([]);
      await applyOutlet(null);
      setLoading(false);
      return;
    }
    if (!opts?.silent) {
      setLoading(true);
    }
    try {
      const list = await restaurantFetch<OutletRef[]>('/restaurant/kitchens');
      const normalized = (list ?? []).map(normalizeOutletRef);
      setOutlets(normalized);
      const storedId = await loadActiveKitchenId();
      const storedMatch = storedId
        ? normalized.find((k) => k.outlet_id === storedId || k.kitchen_id === storedId)
        : undefined;

      if (normalized.length > 1 && !storedMatch) {
        setNeedsOutletPick(true);
        await applyOutlet(null);
        return;
      }

      setNeedsOutletPick(false);
      const active = pickActiveOutlet(normalized, storedId);
      await applyOutlet(active);
    } catch {
      setOutlets([]);
      await applyOutlet(null);
    } finally {
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }, [user, applyOutlet]);

  const setKitchen = useCallback(
    (k: OutletRef | null) => {
      const next = k ? normalizeOutletRef(k) : null;
      void applyOutlet(next);
      if (next) {
        setOutlets((prev) => {
          const id = next.outlet_id;
          if (prev.some((row) => row.outlet_id === id || row.kitchen_id === id)) {
            return prev.map((row) =>
              row.outlet_id === id || row.kitchen_id === id ? { ...row, ...next } : row,
            );
          }
          return [...prev, next];
        });
      }
    },
    [applyOutlet],
  );

  const switchKitchen = useCallback(
    async (outletId: string) => {
      const next = outlets.find((k) => k.outlet_id === outletId || k.kitchen_id === outletId);
      if (!next) return;
      await applyOutlet(next);
      setNeedsOutletPick(false);
    },
    [outlets, applyOutlet],
  );

  const clearOutletPick = useCallback(() => {
    setNeedsOutletPick(false);
  }, []);

  useEffect(() => {
    void refreshKitchen();
  }, [refreshKitchen]);

  return (
    <RestaurantContext.Provider
      value={{
        outlet,
        outlets,
        needsOutletPick,
        kitchen: outlet,
        kitchens: outlets,
        loading,
        refreshKitchen,
        setKitchen,
        switchKitchen,
        clearOutletPick,
        switchOutlet: switchKitchen,
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
}
