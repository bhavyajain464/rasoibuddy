package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"kitchenai-backend/internal/dblock"
	"kitchenai-backend/internal/services"
	"kitchenai-backend/internal/services/catalogdb"
	invgroup "kitchenai-backend/internal/services/inventory"
	"kitchenai-backend/pkg/config"
	"kitchenai-backend/pkg/units"
)

const billScanUserMessage = "We couldn't read this bill. Try a clearer photo with good lighting."

func recordSkippedCandidates(ctx context.Context, db *sql.DB, skipped []string, source string) {
	for _, name := range skipped {
		_ = catalogdb.RecordCandidate(ctx, db, name, source)
	}
}

func billScanResultMessage(matched int, skipped []string) string {
	if matched == 0 && len(skipped) > 0 {
		return fmt.Sprintf("No recognized ingredients on this bill (%d lines skipped)", len(skipped))
	}
	if len(skipped) == 0 {
		return fmt.Sprintf("Found %d edible items on this bill", matched)
	}
	return fmt.Sprintf("Found %d recognized ingredients (%d lines skipped)", matched, len(skipped))
}

// ScanBillRequest represents the request body for bill scanning
type ScanBillRequest struct {
	ImageData string `json:"image_data"` // Base64 encoded image
	ImageType string `json:"image_type"` // MIME type like "image/jpeg", "image/png"
}

// ScanBillResponse represents the response from bill scanning
type ScanBillResponse struct {
	Success       bool                     `json:"success"`
	Message       string                   `json:"message,omitempty"`
	Items         []services.BillItem      `json:"items,omitempty"`
	Skipped       []string                 `json:"skipped,omitempty"`
	Added         []map[string]interface{} `json:"added_to_inventory,omitempty"`
	Errors        []string                 `json:"errors,omitempty"`
}

// ScanBill handles bill scanning — extracts items only, does NOT auto-add to inventory.
// The frontend shows results for user confirmation, then calls POST /inventory for each confirmed item.
func ScanBill(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		userID := getUserID(r)
		if !requireBillScan(db, userID, w) {
			return
		}

		var req ScanBillRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.ImageData == "" {
			http.Error(w, "image_data is required", http.StatusBadRequest)
			return
		}

		if req.ImageType == "" {
			if strings.HasPrefix(req.ImageData, "/9j/") {
				req.ImageType = "image/jpeg"
			} else if strings.HasPrefix(req.ImageData, "iVBORw0KGgo") {
				req.ImageType = "image/png"
			} else if strings.HasPrefix(req.ImageData, "JVBERi") {
				req.ImageType = "application/pdf"
			} else {
				req.ImageType = "image/jpeg"
			}
		}
		req.ImageType = services.NormalizeBillScanMIME(req.ImageType, "")
		if err := services.ValidateBillScanMIME(req.ImageType); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		items, err := services.ScanBillBase64ForConfig(r.Context(), cfg, req.ImageData, req.ImageType)
		if err != nil {
			response := ScanBillResponse{
				Success: false,
				Message: billScanUserMessage,
			}
			writeJSONResponse(w, http.StatusInternalServerError, response)
			return
		}
		items, skipped := services.ApplyCatalogMapping(items)
		recordSkippedCandidates(r.Context(), db, skipped, "bill_scan")
		normalizeBillItemsFoodGroup(items, dietaryTagsForUser(db, userID))

		if err := services.RecordBillScan(db, userID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		response := ScanBillResponse{
			Success: true,
			Message: billScanResultMessage(len(items), skipped),
			Items:   items,
			Skipped: skipped,
		}

		writeJSONResponse(w, http.StatusOK, response)
	}
}

