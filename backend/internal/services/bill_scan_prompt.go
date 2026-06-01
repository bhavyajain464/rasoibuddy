package services

import (
	"fmt"

	invgroup "kitchenai-backend/internal/services/inventory"
)

// billScanFoodGroupField documents food_group for bill-scan LLM prompts.
func billScanFoodGroupField() string {
	return fmt.Sprintf(`- food_group: pantry category, exactly one of: %s`, invgroup.PromptGroupList())
}

// billScanJSONOutputSpec tells the model the required response shape without sample products.
func billScanJSONOutputSpec() string {
	return `Return ONLY a JSON array, no markdown. Each element: name (string), quantity (number), unit (string), price_per_unit (number, 0 if unknown), total_price (number, 0 if unknown), shelf_life_days (number), food_group (string).`
}
