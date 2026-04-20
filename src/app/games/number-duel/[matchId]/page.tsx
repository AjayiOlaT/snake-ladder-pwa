'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export default function NumberDuelGame() {
    const params = useParams();
    const matchId = params.matchId as string;
    const router = useRouter();
    const [supabase] = useState(() => createClient());
    
    const [user, setUser] = useState<any>(null);
    const [match, setMatch] = useState<any>(null);
    const [guess, setGuess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [secretPick, setSecretPick] = useState('');
    const [guesses, setGuesses] = useState<any[]>([]);

    // Deduction State
    const [knownMin, setKnownMin] = useState<number | null>(null);
    const [knownMax, setKnownMax] = useState<number | null>(null);

    useEffect(() => {
        if (!matchId) return;

        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.replace('/login'); return; }
            setUser(session.user);

            const { data, error } = await supabase.from('number_duel_matches').select('*').eq('id', matchId).single();
            if (error || !data) { router.replace('/arcade'); return; }
            setMatch(data);
            setKnownMin(data.range_min);
            setKnownMax(data.range_max);

            const { data: gData } = await supabase.from('number_duel_guesses').select('*').eq('match_id', matchId).order('created_at', { ascending: false });
            setGuesses(gData || []);
        })();

        const channel = supabase.channel(`nd-${matchId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'number_duel_matches', filter: `id=eq.${matchId}` }, async (payload) => {
                // Force a fresh fetch to ensure all columns (like player2_id) are present and trigger the UI transition
                const { data } = await supabase.from('number_duel_matches').select('*').eq('id', matchId).single();
                if (data) setMatch(data);
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'number_duel_guesses', filter: `match_id=eq.${matchId}` }, (payload) => {
                setGuesses(prev => [payload.new, ...prev]);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'number_duel_guesses', filter: `match_id=eq.${matchId}` }, (payload) => {
                setGuesses(prev => prev.map(g => g.id === payload.new.id ? payload.new : g));
            })
            .subscribe();

        // fallback polling if realtime is silent/unconfigured
        const pollInterval = setInterval(async () => {
            if (match) {
                // Poll Match State
                if (!match.player2_id || match.phase === 'picking') {
                    const { data } = await supabase.from('number_duel_matches').select('*').eq('id', matchId).single();
                    if (data) setMatch(data);
                }

                // Poll Guesses State
                const { data: gData } = await supabase.from('number_duel_guesses')
                    .select('*')
                    .eq('match_id', matchId)
                    .order('created_at', { ascending: false });
                
                if (gData && JSON.stringify(gData) !== JSON.stringify(guesses)) {
                    setGuesses(gData || []);
                }
            }
        }, 2000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(pollInterval);
        };
    }, [matchId, supabase, router, match?.player2_id, guesses]);

    // Update Deduction Bounds based on history
    useEffect(() => {
        if (!match || !user || guesses.length === 0) {
            if (match) {
                setKnownMin(match.range_min);
                setKnownMax(match.range_max);
            }
            return;
        }
        
        let min = match.range_min;
        let max = match.range_max;

        // We only track deduction for OUR guesses against their secret
        const myDeductionGuesses = guesses.filter(g => g.player_id === user.id);
        
        myDeductionGuesses.forEach(g => {
            if (g.feedback === 'higher') {
                if (g.guess + 1 > min) min = g.guess + 1;
            } else if (g.feedback === 'lower') {
                if (g.guess - 1 < max) max = g.guess - 1;
            }
        });

        setKnownMin(min);
        setKnownMax(max);
    }, [guesses, match, user]);

    const [isConfirmingSecret, setIsConfirmingSecret] = useState(false);

    // Auto-Activator: Move to 'active' if both secrets are present but phase is still 'picking'
    useEffect(() => {
        if (match && match.phase === 'picking' && match.p1_secret_number !== null && match.p2_secret_number !== null) {
            (async () => {
                await supabase.from('number_duel_matches').update({ phase: 'active' }).eq('id', matchId).eq('phase', 'picking');
            })();
        }
    }, [match, matchId, supabase]);

    const handlePickSecret = async () => {
        if (!user || !match || !secretPick || isConfirmingSecret) return;
        const num = parseInt(secretPick);
        if (isNaN(num) || num < match.range_min || num > match.range_max) return;

        setIsConfirmingSecret(true);
        const isP1 = user.id === match.player1_id;
        const update: any = isP1 ? { p1_secret_number: num } : { p2_secret_number: num };

        // If both have picked, move to active
        const otherSecret = isP1 ? match.p2_secret_number : match.p1_secret_number;
        if (otherSecret !== null) {
            update.phase = 'active';
        }

        const { error } = await supabase.from('number_duel_matches').update(update).eq('id', matchId);
        
        if (error) {
            alert("Signal transmission failed: " + error.message);
            setIsConfirmingSecret(false);
            return;
        }

        // INSTANT SYNC: Update local state immediately so UI transitions without waiting for polling/realtime
        setMatch(prev => prev ? { ...prev, ...update } : prev);
        setIsConfirmingSecret(false);
        // We don't clear secretPick here because the UI will switch to "Waiting" view anyway
    };

    const handleGuess = async (val?: number) => {
        const finalGuess = val !== undefined ? val : parseInt(guess);
        if (!user || !match || isNaN(finalGuess) || isSubmitting) return;
        if (match.phase !== 'active' || match.current_turn_id !== user.id) return;

        setIsSubmitting(true);
        
        const { error } = await supabase.from('number_duel_guesses').insert({
            match_id: matchId,
            player_id: user.id,
            guess: finalGuess
        });

        if (error) {
            alert("Guess transmission failed: " + error.message);
        } else {
            setGuess(''); // Clear the input on success
        }
        setIsSubmitting(false);
    };

    const handleResponse = async (feedback: 'higher' | 'lower' | 'correct') => {
        if (!user || !match || isSubmitting) return;
        const latestGuess = guesses[0];
        if (!latestGuess || latestGuess.player_id === user.id) return; // Can't respond to own guess

        setIsSubmitting(true);

        const isBluff = false; // Logic for bluff detection can be added here if we want to flag it
        
        // Update the latest guess with the feedback
        await supabase.from('number_duel_guesses')
            .update({ feedback, is_bluff: isBluff })
            .eq('id', latestGuess.id);

        const isP1 = user.id === match.player1_id;
        const update: any = {
            current_turn_id: isP1 ? match.player1_id : match.player2_id // Toggle turn back for next guess
        };

        if (feedback === 'correct') {
            const p1WonValue = isP1 ? 0 : 1; // If I'm P1 and responding 'correct', it means P2 guessed right
            const p1NewScore = match.p1_score + (p1WonValue === 1 ? 0 : 1);
            const p2NewScore = match.p2_score + (p1WonValue === 1 ? 1 : 0);
            
            update.p1_score = p1NewScore;
            update.p2_score = p2NewScore;

            if (p1NewScore >= match.rounds_to_win || p2NewScore >= match.rounds_to_win) {
                update.phase = 'finished';
                update.winner_id = p1NewScore >= match.rounds_to_win ? match.player1_id : match.player2_id;
            } else {
                update.phase = 'round_end';
            }
        }

        await supabase.from('number_duel_matches').update(update).eq('id', matchId);
        setIsSubmitting(false);
    };

    const startNextRound = async () => {
        const { error } = await supabase.rpc('nd_next_round', { p_match_id: matchId });
        if (error) alert(error.message);
    };

    if (!match || !user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white italic tracking-widest text-sm animate-pulse px-6 py-4 rounded-full border border-white/5">Accessing Neural Link...</div>;

    const isP1 = user.id === match.player1_id;
    const mySecret = isP1 ? match.p1_secret_number : match.p2_secret_number;
    const isMyTurn = match.current_turn_id === user.id;
    const latestGuess = guesses[0];
    const awaitingMyResponse = latestGuess && latestGuess.player_id !== user.id && !latestGuess.feedback;
    const awaitingOpponentResponse = latestGuess && latestGuess.player_id === user.id && !latestGuess.feedback;

    const remainingCount = (knownMax || 0) - (knownMin || 0) + 1;
    const showGrid = remainingCount <= 10 && remainingCount > 0;

    // VALIDATION: Secret Pick
    const secretPickNum = parseInt(secretPick);
    const isSecretValid = !isNaN(secretPickNum) && secretPickNum >= match.range_min && secretPickNum <= match.range_max;

    return (
        <main className="min-h-screen bg-slate-950 text-white p-4 md:p-12 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Ambient Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[20%] left-[20%] w-[400px] h-[400px] bg-rose-600/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[20%] right-[20%] w-[400px] h-[400px] bg-amber-500/10 rounded-full blur-[120px]" />
            </div>

            <div className="z-10 w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-5 md:p-8 shadow-2xl relative">
                
                {/* Headers / Scores */}
                {match.player2_id && (
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black tracking-[0.3em] text-rose-500 uppercase">Neural Standoff</span>
                            <h1 className="text-xl font-black italic tracking-tighter">Round {match.round_number}</h1>
                        </div>
                        <div className="flex gap-3">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-bold text-slate-500 uppercase">You</span>
                                <span className="text-xl font-black text-rose-400">{isP1 ? match.p1_score : match.p2_score}</span>
                            </div>
                            <div className="w-px h-6 bg-white/10 self-center" />
                            <div className="flex flex-col items-start">
                                <span className="text-[9px] font-bold text-slate-500 uppercase">Opp</span>
                                <span className="text-xl font-black text-slate-400">{isP1 ? match.p2_score : match.p1_score}</span>
                            </div>
                        </div>
                    </div>
                )}

                {match.bluffing_enabled && match.player2_id && (
                    <div className="mb-6 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                        <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest animate-pulse">
                            ⚠️ System Deception Enabled: Opponent may provide false signals
                        </p>
                    </div>
                )}

                {/* Main Views */}
                <AnimatePresence mode="wait">
                    {!match.player2_id ? (
                        <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 flex flex-col items-center text-center">
                            <div className="w-20 h-20 rounded-3xl bg-rose-500/10 flex items-center justify-center text-4xl mb-8 border border-rose-500/20 shadow-[0_0_30px_rgba(244,63,94,0.2)]">
                                📡
                            </div>
                            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-rose-500 mb-2">Awaiting Neural Bridge</h2>
                            <p className="text-slate-400 font-medium mb-8 max-w-xs">Share this transmission code with your opponent to initiate the standoff.</p>
                            
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 w-full">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Transmission Code / PIN</p>
                                <p className="text-4xl sm:text-5xl font-black tracking-widest text-white font-mono">{match.join_code}</p>
                            </div>

                            <div className="flex items-center gap-2 text-slate-500">
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Scanning signal...</span>
                            </div>
                        </motion.div>
                    ) : match.phase === 'finished' ? (
                        <motion.div key="finished" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 flex flex-col items-center text-center">
                             <div className="text-7xl mb-4">{match.winner_id === user.id ? '🏆' : '💀'}</div>
                             <h2 className="text-5xl font-black italic mb-2 tracking-tighter">
                                {match.winner_id === user.id ? 'CONQUEROR' : 'COMPROMISED'}
                             </h2>
                             <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-8">
                                {match.winner_id === user.id ? 'Neural link established. Champion status confirmed.' : 'Signal lost. Opponent has dominated the standoff.'}
                             </p>
                             <button onClick={() => router.push('/arcade')} className="px-10 py-4 bg-white text-slate-950 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-105 active:scale-95 transition-all">
                                Finalize Session
                             </button>
                        </motion.div>
                    ) : match.phase === 'round_end' ? (
                        <motion.div key="round_end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 flex flex-col items-center text-center">
                             <div className="text-4xl mb-4">🎯</div>
                             <h2 className="text-3xl font-black uppercase tracking-tight mb-2">Round Synchronized</h2>
                             <p className="text-slate-400 mb-8 font-medium">Wait for Calibration Re-entry.</p>
                             <button onClick={startNextRound} className="w-full py-5 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black uppercase tracking-widest transition-all">
                                Proceed to Next Round
                             </button>
                        </motion.div>
                    ) : match.phase === 'picking' ? (
                        <motion.div key="picking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 py-4">
                            {!mySecret ? (
                                <>
                                    <div className="p-5 bg-rose-500/5 border border-rose-500/20 rounded-2xl">
                                        <h3 className="text-xl font-black uppercase italic mb-1">Set Target Code</h3>
                                        <p className="text-slate-400 text-sm font-medium">Select a secret between {match.range_min} and {match.range_max}.</p>
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <input 
                                            type="number" 
                                            value={secretPick} 
                                            onChange={(e) => setSecretPick(e.target.value)}
                                            disabled={isConfirmingSecret}
                                            className={`w-full bg-black/40 border rounded-2xl py-8 text-center text-6xl font-black transition-all font-mono focus:outline-none ${!isSecretValid && secretPick ? 'border-red-500 text-red-500' : 'border-white/10 text-amber-400 focus:border-rose-500/50'}`}
                                        />
                                        <button 
                                            onClick={handlePickSecret} 
                                            disabled={!isSecretValid || isConfirmingSecret}
                                            className="w-full py-5 bg-white text-slate-950 rounded-2xl font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white disabled:opacity-20 disabled:hover:bg-white disabled:hover:text-slate-950 transition-all shadow-xl flex justify-center"
                                        >
                                            {isConfirmingSecret ? <span className="animate-pulse">Signaling...</span> : 'Confirm Secret'}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="py-12 text-center space-y-6">
                                    <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center text-4xl mx-auto border border-rose-500/20 animate-pulse">
                                        ⌛
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black uppercase tracking-widest">Waiting for Opponent</h3>
                                        <p className="text-slate-500 text-sm mt-1 font-medium">Neural link is pending on the second signal.</p>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                            
                            {/* HUD: Deduction Display */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className={`p-4 rounded-3xl border ${awaitingMyResponse ? 'bg-amber-500/10 border-amber-500/50' : 'bg-white/5 border-white/10'}`}>
                                    <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Operation Status</p>
                                    <p className="font-black italic text-sm truncate uppercase tracking-tighter">
                                        {awaitingMyResponse ? 'RESPOND NOW!' : 
                                         awaitingOpponentResponse ? 'WAITING FOR SIGNAL' :
                                         isMyTurn ? 'INITIATE STRIKE' : 'OPPONENT SCANNING'}
                                    </p>
                                </div>
                                <div className="p-4 rounded-3xl bg-white/5 border border-white/10">
                                    <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Your Code</p>
                                    <div className="flex justify-between items-center">
                                        <span className="font-black text-amber-400 text-lg font-mono">{mySecret}</span>
                                        <span className="text-[10px] text-slate-600 font-bold uppercase">{match.range_min}-{match.range_max}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Response Buttons Overlay for Non-Turn Player */}
                            {awaitingMyResponse ? (
                                <div className="py-4 space-y-4">
                                    <div className="text-center p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Opponent guessed</p>
                                        <p className="text-7xl font-black font-mono text-white mb-2">{latestGuess.guess}</p>
                                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Identify relationship to target</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <button onClick={() => handleResponse('higher')} className="py-6 bg-white/5 border border-white/10 rounded-2xl font-black uppercase text-xs hover:bg-rose-500/20 transition-all">Higher ↑</button>
                                        <button onClick={() => handleResponse('correct')} className="py-6 bg-teal-500/20 border border-teal-500/50 rounded-2xl font-black uppercase text-xs text-teal-400 hover:bg-teal-500 hover:text-white transition-all">Correct ✓</button>
                                        <button onClick={() => handleResponse('lower')} className="py-6 bg-white/5 border border-white/10 rounded-2xl font-black uppercase text-xs hover:bg-rose-500/20 transition-all">Lower ↓</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Deduction Progress Bar */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 tracking-widest px-2">
                                            <span>Min: {knownMin}</span>
                                            <span>Hot Zone ({remainingCount})</span>
                                            <span>Max: {knownMax}</span>
                                        </div>
                                        <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 flex">
                                            {/* Progress bar logic: mapped to full range */}
                                            <div style={{ width: `${((knownMin || 0) / (match.range_max || 100)) * 100}%` }} className="bg-transparent" />
                                            <div style={{ width: `${(remainingCount / (match.range_max || 100)) * 100}%` }} className="bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.5)] h-full rounded-full" />
                                        </div>
                                    </div>

                                    {/* Main Input or Grid */}
                                    <div className="py-4">
                                        {showGrid ? (
                                            <div className="flex flex-wrap justify-center gap-3">
                                                {Array.from({ length: remainingCount }, (_, i) => (knownMin || 0) + i).map(num => (
                                                    <button 
                                                        key={num}
                                                        onClick={() => handleGuess(num)}
                                                        disabled={!isMyTurn || awaitingOpponentResponse}
                                                        className={`w-14 h-14 rounded-xl font-black font-mono text-xl border transition-all ${isMyTurn ? 'bg-white/5 border-white/10 hover:border-rose-500 hover:bg-rose-500/10' : 'bg-white/5 border-white/5 opacity-50'}`}
                                                    >
                                                        {num}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Status</p>
                                            <p className="text-xl font-black text-white italic uppercase tracking-tighter">Your Turn</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Secret</p>
                                            <p className="text-xl font-black text-amber-400 font-mono truncate">{mySecret || '?'}</p>
                                        </div>
                                    </div>

                                    {/* Guess Input */}
                                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 relative group transition-all">
                                        <input 
                                            type="number"
                                            value={guess}
                                            onChange={(e) => setGuess(e.target.value)}
                                            placeholder="?"
                                            className="w-full bg-transparent text-center text-7xl sm:text-8xl font-black text-rose-500 focus:outline-none placeholder:text-rose-500/20 font-mono"
                                        />
                                        <div className="absolute top-2 right-4 text-[10px] text-slate-600 font-mono italic">input_buffer</div>
                                    </div>

                                    <button 
                                        onClick={() => handleGuess()}
                                        disabled={isSubmitting || !guess}
                                        className="w-full py-6 bg-gradient-to-r from-rose-500 to-rose-600 rounded-3xl text-white font-black text-xl md:text-2xl tracking-[0.2em] uppercase shadow-[0_10px_40px_rgba(244,63,94,0.3)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-20 transition-all flex justify-center"
                                    >
                                        {isSubmitting ? <span className="animate-pulse">Transmitting...</span> : 'Transmit Guess'}
                                    </button>
                                </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* Neural Logs */}
                            <div className="pt-4 border-t border-white/5">
                                <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest text-center mb-3">Neural Stream</p>
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-1 flex flex-col-reverse">
                                    {guesses.map((g, i) => (
                                        <div key={g.id} className={`flex justify-between items-center p-3 rounded-2xl border ${g.player_id === user.id ? 'bg-white/5 border-white/5' : 'bg-rose-500/5 border-rose-500/10'}`}>
                                            <div className="flex items-center gap-3">
                                                 <span className={`text-[9px] font-black uppercase ${g.player_id === user.id ? 'text-slate-600' : 'text-rose-500'}`}>
                                                    {g.player_id === user.id ? 'YOU' : 'OPP'}
                                                 </span>
                                                 <span className="font-black font-mono text-lg">{g.guess}</span>
                                            </div>
                                            <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                                                g.feedback === 'correct' ? 'text-teal-400 border-teal-400/30' : 
                                                g.feedback === 'higher' ? 'text-amber-400 border-amber-400/30' : 
                                                g.feedback === 'lower' ? 'text-rose-400 border-rose-400/30' : 
                                                'text-slate-600 border-white/5 bg-white/5'
                                            }`}>
                                                {g.feedback ? (g.feedback === 'correct' ? 'SYNCED' : g.feedback.toUpperCase()) : 'PENDING...'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </main>
    );
}
