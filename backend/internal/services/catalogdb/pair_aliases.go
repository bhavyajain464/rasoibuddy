package catalogdb

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
)

var (
	pairLabelCache     map[string]PairRef
	pairLabelCacheOnce sync.Once
	pairLabelCacheErr  error
	pairLabelCacheMu   sync.RWMutex
)

// PairLabelAliasRow is one pair_label_aliases record.
type PairLabelAliasRow struct {
	Label      string      `json:"label"`
	TargetKind PairRefKind `json:"target_kind"`
	TargetID   string      `json:"target_id"`
}

// BootstrapPairLabelAliases seeds built-in defaults when the table is empty.
func BootstrapPairLabelAliases(ctx context.Context, conn *sql.DB) (int, error) {
	if conn == nil {
		return 0, fmt.Errorf("catalogdb: no database connection")
	}
	var n int
	if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM pair_label_aliases`).Scan(&n); err != nil {
		return 0, err
	}
	if n > 0 {
		return 0, nil
	}
	inserted := 0
	for label, ref := range pairLabelDefaults {
		if err := upsertPairLabelAlias(ctx, conn, label, ref.Kind, ref.ID); err != nil {
			return inserted, err
		}
		inserted++
	}
	InvalidatePairLabelCache()
	return inserted, nil
}

// LoadPairLabelRegistry reads all pair label aliases from Postgres.
func LoadPairLabelRegistry(ctx context.Context, conn *sql.DB) (map[string]PairRef, error) {
	if conn == nil {
		return nil, fmt.Errorf("catalogdb: no database connection")
	}
	rows, err := conn.QueryContext(ctx, `
		SELECT label, target_kind, target_id FROM pair_label_aliases ORDER BY label
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]PairRef{}
	for rows.Next() {
		var label, kind, id string
		if err := rows.Scan(&label, &kind, &id); err != nil {
			return nil, err
		}
		label = strings.TrimSpace(label)
		id = strings.TrimSpace(id)
		if label == "" || id == "" {
			continue
		}
		out[label] = PairRef{Kind: PairRefKind(kind), ID: id}
	}
	return out, rows.Err()
}

// CachedPairLabelRegistry loads pair aliases once per process (invalidated on writes).
func CachedPairLabelRegistry(ctx context.Context) (map[string]PairRef, error) {
	if db == nil {
		return pairLabelDefaultsCopy(), nil
	}
	pairLabelCacheMu.RLock()
	if pairLabelCache != nil {
		defer pairLabelCacheMu.RUnlock()
		return pairLabelCache, nil
	}
	pairLabelCacheMu.RUnlock()

	pairLabelCacheMu.Lock()
	defer pairLabelCacheMu.Unlock()
	if pairLabelCache != nil {
		return pairLabelCache, nil
	}
	pairLabelCacheOnce.Do(func() {
		pairLabelCache, pairLabelCacheErr = LoadPairLabelRegistry(ctx, db)
		if pairLabelCacheErr != nil {
			return
		}
		if len(pairLabelCache) == 0 {
			pairLabelCache = pairLabelDefaultsCopy()
		}
	})
	return pairLabelCache, pairLabelCacheErr
}

// InvalidatePairLabelCache clears the in-memory pair alias cache.
func InvalidatePairLabelCache() {
	pairLabelCacheMu.Lock()
	defer pairLabelCacheMu.Unlock()
	pairLabelCacheOnce = sync.Once{}
	pairLabelCache = nil
	pairLabelCacheErr = nil
}

// ListPairLabelAliases returns all registered pair label aliases.
func ListPairLabelAliases(ctx context.Context, conn *sql.DB) ([]PairLabelAliasRow, error) {
	if conn == nil {
		return nil, fmt.Errorf("catalogdb: no database connection")
	}
	rows, err := conn.QueryContext(ctx, `
		SELECT label, target_kind, target_id FROM pair_label_aliases ORDER BY label
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PairLabelAliasRow
	for rows.Next() {
		var row PairLabelAliasRow
		var kind string
		if err := rows.Scan(&row.Label, &kind, &row.TargetID); err != nil {
			return nil, err
		}
		row.TargetKind = PairRefKind(kind)
		out = append(out, row)
	}
	return out, rows.Err()
}

// RegisterPairLabelAlias upserts one pairs_with shorthand → catalog id mapping.
func RegisterPairLabelAlias(ctx context.Context, conn *sql.DB, label string, kind PairRefKind, targetID string) error {
	label = strings.TrimSpace(label)
	targetID = strings.TrimSpace(targetID)
	if label == "" || targetID == "" {
		return fmt.Errorf("label and target_id are required")
	}
	if kind != PairRefDish && kind != PairRefIngredient {
		return fmt.Errorf("target_kind must be dish or ingredient")
	}
	if err := validatePairAliasTarget(ctx, conn, kind, targetID); err != nil {
		return err
	}
	if err := upsertPairLabelAlias(ctx, conn, label, kind, targetID); err != nil {
		return err
	}
	InvalidatePairLabelCache()
	return nil
}

// DeletePairLabelAlias removes a registered pair label alias.
func DeletePairLabelAlias(ctx context.Context, conn *sql.DB, label string) (bool, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		return false, fmt.Errorf("label is required")
	}
	res, err := conn.ExecContext(ctx, `DELETE FROM pair_label_aliases WHERE label = $1`, label)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	if n > 0 {
		InvalidatePairLabelCache()
	}
	return n > 0, nil
}

func upsertPairLabelAlias(ctx context.Context, conn *sql.DB, label string, kind PairRefKind, targetID string) error {
	_, err := conn.ExecContext(ctx, `
		INSERT INTO pair_label_aliases (label, target_kind, target_id, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (label) DO UPDATE SET
			target_kind = EXCLUDED.target_kind,
			target_id = EXCLUDED.target_id,
			updated_at = NOW()
	`, strings.TrimSpace(label), string(kind), strings.TrimSpace(targetID))
	return err
}

func validatePairAliasTarget(ctx context.Context, conn *sql.DB, kind PairRefKind, targetID string) error {
	switch kind {
	case PairRefDish:
		var exists bool
		err := conn.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM dishes WHERE id = $1)`, targetID).Scan(&exists)
		if err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("dish %q not found in catalog", targetID)
		}
	case PairRefIngredient:
		var exists bool
		err := conn.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM ingredients WHERE id = $1)`, targetID).Scan(&exists)
		if err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("ingredient %q not found in catalog", targetID)
		}
	default:
		return fmt.Errorf("invalid target_kind %q", kind)
	}
	return nil
}

func pairLabelDefaultsCopy() map[string]PairRef {
	out := make(map[string]PairRef, len(pairLabelDefaults))
	for k, v := range pairLabelDefaults {
		out[k] = v
	}
	return out
}

func pairRegistryOrDefaults(registry map[string]PairRef) map[string]PairRef {
	if len(registry) > 0 {
		return registry
	}
	return pairLabelDefaultsCopy()
}
