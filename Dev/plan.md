# GritLab 3v3 전광판 개선 + 대회 관리 Admin 페이지

## 요구사항 요약

| # | 요구사항 | 난이도 | 영향 범위 |
|---|---------|--------|----------|
| 1 | 샷클락 글씨 주변 블러 제거 | 낮음 | CSS 1줄 |
| 2 | 샷클락 색상: 기본 green → 5초 이하 red | 낮음 | CSS + JSX 조건부 클래스 |
| 3 | 3v3 대회 Admin 페이지 (예선→결승 토너먼트 관리) | 높음 | 신규 페이지 + DB 테이블 |
| 4 | 경기 결과 DB 저장 (저장 버튼 → 즉시 Supabase) | 중간 | 기존 로직 활용 |
| 5 | 대회 타이틀을 `tournaments` 테이블(ID:17498)에 저장 → records에서 조회(record에 select season 에서 전체 조회될수 있도록 ) | 중간 | Leaderboard 확장 |

추가 + 지난 대회가 진행중으로 표시되는데 이거 종료처리 할수 있는 기능이 있으면 좋겠어. 
---

## Task 1: 샷클락 블러 제거
**파일**: `src/pages/threevthree/scoreboard.module.css`

**변경 내용**:
- `.shotClockGiant`에서 `backdrop-filter: blur(12px)` 및 `-webkit-backdrop-filter: blur(12px)` 제거
- `background: rgba(0,0,0,0.3)` 유지 (가독성)

---

## Task 2: 샷클락 색상 변경 (green → 5초 이하 red)
**파일**: `scoreboard.module.css` + `Scoreboard.jsx`

**CSS 변경**:
- `.shotClockGiant` 기본 color를 `var(--sb-green)`으로 변경 (현재 `var(--sb-red)`)
- `.shotClockDanger` 신규 클래스 추가: color `var(--sb-red)`, text-shadow red 계열

**JSX 변경**:
- `game.shot_clock <= 5` 조건으로 `styles.shotClockDanger` 클래스 토글
- 기존 `shotClockZero` 조건과 병합

---

## Task 3: 3v3 대회 Admin 페이지

### 3-1. DB 테이블 설계 (Supabase)

기존 테이블 활용:
- `tournaments` (ID:17498) — 대회 타이틀 저장 (type='3V3' 추가)
- `game_3v3_sessions` — 기존 세션 테이블 활용
- `game_3v3_results` — 기존 결과 테이블 활용

신규 테이블:
```sql
-- 3v3 토너먼트 대진표
CREATE TABLE game_3v3_brackets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id),
  round TEXT NOT NULL,          -- 'GROUP_A', 'GROUP_B', 'QUARTER', 'SEMI', 'FINAL'
  match_order INT NOT NULL,     -- 경기 순서
  team_a_name TEXT NOT NULL,
  team_b_name TEXT NOT NULL,
  team_a_score INT DEFAULT 0,
  team_b_score INT DEFAULT 0,
  winner TEXT,                  -- 'A_WIN', 'B_WIN', 'DRAW', NULL(미완)
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'LIVE', 'ENDED'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3-2. Admin 페이지 UI 구조

**경로**: `/threevthree/admin`
**파일**: `src/pages/threevthree/Admin.jsx`

**화면 구성**:
```
┌─────────────────────────────────────────────────┐
│  GRIT LAB 3:3 대회 관리                    [← 뒤로] │
├─────────────────────────────────────────────────┤
│                                                   │
│  [대회 선택 드롭다운] or [새 대회 생성]              │
│                                                   │
│  ┌─── 라운드 탭 ──────────────────────────────┐   │
│  │ 예선A │ 예선B │ 8강 │ 4강 │ 결승 │          │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
│  ┌─── 경기 카드 ─────────────────────────────┐   │
│  │  GAME 1                                    │   │
│  │  [팀A 입력] [__:__] [팀B 입력]             │   │
│  │             [저장]                          │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
│  ┌─── 토너먼트 브래킷 뷰 ────────────────────┐   │
│  │  예선 → 8강 → 4강 → 결승 시각화            │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
└─────────────────────────────────────────────────┘
```

**핵심 기능**:
1. 대회 생성/선택 (`tournaments` 테이블에 type='3V3'로 저장)
2. 라운드별 경기 추가 (팀명 입력)
3. 점수 입력 + 저장 버튼 → `game_3v3_brackets` 즉시 저장
4. 승자 자동 계산 → 다음 라운드에 자동 배치
5. 토너먼트 대진표 시각화

---

## Task 4: 전광판 경기 저장 연동 강화
**파일**: `Scoreboard.jsx`

현재 `handleSaveResult`가 `game_3v3_results`에 저장 중.
- Admin에서 생성한 `tournament_id`와 연결되도록 확장
- 저장 시 `game_3v3_brackets`의 해당 매치도 업데이트

---

## Task 5: Records 페이지에서 3v3 대회 조회
**파일**: `src/pages/tournament/Leaderboard.jsx`

**변경 내용**:
- `tournaments` 테이블에서 `type='3V3'`인 대회도 함께 조회
- 3v3 대회 선택 시 → `game_3v3_brackets` 데이터로 대진표 형태 렌더링
- 3점슛 대회(기존)와 3v3 대회 탭 분리

---

## 구현 순서

```
Phase 1 (즉시, ~10분)
  ├── Task 1: 샷클락 블러 제거
  └── Task 2: 샷클락 색상 변경

Phase 2 (핵심, ~40분)
  ├── Task 3-1: DB 테이블 SQL 생성
  ├── Task 3-2: Admin.jsx 페이지 구현
  └── Task 4: 전광판 저장 연동

Phase 3 (연동, ~20분)
  └── Task 5: Records 페이지 3v3 탭 추가
```

---

## 기술 스택 (기존 유지)
- React 19 + Vite 7
- Supabase (mwitveudlafcrksokjtz)
- CSS Modules
- Tailwind CSS 3 (Leaderboard 등 일부)
- lucide-react (아이콘)
- react-router-dom v7

<!-- [승인] -->
