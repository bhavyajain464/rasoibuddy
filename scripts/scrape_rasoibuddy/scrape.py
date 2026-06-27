#!/usr/bin/env python3
"""Scrape recipes from rasoibuddy.in sitemap into a normalized dataset."""

from __future__ import annotations

import argparse
import csv
import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SITEMAP_URL = "https://rasoibuddy.in/sitemap.xml"
USER_AGENT = "research-bot/1.0 KitchenAI/1.0"
DELAY_SEC = 1.5
SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


def parse_iso_duration(duration: str | None) -> int | None:
    if not duration:
        return None
    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not match:
        return None
    hours, minutes, seconds = (int(part) if part else 0 for part in match.groups())
    total = hours * 60 + minutes + (1 if seconds >= 30 else 0)
    return total if total > 0 else None


def slug_from_url(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1]


def as_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return [value]


def extract_recipe_ld(soup: BeautifulSoup) -> dict | None:
    for ld in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(ld.string)
        except (json.JSONDecodeError, TypeError):
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if item.get("@type") == "Recipe":
                return item
    return None


def normalize_instructions(instructions) -> list[str]:
    steps: list[str] = []
    for step in instructions or []:
        if isinstance(step, dict):
            text = (step.get("text") or step.get("name") or "").strip()
        elif isinstance(step, str):
            text = step.strip()
        else:
            text = ""
        if text:
            steps.append(text)
    return steps


def normalize(raw: dict, url: str) -> dict:
    return {
        "id": slug_from_url(url),
        "url": url,
        "name": raw.get("name"),
        "description": raw.get("description"),
        "headline": raw.get("headline"),
        "category": raw.get("recipeCategory"),
        "cuisine": as_list(raw.get("recipeCuisine")),
        "keywords": as_list(raw.get("keywords")),
        "prep_time_minutes": parse_iso_duration(raw.get("prepTime")),
        "cook_time_minutes": parse_iso_duration(raw.get("cookTime")),
        "total_time_minutes": parse_iso_duration(raw.get("totalTime")),
        "yield": raw.get("recipeYield"),
        "ingredients": as_list(raw.get("recipeIngredient")),
        "instructions": normalize_instructions(raw.get("recipeInstructions")),
        "images": as_list(raw.get("image")),
        "date_published": raw.get("datePublished"),
        "date_modified": raw.get("dateModified"),
        "nutrition": raw.get("nutrition"),
        "author": raw.get("author"),
        "source": "rasoibuddy.in",
    }


def fetch_urls() -> list[str]:
    response = requests.get(SITEMAP_URL, timeout=30)
    response.raise_for_status()
    root = ET.fromstring(response.text)
    return [loc.text for loc in root.iter(f"{SITEMAP_NS}loc") if loc.text]


def load_checkpoint(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return set(json.loads(path.read_text(encoding="utf-8")))


def save_checkpoint(path: Path, done: set[str]) -> None:
    path.write_text(json.dumps(sorted(done), indent=2), encoding="utf-8")


def append_jsonl(path: Path, record: dict) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_dataset(out_dir: Path, errors: list[dict]) -> int:
    recipes = read_jsonl(out_dir / "recipes.jsonl")
    raw_records = read_jsonl(out_dir / "raw.jsonl")

    (out_dir / "recipes.json").write_text(
        json.dumps(recipes, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (out_dir / "raw.json").write_text(
        json.dumps(raw_records, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    if errors:
        (out_dir / "errors.json").write_text(
            json.dumps(errors, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    if recipes:
        fields = [
            "id",
            "name",
            "url",
            "category",
            "cuisine",
            "prep_time_minutes",
            "cook_time_minutes",
            "total_time_minutes",
            "yield",
            "ingredients",
            "instructions",
            "images",
            "description",
        ]
        with (out_dir / "recipes.csv").open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            for recipe in recipes:
                row = dict(recipe)
                row["cuisine"] = "; ".join(row.get("cuisine") or [])
                row["ingredients"] = " | ".join(row.get("ingredients") or [])
                row["instructions"] = " | ".join(row.get("instructions") or [])
                row["images"] = "; ".join(row.get("images") or [])
                writer.writerow(row)

    metadata = {
        "source": "rasoibuddy.in",
        "sitemap_url": SITEMAP_URL,
        "recipe_count": len(recipes),
        "raw_count": len(raw_records),
        "error_count": len(errors),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    (out_dir / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return len(recipes)


def scrape(out_dir: Path, delay: float, limit: int | None) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = out_dir / "checkpoint.json"
    raw_jsonl = out_dir / "raw.jsonl"
    recipes_jsonl = out_dir / "recipes.jsonl"

    done = load_checkpoint(checkpoint_path)
    urls = fetch_urls()
    if limit is not None:
        urls = urls[:limit]

    pending = [url for url in urls if url not in done]
    print(f"Total URLs: {len(urls)} | already done: {len(done)} | pending: {len(pending)}")

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    errors: list[dict] = []
    if (out_dir / "errors.json").exists():
        errors = json.loads((out_dir / "errors.json").read_text(encoding="utf-8"))

    for index, url in enumerate(pending, start=1):
        try:
            response = session.get(url, timeout=20)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            raw = extract_recipe_ld(soup)
            if raw:
                append_jsonl(
                    raw_jsonl,
                    {
                        "url": url,
                        "scraped_at": datetime.now(timezone.utc).isoformat(),
                        "data": raw,
                    },
                )
                append_jsonl(recipes_jsonl, normalize(raw, url))
            else:
                errors.append({"url": url, "error": "no Recipe JSON-LD"})
        except Exception as exc:
            errors.append({"url": url, "error": str(exc)})

        done.add(url)
        if index % 25 == 0 or index == len(pending):
            save_checkpoint(checkpoint_path, done)
            print(f"[{len(done)}/{len(urls)}] last: {url}")

        if index < len(pending):
            time.sleep(delay)

    recipe_count = write_dataset(out_dir, errors)
    print(f"Saved {recipe_count} recipes to {out_dir}")
    return recipe_count


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape rasoibuddy.in recipes from sitemap")
    parser.add_argument("--delay", type=float, default=DELAY_SEC, help="Delay between requests (seconds)")
    parser.add_argument("--limit", type=int, default=None, help="Only scrape the first N sitemap URLs")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "rasoibuddy",
        help="Output directory for dataset files",
    )
    args = parser.parse_args()
    scrape(args.out_dir, args.delay, args.limit)


if __name__ == "__main__":
    main()
