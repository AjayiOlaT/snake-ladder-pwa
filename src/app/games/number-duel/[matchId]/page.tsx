'use client';

import { useState, useEffect } from 'react';
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

    useEffect(() => {
        if (!matchId) return;

        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.replace('/login'); return; }
            setUser(session.user);

            const { data, error } = await supabase.from('number_duel_matches').select('*').eq('id', matchId).single();
            if (error || !data) { router.replace('/arcade'); return; }
            setMatch(data);

            // Fetch guesses
            const { data: gData } = await supabase.from('number_duel_guesses').select('*').eq('match_id', matchId).order('created_at', { ascending: false });
            setGuesses(gData || []);
        })();

        const channel = supabase.channel(`nd-${matchId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'number_duel_matches', filter: `id=eq.${matchId}` }, (payload) => {
                setMatch(payload.new);
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'number_duel_guesses', filter: `match_id=eq.${matchId}` }, (payload) => {
                setGuesses(prev => [payload.new, ...prev]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [matchId, supabase, router]);

    const handlePickSecret = async () => {
        if (!user || !match || !secretPick) return;
        const num = parseInt(secretPick);
        if (isNaN(num) || num < 1 || num > 100) return;

        const isP1 = user.id === match.player1_id;
        const update = isP1 ? { p1_secret_number: num } : { p2_secret_number: num };

        const { error } = await supabase.from('number_duel_matches').update(update).eq('id', matchId);
        if (error) alert(error.message);
    };

    const handleGuess = async () => {
        if (!user || !match || !guess || isSubmitting) return;
        if (match.current_turn_id !== user.id) return;

        setIsSubmitting(true);
        const num = parseInt(guess);
        const isP1 = user.id === match.player1_id;
        const target = isP1 ? match.p2_secret_number : match.p1_secret_number;

        let result = '';
        if (num === target) result = 'correct';
        else if (num < target) result = 'higher';
        else result = 'lower';

        // Insert guess
        await supabase.from('number_duel_guesses').insert({
            match_id: matchId,
            player_id: user.id,
            guess: num,
            result: result
        });

        // Update turn or finish game
        const update: any = {
            current_turn_id: isP1 ? match.player2_id : match.player1_id
        };
        if (result === 'correct') {
            update.status = 'finished';
            update.winner_id = user.id;
        }

        await supabase.from('number_duel_matches').update(update).eq('id', matchId);
        
        setGuess('');
        setIsSubmitting(false);
    };

    if (!match || !user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white italic tracking-widest text-sm animate-pulse px-6 py-4 rounded-full border border-white/5">Accessing Neural Link...</div>;

    const isP1 = user.id === match.player1_id;
    const mySecret = isP1 ? match.p1_secret_number : match.p2_secret_number;
    const oppSecret = isP1 ? match.p2_secret_number : match.p1_secret_number;
    const isMyTurn = match.current_turn_id === user.id;

    return (
        <main className="min-h-screen bg-slate-950 text-white p-4 md:p-12 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[20%] left-[20%] w-[400px] h-[400px] bg-rose-600/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[20%] right-[20%] w-[400px] h-[400px] bg-amber-500/10 rounded-full blur-[120px]" />
            </div>

            <div className="z-10 w-full max-w-2xl bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[3rem] p-8 md:p-12 shadow-2xl relative">
                
                {match.status === 'finished' && (
                    <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-xl rounded-[3rem] flex flex-col items-center justify-center p-8 text-center border-4 border-rose-500/50">
                        <div className="text-8xl mb-6">{match.winner_id === user.id ? '🏆' : '💀'}</div>
                        <h1 className="text-6xl font-black mb-2 tracking-tighter">
                            {match.winner_id === user.id ? 'VICTORY' : 'DEFEATED'}
                        </h1>
                        <p className="text-slate-400 mb-8 max-w-xs uppercase tracking-widest font-bold">
                            {match.winner_id === user.id ? 'You successfully deciphered the target neural code.' : 'The opponent synchronized first. System compromise terminal.'}
                        </p>
                        <button onClick={() => router.push('/arcade')} className="px-8 py-4 bg-white text-slate-950 rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-105 active:scale-95 transition-all">
                            Return to Arcade
                        </button>
                    </div>
                )}

                <div className="flex justify-between items-start mb-10">
                    <div className="text-left">
                        <h2 className="text-rose-400 font-black uppercase tracking-[0.3em] text-[10px] mb-1">Neural Duel Protocol</h2>
                        <h1 className="text-3xl font-black italic tracking-tighter">Strike Phase</h1>
                    </div>
                    <div className="bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {match.difficulty} MODE
                    </div>
                </div>

                {match.status === 'waiting' ? (
                    <div className="space-y-8 py-10">
                        <div className="flex justify-center">
                            <div className="w-16 h-16 rounded-full border-4 border-t-rose-500 border-white/5 animate-spin" />
                        </div>
                        <p className="text-slate-400 font-bold uppercase tracking-widest animate-pulse">Waiting for an opponent to bridge the link...</p>
                        <div className="bg-black/30 p-8 rounded-3xl border border-white/5">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.4em] mb-3">Transmission key</p>
                            <p className="text-5xl font-mono font-black text-amber-400 tracking-[0.3em]">{match.join_code}</p>
                        </div>
                    </div>
                ) : !mySecret ? (
                    <div className="space-y-8 py-6">
                        <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                            <p className="text-xs font-bold text-rose-300 uppercase tracking-widest mb-2">Phase: Calibration</p>
                            <h3 className="text-xl font-black">Set Your Secret Target</h3>
                            <p className="text-slate-400 text-sm mt-1">Select an integer between 1 and 100 for your opponent to decipher.</p>
                        </div>
                        <div className="flex flex-col gap-4">
                            <input 
                                type="number" 
                                min="1" max="100"
                                value={secretPick}
                                onChange={(e) => setSecretPick(e.target.value)}
                                className="bg-black/40 border border-white/10 rounded-2xl px-6 py-6 text-center text-5xl font-black text-amber-300 focus:outline-none focus:border-rose-500/50 transition-all font-mono"
                            />
                            <button onClick={handlePickSecret} className="w-full py-5 bg-white text-slate-950 rounded-2xl font-black text-lg tracking-widest uppercase hover:bg-rose-500 hover:text-white transition-all shadow-xl">
                                Confirm Signal
                            </button>
                        </div>
                    </div>
                ) : !oppSecret ? (
                    <div className="space-y-8 py-12 text-center">
                        <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center text-4xl mx-auto border border-amber-500/20 animate-pulse">
                            ⏳
                        </div>
                        <div>
                            <p className="text-amber-400 font-black uppercase tracking-[0.3em] text-xs">Waiting for Opponent</p>
                            <h3 className="text-2xl font-black mt-2">Target Calibration in Progress</h3>
                            <p className="text-slate-500 text-sm mt-2 font-medium">Your opponent is still selecting their secret neural sequence.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-8">
                        <div className="grid grid-cols-2 gap-4">
                            <div className={`p-5 rounded-[2rem] border transition-all duration-500 ${isMyTurn ? 'bg-rose-500/10 border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.2)]' : 'bg-white/5 border-white/10 opacity-50'}`}>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Turn Status</p>
                                <p className={`text-xl font-black tracking-tight ${isMyTurn ? 'text-white' : 'text-slate-400'}`}>
                                    {isMyTurn ? 'YOUR STRIKE' : 'OPPONENT SCAN'}
                                </p>
                            </div>
                            <div className="p-5 rounded-[2rem] bg-white/5 border border-white/10">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Your Code</p>
                                <p className="text-xl font-black text-amber-400 font-mono tracking-widest">{mySecret}</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 py-4">
                            <div className="relative">
                                <input 
                                    type="number" 
                                    placeholder="00"
                                    value={guess}
                                    onChange={(e) => setGuess(e.target.value)}
                                    disabled={!isMyTurn || isSubmitting}
                                    className={`w-full bg-black/40 border border-white/10 rounded-3xl px-6 py-10 text-center text-7xl font-black text-rose-500 focus:outline-none focus:border-rose-500 transition-all font-mono disabled:opacity-30 disabled:grayscale ${guess ? 'shadow-[inner_0_0_30px_rgba(244,63,94,0.1)]' : ''}`}
                                />
                                {isMyTurn && (
                                    <div className="absolute top-4 right-6 text-[10px] font-black text-rose-500/50 uppercase tracking-widest animate-pulse">Ready</div>
                                )}
                            </div>
                            <button 
                                onClick={handleGuess}
                                disabled={!isMyTurn || isSubmitting || !guess}
                                className="w-full py-6 bg-gradient-to-r from-rose-600 to-rose-700 rounded-2xl text-white font-black text-xl tracking-[0.2em] uppercase shadow-[0_10px_40px_rgba(225,29,72,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-0 disabled:pointer-events-none"
                            >
                                Execute strike
                            </button>
                        </div>

                        {/* Recent History */}
                        <div className="pt-6 border-t border-white/5 text-left">
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-4 text-center">Neural Logs</p>
                            <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                {guesses.length === 0 ? (
                                    <p className="text-center text-slate-700 font-bold uppercase tracking-widest text-[10px] py-4">No data streams detected</p>
                                ) : (
                                    guesses.map((g: any, i: number) => (
                                        <div key={g.id} className={`flex justify-between items-center p-3 rounded-xl border ${g.player_id === user.id ? 'bg-white/5 border-white/5' : 'bg-rose-500/5 border-rose-500/10'}`}>
                                            <div className="flex items-center gap-3">
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${g.player_id === user.id ? 'text-slate-500' : 'text-rose-400'}`}>
                                                    {g.player_id === user.id ? 'YOU' : 'OPP'}
                                                </span>
                                                <span className="text-lg font-black font-mono">{g.guess}</span>
                                            </div>
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                                                g.result === 'correct' ? 'text-teal-400 border-teal-400/30' : 
                                                g.result === 'higher' ? 'text-amber-400 border-amber-400/30' : 
                                                'text-rose-400 border-rose-400/30'
                                            }`}>
                                                {g.result === 'correct' ? 'SYNCED' : g.result.toUpperCase()}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
            `}</style>
        </main>
    );
}
