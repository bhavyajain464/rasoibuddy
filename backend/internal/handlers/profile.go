package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	kafkalib "kitchenai-backend/internal/kafka"
	"kitchenai-backend/internal/models"
	"kitchenai-backend/pkg/units"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/lib/pq"
)

// GetOnboardingStatus checks if the user has completed onboarding
func GetOnboardingStatus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		var done bool
		err := db.QueryRow(`SELECT COALESCE(onboarding_done, FALSE) FROM user_prefs WHERE user_id = $1`, userID).Scan(&done)
		if err != nil {
			done = false
		}

		if previewEmail := strings.ToLower(strings.TrimSpace(os.Getenv("ONBOARDING_PREVIEW_EMAIL"))); previewEmail != "" {
			var email string
			if qerr := db.QueryRow(`SELECT LOWER(TRIM(email)) FROM users WHERE user_id = $1`, userID).Scan(&email); qerr == nil && email == previewEmail {
				done = false
			}
		}

		// Staging: always show onboarding so the flow can be tested repeatedly.
		if strings.EqualFold(strings.TrimSpace(os.Getenv("ENVIRONMENT")), "staging") {
			done = false
		}
		if strings.EqualFold(strings.TrimSpace(os.Getenv("ONBOARDING_ALWAYS_SHOW")), "true") {
			done = false
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"onboarding_done": done})
	}
}

