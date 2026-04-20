'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function NumberDuelLobby() {
    const [supabase] = useState(() => createClient());
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    
    const [isHosting, setIsHosting] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [joinPin, setJoinPin] = useState('');
    const [difficulty, setDifficulty] = useState('classic');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                setUser(session.user);
            } else if (event === 'INITIAL_SESSION' && !session) {
                router.replace('/login');
            }
        });
        return () => authListener.subscription.unsubscribe();
    }, [supabase, router]);

    const handleHostGame = async () => {
        if (!user) return;
        setIsHosting(true);
        setErrorMsg('');
        
        // Initial setup for Number Duel: Pick a random target if needed,
        // or let the host pick it in the next screen.
        const { data, error } = await supabase
            .from('number_duel_matches')
            .insert({ 
                player1_id: user.id,
                difficulty: difficulty,
                status: 'waiting'
            })
            .select()
            .single();
            
        setIsHosting(false);
        
        if (error) {
            setErrorMsg('Failed to create game. ' + error.message);
            return;
        }
        
        router.push(`/games/number-duel/${data.id}`);
    };

    const handleJoinGame = async () => {
        if (!user || !joinPin || joinPin.length < 6) return;
        setIsJoining(true);
        setErrorMsg('');

        const pin = joinPin.toUpperCase().trim();

        const { data: gameId, error } = await supabase
            .rpc('nd_join_game', { p_join_code: pin });

        setIsJoining(false);

        if (error || !gameId) {
            setErrorMsg(
                error?.message?.includes('own game')
                    ? "You can't join your own game!"
                    : 'Invalid PIN or the game has already started!'
            );
            return;
        }

        router.push(`/games/number-duel/${gameId}`);
    };

    if (!user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading Command Center...</div>;

    return (
       <main className="flex flex-col items-center justify-center min-h-screen relative p-4 bg-slate-950 overflow-hidden">
          {/* Background aesthetics */}
          <div className="fixed inset-0 pointer-events-none z-0">
             <div className="absolute top-[10%] left-[10%] w-[400px] h-[400px] bg-rose-600/20 rounded-full blur-[150px]" />
             <div className="absolute top-[40%] right-[10%] w-[300px] h-[300px] bg-amber-500/20 rounded-full blur-[150px]" />
          </div>

          <div className="z-10 w-full max-w-4xl flex flex-col pt-10 pb-20 px-4 md:px-0">
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 sm:gap-0 mb-8 sm:mb-12">
                  <div>
                     <h2 className="text-sm sm:text-xl text-rose-400 font-bold tracking-widest uppercase mb-1">Deduction Chamber</h2>
                     <h1 className="text-3xl sm:text-4xl md:text-5xl font-black leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
                         Number Duel Lobby
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
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 md:p-10 flex flex-col shadow-2xl relative overflow-hidden group hover:border-rose-500/50 transition-colors">
                      <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="relative z-10">
                        <div className="w-16 h-16 rounded-2xl bg-rose-500/20 flex items-center justify-center text-4xl mb-6 shadow-inner border border-rose-500/30">
                            ⚔️
                        </div>
                        <h2 className="text-3xl font-black text-white mb-2">Host Duel</h2>
                        <p className="text-slate-400 font-medium mb-8">Initiate a mental standoff. Generate a PIN and wait for a worthy opponent to bridge the gap.</p>
                        
                        <div className="space-y-4 mb-8">
                            <label className="text-sm font-bold text-slate-300 uppercase tracking-widest">Select Ruleset</label>
                            <div className="grid grid-cols-2 gap-3">
                                {['classic', 'insane'].map((level) => (
                                    <button 
                                        key={level}
                                        onClick={() => setDifficulty(level)}
                                        className={`py-3 rounded-xl font-bold uppercase tracking-wide text-xs md:text-sm border transition-all ${difficulty === level ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.5)]' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                    >
                                        {level}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button 
                            onClick={handleHostGame}
                            disabled={isHosting}
                            className="w-full py-4 bg-gradient-to-r from-rose-500 to-rose-600 rounded-xl text-white font-black text-lg tracking-wider uppercase shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-transform flex justify-center"
                        >
                            {isHosting ? <span className="animate-pulse">Initializing Duel...</span> : 'Generate PIN'}
                        </button>
                      </div>
                  </div>

                  {/* JOIN PANEL */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 md:p-10 flex flex-col shadow-2xl relative overflow-hidden group hover:border-amber-500/50 transition-colors">
                      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center text-4xl mb-6 shadow-inner border border-amber-500/30">
                            🛡️
                        </div>
                        <h2 className="text-3xl font-black text-white mb-2">Join Duel</h2>
                        <p className="text-slate-400 font-medium mb-12">Enter a 6-digit Strike PIN to enter an ongoing mental warfare session.</p>
                        
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
