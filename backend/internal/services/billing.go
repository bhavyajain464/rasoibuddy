package services

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"kitchenai-backend/pkg/config"

	razorpay "github.com/razorpay/razorpay-go"
	rzputils "github.com/razorpay/razorpay-go/utils"
)

var (
	ErrBillingNotConfigured = errors.New("razorpay billing is not configured")
	ErrOrderNotFound        = errors.New("order not found")
	ErrOrderAlreadyPaid     = errors.New("order already paid")
	ErrInvalidSignature     = errors.New("invalid payment signature")
)

// CheckoutOrderResponse is returned to the client to open Razorpay Checkout.
type CheckoutOrderResponse struct {
	KeyID        string `json:"key_id"`
	OrderID      string `json:"order_id"`
	Amount       int    `json:"amount"`
	Currency     string `json:"currency"`
	RazorpayEnv  string `json:"razorpay_env"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	PrefillEmail string `json:"prefill_email,omitempty"`
	PlanTier     string `json:"plan_tier"`
	PlanInterval     string `json:"plan_interval"`
	PriceLabel       string `json:"price_label"`
	ListPricePaise   int    `json:"list_price_paise"`
	CreditPaise      int    `json:"credit_paise"`
	IsUpgrade        bool   `json:"is_upgrade"`
	CreditSummary    string `json:"credit_summary,omitempty"`
}

// SubscribeOrderInput selects which plan SKU to purchase.
type SubscribeOrderInput struct {
	PlanTier     string `json:"plan_tier"`
	PlanInterval string `json:"plan_interval"`
}

// VerifyCheckoutInput is sent after Checkout success.
type VerifyCheckoutInput struct {
	RazorpayOrderID   string `json:"razorpay_order_id"`
	RazorpayPaymentID string `json:"razorpay_payment_id"`
	RazorpaySignature string `json:"razorpay_signature"`
}

// BillingService handles Razorpay subscription checkout.
type BillingService struct {
	db  *sql.DB
	cfg config.RazorpayConfig
}

func NewBillingService(db *sql.DB, cfg config.RazorpayConfig) *BillingService {
	return &BillingService{db: db, cfg: cfg}
}

func (s *BillingService) client() *razorpay.Client {
	return razorpay.NewClient(s.cfg.KeyID, s.cfg.KeySecret)
}

// CreateSubscriptionOrder creates a Razorpay order for the given plan tier + interval.
func (s *BillingService) CreateSubscriptionOrder(userID, email, name string, in SubscribeOrderInput) (CheckoutOrderResponse, error) {
	if !s.cfg.Enabled() {
		return CheckoutOrderResponse{}, ErrBillingNotConfigured
	}
	tier := NormalizeTier(in.PlanTier)
	interval := NormalizeInterval(in.PlanInterval)
	if tier == TierFree || interval == "" {
		return CheckoutOrderResponse{}, errors.New("plan_tier and plan_interval required")
	}
	product, ok := LookupPlanProduct(tier, interval)
	if !ok {
		return CheckoutOrderResponse{}, errors.New("unknown plan")
	}
	if !product.AvailableForPurchase {
		return CheckoutOrderResponse{}, errors.New("plan is not available for purchase yet")
	}

	ent, err := GetEntitlements(s.db, userID)
	if err != nil {
		return CheckoutOrderResponse{}, err
	}
	if ent.IsElite && tier == TierPro {
		return CheckoutOrderResponse{}, errors.New("you already have Elite — Pro is included")
	}

	st := subscriptionStateFromEnt(ent)
	quote := ComputeUpgradeQuote(st, product, time.Now())
	if IsRenewalPath(st, product, time.Now()) {
		// Same plan renewal stacks expiry at full list price.
		quote.IsRenewal = true
		quote.IsUpgrade = false
		quote.CreditPaise = 0
		quote.AmountPaise = product.AmountPaise
	}
	if quote.IsUpgrade && quote.AmountPaise <= 0 {
		return CheckoutOrderResponse{}, errors.New("invalid upgrade amount")
	}
	if !quote.IsUpgrade && !quote.IsRenewal && ent.IsPro {
		return CheckoutOrderResponse{}, errors.New("use upgrade options to change your plan")
	}
	if tierRank(tier) < tierRank(st.Tier) && isSubscriptionActive(st, time.Now()) {
		return CheckoutOrderResponse{}, errors.New("cannot downgrade while your current plan is active")
	}

	shortUser := strings.ReplaceAll(userID, "-", "")
	if len(shortUser) > 8 {
		shortUser = shortUser[:8]
	}
	receipt := formatPlanReceipt(tier, interval, shortUser)
	currency := product.Currency
	if currency == "" {
		currency = s.cfg.BillingCurrency
	}
	chargePaise := quote.AmountPaise
	data := map[string]interface{}{
		"amount":          chargePaise,
		"currency":        currency,
		"receipt":         receipt,
		"payment_capture": 1,
		"notes": map[string]interface{}{
			"user_id":          userID,
			"plan_tier":        tier,
			"plan_interval":    interval,
			"list_price_paise": quote.ListPricePaise,
			"credit_paise":     quote.CreditPaise,
			"is_upgrade":       quote.IsUpgrade,
			"product":          fmt.Sprintf("kitchenai_%s_%s", tier, interval),
		},
	}
	body, err := s.client().Order.Create(data, nil)
	if err != nil {
		return CheckoutOrderResponse{}, fmt.Errorf("razorpay order create: %w", err)
	}
	orderID, _ := body["id"].(string)
	if orderID == "" {
		return CheckoutOrderResponse{}, errors.New("razorpay returned empty order id")
	}

	_, err = s.db.Exec(`
		INSERT INTO razorpay_orders (
			user_id, razorpay_order_id, amount_paise, currency, razorpay_env,
			plan_tier, plan_interval, list_price_paise, credit_paise, is_upgrade
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, userID, orderID, chargePaise, currency, s.cfg.Env, tier, interval,
		quote.ListPricePaise, quote.CreditPaise, quote.IsUpgrade)
	if err != nil {
		return CheckoutOrderResponse{}, err
	}

	title := fmt.Sprintf("Kitchen AI %s", product.DisplayName)
	desc := product.Description
	if quote.CreditPaise > 0 {
		desc = fmt.Sprintf("%s — %s", product.Description, quote.CreditSummary)
	}
	return CheckoutOrderResponse{
		KeyID:          s.cfg.KeyID,
		OrderID:        orderID,
		Amount:         chargePaise,
		Currency:       currency,
		RazorpayEnv:    s.cfg.Env,
		Name:           title,
		Description:    desc,
		PrefillEmail:   email,
		PlanTier:       tier,
		PlanInterval:   interval,
		PriceLabel:     quote.AmountLabel,
		ListPricePaise: quote.ListPricePaise,
		CreditPaise:    quote.CreditPaise,
		IsUpgrade:      quote.IsUpgrade,
		CreditSummary:  quote.CreditSummary,
	}, nil
}

