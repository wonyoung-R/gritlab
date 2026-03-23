-- ══════════════════════════════════════════════
--  GRIT LAB — 3v3 전광판 테이블 (최적화)
--  3:3 경기 종료 후 최소한의 결과(팀명, 점수, 승패)만 기록
-- ══════════════════════════════════════════════

-- 1. 3v3 게임 세션 테이블
CREATE TABLE IF NOT EXISTS public.game_3v3_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 3v3 경기 결과 테이블 (초당 업데이트되는 전광판 데이터는 로컬/메모리 처리)
CREATE TABLE IF NOT EXISTS public.game_3v3_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES public.game_3v3_sessions(id) ON DELETE CASCADE,

    team_a_name     TEXT NOT NULL,
    team_b_name     TEXT NOT NULL,
    team_a_score    INT  NOT NULL DEFAULT 0,
    team_b_score    INT  NOT NULL DEFAULT 0,
    
    -- 결과 (A_WIN, B_WIN, DRAW 등)
    winner          TEXT, 
    
    period          INT  NOT NULL DEFAULT 1,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_game_3v3_results_updated ON public.game_3v3_results;
CREATE TRIGGER trg_game_3v3_results_updated
    BEFORE UPDATE ON public.game_3v3_results
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4. RLS 설정
ALTER TABLE public.game_3v3_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_3v3_results  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_public_read" ON public.game_3v3_sessions FOR SELECT USING (true);
CREATE POLICY "sessions_auth_write" ON public.game_3v3_sessions FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "results_public_read" ON public.game_3v3_results FOR SELECT USING (true);
CREATE POLICY "results_auth_write" ON public.game_3v3_results FOR ALL USING (auth.role() = 'authenticated');
