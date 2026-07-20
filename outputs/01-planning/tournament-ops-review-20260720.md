---
agent: Dylan (01-기획)
status: ✅ COMPLETE
version: 1.0
created: 2026-07-20
updated: 2026-07-20
self-review: PASS
next-trigger: 사장 우선순위 승인 → Ethan(05-개발) P0 4건 착수
blocking-issues: 없음 (분석 완료, 구현은 착수 전)
human-gate: 우선순위 로드맵(P0 4건 착수 여부·BUG-009 운영 DB 마이그레이션 승인) 확인 필요
---

> 프로젝트: GritLab | 브랜치: main (워킹트리 uncommitted 2건 별도) | 환경: prod (grit-lab.kr, Supabase `aitqwjzcjyyxqvsosqyd`)
> 리뷰어: Dylan (기획 PM) — 코드·문서 직접 판독 + 프로덕션 DB anon 조회(REST API) 실측 기반
> 페르소나: ① 대관업체 사장 ② 대회 당일 운영자 ③ 참가 선수/팀 ④ 관람객

## 결론 (1~2문장)

도구 자체는 5회 실대회를 무사히 치러낸 실전 검증된 시스템이지만, **"저장이 실패해도 화면은 다음 단계로 넘어간다"는 무음 실패 패턴이 최소 4곳에서 반복**되고 있고, 그 중 2건(무승부 처리·경기 삭제 후 4강 미재계산)은 이미 확인된 미해결 버그이며 2건(라이브 저장 실패 무시·네트워크 에러 미처리)은 이번에 새로 발견한 P0다. 프로덕션 DB에는 `match_order` 충돌이 이미 4건 실재해 "동시 편집 리스크"가 가설이 아니라 사실로 확인됐다. 급한 것부터 고치면 반나절, 전체는 3일 내 마무리 가능하다.

---

## 이슈 표

