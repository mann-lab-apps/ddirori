# 띠로리 무료 음악수업 GA4 운영

## 다시 사용할 목표 모드 프롬프트

> 띠로리 무료 음악수업에서 이번 기간에 처음 들어온 사용자가 같은 세션에 수업을 재생했는지, 어떤 경로에서 왔는지, 동료에게 받은 링크에서 재생이 일어났는지 검증한다. 교사용 페이지의 실제 재생과 자료 활용만 측정한다. 학생용 페이지, 운영자 QA, 짧은 음색 미리듣기는 획득 집계에서 제외한다. 측정 코드를 점검하고 읽기 전용 GA4 보고서를 실행한다. 운영 데이터, 수집 제한, 빈 행, 명시적 0 및 합성 검증을 구분한다. 첫 주 가설에 따라 유입을 늘릴지 첫 재생 동선을 개선할지 결정한다. 실제 조회 권한이 없으면 쿼리·코드·브라우저 전송 경로까지 검증하고 남은 권한을 명시한다.

## 무엇을 세는가

| 질문 | 기준 | 다음 판단 |
|---|---|---|
| 처음 온 사람이 수업을 듣는가 | 같은 세션, 지정 기간 내 사이트의 `first_visit` → 교사 `lesson_view` → 교사 `lesson_start`. 분모는 앞의 두 단계, 분자는 세 단계에 도달한 활성 사용자다. | 첫 주 신규 도달 20명 미만이면 유입 채널을 점검한다. 20명 이상에서 시작 5명 및 25%를 함께 넘거나 같으면 같은 채널을 한 번 더 시험한다. |
| 선생님끼리 건넨 링크가 쓰이는가 | `utm_source=teacher`와 `utm_medium=referral`가 달린 교사 페이지 방문 → 같은 세션의 시작. 기존 방문자도 포함한다. | 2명 이상이면 공유 실험을 한 주 더 진행한다. 복사 성공 횟수와 구분한다. 본인이 다시 연 경우까지 개인 단위로 식별할 수는 없다. |
| 무엇을 더 쓰는가 | 활동별 첫 재생과 끝 도달, 활동지 인쇄 창 열기, 가정 연습 열기·복사를 집계한다. | 다음 수업 주제를 선정하는 보조 신호다. 실제 수업 진행은 사용 후기로 확인한다. |

GA의 사용자 식별·집계 방식을 따른다. 같은 사람의 기기 교체, 쿠키 삭제, 분석 차단이 수치에 영향을 준다. 최초 방문이 기간 밖에 있고 수업 재생만 기간 안에 있으면 그 기간의 신규 획득에서 제외한다. 한 사용자가 여러 채널·활동에 나타날 수 있어 고유 사용자 합계를 채널별 수치의 합으로 대체하면 안 된다.

## 수집 계약

| 이벤트 | 발생 시점 | 반복 처리 |
|---|---|---|
| `lesson_view` | 교사용 수업 페이지를 열 때 | 페이지 로드당 한 번 |
| `lesson_start` | 네 활동 중 처음으로 음원·수업 영상에 `playing`이 발생할 때 | 페이지 로드당 한 번 |
| `lesson_activity_play` | 각 활동이 실제 재생될 때 | 활동별 페이지당 한 번. 일시정지·다시 듣기·같은 주제의 매체 전환은 추가하지 않는다. |
| `lesson_activity_end` | 재생했던 활동의 매체가 끝에 도달할 때 | 활동별 페이지당 한 번. 탐색 막대 이동도 가능하므로 전체 청취 시간과 구분한다. |
| `lesson_teacher_share` / `lesson_home_copy` | 교사용 추천·학생용 가정 연습 주소의 클립보드 쓰기 성공 | 성공한 동작마다. 수동 복사 안내 노출은 제외한다. |
| `lesson_print_request` / `lesson_home_open` / `lesson_use_draft` | 인쇄 요청, 학생 페이지 열기, 후기 메일 작성 진입 | 클릭마다. 실제 출력·메일 수신·학생 실습 여부는 알 수 없다. |

재생 이벤트에는 정해진 활동명 `content_slug`(missing-beat, dynamics, melody, echo), 음원/영상 `activity_context`, 적용되는 난이도 `difficulty`를 보낸다. 입력한 학생 이름, 응답 내용, 자유 서술은 전송하지 않는다. 운영 태그는 대표 도메인의 교사용 페이지와 기존 소개 사이트에서만 작동한다. 학생용 페이지에서 GA를 초기화하지 않는다. 개발·테스트에는 대표 도메인의 어느 계측 페이지든 `?qa=1`로 들어간다. 같은 탭에서 이동해도 제외되고 `?qa=0`으로 복구된다. 탭 저장소가 차단된 환경에서는 각 페이지에 QA 파라미터를 붙인다.

