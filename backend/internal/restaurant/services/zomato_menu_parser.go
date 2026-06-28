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

type zomatoCatalogueMedia struct {
	URL      string `json:"url"`
	ThumbURL string `json:"thumbUrl"`
}

type zomatoCatalogue struct {
	CatalogueID string                 `json:"catalogueId"`
	Name        string                 `json:"name"`
	ImageURL    string                 `json:"imageUrl"`
	ImageURLV2  string                 `json:"imageUrlV2"`
	ThumbURL    string                 `json:"thumbUrl"`
	Media       []zomatoCatalogueMedia `json:"media"`
}

type zomatoCatalogueWrapper struct {
	Catalogue       zomatoCatalogue `json:"catalogue"`
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
	Name        string `json:"name"`
	Category    string `json:"category"`
	CatalogueID string `json:"catalogue_id"`
	PriceCents  int    `json:"price_cents"`
	ImageURL    string `json:"image_url"`
	ThumbURL    string `json:"thumb_url,omitempty"`
	Ingredients []string
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

// zomatoCatalogueImageURL picks the best Zomato-hosted photo URL from a catalogue row.
func zomatoCatalogueImageURL(cat zomatoCatalogue) (imageURL, thumbURL string) {
	for _, field := range []string{
		strings.TrimSpace(cat.ImageURL),
		strings.TrimSpace(cat.ImageURLV2),
	} {
		if field != "" {
			imageURL = field
			break
		}
	}
	thumbURL = strings.TrimSpace(cat.ThumbURL)
	if imageURL == "" {
		for _, m := range cat.Media {
			if u := strings.TrimSpace(m.URL); u != "" {
				imageURL = u
				if thumbURL == "" {
					thumbURL = strings.TrimSpace(m.ThumbURL)
				}
				break
			}
		}
	}
	if thumbURL == "" {
		thumbURL = imageURL
	}
	return imageURL, thumbURL
}

// ParseZomatoMenu reads a Zomato menu export JSON and returns catalogue dishes
// with category, name, catalogue id, delivery price, and Zomato image URLs.
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
		imageURL, thumbURL := zomatoCatalogueImageURL(cw.Catalogue)
		catalogueByID[id] = ZomatoMenuDish{
			Name:        strings.TrimSpace(cw.Catalogue.Name),
			CatalogueID: id,
			PriceCents:  zomatoDeliveryPriceCents(cw),
			ImageURL:    imageURL,
			ThumbURL:    thumbURL,
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
