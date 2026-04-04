-- 1. Games Table Updates
ALTER TABLE public.games 
  ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'easy',
  ADD COLUMN IF NOT EXISTS join_code TEXT UNIQUE;

-- Create function to automatically set 6-digit join codes on game insert
CREATE OR REPLACE FUNCTION generate_join_code() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.join_code IS NULL THEN
    NEW.join_code := upper(substring(md5(random()::text) from 1 for 6));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_join_code ON public.games;
CREATE TRIGGER ensure_join_code
  BEFORE INSERT ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION generate_join_code();

-- 2. Board Config Upgrades
ALTER TABLE public.board_config DROP CONSTRAINT IF EXISTS board_config_pkey;
ALTER TABLE public.board_config ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'easy';
ALTER TABLE public.board_config ADD PRIMARY KEY (difficulty, square_index);

-- Easy is already in there from 01 migration. Let's explicitely ensure it's categorized as 'easy'.
UPDATE public.board_config SET difficulty = 'easy' WHERE difficulty IS NULL;

-- Insert Medium (50) Configs (0-49)
INSERT INTO public.board_config (square_index, type, target_index, modifier_value, difficulty) VALUES
(16, 'snake', 5, null, 'medium'),
(29, 'snake', 11, null, 'medium'),
(45, 'snake', 24, null, 'medium'),
(48, 'snake', 32, null, 'medium'),
(8, 'ladder', 17, null, 'medium'),
(21, 'ladder', 42, null, 'medium'),
(33, 'ladder', 44, null, 'medium'),
(14, 'modifier', null, 3, 'medium'),
(38, 'modifier', null, -5, 'medium')
ON CONFLICT (difficulty, square_index) DO NOTHING;

-- Insert Hard (100) Configs (0-99)
INSERT INTO public.board_config (square_index, type, target_index, modifier_value, difficulty) VALUES
(15, 'snake', 6, null, 'hard'),
(46, 'snake', 25, null, 'hard'),
(49, 'snake', 11, null, 'hard'),
(56, 'snake', 53, null, 'hard'),
(62, 'snake', 19, null, 'hard'),
(87, 'snake', 24, null, 'hard'),
(93, 'snake', 73, null, 'hard'),
(98, 'snake', 78, null, 'hard'),
(1, 'ladder', 38, null, 'hard'),
(4, 'ladder', 14, null, 'hard'),
(9, 'ladder', 31, null, 'hard'),
(21, 'ladder', 42, null, 'hard'),
(28, 'ladder', 84, null, 'hard'),
(36, 'ladder', 44, null, 'hard'),
(51, 'ladder', 67, null, 'hard'),
(71, 'ladder', 91, null, 'hard'),
(80, 'ladder', 99, null, 'hard'),
(33, 'modifier', null, 4, 'hard'),
(75, 'modifier', null, -6, 'hard')
ON CONFLICT (difficulty, square_index) DO NOTHING;

-- 3. Upgrade RPC Engine to respect Max Positions dynamically
CREATE OR REPLACE FUNCTION public.roll_dice(target_game_id UUID)
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = target_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF v_game.status != 'active' THEN
    RAISE EXCEPTION 'Game is not active';
  END IF;

  IF v_game.current_turn_id != v_uid THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;
  
  -- Evaluate Dynamic Grid Ceiling
  v_max_pos := CASE 
      WHEN v_game.difficulty = 'easy' THEN 29
      WHEN v_game.difficulty = 'medium' THEN 49
      WHEN v_game.difficulty = 'hard' THEN 99
      ELSE 29
  END;

  SELECT position INTO v_current_pos FROM public.game_players WHERE game_id = target_game_id AND player_id = v_uid;
  IF v_current_pos IS NULL THEN
    RAISE EXCEPTION 'Player not in game';
  END IF;

  v_roll := floor(random() * 6) + 1;
  v_eval_pos := v_current_pos + v_roll;
  
  -- Exact Roll To Win Constraint dynamically checked against difficulty tier
  IF v_eval_pos > v_max_pos THEN
    v_eval_pos := v_current_pos;
  END IF;

  v_path := jsonb_build_array(
    jsonb_build_object('type', 'roll', 'from', v_current_pos, 'to', v_eval_pos, 'value', v_roll)
  );

  LOOP
    SELECT * INTO v_config FROM public.board_config WHERE square_index = v_eval_pos AND difficulty = v_game.difficulty;
    IF FOUND THEN
      IF v_config.type = 'ladder' OR v_config.type = 'snake' THEN
        v_path := v_path || jsonb_build_object('type', v_config.type, 'from', v_eval_pos, 'to', v_config.target_index);
        v_eval_pos := v_config.target_index;
      ELSIF v_config.type = 'modifier' THEN
        v_path := v_path || jsonb_build_object('type', 'modifier', 'from', v_eval_pos, 'to', v_eval_pos + v_config.modifier_value, 'value', v_config.modifier_value);
        v_eval_pos := v_eval_pos + v_config.modifier_value;
      ELSE
         EXIT;
      END IF;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  v_final_pos := v_eval_pos;

  INSERT INTO public.moves (game_id, player_id, roll_value, path, final_position)
  VALUES (target_game_id, v_uid, v_roll, v_path, v_final_pos);

  UPDATE public.game_players SET position = v_final_pos WHERE game_id = target_game_id AND player_id = v_uid;

  -- End Game automatically if champion reaches apex
  IF v_final_pos = v_max_pos THEN
    UPDATE public.games SET status = 'finished', updated_at = NOW() WHERE id = target_game_id;
  ELSE
    v_next_turn := CASE WHEN v_uid = v_game.player1_id THEN v_game.player2_id ELSE v_game.player1_id END;
    UPDATE public.games SET current_turn_id = v_next_turn, updated_at = NOW() WHERE id = target_game_id;
  END IF;

  RETURN jsonb_build_object('roll', v_roll, 'path', v_path, 'final_position', v_final_pos);
END;
$$;
