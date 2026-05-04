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
    // Winner pulls back by 15%, Loser dragged forward by 30%.
    const leftX = useTransform(smoothPos, (v) => v < 0 ? (v / 100) * 15 : (v / 100) * 45);
    const rightX = useTransform(smoothPos, (v) => v > 0 ? (v / 100) * 15 : (v / 100) * 45);
    const knotX = useTransform(smoothPos, (v) => `${((v + 100) / 200) * 100}%`);

    return (
        <div className="w-full h-40 md:h-52 relative flex items-center justify-center overflow-visible mb-4 md:mb-8">
            
            {/* STYLIZED BACKGROUND SCENERY */}
            <div className="absolute inset-0 rounded-[2.5rem] md:rounded-[3.5rem] overflow-hidden bg-md-surface-variant/10 border border-md-outline/5 shadow-inner">
                <div className="absolute inset-0 bg-gradient-to-br from-md-primary/5 via-transparent to-md-secondary/5" />
                {/* Clean Horizon Line */}
                <div className="absolute bottom-[30%] inset-x-0 h-px bg-md-outline/10" />
            </div>

            {/* THE REAL BRAIDED ROPE */}
            <motion.div 
                className="absolute h-3 md:h-4 z-10"
                style={{
                    left: useTransform(leftX, (v) => `calc(8% + ${v}%)`),
                    right: useTransform(rightX, (v) => `calc(8% - ${v}%)`),
                    background: `repeating-linear-gradient(
                        -45deg,
                        #d2b48c,
                        #d2b48c 8px,
                        #c4a484 8px,
                        #c4a484 16px,
                        #b08d57 16px,
                        #b08d57 20px
                    )`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.2)',
                    borderRadius: '2px'
                }}
            >
                {/* Rope Texture Overlay */}
                <div className="absolute inset-0 opacity-30 mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/canvas-orange.png')]" />
            </motion.div>

            {/* FIXED CENTER MARKER */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 md:w-1.5 md:h-16 z-20 pointer-events-none bg-md-outline/20 rounded-full">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-md-error shadow-lg" />
            </div>

            {/* Player 1 (Kid Left) */}
            <motion.div 
                className="absolute flex flex-col items-center gap-2 z-30"
                style={{ left: useTransform(leftX, (v) => `calc(8% + ${v}%)`), translateX: '-50%' }}
                animate={{ 
                    rotate: position < 0 ? -8 : 2,
                    scale: position < 0 ? 1.02 : 0.95,
                    y: position < 0 ? -2 : 0
                }}
                transition={{ type: 'spring', stiffness: 50, damping: 20 }}
            >
                <div className="w-20 h-20 md:w-32 md:h-32 overflow-visible relative">
                    <img 
                        src="/tug-of-war/kid-left.png" 
                        alt="Kid 1" 
                        className={`w-full h-full object-contain transition-all duration-700 ${position < 0 ? 'drop-shadow-[0_10px_15px_rgba(0,0,0,0.2)]' : 'opacity-90 grayscale-[20%]'}`}
                    />
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider shadow-sm transition-all duration-500 ${position < 0 ? 'bg-md-primary text-white' : 'bg-md-surface-variant/50 text-md-on-surface-variant'}`}>
                    {position < 0 ? 'Winning!' : 'Hold on!'}
                </div>
            </motion.div>

            {/* Player 2 (Kid Right) */}
            <motion.div 
                className="absolute flex flex-col items-center gap-2 z-30"
                style={{ right: useTransform(rightX, (v) => `calc(8% - ${v}%)`), translateX: '50%' }}
                animate={{ 
                    rotate: position > 0 ? 8 : -2,
                    scale: position > 0 ? 1.02 : 0.95,
                    y: position > 0 ? -2 : 0
                }}
                transition={{ type: 'spring', stiffness: 50, damping: 20 }}
            >
                <div className="w-20 h-20 md:w-32 md:h-32 overflow-visible relative">
                    <img 
                        src="/tug-of-war/kid-right.png" 
                        alt="Kid 2" 
                        className={`w-full h-full object-contain transition-all duration-700 ${position > 0 ? 'drop-shadow-[0_10px_15px_rgba(0,0,0,0.2)]' : 'opacity-90 grayscale-[20%]'}`}
                    />
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider shadow-sm transition-all duration-500 ${position > 0 ? 'bg-md-primary text-white' : 'bg-md-surface-variant/50 text-md-on-surface-variant'}`}>
                    {position > 0 ? 'Winning!' : 'Hold on!'}
                </div>
            </motion.div>

            {/* Shadows under kids */}
            <motion.div 
                className="absolute bottom-6 left-0 w-16 h-2 bg-black/10 blur-md rounded-full -z-10"
                style={{ left: useTransform(leftX, (v) => `calc(8% + ${v}%)`), translateX: '-50%' }}
            />
            <motion.div 
                className="absolute bottom-6 right-0 w-16 h-2 bg-black/10 blur-md rounded-full -z-10"
                style={{ right: useTransform(rightX, (v) => `calc(8% - ${v}%)`), translateX: '50%' }}
            />
        </div>
    );
}

