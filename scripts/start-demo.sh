#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker Desktop을 설치하고 실행한 후 다시 시도하세요.'; exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Docker Desktop이 실행 중인지 확인하세요.'; exit 1
fi
if [ ! -f server/.env ] || [ ! -f .local/livekit.yaml ]; then
  node scripts/init-local-env.mjs
fi
docker compose up -d media
cd server
if [ ! -d node_modules ]; then npm ci; fi
printf '\n상대 차량: http://127.0.0.1:8787/?profile=B\n차량 APK는 scripts/connect-emulator.sh로 연결합니다.\n\n'
npm start
