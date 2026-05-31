# App assets

| File | Use |
|------|-----|
| `logo.png` | **Single source** — transparent RGBA brand mark (login, onboarding, app icon, splash) |
| `favicon.png` | Web tab icon (`app.json` → `web.favicon`); circular mask via `scripts/generate-circular-favicon.py` |

Install or replace:

```bash
python3 scripts/install-logo.py "/path/to/transparent-logo.png"
```

`app.json` references `./assets/logo.png` directly. Android adaptive icon uses `backgroundColor: #FFFFFF` behind the transparent foreground — no baked-in white matte in the PNG.

Legacy copies (`icon.png`, `splash-icon.png`, etc.) are unused; safe to delete.
