-- Phase 3: Round Isolation in Number Duel

-- Adding round_number to existing guesses table
ALTER TABLE public.number_duel_guesses
ADD COLUMN IF NOT EXISTS round_number INTEGER DEFAULT 1;
