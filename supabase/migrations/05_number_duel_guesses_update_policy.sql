-- Phase 2 Fix: Add missing UPDATE policy for number_duel_guesses so opponents can respond

CREATE POLICY "Participants can update guesses" ON public.number_duel_guesses 
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.number_duel_matches m
        WHERE m.id = match_id
        AND auth.uid() IN (m.player1_id, m.player2_id)
    )
);
