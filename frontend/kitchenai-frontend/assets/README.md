# App assets

| File | Use |
|------|-----|
| `logo.png` | Full brand mark with wordmark (`Gemini_Generated_Image_s1q0lss1q0lss1q0.png`) |
| `favicon.png` | Web tab icon; circular mask from icon-only source |
| `icon.png`, `splash-icon.png`, `adaptive-icon.png`, `notification-icon.png` | 1024×1024 from icon-only source (`Gemini_Generated_Image_ouj1qsouj1qsouj1.png`) |

Install or replace:

```bash
python3 scripts/install-logo.py ~/Downloads/Gemini_Generated_Image_s1q0lss1q0lss1q0.png
node scripts/generate-app-icons.mjs ~/Downloads/Gemini_Generated_Image_ouj1qsouj1qsouj1.png
```

`app.json` references `./assets/logo.png` directly. Android adaptive icon uses `backgroundColor: #FFFFFF` behind the transparent foreground — no baked-in white matte in the PNG.

Legacy copies (`icon.png`, `splash-icon.png`, etc.) are kept in sync via `generate-app-icons.mjs`; `app.json` currently uses `logo.png` for app/splash/notifications.
