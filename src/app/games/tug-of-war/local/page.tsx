'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { music } from '../../../../lib/music';
import Rope from '../../../../components/TugOfWar/Rope';
import QuestionArena from '../../../../components/TugOfWar/QuestionArena';
import { ScreenShake } from '../../../../components/TugOfWar/TugEffects';

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

    const shakeRef = useRef<any>(null);

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

        // Trigger Screen Shake based on difficulty multiplier
        if (shakeRef.current) {
            shakeRef.current.shake(multiplier);
        }

        music.playMoveSound();
    };

    const toggleMute = () => setIsMuted(music.toggleMute());

    return (
        <div className="min-h-screen bg-md-surface text-md-on-surface overflow-hidden relative">
            {/* Subtle Gradient Background */}
            <div className="fixed inset-0 bg-gradient-to-b from-md-primary/5 via-md-surface to-md-surface pointer-events-none" />
            
            {/* Main Game Container wrapped in ScreenShake */}
            <ScreenShake ref={shakeRef}>
                <div className="relative z-10 w-full max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4 items-center h-screen overflow-hidden">
                    
                    {/* Header */}
                    <nav className="w-full flex justify-between items-center bg-md-surface/40 backdrop-blur-md p-4 md:p-6 rounded-[2.5rem] border border-md-outline/10 shadow-sm shrink-0">
                        <div className="flex flex-col">
                            <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-md-secondary-container text-md-on-secondary-container rounded-full text-[9px] font-bold uppercase tracking-wider mb-1 w-fit">
                                <span>Local Duel</span>
                            </div>
                            <h1 className="text-lg md:text-xl font-bold tracking-tight text-md-on-surface">The Rope Battle</h1>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={toggleMute} className="w-12 h-12 rounded-full bg-md-surface-variant/30 flex items-center justify-center hover:bg-md-surface-variant/50 transition-colors">
                                <span className="text-xl">{isMuted ? '󰝟' : '󰕾'}</span>
                            </button>
                            <button onClick={() => setShowQuitConfirm(true)} className="px-4 py-2 bg-md-error/10 text-md-error rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-md-error hover:text-white transition-all">
                                Exit
                            </button>
                        </div>
                    </nav>

                    {/* The Rope */}
                    <div className="w-full max-w-5xl shrink-0 px-4 scale-95 md:scale-100">
                        <Rope position={ropePos} />
                    </div>

                    {/* DUAL ARENAS */}
                    <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 overflow-hidden pb-6">
                        {/* Player 1 (Left/Top) */}
                        <div className="flex flex-col gap-2 items-center">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-md-primary/10 rounded-full border border-md-primary/10">
                                <div className="w-5 h-5 rounded-full bg-md-primary text-md-on-primary flex items-center justify-center text-[9px] font-bold">1</div>
                                <span className="font-bold uppercase tracking-wider text-[9px] text-md-primary">Player One</span>
                            </div>
                            <div className="w-full flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-[2.5rem]">
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
                        <div className="flex flex-col gap-2 items-center">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-md-secondary/10 rounded-full border border-md-secondary/10">
                                <div className="w-5 h-5 rounded-full bg-md-secondary text-md-on-secondary flex items-center justify-center text-[9px] font-bold">2</div>
                                <span className="font-bold uppercase tracking-wider text-[9px] text-md-secondary">Player Two</span>
                            </div>
                            <div className="w-full flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-[2.5rem]">
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
            </ScreenShake>

            {/* Victory Modal */}
            <AnimatePresence>
                {status === 'finished' && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="absolute inset-0 bg-md-on-surface/40 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="relative w-full max-w-sm bg-md-surface rounded-[3rem] p-12 shadow-2xl flex flex-col items-center text-center gap-8"
                        >
                            <div className="w-24 h-24 bg-md-primary/10 text-md-primary rounded-[2rem] flex items-center justify-center text-6xl animate-bounce">
                                🏆
                            </div>
                            <div>
                                <h2 className="text-4xl font-bold text-md-on-surface mb-2">Victory!</h2>
                                <p className="text-md-on-surface-variant text-sm">Player {winner} has claimed the arena!</p>
                            </div>
                            <button 
                                onClick={() => router.push('/games/tug-of-war/lobby')}
                                className="w-full py-5 rounded-2xl bg-md-primary text-md-on-primary font-bold text-sm tracking-wide shadow-lg shadow-md-primary/20 hover:opacity-90 active:scale-[0.98] transition-all"
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
                                <h3 className="text-2xl font-bold text-md-on-surface mb-2">Quit Match?</h3>
                                <p className="text-md-on-surface-variant text-sm">Progress for both players will be lost. Are you sure you want to exit?</p>
                            </div>
                            <div className="flex flex-col w-full gap-3">
                                <button 
                                    onClick={() => setShowQuitConfirm(false)}
                                    className="w-full py-4 rounded-2xl bg-md-primary text-md-on-primary font-bold text-sm tracking-wide shadow-lg shadow-md-primary/20 hover:opacity-90 transition-all"
                                >
                                    Stay & Play
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
        </div>
    );
}
