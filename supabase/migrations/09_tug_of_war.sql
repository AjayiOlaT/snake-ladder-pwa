-- 09_tug_of_war.sql

-- 1. Create Questions Table
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject TEXT NOT NULL,
    field TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    question_text TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of strings
    correct_answer TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Questions are readable by everyone" ON public.questions FOR SELECT USING (true);

-- 2. Create Tug-of-War Matches Table
CREATE TABLE IF NOT EXISTS public.tug_of_war_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
    p1_id UUID REFERENCES public.profiles(id),
    p2_id UUID REFERENCES public.profiles(id),
    rope_pos FLOAT DEFAULT 0, -- -100 to 100
    p1_config JSONB, -- {subject, difficulty, multiplier}
    p2_config JSONB,
    join_code TEXT UNIQUE,
    winner_id UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tug_of_war_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Matches visible to everyone" ON public.tug_of_war_matches FOR SELECT USING (true);
CREATE POLICY "Anyone can host tow" ON public.tug_of_war_matches FOR INSERT WITH CHECK (auth.uid() = p1_id);
CREATE POLICY "Participants can update tow" ON public.tug_of_war_matches FOR UPDATE USING (auth.uid() IN (p1_id, p2_id));

-- 3. Join Code Trigger (assuming generate_join_code exists)
CREATE TRIGGER tow_ensure_join_code
  BEFORE INSERT ON public.tug_of_war_matches
  FOR EACH ROW
  EXECUTE FUNCTION generate_join_code();

-- 4. RPC: Join Match
CREATE OR REPLACE FUNCTION public.tow_join_match(p_join_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_id UUID;
  v_uid UUID;
  v_p1_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id, p1_id INTO v_match_id, v_p1_id FROM public.tug_of_war_matches 
  WHERE join_code = p_join_code AND status = 'waiting' AND p2_id IS NULL;

  IF v_match_id IS NULL THEN RETURN NULL; END IF;
  IF v_p1_id = v_uid THEN RAISE EXCEPTION 'You cannot join your own game'; END IF;

  UPDATE public.tug_of_war_matches 
  SET p2_id = v_uid, status = 'active', updated_at = NOW()
  WHERE id = v_match_id;

  RETURN v_match_id;
END;
$$;

-- 5. RPC: Tug Rope
CREATE OR REPLACE FUNCTION public.tow_tug_rope(p_match_id UUID, p_impact FLOAT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_uid UUID;
  v_new_pos FLOAT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_match FROM public.tug_of_war_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF v_match.status != 'active' THEN RAISE EXCEPTION 'Match is not active'; END IF;

  IF v_match.p1_id = v_uid THEN
    v_new_pos := v_match.rope_pos - p_impact;
  ELSIF v_match.p2_id = v_uid THEN
    v_new_pos := v_match.rope_pos + p_impact;
  ELSE
    RAISE EXCEPTION 'Not a participant';
  END IF;

  -- Bound check and Win check
  IF v_new_pos <= -100 THEN
    UPDATE public.tug_of_war_matches 
    SET rope_pos = -100, status = 'finished', winner_id = v_match.p1_id, updated_at = NOW()
    WHERE id = p_match_id;
  ELSIF v_new_pos >= 100 THEN
    UPDATE public.tug_of_war_matches 
    SET rope_pos = 100, status = 'finished', winner_id = v_match.p2_id, updated_at = NOW()
    WHERE id = p_match_id;
  ELSE
    UPDATE public.tug_of_war_matches 
    SET rope_pos = v_new_pos, updated_at = NOW()
    WHERE id = p_match_id;
  END IF;
END;
$$;

-- 6. Update Game Invites constraint
ALTER TABLE public.game_invites DROP CONSTRAINT IF EXISTS game_invites_game_type_check;
ALTER TABLE public.game_invites ADD CONSTRAINT game_invites_game_type_check CHECK (game_type IN ('number-duel', 'snake-ladder', 'tug-of-war'));

-- 7. Seed initial Math questions
INSERT INTO public.questions (subject, field, difficulty, question_text, options, correct_answer) VALUES
('Math', 'Arithmetic', 'easy', 'What is 5 + 7?', '["10", "11", "12", "13"]', '12'),
('Math', 'Arithmetic', 'easy', 'What is 15 - 8?', '["5", "6", "7", "8"]', '7'),
('Math', 'Arithmetic', 'easy', 'What is 3 x 4?', '["10", "11", "12", "14"]', '12'),
('Math', 'Arithmetic', 'medium', 'What is 12 x 12?', '["124", "144", "164", "184"]', '144'),
('Math', 'Arithmetic', 'medium', 'What is 225 / 15?', '["13", "14", "15", "16"]', '15'),
('Math', 'Algebra', 'hard', 'Solve for x: 2x + 5 = 15', '["2", "5", "10", "15"]', '5'),
('Math', 'Algebra', 'hard', 'What is the square root of 256?', '["14", "16", "18", "20"]', '16');