// ScanBillMultipart handles bill scanning with multipart form data (file upload)
func ScanBillMultipart(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		userID := getUserID(r)
		if !requireBillScan(db, userID, w) {
			return
		}

		if err := r.ParseMultipartForm(10 << 20); err != nil {
			http.Error(w, "Failed to parse form", http.StatusBadRequest)
			return
		}

		// Get the file from form data
		file, header, err := r.FormFile("bill_image")
		if err != nil {
			http.Error(w, "No bill_image file provided", http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Read file data
		fileData, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, "Failed to read file", http.StatusInternalServerError)
			return
		}

		// Get image type from header
		imageType := header.Header.Get("Content-Type")
		if imageType == "" {
			imageType = services.NormalizeBillScanMIME("", header.Filename)
		} else {
			imageType = services.NormalizeBillScanMIME(imageType, header.Filename)
		}
		if err := services.ValidateBillScanMIME(imageType); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Scan the bill (LLM_PROVIDER selects gemini vs groq; photos → Vision OCR + text, PDF → text extraction)
		items, err := services.ScanBillBytesForConfig(r.Context(), cfg, fileData, imageType)
		if err != nil {
			response := ScanBillResponse{
				Success: false,
				Message: billScanUserMessage,
			}
			writeJSONResponse(w, http.StatusInternalServerError, response)
			return
		}
		items, skipped := services.ApplyCatalogMapping(items)
		recordSkippedCandidates(r.Context(), db, skipped, "bill_scan")
		normalizeBillItemsFoodGroup(items, dietaryTagsForUser(db, userID))

		if err := services.RecordBillScan(db, userID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		addedItems, errors := addItemsToInventory(db, items, userID)

		response := ScanBillResponse{
			Success: true,
			Message: billScanResultMessage(len(items), skipped),
			Items:   items,
			Skipped: skipped,
			Added:   addedItems,
		}

		if len(errors) > 0 {
			response.Errors = errors
		}

		writeJSONResponse(w, http.StatusOK, response)
	}
}

func normalizeBillItemsFoodGroup(items []services.BillItem, dietaryTags []string) {
	for i := range items {
		items[i].FoodGroup = invgroup.NormalizeFoodGroupForDietary(items[i].FoodGroup, dietaryTags)
	}
}

