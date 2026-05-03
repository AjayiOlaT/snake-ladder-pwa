import { motion, useSpring, useTransform } from 'framer-motion';

interface RopeProps {
    position: number; // -100 to 100
}

export default function Rope({ position }: RopeProps) {
    // Spring physics for "Heavy" movement
    const smoothPos = useSpring(position, { stiffness: 60, damping: 15 });
    
    // Map -100..100 to movement
    // Winner pulls back by 10%, Loser dragged forward by 25%.
    const leftX = useTransform(smoothPos, (v) => v < 0 ? (v / 100) * 10 : (v / 100) * 35);
    const rightX = useTransform(smoothPos, (v) => v > 0 ? (v / 100) * 10 : (v / 100) * 35);
    const knotX = useTransform(smoothPos, (v) => `${((v + 100) / 200) * 100}%`);

    return (
        <div className="w-full h-40 md:h-56 relative flex items-center justify-center overflow-visible mb-6 md:mb-12">
            
            {/* The Main Track (War-torn) */}
            <div className="absolute inset-x-0 h-[1px] bg-white/20 blur-[1px]" />
            <div className="absolute inset-x-0 h-8 bg-black/20 skew-y-1" />

            {/* THE ACTUAL ROPE */}
            <motion.div 
                className="absolute h-3 md:h-4 bg-[#6b4423] shadow-[0_0_30px_rgba(0,0,0,0.5)] z-10"
                style={{
                    left: useTransform(leftX, (v) => `calc(15% + ${v}%)`),
                    right: useTransform(rightX, (v) => `calc(15% - ${v}%)`),
                    backgroundImage: 'repeating-linear-gradient(45deg, #8b5a2b, #8b5a2b 10px, #5c3a1b 10px, #5c3a1b 20px)'
                }}
            >
                {/* Friction Sparks (when moving) */}
                <motion.div 
                    className="absolute inset-0 bg-yellow-500/20 mix-blend-overlay"
                    animate={{ opacity: [0, 0.4, 0] }}
                    transition={{ repeat: Infinity, duration: 0.1 }}
                />

                {/* Center Knot (Metal Ring) */}
                <motion.div 
                    className="absolute top-1/2 -translate-y-1/2 w-10 h-10 md:w-14 md:h-14 z-20"
                    style={{ left: knotX, translateX: '-50%' }}
                >
                    <div className="w-full h-full rounded-full bg-slate-200 shadow-[0_0_40px_white] flex items-center justify-center border-4 border-slate-400">
                        <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-900 border-2 border-slate-500 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse shadow-[0_0_10px_red]" />
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {/* Player 1 (Challenger) */}
            <motion.div 
                className="absolute flex flex-col items-center gap-3 z-30"
                style={{ left: useTransform(leftX, (v) => `calc(15% + ${v}%)`), translateX: '-50%' }}
                animate={{ 
                    rotate: position < 0 ? -15 : 10,
                    y: position < 0 ? [0, -2, 0] : [0, 1, 0]
                }}
            >
                <div className={`
                    w-24 h-24 md:w-44 md:h-44 rounded-3xl md:rounded-[3rem] overflow-hidden border-4 transition-all duration-300
                    ${position < 0 ? 'border-purple-500 shadow-[0_0_60px_rgba(168,85,247,0.7)]' : 'border-white/10 opacity-60'}
                `}>
                    {/* Boy facing right */}
                    <img src="/tug-of-war/player-left.png" alt="P1" className="w-full h-full object-cover scale-x-[-1]" />
                </div>
                <div className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${position < 0 ? 'bg-purple-500 text-white' : 'bg-white/5 text-slate-500'}`}>
                    {position < 0 ? 'PUSHING BACK' : 'DRAGGED!'}
                </div>
            </motion.div>

            {/* Player 2 (Opponent) */}
            <motion.div 
                className="absolute flex flex-col items-center gap-3 z-30"
                style={{ right: useTransform(rightX, (v) => `calc(15% - ${v}%)`), translateX: '50%' }}
                animate={{ 
                    rotate: position > 0 ? 15 : -10,
                    y: position > 0 ? [0, -2, 0] : [0, 1, 0]
                }}
            >
                <div className={`
                    w-24 h-24 md:w-44 md:h-44 rounded-3xl md:rounded-[3rem] overflow-hidden border-4 transition-all duration-300
                    ${position > 0 ? 'border-indigo-500 shadow-[0_0_60px_rgba(99,102,241,0.7)]' : 'border-white/10 opacity-60'}
                `}>
                    {/* Man facing left */}
                    <img 
                        src="/tug-of-war/player-right.png" 
                        alt="P2" 
                        className="w-full h-full object-cover" 
                        style={{ transform: 'scaleX(-1)' }}
                    />
                </div>
                <div className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${position > 0 ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-500'}`}>
                    {position > 0 ? 'DOMINATING' : 'DRAGGED!'}
                </div>
            </motion.div>

            {/* Ground Dust (War atmosphere) */}
            <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-slate-950 to-transparent opacity-40 mix-blend-multiply" />
        </div>
    );
}

