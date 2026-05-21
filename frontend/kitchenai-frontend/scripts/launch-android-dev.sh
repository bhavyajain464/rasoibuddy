#!/usr/bin/env bash
# Open the Kitchen AI *development build* and point it at Metro on this machine.
# Use after: npm run start   (Metro must be running on port 8082)
set -euo pipefail

PORT="${EXPO_METRO_PORT:-8082}"
SCHEME="exp+kitchenai-frontend"

# Emulator: 10.0.2.2 is the host Mac. Physical device: set DEV_SERVER_HOST to your LAN IP.
if adb shell getprop ro.kernel.qemu 2>/dev/null | grep -q 1; then
  HOST="${DEV_SERVER_HOST:-10.0.2.2}"
else
  HOST="${DEV_SERVER_HOST:-$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')}"
fi

if [[ -z "${HOST}" ]]; then
  echo "Set DEV_SERVER_HOST to your Mac LAN IP (e.g. 192.168.0.109) for a physical device."
  exit 1
fi

URL="http://${HOST}:${PORT}"
DEEP_LINK="${SCHEME}://expo-development-client/?url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${URL}', safe=''))")"

echo "Launching com.kitchenai.app -> ${URL}"
adb shell am start -a android.intent.action.VIEW -d "${DEEP_LINK}" >/dev/null
echo "Done. If you see ExpoCamera errors, you opened Expo Go — use the Kitchen AI app icon only."
