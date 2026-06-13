package zomato

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const menuContentPath = "https://www.zomato.com/php/online_ordering/menu_edit"

func menuContentURL(outletID string) string {
	q := url.Values{}
	q.Set("action", "get_content_menu")
	q.Set("res_id", normalizeOutletID(outletID))
	q.Set("service_role", "DELIVERY_TAKEAWAY")
	return menuContentPath + "?" + q.Encode()
}

type menuContentResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    struct {
		MenuResponse json.RawMessage `json:"menuResponse"`
	} `json:"data"`
}

func (s *Service) fetchContentMenu(ctx context.Context, auth *Auth, outletID string) ([]byte, error) {
	outletID = normalizeOutletID(outletID)
	if outletID == "" {
		return nil, fmt.Errorf("outlet_id required")
	}
	if auth == nil || len(auth.Cookies) == 0 {
		return nil, &AuthError{Code: "login_required", Message: "Zomato session not configured — import partner cookies in Settings"}
	}

	u := menuContentURL(outletID)
	resp, err := auth.doMenuEditor(ctx, s.httpClient, http.MethodGet, u, outletID, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("menu fetch failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	return parseMenuContentBody(raw, outletID)
}

func parseMenuContentBody(raw []byte, outletID string) ([]byte, error) {
	var envelope menuContentResponse
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, fmt.Errorf("parse menu response: %w", err)
	}
	if !envelope.Success {
		msg := strings.TrimSpace(envelope.Message)
		if msg == "" {
			msg = "menu fetch failed"
		}
		if strings.Contains(strings.ToLower(msg), "login") {
			return nil, &AuthError{Code: "login_required", Message: msg}
		}
		return nil, fmt.Errorf("menu fetch: %s", msg)
	}
	if len(envelope.Data.MenuResponse) == 0 || string(envelope.Data.MenuResponse) == "null" {
		return nil, fmt.Errorf("menu response empty for outlet %s", outletID)
	}
	return raw, nil
}
