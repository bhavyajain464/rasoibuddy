package catalogdb

import (
	"strings"
)

// DisplayPairLabel returns a household-facing label for a canonical pairs_with id.
func DisplayPairLabel(ref PairRef) string {
	if d := strings.TrimSpace(ref.Display); d != "" {
		return d
	}
	return ref.ID
}

// DisplayPairLabels maps canonical pair ids to display labels.
func DisplayPairLabels(resolver *PairCatalogResolver, ids []string) []string {
	if len(ids) == 0 {
		return nil
	}
	out := make([]string, 0, len(ids))
	seen := map[string]bool{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		label := id
		if resolver != nil {
			if ref, ok := resolver.ResolvePairID(id); ok {
				label = DisplayPairLabel(ref)
			}
		}
		key := strings.ToLower(label)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, label)
	}
	return out
}

// ResolvePairID resolves a canonical dish or ingredient id to a PairRef.
func (r *PairCatalogResolver) ResolvePairID(id string) (PairRef, bool) {
	id = strings.TrimSpace(id)
	if id == "" {
		return PairRef{}, false
	}
	if d, ok := r.dishByID[id]; ok {
		display := r.displayName[id]
		if display == "" {
			display = d.Name
		}
		return PairRef{Kind: PairRefDish, ID: id, Display: display}, true
	}
	if ingID := r.alias.byID[strings.ToLower(id)]; ingID != "" {
		return PairRef{Kind: PairRefIngredient, ID: ingID, Display: r.displayName[ingID]}, true
	}
	return PairRef{}, false
}

// NormalizeDishPairsWith validates and canonicalizes pairs_with labels to dish/ingredient ids.
func (r *PairCatalogResolver) NormalizeDishPairsWith(labels []string) ([]string, error) {
	if len(labels) == 0 {
		return nil, nil
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(labels))
	for _, label := range labels {
		label = strings.TrimSpace(label)
		if label == "" {
			continue
		}
		ref, ok := r.ResolvePairLabel(label)
		if !ok {
			if ref2, ok2 := r.ResolvePairID(label); ok2 {
				ref = ref2
				ok = true
			}
		}
		if !ok {
			return nil, &PairLabelError{Label: label}
		}
		if seen[ref.ID] {
			continue
		}
		seen[ref.ID] = true
		out = append(out, ref.ID)
	}
	return out, nil
}

// PairLabelError is returned when pairs_with contains an unregistered label.
type PairLabelError struct {
	Label string
}

func (e *PairLabelError) Error() string {
	return "unregistered pairs_with label: " + e.Label
}
