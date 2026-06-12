# Meal Suggestions — preference-aware & non-repeating

How the dish suggester picks the **best dish for a user**, honours their **profile
preferences**, and ensures suggestions **rotate / don't repeat** while still being varied.

> Scope: consumer/household app meal suggestions (`/api/v1/meals/*`, `ShoppingScreen` is
> unrelated). The restaurant module is not involved.

---

## The pipeline

```
catalog (535 dishes)
   │
   ▼  Stage 1 — HARD FILTERS (drop, don't score)
   │     diet (veg/vegan) · allergens · jain · meal-slot · dislikes
   ▼  Stage 2 — QUALITY SCORE  (taste affinity)
   │     cuisine match · spice match · skill/effort fit · pantry/expiry · popularity
   ▼  Stage 3 — RECENCY DECAY  (anti-repeat)
   │     score *= 1 - exp(-daysSinceLastExposure / halfLife)
   ▼  Stage 4 — VARIANCE  (temperature sampling, not argmax)
   │     weight = (score)^(1/T); sample without replacement; per-day seed
   ▼  shortlist
```

All of this lives in `internal/services/dish_retrieve.go`; the catalog is
`internal/services/dishes/catalog.json`.

### Stage 1 — Hard filters (safety / identity)
- **Diet**: `DishAllowedForUserDiet` on the dish `diet` slug.
- **Allergens**: `dishBlockedByAllergenFlags` maps free-text profile allergies to the dish's
  structured `allergens` flags. This bridges the literal-token gap the old matcher couldn't:
  `"nuts"`→`nuts` (cashew/almond), `"dairy"`→`dairy` (ghee/paneer/cream), `"gluten"`→`gluten`
  (wheat/maida/atta), etc.
- **Jain**: `dishBlockedForJain` excludes any dish that isn't `jain_safe` (onion/garlic/root
  veg) when the profile requests Jain.
- Plus meal-slot and disliked-ingredient filters (pre-existing).

### Stage 2 — Quality score (`scoreDish`)
Token/cuisine affinity + skill/pantry/popularity (pre-existing), **plus** `spiceMatchBoost`:
rewards a dish whose `spice_level` matches the profile, penalises a mild↔spicy mismatch,
neutral when either side is unknown.

### Stage 3 — Recency decay (anti-repeat, pre-existing)
`CatalogRecencyWeight` multiplies the score by `1 - exp(-daysSince / halfLife)` using the
**minimum** of *cooked* and *suggested* exposure. The handler already records suggestions
(`ListRecentMealSuggestionDays`) so a shown-but-not-cooked dish still decays — closing the
"keeps resurfacing" loophole. `halfLife` comes from `half_life_days` / `frequency_class`
(daily≈5, weekly≈10, special≈14).

### Stage 4 — Variance (`SampleRankedDishes`)
Replaces deterministic argmax with **temperature-weighted sampling without replacement**:
```
weight_i = (score_i)^(1/T)
P_i      = weight_i / Σ weight_j
```
- `T` (temperature) is the variance knob: `T→0` ≈ always-best (deterministic),
  `T≈0.7` = mostly-best with healthy rotation, `T→1` = adventurous. Default **0.7** for
  personalized requests; global shared meal-of-day stays deterministic (`T=0`) for caching.