## 보고서 실행

Ddirori 속성의 숫자 ID와 뷰어 권한을 가진 인증이 필요하다. 로컬 운영용 파일은 `~/.config/ddirori/ga4/credentials.json`이다. 다른 환경은 표준 Google ADC 또는 `GOOGLE_APPLICATION_CREDENTIALS`를 사용할 수 있다. 인증을 갖춘 경우 Data API의 analytics.readonly 범위로만 요청한다.

```sh
# 인증 없이 실제 HTTP 요청 본문 확인
python3 scripts/lesson-ga4-report.py --start 2026-11-23 --end 2026-11-29 --plan

# 숫자 ID를 환경변수 DDIRORI_GA4_PROPERTY_ID 또는 --property로 지정
uv run scripts/lesson-ga4-report.py --start 2026-11-23 --end 2026-11-29

# 특정 채널의 같은 세션 획득을 같은 정의로 다시 계산
uv run scripts/lesson-ga4-report.py --start 2026-11-23 --end 2026-11-29 --channel 'google / organic'

# content_slug 맞춤 측정기준을 등록한 이후 선택 가능
uv run scripts/lesson-ga4-report.py --start 2026-11-23 --end 2026-11-29 --activities
```

- `cohorts`는 Data API v1alpha의 닫힌 퍼널과 같은 세션으로 한정한 사용자 순차 세그먼트를 쓴다. 필요한 단계에서 `activeUsers`를 읽는다. 전체 수업 도달·인쇄 등 보조 지표는 v1beta의 `totalUsers`와 `eventCount`다. 서로 다른 지표를 나누어 신규 시작률을 계산하지 않는다. [Google 퍼널 API](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1alpha/properties/runFunnelReport) · [탐색 응답의 행 이름과 범위](https://developers.google.com/analytics/devguides/reporting/data/v1/exploration-api-schema)
- `channels`는 모든 방문자의 세션 소스/매체별 도달·시작이다. 선택한 채널에서 신규 순차 조건까지 확인하려면 `--channel`로 다시 실행한다. 추천 판정은 수신 링크의 표식을 사용한다. 방문 도중 공유 링크를 클릭하면 GA가 귀속한 세션 소스/매체와 다를 수 있다. [Google 표준 측정기준](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- 명시적으로 반환한 0은 0으로 출력한다. 행 누락은 `null` 또는 `no_rows`, 인증 오류는 `auth_unavailable`, 일부 API만 실패하면 `partial_error`와 오류 코드를 돌려준다. 실패한 항목을 0으로 채우지 않는다. 퍼널 표본 추출, 시차, 미성숙 기간, 7일 이외의 기간은 주간 판정을 보류한다. Core 보고서에는 기준점 적용·행 잘림 등의 경고를 별도로 표시한다.
- 속성의 보고 시간대는 Asia/Seoul로 확인한다. 종료일로부터 3일 후를 첫 운영 판정 시각으로 삼는다. 첫 비교는 11월 23~29일, 판정은 12월 2일부터다. 비교 주간은 11월 30일~12월 6일이다.

## 속성에서 설정할 항목

관리 권한이 있는 운영자가 '맞춤 정의'에서 이벤트 범위 측정기준 `content_slug` 등록 여부를 확인한다. 주제별 보고를 쓰려면 이 하나부터 등록한다. `activity_context`와 `difficulty`는 매체나 난이도를 비교할 때 추가한다. 기본 획득 보고서는 맞춤 정의에 의존하지 않는다. Google은 등록 후 보고 가능하기까지 통상 24~48시간을 안내한다. 관심 행동을 주요 이벤트로 관리하려면 `lesson_start`를 선택할 수 있다. 기존 주간 판정은 주요 이벤트 설정과 독립적이다. [Google 맞춤 측정기준 안내](https://support.google.com/analytics/answer/14240153)

## 검증 재현

`python3 scripts/test-lesson-ga4-report.py`는 합성 응답으로 세션 조건·임계값·결측·표본 추출·기간 경계를 검증한다. 사이트 빌드 후 `scripts/verify-lessons-browser.mjs`로 재생·재개·재생 종료·QA 탭·학생 페이지를 검사한다. `node scripts/verify-lesson-ga4-live.mjs`는 공개 배포 검증용이다. 별도 브라우저에서 실제 Google 태그의 전송 요청을 관찰하고 수집 서버에 도달하기 전에 막는 방법을 쓴다. 이 검증과 GA 속성에 실제 집계된 결과는 별도로 기록한다.
