-- Phase 1a: Rename existing Snake Ladder tables for isolation
ALTER TABLE public.games RENAME TO snake_ladder_matches;
ALTER TABLE public.game_players RENAME TO snake_ladder_players;
ALTER TABLE public.moves RENAME TO snake_ladder_moves;
ALTER TABLE public.board_config RENAME TO snake_ladder_board_config;

-- Update Join Code trigger name
ALTER TRIGGER ensure_join_code ON public.snake_ladder_matches RENAME TO sl_ensure_join_code;

-- Phase 1b: Create Number Duel tables
CREATE TABLE IF NOT EXISTS public.number_duel_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
    player1_id UUID REFERENCES public.profiles(id),
    player2_id UUID REFERENCES public.profiles(id),
    current_turn_id UUID REFERENCES public.profiles(id),
    target_number INTEGER,
    difficulty TEXT DEFAULT 'classic',
    join_code TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.number_duel_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Matches visible to participants" ON public.number_duel_matches FOR SELECT USING (true);
CREATE POLICY "Anyone can host number duel" ON public.number_duel_matches FOR INSERT WITH CHECK (auth.uid() = player1_id);
CREATE POLICY "Participants can update number duel" ON public.number_duel_matches FOR UPDATE USING (auth.uid() IN (player1_id, player2_id));

CREATE TABLE IF NOT EXISTS public.number_duel_guesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID REFERENCES public.number_duel_matches(id) ON DELETE CASCADE,
    player_id UUID REFERENCES public.profiles(id),
    guess INTEGER NOT NULL,
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.number_duel_guesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Guesses visible to participants" ON public.number_duel_guesses FOR SELECT USING (true);
CREATE POLICY "Players can insert guesses" ON public.number_duel_guesses FOR INSERT WITH CHECK (auth.uid() = player_id);

-- Create Join Code trigger for Number Duel
CREATE TRIGGER nd_ensure_join_code
  BEFORE INSERT ON public.number_duel_matches
  FOR EACH ROW
  EXECUTE FUNCTION generate_join_code();

-- RPC: sl_join_game
CREATE OR REPLACE FUNCTION public.sl_join_game(p_join_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_id UUID;
  v_uid UUID;
  v_player1_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id, player1_id INTO v_match_id, v_player1_id FROM public.snake_ladder_matches 
  WHERE join_code = p_join_code AND status = 'waiting' AND player2_id IS NULL;

  IF v_match_id IS NULL THEN RETURN NULL; END IF;
  IF v_player1_id = v_uid THEN RAISE EXCEPTION 'You cannot join your own game'; END IF;

  UPDATE public.snake_ladder_matches 
  SET player2_id = v_uid, status = 'active', current_turn_id = player1_id, updated_at = NOW()
  WHERE id = v_match_id;

  -- Ensure players exist in the position table
  INSERT INTO public.snake_ladder_players (game_id, player_id, position)
  VALUES (v_match_id, v_player1_id, 0), (v_match_id, v_uid, 0)
  ON CONFLICT DO NOTHING;

  RETURN v_match_id;
END;
$$;

-- RPC: nd_join_game
CREATE OR REPLACE FUNCTION public.nd_join_game(p_join_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_id UUID;
  v_uid UUID;
  v_player1_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id, player1_id INTO v_match_id, v_player1_id FROM public.number_duel_matches 
  WHERE join_code = p_join_code AND status = 'waiting' AND player2_id IS NULL;

  IF v_match_id IS NULL THEN RETURN NULL; END IF;
  IF v_player1_id = v_uid THEN RAISE EXCEPTION 'You cannot join your own game'; END IF;

  UPDATE public.number_duel_matches 
  SET player2_id = v_uid, status = 'active', current_turn_id = player1_id, updated_at = NOW()
  WHERE id = v_match_id;

  RETURN v_match_id;
END;
$$;

-- Rename roll_dice to sl_roll_dice and update references
CREATE OR REPLACE FUNCTION public.sl_roll_dice(target_game_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID;
  v_game RECORD;
  v_current_pos INTEGER;
  v_roll INTEGER;
  v_eval_pos INTEGER;
  v_path JSONB;
  v_config RECORD;
  v_final_pos INTEGER;
  v_next_turn UUID;
  v_max_pos INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.snake_ladder_matches WHERE id = target_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.status != 'active' THEN RAISE EXCEPTION 'Game is not active'; END IF;
  IF v_game.current_turn_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  
  v_max_pos := CASE 
      WHEN v_game.difficulty = 'easy' THEN 29
      WHEN v_game.difficulty = 'medium' THEN 49
      WHEN v_game.difficulty = 'hard' THEN 99
      ELSE 29
  END;

  SELECT position INTO v_current_pos FROM public.snake_ladder_players WHERE game_id = target_game_id AND player_id = v_uid;
  IF v_current_pos IS NULL THEN RAISE EXCEPTION 'Player not in game'; END IF;

  v_roll := floor(random() * 6) + 1;
  v_eval_pos := v_current_pos + v_roll;
  
  IF v_eval_pos > v_max_pos THEN v_eval_pos := v_current_pos; END IF;

  v_path := jsonb_build_array(jsonb_build_object('type', 'roll', 'from', v_current_pos, 'to', v_eval_pos, 'value', v_roll));

  LOOP
    SELECT * INTO v_config FROM public.snake_ladder_board_config WHERE square_index = v_eval_pos AND difficulty = v_game.difficulty;
    IF FOUND THEN
      IF v_config.type = 'ladder' OR v_config.type = 'snake' THEN
        v_path := v_path || jsonb_build_object('type', v_config.type, 'from', v_eval_pos, 'to', v_config.target_index);
        v_eval_pos := v_config.target_index;
      ELSIF v_config.type = 'modifier' THEN
        v_path := v_path || jsonb_build_object('type', 'modifier', 'from', v_eval_pos, 'to', v_eval_pos + v_config.modifier_value, 'value', v_config.modifier_value);
        v_eval_pos := v_eval_pos + v_config.modifier_value;
      ELSE EXIT; END IF;
    ELSE EXIT; END IF;
  END LOOP;
  v_final_pos := v_eval_pos;

  INSERT INTO public.snake_ladder_moves (game_id, player_id, roll_value, path, final_position)
  VALUES (target_game_id, v_uid, v_roll, v_path, v_final_pos);

  UPDATE public.snake_ladder_players SET position = v_final_pos WHERE game_id = target_game_id AND player_id = v_uid;

  IF v_final_pos = v_max_pos THEN
    UPDATE public.snake_ladder_matches SET status = 'finished', updated_at = NOW() WHERE id = target_game_id;
  ELSE
    v_next_turn := CASE WHEN v_uid = v_game.player1_id THEN v_game.player2_id ELSE v_game.player1_id END;
    UPDATE public.snake_ladder_matches SET current_turn_id = v_next_turn, updated_at = NOW() WHERE id = target_game_id;
  END IF;

  RETURN jsonb_build_object('roll', v_roll, 'path', v_path, 'final_position', v_final_pos);
END;
$$;
