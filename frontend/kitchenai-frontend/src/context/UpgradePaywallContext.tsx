import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { UpgradePaywallModal } from '../components/UpgradePaywallModal';

export type UpgradePaywallSource = 'locked_meal' | 'bill_scan' | 'profile' | 'diet_analysis';

export type UpgradePaywallPreferredTier = 'pro' | 'elite';
export type UpgradePaywallPreferredInterval = 'monthly' | 'yearly';

export type UpgradePaywallOptions = {
  source?: UpgradePaywallSource;
  mealCategoryId?: string;
  /** Overrides source-based defaults when set explicitly. */
  preferredTier?: UpgradePaywallPreferredTier;
  preferredInterval?: UpgradePaywallPreferredInterval;
};

type UpgradePaywallContextValue = {
  openUpgrade: (options?: UpgradePaywallOptions) => void;
};

const UpgradePaywallContext = createContext<UpgradePaywallContextValue | null>(null);

export const upgradePaywallRef: { current: UpgradePaywallContextValue | null } = { current: null };

export function UpgradePaywallProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<UpgradePaywallOptions>({});

  const openUpgrade = useCallback((opts?: UpgradePaywallOptions) => {
    setOptions(opts ?? { source: 'locked_meal' });
    setVisible(true);
  }, []);

  const close = useCallback(() => setVisible(false), []);

  const value: UpgradePaywallContextValue = { openUpgrade };

  useEffect(() => {
    upgradePaywallRef.current = value;
    return () => {
      upgradePaywallRef.current = null;
    };
  }, [value]);

  return (
    <UpgradePaywallContext.Provider value={value}>
      {children}
      <UpgradePaywallModal visible={visible} options={options} onClose={close} />
    </UpgradePaywallContext.Provider>
  );
}

export function useUpgradePaywall() {
  const ctx = useContext(UpgradePaywallContext);
  if (!ctx) {
    throw new Error('useUpgradePaywall must be used within UpgradePaywallProvider');
  }
  return ctx;
}
