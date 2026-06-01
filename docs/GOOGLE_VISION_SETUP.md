# Google Cloud Vision API (bill photo OCR)

Bill **photos** use **Cloud Vision `TEXT_DETECTION`** only (1 API unit per scan). Text is then parsed by Groq — not sent as an image to Groq unless OCR fails.

## Free tier (stay under this)

| Item | Limit |
|------|--------|
| **Cost** | First **1,000 `TEXT_DETECTION` units/month free** (per billing account, all projects share the allowance if linked) |
| **Our usage** | **1 unit = 1 bill photo** (single feature, single image in the request) |
| **Rough capacity** | ~1,000 camera bill scans/month at $0 if you stay under the cap |
| **Billing** | A payment method is required on the GCP account, but you are not charged while under 1,000 units/month |

After 1,000 units/month, text detection is about **$1.50 per 1,000 images** ([pricing](https://cloud.google.com/vision/pricing)).

**Do not use** `DOCUMENT_TEXT_DETECTION` for bills — same free bucket but heavier; we only call `TEXT_DETECTION`.

## One-time GCP setup

Project used for Kitchmate: **`kitchmate-495620`** (same as Cloud Run).

### 1. Enable the API

```bash
gcloud services enable vision.googleapis.com --project=kitchmate-495620
```

Or: [API Console → Cloud Vision API → Enable](https://console.cloud.google.com/apis/library/vision.googleapis.com?project=kitchmate-495620)

### 2. Create an API key (not the Gemini / AI Studio key)

1. [Credentials](https://console.cloud.google.com/apis/credentials?project=kitchmate-495620) → **Create credentials** → **API key**.
2. **Restrict the key** (recommended):
   - **API restrictions** → **Restrict key** → only **Cloud Vision API**
   - **Application restrictions** → optional (IP for Cloud Run is awkward; for local dev you can use “None” on a dev-only key)
3. Copy the key → `GOOGLE_VISION_API_KEY` in `backend/.env` (local) or Secret Manager (production).

> **Important:** `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/) is **not** the same as a GCP Vision API key. Use a key from **Google Cloud Console** with Vision API enabled.

### 3. Budget alert (recommended)

1. [Billing → Budgets](https://console.cloud.google.com/billing/budgets) → create budget for project `kitchmate-495620`.
2. Example: alert at **$1** or **50 units** so you know before leaving the free tier.

### 4. Local backend

In `backend/.env`:

```env
GOOGLE_VISION_API_KEY=your-gcp-vision-api-key
```

Restart the API: `go run ./cmd/api` from `backend/`.

### 5. Production / staging secrets

Upload to Secret Manager (once):

```bash
cd backend
./scripts/upload_secrets_gcp.sh   # includes google-vision-api-key if set in .env
```

Cloud Run must map the secret (add to deploy workflow if not already):

```text
GOOGLE_VISION_API_KEY=google-vision-api-key:latest
```

## Verify

```bash
# From repo root, with a small test image path:
curl -s -X POST "https://vision.googleapis.com/v1/images:annotate?key=$GOOGLE_VISION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"requests":[{"image":{"content":"'$(base64 -i /path/to/receipt.jpg)'"},"features":[{"type":"TEXT_DETECTION"}]}]}' \
  | head -c 500
```

You should see `"textAnnotations"` or `"fullTextAnnotation"` in the JSON, not `API key not valid` or `Vision API has not been used`.

## Code path

```
Photo upload → ExtractBillImageText (Vision TEXT_DETECTION)
            → trimInvoiceTextForLLM
            → Groq text model → JSON items
```

If OCR fails or returns too little text → optional Groq **vision** fallback (`GROQ_VISION_MODEL`, costs more).

PDF uploads skip Vision and use embedded PDF text extraction instead.
