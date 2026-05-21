import { CheckoutOrderResponse, VerifyCheckoutRequest } from '../types';

type RazorpayFailureResponse = {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    step?: string;
    source?: string;
  };
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (response: RazorpayFailureResponse) => void) => void;
    };
  }
}

let scriptLoading: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) {
    return Promise.resolve();
  }
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-razorpay-checkout]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.dataset.razorpayCheckout = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Razorpay checkout script'));
    document.body.appendChild(s);
  });
  return scriptLoading;
}

const INDIA_TEST_CARD_HINT =
  'Use Indian test card 5267 3181 8797 5449 (not 4111…). Any future expiry, any CVV, OTP 123456 (4+ digits). Or pay via UPI in checkout.';

function formatRazorpayFailure(response: RazorpayFailureResponse): string {
  const e = response?.error;
  const desc = (e?.description || '').toLowerCase();
  if (desc.includes('international')) {
    return `International cards are disabled on this Razorpay account. ${INDIA_TEST_CARD_HINT}`;
  }
  if (!e) return `Payment failed. ${INDIA_TEST_CARD_HINT}`;
  const parts = [e.description, e.reason, e.code].filter(Boolean);
  const base = parts.length ? parts.join(' — ') : 'Payment failed';
  return `${base}. ${INDIA_TEST_CARD_HINT}`;
}

export async function openRazorpayCheckout(
  order: CheckoutOrderResponse,
): Promise<VerifyCheckoutRequest> {
  await loadRazorpayScript();
  if (!window.Razorpay) {
    throw new Error('Razorpay is not available');
  }

  return new Promise((resolve, reject) => {
    const options: Record<string, unknown> = {
      key: order.key_id,
      amount: String(order.amount),
      currency: order.currency,
      name: order.name,
      description: order.description,
      order_id: order.order_id,
      theme: { color: '#2E7D32' },
      handler: (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        resolve({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled')),
      },
    };
    if (order.prefill_email) {
      options.prefill = { email: order.prefill_email };
    }
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (response) => {
      console.error('[razorpay] payment.failed', response);
      reject(new Error(formatRazorpayFailure(response)));
    });
    rzp.open();
  });
}
