# GritLab 프로젝트 작업 기록 (memory.md)
> 마지막 업데이트: 2026-03-09

---

## 🏗️ 프로젝트 개요

- **도메인:** https://grit-lab.kr (www 없는 루트 도메인 기준)
- **레포:** https://github.com/wonyoung-R/gritlab
- **배포:** GitHub Pages (자동 배포 via GitHub Actions)
- **백엔드:** Supabase (DB + Auth + Realtime)
- **스택:** Vite + React + React Router + Framer Motion + Tailwind CSS + Lucide Icons

---

## 🗂️ 프로젝트 구조

```
gritlab/
├── public/
│   ├── CNAME                  ← 커스텀 도메인 (grit-lab.kr)
│   ├── 404.html               ← GitHub Pages SPA 라우팅 트릭
│   ├── ball_normal.png        ← 일반 농구공 이미지
│   ├── ball_money.png         ← 머니볼 이미지
│   ├── ball_deep3.png         ← 딥쓰리 이미지
│   └── ball_texture.png       ← FAB 버튼 배경 (실사 농구공 텍스처)
├── src/
│   ├── lib/
│   │   └── supabase.js        ← Supabase 클라이언트 (하드코딩 폴백 포함)
│   ├── components/
│   │   ├── Navbar.jsx         ← 상단 네비게이션 (Records 링크 포함)
│   │   └── PlayZoneFAB.jsx    ← 플로팅 버튼 (실사 농구공 텍스처, 스크롤 반투명)
│   └── pages/
│       ├── Landing.jsx        ← 메인 랜딩 페이지
│       ├── shootout/          ← 로컬 연습 모드
│       │   ├── Dashboard.jsx  ← 참가자 관리 (5명 기본)
│       │   ├── Shoot.jsx      ← 슈팅 기록 화면
│       │   ├── useStore.js    ← Zustand 로컬 상태
│       │   ├── page.module.css
│       │   └── shoot.module.css  ← 모바일 최적화 완료
│       └── tournament/        ← 클라우드 대회 모드
│           ├── AdminLogin.jsx ← 관리자 로그인 (Supabase Auth)
│           ├── Dashboard.jsx  ← 대회 생성/관리 (3PT/3V3 선택)
│           ├── Manage.jsx     ← 참가자 관리 (추가/삭제/순서)
│           ├── Shoot.jsx      ← 대회용 슈팅 (Supabase 실시간 저장)
│           └── Leaderboard.jsx ← 공개 리더보드 (HALL OF FAME)
└── docs/
    ├── supabase_schema.sql        ← DB 스키마 생성 SQL
    ├── supabase_rls_security.sql  ← RLS 보안 정책 SQL
    └── memory.md                  ← 이 파일
```

---

## 🗄️ Supabase 설정

### 접속 정보
- **URL:** https://mwitveudlafcrksokjtz.supabase.co
- **Anon Key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aXR2ZXVkbGFmY3Jrc29ranR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzM5MDksImV4cCI6MjA4ODU0OTkwOX0.QYmGs8HWZuau3QUQOwL9VTj3IaaJL7Fw0c3Z6V1ocEw
- **관리자 계정:** admin@grit-lab.kr / grit-lab

### 테이블 구조
| 테이블 | 주요 컬럼 |
|---|---|
| `tournaments` | id, title, type(3PT/3V3), status(ACTIVE/COMPLETED), created_at |
| `players` | id, tournament_id, name, rank_order, total_score, is_completed |
| `player_racks` | id, player_id, racks_data(JSONB), updated_at |

### RLS 보안 정책 (적용 완료)
- **SELECT**: 누구나 가능 (공개 리더보드)
- **INSERT/UPDATE/DELETE**: `authenticated` 관리자만 가능

### 적용 필요 SQL
> DB가 새로 생성된 경우 아래 SQL들을 순서대로 Supabase SQL Editor에서 실행

```sql
-- 1. 스키마 생성 (supabase_schema.sql)
-- 2. type 컬럼 추가 (기존 DB에 없을 경우)
ALTER TABLE public.tournaments ADD COLUMN type TEXT DEFAULT '3PT';
-- 3. RLS 보안 정책 (supabase_rls_security.sql)
```

---

## 🔗 라우팅 구조

