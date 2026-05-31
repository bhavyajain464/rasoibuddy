package inventory

import (
	_ "embed"
	"encoding/json"
	"log"
	"sort"
	"strings"
	"sync"
)

// FoodGroupMeta is one filter bucket shown in the inventory UI.
type FoodGroupMeta struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Sort  int    `json:"sort"`
}

type groupsFile struct {
	Version int             `json:"version"`
	Groups  []FoodGroupMeta `json:"groups"`
}

//go:embed ingredient_groups.json
var embeddedGroups []byte

var (
	groupsOnce  sync.Once
	groupsData  groupsFile
	allowedIDs  map[string]struct{}
)

func loadGroups() {
	groupsOnce.Do(func() {
		if err := json.Unmarshal(embeddedGroups, &groupsData); err != nil {
			log.Printf("[food_group] failed to load ingredient_groups.json: %v", err)
			groupsData.Groups = []FoodGroupMeta{{ID: "other", Label: "Other", Sort: 999}}
		}
		sort.Slice(groupsData.Groups, func(i, j int) bool {
			return groupsData.Groups[i].Sort < groupsData.Groups[j].Sort
		})
		allowedIDs = make(map[string]struct{}, len(groupsData.Groups))
		for _, g := range groupsData.Groups {
			allowedIDs[g.ID] = struct{}{}
		}
		log.Printf("[food_group] loaded %d filter groups (LLM assigns group on enrich)", len(groupsData.Groups))
	})
}

// ListFoodGroups returns group metadata for API/UI (sorted).
func ListFoodGroups() []FoodGroupMeta {
	loadGroups()
	out := make([]FoodGroupMeta, len(groupsData.Groups))
	copy(out, groupsData.Groups)
	return out
}

// AllowedGroupIDs returns valid food_group ids for prompts and normalization.
func AllowedGroupIDs() []string {
	loadGroups()
	out := make([]string, 0, len(groupsData.Groups))
	for _, g := range groupsData.Groups {
		out = append(out, g.ID)
	}
	return out
}

// PromptGroupList is a comma-separated list of allowed ids for LLM prompts.
func PromptGroupList() string {
	return PromptGroupListForDietary(nil)
}

// HidesNonVegGroup is true when the user should not see or assign the non_veg pantry bucket.
func HidesNonVegGroup(dietaryTags []string) bool {
	for _, tag := range dietaryTags {
		lower := strings.ToLower(strings.TrimSpace(tag))
		if strings.Contains(lower, "vegetarian") || strings.Contains(lower, "vegan") || strings.Contains(lower, "jain") {
			return true
		}
	}
	return false
}

// ListFoodGroupsForDietary returns filter metadata; omits non_veg for vegetarian/vegan/jain users.
func ListFoodGroupsForDietary(dietaryTags []string) []FoodGroupMeta {
	loadGroups()
	if !HidesNonVegGroup(dietaryTags) {
		return ListFoodGroups()
	}
	out := make([]FoodGroupMeta, 0, len(groupsData.Groups))
	for _, g := range groupsData.Groups {
		if g.ID == "non_veg" {
			continue
		}
		out = append(out, g)
	}
	return out
}

// PromptGroupListForDietary is the allowed id list for LLM prompts (diet-aware).
func PromptGroupListForDietary(dietaryTags []string) string {
	loadGroups()
	ids := AllowedGroupIDs()
	if HidesNonVegGroup(dietaryTags) {
		filtered := make([]string, 0, len(ids))
		for _, id := range ids {
			if id != "non_veg" {
				filtered = append(filtered, id)
			}
		}
		ids = filtered
	}
	return strings.Join(ids, ", ")
}

// NormalizeFoodGroup maps LLM output to a known group id, else "other".
func NormalizeFoodGroup(raw string) string {
	return NormalizeFoodGroupForDietary(raw, nil)
}

// NormalizeFoodGroupForDietary maps LLM output; non_veg is coerced to other for veg/vegan/jain users.
func NormalizeFoodGroupForDietary(raw string, dietaryTags []string) string {
	loadGroups()
	s := strings.TrimSpace(strings.ToLower(raw))
	s = strings.ReplaceAll(s, " ", "_")
	s = strings.ReplaceAll(s, "-", "_")
	if s == "grains" || s == "pulses" || s == "grain" {
		s = "grains_pulses"
	}
	switch s {
	case "protein", "nonveg", "non_veg", "meat", "poultry", "seafood", "fish",
		"chicken", "mutton", "lamb", "pork", "beef", "prawn", "prawns", "shrimp", "egg", "eggs":
		s = "non_veg"
	}
	if _, ok := allowedIDs[s]; ok {
		if s == "non_veg" && HidesNonVegGroup(dietaryTags) {
			return "other"
		}
		return s
	}
	return "other"
}

// FoodGroupLabel returns the display label for a group id.
func FoodGroupLabel(groupID string) string {
	loadGroups()
	for _, g := range groupsData.Groups {
		if g.ID == groupID {
			return g.Label
		}
	}
	return "Other"
}
