'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

type Tab = 'all' | 'snake-ladder' | 'number-duel';

export default function ProfilePage() {
    const [supabase] = useState(() => createClient());
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [myProfile, setMyProfile] = useState<any>(null);
    const [editingUsername, setEditingUsername] = useState(false);
    const [usernameInput, setUsernameInput] = useState('');
    const [savingUsername, setSavingUsername] = useState(false);
    const [slMatches, setSlMatches] = useState<any[]>([]);
    const [ndMatches, setNdMatches] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('all');

    useEffect(() => {
        const fetchProfile = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.replace('/login'); return; }
            setUser(session.user);
            const uid = session.user.id;

            // Fetch own profile
            const { data: ownProfile } = await supabase.from('profiles').select('*').eq('id', uid).single();
            setMyProfile(ownProfile);

            const [slRes, ndRes] = await Promise.all([
                supabase.from('snake_ladder_matches').select('*').or(`player1_id.eq.${uid},player2_id.eq.${uid}`).order('created_at', { ascending: false }),
                supabase.from('number_duel_matches').select('*').or(`player1_id.eq.${uid},player2_id.eq.${uid}`).order('created_at', { ascending: false }),
            ]);

            const sl = slRes.data || [];
            const nd = ndRes.data || [];
            setSlMatches(sl);
            setNdMatches(nd);

            // Collect all unique opponent IDs to look up names
            const allMatches = [...sl, ...nd];
            const opponentIds = [...new Set(
                allMatches.flatMap(m => [m.player1_id, m.player2_id]).filter(id => id && id !== uid)
            )];

            if (opponentIds.length > 0) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('id, username')
                    .in('id', opponentIds);
                
                const map: Record<string, string> = {};
                (profileData || []).forEach(p => {
                    map[p.id] = p.username || 'Unknown Player';
                });
                setProfiles(map);
            }

            setLoading(false);
        };

        fetchProfile();
    }, [supabase, router]);

    const allMatches = useMemo(() => {
        if (!user) return [];
        const sl = slMatches.map(m => ({ ...m, game: 'Snake & Ladder' as const }));
        const nd = ndMatches.map(m => ({ ...m, game: 'Number Duel' as const }));
        return [...sl, ...nd].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [slMatches, ndMatches, user]);

    const filteredMatches = useMemo(() => {
        if (activeTab === 'all') return allMatches;
        if (activeTab === 'snake-ladder') return allMatches.filter(m => m.game === 'Snake & Ladder');
        return allMatches.filter(m => m.game === 'Number Duel');
    }, [allMatches, activeTab]);

    const stats = useMemo(() => {
        if (!user) return { played: 0, won: 0, lost: 0, active: 0, winRate: 0 };
        const finished = filteredMatches.filter(m => m.status === 'finished' || m.phase === 'finished');
        const won = finished.filter(m => m.winner_id === user.id).length;
        const lost = finished.length - won;
        const active = filteredMatches.filter(m => m.status !== 'finished' && m.phase !== 'finished').length;
        const winRate = finished.length > 0 ? Math.round((won / finished.length) * 100) : 0;
        return { played: filteredMatches.length, won, lost, active, winRate };
    }, [filteredMatches, user]);

    const rivals = useMemo(() => {
        if (!user) return [];
        const map: Record<string, { name: string; wins: number; losses: number; total: number; lastPlayed: string }> = {};

        allMatches.forEach(m => {
            if (m.status !== 'finished' && m.phase !== 'finished') return;
            const oppId = m.player1_id === user.id ? m.player2_id : m.player1_id;
            if (!oppId) return;
            if (!map[oppId]) map[oppId] = { name: profiles[oppId] || 'Unknown Player', wins: 0, losses: 0, total: 0, lastPlayed: m.created_at };
            map[oppId].total++;
            if (new Date(m.created_at) > new Date(map[oppId].lastPlayed)) map[oppId].lastPlayed = m.created_at;
            if (m.winner_id === user.id) map[oppId].wins++;
            else map[oppId].losses++;
        });

        return Object.entries(map)
            .map(([id, v]) => ({ id, ...v }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    }, [allMatches, user, profiles]);

    const getOpponentName = (match: any) => {
        if (!user) return '—';
        const oppId = match.player1_id === user.id ? match.player2_id : match.player1_id;
        if (!oppId) return '—';
        return profiles[oppId] || 'Unknown Player';
    };

    const getResult = (match: any) => {
        if (match.status !== 'finished' && match.phase !== 'finished') return 'active';
        if (match.winner_id === user?.id) return 'win';
        return 'loss';
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const handleSaveUsername = async () => {
        if (!usernameInput.trim() || !user) return;
        setSavingUsername(true);
        await supabase.from('profiles').upsert({ id: user.id, username: usernameInput.trim(), email: user.email }, { onConflict: 'id' });
        setMyProfile((p: any) => ({ ...p, username: usernameInput.trim() }));
        setEditingUsername(false);
        setUsernameInput('');
        setSavingUsername(false);
    };

    const initials = myProfile?.username
        ? myProfile.username.substring(0, 2).toUpperCase()
        : (user?.email?.[0] || '?').toUpperCase();

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full border-2 border-t-purple-500 border-white/10 animate-spin" />
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Loading Profile...</p>
            </div>
        </div>
    );

    return (
        <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-5%] left-[-5%] w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-[150px]" />
                <div className="absolute bottom-[10%] right-[-5%] w-[400px] h-[400px] bg-rose-500/10 rounded-full blur-[150px]" />
            </div>

            <div className="z-10 relative w-full max-w-2xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between pt-4">
                    <button onClick={() => router.push('/arcade')} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors flex items-center gap-1">
                        ← Arcade
                    </button>
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push('/friends')} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors flex items-center gap-1">
                            👥 Friends
                        </button>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Your Profile</p>
                    </div>
                </div>

                {/* Identity Card */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 border border-white/10 rounded-3xl p-5 flex items-start gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-rose-500 flex items-center justify-center text-2xl font-black shrink-0">
                        {initials}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        {editingUsername ? (
                            <div className="flex items-center gap-2 mb-1">
                                <input
                                    autoFocus
                                    type="text"
                                    value={usernameInput}
                                    onChange={e => setUsernameInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveUsername(); if (e.key === 'Escape') setEditingUsername(false); }}
                                    placeholder={myProfile?.username || 'Enter username...'}
                                    className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400 font-mono"
                                />
                                <button onClick={handleSaveUsername} disabled={savingUsername || !usernameInput.trim()}
                                    className="text-[9px] font-black uppercase px-3 py-1.5 rounded-full bg-teal-500 text-white disabled:opacity-40 hover:bg-teal-400 transition-all shrink-0">
                                    {savingUsername ? '...' : 'Save'}
                                </button>
                                <button onClick={() => setEditingUsername(false)}
                                    className="text-[9px] font-black uppercase px-3 py-1.5 rounded-full bg-white/5 text-slate-500 hover:bg-white/10 transition-all shrink-0">
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 mb-1">
                                <h1 className="text-xl font-black italic tracking-tight truncate">
                                    {myProfile?.username || user?.email?.split('@')[0] || 'Player'}
                                </h1>
                                <button onClick={() => { setEditingUsername(true); setUsernameInput(myProfile?.username || ''); }}
                                    className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 text-slate-500 hover:bg-white/10 hover:text-white transition-all shrink-0">
                                    Edit
                                </button>
                            </div>
                        )}
                        <p className="text-slate-500 text-xs font-medium truncate">{user?.email}</p>
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1">Member since {formatDate(user?.created_at)}</p>
                    </div>
                </motion.div>


                {/* Game Tabs */}
                <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/10">
                    {(['all', 'snake-ladder', 'number-duel'] as Tab[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            {tab === 'all' ? 'All Games' : tab === 'snake-ladder' ? '🐍 S&L' : '🔢 Duel'}
                        </button>
                    ))}
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-4 gap-2">
                    {[
                        { label: 'Played', value: stats.played, color: 'text-white' },
                        { label: 'Wins', value: stats.won, color: 'text-teal-400' },
                        { label: 'Losses', value: stats.lost, color: 'text-rose-400' },
                        { label: 'Win Rate', value: `${stats.winRate}%`, color: 'text-purple-400' },
                    ].map(s => (
                        <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">{s.label}</p>
                            <p className={`text-xl font-black font-mono ${s.color}`}>{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Rivals Section */}
                {rivals.length > 0 && (
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Your Rivals</p>
                        <div className="space-y-2">
                            {rivals.map((rival, i) => {
                                const isWinning = rival.wins > rival.losses;
                                const isEven = rival.wins === rival.losses;
                                return (
                                    <motion.div
                                        key={rival.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-3"
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-xs font-black text-slate-400 shrink-0">
                                                {rival.name?.[0]?.toUpperCase() || '?'}
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="font-black text-sm truncate">{rival.name}</p>
                                                <p className="text-[9px] text-slate-500 font-medium">{rival.total} match{rival.total !== 1 ? 'es' : ''} · last {formatDate(rival.lastPlayed)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-teal-400 font-black text-sm tabular-nums">{rival.wins}</span>
                                            <span className="text-slate-600 text-xs">—</span>
                                            <span className="text-rose-400 font-black text-sm tabular-nums">{rival.losses}</span>
                                            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full ml-1 ${isWinning ? 'bg-teal-500/20 text-teal-400' : isEven ? 'bg-slate-500/20 text-slate-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                {isWinning ? 'Winning' : isEven ? 'Even' : 'Losing'}
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Match History Feed */}
                <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
                        Match History {filteredMatches.length > 0 && <span className="text-slate-700">({filteredMatches.length})</span>}
                    </p>
                    <AnimatePresence mode="wait">
                        {filteredMatches.length === 0 ? (
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                                <div className="text-3xl mb-2 opacity-30">📭</div>
                                <p className="text-slate-500 text-xs font-medium">No matches yet for this game.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredMatches.map((match, i) => {
                                    const result = getResult(match);
                                    const oppName = getOpponentName(match);
                                    const isND = match.game === 'Number Duel';
                                    const myScore = isND ? (match.player1_id === user.id ? match.p1_score : match.p2_score) : null;
                                    const oppScore = isND ? (match.player1_id === user.id ? match.p2_score : match.p1_score) : null;
                                    return (
                                        <motion.div
                                            key={match.id}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.03 }}
                                            className={`bg-white/5 border rounded-2xl p-3 flex items-center justify-between gap-3 ${
                                                result === 'win' ? 'border-teal-500/20' :
                                                result === 'loss' ? 'border-rose-500/20' :
                                                'border-white/10'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-sm ${
                                                    result === 'win' ? 'bg-teal-500/20' :
                                                    result === 'loss' ? 'bg-rose-500/20' :
                                                    'bg-white/10'
                                                }`}>
                                                    {result === 'win' ? '🏆' : result === 'loss' ? '💀' : '⚡'}
                                                </div>
                                                <div className="overflow-hidden">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-black text-sm truncate">vs. {oppName}</p>
                                                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase shrink-0 ${isND ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                                            {isND ? 'Duel' : 'S&L'}
                                                        </span>
                                                    </div>
                                                    <p className="text-[9px] text-slate-500 font-medium">{formatDate(match.created_at)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {isND && myScore !== null && (
                                                    <span className="font-black font-mono text-sm text-slate-400 tabular-nums">{myScore}–{oppScore}</span>
                                                )}
                                                <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full ${
                                                    result === 'win' ? 'bg-teal-500/20 text-teal-400' :
                                                    result === 'loss' ? 'bg-rose-500/20 text-rose-400' :
                                                    'bg-amber-500/20 text-amber-400'
                                                }`}>
                                                    {result === 'win' ? 'Win' : result === 'loss' ? 'Loss' : 'Active'}
                                                </span>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="h-8" />
            </div>
        </main>
    );
}
