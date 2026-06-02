import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

/** Which screens should react to a global refresh bump. */
export type AppRefreshScope = 'inventory' | 'shopping' | 'all';

type AppRefreshContextValue = {
  version: number;
  scope: AppRefreshScope;
  bump: (scope?: AppRefreshScope) => void;
};

const AppRefreshContext = createContext<AppRefreshContextValue | null>(null);

export function AppRefreshProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const [scope, setScope] = useState<AppRefreshScope>('all');
  const bump = useCallback((nextScope: AppRefreshScope = 'all') => {
    setScope(nextScope);
    setVersion((v) => v + 1);
  }, []);

  const value = useMemo(() => ({ version, scope, bump }), [version, scope, bump]);

  return (
    <AppRefreshContext.Provider value={value}>
      {children}
    </AppRefreshContext.Provider>
  );
}

export function useAppRefresh() {
  const ctx = useContext(AppRefreshContext);
  if (!ctx) {
    throw new Error('useAppRefresh must be used within AppRefreshProvider');
  }
  return ctx;
}

export function refreshAppliesTo(
  eventScope: AppRefreshScope,
  listener: AppRefreshScope | AppRefreshScope[],
): boolean {
  const targets = Array.isArray(listener) ? listener : [listener];
  if (targets.includes('all')) return true;
  return eventScope === 'all' || targets.includes(eventScope);
}
