# Onboarding staple thumbnails

Vector pantry icons (128×128 WebP) shown in onboarding, inventory, and bill scan.

## Layout

```
assets/staples/
  masters/{id}.png   — full-res vector archive (gitignored; back up locally e.g. Drive)
  {id}.webp          — 128×128 app thumbnail (bundled in app)
```

## Generate new vector icons (Cursor)

Prompts are built from `backend/internal/services/ingredients/catalog.json`:

```bash
cd frontend/kitchenai-frontend

# Preview prompt for one ingredient
node scripts/staple-image-prompts.mjs --id turmeric_powder --dry-run

# After generating PNGs in Cursor, copy into masters/
bash scripts/copy-staple-masters.sh turmeric_powder onion tomato

# Export WebP thumbnails + refresh bundled requires
npm run optimize:staples -- --force
npm run generate:staple-image-maps
```

### Prompt template

Adapted from the dish photography prompt — flat vector instead of photorealistic:

> A clean flat vector illustration icon of [presentation] of [Ingredient Name] resting on a soft cream (#F3F4F2) background in a cozy Indian home kitchen pantry style. The ingredient features [visual description]. It is styled with [garnish]. In the softly simplified background, there is a warm inviting kitchen setting with [context]. Soft warm morning light, flat vector art with crisp outlines and subtle gradients — **no photorealism, no photography, no text, no labels, no watermark**. Square composition, centered, high contrast, recognizable at small mobile app thumbnail size.

See `scripts/staple-image-prompts.mjs` for category-specific placeholders.

## Legacy Twemoji fallback

Fast placeholder icons (Twemoji + accent circle) — use only when vector masters are missing:

```bash
npm run generate:staple-images
npm run generate:staple-images -- --force   # regenerate all Twemoji placeholders
```

## Progress

Check `assets/staples/.generation-progress.json` for Cursor batch status.