- **Seed** = `hash(userID | date | mealSlot)` (`suggestionSeed` in `meals.go`): a pick is
  **stable within a slot/day** (screen refresh won't reshuffle) but **fresh across days**.

---

## Catalog metadata (added so prefs can be honoured)
Every dish in `catalog.json` now carries:
| Field | Values | Used by |
|-------|--------|---------|
| `spice_level` | `mild` / `medium` / `spicy` | spice soft-score |
| `allergens` | `dairy,gluten,nuts,peanut,sesame,soy,egg` | allergen hard-filter |
| `onion_garlic` | bool | Jain logic |
| `jain_safe` | bool | Jain hard-filter |

> These flags are **heuristic** — derived from each dish's listed `key_ingredients` + name,
> so hidden tempering (peanut/ghee not in the 3–5 listed) can be under-flagged. They
> materially improve filtering but should get a human pass before being marketed as
> "allergy-safe."

## Profile preference coverage
| Pref | Status | Mechanism |
|------|--------|-----------|
| Dietary (veg/vegan) | full | diet slug filter |
| Allergies | filtered | term→flag hard-filter (heuristic flags) |
| Jain | filtered | `jain_safe` hard-filter |
| Spice level | scored | `spiceMatchBoost` |
| Fav cuisines | scored | cuisine boost (N/S Indian strong; regional sub-cuisines weaker) |
| Cooking skill | scored | maps to `effort` |
| Dislikes | filtered | ingredient/name token match |
| Household size | n/a | handled by the cook / portioning, not the catalog |

---

## Also in this change
`data/ingredients.json` — a 773-item ingredient catalog with India-focused synonyms
(English + Hindi + regional names) for name normalization and bill-scan matching, plus an
`ambiguous_aliases` map for cross-language collisions (e.g. *kanda* = onion vs yam).

**Mapping integrity:** every distinct ingredient referenced across the 535 dishes
(316 distinct) resolves to an entry in this catalog — **100% coverage**, verified. New
entries were added where dishes surfaced gaps (e.g. `bathua`, `turkey berry`, `mixed
vegetables`, regional masalas). This guarantees inventory-matching and shopping-list
mapping never hit an unknown ingredient.

## Files
- `backend/internal/services/dish_catalog.go` — new dish fields
- `backend/internal/services/dish_retrieve.go` — allergen/jain filters, spice score, sampler
- `backend/internal/handlers/meals.go` — passes spice pref, seeds the sampler
- `backend/internal/services/dish_retrieve_prefs_test.go` — filter/score/sampler tests
- `backend/internal/services/dishes/catalog.json` — enriched (535 dishes)
- `data/ingredients.json` — ingredient + synonym catalog

## Tuning notes
- Raise `Temperature` for more variety, lower for more "always the best".
- Adjust `half_life_days` per dish (or the `frequency_class` defaults) to make staples
  recur sooner and specials later.

---

## Exhaustive ingredients (inventory matching & shopping list)
`key_ingredients` for all 535 dishes was expanded from 3–5 highlights to the **full
home-recipe list** (avg ~13 items: mains + aromatics + enumerated spices + tempering +
fats + garnish), using normalized lowercase grocery names that line up with inventory
items and `data/ingredients.json`.

This powers two things:
1. **Inventory-aware suggestions** — the retrieval scorer already tokenizes
   `key_ingredients` (`featureTokens` / inventory boost), so a fuller list automatically
   means richer matching between a dish and what's in the pantry. It also makes the
   dislike/allergy token-filters stricter, since hidden onion/ghee/peanut are now listed.
2. **Shopping-list gap** — `MatchDishToInventory(dish, inventoryNames)`
   (`ingredient_match.go`) splits a dish's ingredients into:
   - `Have` — already in inventory,
   - `Missing` — not in inventory and worth buying,
   - `Staples` — assumed-present (salt/oil/turmeric/…), **not** shopping-worthy,
   - `Coverage` — `Have / (Have+Missing)`; `1.0` = fully cookable now.

   Use `Missing` to build the shopping list for a chosen dish; use `Coverage` to rank
   dishes by "cookable right now".

Recomputing `allergens` from the fuller lists is also more accurate (catches tempering
ghee/peanut) and fixed a false-positive where "co**conut**" was flagged as a tree nut.

### Roadmap (built on this data)
- **Shopping list from a meal** — endpoint over `MatchDishToInventory` returning `Missing`
  for a dish or a day's menu (feeds the commerce "order this list" flow).
- **Continuous 7-day plan** — pick 7×(breakfast/lunch/dinner) via the sampler with
  no-repeat + variety, aggregate `Missing` across the week into one shopping list, and
  decrement inventory as meals are cooked/logged.
