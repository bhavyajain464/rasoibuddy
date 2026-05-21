import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as api from '../services/api';
import { CheckoutOrderResponse } from '../types';
import { openRazorpayCheckout } from '../utils/razorpayCheckout';
import { useEntitlements } from '../context/EntitlementsContext';
import { showAppError, showAppInfo, showAppSuccess } from '../utils/alertMessage';

type CheckoutOutcome =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'failed' | 'unconfirmed' };

async function completeCheckout(order: CheckoutOrderResponse): Promise<CheckoutOutcome> {
  try {
    const payment = await openRazorpayCheckout(order);
    await api.verifySubscribePayment(payment);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'Payment cancelled') {
      return { ok: false, reason: 'cancelled' };
    }
    try {
      const synced = await api.syncSubscribeOrder(order.order_id);
      if (synced.is_pro) return { ok: true };
    } catch {
      /* sync is best-effort after Razorpay errors */
    }
    if (
      msg.includes('Payment failed') ||
      msg.includes('International') ||
      msg.includes('Razorpay')
    ) {
      return { ok: false, reason: 'failed' };
    }
    return { ok: false, reason: 'unconfirmed' };
  }
}

export function usePlanUpgrade() {
  const { entitlements, isPro, refresh } = useEntitlements();
  const [busy, setBusy] = useState(false);

  const subscribe = useCallback(
    async (planTier: string, planInterval: string) => {
      if (Platform.OS !== 'web') {
        showAppInfo('Subscriptions are available in the web app for now.');
        return;
      }
      setBusy(true);
      try {
        const config = await api.getBillingConfig();
        if (!config.enabled) {
          showAppError('Checkout is not available yet. Please try again later.');
          return;
        }
        const order = await api.createSubscribeOrder(planTier, planInterval);
        const outcome = await completeCheckout(order);
        if (!outcome.ok) {
          if (outcome.reason === 'cancelled' || outcome.reason === 'failed') {
            return;
          }
          showAppInfo(
            'If you completed payment, tap Sync payment below to activate your plan.',
          );
          return;
        }
        await refresh();
        const creditNote =
          order.credit_paise && order.credit_paise > 0
            ? ` ${order.credit_summary}`
            : '';
        showAppSuccess(`Your plan is active — ${order.price_label}${creditNote}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upgrade failed';
        if (msg === 'Payment cancelled') return;
        showAppError('Something went wrong with checkout. Please try again.');
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
          showAppSuccess('Your subscription is active.');
        } else {
          showAppInfo('No completed payment found yet.');
        }
      } catch {
        showAppError('Could not sync payment. Try again in a moment.');
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
