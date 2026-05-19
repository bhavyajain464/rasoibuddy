#!/usr/bin/env python3
"""Merge indian_food.csv + Multi_Cuisine rows into dishes/catalog.json (new schema)."""

import csv
import json
import re
from pathlib import Path

INDIAN_FOOD = Path("/Users/bhavyajain/Downloads/indian_food.csv")
MULTI_CUISINE = Path("/Users/bhavyajain/Downloads/Multi_Cuisine_Recipe_Dataset.csv")
OUT = Path(__file__).resolve().parent.parent / "internal/services/dishes/catalog.json"

NON_VEG = re.compile(
    r"\b(chicken|mutton|lamb|fish|prawn|shrimp|seafood|meat|keema|"
    r"tuna|salmon|beef|pork|bacon|ham|turkey|duck|crab|lobster)\b",
    re.I,
)
EGG = re.compile(r"\b(egg|eggs|omelette|omelet|bhurji)\b", re.I)

REGION_MAP = {
    "north": "north-indian",
    "south": "south-indian",
    "east": "east-indian",
    "west": "west-indian",
}

MEAL_SLOTS = ("breakfast", "lunch", "dinner", "snack", "dessert", "side")


def unified_cuisine(area: str, region: str = "") -> str:
    region = (region or "").strip().lower()
    if region in REGION_MAP:
        return REGION_MAP[region]
    area = re.sub(r"\s+", "_", (area or "indian").strip().lower())
    return area


def norm_key(name: str) -> str:
    return re.sub(r"\s+", " ", name.lower().strip())


def clean_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name.strip())
    return name[:120] if len(name) > 120 else name


def tokenize_ingredients(text: str, limit: int = 10) -> list[str]:
    if not text:
        return []
    parts = re.split(r"[,;]", text.lower())
    out = []
    for p in parts:
        p = re.sub(r"\d+[^a-z]*", " ", p)
        p = re.sub(r"[^a-z\s]", " ", p)
        for w in p.split():
            w = w.strip()
            if len(w) < 3 or w in {
                "cup",
                "cups",
                "tablespoon",
                "teaspoon",
                "grams",
                "the",
                "and",
                "with",
            }:
                continue
            if w not in out:
                out.append(w)
            if len(out) >= limit:
                return out
    return out


def course_to_meal_types(course_or_cat: str) -> list[str]:
    c = (course_or_cat or "").lower()
    slots: set[str] = set()
    if any(x in c for x in ("breakfast", "brunch")):
        slots.add("breakfast")
    if any(x in c for x in ("lunch", "main", "course", "dinner")):
        slots.update({"lunch", "dinner"})
    if "dinner" in c:
        slots.add("dinner")
    if any(x in c for x in ("snack", "appetizer", "starter")):
        slots.add("snack")
    if any(x in c for x in ("dessert", "sweet")):
        slots.add("dessert")
    if "side" in c:
        slots.add("side")
    if not slots:
        slots.update({"lunch", "dinner"})
    return sorted(slots, key=lambda s: MEAL_SLOTS.index(s) if s in MEAL_SLOTS else 99)


def diet_slug(diet_field: str, name: str) -> str:
    d = (diet_field or "").lower()
    if "vegan" in d:
        return "vegan"
    if NON_VEG.search(name):
        return "non-veg"
    if EGG.search(name) or "egg" in d:
        return "eggetarian"
    if "non" in d or "non-veg" in d or "nonveg" in d:
        return "non-veg"
    return "vegetarian"


def merge_dish(store: dict, entry: dict) -> None:
    key = norm_key(entry["name"])
    if not key:
        return
    if key not in store:
        store[key] = entry
        return
    cur = store[key]
    if not cur.get("cuisine") and entry.get("cuisine"):
        cur["cuisine"] = entry["cuisine"]
    elif cur.get("cuisine") == "indian" and entry.get("cuisine", "").endswith("-indian"):
        cur["cuisine"] = entry["cuisine"]
    # Prefer stricter diet when merging duplicates.
    rank = {"vegan": 0, "vegetarian": 1, "eggetarian": 2, "non-veg": 3}
    if rank.get(entry.get("diet", ""), 9) < rank.get(cur.get("diet", ""), 9):
        cur["diet"] = entry["diet"]
    cur["meal_type"] = sorted(set(cur.get("meal_type", [])) | set(entry.get("meal_type", [])))
    cur["ingredients"] = list(
        dict.fromkeys(cur.get("ingredients", []) + entry.get("ingredients", []))
    )[:12]


def load_indian_food(store: dict) -> None:
    with INDIAN_FOOD.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = clean_name(row.get("name", ""))
            if not name:
                continue
            region_raw = (row.get("region") or "").strip().lower()
            cuisine = unified_cuisine("indian", region_raw)
            course = row.get("course", "")
            ingredients = tokenize_ingredients(row.get("ingredients", ""))
            if row.get("flavor_profile"):
                ingredients.append(row["flavor_profile"].lower())
            merge_dish(
                store,
                {
                    "name": name,
                    "cuisine": cuisine,
                    "diet": diet_slug(row.get("diet", ""), name),
                    "meal_type": course_to_meal_types(course),
                    "ingredients": ingredients[:12],
                },
            )


def load_multi_cuisine_all(store: dict) -> None:
    with MULTI_CUISINE.open(encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            name = clean_name(row.get("name", ""))
            if not name:
                continue
            area = (row.get("area") or "Indian").strip()
            cuisine = unified_cuisine(area)
            cat_field = row.get("category", "")
            ingredients = tokenize_ingredients(row.get("ingredients", ""))
            merge_dish(
                store,
                {
                    "name": name,
                    "cuisine": cuisine,
                    "diet": diet_slug("", name),
                    "meal_type": course_to_meal_types(cat_field),
                    "ingredients": ingredients[:12],
                },
            )


def main() -> None:
    store: dict[str, dict] = {}
    load_indian_food(store)
    load_multi_cuisine_all(store)
    dishes = sorted(store.values(), key=lambda d: (d.get("cuisine", ""), d["name"].lower()))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        json.dump(dishes, f, ensure_ascii=False, indent=2)
        f.write("\n")
    by_diet: dict[str, int] = {}
    for d in dishes:
        diet = d.get("diet", "?")
        by_diet[diet] = by_diet.get(diet, 0) + 1
    print(f"Wrote {len(dishes)} dishes to {OUT}")
    print("By diet:", dict(sorted(by_diet.items(), key=lambda x: -x[1])))


if __name__ == "__main__":
    main()
