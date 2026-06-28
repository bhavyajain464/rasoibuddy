package handlers

import (
	"net/http"
	"strconv"
	"strings"
)

const (
	listPageDefaultLimit = 30
	listPageMaxLimit     = 100
)

func requestWantsPagination(r *http.Request) bool {
	q := r.URL.Query()
	_, hasOffset := q["offset"]
	_, hasPage := q["page"]
	return hasOffset || hasPage
}

func parseListPagination(r *http.Request) (offset, limit int) {
	limit = listPageDefaultLimit
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > listPageMaxLimit {
		limit = listPageMaxLimit
	}

	offset = 0
	if raw := strings.TrimSpace(r.URL.Query().Get("offset")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 0 {
			offset = n
		}
		return offset, limit
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("page")); raw != "" {
		page := 1
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			page = n
		}
		offset = (page - 1) * limit
	}
	return offset, limit
}
