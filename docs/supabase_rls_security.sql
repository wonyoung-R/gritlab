-- =========================================================
-- Supabase Row Level Security (RLS) 방화벽 설정 스크립트
-- =========================================================

-- 1. 모든 테이블에 RLS 자물쇠 활성화
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_racks ENABLE ROW LEVEL SECURITY;

-- =========================================
-- 2. "읽기(조회)" 권한: 누구나 볼 수 있음 (명예의 전당)
-- =========================================
CREATE POLICY "Enable read access for all users" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.players FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.player_racks FOR SELECT USING (true);

-- =========================================
-- 3. "쓰기/수정/삭제" 권한: 로그인한 관리자(authenticated)만 가능!!!
-- =========================================

-- Tournaments 제어
CREATE POLICY "Enable insert for authenticated users only" ON public.tournaments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users only" ON public.tournaments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users only" ON public.tournaments FOR DELETE TO authenticated USING (true);

-- Players 제어
CREATE POLICY "Enable insert for authenticated users only" ON public.players FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users only" ON public.players FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users only" ON public.players FOR DELETE TO authenticated USING (true);

-- Player Racks (기록) 제어
CREATE POLICY "Enable insert for authenticated users only" ON public.player_racks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users only" ON public.player_racks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users only" ON public.player_racks FOR DELETE TO authenticated USING (true);
