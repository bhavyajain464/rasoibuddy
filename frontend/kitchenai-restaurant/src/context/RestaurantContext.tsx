import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { restaurantFetch } from '../services/api';
import { KitchenRef } from '../types';
import { useAuth } from './AuthContext';

type RestaurantContextValue = {
  kitchen: KitchenRef | null;
  loading: boolean;
  refreshKitchen: () => Promise<void>;
  setKitchen: (k: KitchenRef | null) => void;
};

const RestaurantContext = createContext<RestaurantContextValue>({
  kitchen: null,
  loading: true,
  refreshKitchen: async () => {},
  setKitchen: () => {},
});

export function useRestaurant() {
  return useContext(RestaurantContext);
}

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [kitchen, setKitchen] = useState<KitchenRef | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshKitchen = useCallback(async () => {
    if (!user) {
      setKitchen(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await restaurantFetch<KitchenRef[]>('/restaurant/kitchens');
      setKitchen(list[0] ?? null);
    } catch {
      setKitchen(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshKitchen();
  }, [refreshKitchen]);

  return (
    <RestaurantContext.Provider value={{ kitchen, loading, refreshKitchen, setKitchen }}>
      {children}
    </RestaurantContext.Provider>
  );
}
