'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Option {
    value: string;
    label: string;
    disabled?: boolean;
}

interface CustomSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    label?: string;
}

export default function CustomSelect({ options, value, onChange, label }: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="flex flex-col gap-2 w-full relative" ref={containerRef}>
            {label && <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>}
            
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-bold text-sm flex justify-between items-center hover:border-white/20 transition-all focus:outline-none focus:border-purple-500/50"
            >
                <span className={selectedOption?.disabled ? 'opacity-50' : ''}>
                    {selectedOption?.label || 'Select option'}
                </span>
                <motion.span 
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    className="text-slate-500"
                >
                    ▼
                </motion.span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        className="absolute top-full left-0 right-0 mt-2 z-[120] bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                    >
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                disabled={option.disabled}
                                onClick={() => {
                                    if (!option.disabled) {
                                        onChange(option.value);
                                        setIsOpen(false);
                                    }
                                }}
                                className={`
                                    w-full px-4 py-3 text-left text-sm font-bold transition-all flex items-center justify-between
                                    ${option.disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/5 text-slate-300 hover:text-white'}
                                    ${value === option.value ? 'bg-purple-500/10 text-purple-400' : ''}
                                `}
                            >
                                <span>{option.label}</span>
                                {value === option.value && <span className="text-purple-400">✓</span>}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