// QuoteSubscription returns proration pricing without creating a Razorpay order.
func (s *BillingService) QuoteSubscription(userID string, in SubscribeOrderInput) (UpgradeQuote, error) {
	ent, err := GetEntitlements(s.db, userID)
	if err != nil {
		return UpgradeQuote{}, err
	}
	tier := NormalizeTier(in.PlanTier)
	interval := NormalizeInterval(in.PlanInterval)
	product, ok := LookupPlanProduct(tier, interval)
	if !ok {
		return UpgradeQuote{}, errors.New("unknown plan")
	}
	return ComputeUpgradeQuote(subscriptionStateFromEnt(ent), product, time.Now()), nil
}

// VerifySubscriptionPayment validates the checkout signature and upgrades the user.
func (s *BillingService) VerifySubscriptionPayment(userID string, in VerifyCheckoutInput) error {
	if !s.cfg.Enabled() {
		return ErrBillingNotConfigured
	}
	orderID := strings.TrimSpace(in.RazorpayOrderID)
	paymentID := strings.TrimSpace(in.RazorpayPaymentID)
	signature := strings.TrimSpace(in.RazorpaySignature)
	if orderID == "" || paymentID == "" || signature == "" {
		return errors.New("missing payment fields")
	}

	params := map[string]interface{}{
		"razorpay_order_id":   orderID,
		"razorpay_payment_id": paymentID,
	}
	if !rzputils.VerifyPaymentSignature(params, signature, s.cfg.KeySecret) {
		return ErrInvalidSignature
	}

	return s.markOrderPaid(userID, orderID, paymentID)
}