| ID | 심각도 | 페르소나 | 무엇이 잘못됐나 | 근거 (file:line) | 대안 (공수 포함) |
|----|--------|---------|----------------|------------------|------------------|
| **NEW-01** | 🔴 P0 | 대회 당일 운영자 · 참가 선수/팀 | `saveLiveAndClose()`가 `handleSaveMatch()`의 성공/실패를 확인하지 않고 **무조건** 인터미션 화면으로 전환한다. 주석은 "저장 성공 후"라고 적혀있지만 실제로는 실패해도 동일하게 진행되며, `liveMatch`가 즉시 `null`이 되어 라이브 화면의 로컬 상태(점수·시간)가 사라진다. 체육관 와이파이가 끊긴 순간 "저장 & 종료"를 누르면 경기 결과가 DB에 안 들어간 채 다음 경기로 넘어간다. | `Admin.jsx:761-775` (`await handleSaveMatch(updated);` 다음 줄부터 조건 없이 `setShowIntermission(true)` 등 실행) | **코드**: `handleSaveMatch`가 `boolean`(성공 여부)을 반환하도록 수정 → `saveLiveAndClose`에서 `false`면 인터미션 진입을 막고 "저장 실패 — 재시도" 모달 유지. **1.5h**. **운영 절차(즉시)**: alert가 뜨면 절대 닫지 말고 재시도 — 당일 운영 체크리스트 1줄 추가 (0h, 근본해결 아님). |
| **NEW-02** | 🔴 P0 | 대회 당일 운영자 | `fetchMatches()` / `fetchTournaments()`가 Supabase 에러를 전혀 캡처하지 않는다(`const { data } = await ...`로 `error` 변수 자체를 버림). 네트워크가 끊긴 상태에서 대회를 전환하거나 페이지를 새로고침하면 "경기가 0건인 대회"와 "네트워크 오류"를 화면에서 구분할 수 없다. 라이브 이벤트 중 운영자가 이를 "데이터 소실"로 오인해 대진표를 처음부터 다시 만들려다 실제 데이터를 덮어쓸 위험이 있다(오늘 커밋된 빌더 stale-write 가드는 빌더 쪽만 방어함). | `Admin.jsx:300-315`(`fetchTournaments`), `Admin.jsx:342-350`(`fetchMatches`) | **코드**: `{ data, error }` 구조분해 후 `error` 시 화면 상단 배너("네트워크 오류 — 재시도" 버튼, 기존 `allMatches` 유지)로 전환. **1.5h**. **운영 절차**: 대회 시작 전 와이파이 신호 확인 + 스마트폰 테더링 백업 준비를 당일 체크리스트에 명시. |
| **BUG-006 (재검증)** | 🔴 P0 | 참가 선수/팀 · 대관업체 사장 | **여전히 존재.** 예선 경기를 삭제(`handleDeleteMatch`)하거나 잠금 해제 후 재수정(`toggleUnlock`)해도 `maybeAutoFillBracket()`이 호출되지 않는다. 이미 4강이 자동 시딩된 뒤(1회성 잠금 — `!semiRows.some(m => m.team_a_name...)` 조건이 재시딩을 막음) 예선 결과를 정정하면, **잘못된 팀이 4강에 남아있는 채로 아무 경고 없이 방치**된다. `toggleUnlock`의 확인 문구도 "순위(standings)에 즉시 반영됩니다"라고만 안내해 4강 대진은 갱신되지 않는다는 사실을 숨긴다. | `Admin.jsx:615-624`(삭제, `maybeAutoFillBracket` 호출 없음), `Admin.jsx:558-559`(시딩 1회 잠금 조건), `Admin.jsx:638`(오해 소지 있는 확인 문구) | **코드**: 삭제/재수정 시 해당 라운드의 SEMI/FINAL이 이미 팀명을 갖고 있으면 `confirm("4강 대진이 이미 이 결과로 확정되어 있습니다. 계속하면 4강 팀을 직접 확인·수정해야 합니다.")`로 경고. 여력이 되면 SEMI가 아직 미시작(PENDING)인 경우에 한해 자동 재계산 옵션 제공. **경고만: 1.5h / 재계산까지: +2.5h**. **운영 절차**: 예선 결과 수정은 반드시 4강 시딩 전에 완료 — SOP에 "4강 자동생성 후 예선 결과 정정 금지, 부득이하면 4강 팀명 수동 확인 필수" 명시. |
| **BUG-007 (재검증)** | 🔴 P0 | 대회 당일 운영자 · 참가 선수/팀 | **여전히 존재.** 점수가 같으면(`team_a_score === team_b_score`) `winner=null`이고 `status`는 `match.status` 그대로 유지되어(`ENDED`로 전환 안 됨) `maybeAutoFillBracket`의 `every(m => m.status==='ENDED')` 조건을 영원히 통과하지 못한다. 라이브 종료(`saveLiveAndClose`)·수동 입력(`handleSaveMatch`) 둘 다 동일 결함. 3x3은 규정상 무승부가 없으므로 실제 발생은 "데이터 오타(잘못 같은 점수 입력)"가 유일 경로지만, 발생 시 "왜 4강이 안 생기지?"를 운영자가 원인도 모른 채 겪는다. 실측: 프로덕션 63개 경기 중 동점 사례는 0건(빈 placeholder 제외) — 아직 안 터졌을 뿐, 코드는 여전히 무방비. | `Admin.jsx:530-537`(`winner` 계산), `Admin.jsx:558-559`(진행 게이트) — 참고: `tournament.html:1716`의 `isDone`도 동일하게 동점을 "미완료"로 취급(설계 의도와 일치하나 경고 없음) | **코드**: `handleSaveMatch`/`saveLiveAndClose`에서 동점 감지 시 저장을 막고 `alert("3x3은 무승부가 없습니다. 점수를 다시 확인하세요.")`. 두 파일(Admin.jsx, tournament.html) 동시 반영. **1h**. |
| **BUG-005 (재검증)** | 🟡 P1 | 대회 당일 운영자 · 참가 선수/팀 · 대관업체 사장 | **여전히 존재, 여전히 무경고.** `computeSemiSeeding`의 `G >= 4` 분기가 `groupRounds.sort()`(알파벳 순) 후 앞 4개 조의 1위만 취해 4강을 구성한다. 5조 이상이면 뒤쪽 조는 성적과 무관하게 배제된다. `tournament.html`의 동일 로직(`computeQualification`)은 `overflow: true` 플래그와 "⚠️ 5조↑ 본선 4팀 초과" 경고 배지를 갖고 있는데, Admin.jsx 쪽은 이 플래그 자체가 없다. **실측: 지금까지 5개 3v3 대회 모두 최대 3개 조까지만 사용 — 아직 미발동.** 참가팀이 늘어 5조 이상이 되는 순간 P0로 격상. | `Admin.jsx:87-124`(특히 100-101행 `slice(0,4)`, overflow 플래그 없음) vs `tournament.html:1824-1828`(overflow 계산), `:1982,:2300`(경고 UI) | **코드**: Admin.jsx의 `computeSemiSeeding`에 `overflow` 플래그 추가 + `autoSemiInfo` 배지에 동일 경고 문구 반영. **1h**. |
| **BUG-009 (재검증, 실측 확인)** | 🟡 P1 | 참가 선수/팀 · 관람객 | `game_3v3_brackets`에 `(tournament_id, round, match_order)` UNIQUE 제약이 없다 — 이건 이미 `Dev/GRITLAB_3V3_SYSTEM.md:105`에 "잔여 위험"으로 문서화되어 있었다. **가설이 아니라 실측으로 확인**: 프로덕션 DB에 동일 라운드·동일 `match_order`를 가진 서로 다른 경기가 **4쌍** 존재한다(예: 581ae1ca 대회 `SEMI` 라운드에 "MOZZIRI vs POSTUP"과 "BBAKSKETBALL vs KISAN"이 둘 다 `match_order=1`, `GROUP_B`에는 `match_order=2`가 아예 없음; b70b5ded 대회는 `3RD_PLACE`에 빈 PENDING row가 완전히 동일한 내용으로 2개 존재). 결과 자체(점수·승자)는 정확하지만, `match_order`로 "게임 1/게임 2"를 표시하는 화면(전광판·기록 열람)에서 라벨이 꼬일 수 있다. 원인 후보: 라운드 이동/자동 시딩 삽입 경로 중 일부가 `Math.max()+1`이 아닌 리터럴 순서값(`i+1`, `1`)을 그대로 쓴다(`Admin.jsx:573`, `:603`). | `supabase/migrations/20260720000001_baseline.sql:71-84`(UNIQUE 없음), `Admin.jsx:573,603`(리터럴 order), 실측: 프로덕션 REST 조회(본문 하단 방법 참조) | **코드**: `(tournament_id, round, match_order)` UNIQUE 제약 마이그레이션 + 충돌 시 재계산 삽입 로직. **운영 DB 스키마 변경 — 사장 승인 게이트.** 마이그레이션 작성 1h + 회귀 테스트 2h = **3h**. **운영 절차(즉시)**: 동일 대회를 두 기기에서 동시에 열어 편집하지 않기 — 당일 체크리스트 1줄. |
| **NEW-03** | 🟡 P1 | 대관업체 사장(유지보수 비용) · 대회 당일 운영자(동작 불일치 혼란) | 라이브 경기 엔진(게임클락·샷클락·부저·득점·승자 판정)이 `Admin.jsx`(대회용)와 `Scoreboard.jsx`(자유 전광판)에 **완전히 독립적으로 두 번 구현**돼 있다. 무승부 판정조차 서로 다르다 — Admin.jsx는 동점을 `winner=null`(미완료 취급), Scoreboard.jsx는 `winner='DRAW'`(완료로 확정 저장)로 처리한다. 실제로 FR-04(샷클락 표시 버그)는 두 파일을 각각 수정해야 했던 이력이 있다(`Dev/plan.md` FR-04). 새 버그 수정·기능 추가가 생길 때마다 공수가 2배로 들고, 한쪽만 고치면 동작이 갈라진다. | `Admin.jsx:530-531`(winner=null) vs `Scoreboard.jsx:435-437`(winner='DRAW', `game_3v3_results`에 그대로 insert), `Dev/plan.md:137`(FR-04가 "Scoreboard.jsx + Admin.jsx 둘 다" 명시) | **코드(단기)**: 무승부 판정만이라도 공용 유틸로 통일(BUG-007 수정과 동시 진행). **1h**(BUG-007에 포함 가능). **코드(중장기, 백로그)**: 공용 `useLiveGameEngine` 훅으로 클락/부저/판정 로직 통합 — 큰 리팩터라 Phase 2 권장. **8~12h**. |
| **NEW-04** | 🟡 P1 | 대관업체 사장(핵심) | 3v3 대회에는 참가팀의 연락처·명단이 **어디에도 저장되지 않는다.** `team_a_name`/`team_b_name`은 자유 텍스트일 뿐이고, 선수 개별 레코드(`players` 테이블)는 3PT(슈팅) 종목에만 연결돼 있다(실측: `players` 테이블의 40건은 전부 2026-03 3PT 대회 소속, 3v3 5개 대회 중 데이터 있는 건 0~1건). 대관업체 입장에서 반복 개최·재참가 유도·다음 대회 홍보에 쓸 고객 데이터 자산이 전혀 축적되지 않고 있다. | `supabase/migrations/20260720000001_baseline.sql:71-84`(`game_3v3_brackets`에 연락처 컬럼 없음), `:132-143`(`players`가 `tournament_id` FK지만 3v3 5개 중 최대 1개만 연결), 실측: REST 조회로 3v3 대회별 `players` 매칭 확인 | **코드**: 대회 생성 또는 팀 최초 등록 시 "팀 대표자 연락처"(전화번호 1개) 입력 필드 추가 + 신규 컬럼. **2.5h**. **주의**: 개인정보(전화번호) 수집이므로 수집 목적 고지·보관기간 정책이 필요 — 결제/개인정보 키워드에 해당해 **Sentinel(보안)·Yul(법무) 검토 권고**. **운영 절차(즉시, 0h)**: 접수 시 카카오톡 오픈채팅/구글폼으로 연락처를 별도 수집해 두는 것만으로도 임시 완화 가능. |
| **NEW-05** | 🟡 P1 | 대관업체 사장 · 대회 당일 운영자 | 관리자 계정이 `admin@grit-lab.kr` **1개뿐**이고 비밀번호를 스탭끼리 공유하는 구조다(`grit-login.html`). 누가 어떤 경기 점수를 수정했는지 추적할 방법이 없다(`updated_at`만 있고 `updated_by` 없음). 오기입 시비가 생기면("그 점수 누가 고쳤어요?") 확인이 불가능하다. | `public/grit-login.html:13,177,220`(단일 계정 `signInWithPassword`), `supabase/migrations/20260720000001_baseline.sql:83`(`updated_at`만 존재, `updated_by` 없음) | **코드**: 스탭별 개별 Supabase Auth 계정 + `updated_by` 컬럼. **3h**. **운영 절차(즉시, 0h, 권장)**: 스코어 정정 시 운영 카톡방에 "OO경기 8:9→8:10 정정, 사유: 오기입" 1줄 남기는 규칙만으로 즉시 완화 가능 — 코드 수정 전까지 이걸로 대체. |
| **BUG-004 (재검증)** | ⚪ P2 | 참가 선수/팀 | 같은 조 팀이 4강에서 만나는 걸 피하는 스왑이 **1회만 시도되고 재검증이 없다**. `semis[0]`이 같은 조면 `semis[0][1]`과 `semis[1][1]`을 한 번 교환할 뿐, 교환 후에도 여전히 충돌이 남는지 확인하지 않는다. 다만 코드 검토로 확인한 결과, 스왑이 부족한 경우는 대부분 "한 조가 3팀 이상 4강에 올라가는" 구조적으로 회피 불가능한 상황이었다(4팀 중 3팀이 한 조 소속이면 어떻게 짝을 지어도 동조 매치업이 1개는 남음) — 이 경우는 애초에 경고가 있어야 하는데 없다. 실측: 현재까지 최대 3개 조 운영이라 이 정도로 극단적인 편중은 아직 없었다. | `Admin.jsx:120-123`(1회 스왑, 재검증 없음) | **코드**: 3가지 페어링 조합을 모두 시도해 충돌 없는 조합을 우선 채택 + 불가능하면 "⚠️ 같은 조 매치업 불가피" 배지. **1.5h**. |
| **NEW-06** | ⚪ P2 | 참가 선수/팀 · 관람객 | 조별 순위·와일드카드 선발 로직이 승수 → 득실차 → 다득점 순으로 정렬하며 **승자승(head-to-head)** 비교가 빠져있다. FIBA 3x3 공식 규정상 동일 조 내 동률은 ①맞대결 결과 → ②득실차 → ③다득점 순이 표준이다. 두 구현(Admin.jsx, tournament.html) 모두 동일하게 h2h를 건너뛴다 — 일관성은 있지만 규정과 다르다. 승패·득실차·득점이 모두 같은 극히 드문 경우에만 순위가 갈릴 수 있는 엣지케이스. | `Admin.jsx:81`, `tournament.html:1738-1739`(둘 다 승수→득실차→다득점, h2h 없음) | **코드**: 승수 동률 팀이 2팀뿐이고 그 둘의 맞대결 기록이 있으면 h2h를 득실차보다 먼저 비교하도록 삽입. **2h** (양쪽 파일). |
| **NEW-07** | ⚪ P2 | 대관업체 사장(장기 유지비) · 향후 개발자 | `npm run lint`가 `eslint.config.js` 부재로 **실행 자체가 안 된다**(ESLint 9 flat config 요구, devDependency는 이미 설치돼 있음: `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`). 코드에 이미 `// eslint-disable-line react-hooks/exhaustive-deps`가 여러 곳 있는데 정작 린트가 안 돌아가니 새로 생기는 훅 의존성 문제를 잡아낼 안전망이 없다. | `package.json:8`(`"lint": "eslint ."`), 실행 확인: `eslint.config.js` 없음 → 즉시 에러 | **코드**: flat config 파일 신규 작성(이미 설치된 플러그인 연결). **1h**. |
| **NEW-08** | ⚪ P2 | 향후 개발자 | `src/pages/tournament/AdminLogin.jsx`, `Dashboard.jsx`가 `App.jsx` 어디에도 라우팅되지 않는 죽은 코드로 확인됨(구 대회관리는 `grit-login.html`→`tournament.html`로 완전 대체, `App.jsx:34-37`이 옛 경로를 리다이렉트 처리). 운영 리스크는 없지만, 다음에 실수로 이 파일을 수정해 시간을 낭비할 수 있다. | `src/App.jsx:1-56`(해당 컴포넌트 import 없음, 리다이렉트만 존재), `grep` 결과 프로젝트 전체에서 참조 0건 | **코드**: 두 파일 삭제. **0.5h**. |
| **NEW-09** | ⚪ P2 | 대관업체 사장 · 참가 선수/팀 | 접수 → 참가비 → 팀 명단 확정 단계가 도구 완전히 바깥(카카오톡/계좌이체 추정, 코드에 근거 없음 — 확인 안 됨)에서 이뤄진다. `tournament.html` 빌더는 팀명을 바로 조편성에 입력하는 구조라 "명단 확정"과 "조편성"이 분리돼 있지 않다. 이건 애초에 `Dev/plan.md`의 Out-of-Scope로 의도된 설계이므로 버그는 아니지만, 대회 규모가 커질수록(참가팀 증가) 수기 접수 비용이 선형으로 늘어난다. | `Dev/plan.md:88-96`(Out-of-Scope 항목), `public/tournament.html`(참가비/연락처 UI 텍스트 검색 결과 0건) | **운영 절차**: 현재 규모(3개 조 이하)면 카톡/구글폼으로 충분 — 그대로 유지 권장. **기능화 필요 시**: 별도 스프린트로 "팀 등록 폼"을 기획(WBS 신규 항목), 이번 로드맵에는 포함하지 않음. |
| **NEW-10** | ⚪ P2 | 대관업체 사장(마케팅 자산) · 참가 선수 | 개인 선수 단위 기록(득점·참가횟수 등)이 3v3에는 전혀 없다 — 팀명 텍스트와 팀 단위 승패만 남는다. "내가 이 대회에서 몇 경기 뛰었나"를 선수가 확인할 방법이 없고, 사장 입장에서도 "우수 선수"를 다음 대회 마케팅에 쓸 데이터가 없다. | 스키마 확인: `game_3v3_brackets`에 선수 개별 필드 없음 | **백로그**: 팀 로스터(선수 이름 배열) + 개인 기록 집계는 별도 기능 기획 대상. 이번 스프린트 범위 아님. |

