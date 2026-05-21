import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { CheckoutOrderResponse, VerifyCheckoutRequest } from '../types';

type CheckoutSession = {
  order: CheckoutOrderResponse;
  resolve: (value: VerifyCheckoutRequest) => void;
  reject: (reason: Error) => void;
};

/** Used by razorpayCheckout.native when the native SDK is unavailable. */
export const paymentCheckoutRef: {
  current: { openWebCheckout: (order: CheckoutOrderResponse) => Promise<VerifyCheckoutRequest> } | null;
} = { current: null };

function buildCheckoutHtml(order: CheckoutOrderResponse): string {
  const options: Record<string, unknown> = {
    key: order.key_id,
    amount: String(order.amount),
    currency: order.currency,
    name: order.name,
    description: order.description,
    order_id: order.order_id,
    theme: { color: '#2E7D32' },
  };
  if (order.prefill_email) {
    options.prefill = { email: order.prefill_email };
  }
  const json = JSON.stringify(options);
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>body{margin:0;background:#f5f5f5;}</style>
</head>
<body>
  <script src="https://checkout.razorpay.com/v1/checkout.js"><\/script>
  <script>
    (function () {
      var options = ${json};
      options.handler = function (response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, data: response }));
      };
      options.modal = {
        ondismiss: function () {
          window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, cancelled: true }));
        }
      };
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, error: response }));
      });
      rzp.open();
    })();
  <\/script>
</body>
</html>`;
}

const PaymentCheckoutContext = createContext<{
  openWebCheckout: (order: CheckoutOrderResponse) => Promise<VerifyCheckoutRequest>;
} | null>(null);

export function PaymentCheckoutProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<CheckoutSession | null>(null);

  const openWebCheckout = useCallback((order: CheckoutOrderResponse) => {
    return new Promise<VerifyCheckoutRequest>((resolve, reject) => {
      setSession({ order, resolve, reject });
    });
  }, []);

  paymentCheckoutRef.current = { openWebCheckout };

  const close = () => setSession(null);

  const onMessage = (event: WebViewMessageEvent) => {
    if (!session) return;
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        ok?: boolean;
        cancelled?: boolean;
        data?: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        };
        error?: { error?: { description?: string } };
      };
      if (payload.ok && payload.data?.razorpay_payment_id) {
        session.resolve({
          razorpay_order_id: payload.data.razorpay_order_id,
          razorpay_payment_id: payload.data.razorpay_payment_id,
          razorpay_signature: payload.data.razorpay_signature,
        });
        close();
        return;
      }
      if (payload.cancelled) {
        session.reject(new Error('Payment cancelled'));
        close();
        return;
      }
      const desc = payload.error?.error?.description || 'Payment failed';
      session.reject(new Error(desc));
      close();
    } catch {
      session.reject(new Error('Payment failed'));
      close();
    }
  };

  const dismiss = () => {
    session?.reject(new Error('Payment cancelled'));
    close();
  };

  return (
    <PaymentCheckoutContext.Provider value={{ openWebCheckout }}>
      {children}
      <Modal visible={session != null} animationType="slide" onRequestClose={dismiss}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text variant="titleMedium" style={styles.modalTitle}>
              Complete payment
            </Text>
            <IconButton icon="close" onPress={dismiss} />
          </View>
          {session ? (
            <WebView
              source={{ html: buildCheckoutHtml(session.order) }}
              onMessage={onMessage}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              style={styles.webview}
            />
          ) : null}
        </View>
      </Modal>
    </PaymentCheckoutContext.Provider>
  );
}

export function usePaymentCheckout() {
  const ctx = useContext(PaymentCheckoutContext);
  if (!ctx) {
    throw new Error('usePaymentCheckout requires PaymentCheckoutProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { marginLeft: 8, fontWeight: '700' },
  webview: { flex: 1 },
});
