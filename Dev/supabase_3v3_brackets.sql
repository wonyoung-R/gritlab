-- 3v3 토너먼트 대진표 테이블
-- Supabase SQL Editor에서 실행
CREATE TABLE IF NOT EXISTS game_3v3_brackets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL,
  round TEXT NOT NULL,            -- 'GROUP_A', 'GROUP_B', 'QUARTER', 'SEMI', 'FINAL', '3RD_PLACE'
  match_order INT NOT NULL,       -- 라운드 내 경기 순서
  team_a_name TEXT NOT NULL DEFAULT '',
  team_b_name TEXT NOT NULL DEFAULT '',
  team_a_score INT DEFAULT 0,
  team_b_score INT DEFAULT 0,
  winner TEXT,                    -- 'A_WIN', 'B_WIN', NULL(미완)
  status TEXT DEFAULT 'PENDING',  -- 'PENDING', 'LIVE', 'ENDED'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 정책 (anon 포함 전체 허용 — 로그인 없이 운영하는 구조)
ALTER TABLE game_3v3_brackets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read" ON game_3v3_brackets
  FOR SELECT USING (true);

CREATE POLICY "Allow all insert" ON game_3v3_brackets
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all update" ON game_3v3_brackets
  FOR UPDATE USING (true);

CREATE POLICY "Allow all delete" ON game_3v3_brackets
  FOR DELETE USING (true);

-- tournaments 테이블에 type 컬럼 추가 (이미 있으면 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'type'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN type TEXT DEFAULT 'SHOOTOUT';
  END IF;
END $$;
