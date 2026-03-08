CREATE TABLE public.tournaments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT DEFAULT '3PT', -- '3PT', '3V3'
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'COMPLETED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 참가자 테이블 (대회별 종속)
CREATE TABLE public.players (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rank_order INTEGER NOT NULL,
    total_score INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. 스코어(기록) 상태 테이블 (선택사항, Racks JSON 통째로 저장)
-- 복잡한 관계형 DB 대신, 화면의 상태(localRacks)를 그대로 JSONB로 넣어서 Supabase Realtime으로 쏘기 매우 쉽도록 구성.
CREATE TABLE public.player_racks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    player_id UUID REFERENCES public.players(id) ON DELETE CASCADE UNIQUE,
    racks_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- (필수) Realtime Broadcast 설정 켜기
-- ==========================================
alter publication supabase_realtime add table public.tournaments;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.player_racks;
