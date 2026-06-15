package services

import (
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"time"

	"kitchenai-backend/pkg/config"
)

const dietDigestTimezone = "Asia/Kolkata"

// DietAnalysisSettings is the user's diet email preference.
type DietAnalysisSettings struct {
	Eligible        bool   `json:"eligible"`
	EmailEnabled    bool   `json:"email_enabled"`
	Email           string `json:"email,omitempty"`
	SMTPConfigured  bool   `json:"smtp_configured"`
	DeliveryHour    int    `json:"delivery_hour"`
	DeliveryTZ      string `json:"delivery_timezone"`
	DeliverySummary string `json:"delivery_summary"`
}

// DietDigestService sends nightly meal summaries by email.
type DietDigestService struct {
	db         *sql.DB
	cookedLog  *CookedLogService
	cfg        *config.Config
}

func NewDietDigestService(db *sql.DB, cooked *CookedLogService, cfg *config.Config) *DietDigestService {
	return &DietDigestService{db: db, cookedLog: cooked, cfg: cfg}
}

func (s *DietDigestService) GetSettings(ctx context.Context, userID string) (DietAnalysisSettings, error) {
	ent, err := GetEntitlements(s.db, userID)
	if err != nil {
		return DietAnalysisSettings{}, err
	}
	var enabled bool
	var email string
	err = s.db.QueryRowContext(ctx, `
		SELECT diet_analysis_email_enabled, email
		FROM users WHERE user_id = $1
	`, userID).Scan(&enabled, &email)
	if err != nil {
		return DietAnalysisSettings{}, err
	}
	return DietAnalysisSettings{
		Eligible:        ent.HasDietAnalysis,
		EmailEnabled:    enabled,
		Email:           email,
		SMTPConfigured:  s.cfg.SMTPConfigured(),
		DeliveryHour:    1,
		DeliveryTZ:      dietDigestTimezone,
		DeliverySummary: "Detailed PDF report with nutrients, charts, and AI analysis — around 1:00 AM IST",
	}, nil
}

func (s *DietDigestService) SetEmailEnabled(ctx context.Context, userID string, enabled bool) error {
	ent, err := GetEntitlements(s.db, userID)
	if err != nil {
		return err
	}
	if enabled && !ent.HasDietAnalysis {
		return fmt.Errorf("diet analysis requires an Elite plan")
	}
	_, err = s.db.ExecContext(ctx, `
		UPDATE users SET diet_analysis_email_enabled = $2, updated_at = CURRENT_TIMESTAMP
		WHERE user_id = $1
	`, userID, enabled)
	return err
}

