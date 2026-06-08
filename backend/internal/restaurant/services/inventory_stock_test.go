package services

import (
	"strings"
	"testing"
)

func TestAddInventoryInputValidation(t *testing.T) {
	_, err := AddInventory(t.Context(), nil, nil, "", "user", AddInventoryInput{Name: "x", Qty: 1, Unit: "kg"})
	if err == nil || !strings.Contains(err.Error(), "kitchen") {
		t.Fatalf("expected kitchen error, got %v", err)
	}
	_, err = AddInventory(t.Context(), nil, nil, "kitchen", "", AddInventoryInput{Name: "x", Qty: 1, Unit: "kg"})
	if err == nil || !strings.Contains(err.Error(), "kitchen") {
		t.Fatalf("expected user error, got %v", err)
	}
	_, err = AddInventory(t.Context(), nil, nil, "kitchen", "user", AddInventoryInput{Name: "", Qty: 1, Unit: "kg"})
	if err == nil || !strings.Contains(err.Error(), "name") {
		t.Fatalf("expected name error, got %v", err)
	}
	_, err = AddInventory(t.Context(), nil, nil, "kitchen", "user", AddInventoryInput{Name: "x", Qty: 0, Unit: "kg"})
	if err == nil || !strings.Contains(err.Error(), "qty") {
		t.Fatalf("expected qty error, got %v", err)
	}
}
