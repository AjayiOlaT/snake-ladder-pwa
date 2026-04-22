'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Suspense, useRef } from 'react';

export default function NumberDuelLobby() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading Lobby...</div>}>
            <LobbyContent />
        </Suspense>
    );
}

function LobbyContent() {
    const [supabase] = useState(() => createClient());
    const router = useRouter();
    const searchParams = useSearchParams();
    const [user, setUser] = useState<any>(null);
    
    const [isHosting, setIsHosting] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [joinPin, setJoinPin] = useState('');
    const [isEstablishing, setIsEstablishing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    
    // Advanced Settings
    const [rangeMin, setRangeMin] = useState(1);
    const [rangeMax, setRangeMax] = useState(100);
    const [roundsToWin, setRoundsToWin] = useState(3);
    const hasAutoChallenged = useRef(false);

    useEffect(() => {
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                setUser(session.user);
            } else if (event === 'INITIAL_SESSION' && !session) {
                router.replace('/login');
            }
        });

        // Auto-fill code from URL
        const code = searchParams.get('code');
        if (code) {
            setJoinPin(code.toUpperCase());
        }

        return () => authListener.subscription.unsubscribe();
    }, [supabase, router, searchParams]);

    useEffect(() => {
        if (!user || hasAutoChallenged.current) return;
        
        const challengeId = searchParams.get('challengeId');
        if (challengeId) {
            hasAutoChallenged.current = true;
            handleHostGame(challengeId);
        }
    }, [user, searchParams]);

    const handleHostGame = async (autoInviteId?: string) => {
        if (!user) return;
        setIsHosting(true);
        setIsEstablishing(true);
        setErrorMsg('');
        
        // Ensure values are numbers
        const min = parseInt(rangeMin.toString());
        const max = parseInt(rangeMax.toString());

        // Client-side PIN generation fallback to ensure immediate visibility
        const generatedPin = Math.random().toString(36).substring(2, 8).toUpperCase();

        const { data, error } = await supabase
            .from('number_duel_matches')
            .insert({ 
                player1_id: user.id,
                range_min: min,
                range_max: max,
                rounds_to_win: roundsToWin,
                status: 'waiting',
                phase: 'picking',
                join_code: generatedPin
            })
            .select()
            .single();
            
        if (error) {
            setIsHosting(false);
            setIsEstablishing(false);
            setErrorMsg('Failed to create game. ' + error.message);
            return;
        }

        if (autoInviteId) {
            await supabase.from('game_invites').insert({
                sender_id: user.id,
                receiver_id: autoInviteId,
                game_type: 'number-duel',
                join_code: data.join_code,
            });
        }
        
        // Small delay to ensure DB sync before routing
        setTimeout(() => {
            router.push(`/games/number-duel/${data.id}`);
        }, 800);
    };

    const handleJoinGame = async () => {
        if (!user || !joinPin || joinPin.length < 6) return;
        setIsJoining(true);
        setIsEstablishing(true);
        setErrorMsg('');

        const pin = joinPin.toUpperCase().trim();

        const { data: gameId, error } = await supabase
            .rpc('nd_join_game', { p_join_code: pin });

        if (error || !gameId) {
            setIsJoining(false);
            setIsEstablishing(false);
            setErrorMsg(
                error?.message?.includes('own game')
                    ? "You can't join your own game!"
                    : 'Invalid PIN or the game has already started!'
            );
            return;
        }

        setTimeout(() => {
            router.push(`/games/number-duel/${gameId}`);
        }, 800);
    };

    if (!user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading Command Center...</div>;

    return (
       <main className="flex flex-col items-center justify-center min-h-screen relative p-4 bg-slate-950 overflow-hidden">
          {/* Neural Bridge Overlay */}
          <AnimatePresence>
            {isEstablishing && (
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-2xl"
                >
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full border-t-2 border-rose-500 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-24 h-24 rounded-full border-b-2 border-amber-500 animate-spin-slow" />
                        </div>
                    </div>
                    <motion.div 
                        initial={{ y: 20, opacity: 0 }} 
                        animate={{ y: 0, opacity: 1 }} 
                        className="mt-8 text-center"
                    >
                        <h2 className="text-2xl font-black italic tracking-tighter text-white mb-2 uppercase">Bridging Neural Connection</h2>
                        <p className="text-rose-400 font-black text-[10px] tracking-[0.5em] uppercase animate-pulse">Synchronizing Standoff Parameters...</p>
                    </motion.div>
                </motion.div>
            )}
          </AnimatePresence>

          {/* Background aesthetics */}
          <div className="fixed inset-0 pointer-events-none z-0">
             <div className="absolute top-[10%] left-[10%] w-[400px] h-[400px] bg-rose-600/20 rounded-full blur-[150px]" />
             <div className="absolute top-[40%] right-[10%] w-[300px] h-[300px] bg-amber-500/20 rounded-full blur-[150px]" />
          </div>

          <div className="z-10 w-full max-w-4xl flex flex-col pt-4 pb-12 px-4 md:px-0">
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 sm:gap-0 mb-6 sm:mb-8">
                  <div>
                     <h2 className="text-[10px] sm:text-xs text-rose-400 font-black tracking-[0.3em] uppercase mb-0.5">Deduction Chamber</h2>
                     <h1 className="text-2xl sm:text-3xl md:text-4xl font-black leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 italic tracking-tighter">
                         NUMBER DUEL
                     </h1>
                  </div>
                  
                  <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto text-left sm:text-right bg-white/5 sm:bg-transparent p-3 sm:p-0 rounded-2xl sm:rounded-none border sm:border-0 border-white/5">
                      <button onClick={() => router.push('/arcade')} className="text-xs text-slate-400 hover:text-white font-bold uppercase tracking-widest transition-colors mb-2">
                          ← Back to Arcade
                      </button>
                      <p className="text-white font-bold text-xs sm:text-base truncate">{user?.user_metadata?.full_name || user?.email}</p>
                  </div>
              </div>

              {errorMsg && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-100 text-center font-bold">
                      {errorMsg}
                  </motion.div>
              )}

              <div className="grid md:grid-cols-2 gap-8">
                  
                  {/* HOST PANEL */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-5 md:p-8 flex flex-col shadow-2xl relative overflow-hidden group hover:border-rose-500/50 transition-colors">
                      <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="relative z-10">
                        <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center text-2xl mb-4 shadow-inner border border-rose-500/30">
                            ⚔️
                        </div>
                        <h2 className="text-xl font-black text-white mb-1 uppercase italic tracking-tight">Host Duel</h2>
                        <p className="text-slate-400 font-medium text-[11px] mb-6">Initialize a mental standoff. Configure parameters.</p>
                        
                        <div className="space-y-6 mb-8">
                            {/* Range Setting */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-end">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Number Range</label>
                                    <span className="text-rose-400 font-mono font-black">{rangeMin} — {rangeMax}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <input 
                                        type="number" 
                                        value={rangeMin} 
                                        onChange={(e) => setRangeMin(parseInt(e.target.value))}
                                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-center font-mono text-white focus:outline-none focus:border-rose-500/50"
                                    />
                                    <input 
                                        type="number" 
                                        value={rangeMax} 
                                        onChange={(e) => setRangeMax(parseInt(e.target.value))}
                                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-center font-mono text-white focus:outline-none focus:border-rose-500/50"
                                    />
                                </div>
                            </div>

                            {/* Rounds Setting */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">First to Win (Rounds)</label>
                                <div className="flex gap-2">
                                    {[1, 3, 5, 7].map(r => (
                                        <button 
                                            key={r}
                                            onClick={() => setRoundsToWin(r)}
                                            className={`flex-1 py-2 rounded-xl font-black border transition-all ${roundsToWin === r ? 'bg-rose-500 border-rose-400 text-white shadow-lg' : 'bg-white/5 border-white/10 text-slate-500 hover:bg-white/10'}`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button 
                            onClick={() => handleHostGame()}
                            disabled={isHosting || isNaN(rangeMin) || isNaN(rangeMax) || rangeMax <= rangeMin}
                            className="w-full py-4 bg-gradient-to-r from-rose-500 to-rose-600 rounded-xl text-white font-black text-lg tracking-wider uppercase shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-transform flex justify-center disabled:opacity-30 disabled:hover:scale-100"
                        >
                            {isHosting ? <span className="animate-pulse">Initializing Duel...</span> : 'Engage Link'}
                        </button>
                      </div>
                  </div>

                  {/* JOIN PANEL */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-5 md:p-8 flex flex-col shadow-2xl relative overflow-hidden group hover:border-amber-500/50 transition-colors">
                      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-2xl mb-4 shadow-inner border border-amber-500/30">
                            🛡️
                        </div>
                        <h2 className="text-xl font-black text-white mb-1 uppercase italic tracking-tight">Join Duel</h2>
                        <p className="text-slate-400 font-medium text-[11px] mb-8">Enter a Strike PIN to join a session.</p>
                        
                        <div className="mt-auto space-y-4">
                            <input 
                                type="text"
                                maxLength={6}
                                placeholder="STRIKE PIN"
                                value={joinPin}
                                onChange={(e) => setJoinPin(e.target.value.toUpperCase())}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-6 py-5 text-center text-3xl font-black text-amber-300 tracking-[0.5em] focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500 placeholder:text-slate-700 transition-all font-mono"
                            />

                            <button 
                                onClick={handleJoinGame}
                                disabled={isJoining || joinPin.length !== 6}
                                className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl text-white font-black text-lg tracking-wider uppercase shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:hover:scale-100 transition-all flex justify-center"
                            >
                                {isJoining ? <span className="animate-pulse">Connecting...</span> : 'Engage'}
                            </button>
                        </div>
                      </div>
                  </div>

              </div>
          </div>
       </main>
    )
}