// ListEatenForDate returns eaten log rows for a calendar date (YYYY-MM-DD).
func (s *CookedLogService) ListEatenForDate(ctx context.Context, userID, dateISO string) ([]CookedLogEntry, error) {
	userID = strings.TrimSpace(userID)
	dateISO = strings.TrimSpace(dateISO)
	if userID == "" || dateISO == "" {
		return nil, fmt.Errorf("user_id and date required")
	}
	day, err := time.Parse("2006-01-02", dateISO)
	if err != nil {
		return nil, fmt.Errorf("invalid date")
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, dish_name, dish_id, cooked_on, meal_slot, portions, source, COALESCE(notes, ''), created_at
		FROM cooked_log
		WHERE user_id = $1 AND cooked_on = $2
		ORDER BY created_at ASC
	`, userID, day)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CookedLogEntry
	for rows.Next() {
		var e CookedLogEntry
		var cookedOn time.Time
		var createdAt time.Time
		var dishID sql.NullString
		if err := rows.Scan(&e.ID, &e.DishName, &dishID, &cookedOn, &e.MealSlot, &e.Portions, &e.Source, &e.Notes, &createdAt); err != nil {
			return nil, err
		}
		e.CookedOn = cookedOn.Format("2006-01-02")
		e.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		if dishID.Valid {
			e.DishID = &dishID.String
		}
		out = append(out, e)
	}
	return filterEatenEntries(out), rows.Err()
}

func (s *DietDigestService) BuildDigestBody(dateISO string, entries []CookedLogEntry, report *DietDayReport) (subject, plain, html string) {
	subject = fmt.Sprintf("Rasoibuddy — diet report for %s", dateISO)
	if len(entries) == 0 {
		plain = fmt.Sprintf("You did not log any meals for %s.\n\nLog meals in Rasoibuddy → Meals → History & Diet to receive a detailed PDF nutrition report.\n", dateISO)
		html = fmt.Sprintf("<p>You did not log any meals for <strong>%s</strong>.</p><p>Log meals in <strong>Rasoibuddy → Meals → History &amp; Diet</strong> to receive your PDF nutrition report.</p>", dateISO)
		return subject, plain, html
	}

	var b strings.Builder
	var hb strings.Builder
	if report != nil {
		b.WriteString(report.Summary + "\n\n")
		hb.WriteString("<p>" + htmlEscape(report.Summary) + "</p>")
		t := report.Totals
		stats := fmt.Sprintf(
			"Estimated totals: %.0f kcal · Protein %.0fg · Carbs %.0fg · Fat %.0fg · Fiber %.1fg",
			t.CaloriesKcal, t.ProteinG, t.CarbsG, t.FatG, t.FiberG,
		)
		b.WriteString(stats + "\n\n")
		hb.WriteString("<p><strong>" + htmlEscape(stats) + "</strong></p>")
		if report.BalanceScore > 0 {
			score := fmt.Sprintf("Balance score: %d/100", report.BalanceScore)
			b.WriteString(score + "\n\n")
			hb.WriteString("<p>" + htmlEscape(score) + "</p>")
		}
		b.WriteString("See the attached PDF for charts (macro split, calories by meal) and micronutrient notes.\n\n")
		hb.WriteString("<p>📎 <strong>Attached PDF</strong> includes macro charts, per-meal breakdown, and micronutrient highlights.</p>")
	} else {
		b.WriteString(fmt.Sprintf("Meals logged on %s:\n\n", dateISO))
		hb.WriteString(fmt.Sprintf("<h2>Meals logged on %s</h2><ul>", dateISO))
	}
	b.WriteString("Meals logged:\n")
	hb.WriteString("<h3>Meals logged</h3><ul>")
	for _, e := range entries {
		line := e.DishName
		if e.MealSlot != "" {
			line += " (" + e.MealSlot + ")"
		}
		if e.Notes != "" {
			line += " — " + e.Notes
		}
		b.WriteString("• " + line + "\n")
		hb.WriteString("<li><strong>" + htmlEscape(e.DishName) + "</strong>")
		if e.MealSlot != "" {
			hb.WriteString(" <em>(" + htmlEscape(e.MealSlot) + ")</em>")
		}
		if e.Notes != "" {
			hb.WriteString(" — " + htmlEscape(e.Notes))
		}
		hb.WriteString("</li>")
	}
	hb.WriteString("</ul>")
	b.WriteString("\nEstimates are based on typical Indian home-cooked portions from your meal names.\n")
	hb.WriteString("<p style=\"color:#666;font-size:12px\">Not medical advice. Log any dish — names do not need to be from our catalog.</p>")
	return subject, b.String(), hb.String()
}

func htmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

func (s *DietDigestService) SendDigestEmail(to, subject, plain, html string, pdf []byte) error {
	if !s.cfg.SMTPConfigured() {
		return fmt.Errorf("email is not configured on the server (set SMTP_HOST, SMTP_FROM)")
	}
	from := formatRFC5322From(s.cfg.SMTPFrom)
	envelopeFrom := smtpEnvelopeAddress(s.cfg.SMTPFrom)
	var msg string
	if len(pdf) > 0 {
		msg = buildMIMEEmailWithPDF(from, to, subject, plain, html, pdf, "kitchen-ai-diet-report.pdf")
	} else {
		msg = buildMIMEEmail(from, to, subject, plain, html)
	}
	addr := fmt.Sprintf("%s:%d", s.cfg.SMTPHost, s.cfg.SMTPPort)
	var auth smtp.Auth
	if s.cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, s.cfg.SMTPHost)
	}
	return smtp.SendMail(addr, auth, envelopeFrom, []string{to}, []byte(msg))
}

// formatRFC5322From quotes display names that contain spaces (Gmail rejects bare "Rasoibuddy <...>").
func formatRFC5322From(from string) string {
	from = strings.TrimSpace(from)
	if from == "" {
		return from
	}
	if strings.Contains(from, `"`) {
		return from
	}
	i := strings.Index(from, "<")
	if i <= 0 {
		return from
	}
	name := strings.TrimSpace(from[:i])
	addr := strings.TrimSpace(from[i:])
	if name == "" || strings.ContainsAny(name, " \t") {
		return fmt.Sprintf(`"%s" %s`, strings.ReplaceAll(name, `"`, `\"`), addr)
	}
	return from
}

