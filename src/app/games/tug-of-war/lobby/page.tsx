'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import CustomSelect from '../../../../components/CustomSelect';

export default function TugOfWarLobby() {
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
    const [showRules, setShowRules] = useState(false);
    
    // Game Config
    const [subject, setSubject] = useState('Math');
    const [difficulty, setDifficulty] = useState('easy');
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
        
        // Multiplier based on difficulty
        const multiplier = difficulty === 'hard' ? 3.0 : difficulty === 'medium' ? 2.0 : 1.0;

        const { data, error } = await supabase
            .from('tug_of_war_matches')
            .insert({ 
                p1_id: user.id,
                p1_config: { subject, difficulty, multiplier },
                status: 'waiting'
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
                game_type: 'tug-of-war',
                join_code: data.join_code,
            });
        }
        
        setTimeout(() => {
            router.push(`/games/tug-of-war/${data.id}`);
        }, 800);
    };

    const handleJoinGame = async () => {
        if (!user || !joinPin || joinPin.length < 6) return;
        setIsJoining(true);
        setIsEstablishing(true);
        setErrorMsg('');

        const pin = joinPin.toUpperCase().trim();

        // Join the match
        const { data: gameId, error } = await supabase
            .rpc('tow_join_match', { p_join_code: pin });

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

        // After joining, update p2_config
        const multiplier = difficulty === 'hard' ? 3.0 : difficulty === 'medium' ? 2.0 : 1.0;
        await supabase
            .from('tug_of_war_matches')
            .update({ 
                p2_config: { subject, difficulty, multiplier } 
            })
            .eq('id', gameId);

        setTimeout(() => {
            router.push(`/games/tug-of-war/${gameId}`);
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
                        <div className="w-32 h-32 rounded-full border-t-2 border-purple-500 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-24 h-24 rounded-full border-b-2 border-indigo-500 animate-spin-slow" />
                        </div>
                    </div>
                    <motion.div 
                        initial={{ y: 20, opacity: 0 }} 
                        animate={{ y: 0, opacity: 1 }} 
                        className="mt-8 text-center"
                    >
                        <h2 className="text-2xl font-black italic tracking-tighter text-white mb-2 uppercase">Initializing Rope Tension</h2>
                        <p className="text-purple-400 font-black text-[10px] tracking-[0.5em] uppercase animate-pulse">Syncing Question Engine...</p>
                    </motion.div>
                </motion.div>
            )}
          </AnimatePresence>

          {/* Background aesthetics */}
          <div className="fixed inset-0 pointer-events-none z-0">
             <div className="absolute top-[10%] left-[10%] w-[400px] h-[400px] bg-purple-600/20 rounded-full blur-[150px]" />
             <div className="absolute top-[40%] right-[10%] w-[300px] h-[300px] bg-indigo-500/20 rounded-full blur-[150px]" />
          </div>

          <div className="z-10 w-full max-w-4xl flex flex-col pt-4 pb-12 px-4 md:px-0">
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 sm:gap-0 mb-6 sm:mb-8">
                  <div>
                     <h2 className="text-[10px] sm:text-xs text-purple-400 font-black tracking-[0.3em] uppercase mb-0.5">Physical Intelligence</h2>
                     <h1 className="text-2xl sm:text-3xl md:text-4xl font-black leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 italic tracking-tighter">
                         TUG OF WAR
                     </h1>
                  </div>
                  
                  <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto text-left sm:text-right bg-white/5 sm:bg-transparent p-3 sm:p-0 rounded-2xl sm:rounded-none border sm:border-0 border-white/5">
                      <button onClick={() => router.push('/arcade')} className="text-xs text-slate-400 hover:text-white font-bold uppercase tracking-widest transition-colors mb-2">
                          ← Back to Arcade
                      </button>
                      <button onClick={() => router.push('/games/tug-of-war/questions')} className="text-[10px] text-purple-400 hover:text-purple-300 font-black uppercase tracking-widest transition-colors mb-2">
                          Manage Questions ⚙️
                      </button>
                      <p className="text-white font-bold text-xs sm:text-base truncate">{user?.user_metadata?.full_name || user?.email}</p>
                      <button onClick={() => setShowRules(true)} className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white transition-colors mt-2">
                          View Rules
                      </button>
                  </div>
              </div>

              {errorMsg && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-100 text-center font-bold">
                      {errorMsg}
                  </motion.div>
              )}

              <div className="grid md:grid-cols-2 gap-8">
                  
                  {/* HOST PANEL */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-5 md:p-8 flex flex-col shadow-2xl relative overflow-hidden group hover:border-purple-500/50 transition-colors">
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="relative z-10">
                        <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center text-2xl mb-4 shadow-inner border border-purple-500/30">
                            🏗️
                        </div>
                        <h2 className="text-xl font-black text-white mb-1 uppercase italic tracking-tight">Host Match</h2>
                        <p className="text-slate-400 font-medium text-[11px] mb-6">Create a rope arena and set your specialty.</p>
                        
                        <div className="space-y-6 mb-8">
                            {/* Subject Setting */}
                            <CustomSelect 
                                label="Subject Area"
                                value={subject}
                                onChange={setSubject}
                                options={[
                                    { value: 'Math', label: 'Mathematics' },
                                    { value: 'Science', label: 'Science (Coming Soon)', disabled: true },
                                    { value: 'History', label: 'History (Coming Soon)', disabled: true }
                                ]}
                            />

                            {/* Difficulty Setting */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Your Difficulty (Professor vs Student)</label>
                                <div className="flex gap-2">
                                    {['easy', 'medium', 'hard'].map(d => (
                                        <button 
                                            key={d}
                                            onClick={() => setDifficulty(d)}
                                            className={`flex-1 py-2 rounded-xl font-black border transition-all text-[10px] uppercase tracking-widest ${difficulty === d ? 'bg-purple-500 border-purple-400 text-white shadow-lg' : 'bg-white/5 border-white/10 text-slate-500 hover:bg-white/10'}`}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[9px] text-slate-500 font-medium">Harder difficulty = Stronger pull per answer.</p>
                            </div>
                        </div>

                        <button 
                            onClick={() => handleHostGame()}
                            disabled={isHosting}
                            className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl text-white font-black text-lg tracking-wider uppercase shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-transform flex justify-center disabled:opacity-30 disabled:hover:scale-100"
                        >
                            {isHosting ? <span className="animate-pulse">Opening Arena...</span> : 'Generate Arena'}
                        </button>
                      </div>
                  </div>

                  {/* JOIN PANEL */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-5 md:p-8 flex flex-col shadow-2xl relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-2xl mb-4 shadow-inner border border-indigo-500/30">
                            🔗
                        </div>
                        <h2 className="text-xl font-black text-white mb-1 uppercase italic tracking-tight">Join Match</h2>
                        <p className="text-slate-400 font-medium text-[11px] mb-8">Enter an Arena Code to join a battle.</p>
                        
                        <div className="mt-auto space-y-6">
                            {/* Joint Config */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Your Challenge Difficulty</label>
                                <div className="flex gap-2">
                                    {['easy', 'medium', 'hard'].map(d => (
                                        <button 
                                            key={d}
                                            onClick={() => setDifficulty(d)}
                                            className={`flex-1 py-2 rounded-xl font-black border transition-all text-[10px] uppercase tracking-widest ${difficulty === d ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg' : 'bg-white/5 border-white/10 text-slate-500 hover:bg-white/10'}`}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <input 
                                type="text"
                                maxLength={6}
                                placeholder="ARENA CODE"
                                value={joinPin}
                                onChange={(e) => setJoinPin(e.target.value.toUpperCase())}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-6 py-5 text-center text-3xl font-black text-indigo-300 tracking-[0.5em] focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-700 transition-all font-mono"
                            />

                            <button 
                                onClick={handleJoinGame}
                                disabled={isJoining || joinPin.length !== 6}
                                className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl text-white font-black text-lg tracking-wider uppercase shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:hover:scale-100 transition-all flex justify-center"
                            >
                                {isJoining ? <span className="animate-pulse">Linking Arena...</span> : 'Enter Battle'}
                            </button>
                        </div>
                      </div>
                  </div>

              </div>
          </div>

          {/* Rules Modal */}
          <AnimatePresence>
            {showRules && (
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md"
                >
                    <motion.div 
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        className="bg-white/10 border border-white/10 rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-6">
                            <button onClick={() => setShowRules(false)} className="text-2xl opacity-50 hover:opacity-100 transition-opacity">✕</button>
                        </div>
                        
                        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white mb-6">Battle Rules</h2>
                        
                        <div className="space-y-6 text-slate-300">
                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-xl shrink-0">🧠</div>
                                <div>
                                    <h3 className="font-black text-white uppercase text-xs tracking-widest mb-1">Neural Speed</h3>
                                    <p className="text-xs leading-relaxed font-medium">This is an asynchronous race. There are no turns. Answer as fast as possible to pull the rope.</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xl shrink-0">⚖️</div>
                                <div>
                                    <h3 className="font-black text-white uppercase text-xs tracking-widest mb-1">Difficulty Equalizer</h3>
                                    <p className="text-xs leading-relaxed font-medium">"Hard" questions are 3x more powerful than "Easy" ones. A Professor and Student can play fairly!</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-xl shrink-0">🏁</div>
                                <div>
                                    <h3 className="font-black text-white uppercase text-xs tracking-widest mb-1">Victory Condition</h3>
                                    <p className="text-xs leading-relaxed font-medium">Pull the rope completely to your side (-100 or 100) to win the match.</p>
                                </div>
                            </div>
                        </div>

                        <button 
                            onClick={() => setShowRules(false)}
                            className="w-full mt-8 py-4 bg-white text-slate-950 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-purple-500 hover:text-white transition-all shadow-xl"
                        >
                            Understood
                        </button>
                    </motion.div>
                </motion.div>
            )}
          </AnimatePresence>
       </main>
    )
}
