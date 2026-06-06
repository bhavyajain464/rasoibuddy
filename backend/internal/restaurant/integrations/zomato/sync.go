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

func syncJobKey(kitchenID, outletID string) string {
	return kitchenID + ":" + normalizeOutletID(outletID)
}

func (m *syncManager) running(kitchenID, outletID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.jobs[syncJobKey(kitchenID, outletID)]
	return ok
}

func (m *syncManager) start(s *Service, kitchenID, actorUserID, outletID string, auth *Auth) {
	key := syncJobKey(kitchenID, outletID)
	m.stopLocked(key)

	ctx, cancel := context.WithCancel(context.Background())
	m.jobs[key] = &syncJob{cancel: cancel}

	go func() {
		ticker := time.NewTicker(defaultPollInterval)
		defer ticker.Stop()
		defer m.clear(key)

		deepBackfill := true

		run := func() {
			if err := s.runSyncCycle(ctx, kitchenID, actorUserID, outletID, auth, deepBackfill); err != nil {
				log.Printf("[zomato-sync] kitchen=%s outlet=%s poll failed: %v", kitchenID, outletID, err)
				if _, ok := err.(*AuthError); ok {
					_ = s.markLoginRequired(context.Background(), kitchenID, outletID, err.Error())
					cancel()
				} else {
					_ = s.RecordPollError(context.Background(), kitchenID, outletID, err.Error())
				}
				return
			}
			deepBackfill = false
			row, _ := s.loadOutletSyncRow(context.Background(), kitchenID, outletID)
			if row != nil && row.LastSyncMessage.Valid {
				log.Printf("[zomato-sync] kitchen=%s outlet=%s %s", kitchenID, outletID, row.LastSyncMessage.String)
			}
		}

		run()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				row, _ := s.loadOutletSyncRow(context.Background(), kitchenID, outletID)
				if row == nil || row.Status != StatusRunning {
					return
				}
				if parsed, err := s.loadKitchenAuth(context.Background(), kitchenID); err == nil && parsed != nil {
					auth = parsed
				}
				run()
			}
		}
	}()
}

func (m *syncManager) stop(kitchenID, outletID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopLocked(syncJobKey(kitchenID, outletID))
}

func (m *syncManager) stopLocked(key string) {
	if job, ok := m.jobs[key]; ok {
		job.cancel()
		delete(m.jobs, key)
	}
}

func (m *syncManager) clear(key string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.jobs, key)
}

func (s *Service) runSyncCycle(ctx context.Context, kitchenID, actorUserID, outletID string, auth *Auth, deepBackfill bool) error {
	if parsed, err := s.loadKitchenAuth(ctx, kitchenID); err != nil {
		return err
	} else if parsed != nil {
		auth = parsed
	}
	if auth == nil {
		return &AuthError{Code: "login_required", Message: "Zomato session not configured — import partner cookies in Settings"}
	}

	var orders []FetchedOrder
	var checked int
	var err error
	if deepBackfill {
		orders, checked, err = s.fetchOrdersDeep(ctx, auth, kitchenID, outletID)
	} else {
		orders, checked, err = s.fetchRecentOrdersForPoll(ctx, auth, kitchenID, outletID)
	}
	if err != nil {
		return err
	}
	result, err := s.IngestOrders(ctx, kitchenID, outletID, actorUserID, fetchedToIngest(orders))
	if err != nil {
		return err
	}
	if err := s.markPollSuccess(ctx, kitchenID, outletID, checked, result); err != nil {
		return err
	}
	if n, err := s.BackfillPlacedTimes(ctx, kitchenID); err != nil {
		return err
	} else if n > 0 {
		log.Printf("[zomato-sync] kitchen=%s outlet=%s backfilled placed_at on %d orders", kitchenID, outletID, n)
	}
	return s.saveKitchenAuth(ctx, kitchenID, auth)
}

func (s *Service) saveKitchenAuth(ctx context.Context, kitchenID string, auth *Auth) error {
	raw, err := json.Marshal(auth)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO zomato_kitchen_auth (kitchen_id, auth_json, auth_refreshed_at, updated_at)
		VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT (kitchen_id) DO UPDATE SET
			auth_json = EXCLUDED.auth_json,
			auth_refreshed_at = CURRENT_TIMESTAMP,
			updated_at = CURRENT_TIMESTAMP
	`, kitchenID, string(raw))
	return err
}

func (s *Service) ImportAuth(ctx context.Context, kitchenID string, auth *Auth) error {
	if auth == nil || len(auth.Cookies) == 0 {
		return fmt.Errorf("cookies required")
	}
	return s.saveKitchenAuth(ctx, kitchenID, auth)
}

func (s *Service) VerifyAndImportAuth(ctx context.Context, kitchenID string, auth *Auth) error {
	if err := s.verifyAuth(ctx, auth, ""); err != nil {
		return err
	}
	return s.ImportAuth(ctx, kitchenID, auth)
}
