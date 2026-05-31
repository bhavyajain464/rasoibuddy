#!/usr/bin/env python3
"""Copy transparent logo PNG into assets/logo.png and public/logo.png."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python3 scripts/install-logo.py <path-to-logo.png>")

    src = Path(sys.argv[1]).expanduser().resolve()
    if not src.is_file():
        raise SystemExit(f"Not found: {src}")

    logo = Image.open(src)
    if logo.mode != "RGBA":
        logo = logo.convert("RGBA")

    dest = ROOT / "assets" / "logo.png"
    logo.save(dest, "PNG", optimize=True)
    shutil.copy(dest, ROOT / "public" / "logo.png")
    print(f"Installed {dest} ({logo.size[0]}×{logo.size[1]} RGBA) — used as-is everywhere via app.json")


if __name__ == "__main__":
    main()
