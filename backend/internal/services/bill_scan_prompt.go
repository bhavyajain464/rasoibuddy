package services

import (
	"fmt"

	invgroup "kitchenai-backend/internal/services/inventory"
)

// billScanFoodGroupField documents food_group for bill-scan LLM prompts.
func billScanFoodGroupField() string {
	return fmt.Sprintf(`- food_group: pantry category, exactly one of: %s`, invgroup.PromptGroupList())
}

const billScanFoodGroupExample = `"food_group":"grains_pulses"`