// CompleteOnboarding saves preferences and adds initial inventory items
func CompleteOnboarding(db *sql.DB, producer *kafkalib.Producer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		var req struct {
			HouseholdSize int      `json:"household_size"`
			DietaryTags   []string `json:"dietary_tags"`
			FavCuisines   []string `json:"fav_cuisines"`
			SpiceLevel    string   `json:"spice_level"`
			CookingSkill  string   `json:"cooking_skill"`
			Allergies     []string `json:"allergies"`
			Dislikes      []string `json:"dislikes"`
			Items         []struct {
				Name string  `json:"name"`
				Qty  float64 `json:"qty"`
				Unit string  `json:"unit"`
			} `json:"items"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var kitchen *kitchenView
		var err error
		if len(req.Items) > 0 {
			kitchen, err = resolveKitchenForUser(db, userID)
			if err != nil {
				http.Error(w, "Failed to resolve kitchen", http.StatusInternalServerError)
				return
			}
			if kitchen == nil {
				userName := ""
				_ = db.QueryRow(`SELECT COALESCE(name, '') FROM users WHERE user_id = $1`, userID).Scan(&userName)
				kitchen, err = EnsureKitchenForUser(db, userID, userName)
				if err != nil {
					log.Printf("Onboarding ensure kitchen error: %v", err)
					http.Error(w, "Failed to resolve kitchen", http.StatusInternalServerError)
					return
				}
			}
			if kitchen == nil {
				http.Error(w, "Kitchen not found", http.StatusNotFound)
				return
			}
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Server error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		_, err = tx.Exec(`
			INSERT INTO user_prefs (user_id, household_size, dietary_tags, fav_cuisines,
				spice_level, cooking_skill, allergies, dislikes, onboarding_done)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
			ON CONFLICT (user_id) DO UPDATE SET
				household_size = EXCLUDED.household_size,
				dietary_tags = EXCLUDED.dietary_tags,
				fav_cuisines = EXCLUDED.fav_cuisines,
				spice_level = EXCLUDED.spice_level,
				cooking_skill = EXCLUDED.cooking_skill,
				allergies = EXCLUDED.allergies,
				dislikes = EXCLUDED.dislikes,
				onboarding_done = TRUE,
				updated_at = NOW()
		`, userID, req.HouseholdSize, pq.Array(req.DietaryTags), pq.Array(req.FavCuisines),
			req.SpiceLevel, req.CookingSkill, pq.Array(req.Allergies), pq.Array(req.Dislikes))
		if err != nil {
			log.Printf("Onboarding prefs error: %v", err)
			http.Error(w, "Failed to save preferences", http.StatusInternalServerError)
			return
		}

		added := 0
		var insertedIDs []string
		for _, item := range req.Items {
			if item.Name == "" || item.Qty <= 0 {
				continue
			}
			unit := units.Normalize(item.Unit)
			var itemID string
			err := tx.QueryRow(`
				INSERT INTO inventory (canonical_name, qty, unit, is_manual, user_id, kitchen_id, food_group)
				VALUES ($1, $2, $3, TRUE, $4, $5, 'other')
				RETURNING item_id
			`, item.Name, item.Qty, unit, userID, kitchen.KitchenID).Scan(&itemID)
			if err != nil {
				log.Printf("Onboarding item add error (%s): %v", item.Name, err)
				http.Error(w, "Failed to add inventory items", http.StatusInternalServerError)
				return
			}
			insertedIDs = append(insertedIDs, itemID)
			added++
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "Failed to complete onboarding", http.StatusInternalServerError)
			return
		}

		if len(insertedIDs) > 0 && producer != nil {
			producer.PublishShelfLifeEvent(kafkalib.ShelfLifeEvent{
				ItemIDs: insertedIDs,
				UserID:  userID,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message":     "Onboarding complete",
			"items_added": added,
		})
	}
}

func GetProfile(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		var user models.User
		err := db.QueryRow(`SELECT user_id, google_id, email, name, COALESCE(picture_url, '') FROM users WHERE user_id = $1`, userID).
			Scan(&user.UserID, &user.GoogleID, &user.Email, &user.Name, &user.PictureURL)
		if err != nil {
			log.Printf("GetProfile user query error: %v", err)
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		profile := models.UserProfile{
			User:         user,
			HouseholdSize: 2,
			SpiceLevel:    "medium",
			CookingSkill:  "intermediate",
			Allergies:     []string{},
			Dislikes:      []string{},
			DietaryTags:   []string{},
			FavCuisines:   []string{},
			Memories:      []models.UserMemory{},
		}

		var allergies, dislikes, dietaryTags, favCuisines pq.StringArray
		var householdSize sql.NullInt64
		var spiceLevel, cookingSkill sql.NullString
		err = db.QueryRow(`
			SELECT COALESCE(household_size, 2), COALESCE(allergies, '{}'), COALESCE(dislikes, '{}'),
				COALESCE(dietary_tags, '{}'), COALESCE(fav_cuisines, '{}'),
				COALESCE(spice_level, 'medium'), COALESCE(cooking_skill, 'intermediate')
			FROM user_prefs WHERE user_id = $1
		`, userID).Scan(&householdSize, &allergies, &dislikes, &dietaryTags, &favCuisines, &spiceLevel, &cookingSkill)
		if err == nil {
			if householdSize.Valid {
				profile.HouseholdSize = int(householdSize.Int64)
			}
			profile.Allergies = []string(allergies)
			profile.Dislikes = []string(dislikes)
			profile.DietaryTags = []string(dietaryTags)
			profile.FavCuisines = []string(favCuisines)
			if spiceLevel.Valid {
				profile.SpiceLevel = spiceLevel.String
			}
			if cookingSkill.Valid {
				profile.CookingSkill = cookingSkill.String
			}
		}

		if profile.Allergies == nil {
			profile.Allergies = []string{}
		}
		if profile.Dislikes == nil {
			profile.Dislikes = []string{}
		}
		if profile.DietaryTags == nil {
			profile.DietaryTags = []string{}
		}
		if profile.FavCuisines == nil {
			profile.FavCuisines = []string{}
		}

		rows, err := db.Query(`SELECT id, user_id, category, content, created_at FROM user_memory WHERE user_id = $1 ORDER BY created_at DESC`, userID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var m models.UserMemory
				if err := rows.Scan(&m.ID, &m.UserID, &m.Category, &m.Content, &m.CreatedAt); err == nil {
					profile.Memories = append(profile.Memories, m)
				}
			}
		}
		if profile.Memories == nil {
			profile.Memories = []models.UserMemory{}
		}

		var kitchenID string
		_ = db.QueryRow(`SELECT kitchen_id::text FROM kitchen_members WHERE user_id = $1 LIMIT 1`, userID).Scan(&kitchenID)
		var invCount int
		if kitchenID != "" {
			db.QueryRow(`SELECT COUNT(*) FROM inventory WHERE kitchen_id = $1 AND qty > 0`, kitchenID).Scan(&invCount)
		}
		profile.InventoryCount = invCount

		var expCount int
		if kitchenID != "" {
			db.QueryRow(`SELECT COUNT(*) FROM inventory WHERE kitchen_id = $1 AND qty > 0 AND estimated_expiry IS NOT NULL AND (estimated_expiry - CURRENT_DATE) <= 3`, kitchenID).Scan(&expCount)
		}
		profile.ExpiringCount = expCount

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(profile)
	}
}

func UpdateProfile(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		var req models.UpdateProfileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var exists bool
		db.QueryRow("SELECT EXISTS(SELECT 1 FROM user_prefs WHERE user_id = $1)", userID).Scan(&exists)

		if exists {
			_, err := db.Exec(`
				UPDATE user_prefs
				SET dislikes = $1, dietary_tags = $2, fav_cuisines = $3,
					household_size = $4, allergies = $5, spice_level = $6, cooking_skill = $7,
					updated_at = NOW()
				WHERE user_id = $8
			`, pq.Array(req.Dislikes), pq.Array(req.DietaryTags), pq.Array(req.FavCuisines),
				req.HouseholdSize, pq.Array(req.Allergies), req.SpiceLevel, req.CookingSkill, userID)
			if err != nil {
				log.Printf("UpdateProfile error: %v", err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			_, err := db.Exec(`
				INSERT INTO user_prefs (user_id, dislikes, dietary_tags, fav_cuisines, household_size, allergies, spice_level, cooking_skill)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			`, userID, pq.Array(req.Dislikes), pq.Array(req.DietaryTags), pq.Array(req.FavCuisines),
				req.HouseholdSize, pq.Array(req.Allergies), req.SpiceLevel, req.CookingSkill)
			if err != nil {
				log.Printf("UpdateProfile insert error: %v", err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Profile updated"})
	}
}

func AddMemory(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		var req models.AddMemoryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if req.Content == "" {
			http.Error(w, "Content is required", http.StatusBadRequest)
			return
		}
		if req.Category == "" {
			req.Category = "general"
		}

		id := uuid.New().String()
		var m models.UserMemory
		err := db.QueryRow(`
			INSERT INTO user_memory (id, user_id, category, content)
			VALUES ($1, $2, $3, $4)
			RETURNING id, user_id, category, content, created_at
		`, id, userID, req.Category, req.Content).Scan(&m.ID, &m.UserID, &m.Category, &m.Content, &m.CreatedAt)
		if err != nil {
			log.Printf("AddMemory error: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(m)
	}
}

func DeleteMemory(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		memoryID := mux.Vars(r)["id"]
		result, err := db.Exec(`DELETE FROM user_memory WHERE id = $1 AND user_id = $2`, memoryID, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		rows, _ := result.RowsAffected()
		if rows == 0 {
			http.Error(w, "Memory not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Memory deleted"})
	}
}
