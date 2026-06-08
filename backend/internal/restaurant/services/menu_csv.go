package services

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var menuCSVHeader = []string{
	"Dish Name",
	"Category",
	"Price (INR)",
	"Active",
	"Ingredients",
}

var ingredientQtyUnitRE = regexp.MustCompile(`^(.+?)\s+([\d,.]+)\s*([a-zA-Z]+)?$`)
var ingredientParenInnerRE = regexp.MustCompile(`^([\d,.]+)\s*([a-zA-Z]+)?$`)

// ExportMenuCSV builds a spreadsheet-friendly menu file (UTF-8 with BOM for Excel).
func (s *MenuService) ExportMenuCSV(ctx context.Context, kitchenID string) ([]byte, int, error) {
	doc, err := s.exportMenuDishes(ctx, kitchenID)
	if err != nil {
		return nil, 0, err
	}

	var buf bytes.Buffer
	buf.WriteString("\ufeff") // Excel UTF-8 BOM
	w := csv.NewWriter(&buf)
	if err := w.Write(menuCSVHeader); err != nil {
		return nil, 0, err
	}

	dishCount := len(doc)
	for _, dish := range doc {
		priceStr := formatPriceINR(dish.PriceCents)
		active := "Yes"
		if !dish.IsActive {
			active = "No"
		}
		if err := w.Write([]string{
			dish.Name,
			dish.Category,
			priceStr,
			active,
			formatIngredientsCell(dish.Ingredients),
		}); err != nil {
			return nil, 0, err
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, 0, err
	}
	return buf.Bytes(), dishCount, nil
}

func formatIngredientsCell(ings []MenuExportIngredient) string {
	parts := make([]string, 0, len(ings))
	for _, ing := range ings {
		name := strings.TrimSpace(ing.IngredientName)
		if name == "" {
			continue
		}
		qty := trimFloat(ing.Qty)
		unit := strings.TrimSpace(ing.Unit)
		switch {
		case qty != "" && qty != "0" && unit != "":
			parts = append(parts, fmt.Sprintf("%s %s %s", name, qty, unit))
		case qty != "" && qty != "0":
			parts = append(parts, fmt.Sprintf("%s %s", name, qty))
		default:
			parts = append(parts, name)
		}
	}
	return strings.Join(parts, ", ")
}

// ImportMenuCSV reads a spreadsheet export and upserts dishes + recipes.
func (s *MenuService) ImportMenuCSV(ctx context.Context, kitchenID string, raw []byte) (*MenuImportResult, error) {
	dishes, err := parseMenuCSV(raw)
	if err != nil {
		return nil, err
	}
	return s.importMenuDishes(ctx, kitchenID, dishes)
}

func parseMenuCSV(raw []byte) ([]MenuExportDish, error) {
	raw = bytes.TrimPrefix(raw, []byte("\ufeff"))
	r := csv.NewReader(bytes.NewReader(raw))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	records, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("invalid CSV file")
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("CSV file is empty")
	}

	header := normalizeCSVHeader(records[0])
	col := mapCSVColumns(header)
	if col.name < 0 {
		return nil, fmt.Errorf(`CSV must include a "Dish Name" column`)
	}
	if col.ingredients >= 0 {
		return parseMenuCSVOneRowPerDish(records[1:], col)
	}
	if col.ingredient >= 0 {
		return parseMenuCSVMultiRow(records[1:], col)
	}
	return nil, fmt.Errorf(`CSV must include an "Ingredients" column`)
}

func parseMenuCSVOneRowPerDish(records [][]string, col menuCSVCols) ([]MenuExportDish, error) {
	out := make([]MenuExportDish, 0, len(records))
	for i, row := range records {
		if len(row) == 0 || csvRowBlank(row) {
			continue
		}
		name := csvField(row, col.name)
		if name == "" {
			continue
		}
		category := csvField(row, col.category)
		if category == "" {
			category = "general"
		}
		priceCents, err := parsePriceINR(csvField(row, col.price))
		if err != nil {
			return nil, fmt.Errorf("row %d: %w", i+2, err)
		}
		out = append(out, MenuExportDish{
			Name:        name,
			Category:    category,
			PriceCents:  priceCents,
			IsActive:    parseActive(csvField(row, col.active)),
			Ingredients: parseIngredientsCell(csvField(row, col.ingredients)),
		})
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no dishes found in CSV")
	}
	return out, nil
}

func parseMenuCSVMultiRow(records [][]string, col menuCSVCols) ([]MenuExportDish, error) {
	type dishKey struct {
		name string
	}
	dishes := map[dishKey]*MenuExportDish{}
	order := make([]dishKey, 0)

	for i, row := range records {
		if len(row) == 0 || csvRowBlank(row) {
			continue
		}
		name := csvField(row, col.name)
		if name == "" {
			continue
		}
		key := dishKey{name: strings.ToLower(name)}
		d, ok := dishes[key]
		if !ok {
			category := csvField(row, col.category)
			if category == "" {
				category = "general"
			}
			priceCents, err := parsePriceINR(csvField(row, col.price))
			if err != nil {
				return nil, fmt.Errorf("row %d: %w", i+2, err)
			}
			d = &MenuExportDish{
				Name:        name,
				Category:    category,
				PriceCents:  priceCents,
				IsActive:    parseActive(csvField(row, col.active)),
				Ingredients: []MenuExportIngredient{},
			}
			dishes[key] = d
			order = append(order, key)
		}
		ingName := csvField(row, col.ingredient)
		if ingName == "" {
			continue
		}
		qty, _ := parseCSVFloat(csvField(row, col.qty))
		unit := csvField(row, col.unit)
		d.Ingredients = append(d.Ingredients, MenuExportIngredient{
			IngredientName: ingName,
			Qty:            qty,
			Unit:           unit,
		})
	}

	if len(order) == 0 {
		return nil, fmt.Errorf("no dishes found in CSV")
	}
	out := make([]MenuExportDish, 0, len(order))
	for _, key := range order {
		out = append(out, *dishes[key])
	}
	return out, nil
}

