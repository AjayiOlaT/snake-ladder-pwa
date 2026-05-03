import { motion, useSpring, useTransform, useMotionValue } from 'framer-motion';
import { useEffect } from 'react';

interface RopeProps {
    position: number; // -100 to 100
}

export default function Rope({ position }: RopeProps) {
    // Create a base motion value for the position
    const posValue = useMotionValue(position);

    // Update the motion value whenever the prop changes (Real-time Sync)
    useEffect(() => {
        posValue.set(position);
    }, [position, posValue]);

    // Spring physics for "Heavy" movement
    const smoothPos = useSpring(posValue, { stiffness: 60, damping: 20 });
    
    // Map -100..100 to movement
    // Winner pulls back by 10%, Loser dragged forward by 25%.
    const leftX = useTransform(smoothPos, (v) => v < 0 ? (v / 100) * 10 : (v / 100) * 35);
    const rightX = useTransform(smoothPos, (v) => v > 0 ? (v / 100) * 10 : (v / 100) * 35);
    const knotX = useTransform(smoothPos, (v) => `${((v + 100) / 200) * 100}%`);

    return (
        <div className="w-full h-48 md:h-64 relative flex items-center justify-center overflow-visible mb-6 md:mb-12">
            
            {/* PARK BACKGROUND SCENERY */}
            <div className="absolute inset-0 rounded-[2rem] md:rounded-[4rem] overflow-hidden shadow-2xl border-4 border-white/20">
                <img src="/tug-of-war/park-bg.png" alt="Park" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-green-900/20" />
            </div>

            {/* THE PLAYGROUND ROPE */}
            <motion.div 
                className="absolute h-4 md:h-6 z-10 rounded-full"
                style={{
                    left: useTransform(leftX, (v) => `calc(20% + ${v}%)`),
                    right: useTransform(rightX, (v) => `calc(20% - ${v}%)`),
                    backgroundColor: '#e6ccb2',
                    backgroundImage: 'repeating-linear-gradient(45deg, #ddb892, #ddb892 10px, #b08968 10px, #b08968 20px)',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.3)'
                }}
            />

            {/* FIXED CENTER MARKER (The Finish Line) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-12 md:w-10 md:h-14 z-20 pointer-events-none">
                <div className="w-full h-full bg-red-600 rounded-sm shadow-[0_0_20px_rgba(220,38,38,0.5)] border-2 border-red-400 opacity-90">
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-red-800/40" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-full bg-white/20" />
                </div>
            </div>

            {/* Player 1 (Kid Left) */}
            <motion.div 
                className="absolute flex flex-col items-center gap-1 z-30"
                style={{ left: useTransform(leftX, (v) => `calc(20% + ${v}%)`), translateX: '-50%' }}
                animate={{ 
                    rotate: position < 0 ? -8 : 4,
                    scale: position < 0 ? 1.05 : 1,
                }}
                transition={{ type: 'spring', stiffness: 50, damping: 20 }}
            >
                <div className="w-20 h-20 md:w-32 md:h-32 overflow-visible">
                    <img 
                        src="/tug-of-war/kid-left.png" 
                        alt="Kid 1" 
                        className={`w-full h-full object-contain transition-all duration-700 ${position < 0 ? 'opacity-100' : 'opacity-70'}`}
                        style={{ mixBlendMode: 'multiply', filter: 'contrast(1.3) brightness(1.1)' }}
                    />
                </div>
                <div className={`px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-md transition-colors duration-500 ${position < 0 ? 'bg-yellow-400 text-slate-900' : 'bg-white/40 text-slate-600'}`}>
                    {position < 0 ? 'PULLING!' : 'STAY STRONG!'}
                </div>
            </motion.div>

            {/* Player 2 (Kid Right) */}
            <motion.div 
                className="absolute flex flex-col items-center gap-1 z-30"
                style={{ right: useTransform(rightX, (v) => `calc(20% - ${v}%)`), translateX: '50%' }}
                animate={{ 
                    rotate: position > 0 ? 8 : -4,
                    scale: position > 0 ? 1.05 : 1,
                }}
                transition={{ type: 'spring', stiffness: 50, damping: 20 }}
            >
                <div className="w-20 h-20 md:w-32 md:h-32 overflow-visible">
                    <img 
                        src="/tug-of-war/kid-right.png" 
                        alt="Kid 2" 
                        className={`w-full h-full object-contain transition-all duration-700 ${position > 0 ? 'opacity-100' : 'opacity-70'}`}
                        style={{ mixBlendMode: 'multiply', filter: 'contrast(1.3) brightness(1.1)' }}
                    />
                </div>
                <div className={`px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-md transition-colors duration-500 ${position > 0 ? 'bg-yellow-400 text-slate-900' : 'bg-white/40 text-slate-600'}`}>
                    {position > 0 ? 'PULLING!' : 'STAY STRONG!'}
                </div>
            </motion.div>

            {/* Grass Overlay (Bottom) */}
            <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-green-900/40 to-transparent pointer-events-none" />
        </div>
    );
}

