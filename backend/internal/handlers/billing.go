package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"kitchenai-backend/internal/middleware"
	"kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/config"
)

// BillingHandler serves Razorpay subscription checkout endpoints.
type BillingHandler struct {
	billing *services.BillingService
	cfg     config.RazorpayConfig
}

func NewBillingHandler(billing *services.BillingService, cfg config.RazorpayConfig) *BillingHandler {
	return &BillingHandler{billing: billing, cfg: cfg}
}

func (h *BillingHandler) billingEnabled(w http.ResponseWriter) bool {
	if h.billing == nil || !h.cfg.Enabled() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "billing_unavailable",
			"message": "Checkout is not configured. Set RAZORPAY_ENV and matching API keys.",
		})
		return false
	}
	return true
}

// GetBillingConfig returns public Razorpay settings and plan catalog.
func (h *BillingHandler) GetBillingConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"enabled":      h.cfg.Enabled(),
			"razorpay_env": h.cfg.Env,
			"key_id":       h.cfg.KeyID,
			"currency":     h.cfg.BillingCurrency,
			"plans":        services.PlanCatalog(),
		})
	}
}

// ListPlans returns purchasable subscription SKUs.
func (h *BillingHandler) ListPlans() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"plans": services.PlanCatalog()})
	}
}

// QuoteSubscribe returns proration breakdown for a plan change.
func (h *BillingHandler) QuoteSubscribe() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.billingEnabled(w) {
			return
		}
		session := middleware.GetAuthSession(r)
		if session == nil || session.User == nil {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
		var in services.SubscribeOrderInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		q, err := h.billing.QuoteSubscription(session.User.UserID, in)
		if err != nil {
			writeBillingError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(q)
	}
}

// CreateSubscribeOrder starts checkout for a tier + interval.
func (h *BillingHandler) CreateSubscribeOrder() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.billingEnabled(w) {
			return
		}
		session := middleware.GetAuthSession(r)
		if session == nil || session.User == nil {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
		var in services.SubscribeOrderInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		out, err := h.billing.CreateSubscriptionOrder(
			session.User.UserID, session.User.Email, session.User.Name, in)
		if err != nil {
			writeBillingError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}
}

// VerifySubscribePayment verifies checkout signature and activates the plan.
func (h *BillingHandler) VerifySubscribePayment() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.billingEnabled(w) {
			return
		}
		session := middleware.GetAuthSession(r)
		if session == nil || session.User == nil {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
		var in services.VerifyCheckoutInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		log.Printf("[billing] verify user=%s order=%s", session.User.UserID, in.RazorpayOrderID)
		if err := h.billing.VerifySubscriptionPayment(session.User.UserID, in); err != nil {
			writeBillingError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"status": "active", "is_pro": true})
	}
}

// SyncSubscribePayment confirms payment with Razorpay and activates if captured.
func (h *BillingHandler) SyncSubscribePayment() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.billingEnabled(w) {
			return
		}
		session := middleware.GetAuthSession(r)
		if session == nil || session.User == nil {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}
		var in struct {
			OrderID string `json:"order_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&in)

		var active bool
		var err error
		if strings.TrimSpace(in.OrderID) != "" {
			log.Printf("[billing] sync user=%s order=%s", session.User.UserID, in.OrderID)
			active, err = h.billing.SyncSubscriptionOrder(session.User.UserID, in.OrderID)
		} else {
			log.Printf("[billing] sync-latest user=%s", session.User.UserID)
			active, err = h.billing.SyncLatestSubscriptionOrder(session.User.UserID)
		}
		if err != nil {
			writeBillingError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if active {
			json.NewEncoder(w).Encode(map[string]interface{}{"status": "active", "is_pro": true})
			return
		}
		w.WriteHeader(http.StatusPaymentRequired)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "payment_pending",
			"is_pro":  false,
			"message": "Payment not completed yet on Razorpay. Finish checkout or try again shortly.",
		})
	}
}

// RazorpayWebhook handles server-to-server payment notifications (no session auth).
func (h *BillingHandler) RazorpayWebhook() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.cfg.Enabled() {
			http.Error(w, "billing not configured", http.StatusServiceUnavailable)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			http.Error(w, "read body", http.StatusBadRequest)
			return
		}
		sig := r.Header.Get("X-Razorpay-Signature")
		if err := h.billing.HandleWebhook(body, sig); err != nil {
			log.Printf("[razorpay-webhook] %v", err)
			if errors.Is(err, services.ErrInvalidSignature) {
				http.Error(w, "invalid signature", http.StatusUnauthorized)
				return
			}
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}

func writeBillingError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	switch {
	case errors.Is(err, services.ErrBillingNotConfigured):
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "billing_unavailable", "message": err.Error()})
	case errors.Is(err, services.ErrInvalidSignature):
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid_signature", "message": err.Error()})
	case errors.Is(err, services.ErrOrderNotFound):
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "order_not_found", "message": err.Error()})
	default:
		msg := err.Error()
		if strings.Contains(msg, "already on premium") {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "plan_already_active", "message": msg})
			return
		}
		if errors.Is(err, services.ErrOrderAlreadyPaid) {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"status": "active"})
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "billing_error", "message": msg})
	}
}

func formatINR(paise int) string {
	rupees := paise / 100
	p := paise % 100
	if p == 0 {
		return "₹" + itoa(rupees)
	}
	return "₹" + itoa(rupees) + "." + pad2(p)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func pad2(n int) string {
	if n < 10 {
		return "0" + itoa(n)
	}
	return itoa(n)
}
