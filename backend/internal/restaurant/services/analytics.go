package services

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// AnalyticsService handles opt-in cross-restaurant intelligence aggregates (future tier).
type AnalyticsService struct {
	db *sql.DB
}

func NewAnalyticsService(db *sql.DB) *AnalyticsService {
	return &AnalyticsService{db: db}
}

func (s *AnalyticsService) OptIn(ctx context.Context, kitchenID, userID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO analytics_restaurant_opt_in (kitchen_id, opted_in_by)
		VALUES ($1, $2)
		ON CONFLICT (kitchen_id) DO UPDATE SET opted_in_at = CURRENT_TIMESTAMP, opted_in_by = EXCLUDED.opted_in_by
	`, kitchenID, userID)
	return err
}

func (s *AnalyticsService) OptOut(ctx context.Context, kitchenID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM analytics_restaurant_opt_in WHERE kitchen_id = $1`, kitchenID)
	return err
}

func (s *AnalyticsService) IsOptedIn(ctx context.Context, kitchenID string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM analytics_restaurant_opt_in WHERE kitchen_id = $1
	`, kitchenID).Scan(&n)
	return n > 0, err
}

// AggregateDailyUsage rolls up anonymized usage from opted-in kitchens (nightly job / manual trigger).
func (s *AnalyticsService) AggregateDailyUsage(ctx context.Context, day time.Time) error {
	start := day.Truncate(24 * time.Hour)
	end := start.Add(24 * time.Hour)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO analytics_daily_usage (usage_date, food_group, total_delta_qty, sample_count)
		SELECT $1::date,
		       COALESCE(i.food_group, 'other'),
		       SUM(ABS(im.delta_qty)),
		       COUNT(DISTINCT im.kitchen_id)
		FROM inventory_movements im
		JOIN inventory i ON i.item_id = im.item_id
		JOIN analytics_restaurant_opt_in opt ON opt.kitchen_id = im.kitchen_id
		WHERE im.reason = 'order_deduct'
		  AND im.created_at >= $2 AND im.created_at < $3
		GROUP BY COALESCE(i.food_group, 'other')
		ON CONFLICT (usage_date, food_group) DO UPDATE
		SET total_delta_qty = EXCLUDED.total_delta_qty,
		    sample_count = EXCLUDED.sample_count,
		    created_at = CURRENT_TIMESTAMP
	`, start, start, end)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *AnalyticsService) Benchmarks(ctx context.Context, foodGroup string) (map[string]interface{}, error) {
	var totalQty float64
	var sampleCount int
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(AVG(total_delta_qty), 0), COALESCE(MAX(sample_count), 0)
		FROM analytics_daily_usage
		WHERE food_group = $1 AND usage_date >= CURRENT_DATE - INTERVAL '30 days'
	`, foodGroup).Scan(&totalQty, &sampleCount)
	if err != nil {
		return nil, err
	}
	if sampleCount == 0 {
		return nil, fmt.Errorf("insufficient aggregate data")
	}
	return map[string]interface{}{
		"food_group":           foodGroup,
		"avg_daily_usage_30d":  totalQty,
		"restaurant_sample_size": sampleCount,
	}, nil
}
