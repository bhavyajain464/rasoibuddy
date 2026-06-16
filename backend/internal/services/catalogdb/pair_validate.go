package catalogdb

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// PairRefKind is how a pairs_with label resolves in the catalog graph.
type PairRefKind string

const (
	PairRefDish       PairRefKind = "dish"
	PairRefIngredient PairRefKind = "ingredient"
)

// PairRef is a registered pairs_with target (stable catalog id).
type PairRef struct {
	Kind    PairRefKind `json:"kind"`
	ID      string      `json:"id"`
	Display string      `json:"display,omitempty"`
}

// PairLabelAudit is the resolution result for one pairs_with string.
type PairLabelAudit struct {
	Label    string   `json:"label"`
	Resolved bool     `json:"resolved"`
	Ref      *PairRef `json:"ref,omitempty"`
	Count    int      `json:"count"`
}

// PairCatalogResolver validates pairs_with labels against dishes + ingredients JSON.
type PairCatalogResolver struct {
	dishes       map[string]dishRaw
	dishByNorm   map[string]string
	dishByID     map[string]dishRaw
	alias        *aliasIndex
	displayName  map[string]string // id -> display
	pairRegistry map[string]PairRef
}

// NewPairCatalogResolver builds an offline resolver from catalog JSON bytes.
// pairRegistry may be nil to use built-in defaults (tests / no DB).
func NewPairCatalogResolver(ingredientsJSON, dishesJSON []byte, pairRegistry map[string]PairRef) (*PairCatalogResolver, error) {
	var ingFile ingredientsFile
	if err := json.Unmarshal(ingredientsJSON, &ingFile); err != nil {
		return nil, fmt.Errorf("parse ingredients: %w", err)
	}
	var dishes []dishRaw
	if err := json.Unmarshal(dishesJSON, &dishes); err != nil {
		return nil, fmt.Errorf("parse dishes: %w", err)
	}
	idx := newAliasIndexFromIngredientsFile(ingFile)
	r := &PairCatalogResolver{
		dishes:       map[string]dishRaw{},
		dishByNorm:   map[string]string{},
		dishByID:     map[string]dishRaw{},
		alias:        idx,
		displayName:  map[string]string{},
		pairRegistry: pairRegistryOrDefaults(pairRegistry),
	}
	for _, d := range dishes {
		id := strings.TrimSpace(d.ID)
		if id == "" {
			id = slugify(d.Name)
		}
		if id == "" {
			continue
		}
		r.dishes[id] = d
		r.dishByID[id] = d
		display := strings.TrimSpace(d.DisplayName)
		if display == "" {
			display = strings.TrimSpace(d.Name)
		}
		r.displayName[id] = display
		for _, candidate := range []string{id, d.Name, display} {
			key := normalizePairToken(candidate)
			if key == "" {
				continue
			}
			if _, exists := r.dishByNorm[key]; !exists {
				r.dishByNorm[key] = id
			}
		}
	}
	for _, e := range ingFile.Ingredients {
		id := strings.TrimSpace(e.ID)
		if id == "" {
			continue
		}
		name := strings.TrimSpace(e.Canonical)
		if name != "" {
			r.displayName[id] = name
		}
	}
	return r, nil
}

func newAliasIndexFromIngredientsFile(ingFile ingredientsFile) *aliasIndex {
	ambiguousKeys := map[string]bool{}
	for key := range ingFile.AmbiguousAliases {
		ambiguousKeys[normalizePairToken(key)] = true
	}
	idx := &aliasIndex{
		byID:        map[string]string{},
		byNorm:      map[string]string{},
		byNormCount: map[string]int{},
		ambiguous:   map[string]bool{},
	}
	for _, e := range ingFile.Ingredients {
		id := strings.TrimSpace(e.ID)
		name := strings.TrimSpace(e.Canonical)
		if id == "" || name == "" {
			continue
		}
		idx.byID[strings.ToLower(id)] = id
		aliases := []string{name, id}
		aliases = append(aliases, e.Synonyms...)
		seen := map[string]bool{}
		for _, alias := range aliases {
			alias = strings.TrimSpace(alias)
			if alias == "" {
				continue
			}
			norm := normalizePairToken(alias)
			if norm == "" || seen[norm] {
				continue
			}
			seen[norm] = true
			isAmbiguous := ambiguousKeys[norm]
			idx.entries = append(idx.entries, aliasEntry{
				norm:         norm,
				ingredientID: id,
				ambiguous:    isAmbiguous,
			})
			idx.byNormCount[norm]++
			if isAmbiguous {
				idx.ambiguous[norm] = true
			}
		}
	}
	for _, e := range idx.entries {
		if e.ambiguous || idx.byNormCount[e.norm] > 1 {
			continue
		}
		idx.byNorm[e.norm] = e.ingredientID
	}
	return idx
}

