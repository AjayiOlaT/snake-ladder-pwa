'use client';

import { motion } from 'framer-motion';

interface RopeProps {
    position: number; // -100 to 100
}

export default function Rope({ position }: RopeProps) {
    // Map -100..100 to 0%..100%
    const percentage = ((position + 100) / 200) * 100;

    return (
        <div className="w-full h-32 relative flex items-center justify-center overflow-hidden">
            {/* The Track */}
            <div className="absolute inset-x-0 h-1 bg-white/10" />

            {/* The Rope */}
            <motion.div 
                className="absolute h-2 bg-gradient-to-r from-purple-500 via-white to-indigo-500 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)]"
                initial={false}
                animate={{ 
                    left: `${percentage}%`,
                    width: '300px', // Fixed length rope segment that slides
                    translateX: '-50%' 
                }}
                transition={{ type: 'spring', stiffness: 100, damping: 20 }}
            >
                {/* Knot / Center Indicator */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-[0_0_30px_white] flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-slate-950 animate-pulse" />
                </div>

                {/* Tension Lines */}
                <div className="absolute -top-4 -bottom-4 left-0 w-[1px] bg-white/20 blur-sm" />
                <div className="absolute -top-4 -bottom-4 right-0 w-[1px] bg-white/20 blur-sm" />
            </motion.div>

            {/* Players Indicators */}
            <motion.div 
                className="absolute left-4 md:left-20 flex flex-col items-center gap-3"
                animate={{ 
                    x: position > 0 ? [0, 2, 0] : [0, -1, 0],
                    scale: position < 0 ? 1.1 : 1
                }}
                transition={{ repeat: Infinity, duration: 0.15 }}
            >
                <div className="w-20 h-20 md:w-28 md:h-28 rounded-[2rem] overflow-hidden border-2 border-purple-500/30 shadow-[0_0_40px_rgba(168,85,247,0.3)] bg-slate-900/50 backdrop-blur-xl group">
                    <img src="/tug-of-war/player-left.png" alt="Player 1" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 scale-x-[-1]" />
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-400">CHALLENGER</span>
                    <div className="h-1 w-12 bg-purple-500/20 rounded-full mt-1 overflow-hidden">
                        <motion.div 
                            className="h-full bg-purple-500" 
                            animate={{ width: position < 0 ? '100%' : '30%' }}
                        />
                    </div>
                </div>
            </motion.div>

            <motion.div 
                className="absolute right-4 md:right-20 flex flex-col items-center gap-3"
                animate={{ 
                    x: position < 0 ? [0, -2, 0] : [0, 1, 0],
                    scale: position > 0 ? 1.1 : 1
                }}
                transition={{ repeat: Infinity, duration: 0.15 }}
            >
                <div className="w-20 h-20 md:w-28 md:h-28 rounded-[2rem] overflow-hidden border-2 border-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.3)] bg-slate-900/50 backdrop-blur-xl group">
                    <img src="/tug-of-war/player-right.png" alt="Player 2" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 scale-x-[-1]" />
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">OPPONENT</span>
                    <div className="h-1 w-12 bg-indigo-500/20 rounded-full mt-1 overflow-hidden">
                        <motion.div 
                            className="h-full bg-indigo-500" 
                            animate={{ width: position > 0 ? '100%' : '30%' }}
                        />
                    </div>
                </div>
            </motion.div>

            {/* Win Zones */}
            <div className="absolute left-0 top-0 bottom-0 w-4 bg-purple-500/10 border-r border-purple-500/20" />
            <div className="absolute right-0 top-0 bottom-0 w-4 bg-indigo-500/10 border-l border-indigo-500/20" />
        </div>
    );
}
