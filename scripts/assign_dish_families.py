#!/usr/bin/env python3
"""Assign dish_family and variant_style on every row in dishes/catalog.json."""

from __future__ import annotations

import json
from pathlib import Path

CATALOG = Path(__file__).resolve().parents[1] / "backend/internal/services/dishes/catalog.json"

# Regional / distinct dals — own weekly slot, not interchangeable with home-style dal.
DAL_REGIONAL_IDS = {
    "gujarati-dal",
    "amti",
    "varan",
    "sambhar-style-dal",
    "khatti-dal",
    "dalma",
    "tomato-pappu",
    "palakura-pappu",
    "mango-dal",
    "dosakaya-pappu",
}

# Home-style dal family (interchangeable by lentil type within same variant_style).
DAL_HOME_IDS = {
    "dal-tadka",
    "moong-dal-tadka",
    "toor-dal-fry",
    "dal-fry-restaurant-style",
    "masoor-dal",
    "chana-dal",
    "green-moong-dal",
    "plain-yellow-moong-dal",
    "sukhi-moong-dal",
    "dhuli-urad-dal",
    "sabut-masoor-dal",
    "moong-masoor-dal",
    "urad-dal-maa-ki-dal",
    "dhaba-dal",
    "dal-lasooni",
    "saunf-wali-dal",
    "masoor-dal-palak",
    "dal-palak",
    "chana-dal-palak",
    "chana-dal-lauki",
    "dal-makhani",
    "panchmel-dal",
    "dal-rice-plate",
}

KHICHDI_FAMILIES = {
    "moong-dal-khichdi": "khichdi-moong",
    "bhuni-moong-dal-khichuri": "khichdi-moong",
    "sabudana-khichdi": "khichdi-sabudana",
    "sabudana-khichdi-dinner": "khichdi-sabudana",
    "masala-khichdi": "khichdi-rice",
    "vegetable-khichdi": "khichdi-rice",
    "dal-khichdi": "khichdi-rice",
    "palak-khichdi": "khichdi-rice",
    "bajra-khichdi": "khichdi-bajra",
    "oats-khichdi": "khichdi-oats",
}

PARATHA_LAYERED = {"lachha-paratha"}
PARATHA_TAWA = {"tawa-paratha"}
PARATHA_PLAIN = {"jeera-ajwain-paratha"}


def dal_variant_style(dish_id: str, name: str) -> str:
    slug = dish_id.lower()
    label = name.lower()
    if "makhani" in slug:
        return "makhani"
    if "panchmel" in slug:
        return "panchmel"
    if "tadka" in slug or "tadka" in label:
        return "tadka"
    if "fry" in slug or " fry" in label:
        return "fry"
    if "lauki" in slug:
        return "lauki"
    if "palak" in slug or "palak" in label:
        return "palak"
    return "plain"


def paratha_variant_style(dish_id: str) -> str:
    if dish_id in PARATHA_LAYERED:
        return "layered"
    if dish_id in PARATHA_TAWA:
        return "tawa"
    if dish_id in PARATHA_PLAIN:
        return "plain"
    return "stuffed"


def infer_family(dish: dict) -> tuple[str, str | None]:
    dish_id = dish["id"]
    name = dish.get("name", "")
    tags = set(dish.get("tags") or [])
    slug = dish_id.lower()

    if dish_id in DAL_REGIONAL_IDS:
        return dish_id, None

    if dish_id in DAL_HOME_IDS or (
        "daily-dal" in tags
        and dish_id not in DAL_REGIONAL_IDS
        and "pappu" not in slug
    ):
        return "dal", dal_variant_style(dish_id, name)

    if dish_id in KHICHDI_FAMILIES:
        return KHICHDI_FAMILIES[dish_id], None

    if "poha" in slug:
        return "poha", None

    if dish_id == "hyderabadi-veg-biryani":
        return dish_id, None
    if "biryani" in slug:
        return "biryani", None

    if dish_id == "kashmiri-pulao":
        return dish_id, None
    if "pulao" in slug and "biryani" not in slug:
        return "pulao", None

    if "paratha" in slug:
        return "paratha", paratha_variant_style(dish_id)

    if "fried-rice" in slug:
        return "fried-rice", None

    if "upma" in slug:
        return "upma", None

    if "dosa" in slug and "pappu" not in slug:
        style = "stuffed" if "masala" in slug or "mysore" in slug else "plain"
        return "dosa", style

    if slug.endswith("-idli"):
        base = slug.removesuffix("-idli") or "plain"
        return "idli", base

    for base in ("aloo-gobi", "matar-paneer"):
        if slug.startswith(base):
            if "dry" in slug:
                return base, "dry"
            if "gravy" in slug or "rasedar" in slug:
                return base, "gravy"
            if slug == base:
                return base, "default"

    if "kadhi" in slug:
        return "kadhi", dish_id

    if "rasam" in slug and "sambar" not in slug:
        return "rasam", dish_id

    if "sambar" in slug:
        return "sambar", dish_id

    return dish_id, None


def main() -> None:
    dishes = json.loads(CATALOG.read_text(encoding="utf-8"))
    families: dict[str, list[str]] = {}
    for dish in dishes:
        family, style = infer_family(dish)
        dish["dish_family"] = family
        if style:
            dish["variant_style"] = style
        else:
            dish.pop("variant_style", None)
        families.setdefault(family, []).append(dish["id"])

    multi = {k: v for k, v in families.items() if len(v) > 1}
    print(f"Assigned {len(dishes)} dishes into {len(families)} families ({len(multi)} with 2+ members)")
    for family, members in sorted(multi.items(), key=lambda x: -len(x[1]))[:25]:
        print(f"  {family} ({len(members)}): {', '.join(members[:5])}{'...' if len(members) > 5 else ''}")

    dal_members = [d["id"] for d in dishes if d.get("dish_family") == "dal"]
    print(f"\ndal family: {len(dal_members)} dishes")
    regional = [d["id"] for d in dishes if d["id"] in DAL_REGIONAL_IDS]
    print(f"regional self-family dals: {len(regional)}")

    CATALOG.write_text(json.dumps(dishes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {CATALOG}")


if __name__ == "__main__":
    main()
