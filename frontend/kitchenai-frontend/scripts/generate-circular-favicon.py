#!/usr/bin/env python3
"""Mask assets/favicon.png (or given PNG) into a circle for browser tab display."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "assets" / "favicon.png"


def circularize(path: Path) -> None:
    src = Image.open(path).convert("RGBA")
    w, h = src.size
    side = max(w, h)
    square = Image.new("RGBA", (side, side), (255, 255, 255, 255))
    square.paste(src, ((side - w) // 2, (side - h) // 2))

    mask = Image.new("L", (side, side), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, side - 1, side - 1), fill=255)

    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(square, (0, 0), mask)
    out.save(path, "PNG", optimize=True)
    print(f"Circular favicon: {path} ({side}×{side} RGBA)")


def main() -> None:
    target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT
    if not target.is_file():
        raise SystemExit(f"Not found: {target}")
    circularize(target)


if __name__ == "__main__":
    main()
