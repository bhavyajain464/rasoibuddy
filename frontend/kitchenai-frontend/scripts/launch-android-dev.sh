#!/usr/bin/env bash
# Open the Rasoibuddy *development build* and point it at Metro on this machine.
# Use after: npm run start   (Metro must be running on port 8082)
set -euo pipefail

PACKAGE="com.kitchenai.app"
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

if ! adb get-state >/dev/null 2>&1; then
  echo "No Android device/emulator connected. Start an emulator or plug in a device, then retry."
  exit 1
fi

if ! adb shell pm path "${PACKAGE}" >/dev/null 2>&1; then
  echo "Development build not installed (${PACKAGE})."
  echo ""
  echo "The exp+kitchenai-frontend:// link only works with a dev client build, not Expo Go or Play Store."
  echo "Install once (from frontend/kitchenai-frontend):"
  echo "  npm run android"
  echo "Or download an EAS development APK:"
  echo "  npx eas-cli build --platform android --profile development"
  echo ""
  exit 1
fi

echo "Launching ${PACKAGE} -> ${URL}"
if ! adb shell am start -a android.intent.action.VIEW -d "${DEEP_LINK}" 2>&1; then
  echo ""
  echo "Deep link failed. Open the Rasoibuddy app on the device, shake for dev menu, and enter:"
  echo "  ${URL}"
  exit 1
fi
echo "Done. If you see ExpoCamera errors, you opened Expo Go — use the Rasoibuddy dev build icon only."