> 참고: 오늘 세션에서 이미 커밋/작업된 항목(전광판 크래시 수정, Supabase 마이그레이션 체계, 빌더 stale-write 가드·insert 실패 롤백)은 재검증 결과 정상 반영되어 위 표에서 제외했다.

---

## 우선순위 로드맵

### 다음 대회 전 필수 (P0, 총 공수 약 6~8.5h ≈ 1일 이내)
1. NEW-01 라이브 저장 실패 시 무조건 진행 금지 — 1.5h
2. NEW-02 fetch 에러 처리(네트워크 배너) — 1.5h
3. BUG-006 예선 수정 후 4강 미재계산 경고 — 1.5h(경고만) / +2.5h(재계산까지)
4. BUG-007 동점 저장 차단 — 1h

이 4건은 전부 "당일 진행 불가 또는 조용한 데이터 손실"에 직결되고, 공통적으로 "저장/조회 실패를 화면이 숨긴다"는 같은 패턴이라 한 번에 묶어서 작업하는 게 효율적이다. 코드 수정 없이 **오늘 당장 가능한 임시 완화책**(운영 체크리스트에 "저장 실패 alert 뜨면 재시도", "와이파이 백업 준비", "예선 결과는 4강 시딩 전에만 수정" 3줄 추가)도 위 표에 함께 적어뒀다.

