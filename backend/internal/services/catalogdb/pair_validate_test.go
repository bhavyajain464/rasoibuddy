package catalogdb

import (
	"os"
	"path/filepath"
	"testing"
)

func catalogJSONPaths(t *testing.T) (ingredientsJSON, dishesJSON []byte) {
	t.Helper()
	root := filepath.Join("..")
	ing, err := os.ReadFile(filepath.Join(root, "ingredients", "catalog.json"))
	if err != nil {
		t.Fatal(err)
	}
	dishes, err := os.ReadFile(filepath.Join(root, "dishes", "catalog.json"))
	if err != nil {
		t.Fatal(err)
	}
	return ing, dishes
}

func TestAuditPairsWith_allResolved(t *testing.T) {
	ing, dishes := catalogJSONPaths(t)
	unresolved, err := ValidateAllPairsWith(dishes, ing)
	if err != nil {
		t.Fatalf("audit: %v", err)
	}
	if len(unresolved) > 0 {
		t.Fatalf("unresolved pairs_with labels: %v", unresolved)
	}
}

func TestResolvePairLabel_roti(t *testing.T) {
	ing, dishes := catalogJSONPaths(t)
	r, err := NewPairCatalogResolver(ing, dishes, nil)
	if err != nil {
		t.Fatal(err)
	}
	ref, ok := r.ResolvePairLabel("roti")
	if !ok || ref.Kind != PairRefDish || ref.ID != "plain-roti" {
		t.Fatalf("got %+v ok=%v", ref, ok)
	}
}

func TestNormalizeDishPairsWith_dedupes(t *testing.T) {
	ing, dishes := catalogJSONPaths(t)
	r, err := NewPairCatalogResolver(ing, dishes, nil)
	if err != nil {
		t.Fatal(err)
	}
	out, err := r.NormalizeDishPairsWith([]string{"roti", "rotis", "chapati"})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 {
		t.Fatalf("expected 2 ids, got %v", out)
	}
}
