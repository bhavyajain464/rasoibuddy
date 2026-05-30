import { Alert, Platform } from 'react-native';
import { showAppInfo } from './alertMessage';
import {
  upgradePaywallRef,
  type UpgradePaywallOptions,
} from '../context/UpgradePaywallContext';
import { openProfile } from '../navigation/rootNavigation';

type UpgradeNavigation = {
  navigate: (screen: string, params?: { upgradePlan?: boolean }) => void;
};

/** Opens the focused Pro paywall sheet (falls back to Profile if provider missing). */
export function navigateToUpgradePlan(
  navigation?: UpgradeNavigation,
  options?: UpgradePaywallOptions,
) {
  if (upgradePaywallRef.current) {
    upgradePaywallRef.current.openUpgrade(options ?? { source: 'locked_meal' });
    return;
  }
  openProfile({ upgradePlan: true });
}

export function showUpgradeMessage(message: string, onUpgrade?: () => void) {
  if (onUpgrade) {
    onUpgrade();
    return;
  }
  if (upgradePaywallRef.current) {
    upgradePaywallRef.current.openUpgrade({ source: 'bill_scan' });
    return;
  }
  const full = `${message} Pro unlocks unlimited bill scans and all meal categories.`;
  if (Platform.OS === 'web') {
    showAppInfo(full);
    return;
  }
  Alert.alert('Upgrade to Pro', full);
}
