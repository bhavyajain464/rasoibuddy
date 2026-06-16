package services

import "strings"

// DishImageVariant is a delivery size for photorealistic dish photos.
type DishImageVariant string

const (
	DishImageHero  DishImageVariant = "hero"
	DishImageCard  DishImageVariant = "card"
	DishImageThumb DishImageVariant = "thumb"
)

func dishImagePath(id string, variant DishImageVariant) string {
	switch variant {
	case DishImageHero:
		return id + ".webp"
	case DishImageCard:
		return "card/" + id + ".webp"
	case DishImageThumb:
		return "thumb/" + id + ".webp"
	default:
		return "card/" + id + ".webp"
	}
}

// DishImageURL builds a CDN URL for a catalog dish image. Returns empty when CDN base unset.
func DishImageURL(cdnBase, dishID string, variant DishImageVariant) string {
	base := strings.TrimRight(strings.TrimSpace(cdnBase), "/")
	id := strings.TrimSpace(dishID)
	if base == "" || id == "" {
		return ""
	}
	return base + "/" + dishImagePath(id, variant)
}

// DishImageURLs returns hero/card/thumb URLs for a dish id.
func DishImageURLs(cdnBase, dishID string) map[string]string {
	out := map[string]string{}
	for _, variant := range []DishImageVariant{DishImageHero, DishImageCard, DishImageThumb} {
		if url := DishImageURL(cdnBase, dishID, variant); url != "" {
			out[string(variant)] = url
		}
	}
	return out
}