// SyncSubscriptionOrder checks Razorpay for a captured payment on this order and upgrades the user.
// Use when checkout succeeds but the browser handler did not call /verify (common on web).
func (s *BillingService) SyncSubscriptionOrder(userID, orderID string) (bool, error) {
	if !s.cfg.Enabled() {
		return false, ErrBillingNotConfigured
	}
	orderID = strings.TrimSpace(orderID)
	if orderID == "" {
		return false, errors.New("order_id required")
	}

	var ownerID, status string
	err := s.db.QueryRow(`
		SELECT user_id::text, status FROM razorpay_orders WHERE razorpay_order_id = $1
	`, orderID).Scan(&ownerID, &status)
	if err == sql.ErrNoRows {
		return false, ErrOrderNotFound
	}
	if err != nil {
		return false, err
	}
	if ownerID != userID {
		return false, ErrOrderNotFound
	}
	if status == "paid" {
		return true, nil
	}

	body, err := s.client().Order.Fetch(orderID, nil, nil)
	if err != nil {
		return false, fmt.Errorf("razorpay order fetch: %w", err)
	}
	amount := razorpayJSONInt(body["amount"])
	amountPaid := razorpayJSONInt(body["amount_paid"])
	orderStatus, _ := body["status"].(string)
	if orderStatus != "paid" && amountPaid < amount {
		return false, nil
	}

	paymentID := firstCapturedPaymentID(s.client(), orderID)
	if paymentID == "" {
		paymentID = "sync_" + orderID
	}
	if err := s.markOrderPaid(userID, orderID, paymentID); err != nil {
		if errors.Is(err, ErrOrderAlreadyPaid) {
			return true, nil
		}
		return false, err
	}
	return true, nil
}

func firstCapturedPaymentID(client *razorpay.Client, orderID string) string {
	resp, err := client.Order.Payments(orderID, nil, nil)
	if err != nil {
		return ""
	}
	items, _ := resp["items"].([]interface{})
	var fallback string
	for _, it := range items {
		p, _ := it.(map[string]interface{})
		if p == nil {
			continue
		}
		st, _ := p["status"].(string)
		id, _ := p["id"].(string)
		if id == "" || st == "failed" {
			continue
		}
		if st == "captured" {
			return id
		}
		if st == "authorized" && fallback == "" {
			fallback = id
		}
	}
	return fallback
}

