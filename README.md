# 텔레CAR시 Telecarthy

같은 도로 구간의 주변 참여자를 찾아 상대 수락 후 실제 목소리로 대화하는 Pleos Connect 차량용 앱 프로젝트입니다.

현재 이 저장소에는 매칭·연결 제어 서버, 상대 차량 역할의 브라우저 클라이언트와 Kotlin·Jetpack Compose 기반 Android 앱 소스가 있습니다. 실제 음성 통화의 종단 간 검증과 제출용 APK·영상 정리는 진행 중입니다.

## 현재 구현 범위

- 임시 세션 ID로 참여자를 구분합니다. 전화번호와 실명을 입력하지 않습니다.
- 가상 좌표의 500m 반경과 도로·진행 방향·대화 가능 상태를 비교하여 연결 후보를 찾습니다.
- 연결 요청·수락·거절·취소·요청 만료와 연결 해제를 처리합니다.
- 상대가 수락한 뒤에만 통화 룸에 접근하는 단기 토큰을 발급합니다.
- 매칭과 상태 전환을 검증하는 테스트 8개가 있습니다.
- 브라우저 클라이언트에서 연결 요청·수락과 LiveKit 기반 음성 통화·음소거·종료를 처리합니다.
- Android 앱에 차량용 화면, 마이크 권한 요청, 오디오 포커스 변경 처리와 Pleos TextToSpeech 3.3.1 연동 코드를 추가했습니다.

좌표와 도로 구간은 테스트용 가상 데이터입니다. FusedLocation과 Gleo는 아직 연동하지 않았습니다. 현재 음성 입력은 지원 환경에서 버튼으로 호출하는 Android 음성 인식이며, 완전한 핸즈프리 제어를 구현한 상태로 표현하지 않습니다. CarUxRestrictions 연동과 실제 차량 주행 중 이용 허용 범위도 별도 검증 대상입니다.

## 구성

| 경로 | 내용 |
| --- | --- |
| `server/src/matching.ts` | 주변 후보 검색과 연결 상태 관리 |
| `server/src/server.ts` | HTTP·WebSocket 및 LiveKit 통화 권한 발급 |
| `server/test/matching.test.ts` | 매칭·수락·만료·종료 검증 |
| `server/public` | 상대 차량 역할의 브라우저 클라이언트 |
| `android` | 차량용 Android 앱과 Gradle Wrapper |
| `scripts/init-local-env.mjs` | 로컬 전용 키와 설정 생성 |

## 서버 검사

Node.js 22.9 이상을 사용합니다.

```bash
cd server
npm ci
npm run check
npm test
```

## 로컬 서버 실행

먼저 저장소 루트에서 로컬 키를 생성합니다. 생성한 파일은 Git에서 제외되며 기존 파일은 덮어쓰지 않습니다.

```bash
node scripts/init-local-env.mjs
```

별도 터미널에서 LiveKit을 아래와 같이 실행할 수 있습니다. 로컬 컴퓨터의 루프백 주소로 제한한 개발용 설정이며, 생성한 로컬 키 파일을 읽습니다.

```bash
docker compose up -d media
```

다른 터미널에서 제어 서버를 시작합니다.

```bash
cd server
npm start
```

`sh scripts/start-demo.sh`로 로컬 키 확인, LiveKit 시작과 제어 서버 실행을 순서대로 수행할 수도 있습니다. 다른 데모 서버가 이미 같은 포트를 사용하고 있으면 먼저 해당 실행을 종료하거나 별도 포트를 구성해야 합니다.

상태 확인 주소는 `http://127.0.0.1:8787/health`, WebSocket 주소는 `ws://127.0.0.1:8787/ws`입니다. 브라우저에서 `http://127.0.0.1:8787/?profile=B`를 열면 상대 차량 클라이언트를 사용할 수 있습니다. A·B는 같은 범위·방향, C는 범위 밖, D는 반대 방향의 테스트 프로필입니다.

