-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  pingram_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- GAMES
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
  player1_id UUID REFERENCES public.profiles(id),
  player2_id UUID REFERENCES public.profiles(id),
  current_turn_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Games are viewable by participants" ON public.games FOR SELECT USING (true);
CREATE POLICY "Anyone can create a game" ON public.games FOR INSERT WITH CHECK (auth.uid() = player1_id);
-- Update if player2 joins, or status changes
CREATE POLICY "Participants can update game" ON public.games FOR UPDATE USING (auth.uid() IN (player1_id, player2_id));

-- GAME PLAYERS (Positions)
CREATE TABLE IF NOT EXISTS public.game_players (
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (game_id, player_id)
);
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Game players visible to all" ON public.game_players FOR SELECT USING (true);
CREATE POLICY "Players can insert selves" ON public.game_players FOR INSERT WITH CHECK (auth.uid() = player_id);
CREATE POLICY "Players can update own position" ON public.game_players FOR UPDATE USING (auth.uid() = player_id);

-- MOVES
CREATE TABLE IF NOT EXISTS public.moves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.profiles(id),
  roll_value INTEGER NOT NULL,
  path JSONB NOT NULL,
  final_position INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Moves visible to all" ON public.moves FOR SELECT USING (true);
CREATE POLICY "Players can insert moves" ON public.moves FOR INSERT WITH CHECK (auth.uid() = player_id);

-- BOARD CONFIG
CREATE TABLE IF NOT EXISTS public.board_config (
  square_index INTEGER PRIMARY KEY,
  type TEXT CHECK (type IN ('ladder', 'snake', 'modifier', 'none')),
  target_index INTEGER,
  modifier_value INTEGER
);

-- Seed Board
INSERT INTO public.board_config (square_index, type, target_index, modifier_value) VALUES 
(3, 'ladder', 12, null),
(10, 'ladder', 21, null),
(16, 'ladder', 25, null),
(14, 'snake', 6, null),
(24, 'snake', 11, null),
(28, 'snake', 4, null),
(8, 'modifier', null, 2),
(18, 'modifier', null, -3)
ON CONFLICT (square_index) DO NOTHING;

-- RPC ROLL DICE
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
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock row for concurrency
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

  SELECT position INTO v_current_pos FROM public.game_players WHERE game_id = target_game_id AND player_id = v_uid;
  IF v_current_pos IS NULL THEN
    RAISE EXCEPTION 'Player not in game';
  END IF;

  v_roll := floor(random() * 6) + 1;
  v_eval_pos := v_current_pos + v_roll;
  
  -- Prevent exceeding the final square (overshoot = stay in place)
  IF v_eval_pos > 29 THEN
    v_eval_pos := v_current_pos;
  END IF;

  v_path := jsonb_build_array(
    jsonb_build_object('type', 'roll', 'from', v_current_pos, 'to', v_eval_pos, 'value', v_roll)
  );

  -- Recursively resolve board mechanics
  LOOP
    SELECT * INTO v_config FROM public.board_config WHERE square_index = v_eval_pos;
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

  IF v_final_pos = 29 THEN
    UPDATE public.games SET status = 'finished' WHERE id = target_game_id;
  ELSE
    v_next_turn := CASE WHEN v_uid = v_game.player1_id THEN v_game.player2_id ELSE v_game.player1_id END;
    UPDATE public.games SET current_turn_id = v_next_turn WHERE id = target_game_id;
  END IF;

  RETURN jsonb_build_object('roll', v_roll, 'path', v_path, 'final_position', v_final_pos);
END;
$$;
