'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Question {
    id: string;
    question_text: string;
    options: string[];
    correct_answer: string;
}

interface QuestionArenaProps {
    questions: Question[];
    onCorrect: (impact: number) => void;
    multiplier: number;
    disabled?: boolean;
    compact?: boolean;
}

export default function QuestionArena({ questions, onCorrect, multiplier, disabled, compact }: QuestionArenaProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [cooldown, setCooldown] = useState(false);

    const currentQuestion = questions[currentIndex % questions.length];

    const handleAnswer = (option: string) => {
        if (disabled || cooldown || isCorrect !== null) return;

        setSelectedOption(option);
        const correct = option === currentQuestion.correct_answer;
        setIsCorrect(correct);

        if (correct) {
            onCorrect(multiplier);
        }

        setCooldown(true);
        setTimeout(() => {
            setIsCorrect(null);
            setSelectedOption(null);
            setCurrentIndex(prev => prev + 1);
            setCooldown(false);
        }, 800);
    };

    if (!currentQuestion) return <div className="text-slate-500 font-bold uppercase tracking-widest text-xs">Waiting for neural feed...</div>;

    return (
        <div className={`w-full max-w-xl bg-md-surface text-md-on-surface border border-md-outline/10 shadow-[0_4px_24px_rgba(0,0,0,0.06)] relative overflow-hidden flex flex-col ${compact ? 'rounded-2xl p-4 gap-3' : 'rounded-[2rem] p-8 md:p-10 gap-8'}`}>
            <AnimatePresence mode="wait">
                <motion.div 
                    key={currentQuestion.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`flex flex-col ${compact ? 'gap-3' : 'gap-6'}`}
                >
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-md-outline uppercase tracking-[0.2em]">Question {currentIndex + 1}</span>
                        <div className="flex items-center gap-2 px-3 py-1 bg-md-primary-container text-md-on-primary-container rounded-full">
                            <span className="text-[10px] font-bold uppercase tracking-widest">Power x{multiplier.toFixed(1)}</span>
                        </div>
                    </div>

                    <h2 className={`font-semibold text-md-on-surface leading-tight tracking-tight ${compact ? 'text-base' : 'text-2xl md:text-3xl'}`}>
                        {currentQuestion.question_text}
                    </h2>

                    <div className={`grid grid-cols-1 ${compact ? 'gap-2' : 'gap-3 md:grid-cols-2'}`}>
                        {currentQuestion.options.map((option, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleAnswer(option)}
                                disabled={disabled || cooldown}
                                className={`
                                    relative rounded-2xl border transition-all text-left font-medium
                                    ${compact ? 'p-2.5 text-xs' : 'p-6 text-base'}
                                    ${selectedOption === option 
                                        ? (isCorrect 
                                            ? 'bg-md-success/10 border-md-success text-md-success' 
                                            : 'bg-md-error/10 border-md-error text-md-error')
                                        : 'bg-md-surface-variant/30 border-md-outline/20 hover:border-md-primary hover:bg-md-primary/5 text-md-on-surface-variant'
                                    }
                                `}
                            >
                                <span className="flex items-center gap-3">
                                    <span className={`rounded-full border flex items-center justify-center font-bold ${compact ? 'w-5 h-5 text-[8px]' : 'w-6 h-6 text-[10px]'} ${selectedOption === option ? 'border-transparent bg-current text-white' : 'border-md-outline/30'}`}>
                                        {String.fromCharCode(65 + idx)}
                                    </span>
                                    {option}
                                </span>
                                {selectedOption === option && (
                                    <motion.div 
                                        initial={{ scale: 0 }} 
                                        animate={{ scale: 1 }} 
                                        className="absolute top-1/2 -translate-y-1/2 right-4 text-xl"
                                    >
                                        {isCorrect ? '✓' : '✕'}
                                    </motion.div>
                                )}
                            </button>
                        ))}
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Fun Progress Bar */}
            <div className="h-1.5 bg-md-surface-variant rounded-full overflow-hidden mt-2">
                <motion.div 
                    className="h-full bg-md-primary"
                    initial={{ width: '0%' }}
                    animate={{ width: `${((currentIndex % questions.length) / questions.length) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                />
            </div>
        </div>
    );
}
