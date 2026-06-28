package services

import "testing"

func TestZomatoCatalogueImageURL(t *testing.T) {
	imageURL, thumbURL := zomatoCatalogueImageURL(zomatoCatalogue{
		ImageURL: "https://b.zmtcdn.com/data/dish_photos/9a4/photo.png",
		ThumbURL: "https://b.zmtcdn.com/data/dish_photos/9a4/photo.png?fit=thumb",
	})
	if imageURL != "https://b.zmtcdn.com/data/dish_photos/9a4/photo.png" {
		t.Fatalf("imageURL=%q", imageURL)
	}
	if thumbURL != "https://b.zmtcdn.com/data/dish_photos/9a4/photo.png?fit=thumb" {
		t.Fatalf("thumbURL=%q", thumbURL)
	}
}

func TestParseZomatoMenuJSONImageURL(t *testing.T) {
	raw := []byte(`{
		"data": {
			"menuResponse": {
				"categoryWrappers": [{
					"category": {"name": "Dal"},
					"subCategoryWrappers": [{
						"subCategoryEntities": [{"entityType": "catalogue", "entityId": "750814382"}]
					}]
				}],
				"catalogueWrappers": [{
					"catalogue": {
						"catalogueId": "750814382",
						"name": "Dal Fry",
						"imageUrl": "https://b.zmtcdn.com/data/dish_photos/9a4/a75d28e888082deeaf7a48cd82cfe9a4.png",
						"thumbUrl": "https://b.zmtcdn.com/data/dish_photos/9a4/a75d28e888082deeaf7a48cd82cfe9a4.png?fit=around"
					},
					"variantWrappers": [{
						"variantPrices": [{"service": "delivery", "price": 120, "isVisible": true}]
					}]
				}]
			}
		}
	}`)
	dishes, err := ParseZomatoMenuJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(dishes) != 1 {
		t.Fatalf("got %d dishes", len(dishes))
	}
	if dishes[0].ImageURL == "" {
		t.Fatal("expected image url from zomato")
	}
	if dishes[0].CatalogueID != "750814382" {
		t.Fatalf("catalogue id=%q", dishes[0].CatalogueID)
	}
}
