import { motion, useSpring, useTransform, useMotionValue, animate } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import { DustParticles } from './TugEffects';

interface RopeProps {
    position: number; // -100 to 100
}

export default function Rope({ position }: RopeProps) {
    const posValue = useMotionValue(position);
    const [lastPull, setLastPull] = useState<'left' | 'right' | null>(null);
    const prevPos = useRef(position);
    
    // Tension state for instant rope straightening
    const tension = useMotionValue(0);

    useEffect(() => {
        posValue.set(position);
        if (position !== prevPos.current) {
            const dir = position < prevPos.current ? 'left' : 'right';
            setLastPull(dir);
            prevPos.current = position;

            // Spike tension instantly on pull, then decay
            tension.set(1);
            animate(tension, 0, { duration: 0.6, ease: "easeOut" });
        }
    }, [position, posValue, tension]);

    // Technical Constraint: stiffness: 300, damping: 20
    const smoothPos = useSpring(posValue, { stiffness: 300, damping: 20 });
    
    // Wider range for 'Long Draw'
    const leftX = useTransform(smoothPos, (v) => v < 0 ? (v / 100) * 15 : (v / 100) * 45);
    const rightX = useTransform(smoothPos, (v) => v > 0 ? (v / 100) * 15 : (v / 100) * 45);

    // SVG Rope Sag Dynamics
    // Resting sag is 15. Tension reduces it to 2.
    const sag = useTransform(tension, [0, 1], [15, 2]);

    // SVG Path calculation
    const pathData = useTransform([smoothPos, sag], ([p, s]) => {
        const x1 = 8 + (p < 0 ? (p / 100) * 15 : (p / 100) * 45); // Left anchor
        const x2 = 92 - (p > 0 ? (p / 100) * 15 : (p / 100) * 45); // Right anchor
        const midX = (x1 + x2) / 2;
        const midY = 50 + (s as number);
        // Use unitless coordinates for SVG path
        return `M ${x1} 50 Q ${midX} ${midY} ${x2} 50`;
    });

    // Strain Calculation Logic
    const getStrainStyles = (player: 'left' | 'right') => {
        const isWinner = (player === 'left' && position < 0) || (player === 'right' && position > 0);
        const isStruggling = (player === 'left' && position > 0) || (player === 'right' && position < 0);

        if (isWinner) {
            return {
                y: [0, -6, 0],
                scale: 1.05,
                rotate: player === 'left' ? -8 : 8,
                skewX: 0,
                filter: 'brightness(1.1) saturate(1.1)'
            };
        }
        if (isStruggling) {
            return {
                rotate: player === 'left' ? 12 : -12,
                skewX: player === 'left' ? [0, 2, -2, 0] : [0, -2, 2, 0],
                scale: 0.95,
                y: 0,
                x: [-1, 1, -1, 1, 0], // Vibration
                filter: 'brightness(0.9) saturate(1.2)' // Visual "strain"
            };
        }
        return { y: 0, scale: 1, rotate: 0, skewX: 0, x: 0, filter: 'none' };
    };

    return (
        <div className="w-full h-40 md:h-52 relative flex items-center justify-center overflow-visible mb-4 md:mb-8">
            
            {/* STYLIZED BACKGROUND SCENERY */}
            <div className="absolute inset-0 rounded-[2.5rem] md:rounded-[3.5rem] overflow-hidden bg-md-surface-variant/10 border border-md-outline/5 shadow-inner">
                <div className="absolute inset-0 bg-gradient-to-br from-md-primary/5 via-transparent to-md-secondary/5" />
                <div className="absolute bottom-[30%] inset-x-0 h-px bg-md-outline/10" />
            </div>

            {/* KINETIC SVG ROPE */}
            <svg 
                viewBox="0 0 100 100" 
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full z-10 pointer-events-none overflow-visible"
            >
                <filter id="rope-shadow">
                    <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.3"/>
                </filter>
                <motion.path
                    d={pathData}
                    stroke="#b08d57"
                    strokeWidth="1.5"
                    fill="transparent"
                    strokeLinecap="round"
                    style={{ filter: 'url(#rope-shadow)' }}
                />
                <motion.path
                    d={pathData}
                    stroke="url(#rope-pattern)"
                    strokeWidth="1.5"
                    fill="transparent"
                    strokeLinecap="round"
                    strokeDasharray="1 0.5"
                />
                <defs>
                    <linearGradient id="rope-pattern" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#d2b48c" />
                        <stop offset="50%" stopColor="#c4a484" />
                        <stop offset="100%" stopColor="#d2b48c" />
                    </linearGradient>
                </defs>
            </svg>

            {/* FIXED CENTER MARKER */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 md:w-1.5 md:h-16 z-20 pointer-events-none bg-md-outline/10 rounded-full">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-md-error shadow-lg" />
            </div>

            {/* Player 1 (Kid Left) */}
            <motion.div 
                className="absolute flex flex-col items-center gap-2 z-30"
                style={{ left: useTransform(leftX, (v) => `calc(8% + ${v}%)`), translateX: '-50%' }}
                animate={getStrainStyles('left')}
                transition={{
                    y: { repeat: Infinity, duration: 0.8, ease: "easeInOut" },
                    x: { repeat: Infinity, duration: 0.05 },
                    skewX: { repeat: Infinity, duration: 0.1 },
                    default: { type: "spring", stiffness: 300, damping: 20 }
                }}
            >
                <div className="w-20 h-20 md:w-32 md:h-32 overflow-visible relative">
                    <img 
                        src={position > 0 ? "/tug-of-war/kid-left.png" : "/tug-of-war/kid-left.png"} 
                        // Note: Replace with kid-left-struggle.png once assets are available
                        alt="Kid 1" 
                        className={`w-full h-full object-contain transition-all duration-700 ${position < 0 ? 'drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]' : 'opacity-90'}`}
                    />
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider shadow-sm transition-all duration-500 ${position < 0 ? 'bg-md-primary text-white' : 'bg-md-surface-variant/50 text-md-on-surface-variant'}`}>
                    {position < 0 ? 'Winning!' : 'Hold on!'}
                </div>
                
                {/* Dust Particles at feet when pulling */}
                {lastPull === 'left' && <DustParticles x={0} y={60} direction="left" />}
            </motion.div>

            {/* Player 2 (Kid Right) */}
            <motion.div 
                className="absolute flex flex-col items-center gap-2 z-30"
                style={{ right: useTransform(rightX, (v) => `calc(8% - ${v}%)`), translateX: '50%' }}
                animate={getStrainStyles('right')}
                transition={{
                    y: { repeat: Infinity, duration: 0.8, ease: "easeInOut" },
                    x: { repeat: Infinity, duration: 0.05 },
                    skewX: { repeat: Infinity, duration: 0.1 },
                    default: { type: "spring", stiffness: 300, damping: 20 }
                }}
            >
                <div className="w-20 h-20 md:w-32 md:h-32 overflow-visible relative">
                    <img 
                        src={position < 0 ? "/tug-of-war/kid-right.png" : "/tug-of-war/kid-right.png"} 
                        // Note: Replace with kid-right-struggle.png once assets are available
                        alt="Kid 2" 
                        className={`w-full h-full object-contain transition-all duration-700 ${position > 0 ? 'drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]' : 'opacity-90'}`}
                    />
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider shadow-sm transition-all duration-500 ${position > 0 ? 'bg-md-primary text-white' : 'bg-md-surface-variant/50 text-md-on-surface-variant'}`}>
                    {position > 0 ? 'Winning!' : 'Hold on!'}
                </div>

                {/* Dust Particles at feet when pulling */}
                {lastPull === 'right' && <DustParticles x={0} y={60} direction="right" />}
            </motion.div>
        </div>
    );
}
