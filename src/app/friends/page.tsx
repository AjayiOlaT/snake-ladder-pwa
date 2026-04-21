'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

type Friendship = {
    id: string;
    sender_id: string;
    receiver_id: string;
    status: 'pending' | 'accepted' | 'declined';
    created_at: string;
    other?: { id: string; username: string };
};

export default function FriendsPage() {
    const [supabase] = useState(() => createClient());
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [myProfile, setMyProfile] = useState<any>(null);
    const [usernameInput, setUsernameInput] = useState('');
    const [settingUsername, setSettingUsername] = useState(false);

    const [friendships, setFriendships] = useState<Friendship[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<'friends' | 'requests'>('friends');

    const loadData = useCallback(async (uid: string) => {
        const { data } = await supabase.from('friendships').select('*').or(`sender_id.eq.${uid},receiver_id.eq.${uid}`);
        if (!data) return;

        const otherIds = [...new Set(data.map(f => f.sender_id === uid ? f.receiver_id : f.sender_id))];
        let profileMap: Record<string, string> = {};
        if (otherIds.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id, username, email').in('id', otherIds);
            (profiles || []).forEach(p => { profileMap[p.id] = p.username || p.email || 'Unknown'; });
        }

        setFriendships(data.map(f => ({
            ...f,
            other: {
                id: f.sender_id === uid ? f.receiver_id : f.sender_id,
                username: profileMap[f.sender_id === uid ? f.receiver_id : f.sender_id] || 'Unknown',
            }
        })));
    }, [supabase]);

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.replace('/login'); return; }
            setUser(session.user);

            // Sync email to profile so others can find them
            await supabase.from('profiles').upsert({
                id: session.user.id,
                email: session.user.email,
            }, { onConflict: 'id', ignoreDuplicates: false });

            const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
            setMyProfile(profile);

            await loadData(session.user.id);
            setLoading(false);
        };
        init();
    }, [supabase, router, loadData]);

    const handleSetUsername = async () => {
        if (!usernameInput.trim() || !user) return;
        setSettingUsername(true);
        const { error } = await supabase.from('profiles').upsert({
            id: user.id,
            username: usernameInput.trim(),
            email: user.email,
        }, { onConflict: 'id' });
        if (!error) {
            setMyProfile((p: any) => ({ ...p, username: usernameInput.trim() }));
            setUsernameInput('');
        }
        setSettingUsername(false);
    };

    const handleSearch = async () => {
        if (!searchQuery.trim() || !user) return;
        setSearching(true);
        const q = searchQuery.trim();

        // Search by username first, then fall back to email
        const [byUsername, byEmail] = await Promise.all([
            supabase.from('profiles').select('id, username, email').ilike('username', `%${q}%`).neq('id', user.id).limit(6),
            supabase.from('profiles').select('id, username, email').ilike('email', `%${q}%`).neq('id', user.id).limit(4),
        ]);

        const combined = [...(byUsername.data || []), ...(byEmail.data || [])];
        // Deduplicate by id
        const unique = Array.from(new Map(combined.map(p => [p.id, p])).values());
        setSearchResults(unique);
        setSearching(false);
    };

    const handleSendRequest = async (receiverId: string) => {
        setActionLoading(receiverId);
        await supabase.from('friendships').insert({ sender_id: user.id, receiver_id: receiverId });
        await loadData(user.id);
        setSearchResults(prev => prev.filter(p => p.id !== receiverId));
        setActionLoading(null);
    };

    const handleRespond = async (friendshipId: string, status: 'accepted' | 'declined') => {
        setActionLoading(friendshipId);
        await supabase.from('friendships').update({ status }).eq('id', friendshipId);
        await loadData(user.id);
        setActionLoading(null);
    };

    const handleUnfriend = async (friendshipId: string) => {
        setActionLoading(friendshipId);
        await supabase.from('friendships').delete().eq('id', friendshipId);
        await loadData(user.id);
        setActionLoading(null);
    };

    const getRelationship = (profileId: string) => {
        return friendships.find(f => f.other?.id === profileId);
    };

    const friends = friendships.filter(f => f.status === 'accepted');
    const pendingIncoming = friendships.filter(f => f.status === 'pending' && f.receiver_id === user?.id);
    const pendingOutgoing = friendships.filter(f => f.status === 'pending' && f.sender_id === user?.id);

    const displayName = (p: any) => p.username || p.email || 'Unknown Player';
    const initials = (name: string) => name?.[0]?.toUpperCase() || '?';
    const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full border-2 border-t-purple-500 border-white/10 animate-spin" />
        </div>
    );

    return (
        <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8 relative overflow-hidden">
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 left-[-10%] w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-[150px]" />
                <div className="absolute bottom-0 right-[-5%] w-[300px] h-[300px] bg-teal-500/10 rounded-full blur-[150px]" />
            </div>

            <div className="z-10 relative w-full max-w-lg mx-auto space-y-5">

                {/* Header */}
                <div className="flex items-center justify-between pt-4">
                    <button onClick={() => router.push('/profile')} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">
                        ← Profile
                    </button>
                    <div className="flex items-center gap-2">
                        {pendingIncoming.length > 0 && (
                            <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                                {pendingIncoming.length}
                            </span>
                        )}
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Friends</p>
                    </div>
                </div>

                {/* Username Setup Banner */}
                {!myProfile?.username && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                        <div>
                            <p className="text-amber-400 font-black text-sm uppercase tracking-tight">Set Your Username 👋</p>
                            <p className="text-slate-400 text-xs font-medium mt-1">
                                Pick a username so your friends can find and challenge you by name.
                                <br/>Don't worry — people can also find you with your email.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={usernameInput}
                                onChange={e => setUsernameInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSetUsername()}
                                placeholder="e.g. GameKing99..."
                                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 font-mono"
                            />
                            <button onClick={handleSetUsername} disabled={settingUsername || !usernameInput.trim()}
                                className="px-4 py-2 bg-amber-500 text-slate-950 rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-40 transition-all hover:bg-amber-400">
                                {settingUsername ? '...' : 'Save'}
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* My Identity */}
                {myProfile?.username && (
                    <div className="flex items-center gap-2 p-3 bg-white/5 border border-white/10 rounded-2xl">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-rose-500 flex items-center justify-center text-sm font-black shrink-0">
                            {initials(myProfile.username)}
                        </div>
                        <div>
                            <p className="font-black text-sm">{myProfile.username}</p>
                            <p className="text-[9px] text-slate-500 font-medium">Friends can find you by this name or your email</p>
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="space-y-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Find Players</p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder="Search username or email..."
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/40 transition-all"
                        />
                        <button onClick={handleSearch} disabled={searching || !searchQuery.trim()}
                            className="px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-30 transition-all">
                            {searching ? '...' : 'Search'}
                        </button>
                    </div>

                    <AnimatePresence>
                        {searchResults.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                                {searchResults.map(p => {
                                    const rel = getRelationship(p.id);
                                    const name = displayName(p);
                                    return (
                                        <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center text-sm font-black text-purple-400 shrink-0">
                                                    {initials(name)}
                                                </div>
                                                <div className="overflow-hidden">
                                                    <p className="font-black text-sm truncate">{p.username || '—'}</p>
                                                    {p.email && <p className="text-[9px] text-slate-500 truncate">{p.email}</p>}
                                                </div>
                                            </div>
                                            {rel ? (
                                                <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full shrink-0 ${rel.status === 'accepted' ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                                    {rel.status === 'accepted' ? 'Friends' : rel.sender_id === user.id ? 'Requested' : 'Incoming'}
                                                </span>
                                            ) : (
                                                <button onClick={() => handleSendRequest(p.id)} disabled={actionLoading === p.id}
                                                    className="text-[9px] font-black uppercase px-3 py-1.5 rounded-full bg-purple-500/20 text-purple-400 hover:bg-purple-500 hover:text-white transition-all disabled:opacity-40 shrink-0">
                                                    {actionLoading === p.id ? '...' : '+ Add'}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </motion.div>
                        )}
                        {searchResults.length === 0 && searchQuery && !searching && (
                            <p className="text-slate-600 text-xs text-center py-2">No players found. Try their email address.</p>
                        )}
                    </AnimatePresence>
                </div>

                {/* Tabs: Friends / Requests */}
                <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/10">
                    <button onClick={() => setActiveSection('friends')}
                        className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSection === 'friends' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                        Friends ({friends.length})
                    </button>
                    <button onClick={() => setActiveSection('requests')}
                        className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${activeSection === 'requests' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                        Requests
                        {pendingIncoming.length > 0 && (
                            <span className={`w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ${activeSection === 'requests' ? 'bg-slate-950 text-white' : 'bg-rose-500 text-white'}`}>
                                {pendingIncoming.length}
                            </span>
                        )}
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {activeSection === 'friends' ? (
                        <motion.div key="friends" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                            {friends.length === 0 ? (
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                                    <div className="text-3xl mb-2 opacity-30">👥</div>
                                    <p className="text-slate-500 text-xs font-medium">No friends yet. Search for players above!</p>
                                </div>
                            ) : friends.map((f, i) => (
                                <motion.div key={f.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                    className="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/30 to-teal-500/30 border border-white/10 flex items-center justify-center text-sm font-black shrink-0">
                                            {initials(f.other?.username || '?')}
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="font-black text-sm truncate">{f.other?.username}</p>
                                            <p className="text-[9px] text-slate-500">Friends since {formatDate(f.created_at)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button onClick={() => router.push('/arcade')}
                                            className="text-[9px] font-black uppercase px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-all">
                                            Challenge
                                        </button>
                                        <button onClick={() => handleUnfriend(f.id)} disabled={actionLoading === f.id}
                                            className="text-[9px] font-black uppercase px-3 py-1.5 rounded-full bg-white/5 text-slate-500 hover:bg-white/10 transition-all disabled:opacity-30">
                                            {actionLoading === f.id ? '...' : 'Remove'}
                                        </button>
                                    </div>
                                </motion.div>
                            ))}

                            {/* Outgoing Pending */}
                            {pendingOutgoing.length > 0 && (
                                <div className="pt-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-2">Sent Requests</p>
                                    {pendingOutgoing.map(f => (
                                        <div key={f.id} className="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-3 opacity-60">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-xs font-black text-slate-400 shrink-0">
                                                    {initials(f.other?.username || '?')}
                                                </div>
                                                <p className="font-black text-sm">{f.other?.username}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-black uppercase px-2 py-1 rounded-full bg-slate-500/20 text-slate-500">Pending</span>
                                                <button onClick={() => handleUnfriend(f.id)} disabled={actionLoading === f.id}
                                                    className="text-[9px] font-black uppercase px-3 py-1.5 rounded-full bg-white/5 text-slate-500 hover:bg-white/10 transition-all">
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div key="requests" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                            {pendingIncoming.length === 0 ? (
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                                    <div className="text-3xl mb-2 opacity-30">📬</div>
                                    <p className="text-slate-500 text-xs font-medium">No pending friend requests.</p>
                                </div>
                            ) : pendingIncoming.map((f, i) => (
                                <motion.div key={f.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                    className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-sm font-black text-purple-400 shrink-0">
                                            {initials(f.other?.username || '?')}
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="font-black text-sm truncate">{f.other?.username}</p>
                                            <p className="text-[9px] text-slate-500">Sent {formatDate(f.created_at)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button onClick={() => handleRespond(f.id, 'accepted')} disabled={actionLoading === f.id}
                                            className="text-[9px] font-black uppercase px-3 py-1.5 rounded-full bg-teal-500/20 text-teal-400 hover:bg-teal-500 hover:text-white transition-all disabled:opacity-30">
                                            {actionLoading === f.id ? '...' : 'Accept ✓'}
                                        </button>
                                        <button onClick={() => handleRespond(f.id, 'declined')} disabled={actionLoading === f.id}
                                            className="text-[9px] font-black uppercase px-3 py-1.5 rounded-full bg-white/5 text-slate-500 hover:bg-white/10 transition-all">
                                            Decline
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="h-8" />
            </div>
        </main>
    );
}
