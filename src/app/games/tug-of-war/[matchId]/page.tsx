'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { music } from '../../../../lib/music';
import Rope from '../../../../components/TugOfWar/Rope';
import QuestionArena from '../../../../components/TugOfWar/QuestionArena';

export default function TugOfWarGame() {
    const params = useParams();
    const matchId = params.matchId as string;
    const router = useRouter();
    const [supabase] = useState(() => createClient());
    
    const [user, setUser] = useState<any>(null);
    const [match, setMatch] = useState<any>(null);
    const [questions, setQuestions] = useState<any[]>([]);
    const [opponentProfile, setOpponentProfile] = useState<any>(null);
    const [myProfile, setMyProfile] = useState<any>(null);
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => { setIsMuted(music.isMuted()); }, []);

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
                setOpponentProfile(profileRows.find((p: any) => p.id === oppId));
            }

            // Fetch questions
            const myConfig = data.p1_id === session.user.id ? data.p1_config : data.p2_config;
            if (myConfig) {
                const { data: qData } = await supabase
                    .from('questions')
                    .select('*')
                    .eq('subject', myConfig.subject)
                    .eq('difficulty', myConfig.difficulty)
                    .limit(20);
                setQuestions(qData || []);
            }
        })();
    }, [matchId, supabase, router]);

    // Real-time Sync
    useEffect(() => {
        if (!matchId) return;
        
        const channel = supabase
            .channel(`tug-of-war-${matchId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tug_of_war_matches', filter: `id=eq.${matchId}` }, (payload) => {
                setMatch(payload.new as any);
                
                // If opponent joined, fetch their profile
                if (!opponentProfile && (payload.new.p1_id || payload.new.p2_id)) {
                    const oppId = payload.new.p1_id === user?.id ? payload.new.p2_id : payload.new.p1_id;
                    if (oppId) {
                        supabase.from('profiles').select('id, username, avatar_url').eq('id', oppId).single().then(({ data }) => {
                            if (data) setOpponentProfile(data);
                        });
                    }
                }

                // If questions are empty and config is now available
                if (questions.length === 0) {
                    const myConfig = payload.new.p1_id === user?.id ? payload.new.p1_config : payload.new.p2_config;
                    if (myConfig) {
                        supabase.from('questions').select('*').eq('subject', myConfig.subject).eq('difficulty', myConfig.difficulty).limit(20).then(({ data }) => {
                            if (data) setQuestions(data);
                        });
                    }
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [matchId, supabase, user, opponentProfile, questions.length]);

    const handleCorrectAnswer = async (impact: number) => {
        if (!match || match.status !== 'active') return;
        
        // Optimistic UI could go here, but RPC is fast enough for now
        const { error } = await supabase.rpc('tow_tug_rope', { 
            p_match_id: matchId, 
            p_impact: impact 
        });

        if (error) {
            console.error('Tug failed:', error.message);
        } else {
            music.playMoveSound();
        }
    };

    const toggleMute = () => setIsMuted(music.toggleMute());

    if (!match || !user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white italic tracking-widest text-sm animate-pulse">Initializing Arena...</div>;

    const isP1 = user.id === match.p1_id;
    const myConfig = isP1 ? match.p1_config : match.p2_config;

    return (
        <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8 flex flex-col items-center relative overflow-hidden">
            {/* Ambient Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[20%] left-[20%] w-[300px] h-[300px] bg-purple-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-[20%] right-[20%] w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[100px]" />
            </div>

            <nav className="z-10 w-full max-w-4xl flex justify-between items-center mb-8">
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
                            className="flex flex-col items-center text-center gap-6 p-12 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[3rem]"
                        >
                            <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center text-4xl animate-pulse">📡</div>
                            <div>
                                <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-2">Awaiting Challenger</h2>
                                <p className="text-slate-400 text-sm font-medium mb-6">Opponent must enter code to stabilize the bridge.</p>
                                <div className="bg-black/40 border border-white/10 rounded-2xl p-6">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Arena Access Code</p>
                                    <p className="text-5xl font-black font-mono tracking-[0.2em] text-white">{match.join_code}</p>
                                </div>
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
        </main>
    );
}
