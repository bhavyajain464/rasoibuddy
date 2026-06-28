package handlers

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRequestWantsPagination(t *testing.T) {
	t.Parallel()
	legacy := httptest.NewRequest("GET", "/inventory?include=active", nil)
	if requestWantsPagination(legacy) {
		t.Fatal("expected legacy request without pagination")
	}
	paged := httptest.NewRequest("GET", "/inventory?include=active&offset=0", nil)
	if !requestWantsPagination(paged) {
		t.Fatal("expected offset to enable pagination")
	}
}

func TestParseListPagination(t *testing.T) {
	t.Parallel()
	offset, limit := parseListPagination(httptest.NewRequest("GET", "/shopping?offset=30&limit=20", nil))
	if offset != 30 || limit != 20 {
		t.Fatalf("got offset=%d limit=%d", offset, limit)
	}
	offset, limit = parseListPagination(httptest.NewRequest("GET", "/shopping?page=2&limit=10", nil))
	if offset != 10 || limit != 10 {
		t.Fatalf("page 2: got offset=%d limit=%d", offset, limit)
	}
}

func TestAppendInventoryFilterClausesFoodGroupOnly(t *testing.T) {
	t.Parallel()
	where, args := appendInventoryFilterClauses("kitchen_id = $1 AND (true)", []interface{}{"kitchen-1"}, inventoryPageFilters{
		foodGroup: "vegetables",
	}, true)
	if !strings.Contains(where, "= $2") {
		t.Fatalf("expected food_group at $2, got: %s", where)
	}
	if len(args) != 2 || args[1] != "vegetables" {
		t.Fatalf("unexpected args: %#v", args)
	}
}

func TestAppendInventoryFilterClausesSearchAndFoodGroup(t *testing.T) {
	t.Parallel()
	where, args := appendInventoryFilterClauses("kitchen_id = $1 AND (true)", []interface{}{"kitchen-1"}, inventoryPageFilters{
		q:         "tomato",
		foodGroup: "vegetables",
	}, true)
	if !strings.Contains(where, "$2") || !strings.Contains(where, "$3") {
		t.Fatalf("expected $2 and $3 placeholders, got: %s", where)
	}
	if len(args) != 3 {
		t.Fatalf("unexpected args: %#v", args)
	}
}

func TestInventoryGroupID(t *testing.T) {
	t.Parallel()
	if inventoryGroupID("protein") != "non_veg" {
		t.Fatal("protein should map to non_veg")
	}
	if inventoryGroupID("") != "other" {
		t.Fatal("empty should map to other")
	}
}
