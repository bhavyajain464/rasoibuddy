#!/usr/bin/env python3
"""Fit logo PNG into assets/logo.png (1173×912 with margins) and public/logo.png."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python3 scripts/install-logo.py <path-to-logo.png>")

    src = Path(sys.argv[1]).expanduser().resolve()
    if not src.is_file():
        raise SystemExit(f"Not found: {src}")

    script = ROOT / "scripts" / "fit-brand-logo.mjs"
    subprocess.run(["node", str(script), str(src)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