func smtpEnvelopeAddress(from string) string {
	from = strings.TrimSpace(from)
	if i := strings.LastIndex(from, "<"); i >= 0 {
		if j := strings.LastIndex(from, ">"); j > i {
			return strings.TrimSpace(from[i+1 : j])
		}
	}
	return from
}

func buildMIMEEmailWithPDF(from, to, subject, plain, html string, pdf []byte, filename string) string {
	altBoundary := "kitchenai-alt"
	mixedBoundary := "kitchenai-mixed"
	var msg strings.Builder
	msg.WriteString(fmt.Sprintf("From: %s\r\n", from))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=%s\r\n\r\n", mixedBoundary))

	msg.WriteString(fmt.Sprintf("--%s\r\n", mixedBoundary))
	msg.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=%s\r\n\r\n", altBoundary))
	msg.WriteString(fmt.Sprintf("--%s\r\n", altBoundary))
	msg.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
	msg.WriteString(plain)
	msg.WriteString("\r\n")
	msg.WriteString(fmt.Sprintf("--%s\r\n", altBoundary))
	msg.WriteString("Content-Type: text/html; charset=UTF-8\r\n\r\n")
	msg.WriteString(html)
	msg.WriteString("\r\n")
	msg.WriteString(fmt.Sprintf("--%s--\r\n\r\n", altBoundary))

	msg.WriteString(fmt.Sprintf("--%s\r\n", mixedBoundary))
	msg.WriteString(fmt.Sprintf("Content-Type: application/pdf; name=\"%s\"\r\n", filename))
	msg.WriteString("Content-Transfer-Encoding: base64\r\n")
	msg.WriteString(fmt.Sprintf("Content-Disposition: attachment; filename=\"%s\"\r\n\r\n", filename))
	msg.WriteString(encodeBase64Lines(pdf))
	msg.WriteString("\r\n")
	msg.WriteString(fmt.Sprintf("--%s--\r\n", mixedBoundary))
	return msg.String()
}

func encodeBase64Lines(data []byte) string {
	raw := base64.StdEncoding.EncodeToString(data)
	const lineLen = 76
	var b strings.Builder
	for i := 0; i < len(raw); i += lineLen {
		end := i + lineLen
		if end > len(raw) {
			end = len(raw)
		}
		b.WriteString(raw[i:end])
		b.WriteString("\r\n")
	}
	return b.String()
}

func buildMIMEEmail(from, to, subject, plain, html string) string {
	boundary := "kitchenai-diet-boundary"
	var msg strings.Builder
	msg.WriteString(fmt.Sprintf("From: %s\r\n", from))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=%s\r\n\r\n", boundary))
	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
	msg.WriteString(plain)
	msg.WriteString("\r\n")
	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/html; charset=UTF-8\r\n\r\n")
	msg.WriteString(html)
	msg.WriteString("\r\n")
	msg.WriteString(fmt.Sprintf("--%s--\r\n", boundary))
	return msg.String()
}