func addItemsToInventory(db *sql.DB, items []services.BillItem, userID string) ([]map[string]interface{}, []string) {
	var addedItems []map[string]interface{}
	var errors []string
	dietary := dietaryTagsForUser(db, userID)
	kitchen, err := resolveKitchenForUser(db, userID)
	if err != nil {
		return nil, []string{fmt.Sprintf("failed to resolve kitchen: %v", err)}
	}
	if kitchen == nil {
		return nil, []string{"kitchen not found"}
	}

	for _, item := range items {
		shelfDays := item.ShelfLifeDays
		if shelfDays <= 0 {
			shelfDays = 7
		}
		expiry := time.Now().AddDate(0, 0, shelfDays)
		foodGroup := invgroup.NormalizeFoodGroupForDietary(item.FoodGroup, dietary)

		unit := units.Normalize(item.Unit)
		tx, txErr := db.Begin()
		if txErr != nil {
			errors = append(errors, fmt.Sprintf("Failed to update %s: %v", item.Name, txErr))
			continue
		}

		if err := dblock.LockKitchenProductLine(tx, kitchen.KitchenID, item.Name, unit); err != nil {
			tx.Rollback()
			errors = append(errors, fmt.Sprintf("Failed to update %s: %v", item.Name, err))
			continue
		}

		existingID, findErr := dblock.FindInventoryItemIDForProduct(tx, kitchen.KitchenID, item.Name, unit)
		if findErr == nil {
			_, err = tx.Exec(`
				UPDATE inventory 
				SET qty = qty + $1, estimated_expiry = LEAST(estimated_expiry, $2), food_group = $3,
					ingredient_id = COALESCE($7, ingredient_id),
					user_id = COALESCE(user_id, $4), updated_at = NOW()
				WHERE item_id = $5 AND kitchen_id = $6
			`, item.Quantity, expiry, foodGroup, userID, existingID, kitchen.KitchenID, nullStr(item.IngredientID))
			if err != nil {
				tx.Rollback()
				errors = append(errors, fmt.Sprintf("Failed to update %s: %v", item.Name, err))
				continue
			}
			if err = tx.Commit(); err != nil {
				errors = append(errors, fmt.Sprintf("Failed to update %s: %v", item.Name, err))
				continue
			}

			addedItems = append(addedItems, map[string]interface{}{
				"item_id":          existingID,
				"name":             item.Name,
				"quantity":         item.Quantity,
				"unit":             item.Unit,
				"action":           "updated",
				"shelf_life_days":  shelfDays,
				"estimated_expiry": expiry.Format("2006-01-02"),
			})
			RemoveFromShoppingList(db, kitchen.KitchenID, item.Name)
			continue
		}
		if findErr != sql.ErrNoRows {
			tx.Rollback()
			errors = append(errors, fmt.Sprintf("Database error for %s: %v", item.Name, findErr))
			continue
		}

		var itemID string
		err = tx.QueryRow(`
			INSERT INTO inventory (canonical_name, qty, unit, estimated_expiry, user_id, kitchen_id, is_manual, food_group, ingredient_id, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, NOW(), NOW())
			RETURNING item_id
		`, item.Name, item.Quantity, unit, expiry, userID, kitchen.KitchenID, foodGroup, nullStr(item.IngredientID)).Scan(&itemID)
		if err != nil {
			tx.Rollback()
			errors = append(errors, fmt.Sprintf("Failed to insert %s: %v", item.Name, err))
			continue
		}
		if err = tx.Commit(); err != nil {
			errors = append(errors, fmt.Sprintf("Failed to insert %s: %v", item.Name, err))
			continue
		}

		addedItems = append(addedItems, map[string]interface{}{
			"item_id":          itemID,
			"name":             item.Name,
			"quantity":         item.Quantity,
			"unit":             item.Unit,
			"action":           "added",
			"shelf_life_days":  shelfDays,
			"estimated_expiry": expiry.Format("2006-01-02"),
		})
		RemoveFromShoppingList(db, kitchen.KitchenID, item.Name)
	}

	return addedItems, errors
}

func nullStr(s string) interface{} {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}

// writeJSONResponse writes a JSON response with the given status code
func writeJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

// TestScanBill is a test endpoint that returns mock data without calling Gemini
func TestScanBill(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)

		mockItems := []services.BillItem{
			{Name: "Basmati Rice", Quantity: 5, Unit: "kg", PricePerUnit: 120, TotalPrice: 600, ShelfLifeDays: 60, FoodGroup: "grains_pulses"},
			{Name: "Tomatoes", Quantity: 2, Unit: "kg", PricePerUnit: 40, TotalPrice: 80, ShelfLifeDays: 7, FoodGroup: "vegetables"},
			{Name: "Onions", Quantity: 3, Unit: "kg", PricePerUnit: 30, TotalPrice: 90, ShelfLifeDays: 14, FoodGroup: "vegetables"},
			{Name: "Potatoes", Quantity: 4, Unit: "kg", PricePerUnit: 25, TotalPrice: 100, ShelfLifeDays: 14, FoodGroup: "vegetables"},
			{Name: "Milk", Quantity: 2, Unit: "litre", PricePerUnit: 60, TotalPrice: 120, ShelfLifeDays: 3, FoodGroup: "dairy"},
		}
		mockItems, skipped := services.ApplyCatalogMapping(mockItems)

		addedItems, errors := addItemsToInventory(db, mockItems, userID)

		response := ScanBillResponse{
			Success: true,
			Message: billScanResultMessage(len(mockItems), skipped),
			Items:   mockItems,
			Skipped: skipped,
			Added:   addedItems,
		}

		if len(errors) > 0 {
			response.Errors = errors
		}

		writeJSONResponse(w, http.StatusOK, response)
	}
}
