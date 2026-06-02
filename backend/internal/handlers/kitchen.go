package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type kitchenView struct {
	KitchenID    string `json:"kitchen_id"`
	Name         string `json:"name"`
	InviteCode   string `json:"invite_code"`
	MemberCount  int    `json:"member_count"`
}

func memberCountForKitchen(db *sql.DB, kitchenID string) (int, error) {
	var n int
	err := db.QueryRow(`SELECT COUNT(*) FROM kitchen_members WHERE kitchen_id = $1`, kitchenID).Scan(&n)
	return n, err
}

func kitchenViewWithMemberCount(db *sql.DB, k *kitchenView) (*kitchenView, error) {
	if k == nil {
		return nil, nil
	}
	n, err := memberCountForKitchen(db, k.KitchenID)
	if err != nil {
		return nil, err
	}
	k.MemberCount = n
	return k, nil
}

type kitchenMembership struct {
	KitchenID string
	UserID    string
}

func resolveKitchenMembership(db *sql.DB, userID string) (*kitchenMembership, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, fmt.Errorf("user id required")
	}
	var m kitchenMembership
	err := db.QueryRow(`
		SELECT kitchen_id::text, user_id::text
		FROM kitchen_members
		WHERE user_id = $1
		LIMIT 1
	`, userID).Scan(&m.KitchenID, &m.UserID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func fetchKitchenByID(db *sql.DB, kitchenID string) (*kitchenView, error) {
	var out kitchenView
	err := db.QueryRow(`
		SELECT kitchen_id::text, name, invite_code
		FROM kitchens
		WHERE kitchen_id = $1
		LIMIT 1
	`, kitchenID).Scan(&out.KitchenID, &out.Name, &out.InviteCode)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return kitchenViewWithMemberCount(db, &out)
}

func resolveKitchenForUser(db *sql.DB, userID string) (*kitchenView, error) {
	m, err := resolveKitchenMembership(db, userID)
	if err != nil || m == nil {
		return nil, err
	}
	return fetchKitchenByID(db, m.KitchenID)
}

func randomInviteCode() (string, error) {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	const n = 8
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = chars[int(b[i])%len(chars)]
	}
	return string(b), nil
}

func createKitchenRowWithRetries(tx *sql.Tx, userID, name string) (*kitchenView, error) {
	const maxAttempts = 10
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		trimmedName = "My Kitchen"
	}
	for i := 0; i < maxAttempts; i++ {
		code, err := randomInviteCode()
		if err != nil {
			return nil, err
		}
		var out kitchenView
		err = tx.QueryRow(`
			INSERT INTO kitchens (name, invite_code, created_by)
			VALUES ($1, $2, $3)
			RETURNING kitchen_id::text, name, invite_code
		`, trimmedName, code, userID).Scan(&out.KitchenID, &out.Name, &out.InviteCode)
		if err != nil {
			// 23505 unique violation; retry in case invite_code collision.
			if strings.Contains(err.Error(), "duplicate key") {
				continue
			}
			return nil, err
		}
		return &out, nil
	}
	return nil, fmt.Errorf("failed to generate unique invite code")
}

// deleteAbandonedKitchen removes a kitchen with no members (inventory CASCADE on delete).
func deleteAbandonedKitchen(tx *sql.Tx, kitchenID string) error {
	_, err := tx.Exec(`
		DELETE FROM kitchens
		WHERE kitchen_id = $1
		  AND NOT EXISTS (SELECT 1 FROM kitchen_members km WHERE km.kitchen_id = $1)
	`, kitchenID)
	return err
}

func createKitchenWithRetries(tx *sql.Tx, userID, name string) (*kitchenView, error) {
	out, err := createKitchenRowWithRetries(tx, userID, name)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`
		INSERT INTO kitchen_members (kitchen_id, user_id)
		VALUES ($1, $2)
	`, out.KitchenID, userID); err != nil {
		return nil, err
	}
	return out, nil
}

func EnsureKitchenForUser(db *sql.DB, userID, userName string) (*kitchenView, error) {
	k, err := resolveKitchenForUser(db, userID)
	if err != nil || k != nil {
		return k, err
	}
	kitchenName := strings.TrimSpace(userName)
	if kitchenName == "" {
		kitchenName = "My Kitchen"
	} else {
		kitchenName += "'s Kitchen"
	}
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	created, err := createKitchenWithRetries(tx, userID, kitchenName)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return kitchenViewWithMemberCount(db, created)
}

func CreateKitchen(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		existing, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if existing != nil {
			http.Error(w, "user already belongs to a kitchen", http.StatusConflict)
			return
		}

		var req struct {
			Name string `json:"name"`
		}
		if r.Body != nil {
			_ = json.NewDecoder(r.Body).Decode(&req)
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		k, err := createKitchenWithRetries(tx, userID, req.Name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		out, err := kitchenViewWithMemberCount(db, k)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(out)
	}
}

func GetKitchen(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		k, err := resolveKitchenForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if k == nil {
			http.Error(w, "kitchen not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(k)
	}
}

func JoinKitchenByInviteCode(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var req struct {
			InviteCode string `json:"invite_code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		code := strings.ToUpper(strings.TrimSpace(req.InviteCode))
		if code == "" {
			http.Error(w, "invite_code is required", http.StatusBadRequest)
			return
		}

		var kitchenID string
		err := db.QueryRow(`
			SELECT kitchen_id::text
			FROM kitchens
			WHERE invite_code = $1
			LIMIT 1
		`, code).Scan(&kitchenID)
		if err == sql.ErrNoRows {
			http.Error(w, "invalid invite code", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		existing, err := resolveKitchenMembership(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// User should always have a kitchen membership; if not, add directly.
		if existing == nil {
			if _, err := db.Exec(`
				INSERT INTO kitchen_members (kitchen_id, user_id)
				VALUES ($1, $2)
			`, kitchenID, userID); err != nil {
				if strings.Contains(err.Error(), "duplicate key") {
					http.Error(w, "user already belongs to a kitchen", http.StatusConflict)
					return
				}
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else if existing.KitchenID != kitchenID {
			tx, err := db.Begin()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer tx.Rollback()
			if _, err := tx.Exec(`UPDATE kitchen_members SET kitchen_id = $1 WHERE user_id = $2`, kitchenID, userID); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if err := deleteAbandonedKitchen(tx, existing.KitchenID); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if err := tx.Commit(); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		k, err := fetchKitchenByID(db, kitchenID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(k)
	}
}

func LeaveKitchen(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		membership, err := resolveKitchenMembership(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if membership == nil {
			http.Error(w, "kitchen membership not found", http.StatusNotFound)
			return
		}

		var memberCount int
		if err := db.QueryRow(`SELECT COUNT(*) FROM kitchen_members WHERE kitchen_id = $1`, membership.KitchenID).Scan(&memberCount); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var inventoryCount int
		if err := db.QueryRow(`SELECT COUNT(*) FROM inventory WHERE kitchen_id = $1`, membership.KitchenID).Scan(&inventoryCount); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if memberCount <= 1 && inventoryCount > 0 {
			http.Error(w, "cannot leave: this is your only kitchen and it has inventory items", http.StatusConflict)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		newKitchen, err := createKitchenRowWithRetries(tx, userID, "My Kitchen")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if _, err := tx.Exec(`
			UPDATE kitchen_members
			SET kitchen_id = $1
			WHERE kitchen_id = $2 AND user_id = $3
		`, newKitchen.KitchenID, membership.KitchenID, userID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := deleteAbandonedKitchen(tx, membership.KitchenID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"message": "left kitchen successfully; moved to a new personal kitchen"})
	}
}

