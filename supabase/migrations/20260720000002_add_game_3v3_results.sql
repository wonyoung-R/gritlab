-- ═══════════════════════════════════════════════════════════
-- 0002 — 누락된 game_3v3_results 테이블 생성
--
-- 배경: Scoreboard.jsx가 game_3v3_results에 경기 결과를 insert/select 하는데
--       (src/pages/threevthree/Scoreboard.jsx:276, :440) 소스 DB에는 이 테이블이
--       존재하지 않았다. PostgREST가 PGRST205로 응답 → 경기 결과 저장이
--       계속 실패해 온 상태.
--
--       docs/supabase_3v3_tables.sql에 생성문이 있었으나 실행된 적이 없다.
--       DB에는 대신 game_3v3_scores(0행, 코드 참조 없음, winner 컬럼 없음)가
--       남아 있는데, 이는 대체된 이전 설계로 보인다.
--
-- 컬럼 구성은 앱의 insert 페이로드와 1:1로 맞춘다:
--   session_id / team_a_name / team_b_name / team_a_score / team_b_score
--   / winner / period
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "public"."game_3v3_results" (
    "id"              uuid PRIMARY KEY DEFAULT "gen_random_uuid"(),
    "session_id"      uuid NOT NULL REFERENCES "public"."game_3v3_sessions"("id") ON DELETE CASCADE,

    "team_a_name"     text NOT NULL,
    "team_b_name"     text NOT NULL,
    "team_a_score"    integer NOT NULL DEFAULT 0,
    "team_b_score"    integer NOT NULL DEFAULT 0,

    -- 결과: 'A_WIN' | 'B_WIN' | NULL(무승부는 앱에서 winner 미지정)
    "winner"          text,

    "period"          integer NOT NULL DEFAULT 1,

    "created_at"      timestamp with time zone NOT NULL DEFAULT "now"(),
    "updated_at"      timestamp with time zone NOT NULL DEFAULT "now"()
);

ALTER TABLE "public"."game_3v3_results" OWNER TO "postgres";

-- fetchResults()가 session_id로 필터 + created_at 정렬한다 (Scoreboard.jsx:276-280)
CREATE INDEX IF NOT EXISTS "idx_game_3v3_results_session_created"
    ON "public"."game_3v3_results" ("session_id", "created_at" DESC);

-- updated_at 자동 갱신 (handle_updated_at()는 0001 baseline에서 이미 생성됨)
CREATE OR REPLACE TRIGGER "trg_game_3v3_results_updated"
    BEFORE UPDATE ON "public"."game_3v3_results"
    FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

-- ── RLS: 형제 테이블(game_3v3_sessions / game_3v3_brackets)과 동일 정책 ──
-- 공개 읽기(전광판·결과 대시보드는 비로그인도 봐야 함) + 로그인 사용자만 쓰기.
ALTER TABLE "public"."game_3v3_results" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "results_public_read"
    ON "public"."game_3v3_results"
    FOR SELECT USING (true);

CREATE POLICY "results_auth_write"
    ON "public"."game_3v3_results"
    USING (("auth"."role"() = 'authenticated'::"text"));

-- PostgREST 노출을 위한 권한 (baseline의 다른 테이블과 동일)
GRANT ALL ON TABLE "public"."game_3v3_results" TO "anon";
GRANT ALL ON TABLE "public"."game_3v3_results" TO "authenticated";
GRANT ALL ON TABLE "public"."game_3v3_results" TO "service_role";
