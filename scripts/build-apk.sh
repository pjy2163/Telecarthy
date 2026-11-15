#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")/.."
mkdir -p .local apk
if [ -z "${JAVA_HOME:-}" ] && [ -d '/Applications/Android Studio.app/Contents/jbr/Contents/Home' ]; then
  export JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
fi
: "${TELECAR_KEYSTORE_PATH:?서명 키 파일의 절대 경로를 환경변수로 설정하세요.}"
: "${TELECAR_KEYSTORE_PASSWORD:?서명 키 저장소 비밀번호를 환경변수로 설정하세요.}"
: "${TELECAR_KEY_PASSWORD:?서명 키 비밀번호를 환경변수로 설정하세요.}"
export TELECAR_KEY_ALIAS="${TELECAR_KEY_ALIAS:-demo}"
TELECAR_KEYTOOL="${JAVA_HOME:+$JAVA_HOME/bin/}keytool"
if [ ! -f "$TELECAR_KEYSTORE_PATH" ]; then
  mkdir -p "$(dirname "$TELECAR_KEYSTORE_PATH")"
  "$TELECAR_KEYTOOL" -genkeypair -keystore "$TELECAR_KEYSTORE_PATH" \
    -storepass:env TELECAR_KEYSTORE_PASSWORD -keypass:env TELECAR_KEY_PASSWORD \
    -alias "$TELECAR_KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 3650 \
    -dname 'CN=Telecar Demo'
fi
cd android
./gradlew --no-daemon :app:assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../apk/telecarsee_demo_release.apk
printf '\nAPK: apk/telecarsee_demo_release.apk\n'
