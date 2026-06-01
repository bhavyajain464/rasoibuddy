#!/usr/bin/env bash
# Enable Cloud Vision API on the Kitchmate GCP project (required for bill photo OCR).
set -euo pipefail
PROJECT="${GCP_PROJECT:-kitchmate-495620}"
echo "Enabling vision.googleapis.com on project ${PROJECT}..."
gcloud services enable vision.googleapis.com --project="${PROJECT}"
echo "Done. Next: create an API key → docs/GOOGLE_VISION_SETUP.md"