// SyncLatestSubscriptionOrder syncs any pending Razorpay order that is actually paid (newest first).
func (s *BillingService) SyncLatestSubscriptionOrder(userID string) (bool, error) {
	ent, err := GetEntitlements(s.db, userID)
	if err != nil {
		return false, err
	}
	if ent.IsPro {
		return true, nil
	}
	rows, err := s.db.Query(`
		SELECT razorpay_order_id FROM razorpay_orders
		WHERE user_id = $1 AND status = 'created'
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	var tried bool
	for rows.Next() {
		var orderID string
		if err := rows.Scan(&orderID); err != nil {
			return false, err
		}
		tried = true
		active, err := s.SyncSubscriptionOrder(userID, orderID)
		if err != nil {
			return false, err
		}
		if active {
			return true, nil
		}
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	if !tried {
		return false, nil
	}
	return false, nil
}

func razorpayJSONInt(v interface{}) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	default:
		return 0
	}
}

func (s *BillingService) markOrderPaid(userID, orderID, paymentID string) error {
	var ownerID, status, planTier, planInterval string
	var isUpgrade bool
	err := s.db.QueryRow(`
		SELECT user_id::text, status,
		       COALESCE(plan_tier, 'pro'), COALESCE(plan_interval, 'monthly'),
		       COALESCE(is_upgrade, FALSE)
		FROM razorpay_orders WHERE razorpay_order_id = $1
	`, orderID).Scan(&ownerID, &status, &planTier, &planInterval, &isUpgrade)
	if err == sql.ErrNoRows {
		return ErrOrderNotFound
	}
	if err != nil {
		return err
	}
	if ownerID != userID {
		return ErrOrderNotFound
	}
	if status == "paid" {
		return ErrOrderAlreadyPaid
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		UPDATE razorpay_orders
		SET status = 'paid', razorpay_payment_id = $2, paid_at = NOW()
		WHERE razorpay_order_id = $1 AND status = 'created'
	`, orderID, paymentID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrOrderAlreadyPaid
	}
	if err := activateSubscriptionTx(tx, userID, planTier, planInterval, isUpgrade); err != nil {
		return err
	}
	return tx.Commit()
}

func activateSubscriptionTx(tx *sql.Tx, userID, tier, interval string, isUpgrade bool) error {
	tier = NormalizeTier(tier)
	interval = NormalizeInterval(interval)
	if tier == TierFree || interval == "" {
		tier = TierPro
		interval = IntervalMonthly
	}

	var currentTier string
	var currentExpires sql.NullTime
	err := tx.QueryRow(`
		SELECT COALESCE(plan_tier, 'free'), plan_expires_at FROM users WHERE user_id = $1
	`, userID).Scan(&currentTier, &currentExpires)
	if err != nil {
		return err
	}
	var expPtr *time.Time
	if currentExpires.Valid {
		t := currentExpires.Time
		expPtr = &t
	}
	newTier := ResolveUpgradeTier(NormalizeTier(currentTier), tier)
	var newExpires time.Time
	if isUpgrade {
		newExpires = ReplacePlanExpiry(interval)
	} else {
		newExpires = ExtendPlanExpiry(expPtr, interval)
	}

	_, err = tx.Exec(`
		UPDATE users SET
			plan_tier = $2,
			plan_interval = $3,
			plan_expires_at = $4,
			plan = $2,
			updated_at = CURRENT_TIMESTAMP
		WHERE user_id = $1
	`, userID, newTier, interval, newExpires)
	return err
}

// HandleWebhook processes Razorpay webhook events (payment.captured).
func (s *BillingService) HandleWebhook(body []byte, signature string) error {
	if !s.cfg.Enabled() {
		return ErrBillingNotConfigured
	}
	whSecret := strings.TrimSpace(s.cfg.WebhookSecret)
	if whSecret == "" {
		return errors.New("webhook secret not configured")
	}
	if !rzputils.VerifyWebhookSignature(string(body), signature, whSecret) {
		return ErrInvalidSignature
	}

	var payload struct {
		Event   string `json:"event"`
		Payload struct {
			Payment struct {
				Entity struct {
					ID      string `json:"id"`
					OrderID string `json:"order_id"`
					Status  string `json:"status"`
				} `json:"entity"`
			} `json:"payment"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return err
	}
	if payload.Event != "payment.captured" {
		return nil
	}
	pay := payload.Payload.Payment.Entity
	if pay.Status != "captured" || pay.OrderID == "" || pay.ID == "" {
		return nil
	}

	var userID string
	err := s.db.QueryRow(`
		SELECT user_id::text FROM razorpay_orders
		WHERE razorpay_order_id = $1 AND status = 'created'
	`, pay.OrderID).Scan(&userID)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	return s.markOrderPaid(userID, pay.OrderID, pay.ID)
}