위 LiveKit 설정은 로컬 루프백 주소를 사용합니다. Android 기기·에뮬레이터에서 음성 통화를 검증하려면 제어 서버뿐 아니라 LiveKit의 연결 주소와 실제 미디어 경로도 연결해야 합니다. 제어 서버 포트만 연결한 상태를 실제 통화 성공으로 판단하지 않습니다.

## Android 앱 검사와 빌드

앱은 최소 API 28, compileSdk 35, targetSdk 34, Gradle 8.13과 Kotlin 2.1.21을 사용합니다. 현재 ABI는 ARM64입니다. Android Studio에서 `android` 폴더를 열고 SDK 경로를 설정합니다. 개인 장비의 `local.properties`는 커밋하지 않습니다.

```bash
cd android
./gradlew :app:compileReleaseKotlin :app:processReleaseMainManifest
```

서명한 release APK를 만들 때는 `android/.env.example`의 변수 이름을 참고해 `TELECAR_KEYSTORE_PATH`, `TELECAR_KEYSTORE_PASSWORD`, `TELECAR_KEY_ALIAS`, `TELECAR_KEY_PASSWORD`를 셸 환경변수로 설정한 뒤 `./gradlew :app:assembleRelease`를 실행합니다. Gradle은 예시 파일을 자동으로 읽지 않습니다. 기존 서명 키나 비밀번호는 저장소에 포함하지 않습니다.

저장소 루트에서 `sh scripts/build-apk.sh`를 실행하면 같은 환경변수를 사용해 서명 키를 준비하고 release APK를 `apk/telecarsee_demo_release.apk`로 복사합니다. 비밀번호는 명령행 값 대신 환경변수로 keytool에 전달합니다.

Pleos Connect 에뮬레이터·SDK의 제공 및 권한 조건을 확인해야 하며, 현재 데모는 정지된 개발 환경에서 검증하는 용도입니다. 주행 중 사용을 위해 플랫폼의 제한을 해제하는 절차는 제공하지 않습니다.

## 통화 검증 도구

`scripts/browser-audio-test.mjs`와 `scripts/native-audio-test.mjs`는 실행 중인 로컬 데모에 접속해 통화 흐름과 미디어 통계를 확인하는 도구입니다. Chrome 실행 경로는 `CHROME_PATH`, Android 장치는 `ANDROID_SERIAL`, adb 실행 경로는 `ADB` 또는 `ANDROID_HOME`으로 지정할 수 있습니다.

이 도구들은 현재 개발·검증 중이며, 단위 테스트 8개의 통과와 종단 간 통화 검증 완료를 구분합니다. 특히 통화 통계 파일의 현재 세션 확인은 [개발 방향 검토](docs/direction-review.md)에 기록한 확인 항목입니다.

## 키와 로컬 파일 관리

실제 키를 코드에 넣지 않으며 `.env.example`에는 변수 이름만 제공합니다. 키는 서버에서만 읽고, 클라이언트에는 수락한 통화 룸에 한정한 단기 토큰을 발급합니다.

`.env`, `.local`, 서명용 키스토어, 개발 장비 경로, 로그, 의존성 폴더와 에뮬레이터 이미지는 커밋 대상에서 제외합니다. 향후 APK를 추가할 때도 서명 키를 함께 올리지 않습니다.

## 개발 방향 검토

현재 MVP 범위는 주변 참여자 매칭과 수락 후 1:1 음성 통화입니다. 종단 간 검증에서는 양쪽의 오디오 패킷 수신, 음소거의 상대방 반영과 양쪽에서의 종료를 확인합니다. 오디오 패킷 전송 검증과 사람이 말을 듣고 이해할 수 있는 음질 검증은 구분합니다.

FusedLocation 기반 실제 위치, Gleo 음성 제어, CarUxRestrictions 연동은 후속 검증 항목입니다. 합성 마이크·가상 좌표·버튼 조작을 사용한 범위를 README와 제출 자료에서 명시합니다.

## 커밋 규칙

`feat:`, `fix:`, `test:`, `docs:`, `chore:` 뒤에 짧은 한국어 설명을 사용합니다. 기능, 검증, 설정 변경을 검토 가능한 단위로 나눕니다.
