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
        <div className="w-full max-w-xl bg-white/90 backdrop-blur-xl border-4 border-white rounded-[2.5rem] p-8 flex flex-col gap-8 shadow-2xl relative overflow-hidden">
            <AnimatePresence mode="wait">
                <motion.div 
                    key={currentQuestion.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex flex-col gap-6"
                >
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Question {currentIndex + 1}</span>
                        <span className="text-[10px] font-black text-sky-600 uppercase tracking-widest">Power: x{multiplier.toFixed(1)}</span>
                    </div>

                    <h2 className="text-xl md:text-2xl font-black text-slate-800 leading-relaxed">
                        {currentQuestion.question_text}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {currentQuestion.options.map((option, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleAnswer(option)}
                                disabled={disabled || cooldown}
                                className={`
                                    relative p-5 rounded-2xl border-2 transition-all text-left font-black text-sm shadow-sm
                                    ${selectedOption === option 
                                        ? (isCorrect ? 'bg-green-100 border-green-500 text-green-700' : 'bg-red-100 border-red-500 text-red-700')
                                        : 'bg-slate-50 border-slate-100 hover:border-sky-400 text-slate-600'
                                    }
                                `}
                            >
                                {option}
                                {selectedOption === option && (
                                    <motion.div 
                                        initial={{ scale: 0 }} 
                                        animate={{ scale: 1 }} 
                                        className="absolute top-2 right-2 text-lg"
                                    >
                                        {isCorrect ? '✅' : '❌'}
                                    </motion.div>
                                )}
                            </button>
                        ))}
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Fun Progress Bar */}
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                    className="h-full bg-gradient-to-r from-sky-400 to-blue-500"
                    initial={{ width: '0%' }}
                    animate={{ width: `${((currentIndex % questions.length) / questions.length) * 100}%` }}
                />
            </div>
        </div>
    );
}
