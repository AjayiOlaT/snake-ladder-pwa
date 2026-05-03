'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { music } from '../../../../lib/music';
import Rope from '../../../../components/TugOfWar/Rope';
import QuestionArena from '../../../../components/TugOfWar/QuestionArena';

export default function LocalTugOfWar() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-sky-400 flex items-center justify-center text-slate-900 italic font-black uppercase tracking-widest animate-pulse">Prepping Local Arena...</div>}>
            <LocalArenaContent />
        </Suspense>
    );
}

function LocalArenaContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [supabase] = useState(() => createClient());
    
    const [ropePos, setRopePos] = useState(0);
    const [questions, setQuestions] = useState<any[]>([]);
    const [status, setStatus] = useState<'active' | 'finished'>('active');
    const [winner, setWinner] = useState<number | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [showQuitConfirm, setShowQuitConfirm] = useState(false);

    const subject = searchParams.get('subject') || 'Math';
    const difficulty = searchParams.get('difficulty') || 'easy';
    const multiplier = difficulty === 'hard' ? 3.0 : difficulty === 'medium' ? 2.0 : 1.0;

    useEffect(() => {
        setIsMuted(music.isMuted());
        fetchQuestions();
    }, []);

    const fetchQuestions = async () => {
        const { data } = await supabase
            .from('questions')
            .select('*')
            .eq('subject', subject)
            .eq('difficulty', difficulty)
            .limit(100);
        
        if (data) {
            // Shuffle
            const shuffled = [...data].sort(() => Math.random() - 0.5);
            setQuestions(shuffled);
        }
    };

    const handlePull = (player: 1 | 2) => {
        if (status !== 'active') return;

        const impact = 12.5; // Base movement
        setRopePos(prev => {
            const next = player === 1 ? prev - impact : prev + impact;
            
            if (next <= -100) {
                setStatus('finished');
                setWinner(1);
                return -100;
            }
            if (next >= 100) {
                setStatus('finished');
                setWinner(2);
                return 100;
            }
            return next;
        });

        music.playMoveSound();
    };

    const toggleMute = () => setIsMuted(music.toggleMute());

    return (
        <div className="min-h-screen bg-sky-400 text-slate-900 overflow-hidden relative">
            {/* Park Atmosphere Background */}
            <div className="fixed inset-0 bg-gradient-to-b from-sky-400 via-sky-300 to-green-100 pointer-events-none" />
            
            {/* Main Game Container */}
            <div className="relative z-10 w-full max-w-7xl mx-auto px-4 py-6 flex flex-col gap-8 items-center h-screen">
                
                {/* Header */}
                <nav className="w-full flex justify-between items-center bg-white/20 backdrop-blur-md p-4 rounded-3xl border border-white/40 shadow-lg shrink-0">
                    <div className="flex flex-col">
                        <h2 className="text-[10px] font-black text-sky-700 uppercase tracking-[0.3em]">Local Duel</h2>
                        <h1 className="text-xl font-black italic tracking-tighter uppercase text-slate-800">The Sunny Arena</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={toggleMute} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-md hover:bg-white/10 transition-colors">
                            {isMuted ? '🔇' : '🔊'}
                        </button>
                        <button onClick={() => setShowQuitConfirm(true)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white hover:border-red-400 transition-all active:scale-95">
                            Quit
                        </button>
                    </div>
                </nav>

                {/* The Rope */}
                <div className="w-full max-w-4xl shrink-0">
                    <Rope position={ropePos} />
                </div>

                {/* DUAL ARENAS */}
                <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden pb-6">
                    {/* Player 1 (Left/Top) */}
                    <div className="flex flex-col gap-4 items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-white font-black">1</div>
                            <span className="font-black uppercase tracking-widest text-xs text-sky-800">Player One</span>
                        </div>
                        <div className="w-full transform transition-all hover:scale-[1.01]">
                            <QuestionArena 
                                questions={questions.slice(0, questions.length / 2)}
                                onCorrect={() => handlePull(1)}
                                multiplier={multiplier}
                                disabled={status !== 'active'}
                                compact
                            />
                        </div>
                    </div>

                    {/* Player 2 (Right/Bottom) */}
                    <div className="flex flex-col gap-4 items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-black">2</div>
                            <span className="font-black uppercase tracking-widest text-xs text-orange-800">Player Two</span>
                        </div>
                        <div className="w-full transform transition-all hover:scale-[1.01]">
                            <QuestionArena 
                                questions={questions.slice(questions.length / 2)}
                                onCorrect={() => handlePull(2)}
                                multiplier={multiplier}
                                disabled={status !== 'active'}
                                compact
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Victory Modal */}
            <AnimatePresence>
                {status === 'finished' && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="relative w-full max-w-sm bg-white rounded-[3rem] p-10 shadow-2xl border-4 border-sky-100 flex flex-col items-center text-center gap-8"
                        >
                            <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center text-5xl animate-bounce shadow-inner">
                                👑
                            </div>
                            <div>
                                <h2 className="text-4xl font-black text-slate-800 tracking-tighter uppercase mb-2 italic">Victory!</h2>
                                <p className="text-slate-500 font-medium">Player {winner} has claimed the park!</p>
                            </div>
                            <button 
                                onClick={() => router.push('/games/tug-of-war/lobby')}
                                className="w-full py-5 rounded-2xl bg-sky-500 text-white font-black uppercase tracking-widest shadow-lg shadow-sky-200 hover:bg-sky-600 active:scale-[0.98] transition-all"
                            >
                                Play Again
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* QUIT CONFIRMATION MODAL */}
            <AnimatePresence>
                {showQuitConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowQuitConfirm(false)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-sm bg-white rounded-[3rem] p-8 shadow-2xl border-4 border-sky-100 flex flex-col items-center text-center gap-6"
                        >
                            <div className="w-20 h-20 bg-sky-50 rounded-full flex items-center justify-center text-4xl mb-2">
                                🏃‍♂️
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase mb-2">Quit Match?</h3>
                                <p className="text-slate-500 font-medium">Both players will lose their progress.</p>
                            </div>
                            <div className="flex flex-col w-full gap-3">
                                <button 
                                    onClick={() => setShowQuitConfirm(false)}
                                    className="w-full py-4 rounded-2xl bg-sky-500 text-white font-black uppercase tracking-widest shadow-lg shadow-sky-200 hover:bg-sky-600 active:scale-[0.98] transition-all"
                                >
                                    Stay & Play
                                </button>
                                <button 
                                    onClick={() => router.push('/arcade')}
                                    className="w-full py-4 rounded-2xl bg-slate-100 text-slate-500 font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-500 active:scale-[0.98] transition-all"
                                >
                                    I'm Done
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
