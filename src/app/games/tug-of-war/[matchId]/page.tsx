'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { music } from '../../../../lib/music';
import Rope from '../../../../components/TugOfWar/Rope';
import QuestionArena from '../../../../components/TugOfWar/QuestionArena';
import { ScreenShake } from '../../../../components/TugOfWar/TugEffects';

interface TugOfWarConfig {
    subject: string;
    difficulty: 'easy' | 'medium' | 'hard';
    multiplier?: number;
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
    const [showQuitConfirm, setShowQuitConfirm] = useState(false);
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
                setMyProfile(profileRows.find((p: any) => p.id === session.user.id) || null);
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

    const shakeRef = useRef<any>(null);

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
                        if (shakeRef.current) shakeRef.current.shake(1.5);
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
            if (shakeRef.current) shakeRef.current.shake(impact);
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

    if (!match || !user) return <div className="min-h-screen bg-md-surface flex items-center justify-center text-md-on-surface italic tracking-widest text-sm animate-pulse">Initializing Arena...</div>;

    const isP1 = user.id === match.p1_id;
    const myConfig = isP1 ? match.p1_config : match.p2_config;

    return (
        <div className="min-h-screen bg-md-surface text-md-on-surface overflow-hidden relative">
            {/* Subtle Gradient Background */}
            <div className="fixed inset-0 bg-gradient-to-b from-md-primary/5 via-md-surface to-md-surface pointer-events-none" />
            
            {/* Main Game Container */}
            <ScreenShake ref={shakeRef}>
                <motion.div 
                    className="relative z-10 max-w-5xl mx-auto px-4 py-6 md:py-8 flex flex-col gap-8 md:gap-12 items-center"
                >
                <nav className="w-full flex justify-between items-center bg-md-surface/40 backdrop-blur-md p-4 md:p-6 rounded-[2.5rem] border border-md-outline/10 shadow-sm">
                <div className="flex flex-col">
                    <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-md-primary-container text-md-on-primary-container rounded-full text-[9px] font-bold uppercase tracking-wider mb-1 w-fit">
                        <span>Arena Live</span>
                    </div>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-md-on-surface">The Rope Battle</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={toggleMute} className="w-12 h-12 rounded-full bg-md-surface-variant/30 flex items-center justify-center hover:bg-md-surface-variant/50 transition-colors">
                        <span className="text-xl">{isMuted ? '󰝟' : '󰕾'}</span>
                    </button>
                    <button onClick={() => setShowQuitConfirm(true)} className="px-6 py-3 bg-md-error/10 text-md-error rounded-full text-xs font-bold uppercase tracking-wider hover:bg-md-error hover:text-white transition-all">
                        Exit
                    </button>
                </div>
            </nav>

            {/* QUIT CONFIRMATION MODAL */}
            <AnimatePresence>
                {showQuitConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowQuitConfirm(false)}
                            className="absolute inset-0 bg-md-on-surface/40 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-sm bg-md-surface rounded-[2.5rem] p-10 shadow-2xl flex flex-col items-center text-center gap-8"
                        >
                            <div className="w-20 h-20 bg-md-error/10 text-md-error rounded-[2rem] flex items-center justify-center text-4xl">
                                󰈆
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-md-on-surface mb-2">Leave Battle?</h3>
                                <p className="text-md-on-surface-variant text-sm">Your current progress will be lost. Are you sure you want to exit the arena?</p>
                            </div>
                            <div className="flex flex-col w-full gap-3">
                                <button 
                                    onClick={() => setShowQuitConfirm(false)}
                                    className="w-full py-4 rounded-2xl bg-md-primary text-md-on-primary font-bold text-sm tracking-wide shadow-lg shadow-md-primary/20 hover:opacity-90 transition-all"
                                >
                                    Stay in Battle
                                </button>
                                <button 
                                    onClick={() => router.push('/arcade')}
                                    className="w-full py-4 rounded-2xl bg-md-surface-variant/30 text-md-on-surface-variant font-bold text-sm tracking-wide hover:bg-md-error/10 hover:text-md-error transition-all"
                                >
                                    Yes, Exit
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div className="z-10 w-full flex flex-col gap-12 items-center">
                
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
                            className="w-full max-w-lg flex flex-col items-center text-center gap-8 p-10 md:p-14 bg-md-surface border border-md-outline/10 rounded-[3rem] shadow-xl"
                        >
                            <div className="w-20 h-20 bg-md-primary-container text-md-on-primary-container rounded-[2rem] flex items-center justify-center text-4xl animate-bounce">👋</div>
                            <div className="w-full">
                                <h2 className="text-3xl font-bold text-md-on-surface mb-3">Waiting for Opponent</h2>
                                <p className="text-md-on-surface-variant text-sm mb-10">Share the arena code with a friend to start the duel!</p>
                                
                                <div className="bg-md-surface-variant/20 border border-md-outline/10 rounded-3xl p-8 mb-10">
                                    <p className="text-[10px] font-bold text-md-outline uppercase tracking-[0.2em] mb-3">Arena Access Code</p>
                                    <p className="text-5xl font-bold font-mono tracking-[0.3em] text-md-primary">{match.join_code}</p>
                                </div>

                                <button 
                                    onClick={() => setShowInviteModal(true)}
                                    className="w-full py-5 bg-md-primary text-md-on-primary rounded-2xl font-bold text-sm tracking-wide shadow-lg shadow-md-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                                >
                                    Invite a Friend
                                </button>
                            </div>
                        </motion.div>
                    ) : match.status === 'finished' ? (
                        <motion.div 
                            key="finished"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full max-w-2xl flex flex-col items-center text-center gap-10 p-12 md:p-16 bg-md-surface border border-md-outline/10 rounded-[4rem] shadow-2xl relative overflow-hidden"
                        >
                            <div className={`absolute -top-32 -left-32 w-80 h-80 blur-[100px] opacity-20 rounded-full ${match.winner_id === user.id ? 'bg-md-success' : 'bg-md-error'}`} />
                            
                            <div className="relative z-10 flex flex-col items-center">
                                <motion.div 
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.2, type: 'spring' }}
                                    className="text-9xl mb-6"
                                >
                                    {match.winner_id === user.id ? '🏆' : '🏳️'}
                                </motion.div>
                                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-md-on-surface mb-3">
                                    {match.winner_id === user.id ? 'Victory!' : 'Better Luck Next Time'}
                                </h2>
                                <p className="text-md-outline font-bold uppercase tracking-[0.2em] text-[10px] mb-12">Match Analysis Complete</p>

                                <div className="grid grid-cols-2 gap-6 w-full mb-12">
                                    <div className="bg-md-surface-variant/20 border border-md-outline/5 rounded-[2rem] p-8 flex flex-col items-center">
                                        <span className="text-[10px] font-bold text-md-outline uppercase tracking-wider mb-2">Final Pull</span>
                                        <span className={`text-4xl font-bold font-mono ${match.winner_id === user.id ? 'text-md-success' : 'text-md-error'}`}>
                                            {Math.abs(match.rope_pos).toFixed(0)}%
                                        </span>
                                    </div>
                                    <div className="bg-md-surface-variant/20 border border-md-outline/5 rounded-[2rem] p-8 flex flex-col items-center">
                                        <span className="text-[10px] font-bold text-md-outline uppercase tracking-wider mb-2">Match Grade</span>
                                        <span className="text-4xl font-bold font-mono text-md-primary">
                                            {match.winner_id === user.id ? 'A+' : 'B'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 w-full">
                                    <button 
                                        onClick={() => router.push('/arcade')}
                                        className="flex-1 py-5 bg-md-on-surface text-md-surface rounded-[2rem] font-bold text-sm tracking-wide hover:opacity-90 active:scale-95 transition-all shadow-xl"
                                    >
                                        Back to Map
                                    </button>
                                    <button 
                                        onClick={() => router.push('/games/tug-of-war/lobby')}
                                        className="flex-1 py-5 bg-md-surface-variant/30 text-md-on-surface-variant border border-md-outline/10 rounded-[2rem] font-bold text-sm tracking-wide hover:bg-md-surface-variant/50 transition-all"
                                    >
                                        Play Again
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="active"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="w-full flex flex-col items-center gap-10"
                        >
                            <QuestionArena 
                                questions={questions} 
                                onCorrect={handleCorrectAnswer} 
                                multiplier={myConfig?.multiplier || 1.0}
                                disabled={match.status !== 'active'}
                            />
                            
                            {/* Opponent Info */}
                            <div className="flex items-center gap-6 p-5 bg-md-surface-variant/10 border border-md-outline/5 rounded-3xl shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <img 
                                            src={opponentProfile?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${opponentProfile?.id}`} 
                                            className="w-10 h-10 rounded-full bg-md-primary-container"
                                            alt="Opponent"
                                        />
                                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-md-success rounded-full border-2 border-md-surface" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-md-outline uppercase tracking-wider">Opponent</span>
                                        <span className="text-sm font-semibold text-md-on-surface">{opponentProfile?.username || 'Challenger'}</span>
                                    </div>
                                </div>
                                <div className="w-px h-8 bg-md-outline/10" />
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-md-outline uppercase tracking-wider">Tactics</span>
                                    <span className="text-sm font-bold uppercase text-md-primary">{isP1 ? match.p2_config?.difficulty : match.p1_config?.difficulty}</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom HUD */}
            <footer className="mt-auto z-10 w-full max-w-5xl py-8 flex justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-md-outline border-t border-md-outline/5">
                <div className="flex gap-8">
                    <span>Sync: <span className="text-md-success">Encrypted</span></span>
                    <span>Ping: <span className="text-md-on-surface">12ms</span></span>
                </div>
                <span>© 2026 Material Engine v3.2</span>
            </footer>

            {/* Invite Modal */}
            <AnimatePresence>
                {showInviteModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-md-on-surface/20 backdrop-blur-xl">
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="w-full max-w-md bg-md-surface border border-md-outline/10 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8">
                                <button onClick={() => setShowInviteModal(false)} className="text-md-outline hover:text-md-on-surface transition-colors text-xl">✕</button>
                            </div>
                            
                            <div className="text-center space-y-8">
                                <div className="space-y-2">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-md-secondary-container text-md-on-secondary-container rounded-full text-[10px] font-bold uppercase tracking-wider mb-2">
                                        <span>Social Loop</span>
                                    </div>
                                    <h3 className="text-3xl font-bold text-md-on-surface">Invite Buddies</h3>
                                    <p className="text-md-on-surface-variant text-sm">Select a friend to challenge in this arena.</p>
                                </div>

                                <div className="max-h-[340px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                                    {friends.length === 0 ? (
                                        <div className="py-12 flex flex-col items-center gap-4 opacity-40">
                                            <span className="text-5xl">󰄱</span>
                                            <p className="text-xs font-bold uppercase tracking-widest">No friends online</p>
                                        </div>
                                    ) : friends.map(f => (
                                        <div key={f.id} className="flex items-center justify-between p-4 bg-md-surface-variant/10 rounded-[1.5rem] border border-md-outline/5 hover:border-md-primary/20 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-md-primary/10 flex items-center justify-center text-sm font-bold text-md-primary">
                                                    {f.username?.[0].toUpperCase() || '?'}
                                                </div>
                                                <span className="text-sm font-semibold text-md-on-surface truncate max-w-[140px]">{f.username}</span>
                                            </div>
                                            <button 
                                                onClick={() => sendInvite(f.id)}
                                                disabled={invitingId === f.id}
                                                className={`px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${invitingId === f.id ? 'bg-md-success text-white' : 'bg-md-on-surface text-md-surface hover:opacity-90'}`}
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
            </ScreenShake>
        </div>
    );
}
