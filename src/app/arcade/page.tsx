'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const games = [
    {
        id: 'snake-ladder',
        title: 'Neon Arena',
        subtitle: 'Snake & Ladders',
        description: 'Climb the cosmic ladders and avoid the neon serpents in this high-stakes multiplayer race.',
        color: 'from-indigo-600 to-teal-400',
        icon: '/neon-arena-thumb.png',
        path: '/games/snake-ladder/lobby',
        status: 'playable'
    },
    {
        id: 'number-duel',
        title: 'Number Duel',
        subtitle: 'The Guessing War',
        description: 'A mental battle of deduction. Pick a number, outsmart your opponent, and guess theirs first.',
        color: 'from-rose-600 to-amber-500',
        icon: '/number-duel-thumb.png',
        path: '/games/number-duel/lobby',
        status: 'coming-soon'
    }
];

export default function ArcadePage() {
    const [supabase] = useState(() => createClient());
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                setUser(session.user);
            } else if (event === 'INITIAL_SESSION' && !session) {
                router.replace('/login');
            }
        });
        return () => authListener.subscription.unsubscribe();
    }, [supabase, router]);

    if (!user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Initializing System...</div>;

    const activeGame = games[activeIndex];

    return (
        <main className="min-h-screen bg-slate-950 text-white selection:bg-indigo-500/30 overflow-y-auto relative">
            {/* Ambient Background */}
            <div className={`fixed inset-0 transition-colors duration-1000 bg-gradient-to-br ${activeGame.id === 'snake-ladder' ? 'from-indigo-950/40 via-slate-950 to-teal-950/40' : 'from-rose-950/40 via-slate-950 to-amber-950/40'}`}>
                <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[150px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-teal-500/10 rounded-full blur-[150px] animate-pulse" />
            </div>

            <div className="relative z-10 container mx-auto min-h-screen flex flex-col p-5 md:p-12">
                {/* Top Navigation */}
                <nav className="flex justify-between items-center mb-12">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center font-black text-xl italic text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-teal-400">
                            A
                        </div>
                        <h2 className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">Neural Arcade v2.0</h2>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="hidden md:block text-right">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Operator</p>
                            <p className="text-xs font-black text-indigo-300">{user?.user_metadata?.full_name || user?.email}</p>
                        </div>
                        <button onClick={() => router.push('/profile')} className="w-10 h-10 rounded-full border-2 border-white/20 overflow-hidden hover:border-indigo-400 transition-all">
                            <img src={user?.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.id}`} alt="Profile" />
                        </button>
                    </div>
                </nav>

                {/* Main Content: Game Selector */}
                <div className="flex-1 flex flex-col md:flex-row items-center gap-12">
                    {/* Left Side: Game Visual & Selection */}
                    <div className="w-full md:w-1/2 flex flex-col gap-6 order-2 md:order-1">
                        {/* Improved Game Selector */}
                        <div className="inline-flex p-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl mb-2 self-start">
                            {games.map((g, idx) => (
                                <button 
                                    key={g.id}
                                    onClick={() => setActiveIndex(idx)}
                                    className={`relative px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 overflow-hidden ${activeIndex === idx ? 'text-slate-950 translate-z-0' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {activeIndex === idx && (
                                        <motion.div 
                                            layoutId="activeTab"
                                            className="absolute inset-0 bg-white shadow-[0_0_20px_rgba(255,255,255,0.4)]"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}
                                    <span className="relative z-10">{g.title}</span>
                                </button>
                            ))}
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.div 
                                key={activeGame.id}
                                initial={{ opacity: 0, x: -30 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                className="flex flex-col gap-4"
                            >
                                <div className="flex items-center gap-3">
                                    <h3 className={`text-[10px] md:text-xs font-black uppercase tracking-[0.4em] text-transparent bg-clip-text bg-gradient-to-r ${activeGame.color}`}>
                                        {activeGame.subtitle}
                                    </h3>
                                    <div className={`h-[1px] flex-1 bg-gradient-to-r ${activeGame.color} opacity-20`} />
                                </div>
                                <h1 className="text-4xl md:text-7xl font-black leading-[0.9] group">
                                    {activeGame.title.split(' ').map((word, i) => (
                                        <span key={i} className="block group-hover:italic transition-all duration-300">{word}</span>
                                    ))}
                                </h1>
                                <p className="text-slate-400 text-sm md:text-lg max-w-sm font-medium leading-relaxed mt-1 md:mt-4">
                                    {activeGame.description}
                                </p>

                                <div className="mt-8 flex flex-col gap-6 w-full">
                                    <button 
                                        onClick={() => activeGame.status === 'playable' && router.push(activeGame.path)}
                                        disabled={activeGame.status !== 'playable'}
                                        className={`w-full sm:w-auto px-8 py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all relative group overflow-hidden ${activeGame.status === 'playable' ? 'bg-white text-slate-950 hover:scale-[1.02] active:scale-95 shadow-[0_0_50px_rgba(255,255,255,0.2)]' : 'bg-white/5 text-slate-700 cursor-not-allowed border border-white/5'}`}
                                    >
                                        <span className="relative z-10">{activeGame.status === 'playable' ? 'Launch Game' : 'In Dev...'}</span>
                                        {activeGame.status === 'playable' && (
                                            <div className={`absolute inset-0 bg-gradient-to-r ${activeGame.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
                                        )}
                                    </button>
                                    
                                    <div className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-full self-start">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">System Status:</span>
                                        <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${activeGame.status === 'playable' ? 'text-teal-400' : 'text-amber-500'}`}>
                                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                                            {activeGame.status === 'playable' ? 'Operational' : 'Syncing'}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Right Side: Visual Accent */}
                    <div className="w-full md:w-1/2 flex items-center justify-center relative py-12 md:py-0">
                        <AnimatePresence mode="wait">
                            <motion.div 
                                key={activeGame.id}
                                initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                exit={{ opacity: 0, scale: 1.2, rotate: 10 }}
                                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                                className={`w-52 h-52 md:w-80 md:h-80 rounded-[2.5rem] md:rounded-[3rem] bg-gradient-to-br ${activeGame.color} shadow-[0_0_100px_rgba(0,0,0,0.5)] flex items-center justify-center text-9xl relative group`}
                            >
                                <div className="absolute inset-4 rounded-[2rem] border-2 border-white/20 glass-effect" />
                                <img 
                                    src={activeGame.icon} 
                                    alt={activeGame.title}
                                    className="w-4/5 h-4/5 object-contain drop-shadow-[0_0_30px_rgba(255,255,255,0.4)] group-hover:scale-110 transition-transform duration-500"
                                />
                                
                                {/* Floating Particles */}
                                <div className="absolute -top-10 -right-10 w-20 h-20 bg-white/10 rounded-full blur-2xl animate-pulse" />
                                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/5 rounded-full blur-3xl animate-pulse" />
                            </motion.div>
                        </AnimatePresence>

                        {/* Scanner Lines Accent */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
                            <div className="w-full h-[1px] bg-white animate-scan" />
                        </div>
                    </div>
                </div>

                {/* Bottom Stats / Footer */}
                <footer className="mt-auto py-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-1">
                        <div className="px-6 py-3 border-r border-white/10 flex items-center gap-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Latency</p>
                            <p className="text-xs font-black text-white uppercase tabular-nums tracking-widest">24ms</p>
                        </div>
                        <div className="px-6 py-3 flex items-center gap-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Node</p>
                            <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Connected</p>
                        </div>
                    </div>

                    <button 
                        onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
                        className="group flex items-center gap-3 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all border border-transparent hover:border-white/10 hover:bg-white/5 rounded-xl"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 group-hover:animate-ping" />
                        Terminate Link
                    </button>
                </footer>
            </div>

            <style jsx>{`
                .glass-effect {
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(10px);
                }
                @keyframes scan {
                    0% { transform: translateY(-100vh); }
                    100% { transform: translateY(100vh); }
                }
                .animate-scan {
                    animation: scan 4s linear infinite;
                }
            `}</style>
        </main>
    );
}
