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
}

export default function QuestionArena({ questions, onCorrect, multiplier, disabled }: QuestionArenaProps) {
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
        <div className="w-full max-w-xl bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 flex flex-col gap-8 shadow-2xl relative overflow-hidden">
            <AnimatePresence mode="wait">
                <motion.div 
                    key={currentQuestion.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex flex-col gap-6"
                >
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Question {currentIndex + 1}</span>
                        <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Power: x{multiplier.toFixed(1)}</span>
                    </div>

                    <h2 className="text-xl md:text-2xl font-bold text-white leading-relaxed">
                        {currentQuestion.question_text}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {currentQuestion.options.map((option, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleAnswer(option)}
                                disabled={disabled || cooldown}
                                className={`
                                    relative p-4 rounded-2xl border transition-all text-left font-bold text-sm
                                    ${selectedOption === option 
                                        ? (isCorrect ? 'bg-teal-500/20 border-teal-500 text-teal-400' : 'bg-rose-500/20 border-rose-500 text-rose-400')
                                        : 'bg-white/5 border-white/5 hover:border-white/20 text-slate-300'
                                    }
                                `}
                            >
                                {option}
                                {selectedOption === option && (
                                    <motion.div 
                                        initial={{ scale: 0 }} 
                                        animate={{ scale: 1 }} 
                                        className="absolute top-2 right-2"
                                    >
                                        {isCorrect ? '✅' : '❌'}
                                    </motion.div>
                                )}
                            </button>
                        ))}
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Neural Progress Bar */}
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500"
                    initial={{ width: '0%' }}
                    animate={{ width: `${((currentIndex % questions.length) / questions.length) * 100}%` }}
                />
            </div>
        </div>
    );
}
