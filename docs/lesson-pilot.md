# 무료 음악수업 유입 실험

초급 피아노를 가르치는 사람이 띠로리에서 무료 자료를 발견하고 수업을 시작하는지 확인한다. 네 가지 활동과 교사용 활동지, 가정 연습은 가입 없이 제공한다. 학생용 페이지는 GA를 초기화하지 않는다.

## 배포와 발견 경로

[무료 수업](https://ddirori.com/lessons/)은 홈페이지 첫 화면과 사이트맵에 연결한다. 학습 원리는 [Ableton Learning Music](https://learningmusic.ableton.com/make-beats/make-beats.html)과 [Chrome Music Lab](https://musiclab.chromeexperiments.com/Rhythm/)을 참고했다. 색과 조작 상태는 in-c 저장소에서 생성한 `docs/brand/ddirori-design-system/generated/tokens.css`를 수업에 한정해 사용한다. 박자를 나타내는 하늘색과 건반을 나타내는 살구색은 숫자, 글자, 모양을 함께 사용한다.

| 유입 | 주소 또는 근거 |
|---|---|
| 공식 홈페이지 | 첫 화면의 무료 수업 버튼에 `?from=homepage`를 붙인다. 원래의 GA 유입 출처를 덮어쓰지 않는다. |
| 검색 | 교사용 페이지의 canonical과 sitemap 항목은 `https://ddirori.com/lessons/`다. 검색 유입은 GA 세션 소스/매체에서 본다. |
| 동료 추천 | 교사용 링크 복사는 기존 파라미터를 비우고 `utm_source=teacher&utm_medium=referral&utm_campaign=free_lessons`를 붙인다. 수신자의 방문과 재생을 별도로 본다. |
| 쇼츠 프로필을 활용할 때 | [쇼츠용 링크](https://ddirori.com/lessons/?utm_source=youtube&utm_medium=organic_social&utm_campaign=free_lessons). 공개한 뒤부터 해당 채널 성과를 판단한다. |

## 첫 판정

배포 당일은 부분 일자로 구분한다. 첫 비교 기간은 2026년 11월 23일부터 29일까지 한국 시간이다. 집계 지연을 고려해 12월 2일에 읽는다. 두 번째 비교 기간은 11월 30일부터 12월 6일까지다. 날짜는 GA 속성의 보고 시간대를 기준으로 맞춘다.

1. GA4 탐색에서 호스트를 `ddirori.com` 또는 `www.ddirori.com`으로 제한하고 방문·시작 단계에만 교사 페이지 경로 `/lessons/`, `/lessons/index.html`를 적용한다. 사이트 첫 방문 단계는 전체 사이트에서 본다. `?qa=1`은 교사용 GA 초기화를 생략한다. 운영자 확인은 이 주소를 쓴다. 내부·테스트 캠페인도 제외한다.
2. 신규 유입은 해당 기간 사이트 첫 방문(`first_visit`)과 교사 페이지 방문(`lesson_view`)이 같은 세션인 사용자다. 사이트에 왔던 사람이 수업을 처음 발견한 경우까지 포함한 도달 수는 `lesson_view`의 전체 사용자 수로 따로 본다. 사용자 수는 브라우저 기준 추정치이며 직업은 확인하지 않는다.
3. 획득한 사용자는 신규 유입 중 같은 세션에 수업 음원 또는 수업 영상이 실제 재생(`lesson_start`)된 사람으로 정의한다. GA4 퍼널 탐색에서 방문 → 시작 순서와 동일 세션 조건을 적용하고 각 단계 사용자 수를 읽는다. 교사 홈페이지 경유는 방문 페이지의 `from=homepage`, 추천은 세션 소스/매체 `teacher / referral`, 쇼츠는 `youtube / organic_social`로 분리한다.
4. 첫 주 판단 가설은 **신규 유입 20명 이상, 그중 시작 5명 이상이며 시작률 25% 이상**이다. 유입이 20명에 못 미치면 배포 경로부터 바꾼다. 방문이 확보됐으나 재생률이 낮으면 첫 화면의 주제와 듣기 동선을 바꾼다. 추천 링크를 타고 온 별도 브라우저에서 시작 사용자 2명 이상이면 공유 경로를 다음 주에도 검증한다. 운영 테스트와 본인의 재방문은 성과에 포함하지 않는다.
5. `lesson_teacher_share`는 교사용 링크 복사 성공, `lesson_home_copy`와 `lesson_home_open`은 교사의 가정 연습 전달 동선, `lesson_print_request`는 인쇄 창 열기다. 실제 수업 사용 여부는 교사가 자발적으로 보내온 날짜·상황으로만 확인한다. 학생 이름을 받지 않는다.

결과 기록은 기간, 유입 경로, 신규 방문 사용자 수, 시작 사용자 수, 시작률, 추천을 통한 시작 사용자 수를 남긴다. 채널별 사용자 수의 합에는 중복이 있을 수 있어 전체 고유 사용자 수를 별도로 조회한다. 보고 권한 또는 표본이 없으면 미확인으로 기록한다.

## 재현

```sh
node scripts/build.mjs
node scripts/verify.mjs
python3 -m http.server 8117 --bind 127.0.0.1 --directory dist
```

서버를 연 뒤 `DDIRORI_LANDING_URL=http://127.0.0.1:8117/ node scripts/verify-lessons-browser.mjs`로 교사·학생 화면, 네 수업, 공유, 인쇄와 수집 이벤트를 검사한다. 필요한 경우 `DDIRORI_PLAYWRIGHT`, `DDIRORI_BROWSER`로 기존 Playwright와 브라우저 경로를 지정한다.
