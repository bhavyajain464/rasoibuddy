import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

type AppRefreshContextValue = {
  version: number;
  bump: () => void;
};

const AppRefreshContext = createContext<AppRefreshContextValue | null>(null);

export function AppRefreshProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  const value = useMemo(() => ({ version, bump }), [version, bump]);

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
