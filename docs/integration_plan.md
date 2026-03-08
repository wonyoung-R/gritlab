# 통합 개발 기획서: GRIT LAB Play Zone (Shootout + Supabase)

## 1. 개요 (Overview)
본 기획서는 현재 Vite 기반의 단일 페이지(`grit-lab.kr`) 홈페이지에, 방금 개발을 완료한 Next.js 환경의 **3점슛 기록용 멀티 라운드 애플리케이션(`3pt-shootout`)**과 향후 연동될 **Supabase 백엔드 시스템**을 가장 효율적이고 매끄럽게 흡수(Integration) 통합하기 위한 마이그레이션 전략입니다.

---

## 2. 아키텍처 통합 전략 (Architecture Integration)

기존 홈페이지(`gritlab` 폴더)의 `Vite + React` 프레임워크 베이스를 유지하면서, 그 내부 라우트로 3점슛 앱을 이식(Porting)합니다. 이를 통해 사용자들은 홈페이지에서 "Play Zone" 메뉴를 클릭해 바로 끊김 없이 게임 화면으로 들어갈 수 있습니다.

### 2.1 라우팅(Routing) 설계
현재 `App.jsx`가 모든 섹션을 렌더링하는 Single Page 구조이므로 `react-router-dom` 패키지를 설치하여 MPA(Multi Page Application) 느낌의 SPA(Single Page App) 구조로 전환합니다.
- `/` : 기존 홈페이지 뷰 (렌탈, 소개 등)
- `/playzone` : 단발성 놀거리(3점슛, 추후 3:3 픽업 기록기) 진입 및 월별 명예의 전당 랭킹 화면
- `/playzone/shootout` : 3점슛 멀티라운드 기록기 메인 대시보드
- `/playzone/shootout/:id` : 개별 참가자 타이머/에어커맨드 터치 조작 페이지

### 2.2 코드 및 디자인 에셋 마이그레이션 (`/03.Full-stack-Dev` 단계)
1. **패키지 복사**: `zustand`(데이터 스토어), `lucide-react`(아이콘), `react-router-dom`(라우터) 및 추후 사용할 `@supabase/supabase-js`(DB) 모듈 추가.
2. **UI 이식**: `3pt-shootout`에서 만든 `globals.css`의 멋진 코트 배경 및 투명 네이비 버튼 디자인 코드를 `gritlab/src/` 안으로 병합.
3. **에셋 이식**: 고해상도 코트 실사 배경, NBA 가죽 텍스처 농구공(기본, 머니, 딥쓰리) PNG 파일들을 `public/` 폴더로 이동.
4. **글로벌 헤더(Navbar) 갱신**: 기존 홈페이지의 네비게이션(Navbar) 바 우측 끝에 [PLAY ZONE] 또는 [스코어보드] 버튼을 신설하여 진입점 구축.

---

## 3. 백엔드 시스템 진화 (Supabase + Realtime)

이식된 로컬 스토리지 기반의 프론트 앱에 Supabase DB를 붙여 실시간 기록 플랫폼으로 탈바꿈시킵니다.

### 3.1 DB 스키마(Table) 설계
Supabase 무료 플랜에 아래의 구조명세(Table Schema)를 추가합니다. (관계형 DB - PostgreSQL 설계)
1. `tournaments` 테이블: 매 대회(예: "3월 주말 3점슛 챌린지") 레코드.
2. `rounds` 테이블: "예선", "결승" 등 토너먼트 진행 단계를 관리.
3. `players` 테이블: 참석한 선수의 이름 및 고유 ID.
4. `scores` 테이블 (핵심): `player_id`, 라운드, 공포인트, 성공여부 배열 `[O, X, M, D3]`을 저장하여 점수 산출.

### 3.2 핵심 워크플로우 (Realtime Sync & Multi-round)
- **라운드 진출 기능:** 프론트엔드에서 현재 라운드 완료자를 [점수순 정렬]한 뒤 버튼을 누르면, 상위 N명을 선발해 점수를 모두 0으로 초기화한 **신규 `round` 데이터**를 Supabase에 `INSERT`하여 새 판을 짭니다. (룰 A - 포인트 리셋 적용).
- **실시간 관전 (Realtime Live View):** 대회를 중계하는 모니터(TV)는 Supabase의 `scores` 테이블을 채널 구독(`.channel('any').on('postgres_changes')`)하도록 만듭니다. 
- **결과:** 진행자(태블릿)가 오른손의 펜으로 농구공을 누를 때마다, 1초 안에 코트 벽면에 걸려있는 거대한 관람용 TV(Public Dashboard) 화면상의 농구공 그래픽 위로 실시간 'O/X' 도장이 찍히는 진풍경이 연출됩니다.

---

## 4. 진행 순서 (Action Flow)
1. **[Local 통합]** 기존 `gritlab` 레포지토리에 `react-router-dom` 세팅 밑 바탕 공사.
2. **[UI/Assets 이동]** 3점 앱 소스를 `gritlab/src/pages/shootout/` 로 폴더화시켜 이식. (개발 서버를 열어서 UI 정상 출력 검증)
3. **[Navbar 연결]** 홈페이지에 [Play Zone] 메뉴 타이틀 추가.
4. **[Supabase 세팅]** `.env` 파일과 `supabase-js` 연동, 클라우드 DB에 테이블 및 스토어 랩핑 작업.
5. **[GitHub 배포]** 마이그레이션된 전체 홈페이지 코드 `git commit & push` 후 버셀(Vercel) 또는 깃허브 페이지를 통해 최종 프로덕션 릴리즈.
