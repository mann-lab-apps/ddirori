# Studio 다운로드와 유입 측정

공식 다운로드는 [ddirori.com/studio/](https://ddirori.com/studio/)에서 안내한다. 파일은 [Studio GitHub Releases](https://github.com/mann-lab-apps/in-c/releases)에서 제공한다. 공개 버전을 갱신할 때 `src/download-manifest.json`과 `src/studio.html`의 버전·링크를 함께 맞추고, 게시 자산의 파일명·크기·SHA-256을 확인한다. 빌드 검사는 화면의 정적 설치 링크와 매니페스트를 대조한다.

## 클릭 수집

| 이벤트 | 활성화한 링크 |
| --- | --- |
| `download_primary` | 운영체제 감지 또는 선택 뒤 표시되는 주 설치 파일 |
| `download_platform` | 운영체제별 목록의 개별 설치 파일 |

두 이벤트에는 `location`, `platform`, `file_name`, `release_version`, `link_url`을 함께 전송한다. 운영체제 탭과 설치 영역으로 이동하는 링크는 집계에서 제외한다. 클릭은 사용자가 링크를 선택했음을 나타낸다. 브라우저에서 JavaScript를 끄거나 수집이 차단돼도 운영체제별 설치 파일에 접근할 수 있다.

## 7일·28일 리뷰

- Pages 배포 일시와 공개 소스 SHA를 기록하고 KST 배포일로부터 7일·28일에 판독한다. 날짜 단위 비교는 배포 다음 날부터의 완전히 지난 날을 사용한다. 집계가 지연되면 기준 날짜와 실제 조회 날짜를 함께 적는다.
- GA4 속성 `563700721`의 Core 보고서에서 `hostName`은 `ddirori.com`과 `www.ddirori.com`을 포함한다. `pagePath`는 공개 Studio 페이지가 열리는 `/studio/`, `/studio`, `/studio.html`, `/studio/index.html`, `/studio/index`를 포함한다. `sessionCampaignName`이 `studio_release_validation_`로 시작하는 내부 검증 세션을 제외한다.
- Core 보고서에서 같은 기간과 페이지 필터로 `page_view` 세션과 설치 클릭 세션을 각각 조회한다. 클릭 세션은 `eventName IN (download_primary, download_platform)`의 단일 집계로 읽는다. 이벤트별 세션 수를 합산하면 두 버튼을 누른 세션이 중복된다.
- 설치 전환율의 분모는 Studio 페이지뷰가 있는 세션이고 분자는 그중 설치 클릭이 있는 세션이다. 두 이벤트가 모두 있는 세션을 확인하려면 GA4 탐색에서 동일한 페이지·기간·QA 제외 조건으로 세션 세그먼트 두 개를 만든다. 하나는 Studio 방문 세션, 다른 하나는 같은 세션에 설치 클릭 조건을 추가한 세션이다. 각 `Sessions`와 기간을 함께 보고한다. Core 집계만 확보한 경우에는 방문과 클릭 세션 수를 각각 보고한다. [세그먼트 조건 범위](https://support.google.com/analytics/answer/9304353)
- 새 가이드 유입은 `sessionManualCampaignName=studio_guides`와 `sessionManualAdContent`로 읽는다. 이미 열린 세션이 가이드에서 Studio로 돌아오는 경로는 가이드별 태그가 포함된 `pageLocation`으로 별도 조회한다. 보고서에 행이 없으면 집계 상태와 조회 시각을 남긴다.
- 반복 클릭은 동일 범위의 `eventCount`를 이벤트별로 확인한다. GitHub의 파일별 `download_count`는 같은 자산 ID로 배포 스냅샷과 비교한다. 설치 완료 건수는 이 두 보고서의 범위 밖이다.
- [MusicXML 예제](https://ddirori.com/studio/#musicxml)로 유입 경로를 확인한다. 검색 콘솔의 색인·선택 canonical·노출·클릭은 읽기 권한이 있는 속성에서 기록한다. 공식 설치 파일과 지원 OS, MusicXML에서 PDF로 저장하는 방법을 같은 한국어 질문으로 점검하고 AI 답변을 직접 조회한 경우 인용 URL을 남긴다.

## 공개 수신 검증

1. 공개 HTML과 매니페스트의 버전 및 링크를 다시 확인한다. 격리 브라우저에서 모바일과 데스크톱의 설치 링크를 한 번씩 활성화한다. Google 수집 요청에서 측정 ID와 플랫폼·버전·파일명을 확인한다.
2. 실제 수신 확인은 `utm_source=release_check&utm_medium=internal_validation&utm_campaign=studio_release_validation_<timestamp>_<device>`가 표시된 새 브라우저 세션에서 한다. 두 이벤트 이름과 시각을 GA4 Realtime에서 먼저 조회하고, 일일 보고서 집계 뒤 캠페인으로 대조한다.
3. 브라우저에서 확인한 요청, 수집 서버 응답, GA4 보고서에 표시된 결과와 조회 시각을 각각 남긴다.