// SendDigestForUser emails one user's meals for dateISO if not already sent.
func (s *DietDigestService) SendDigestForUser(ctx context.Context, userID, dateISO string) error {
	var enabled bool
	var email string
	var lastSent sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT diet_analysis_email_enabled, email, diet_analysis_last_sent_date
		FROM users WHERE user_id = $1
	`, userID).Scan(&enabled, &email, &lastSent)
	if err != nil {
		return err
	}
	if !enabled || strings.TrimSpace(email) == "" {
		return nil
	}
	ent, err := GetEntitlements(s.db, userID)
	if err != nil {
		return err
	}
	if !ent.HasDietAnalysis {
		return nil
	}
	if lastSent.Valid && lastSent.Time.Format("2006-01-02") == dateISO {
		return nil
	}

	entries, err := s.cookedLog.ListEatenForDate(ctx, userID, dateISO)
	if err != nil {
		return err
	}

	var report *DietDayReport
	var pdf []byte
	if len(entries) > 0 {
		var displayName string
		_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(NULLIF(TRIM(name), ''), '') FROM users WHERE user_id = $1`, userID).Scan(&displayName)
		prefs, _ := LoadUserPrefs(s.db, userID)
		report, err = GroqDietDayReport(ctx, s.cfg, dateISO, entries, prefs, displayName)
		if err != nil {
			return fmt.Errorf("diet analysis: %w", err)
		}
		pdf, err = BuildDietReportPDF(report)
		if err != nil {
			return fmt.Errorf("diet report PDF: %w", err)
		}
		log.Printf("[diet-digest] generated PDF user=%s date=%s bytes=%d", userID, dateISO, len(pdf))
	}

	subject, plain, html := s.BuildDigestBody(dateISO, entries, report)
	if err := s.SendDigestEmail(email, subject, plain, html, pdf); err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		UPDATE users SET diet_analysis_last_sent_date = $2::date, updated_at = CURRENT_TIMESTAMP
		WHERE user_id = $1
	`, userID, dateISO)
	return err
}

type dietDigestRecipient struct {
	UserID string
}

func (s *DietDigestService) listRecipients(ctx context.Context) ([]dietDigestRecipient, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT user_id::text FROM users
		WHERE diet_analysis_email_enabled = TRUE
		  AND COALESCE(plan_tier, 'free') = 'elite'
		  AND plan_expires_at IS NOT NULL
		  AND plan_expires_at > NOW()
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dietDigestRecipient
	for rows.Next() {
		var r dietDigestRecipient
		if err := rows.Scan(&r.UserID); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// RunNightlyDigests sends yesterday's summary at the scheduled hour (1 AM IST).
func (s *DietDigestService) RunNightlyDigests(ctx context.Context) {
	if !s.cfg.SMTPConfigured() {
		return
	}
	loc, err := time.LoadLocation(dietDigestTimezone)
	if err != nil {
		loc = time.FixedZone("IST", 5*3600+30*60)
	}
	now := time.Now().In(loc)
	if now.Hour() != 1 {
		return
	}
	// Summary for the calendar day that just ended.
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")

	recipients, err := s.listRecipients(ctx)
	if err != nil {
		log.Printf("[diet-digest] list recipients: %v", err)
		return
	}
	for _, r := range recipients {
		if err := s.SendDigestForUser(ctx, r.UserID, yesterday); err != nil {
			log.Printf("[diet-digest] send user=%s date=%s: %v", r.UserID, yesterday, err)
		}
	}
}

// StartNightlyDigestScheduler runs the 1 AM IST job.
func StartNightlyDigestScheduler(svc *DietDigestService) {
	if svc == nil || !svc.cfg.SMTPConfigured() {
		log.Printf("[diet-digest] nightly email disabled (configure SMTP_* env vars)")
		return
	}
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			svc.RunNightlyDigests(context.Background())
		}
	}()
	log.Printf("[diet-digest] scheduler started (%d:00 %s, previous day's meals)", 1, dietDigestTimezone)
}