| URL | 페이지 | 접근 |
|---|---|---|
| `/` | 랜딩 페이지 | 공개 |
| `/records` | HALL OF FAME 리더보드 | 공개 |
| `/shootout` | 로컬 연습 대시보드 | 공개 |
| `/shootout/shoot/:id` | 로컬 연습 슈팅 | 공개 |
| `/tournament/admin` | 관리자 로그인 | 공개 |
| `/tournament/dashboard` | 대회 관리 대시보드 | 로그인 필요 |
| `/tournament/manage/:id` | 대회 참가자 관리 | 로그인 필요 |
| `/tournament/shoot/:playerId` | 대회용 슈팅 기록 | 로그인 필요 |
| `/tournament/manage-3v3/:id` | 3:3 전광판 (준비중) | 로그인 필요 |

---

## 🎮 기능 목록

### 로컬 연습 모드 (`/shootout`)
- [x] 참가자 5명 기본 생성 (이름/순서 수정 가능)
- [x] 슈팅 랙 5개 + Deep3 랙 1개
- [x] 랙별 15초 타이머 (크고 독립적인 버튼)
- [x] 공별 성공/실패/취소 Air Command 팝업
- [x] 점수 실시간 계산 (최대 30점)
- [x] 전체 초기화
- [x] Zustand 로컬 영구 저장 (브라우저 persist)
- [x] 모바일 최적화 (공 3열 그리드, 세로 전용)

### 대회 관리 모드 (`/tournament`)
- [x] Supabase Auth 관리자 로그인/로그아웃
- [x] 대회 생성 (3점슛/3:3 종목 선택)
- [x] 대회별 참가자 추가/삭제/이름수정/순서변경
- [x] 클라우드 실시간 슈팅 기록 (공 터치마다 자동저장)
- [x] 기록 확정 후 참가자 완료 처리
- [x] 로그아웃 시 grit-lab.kr 리디렉션

### 공개 리더보드 (`/records`)
- [x] 대회 목록 드롭다운 (시즌별 조회)
- [x] 실시간 점수 반영 (Supabase Realtime)
- [x] 금/은/동 메달 상위 3인 표시
- [x] LIVE 배지 (진행중인 대회)
- [x] Navbar에 Records 메뉴 연결

### UI/UX
- [x] PlayZoneFAB: 실사 농구공 텍스처 배경
- [x] FAB 스크롤 시 반투명/블러 효과
- [x] FAB 호버 시 발광 + 스케일 효과
- [x] FAB: 랜딩 페이지에서만 표시

---

## 🚀 배포 & DNS 설정

### GitHub Actions (자동 배포)
- 파일: `.github/workflows/deploy.yml`
- 트리거: `main` 브랜치 push 시 자동
- Secrets 필요: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- 단, `supabase.js`에 하드코딩 폴백이 있어 Secret 없어도 동작함

### DNS 설정 (현재 상태)
| 타입 | 이름 | 값 |
|---|---|---|
| A | @ (루트) | 185.199.108~111.153 (4개) |
| CNAME | www | wonyoung-r.github.io |

### GitHub Pages 설정
- Custom domain: `grit-lab.kr` (CNAME 파일 기준)
- `www.grit-lab.kr` → 자동 리디렉션됨

---

## 📋 남은 작업 (Next Steps)

- [ ] 3:3 대회 전광판 개발 (`/tournament/manage-3v3/:id`)
- [ ] 대회 참가자 기록 전체 초기화 기능
- [ ] 대회 상태 종료(COMPLETED) 처리 기능
- [ ] 대회 삭제 기능
- [ ] 리더보드: 대회별 전체 기록 CSV 내보내기
- [ ] 관리자 대시보드: 대회 통계 시각화

---

## 🔑 커밋 히스토리 요약

| 커밋 | 내용 |
|---|---|
| `a9d096d` | feat: 대회 관리 시스템 구축 & UI 개선 (메가 커밋) |
| `7f04968` | fix: GitHub Actions Supabase 환경변수 주입 |
| `a7e6879` | fix: Supabase 클라이언트 하드코딩 폴백 |
| `863d947` | fix: CNAME 파일 추가 |
| `24c3242` | fix: 로그아웃 리디렉션 www 변경 |
| `5536be5` | fix: SPA 라우팅 404 해결 (404.html) |
| `683d66a` | fix: CNAME 루트 도메인으로 변경 |
| `579546f` | feat: 슈팅 모바일 최적화 & 참가자 5명 |
