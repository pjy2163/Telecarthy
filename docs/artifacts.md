# 제출용 데모 산출물

- APK: [telecarsee_demo_release.apk](../apk/telecarsee_demo_release.apk)
- 시연 영상: [pleos-demo.mp4](pleos-demo.mp4)
- 차량 앱 검증: [native-audio-test.json](native-audio-test.json)
- 브라우저 검증: [browser-audio-test.json](browser-audio-test.json)
- 검증 결과 설명: [검증결과.md](검증결과.md)
- 접수양식 참고자료 문구: [참고자료_제출문구.md](참고자료_제출문구.md)

APK는 `com.telecarsee.demo` 버전 `0.1.0-demo`, 최소 API 28, target API 34, ARM64용입니다. Pleos Connect 2.1.0 API 34 에뮬레이터에서 테스트했으며 로컬 제어·음성 서버가 필요합니다. APK 서명은 v2 검증을 통과했으며 인증서 이름은 `Telecar Demo`입니다. 서명용 개인키는 포함하지 않습니다.

현재 APK에는 작은 화면에서 글자·간격·레이더 크기를 조절하고 안내 문구만 스크롤해 통화 조작 버튼을 계속 표시하는 수정이 반영되어 있습니다. 아래 통화 검증 자료와 영상은 2026년 11월 15일 15:46경의 실행 기록이며 화면 배치 수정 전 버전입니다. 이번 수정본은 Kotlin 컴파일·매니페스트 처리와 APK 서명·민감정보 검사를 별도로 확인했습니다.

APK를 풀어 민감 파일명과 개인 장비 경로·개인키 헤더를 확인하고 Gitleaks로 검사했습니다. DEX·네이티브 라이브러리의 문자열을 별도로 검사했을 때 탐지된 3건은 모두 WebSocket 공개 예시의 `Sec-WebSocket-Key` nonce였으며 실제 자격증명이 아니었습니다.

영상은 39.6초, H.264, 1280×880이며 무음 화면 녹화에 자막을 붙였습니다. 가상 위치·합성 브라우저 마이크·터치 조작을 사용한 범위를 표시합니다. 실제 통화 음성이나 개발자 계정 화면은 포함하지 않습니다. 에뮬레이터의 RTP 통계 검증과 실제 차량에서의 음질·주행 중 사용 검증은 구분합니다.

| 파일 | SHA-256 |
| --- | --- |
| APK | `9f41829a5e229c96489ebe906220a074ea56e64011cc1786bebd884bd61c5f91` |
| 영상 | `12da84472c37ffb3deff90ad9aee0cf6a2ae3d4f81918e3b30c2edef516e45ad` |

소스 ZIP이 필요하면 저장소 루트에서 `python3 scripts/package-source.py`를 실행합니다. 커밋된 Git 스냅샷만 압축하므로 커밋하지 않은 변경은 포함하지 않습니다. 키 파일·환경설정·캐시는 제외하며, 게시 전에 압축 내용도 검사합니다. 구현 작업 폴더에서 별도로 만든 원본 ZIP은 이 저장소의 검토된 게시본과 다를 수 있습니다.
