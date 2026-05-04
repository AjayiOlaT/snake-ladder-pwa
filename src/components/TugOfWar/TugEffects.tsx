'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';

// --- DUST PARTICLES ---
interface DustProps {
    x: number;
    y: number;
    direction: 'left' | 'right';
}

export function DustParticles({ x, y, direction }: DustProps) {
    const [particles, setParticles] = useState<{ id: number; tx: number; ty: number }[]>([]);

    useEffect(() => {
        const newParticles = Array.from({ length: 8 }).map((_, i) => ({
            id: Date.now() + i,
            tx: (Math.random() * 60 + 40) * (direction === 'left' ? 1 : -1),
            ty: (Math.random() * -40 - 20)
        }));
        setParticles(newParticles);
        
        const timer = setTimeout(() => setParticles([]), 800);
        return () => clearTimeout(timer);
    }, [x, y, direction]);

    return (
        <div className="absolute pointer-events-none" style={{ left: x, top: y }}>
            <AnimatePresence>
                {particles.map((p) => (
                    <motion.div
                        key={p.id}
                        initial={{ opacity: 0.8, scale: 0, x: 0, y: 0 }}
                        animate={{ 
                            opacity: 0, 
                            scale: Math.random() * 1.5 + 0.5,
                            x: p.tx,
                            y: p.ty
                        }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="absolute w-1.5 h-1.5 rounded-full bg-md-outline/30"
                    />
                ))}
            </AnimatePresence>
        </div>
    );
}

// --- SCREEN SHAKE WRAPPER ---
export const ScreenShake = forwardRef((props: { children: React.ReactNode }, ref) => {
    const [isShaking, setIsShaking] = useState(false);
    const [intensity, setIntensity] = useState(1);

    useImperativeHandle(ref, () => ({
        shake: (level: number = 1) => {
            setIntensity(level);
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 400);
        }
    }));

    return (
        <motion.div
            animate={isShaking ? {
                x: [0, -5 * intensity, 5 * intensity, -3 * intensity, 3 * intensity, 0],
                y: [0, 3 * intensity, -3 * intensity, 2 * intensity, -2 * intensity, 0],
            } : { x: 0, y: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="w-full h-full"
        >
            {props.children}
        </motion.div>
    );
});

ScreenShake.displayName = 'ScreenShake';
