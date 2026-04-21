'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { music } from '../../../../lib/music';

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
    const [selectedGridNumber, setSelectedGridNumber] = useState<number | null>(null);
    const [acceptedFriends, setAcceptedFriends] = useState<any[]>([]);
    const [inviteSent, setInviteSent] = useState<string | null>(null);

    // Deduction State
    const [knownMin, setKnownMin] = useState<number | null>(null);
    const [knownMax, setKnownMax] = useState<number | null>(null);

    const [isMuted, setIsMuted] = useState(false);
    const [flashColor, setFlashColor] = useState<string | null>(null);
    const [flashText, setFlashText] = useState<{text: string, color: string} | null>(null);

    useEffect(() => { setIsMuted(music.isMuted()); }, []);

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

            // Load accepted friends for invite panel
            const { data: friendships } = await supabase
                .from('friendships')
                .select('*')
                .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
                .eq('status', 'accepted');

            if (friendships && friendships.length > 0) {
                const friendIds = friendships.map((f: any) => f.sender_id === session.user.id ? f.receiver_id : f.sender_id);
                const { data: profiles } = await supabase.from('profiles').select('id, username, email').in('id', friendIds);
                setAcceptedFriends(profiles || []);
            }

            const { data: gData } = await supabase.from('number_duel_guesses').select('*').eq('match_id', matchId).order('created_at', { ascending: false });
            setGuesses(gData || []);
        })();
    }, [matchId, supabase, router]);

    // Robust Polling & Real-time Integration
    useEffect(() => {
        if (!matchId) return;
        
        const channel = supabase
            .channel(`number-duel-${matchId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'number_duel_matches', filter: `id=eq.${matchId}` }, (payload) => {
                setMatch(payload.new as any);
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'number_duel_guesses', filter: `match_id=eq.${matchId}` }, (payload) => {
                setGuesses(prev => [payload.new, ...prev]);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'number_duel_guesses', filter: `match_id=eq.${matchId}` }, (payload) => {
                setGuesses(prev => prev.map(g => g.id === payload.new.id ? payload.new : g));
            })
            .subscribe();

        const pollInterval = setInterval(async () => {
            const { data: mData } = await supabase.from('number_duel_matches').select('*').eq('id', matchId).single();
            if (mData) setMatch(mData);

            const { data: gData } = await supabase.from('number_duel_guesses')
                .select('*')
                .eq('match_id', matchId)
                .order('created_at', { ascending: false });
            
            if (gData) setGuesses(gData);
        }, 2500);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(pollInterval);
        };
    }, [matchId, supabase, router]);

    // SFX and Flashes Trigger
    const prevLatestFeedback = useRef<string | null>(null);
    useEffect(() => {
        if (!match) return;
        const currentRoundGuesses = guesses.filter(g => !g.round_number || g.round_number === match.round_number);
        const latestFeedback = currentRoundGuesses[0]?.feedback;
        
        if (latestFeedback && latestFeedback !== 'pending' && latestFeedback !== prevLatestFeedback.current) {
            prevLatestFeedback.current = latestFeedback;
            if (latestFeedback === 'higher') { music.playHigherSound(); setFlashColor('shadow-[inset_0_0_100px_rgba(244,63,94,0.15)]'); setFlashText({text: 'HIGHER ↑', color: 'text-amber-500'}); }
            if (latestFeedback === 'lower') { music.playLowerSound(); setFlashColor('shadow-[inset_0_0_100px_rgba(59,130,246,0.15)]'); setFlashText({text: 'LOWER ↓', color: 'text-blue-500'}); }
            if (latestFeedback === 'correct') { music.playMatchSound(); setFlashColor('shadow-[inset_0_0_100px_rgba(20,184,166,0.15)]'); setFlashText({text: 'MATCH ✓', color: 'text-teal-400'}); }
            setTimeout(() => {
                setFlashColor(null);
                setFlashText(null);
            }, 1500);
        }
    }, [guesses, match]);

    // Win Sound Trigger
    useEffect(() => {
        if (match && (match.phase === 'finished' || match.phase === 'round_end')) {
            music.playWinSound();
        }
    }, [match?.phase]);

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

        const currentRoundGuesses = guesses.filter(g => !g.round_number || g.round_number === match.round_number);
        const myDeductionGuesses = currentRoundGuesses.filter(g => g.player_id === user.id);
        
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

        const otherSecret = isP1 ? match.p2_secret_number : match.p1_secret_number;
        if (otherSecret !== null) {
            update.phase = 'active';
            // Clear feedback ref for new round
            prevLatestFeedback.current = null;
        }

        const { error } = await supabase.from('number_duel_matches').update(update).eq('id', matchId);
        
        if (error) {
            alert("Submission failed: " + error.message);
            setIsConfirmingSecret(false);
            return;
        }

        setMatch((prev: any) => prev ? { ...prev, ...update } : prev);
        setIsConfirmingSecret(false);
    };

    const handleGuess = async (val?: number) => {
        const finalGuess = val !== undefined ? val : parseInt(guess);
        if (!user || !match || isNaN(finalGuess) || isSubmitting) return;
        if (match.phase !== 'active' || match.current_turn_id !== user.id) return;

        setIsSubmitting(true);
        
        const { error } = await supabase.from('number_duel_guesses').insert({
            match_id: matchId,
            player_id: user.id,
            guess: finalGuess,
            feedback: 'pending',
            round_number: match.round_number
        });

        if (error) {
            alert("Guess submitted failed: " + error.message);
        } else {
            setGuess('');
        }
        setIsSubmitting(false);
    };

    const handleResponse = async (feedback: 'higher' | 'lower' | 'correct') => {
        if (!user || !match || isSubmitting) return;
        const currentRoundGuesses = guesses.filter(g => !g.round_number || g.round_number === match.round_number);
        const latestGuess = currentRoundGuesses[0];
        if (!latestGuess || latestGuess.player_id === user.id) return;

        setIsSubmitting(true);
        
        await supabase.from('number_duel_guesses')
            .update({ feedback })
            .eq('id', latestGuess.id);

        const isP1 = user.id === match.player1_id;
        const update: any = {
            current_turn_id: isP1 ? match.player1_id : match.player2_id
        };

        if (feedback === 'correct') {
            // isP1 = the responder (number owner). The GUESSER wins the point.
            // If responder is P1, the guesser is P2 → P2 scores.
            // If responder is P2, the guesser is P1 → P1 scores.
            const guesserIsP1 = !isP1;
            const p1NewScore = match.p1_score + (guesserIsP1 ? 1 : 0);
            const p2NewScore = match.p2_score + (guesserIsP1 ? 0 : 1);
            
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

    const toggleMute = () => setIsMuted(music.toggleMute());

    if (!match || !user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white italic tracking-widest text-sm animate-pulse px-6 py-4 rounded-full border border-white/5">Loading Duel...</div>;

    const isP1 = user.id === match.player1_id;
    const mySecret = isP1 ? match.p1_secret_number : match.p2_secret_number;
    const isMyTurn = match.current_turn_id === user.id;
    
    // Only care about the active round's guesses
    const currentRoundGuesses = guesses.filter(g => !g.round_number || g.round_number === match.round_number);
    const latestGuess = currentRoundGuesses[0];
    
    const awaitingMyResponse = latestGuess && latestGuess.player_id !== user.id && (!latestGuess.feedback || latestGuess.feedback === 'pending');
    const awaitingOpponentResponse = latestGuess && latestGuess.player_id === user.id && (!latestGuess.feedback || latestGuess.feedback === 'pending');
    const forcedMatch = awaitingMyResponse && latestGuess.guess === parseInt(mySecret);

    const remainingCount = (knownMax || 0) - (knownMin || 0) + 1;
    const showGrid = remainingCount <= 10 && remainingCount > 0;

    const secretPickNum = parseInt(secretPick);
    const isSecretValid = !isNaN(secretPickNum) && secretPickNum >= match.range_min && secretPickNum <= match.range_max;

    return (
        <main className="min-h-screen bg-slate-950 text-white p-2 md:p-6 flex flex-col items-center justify-center relative overflow-hidden transition-colors duration-300">
            {/* Ambient Background & Flash Layer */}
            <div className={`fixed inset-0 pointer-events-none z-0 transition-opacity duration-300 ${flashColor || ''}`}>
                <div className="absolute top-[20%] left-[20%] w-[300px] h-[300px] bg-rose-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-[20%] right-[20%] w-[300px] h-[300px] bg-amber-500/10 rounded-full blur-[100px]" />
            </div>

            <AnimatePresence>
                {flashText && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.5, y: 30 }} 
                        animate={{ opacity: 1, scale: 1, y: 0 }} 
                        exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
                        className="fixed inset-0 pointer-events-none flex items-center justify-center z-50 drop-shadow-2xl backdrop-blur-[2px]"
                    >
                        <h1 className={`text-6xl md:text-9xl font-black italic tracking-tighter uppercase tabular-nums drop-shadow-[0_0_50px_rgba(0,0,0,0.8)] ${flashText.color}`}>
                            {flashText.text}
                        </h1>
                    </motion.div>
                )}
            </AnimatePresence>

            <button onClick={toggleMute} className="fixed top-4 right-4 z-50 bg-white/10 hover:bg-white/20 p-3 rounded-full backdrop-blur-md transition-all text-xl border border-white/10">
                {isMuted ? '🔇' : '🔊'}
            </button>

            <div className="z-10 w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 md:p-6 shadow-2xl relative">
                
                {/* Headers / Scores */}
                {match.player2_id && (
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black tracking-[0.3em] text-rose-500 uppercase">Number Duel</span>
                            <h1 className="text-lg font-black italic tracking-tighter">Round {match.round_number}</h1>
                        </div>
                        <div className="flex gap-3">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-bold text-slate-500 uppercase">You</span>
                                <span className="text-xl font-black text-rose-400">{isP1 ? match.p1_score : match.p2_score}</span>
                            </div>
                            <div className="w-px h-5 bg-white/10 self-center" />
                            <div className="flex flex-col items-start">
                                <span className="text-[9px] font-bold text-slate-500 uppercase">Opp</span>
                                <span className="text-xl font-black text-slate-400">{isP1 ? match.p2_score : match.p1_score}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Views */}
                <AnimatePresence mode="wait">
                    {!match.player2_id ? (
                        <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-3xl bg-rose-500/10 flex items-center justify-center text-3xl mb-6 border border-rose-500/20 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
                                📡
                            </div>
                            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-rose-500 mb-2">Waiting for Opponent</h2>
                            <p className="text-slate-400 text-xs font-medium mb-6 max-w-xs">Share this code with your opponent.</p>
                            
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4 w-full">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Room Code</p>
                                <p className="text-3xl sm:text-4xl font-black tracking-widest text-white font-mono">{match.join_code}</p>
                            </div>

                            {/* Invite a Friend */}
                            {acceptedFriends.length > 0 && (
                                <div className="w-full space-y-2 mb-4">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Invite a Friend</p>
                                    {acceptedFriends.map(friend => (
                                        <div key={friend.id} className="flex items-center justify-between p-2 px-3 rounded-xl bg-white/5 border border-white/10">
                                            <span className="text-sm font-bold truncate">{friend.username || friend.email || 'Unknown'}</span>
                                            {inviteSent === friend.id ? (
                                                <span className="text-[9px] font-black uppercase text-teal-400 px-3 py-1 rounded-full bg-teal-500/10">Invited ✓</span>
                                            ) : (
                                                <button
                                                    onClick={async () => {
                                                        await supabase.from('game_invites').insert({
                                                            sender_id: user.id,
                                                            receiver_id: friend.id,
                                                            game_type: 'number-duel',
                                                            join_code: match.join_code,
                                                        });
                                                        setInviteSent(friend.id);
                                                    }}
                                                    className="text-[9px] font-black uppercase px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-all shrink-0"
                                                >
                                                    Invite
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center gap-2 text-slate-500">
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Waiting for player...</span>
                            </div>
                        </motion.div>
                    ) : match.phase === 'finished' ? (
                        <motion.div key="finished" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 flex flex-col items-center text-center">
                             <div className="text-6xl mb-3">{match.winner_id === user.id ? '🏆' : '💀'}</div>
                             <h2 className="text-4xl font-black italic mb-2 tracking-tighter">
                                {match.winner_id === user.id ? 'VICTORY!' : 'DEFEAT'}
                             </h2>
                             <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6">
                                {match.winner_id === user.id ? 'You won the Duel!' : 'Better luck next time.'}
                             </p>
                             <button onClick={() => router.push('/arcade')} className="px-8 py-3 bg-white text-slate-950 rounded-xl font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all">
                                Back to Arcade
                             </button>
                        </motion.div>
                    ) : match.phase === 'round_end' ? (
                        <motion.div key="round_end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 flex flex-col items-center text-center">
                             <div className="text-4xl mb-3">🎯</div>
                             <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Round Finished</h2>
                             <p className="text-slate-400 text-xs mb-6 font-medium">Get ready for the next round.</p>
                             <button onClick={startNextRound} className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black uppercase text-xs tracking-widest transition-all">
                                Start Next Round
                             </button>
                        </motion.div>
                    ) : match.phase === 'picking' ? (
                        <motion.div key="picking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 py-2">
                            {!mySecret ? (
                                <>
                                    <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-2xl">
                                        <h3 className="text-lg font-black uppercase italic mb-1">Secret Number</h3>
                                        <p className="text-slate-400 text-xs font-medium">Pick a number between {match.range_min} and {match.range_max}.</p>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        <input 
                                            type="number" 
                                            value={secretPick} 
                                            onChange={(e) => setSecretPick(e.target.value)}
                                            disabled={isConfirmingSecret}
                                            className={`w-full bg-black/40 border rounded-2xl py-6 text-center text-5xl font-black transition-all font-mono focus:outline-none ${!isSecretValid && secretPick ? 'border-red-500 text-red-500' : 'border-white/10 text-amber-400 focus:border-rose-500/50'}`}
                                        />
                                        <button 
                                            onClick={handlePickSecret} 
                                            disabled={!isSecretValid || isConfirmingSecret}
                                            className="w-full py-4 bg-white text-slate-950 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-rose-500 hover:text-white disabled:opacity-20 disabled:hover:bg-white disabled:hover:text-slate-950 transition-all shadow-lg flex justify-center"
                                        >
                                            {isConfirmingSecret ? <span className="animate-pulse">Setting...</span> : 'Confirm Number'}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="py-8 text-center space-y-4">
                                    <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center text-3xl mx-auto border border-rose-500/20 animate-pulse">
                                        ⌛
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black uppercase tracking-widest">Waiting for Opponent</h3>
                                        <p className="text-slate-500 text-xs mt-1 font-medium">Opponent is choosing their number.</p>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                            
                            {/* HUD: Deduction Display */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className={`p-3 rounded-2xl border ${awaitingMyResponse ? 'bg-amber-500/10 border-amber-500/50' : 'bg-white/5 border-white/10'}`}>
                                    <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Game Status</p>
                                    <p className="font-black italic text-xs truncate uppercase tracking-tighter">
                                        {awaitingMyResponse ? 'RESPOND NOW!' : 
                                         awaitingOpponentResponse ? 'WAITING...' :
                                         isMyTurn ? 'YOUR TURN' : 'OPPONENT GUESSING'}
                                    </p>
                                </div>
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                                    <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Your Code</p>
                                    <div className="flex justify-between items-center">
                                        <span className="font-black text-amber-400 text-base font-mono">{mySecret}</span>
                                        <span className="text-[9px] text-slate-600 font-bold uppercase">{match.range_min}-{match.range_max}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Response Buttons Overlay for Non-Turn Player */}
                            {awaitingMyResponse ? (
                                <div className="py-2 space-y-3">
                                    <div className="text-center p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Opponent guessed</p>
                                        <p className="text-6xl font-black font-mono text-white mb-1">{latestGuess.guess}</p>
                                        <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Identify relationship to secret</p>
                                    </div>
                                    <div className="grid gap-2">
                                        {forcedMatch ? (
                                            <button onClick={() => handleResponse('correct')} className="py-4 bg-teal-500/20 border border-teal-500/50 rounded-xl font-black uppercase text-xs text-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.2)] hover:bg-teal-500 hover:text-white transition-all">Match ✓</button>
                                        ) : (
                                            <div className="grid grid-cols-3 gap-2">
                                                <button onClick={() => handleResponse('higher')} className="py-4 bg-white/5 border border-white/10 rounded-xl font-black uppercase text-xs hover:bg-rose-500/20 transition-all">Higher ↑</button>
                                                <button onClick={() => handleResponse('correct')} className="py-4 bg-teal-500/20 border border-teal-500/50 rounded-xl font-black uppercase text-[10px] text-teal-400 hover:bg-teal-500 hover:text-white transition-all">Match ✓</button>
                                                <button onClick={() => handleResponse('lower')} className="py-4 bg-white/5 border border-white/10 rounded-xl font-black uppercase text-xs hover:bg-rose-500/20 transition-all">Lower ↓</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : awaitingOpponentResponse ? (
                                <div className="py-8 space-y-3 text-center">
                                    <div className="w-20 h-20 mx-auto bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mb-3">
                                        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                    <h3 className="text-lg font-black uppercase tracking-widest text-amber-500">Guess Submitted</h3>
                                    <p className="text-slate-400 text-xs font-medium">Waiting for opponent to verify: <span className="text-white font-mono font-bold text-base">{latestGuess?.guess}</span></p>
                                </div>
                            ) : (
                                <>
                                    {/* Deduction Progress Bar */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[9px] font-black uppercase text-slate-500 tracking-widest px-1">
                                            <span>Min: {knownMin}</span>
                                            <span>Hot Zone ({remainingCount})</span>
                                            <span>Max: {knownMax}</span>
                                        </div>
                                        <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 flex">
                                            <div style={{ width: `${((knownMin || 0) / (match.range_max || 100)) * 100}%` }} className="bg-transparent" />
                                            <div style={{ width: `${(remainingCount / (match.range_max || 100)) * 100}%` }} className="bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)] h-full rounded-full" />
                                        </div>
                                    </div>

                                    {/* Main Input or Grid */}
                                    <div className="py-2">
                                        {showGrid ? (
                                            <div className="space-y-4">
                                                <div className="flex flex-wrap justify-center gap-2">
                                                    {Array.from({ length: remainingCount }, (_, i) => (knownMin || 0) + i).map(num => (
                                                        <button 
                                                            key={num}
                                                            onClick={() => setSelectedGridNumber(num)}
                                                            disabled={!isMyTurn || awaitingOpponentResponse}
                                                            className={`w-12 h-12 rounded-xl font-black font-mono text-lg border transition-all ${selectedGridNumber === num ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.5)] scale-110' : isMyTurn ? 'bg-white/5 border-white/10 hover:border-rose-500 hover:bg-rose-500/10' : 'bg-white/5 border-white/5 opacity-50'}`}
                                                        >
                                                            {num}
                                                        </button>
                                                    ))}
                                                </div>
                                                <button 
                                                    onClick={() => { handleGuess(selectedGridNumber as number); setSelectedGridNumber(null); }}
                                                    disabled={isSubmitting || selectedGridNumber === null}
                                                    className="w-full py-4 bg-gradient-to-r from-rose-500 to-rose-600 rounded-2xl text-white font-black text-sm tracking-[0.2em] uppercase shadow-[0_10px_30px_rgba(244,63,94,0.3)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-20 transition-all flex justify-center"
                                                >
                                                    {isSubmitting ? <span className="animate-pulse">Submitting...</span> : 'Submit Selected'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">

                                    {/* Guess Input */}
                                    <div className={`bg-white/5 border ${isMyTurn && !awaitingOpponentResponse ? 'border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.2)]' : 'border-white/10 opacity-50'} rounded-2xl p-4 relative group transition-all`}>
                                        <input 
                                            type="number"
                                            value={guess}
                                            onChange={(e) => setGuess(e.target.value)}
                                            disabled={!isMyTurn || awaitingOpponentResponse || isSubmitting}
                                            placeholder={isMyTurn && !awaitingOpponentResponse ? "?" : "WAIT"}
                                            className="w-full bg-transparent text-center text-6xl font-black text-rose-500 focus:outline-none placeholder:text-rose-500/20 font-mono disabled:opacity-50 py-2"
                                        />
                                        <div className="absolute top-2 right-3 text-[9px] text-slate-600 font-mono italic">
                                            {isMyTurn && !awaitingOpponentResponse ? "ready" : "locked"}
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => handleGuess()}
                                        disabled={isSubmitting || !guess || !isMyTurn || awaitingOpponentResponse}
                                        className="w-full py-4 bg-gradient-to-r from-rose-500 to-rose-600 rounded-2xl text-white font-black text-sm tracking-[0.2em] uppercase shadow-[0_5px_20px_rgba(244,63,94,0.3)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-20 transition-all flex justify-center"
                                    >
                                        {isSubmitting ? <span className="animate-pulse">Submitting...</span> : 'Submit Guess'}
                                    </button>
                                </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* Guess Logs */}
                            <div className="pt-3 border-t border-white/5">
                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-center mb-2">Guess History</p>
                                <div className="space-y-2 max-h-28 overflow-y-auto pr-1 flex flex-col-reverse">
                                    {currentRoundGuesses.filter(g => g.player_id === user.id).map((g, i) => (
                                        <div key={g.id} className="flex justify-between items-center p-2 px-3 rounded-xl border bg-white/5 border-white/5">
                                            <div className="flex items-center gap-3">
                                                 <span className="text-[8px] font-black uppercase text-slate-500">
                                                    YOUR GUESS
                                                 </span>
                                                 <span className="font-black font-mono text-base">{g.guess}</span>
                                            </div>
                                            <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${
                                                g.feedback === 'correct' ? 'text-teal-400 border-teal-400/30' : 
                                                g.feedback === 'higher' ? 'text-amber-400 border-amber-400/30' : 
                                                g.feedback === 'lower' ? 'text-blue-400 border-blue-400/30' : 
                                                'text-slate-600 border-white/5 bg-white/5'
                                            }`}>
                                                {g.feedback ? (g.feedback === 'correct' ? 'MATCH' : g.feedback.toUpperCase()) : 'PENDING...'}
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
