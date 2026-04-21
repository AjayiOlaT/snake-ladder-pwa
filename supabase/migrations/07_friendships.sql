-- 07_friendships.sql
-- Friendships table with RLS

CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(sender_id, receiver_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships_select" ON public.friendships
    FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "friendships_insert" ON public.friendships
    FOR INSERT WITH CHECK (auth.uid() = sender_id AND sender_id <> receiver_id);

CREATE POLICY "friendships_update" ON public.friendships
    FOR UPDATE USING (auth.uid() = receiver_id);

CREATE POLICY "friendships_delete" ON public.friendships
    FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "profiles_public_read" ON public.profiles
    FOR SELECT USING (true);
