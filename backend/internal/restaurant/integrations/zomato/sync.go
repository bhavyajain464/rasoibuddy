package zomato

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

const defaultPollInterval = 5 * time.Minute

type syncJob struct {
	cancel context.CancelFunc
}

type syncManager struct {
	mu   sync.Mutex
	jobs map[string]*syncJob
}

func newSyncManager() *syncManager {
	return &syncManager{jobs: map[string]*syncJob{}}
}

func (m *syncManager) running(kitchenID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.jobs[kitchenID]
	return ok
}

func (m *syncManager) start(s *Service, kitchenID, actorUserID, outletID string, auth *Auth) {
	m.stopLocked(kitchenID)

	ctx, cancel := context.WithCancel(context.Background())
	m.jobs[kitchenID] = &syncJob{cancel: cancel}

	go func() {
		ticker := time.NewTicker(defaultPollInterval)
		defer ticker.Stop()
		defer m.clear(kitchenID)

		deepBackfill := true

		run := func() {
			if err := s.runSyncCycle(ctx, kitchenID, actorUserID, outletID, auth, deepBackfill); err != nil {
				log.Printf("[zomato-sync] kitchen=%s poll failed: %v", kitchenID, err)
				if _, ok := err.(*AuthError); ok {
					_ = s.markLoginRequired(context.Background(), kitchenID, err.Error())
					cancel()
				} else {
					_ = s.RecordPollError(context.Background(), kitchenID, err.Error())
				}
				return
			}
			deepBackfill = false
			row, _ := s.loadSyncRow(context.Background(), kitchenID)
			if row != nil && row.LastSyncMessage.Valid {
				log.Printf("[zomato-sync] kitchen=%s %s", kitchenID, row.LastSyncMessage.String)
			}
		}

		run()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				row, _ := s.loadSyncRow(context.Background(), kitchenID)
				if row == nil || row.Status != StatusRunning {
					return
				}
				if len(row.AuthJSON) > 0 {
					if parsed, err := ParseAuth(row.AuthJSON); err == nil {
						auth = parsed
					}
				}
				run()
			}
		}
	}()
}

func (m *syncManager) stop(kitchenID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopLocked(kitchenID)
}

func (m *syncManager) stopLocked(kitchenID string) {
	if job, ok := m.jobs[kitchenID]; ok {
		job.cancel()
		delete(m.jobs, kitchenID)
	}
}

func (m *syncManager) clear(kitchenID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.jobs, kitchenID)
}

func (s *Service) runSyncCycle(ctx context.Context, kitchenID, actorUserID, outletID string, auth *Auth, deepBackfill bool) error {
	row, err := s.loadSyncRow(ctx, kitchenID)
	if err != nil {
		return err
	}
	if row != nil && len(row.AuthJSON) > 0 {
		if parsed, err := ParseAuth(row.AuthJSON); err == nil {
			auth = parsed
		}
	}
	if auth == nil {
		return &AuthError{Code: "login_required", Message: "Zomato session not configured — import partner cookies in Settings"}
	}

	var orders []FetchedOrder
	var checked int
	if deepBackfill {
		orders, checked, err = s.fetchOrdersDeep(ctx, auth, kitchenID, outletID)
	} else {
		orders, checked, err = s.fetchRecentOrdersForPoll(ctx, auth, kitchenID, outletID)
	}
	if err != nil {
		return err
	}
	result, err := s.IngestOrders(ctx, kitchenID, actorUserID, fetchedToIngest(orders))
	if err != nil {
		return err
	}
	if err := s.markPollSuccess(ctx, kitchenID, checked, result); err != nil {
		return err
	}
	if n, err := s.BackfillPlacedTimes(ctx, kitchenID); err != nil {
		return err
	} else if n > 0 {
		log.Printf("[zomato-sync] kitchen=%s backfilled placed_at on %d orders", kitchenID, n)
	}
	return s.saveAuth(ctx, kitchenID, auth)
}

func (s *Service) saveAuth(ctx context.Context, kitchenID string, auth *Auth) error {
	raw, err := json.Marshal(auth)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		UPDATE zomato_kitchen_sync
		SET auth_json = $2, auth_refreshed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE kitchen_id = $1
	`, kitchenID, string(raw))
	return err
}

func (s *Service) ImportAuth(ctx context.Context, kitchenID string, auth *Auth) error {
	if auth == nil || len(auth.Cookies) == 0 {
		return fmt.Errorf("cookies required")
	}
	raw, err := json.Marshal(auth)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO zomato_kitchen_sync (kitchen_id, status, auth_json, auth_refreshed_at, updated_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT (kitchen_id) DO UPDATE SET
			auth_json = EXCLUDED.auth_json,
			auth_refreshed_at = CURRENT_TIMESTAMP,
			last_error = NULL,
			updated_at = CURRENT_TIMESTAMP
	`, kitchenID, StatusIdle, string(raw))
	return err
}

func (s *Service) VerifyAndImportAuth(ctx context.Context, kitchenID string, auth *Auth) error {
	if err := s.verifyAuth(ctx, auth, ""); err != nil {
		return err
	}
	return s.ImportAuth(ctx, kitchenID, auth)
}
