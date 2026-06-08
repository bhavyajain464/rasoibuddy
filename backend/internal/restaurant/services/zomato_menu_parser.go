package services

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

type zomatoMenuFile struct {
	Data struct {
		MenuResponse zomatoMenuResponse `json:"menuResponse"`
	} `json:"data"`
}

type zomatoMenuResponse struct {
	CategoryWrappers  []zomatoCategoryWrapper  `json:"categoryWrappers"`
	CatalogueWrappers []zomatoCatalogueWrapper `json:"catalogueWrappers"`
}

type zomatoCategoryWrapper struct {
	Category struct {
		Name string `json:"name"`
	} `json:"category"`
	SubCategoryWrappers []struct {
		SubCategoryEntities []struct {
			EntityType string `json:"entityType"`
			EntityID   string `json:"entityId"`
		} `json:"subCategoryEntities"`
	} `json:"subCategoryWrappers"`
}

type zomatoCatalogueWrapper struct {
	Catalogue struct {
		CatalogueID string `json:"catalogueId"`
		Name        string `json:"name"`
	} `json:"catalogue"`
	VariantWrappers []struct {
		VariantPrices []struct {
			Service   string  `json:"service"`
			Price     float64 `json:"price"`
			IsVisible bool    `json:"isVisible"`
		} `json:"variantPrices"`
	} `json:"variantWrappers"`
}

// ZomatoMenuDish is one catalogue item linked to a Zomato category.
type ZomatoMenuDish struct {
	Name         string `json:"name"`
	Category     string `json:"category"`
	CatalogueID  string `json:"catalogue_id"`
	PriceCents   int    `json:"price_cents"`
	Ingredients  []string
}

func zomatoDeliveryPriceCents(cw zomatoCatalogueWrapper) int {
	for _, vw := range cw.VariantWrappers {
		for _, vp := range vw.VariantPrices {
			if vp.Service == "delivery" && vp.IsVisible {
				return int(vp.Price * 100)
			}
		}
	}
	return 0
}

// ParseZomatoMenu reads a Zomato menu export JSON and returns catalogue dishes
// with category, name, catalogue id, and delivery price.
func ParseZomatoMenu(path string) ([]ZomatoMenuDish, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return ParseZomatoMenuJSON(raw)
}

// ParseZomatoMenuJSON parses Zomato get_content_menu JSON (data.menuResponse).
func ParseZomatoMenuJSON(raw []byte) ([]ZomatoMenuDish, error) {
	var file zomatoMenuFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return nil, fmt.Errorf("parse menu json: %w", err)
	}
	mr := file.Data.MenuResponse

	catalogueByID := make(map[string]ZomatoMenuDish, len(mr.CatalogueWrappers))
	for _, cw := range mr.CatalogueWrappers {
		id := strings.TrimSpace(cw.Catalogue.CatalogueID)
		if id == "" {
			continue
		}
		catalogueByID[id] = ZomatoMenuDish{
			Name:        strings.TrimSpace(cw.Catalogue.Name),
			CatalogueID: id,
			PriceCents:  zomatoDeliveryPriceCents(cw),
		}
	}

	out := make([]ZomatoMenuDish, 0)
	for _, catw := range mr.CategoryWrappers {
		category := strings.ToLower(strings.TrimSpace(catw.Category.Name))
		if category == "" {
			category = "general"
		}
		for _, sub := range catw.SubCategoryWrappers {
			for _, ent := range sub.SubCategoryEntities {
				if ent.EntityType != "catalogue" {
					continue
				}
				id := strings.TrimSpace(ent.EntityID)
				dish, ok := catalogueByID[id]
				if !ok || dish.Name == "" {
					continue
				}
				dish.Category = category
				out = append(out, dish)
			}
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no catalogue dishes found in menu response")
	}
	return out, nil
}
