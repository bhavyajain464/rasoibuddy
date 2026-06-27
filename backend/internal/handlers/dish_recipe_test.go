package handlers

import (
	"net/http/httptest"
	"testing"
)

func TestDishRecipeWantsPagination(t *testing.T) {
	t.Parallel()
	legacy := httptest.NewRequest("GET", "/dishes/recipes?q=dal", nil)
	if dishRecipeWantsPagination(legacy) {
		t.Fatal("expected legacy request without pagination")
	}
	paged := httptest.NewRequest("GET", "/dishes/recipes?q=dal&offset=0", nil)
	if !dishRecipeWantsPagination(paged) {
		t.Fatal("expected offset to enable pagination")
	}
	pagedPage := httptest.NewRequest("GET", "/dishes/recipes?page=2", nil)
	if !dishRecipeWantsPagination(pagedPage) {
		t.Fatal("expected page to enable pagination")
	}
}

func TestParseDishRecipePagination(t *testing.T) {
	t.Parallel()
	offset, limit := parseDishRecipePagination(httptest.NewRequest("GET", "/dishes/recipes?offset=30&limit=20", nil))
	if offset != 30 || limit != 20 {
		t.Fatalf("got offset=%d limit=%d", offset, limit)
	}
	offset, limit = parseDishRecipePagination(httptest.NewRequest("GET", "/dishes/recipes?page=3&limit=10", nil))
	if offset != 20 || limit != 10 {
		t.Fatalf("page 3: got offset=%d limit=%d", offset, limit)
	}
}
