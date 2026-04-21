-- 08_game_invites.sql
-- Simple game invite system for friend-to-friend challenges

CREATE TABLE IF NOT EXISTS public.game_invites (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL CHECK (game_type IN ('number-duel', 'snake-ladder')),
    join_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_select" ON public.game_invites
    FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "invites_insert" ON public.game_invites
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "invites_update" ON public.game_invites
    FOR UPDATE USING (auth.uid() = receiver_id);

CREATE POLICY "invites_delete" ON public.game_invites
    FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Add email column to profiles for email-based search
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
