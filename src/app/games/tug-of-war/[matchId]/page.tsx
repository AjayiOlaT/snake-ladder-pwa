'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { music } from '../../../../lib/music';
import Rope from '../../../../components/TugOfWar/Rope';
import QuestionArena from '../../../../components/TugOfWar/QuestionArena';

interface TugOfWarConfig {
    subject: string;
    difficulty: 'easy' | 'medium' | 'hard';
}

interface TugOfWarMatch {
    id: string;
    status: 'waiting' | 'active' | 'finished';
    p1_id: string;
    p2_id: string | null;
    rope_pos: number;
    p1_config: TugOfWarConfig;
    p2_config: TugOfWarConfig | null;
    join_code: string;
    winner_id: string | null;
    created_at: string;
    updated_at: string;
}

interface Profile {
    id: string;
    username: string;
    avatar_url: string | null;
}

export default function TugOfWarGame() {
    const params = useParams();
    const matchId = params.matchId as string;
    const router = useRouter();
    const [supabase] = useState(() => createClient());
    
    const [user, setUser] = useState<any>(null);
    const [match, setMatch] = useState<TugOfWarMatch | null>(null);
    const [questions, setQuestions] = useState<any[]>([]);
    const [opponentProfile, setOpponentProfile] = useState<Profile | null>(null);
    const [myProfile, setMyProfile] = useState<Profile | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    
    // Friends & Invite
    const [friends, setFriends] = useState<Profile[]>([]);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [invitingId, setInvitingId] = useState<string | null>(null);

    useEffect(() => { setIsMuted(music.isMuted()); }, []);

    // Utility to shuffle questions
    const shuffle = (array: any[]) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    useEffect(() => {
        if (!matchId) return;

        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.replace('/login'); return; }
            setUser(session.user);

            const { data, error } = await supabase.from('tug_of_war_matches').select('*').eq('id', matchId).single();
            if (error || !data) { router.replace('/arcade'); return; }
            setMatch(data);

            // Fetch player profiles
            const oppId = data.p1_id === session.user.id ? data.p2_id : data.p1_id;
            const playerIds = [session.user.id, oppId].filter(Boolean);
            const { data: profileRows } = await supabase.from('profiles').select('id, username, avatar_url').in('id', playerIds);
            if (profileRows) {
                setMyProfile(profileRows.find((p: any) => p.id === session.user.id));
                const opp = profileRows.find((p: any) => p.id === oppId);
                if (opp) setOpponentProfile(opp);
            }

            // Fetch questions - Randomized
            const myConfig = data.p1_id === session.user.id ? data.p1_config : data.p2_config;
            if (myConfig) {
                const { data: qData } = await supabase
                    .from('questions')
                    .select('*')
                    .eq('subject', myConfig.subject)
                    .eq('difficulty', myConfig.difficulty)
                    .limit(50);
                
                if (qData) {
                    setQuestions(shuffle(qData).slice(0, 20));
                }
            }

            // Fetch friends for invitation
            const { data: friendshipData } = await supabase.from('friendships').select('*').or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`).eq('status', 'accepted');
            if (friendshipData) {
                const friendIds = friendshipData.map(f => f.sender_id === session.user.id ? f.receiver_id : f.sender_id);
                if (friendIds.length > 0) {
                    const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', friendIds);
                    setFriends(profiles || []);
                }
            }
        })();
    }, [matchId, supabase, router]);

    const [shake, setShake] = useState(0);

    // Stabilized Real-time Sync
    useEffect(() => {
        if (!matchId || !supabase || !user?.id) return;

        console.log('📡 Connecting to Arena:', matchId);
        
        const channel = supabase
            .channel(`tow-${matchId}`)
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'tug_of_war_matches', 
                filter: `id=eq.${matchId}` 
            }, (payload) => {
                const newMatch = payload.new as TugOfWarMatch;
                console.log('🎯 Arena Update:', newMatch.rope_pos, newMatch.status);
                
                setMatch(prev => {
                    // Trigger shake if rope moved
                    if (prev && prev.rope_pos !== newMatch.rope_pos) {
                        setShake(s => s + 1);
                    }
                    return newMatch;
                });
            })
            .subscribe((status) => {
                console.log('⚡ Channel Status:', status);
            });

        return () => {
            console.log('🔌 Disconnecting Arena');
            supabase.removeChannel(channel);
        };
    }, [matchId, user?.id]);

    // Secondary data effects (Questions & Opponent)
    useEffect(() => {
        if (!match || match.status !== 'active' || !!opponentProfile) return;

        const setupArena = async () => {
            // Fetch Opponent Profile
            const oppId = match.p1_id === user?.id ? match.p2_id : match.p1_id;
            if (oppId) {
                const { data: profile } = await supabase.from('profiles').select('*').eq('id', oppId).single();
                if (profile) setOpponentProfile(profile);
            }

            // Fetch Questions
            if (questions.length === 0) {
                const myConfig = match.p1_id === user?.id ? match.p1_config : match.p2_config;
                if (myConfig) {
                    const { data: qs } = await supabase.from('questions')
                        .select('*')
                        .eq('subject', myConfig.subject)
                        .eq('difficulty', myConfig.difficulty)
                        .limit(50);
                    if (qs) setQuestions(shuffle(qs).slice(0, 20));
                }
            }
        };

        setupArena();
    }, [match?.status, match?.p2_id, user?.id]);

    const handleCorrectAnswer = async (impact: number) => {
        if (!match || match.status !== 'active') return;
        
        const effectiveImpact = impact * 12.5;
        console.log('💥 Pulling:', effectiveImpact);

        const { error } = await supabase.rpc('tow_tug_rope', { 
            p_match_id: matchId, 
            p_impact: effectiveImpact 
        });

        if (error) {
            console.error('❌ Pull failed:', error.message);
        } else {
            music.playMoveSound();
            setShake(s => s + 1); // Local feedback
        }
    };

    const sendInvite = async (friendId: string) => {
        if (!user || !match) return;
        setInvitingId(friendId);
        await supabase.from('game_invites').insert({
            sender_id: user.id,
            receiver_id: friendId,
            game_type: 'tug-of-war',
            join_code: match.join_code
        });
        setTimeout(() => setInvitingId(null), 1000);
    };

    const toggleMute = () => setIsMuted(music.toggleMute());

    if (!match || !user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white italic tracking-widest text-sm animate-pulse">Initializing Arena...</div>;

    const isP1 = user.id === match.p1_id;
    const myConfig = isP1 ? match.p1_config : match.p2_config;

    return (
        <div className="min-h-screen bg-[#020408] text-white overflow-hidden relative">
            {/* War Atmosphere Background */}
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(20,20,30,1)_0%,_rgba(2,4,8,1)_100%)] pointer-events-none" />
            <div className="fixed inset-0 bg-[url('/noise.png')] opacity-[0.03] pointer-events-none" />

            {/* Main Game Container with Shake */}
            <motion.div 
                className="relative z-10 max-w-4xl mx-auto px-4 py-8 md:py-12 flex flex-col gap-8 md:gap-16 items-center"
                animate={shake ? {
                    x: [0, -10, 10, -10, 10, 0],
                    y: [0, 5, -5, 5, -5, 0],
                } : {}}
                transition={{ duration: 0.3 }}
                key={shake}
            >
                <nav className="w-full flex justify-between items-center">
                <div className="flex flex-col">
                    <h2 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.3em]">Neural Tug-of-War</h2>
                    <h1 className="text-xl font-black italic tracking-tighter uppercase">Arena 01</h1>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={toggleMute} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-md hover:bg-white/10 transition-colors">
                        {isMuted ? '🔇' : '🔊'}
                    </button>
                    <button onClick={() => router.push('/arcade')} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                        Quit
                    </button>
                </div>
            </nav>

            <div className="z-10 w-full max-w-4xl flex flex-col gap-12 items-center">
                
                {/* The Rope */}
                <Rope position={match.rope_pos} />

                {/* Match Status / Waiting */}
                <AnimatePresence mode="wait">
                    {match.status === 'waiting' ? (
                        <motion.div 
                            key="waiting"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="w-full max-w-lg flex flex-col items-center text-center gap-6 p-8 md:p-12 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[3rem]"
                        >
                            <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center text-4xl animate-pulse">📡</div>
                            <div>
                                <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-2">Awaiting Challenger</h2>
                                <p className="text-slate-400 text-sm font-medium mb-8">Stabilize the bridge by sharing the code or inviting a friend.</p>
                                
                                <div className="bg-black/40 border border-white/10 rounded-2xl p-6 mb-8">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Arena Access Code</p>
                                    <p className="text-5xl font-black font-mono tracking-[0.2em] text-white">{match.join_code}</p>
                                </div>

                                <button 
                                    onClick={() => setShowInviteModal(true)}
                                    className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    <span>👥</span> Invite Friend
                                </button>
                            </div>
                        </motion.div>
                    ) : match.status === 'finished' ? (
                        <motion.div 
                            key="finished"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full max-w-2xl flex flex-col items-center text-center gap-8 p-12 bg-white/5 backdrop-blur-3xl border border-white/20 rounded-[4rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] relative overflow-hidden"
                        >
                            {/* Decorative Glows */}
                            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 blur-[80px] opacity-40 ${match.winner_id === user.id ? 'bg-teal-500' : 'bg-rose-500'}`} />
                            
                            <div className="relative z-10">
                                <motion.div 
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="text-8xl mb-4 filter drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                                >
                                    {match.winner_id === user.id ? '🏆' : '💀'}
                                </motion.div>
                                <h2 className="text-5xl font-black italic uppercase tracking-tighter text-white mb-2 leading-none">
                                    {match.winner_id === user.id ? 'Neural Victory' : 'Connection Lost'}
                                </h2>
                                <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-[10px] mb-8">Match Protocol Terminated</p>

                                <div className="grid grid-cols-2 gap-4 w-full mb-8">
                                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Final Force</span>
                                        <span className="text-3xl font-black font-mono text-purple-400">{Math.abs(match.rope_pos).toFixed(1)}</span>
                                        <span className="text-[8px] font-bold text-slate-600 mt-1 uppercase">Pascals</span>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Impact Rank</span>
                                        <span className="text-3xl font-black font-mono text-indigo-400">{match.winner_id === user.id ? 'A+' : 'C-'}</span>
                                        <span className="text-[8px] font-bold text-slate-600 mt-1 uppercase">Evaluation</span>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 w-full">
                                    <button 
                                        onClick={() => router.push('/arcade')}
                                        className="flex-1 py-5 bg-white text-slate-950 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:scale-[1.05] active:scale-95 transition-all shadow-2xl"
                                    >
                                        Return to Hub
                                    </button>
                                    <button 
                                        onClick={() => router.push('/games/tug-of-war/lobby')}
                                        className="flex-1 py-5 bg-white/5 border border-white/10 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-white/10 transition-all"
                                    >
                                        New Arena
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="active"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="w-full flex flex-col items-center gap-8"
                        >
                            <QuestionArena 
                                questions={questions} 
                                onCorrect={handleCorrectAnswer} 
                                multiplier={myConfig?.multiplier || 1.0}
                                disabled={match.status !== 'active'}
                            />
                            
                            {/* Opponent Info */}
                            <div className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl">
                                <img 
                                    src={opponentProfile?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${opponentProfile?.id}`} 
                                    className="w-8 h-8 rounded-full bg-indigo-500/20"
                                    alt="Opponent"
                                />
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Opponent</span>
                                    <span className="text-xs font-bold">{opponentProfile?.username || 'Combatant 02'}</span>
                                </div>
                                <div className="w-px h-6 bg-white/10" />
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Difficulty</span>
                                    <span className="text-xs font-bold uppercase text-indigo-400">{isP1 ? match.p2_config?.difficulty : match.p1_config?.difficulty}</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom HUD */}
            <footer className="mt-auto z-10 w-full max-w-4xl py-6 flex justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 border-t border-white/5">
                <div className="flex gap-6">
                    <span>Sync: <span className="text-teal-400">Stable</span></span>
                    <span>Lat: <span className="text-white">18ms</span></span>
                </div>
                <span>© 2026 Neural Engine V2.0</span>
            </footer>

            {/* Invite Modal */}
            <AnimatePresence>
                {showInviteModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl">
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="w-full max-w-sm bg-white/5 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4">
                                <button onClick={() => setShowInviteModal(false)} className="text-slate-500 hover:text-white transition-colors text-xl font-black">×</button>
                            </div>
                            
                            <div className="text-center space-y-6">
                                <div className="space-y-2">
                                    <p className="text-purple-500 font-black text-[10px] uppercase tracking-[0.3em]">Arena Recruitment</p>
                                    <h3 className="text-2xl font-black italic tracking-tighter uppercase">Invite Challenger</h3>
                                    <p className="text-slate-500 text-xs font-medium">Challenge a friend to this arena.</p>
                                </div>

                                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                    {friends.length === 0 ? (
                                        <p className="text-slate-600 text-[10px] uppercase font-black py-8">No Neural Connections Found</p>
                                    ) : friends.map(f => (
                                        <div key={f.id} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-xs font-black text-purple-400 uppercase">
                                                    {f.username?.[0] || '?'}
                                                </div>
                                                <span className="text-xs font-bold truncate max-w-[120px]">{f.username}</span>
                                            </div>
                                            <button 
                                                onClick={() => sendInvite(f.id)}
                                                disabled={invitingId === f.id}
                                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${invitingId === f.id ? 'bg-teal-500 text-white' : 'bg-white/10 hover:bg-white text-slate-950'}`}
                                            >
                                                {invitingId === f.id ? 'Sent ✓' : 'Invite'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            </motion.div>
        </div>
    );
}
