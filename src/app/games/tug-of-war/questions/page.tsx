'use client';

import { useState, useEffect } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import CustomSelect from '../../../../components/CustomSelect';

export default function QuestionManager() {
    const [supabase] = useState(() => createClient());
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [questions, setQuestions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [editingQuestion, setEditingQuestion] = useState<any>(null);
    const [showForm, setShowForm] = useState(false);

    // Form State
    const [subject, setSubject] = useState('Math');
    const [difficulty, setDifficulty] = useState('easy');
    const [questionText, setQuestionText] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [correctAnswer, setCorrectAnswer] = useState('');

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.replace('/login');
                return;
            }
            setUser(session.user);
            fetchQuestions();
        };
        checkAuth();
    }, []);

    const fetchQuestions = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('questions')
            .select('*')
            .order('created_at', { ascending: false });
        if (!error) setQuestions(data || []);
        setIsLoading(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!questionText || !correctAnswer || options.some(o => !o)) return;

        const payload = {
            subject,
            difficulty,
            question_text: questionText,
            options,
            correct_answer: correctAnswer
        };

        if (editingQuestion) {
            await supabase.from('questions').update(payload).eq('id', editingQuestion.id);
        } else {
            await supabase.from('questions').insert(payload);
        }

        resetForm();
        fetchQuestions();
    };

    const resetForm = () => {
        setEditingQuestion(null);
        setShowForm(false);
        setQuestionText('');
        setOptions(['', '', '', '']);
        setCorrectAnswer('');
    };

    const deleteQuestion = async (id: string) => {
        if (!window.confirm('Delete this question?')) return;
        await supabase.from('questions').delete().eq('id', id);
        fetchQuestions();
    };

    if (!user) return null;

    return (
        <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                <header className="flex justify-between items-center mb-12">
                    <div>
                        <h2 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.3em]">Neural Engine</h2>
                        <h1 className="text-3xl font-black italic tracking-tighter uppercase">Question Repository</h1>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={() => router.push('/games/tug-of-war/lobby')} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                            Lobby
                        </button>
                        <button 
                            onClick={() => { resetForm(); setShowForm(true); }}
                            className="px-6 py-2 bg-purple-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-400 transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                        >
                            + New Entry
                        </button>
                    </div>
                </header>

                <AnimatePresence>
                    {showForm && (
                        <motion.div 
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="mb-12 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl"
                        >
                            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <CustomSelect 
                                            label="Subject"
                                            value={subject}
                                            onChange={setSubject}
                                            options={[
                                                { value: 'Math', label: 'Math' },
                                                { value: 'Science', label: 'Science' }
                                            ]}
                                        />
                                        <CustomSelect 
                                            label="Difficulty"
                                            value={difficulty}
                                            onChange={setDifficulty}
                                            options={[
                                                { value: 'easy', label: 'Easy' },
                                                { value: 'medium', label: 'Medium' },
                                                { value: 'hard', label: 'Hard' }
                                            ]}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Question Text</label>
                                        <textarea 
                                            value={questionText} 
                                            onChange={e => setQuestionText(e.target.value)}
                                            className="w-full h-32 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm font-bold focus:border-purple-500/50 outline-none resize-none"
                                            placeholder="What is the result of...?"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Options</label>
                                        {options.map((opt, idx) => (
                                            <div key={idx} className="flex gap-3">
                                                <input 
                                                    type="text" 
                                                    value={opt} 
                                                    onChange={e => {
                                                        const newOpts = [...options];
                                                        newOpts[idx] = e.target.value;
                                                        setOptions(newOpts);
                                                    }}
                                                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold focus:border-purple-500/50 outline-none"
                                                    placeholder={`Option ${idx + 1}`}
                                                />
                                                <button 
                                                    type="button"
                                                    onClick={() => setCorrectAnswer(opt)}
                                                    className={`w-10 h-10 rounded-xl border transition-all flex items-center justify-center ${correctAnswer === opt ? 'bg-teal-500/20 border-teal-500 text-teal-400' : 'bg-white/5 border-white/10 text-slate-500'}`}
                                                >
                                                    {correctAnswer === opt ? '✓' : ' '}
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex gap-4 pt-4">
                                        <button type="submit" className="flex-1 py-3 bg-white text-slate-950 rounded-xl font-black uppercase text-[10px] tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all">
                                            {editingQuestion ? 'Update Entry' : 'Commit to Database'}
                                        </button>
                                        <button type="button" onClick={resetForm} className="px-6 py-3 bg-white/5 text-slate-400 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-white/10 transition-all">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {isLoading ? (
                        [1,2,3].map(i => <div key={i} className="h-48 bg-white/5 rounded-3xl animate-pulse" />)
                    ) : questions.length === 0 ? (
                        <div className="col-span-full py-20 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">Repository Empty. Initialize first.</div>
                    ) : (
                        questions.map(q => (
                            <motion.div 
                                key={q.id}
                                layoutId={q.id}
                                className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col gap-4 hover:border-purple-500/30 transition-colors group"
                            >
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-2">
                                        <span className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[8px] font-black uppercase text-purple-400">{q.subject}</span>
                                        <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${
                                            q.difficulty === 'hard' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                            q.difficulty === 'medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                            'bg-teal-500/10 border-teal-500/20 text-teal-400'
                                        }`}>{q.difficulty}</span>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => {
                                                setEditingQuestion(q);
                                                setSubject(q.subject);
                                                setDifficulty(q.difficulty);
                                                setQuestionText(q.question_text);
                                                setOptions(q.options);
                                                setCorrectAnswer(q.correct_answer);
                                                setShowForm(true);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                            }}
                                            className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                                        >
                                            ✏️
                                        </button>
                                        <button 
                                            onClick={() => deleteQuestion(q.id)}
                                            className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                                <p className="font-bold text-sm leading-relaxed text-slate-200 line-clamp-3">{q.question_text}</p>
                                <div className="mt-auto pt-4 border-t border-white/5">
                                    <p className="text-[8px] font-black text-slate-600 uppercase mb-2">Answer</p>
                                    <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">{q.correct_answer}</p>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>
        </main>
    );
}