func parseIngredientsCell(raw string) []MenuExportIngredient {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []MenuExportIngredient{}
	}
	parts := strings.Split(raw, ",")
	out := make([]MenuExportIngredient, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		name, qty, unit := parseIngredientToken(part)
		out = append(out, MenuExportIngredient{
			IngredientName: name,
			Qty:            qty,
			Unit:           unit,
		})
	}
	return out
}

func parseIngredientToken(raw string) (name string, qty float64, unit string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", 0, ""
	}

	// "toor dal (80 g)" or "ginger (10 g)"
	if open := strings.Index(raw, "("); open > 0 && strings.HasSuffix(raw, ")") {
		name = strings.TrimSpace(raw[:open])
		inner := strings.TrimSpace(raw[open+1 : len(raw)-1])
		if m := ingredientParenInnerRE.FindStringSubmatch(inner); len(m) >= 2 {
			qty, _ = parseCSVFloat(m[1])
			if len(m) >= 3 {
				unit = strings.TrimSpace(m[2])
			}
			return name, qty, unit
		}
		if m := ingredientQtyUnitRE.FindStringSubmatch(inner); len(m) >= 3 {
			qty, _ = parseCSVFloat(m[2])
			if len(m) >= 4 {
				unit = strings.TrimSpace(m[3])
			}
			return name, qty, unit
		}
		return name, 0, ""
	}

	// "toor dal 80 g" or "onion 50g"
	if m := ingredientQtyUnitRE.FindStringSubmatch(raw); len(m) >= 3 {
		name = strings.TrimSpace(m[1])
		qty, _ = parseCSVFloat(m[2])
		if len(m) >= 4 {
			unit = strings.TrimSpace(m[3])
		}
		if unit == "" && strings.HasSuffix(m[2], "g") {
			// shouldn't happen with regex but guard glued units
		}
		return name, qty, unit
	}

	// "onion 50g" — qty+unit glued to last token
	fields := strings.Fields(raw)
	if len(fields) >= 2 {
		last := fields[len(fields)-1]
		if q, u, ok := splitGluedQtyUnit(last); ok {
			name = strings.Join(fields[:len(fields)-1], " ")
			return name, q, u
		}
	}

	return raw, 0, ""
}

func splitGluedQtyUnit(token string) (qty float64, unit string, ok bool) {
	token = strings.TrimSpace(token)
	if token == "" {
		return 0, "", false
	}
	i := 0
	for i < len(token) && (token[i] == '.' || token[i] == ',' || (token[i] >= '0' && token[i] <= '9')) {
		i++
	}
	if i == 0 {
		return 0, "", false
	}
	numPart := strings.ReplaceAll(token[:i], ",", "")
	u := strings.TrimSpace(token[i:])
	q, err := strconv.ParseFloat(numPart, 64)
	if err != nil {
		return 0, "", false
	}
	return q, u, true
}

type menuCSVCols struct {
	name, category, price, active, ingredients, ingredient, qty, unit int
}

func mapCSVColumns(header []string) menuCSVCols {
	c := menuCSVCols{
		name: -1, category: -1, price: -1, active: -1,
		ingredients: -1, ingredient: -1, qty: -1, unit: -1,
	}
	for i, h := range header {
		switch h {
		case "dish name", "dish", "name", "item", "menu item":
			c.name = i
		case "category", "group", "section":
			c.category = i
		case "price (inr)", "price inr", "price", "price (rs)", "price rs", "mrp":
			c.price = i
		case "active", "available", "enabled":
			c.active = i
		case "ingredients", "ingredient list", "recipe", "bom":
			c.ingredients = i
		case "ingredient", "stock item":
			c.ingredient = i
		case "qty", "quantity", "amount":
			c.qty = i
		case "unit", "uom":
			c.unit = i
		}
	}
	return c
}

func normalizeCSVHeader(row []string) []string {
	out := make([]string, len(row))
	for i, cell := range row {
		out[i] = strings.ToLower(strings.TrimSpace(cell))
	}
	return out
}

func csvField(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

func csvRowBlank(row []string) bool {
	for _, cell := range row {
		if strings.TrimSpace(cell) != "" {
			return false
		}
	}
	return true
}

func formatPriceINR(priceCents int) string {
	if priceCents%100 == 0 {
		return strconv.Itoa(priceCents / 100)
	}
	return fmt.Sprintf("%.2f", float64(priceCents)/100)
}

func trimFloat(v float64) string {
	s := fmt.Sprintf("%.3f", v)
	s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	if s == "" {
		return "0"
	}
	return s
}

func parsePriceINR(raw string) (int, error) {
	raw = strings.TrimSpace(strings.ReplaceAll(raw, "₹", ""))
	raw = strings.ReplaceAll(raw, ",", "")
	if raw == "" {
		return 0, nil
	}
	if strings.Contains(raw, ".") {
		f, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return 0, fmt.Errorf("invalid price %q", raw)
		}
		return int(f*100 + 0.5), nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid price %q", raw)
	}
	return n * 100, nil
}

func parseActive(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "yes", "y", "true", "1", "active", "on":
		return true
	case "no", "n", "false", "0", "inactive", "off":
		return false
	default:
		return true
	}
}

func parseCSVFloat(raw string) (float64, error) {
	raw = strings.TrimSpace(strings.ReplaceAll(raw, ",", ""))
	if raw == "" {
		return 0, nil
	}
	return strconv.ParseFloat(raw, 64)
}