func normalizePairToken(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// ResolvePairLabel maps a pairs_with label to a registered dish or ingredient id.
func (r *PairCatalogResolver) ResolvePairLabel(label string) (PairRef, bool) {
	label = strings.TrimSpace(label)
	if label == "" {
		return PairRef{}, false
	}
	if ref, ok := r.pairRegistry[label]; ok {
		if ref.Kind == PairRefDish {
			if d, ok := r.dishByID[ref.ID]; ok {
				display := r.displayName[ref.ID]
				if display == "" {
					display = d.Name
				}
				return PairRef{Kind: PairRefDish, ID: ref.ID, Display: display}, true
			}
		}
		if ref.Kind == PairRefIngredient {
			if id := r.alias.byID[strings.ToLower(ref.ID)]; id != "" {
				return PairRef{Kind: PairRefIngredient, ID: id, Display: r.displayName[id]}, true
			}
			if ingID := r.alias.resolve(ref.ID); ingID != "" {
				return PairRef{Kind: PairRefIngredient, ID: ingID, Display: r.displayName[ingID]}, true
			}
		}
	}

	if id, ok := r.resolveDishLabel(label); ok {
		return PairRef{Kind: PairRefDish, ID: id, Display: r.displayName[id]}, true
	}
	parts := splitPairSlash(label)
	sort.Slice(parts, func(i, j int) bool { return len(parts[i]) > len(parts[j]) })
	for _, part := range parts {
		if id, ok := r.resolveDishLabel(part); ok {
			return PairRef{Kind: PairRefDish, ID: id, Display: r.displayName[id]}, true
		}
	}
	if strings.Contains(label, " ") && !strings.Contains(label, "/") {
		if id, ok := r.resolveDishByFuzzyName(label); ok {
			return PairRef{Kind: PairRefDish, ID: id, Display: r.displayName[id]}, true
		}
	}
	for _, part := range parts {
		if strings.Contains(part, " ") {
			if id, ok := r.resolveDishByFuzzyName(part); ok {
				return PairRef{Kind: PairRefDish, ID: id, Display: r.displayName[id]}, true
			}
		}
	}
	for _, part := range append(parts, label) {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if ingID := r.alias.resolveExact(part); ingID != "" {
			return PairRef{Kind: PairRefIngredient, ID: ingID, Display: r.displayName[ingID]}, true
		}
	}
	return PairRef{}, false
}

func (idx *aliasIndex) resolveExact(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	lower := strings.ToLower(token)
	if id, ok := idx.byID[lower]; ok {
		return id
	}
	if id, ok := idx.byID[strings.ReplaceAll(lower, " ", "_")]; ok {
		return id
	}
	if id, ok := idx.byNorm[normalizePairToken(token)]; ok {
		return id
	}
	return ""
}

func (r *PairCatalogResolver) resolveDishLabel(label string) (string, bool) {
	label = strings.TrimSpace(label)
	if label == "" {
		return "", false
	}
	if _, ok := r.dishByID[label]; ok {
		return label, true
	}
	slug := slugify(label)
	if _, ok := r.dishByID[slug]; ok {
		return slug, true
	}
	key := normalizePairToken(label)
	if id, ok := r.dishByNorm[key]; ok {
		return id, true
	}
	return "", false
}

func (r *PairCatalogResolver) resolveDishByFuzzyName(label string) (string, bool) {
	key := normalizePairToken(label)
	if key == "" {
		return "", false
	}
	bestID := ""
	bestScore := 0
	for id, d := range r.dishByID {
		for _, candidate := range []string{normalizePairToken(d.Name), normalizePairToken(d.DisplayName)} {
			if candidate == "" {
				continue
			}
			if candidate == key {
				return id, true
			}
			score := 0
			if strings.Contains(candidate, key) {
				score = len(key)
			} else if strings.Contains(key, candidate) {
				score = len(candidate)
			}
			if score > bestScore {
				bestID = id
				bestScore = score
			}
		}
	}
	if bestScore >= 4 {
		return bestID, true
	}
	return "", false
}

func splitPairSlash(pair string) []string {
	pair = strings.TrimSpace(pair)
	if pair == "" {
		return nil
	}
	if !strings.Contains(pair, "/") {
		return []string{pair}
	}
	raw := strings.Split(pair, "/")
	out := make([]string, 0, len(raw))
	for _, p := range raw {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []string{pair}
	}
	return out
}

// NormalizePairLabel returns the canonical catalog id for a pairs_with label.
func (r *PairCatalogResolver) NormalizePairLabel(label string) (string, error) {
	ref, ok := r.ResolvePairLabel(label)
	if !ok {
		return "", fmt.Errorf("unregistered pairs_with label %q", label)
	}
	return ref.ID, nil
}

// AuditPairsWith scans dish catalog JSON and reports all pairs_with labels.
func AuditPairsWith(dishesJSON []byte, ingredientsJSON []byte) ([]PairLabelAudit, error) {
	r, err := NewPairCatalogResolver(ingredientsJSON, dishesJSON, nil)
	if err != nil {
		return nil, err
	}
	var dishes []dishRaw
	if err := json.Unmarshal(dishesJSON, &dishes); err != nil {
		return nil, err
	}
	counts := map[string]int{}
	for _, d := range dishes {
		for _, label := range d.PairsWith {
			label = strings.TrimSpace(label)
			if label == "" {
				continue
			}
			counts[label]++
		}
	}
	labels := make([]string, 0, len(counts))
	for label := range counts {
		labels = append(labels, label)
	}
	sort.Strings(labels)
	out := make([]PairLabelAudit, 0, len(labels))
	for _, label := range labels {
		item := PairLabelAudit{Label: label, Count: counts[label]}
		if ref, ok := r.ResolvePairLabel(label); ok {
			item.Resolved = true
			refCopy := ref
			item.Ref = &refCopy
		}
		out = append(out, item)
	}
	return out, nil
}

// ValidateAllPairsWith returns unresolved labels (empty if all registered).
func ValidateAllPairsWith(dishesJSON, ingredientsJSON []byte) ([]string, error) {
	audit, err := AuditPairsWith(dishesJSON, ingredientsJSON)
	if err != nil {
		return nil, err
	}
	var unresolved []string
	for _, a := range audit {
		if !a.Resolved {
			unresolved = append(unresolved, a.Label)
		}
	}
	return unresolved, nil
}
