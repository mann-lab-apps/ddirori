# 띠로리 / Ddirori

띠로리 스코어·플레이·스튜디오를 소개하는 하나의 공식 웹사이트입니다. 운영: Mannlab.

- 대표 도메인: https://ddirori.com (대표 주소 HTTPS 공개 완료)
- 경로: `/score/`, `/play/`, `/studio/`, `/support/`, `/privacy/`
- 기존 in-c 웹사이트와 앱 배포는 이 저장소에서 변경하지 않습니다.

## 수정과 배포

`src/`의 HTML·CSS·JS를 수정합니다. Node 22만 필요합니다.

```sh
node scripts/build.mjs
node scripts/verify.mjs
python3 -m http.server 8117 --bind 127.0.0.1 --directory dist
```

main push는 GitHub Actions에서 검사 후 GitHub Pages로 배포합니다. Pages의 기본 경로를 자동 적용하므로 도메인 연결 전 GitHub 프로젝트 URL에서도 열립니다. GitHub 임시 주소는 검색 색인을 요청하지 않습니다.

## 새 GA4 연결

GA4 속성 `Ddirori`, 웹 스트림 `Ddirori Web`, 시간대 대한민국, 통화 KRW를 생성합니다. 웹 URL은 https://ddirori.com 입니다. 기존 계정을 사용해도 되며 하위 서비스별 앱/Firebase 프로젝트는 지금 생성하지 않습니다.

생성된 측정 ID를 저장소 Actions variable `GA4_MEASUREMENT_ID`에 넣고 Deploy Ddirori를 다시 실행합니다. ID가 없으면 분석은 비활성화되며 기존 in-c ID 사용은 빌드에서 차단합니다. Google 스크립트는 `ddirori.com`과 `www.ddirori.com`에서만 초기화합니다. GitHub 임시 주소·로컬 QA는 운영 통계에 섞지 않습니다.

방문·유입 경로와 `score_store_click`을 먼저 봅니다. 클릭은 실제 설치가 아니며 최초 다운로드는 App Store Connect에서 따로 확인합니다. 콘솔 생성과 Realtime 수신은 코드 검사와 별도로 확인해야 합니다.

## 도메인 연결

도메인 등록 완료 후 Repository Settings → Pages에서 `ddirori.com`을 설정하고 DNS를 연결합니다. Actions 배포에서는 CNAME 파일로 설정하지 않습니다.

- `@` A: 185.199.108.153 / 185.199.109.153 / 185.199.110.153 / 185.199.111.153
- `www` CNAME: mann-lab-apps.github.io

GitHub DNS 검사·HTTPS 인증서 완료 후 다시 배포해 루트 경로를 적용합니다. 구매나 DNS 변경이 확인되지 않은 상태를 연결 완료로 기록하지 않습니다.

## 화면과 다운로드 출처

Score의 3개 화면은 공개 1.0.2 App Store 원본이며 Clef & Staff라는 현재 공개 이름이 보입니다. 출처·실제 hash는 `src/assets/sources.json`에 있습니다. Studio·Play 이미지는 개발 화면이며 공개 빌드와의 차이를 본문에 표시합니다. 글꼴 라이선스는 `src/assets/FONT-LICENSE.txt`입니다. 웹 화면 검사는 네이티브 앱 QA나 스토어 캡처 검수를 대신하지 않습니다.

## 2026-11-11 배포 확인

- GitHub Pages의 custom domain: `ddirori.com`. 기존 in-c Pages 설정은 변경하지 않았습니다.
- 사용자가 생성한 새 웹 스트림 ID `G-KFJBY01RKT`를 Actions variable에 등록했습니다. 웹 방문·클릭 측정이며 앱 내부 계측이 아닙니다.
- 첫 배포: https://github.com/mann-lab-apps/ddirori/actions/runs/42954392575 — 성공. GitHub 원본 서버에 Host를 지정한 HTTP 확인에서 `/score/` 200과 배포된 새 측정 ID를 확인했습니다. 이 검사는 공개 DNS·HTTPS·GA 콘솔 수신 확인을 대신하지 않습니다.
- 브라우저 QA는 Google 스크립트를 대체해 실제 분석 트래픽을 보내지 않았으며 24개 표시 조합·175개 검사를 통과했습니다.

## 공개 연결 검증

`deployment-status.json`은 확인 당시의 결과입니다. `ddirori.com`의 HTTPS와 HTTP→HTTPS 강제 전환을 확인했고 여섯 페이지가 200으로 응답했습니다. 새 GA 속성의 `page_view`와 `score_store_click`이 Google 수집 서버에서 204를 받았습니다. 콘솔 집계는 별도이며, 설정 테스트는 `codex_setup / qa`, 캠페인 `launch_verification`으로 구분합니다.

`www` CNAME도 Route 53에서 확인했지만 GitHub 측 이전 NXDOMAIN 캐시와 별칭 인증서 반영은 당시 대기 상태였습니다. 대표 주소의 정상 접속과 별개로 확인합니다.
