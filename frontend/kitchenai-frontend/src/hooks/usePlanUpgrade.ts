import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as api from '../services/api';
import { CheckoutOrderResponse } from '../types';
import { openRazorpayCheckout } from '../utils/razorpayCheckout';
import { useEntitlements } from '../context/EntitlementsContext';

async function completeCheckout(order: CheckoutOrderResponse) {
  try {
    const payment = await openRazorpayCheckout(order);
    await api.verifySubscribePayment(payment);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'Payment cancelled') {
      throw e;
    }
    const synced = await api.syncSubscribeOrder(order.order_id);
    return synced.is_pro;
  }
}

export function usePlanUpgrade() {
  const { entitlements, isPro, refresh } = useEntitlements();
  const [busy, setBusy] = useState(false);

  const subscribe = useCallback(
    async (planTier: string, planInterval: string) => {
      if (Platform.OS !== 'web') {
        Alert.alert(
          'Upgrade on web',
          'Subscriptions are available in the web app for now.',
        );
        return;
      }
      setBusy(true);
      try {
        const config = await api.getBillingConfig();
        if (!config.enabled) {
          throw new Error('Checkout is not configured on the server yet.');
        }
        const order = await api.createSubscribeOrder(planTier, planInterval);
        const ok = await completeCheckout(order);
        if (!ok) {
          throw new Error('Payment not confirmed. Try sync or contact support.');
        }
        await refresh();
        const creditNote =
          order.credit_paise && order.credit_paise > 0
            ? `\n\n${order.credit_summary}`
            : '';
        window.alert(`Your plan is now active: ${order.price_label}${creditNote}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upgrade failed';
        if (msg === 'Payment cancelled') return;
        window.alert(msg);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const startUpgrade = useCallback(() => subscribe('pro', 'monthly'), [subscribe]);

  const syncLastPayment = useCallback(
    async () => {
      if (Platform.OS !== 'web') return;
      setBusy(true);
      try {
        const synced = await api.syncSubscribeOrder('');
        await refresh();
        if (synced.is_pro) {
          window.alert('Your subscription is now active.');
        } else {
          window.alert('No completed payment found for your pending orders.');
        }
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Sync failed');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const planLabel = () => {
    if (!entitlements?.is_pro) return 'Free';
    const tier = entitlements.is_elite ? 'Elite' : 'Pro';
    const interval =
      entitlements.plan_interval === 'yearly' ? 'Yearly' : entitlements.plan_interval === 'monthly' ? 'Monthly' : '';
    return interval ? `${tier} · ${interval}` : tier;
  };

  return {
    subscribe,
    startUpgrade,
    syncLastPayment,
    busy,
    isPro,
    entitlements,
    planLabel,
  };
}
