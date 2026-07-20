-- ═══════════════════════════════════════════════════════════
-- 0001 BASELINE — GRIT LAB 스키마
-- 출처: pg_dump --schema-only (소스 mwitveudlafcrksokjtz, PG 17.6.1)
-- 추출: 2026-07-20 · 손으로 쓴 게 아니라 실제 DB 카탈로그에서 뽑음
-- ═══════════════════════════════════════════════════════════




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."game_3v3_brackets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "round" "text" NOT NULL,
    "match_order" integer NOT NULL,
    "team_a_name" "text" DEFAULT ''::"text" NOT NULL,
    "team_b_name" "text" DEFAULT ''::"text" NOT NULL,
    "team_a_score" integer DEFAULT 0,
    "team_b_score" integer DEFAULT 0,
    "winner" "text",
    "status" "text" DEFAULT 'PENDING'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."game_3v3_brackets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_3v3_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "team_a_name" "text" DEFAULT '팀 A'::"text" NOT NULL,
    "team_b_name" "text" DEFAULT '팀 B'::"text" NOT NULL,
    "team_a_score" integer DEFAULT 0 NOT NULL,
    "team_b_score" integer DEFAULT 0 NOT NULL,
    "period" integer DEFAULT 1 NOT NULL,
    "game_time" integer DEFAULT 600 NOT NULL,
    "status" "text" DEFAULT 'READY'::"text" NOT NULL,
    "team_a_players" "jsonb" DEFAULT '[]'::"jsonb",
    "team_b_players" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_3v3_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_3v3_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_3v3_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_racks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "player_id" "uuid",
    "racks_data" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."player_racks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tournament_id" "uuid",
    "name" "text" NOT NULL,
    "rank_order" integer NOT NULL,
    "total_score" integer DEFAULT 0,
    "is_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournaments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "type" "text" DEFAULT '3PT'::"text"
);


ALTER TABLE "public"."tournaments" OWNER TO "postgres";


ALTER TABLE ONLY "public"."game_3v3_brackets"
    ADD CONSTRAINT "game_3v3_brackets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_3v3_scores"
    ADD CONSTRAINT "game_3v3_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_3v3_sessions"
    ADD CONSTRAINT "game_3v3_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_racks"
    ADD CONSTRAINT "player_racks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_racks"
    ADD CONSTRAINT "player_racks_player_id_key" UNIQUE ("player_id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id");



CREATE OR REPLACE TRIGGER "trg_game_3v3_scores_updated" BEFORE UPDATE ON "public"."game_3v3_scores" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."game_3v3_scores"
    ADD CONSTRAINT "game_3v3_scores_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."game_3v3_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_racks"
    ADD CONSTRAINT "player_racks_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



CREATE POLICY "Allow authenticated delete" ON "public"."game_3v3_brackets" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated insert" ON "public"."game_3v3_brackets" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow authenticated update" ON "public"."game_3v3_brackets" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow public read" ON "public"."game_3v3_brackets" FOR SELECT USING (true);



CREATE POLICY "Enable delete for authenticated users only" ON "public"."player_racks" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Enable delete for authenticated users only" ON "public"."players" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Enable delete for authenticated users only" ON "public"."tournaments" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."player_racks" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."players" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."tournaments" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."player_racks" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."players" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."tournaments" FOR SELECT USING (true);



CREATE POLICY "Enable update for authenticated users only" ON "public"."player_racks" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Enable update for authenticated users only" ON "public"."players" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Enable update for authenticated users only" ON "public"."tournaments" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."game_3v3_brackets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_3v3_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_3v3_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_racks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scores_auth_write" ON "public"."game_3v3_scores" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "scores_public_read" ON "public"."game_3v3_scores" FOR SELECT USING (true);



CREATE POLICY "sessions_auth_write" ON "public"."game_3v3_sessions" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "sessions_public_read" ON "public"."game_3v3_sessions" FOR SELECT USING (true);



ALTER TABLE "public"."tournaments" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."game_3v3_scores";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."game_3v3_sessions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."player_racks";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."players";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tournaments";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."game_3v3_brackets" TO "anon";
GRANT ALL ON TABLE "public"."game_3v3_brackets" TO "authenticated";
GRANT ALL ON TABLE "public"."game_3v3_brackets" TO "service_role";



GRANT ALL ON TABLE "public"."game_3v3_scores" TO "anon";
GRANT ALL ON TABLE "public"."game_3v3_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."game_3v3_scores" TO "service_role";



GRANT ALL ON TABLE "public"."game_3v3_sessions" TO "anon";
GRANT ALL ON TABLE "public"."game_3v3_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."game_3v3_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."player_racks" TO "anon";
GRANT ALL ON TABLE "public"."player_racks" TO "authenticated";
GRANT ALL ON TABLE "public"."player_racks" TO "service_role";



GRANT ALL ON TABLE "public"."players" TO "anon";
GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";



GRANT ALL ON TABLE "public"."tournaments" TO "anon";
GRANT ALL ON TABLE "public"."tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."tournaments" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































