#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
TELECAR_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
TELECAR_ADB="${ADB:-$TELECAR_SDK/platform-tools/adb}"
TELECAR_DEVICE="${ANDROID_SERIAL:-emulator-5556}"
TELECAR_PROFILE="${1:-A}"
"$TELECAR_ADB" -s "$TELECAR_DEVICE" install -r apk/telecarsee_demo_release.apk
"$TELECAR_ADB" -s "$TELECAR_DEVICE" reverse tcp:8787 tcp:8787
"$TELECAR_ADB" -s "$TELECAR_DEVICE" reverse tcp:7880 tcp:7880
"$TELECAR_ADB" -s "$TELECAR_DEVICE" reverse tcp:7881 tcp:7881
"$TELECAR_ADB" -s "$TELECAR_DEVICE" shell am start --user current -n com.telecarsee.demo/.MainActivity --es profile "$TELECAR_PROFILE"
