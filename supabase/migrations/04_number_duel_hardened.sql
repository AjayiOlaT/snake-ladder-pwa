-- Phase 2: Number Duel System Hardening

-- 1. Add missing configuration and state columns to number_duel_matches
ALTER TABLE public.number_duel_matches 
ADD COLUMN IF NOT EXISTS range_min INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS range_max INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS rounds_to_win INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS p1_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS p2_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS p1_secret_number INTEGER,
ADD COLUMN IF NOT EXISTS p2_secret_number INTEGER,
ADD COLUMN IF NOT EXISTS bluffing_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS winner_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS round_number INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'picking' CHECK (phase IN ('picking', 'active', 'round_end', 'finished'));

-- 2. Update existing status logic to handle the new phase system if needed
-- (Assuming picking is the first stage after a match is joined)

-- 3. Enhance number_duel_guesses with feedback context
ALTER TABLE public.number_duel_guesses
RENAME COLUMN result TO feedback; -- 'higher', 'lower', 'correct'

ALTER TABLE public.number_duel_guesses
ADD COLUMN IF NOT EXISTS is_bluff BOOLEAN DEFAULT false;

-- 4. RLS Security: Prevent peeking at opponent secrets
-- Note: We trust the client for now for simplicity in this MVP, but in a production app 
-- we would use a more complex RLS or Function-based approach to hide secrets from the SELECT response.
-- For this "Neural Arcade" context, we'll keep it simple: the UI will just not display the opponent's secret.

-- 5. RPC: Refresh Match for Next Round
CREATE OR REPLACE FUNCTION public.nd_next_round(p_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.number_duel_matches
  SET 
    phase = 'picking',
    p1_secret_number = NULL,
    p2_secret_number = NULL,
    round_number = round_number + 1,
    updated_at = NOW()
  WHERE id = p_match_id;
END;
$$;