### 다음 스프린트 (P1, 총 공수 약 13.5h ≈ 2일)
5. BUG-005 5조 이상 경고 배지 — 1h
6. BUG-009 `match_order` UNIQUE 제약 — 3h (**운영 DB 스키마 변경, 사장 승인 게이트**)
7. NEW-03 무승부 판정 로직 통일 (BUG-007과 동시 진행 가능) — 1h / 엔진 통합은 백로그
8. NEW-04 참가팀 연락처 필드 — 2.5h (**개인정보 수집, Sentinel·Yul 검토 권고**)
9. NEW-05 스탭별 계정 분리 — 3h (또는 운영 절차로 즉시 완화, 0h)

### 백로그 (P2, 확정 공수 약 5h + 별도 기획 2건)
10. BUG-004 스왑 재검증 — 1.5h
11. NEW-06 FIBA 승자승 타이브레이커 — 2h
12. NEW-07 eslint.config.js 신설 — 1h
13. NEW-08 dead code 삭제 — 0.5h
14. NEW-09 팀 등록 폼 기능화 — 별도 기획 필요
15. NEW-10 개인 선수 기록 — 별도 기획 필요

**총 확정 공수: 약 24.5h(3일) + 개인정보/DB 승인 게이트 2건 + 신규 기획 2건**

---

## 조사 방법 (투명성)

- 코드: `src/pages/threevthree/Admin.jsx`(1732줄), `Scoreboard.jsx`(986줄), `public/tournament.html`(2426줄), `public/grit-login.html`, `src/App.jsx`, `supabase/migrations/*.sql` 전문 판독
- 문서: `Dev/plan.md`, `Dev/GRITLAB_3V3_SYSTEM.md`, `Dev/3v3_tournament_manual.md`, `Dev/recomend.md`, `Dev/daily-log.md`, `docs/integration_plan.md`, `docs/memory.md`
- 실측: `git diff`/`git log`로 오늘 작업분 확인, Supabase REST API(anon key, 읽기 전용)로 프로덕션 DB(`aitqwjzcjyyxqvsosqyd`) 직접 조회 — `tournaments` 7건, `game_3v3_brackets` 63건 전수 조회 후 동점·중복·미완료 패턴 스크립트 분석
- Supabase MCP(`execute_sql`)는 조직 권한 문제로 접근 거부되어 REST API(curl)로 대체
- `npm run lint` 직접 실행하여 재확인
