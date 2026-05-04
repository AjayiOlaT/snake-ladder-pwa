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
    
    const [gameMode, setGameMode] = useState<'selection' | 'online' | 'local'>('selection');
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
            setGameMode('online');
            setIsJoining(true);
        }

        return () => authListener.subscription.unsubscribe();
    }, [supabase, router, searchParams]);

    useEffect(() => {
        if (!user || hasAutoChallenged.current) return;
        
        const challengeId = searchParams.get('challengeId');
        if (challengeId) {
            hasAutoChallenged.current = true;
            setGameMode('online');
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

    const handleStartLocalGame = () => {
        setIsEstablishing(true);
        setTimeout(() => {
            router.push(`/games/tug-of-war/local?subject=${subject}&difficulty=${difficulty}`);
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
       <main className="flex flex-col items-center justify-center min-h-screen relative p-4 bg-md-surface overflow-hidden">
          {/* Material Loading Overlay */}
          <AnimatePresence>
            {isEstablishing && (
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-md-surface/80 backdrop-blur-xl"
                >
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full border-4 border-md-primary/20 border-t-md-primary animate-spin" />
                    </div>
                    <motion.div 
                        initial={{ y: 10, opacity: 0 }} 
                        animate={{ y: 0, opacity: 1 }} 
                        className="mt-6 text-center"
                    >
                        <h2 className="text-xl font-semibold text-md-on-surface mb-1">Setting up the Arena</h2>
                        <p className="text-md-primary font-bold text-[10px] tracking-widest uppercase animate-pulse">Syncing Question Engine</p>
                    </motion.div>
                </motion.div>
            )}
          </AnimatePresence>

          {/* Subtle Background Accents */}
          <div className="fixed inset-0 pointer-events-none z-0">
             <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-md-primary/5 rounded-full blur-[120px]" />
             <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-md-secondary/5 rounded-full blur-[120px]" />
          </div>

          <div className="z-10 w-full max-w-5xl flex flex-col pt-8 pb-16 px-4">
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 mb-12">
                  <div className="space-y-1">
                     <div className="inline-flex items-center gap-2 px-3 py-1 bg-md-primary-container text-md-on-primary-container rounded-full text-[10px] font-bold uppercase tracking-wider">
                        <span>Physical Intelligence</span>
                     </div>
                     <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-md-on-surface">
                         Tug of War
                     </h1>
                  </div>
                  
                  <div className="flex flex-col items-start sm:items-end gap-3">
                      <div className="flex gap-4">
                          <button onClick={() => router.push('/arcade')} className="text-xs font-bold text-md-outline hover:text-md-primary transition-colors flex items-center gap-1">
                              ← Back to Arcade
                          </button>
                          <button onClick={() => router.push('/games/tug-of-war/questions')} className="text-xs font-bold text-md-primary hover:underline flex items-center gap-1">
                              Manage Questions ⚙️
                          </button>
                      </div>
                      <div className="flex flex-col items-start sm:items-end">
                          <p className="text-md-on-surface font-semibold text-sm">{user?.user_metadata?.full_name || user?.email}</p>
                          <button onClick={() => setShowRules(true)} className="text-[10px] font-bold uppercase tracking-wider text-md-outline hover:text-md-primary transition-colors">
                              How to Play
                          </button>
                      </div>
                  </div>
              </div>

              {errorMsg && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mb-8 p-4 bg-md-error/10 border border-md-error/20 rounded-2xl text-md-error text-center font-medium text-sm">
                      {errorMsg}
                  </motion.div>
              )}

              <AnimatePresence mode="wait">
                {gameMode === 'selection' ? (
                  <motion.div 
                    key="selection"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="grid md:grid-cols-2 gap-8"
                  >
                      {/* LOCAL DUEL CARD */}
                      <button 
                        onClick={() => setGameMode('local')}
                        className="group relative bg-md-surface-variant/20 border border-md-outline/10 rounded-[2.5rem] p-10 flex flex-col items-center text-center hover:bg-md-primary/5 hover:border-md-primary/30 transition-all duration-300"
                      >
                        <div className="w-24 h-24 rounded-[2rem] bg-md-primary-container text-md-on-primary-container flex items-center justify-center text-5xl mb-8 group-hover:scale-110 transition-transform duration-500 shadow-sm">
                            📱
                        </div>
                        <h2 className="text-3xl font-bold text-md-on-surface mb-3">Local Duel</h2>
                        <p className="text-md-on-surface-variant text-sm max-w-[240px] leading-relaxed">Face off against a friend on this very device. Direct battle!</p>
                        
                        <div className="mt-10 px-10 py-4 bg-md-primary rounded-full text-md-on-primary font-bold text-sm shadow-lg shadow-md-primary/20 group-hover:shadow-md-primary/40 transition-all">
                            Setup Arena
                        </div>
                      </button>

                      {/* ONLINE WAR CARD */}
                      <button 
                        onClick={() => setGameMode('online')}
                        className="group relative bg-md-surface-variant/20 border border-md-outline/10 rounded-[2.5rem] p-10 flex flex-col items-center text-center hover:bg-md-secondary/5 hover:border-md-secondary/30 transition-all duration-300"
                      >
                        <div className="w-24 h-24 rounded-[2rem] bg-md-secondary-container text-md-on-secondary-container flex items-center justify-center text-5xl mb-8 group-hover:scale-110 transition-transform duration-500 shadow-sm">
                            🌍
                        </div>
                        <h2 className="text-3xl font-bold text-md-on-surface mb-3">Online War</h2>
                        <p className="text-md-on-surface-variant text-sm max-w-[240px] leading-relaxed">Challenge someone anywhere in the world. Remote warfare!</p>
                        
                        <div className="mt-10 px-10 py-4 bg-md-secondary rounded-full text-md-on-secondary font-bold text-sm shadow-lg shadow-md-secondary/20 group-hover:shadow-md-secondary/40 transition-all">
                            Enter Lobby
                        </div>
                      </button>
                  </motion.div>
                ) : gameMode === 'local' ? (
                  <motion.div 
                    key="local"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex flex-col gap-8 items-center"
                  >
                    <button 
                        onClick={() => setGameMode('selection')}
                        className="self-start text-[10px] font-bold uppercase tracking-widest text-md-outline hover:text-md-primary transition-colors flex items-center gap-2"
                    >
                        ← Back to Mode Selection
                    </button>

                    <div className="w-full max-w-xl bg-md-surface border border-md-outline/10 rounded-[2.5rem] p-10 md:p-14 flex flex-col shadow-xl relative overflow-hidden">
                        <div className="relative z-10 text-center">
                            <div className="w-20 h-20 rounded-3xl bg-md-primary/10 mx-auto flex items-center justify-center text-4xl mb-8 border border-md-primary/20">
                                ⚔️
                            </div>
                            <h2 className="text-3xl font-bold text-md-on-surface mb-2">Arena Setup</h2>
                            <p className="text-md-on-surface-variant text-sm mb-12">Configure your local battle arena.</p>
                            
                            <div className="space-y-10 text-left mb-12">
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
                                <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-md-outline uppercase tracking-widest ml-1">Duel Difficulty</label>
                                    <div className="flex gap-3">
                                        {['easy', 'medium', 'hard'].map(d => (
                                            <button key={d} onClick={() => setDifficulty(d)} className={`flex-1 py-4 rounded-2xl font-bold border transition-all text-xs uppercase tracking-widest ${difficulty === d ? 'bg-md-primary border-md-primary text-white shadow-lg shadow-md-primary/20' : 'bg-md-surface-variant/20 border-md-outline/10 text-md-on-surface-variant hover:bg-md-surface-variant/40'}`}>
                                                {d}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleStartLocalGame}
                                className="w-full py-6 bg-md-primary rounded-[2rem] text-md-on-primary font-bold text-lg tracking-wide shadow-xl shadow-md-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                Start Duel
                            </button>
                        </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="online"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex flex-col gap-8"
                  >
                    <button 
                        onClick={() => setGameMode('selection')}
                        className="self-start text-[10px] font-bold uppercase tracking-widest text-md-outline hover:text-md-primary transition-colors flex items-center gap-2"
                    >
                        ← Back to Mode Selection
                    </button>

                    <div className="grid md:grid-cols-2 gap-8">
                        {/* HOST PANEL */}
                        <div className="bg-md-surface border border-md-outline/10 rounded-[2rem] p-8 md:p-10 flex flex-col shadow-lg hover:border-md-primary/30 transition-colors">
                            <div className="w-14 h-14 rounded-2xl bg-md-primary/10 flex items-center justify-center text-3xl mb-6 border border-md-primary/20">
                                🏗️
                            </div>
                            <h2 className="text-2xl font-bold text-md-on-surface mb-2">Host Match</h2>
                            <p className="text-md-on-surface-variant text-xs mb-8">Create a new arena and share the code.</p>
                            
                            <div className="space-y-8 mb-10">
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
                                <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-md-outline uppercase tracking-widest ml-1">Difficulty</label>
                                    <div className="flex gap-2">
                                        {['easy', 'medium', 'hard'].map(d => (
                                            <button key={d} onClick={() => setDifficulty(d)} className={`flex-1 py-3 rounded-xl font-bold border transition-all text-[10px] uppercase tracking-widest ${difficulty === d ? 'bg-md-primary border-md-primary text-white shadow-md' : 'bg-md-surface-variant/20 border-md-outline/10 text-md-on-surface-variant hover:bg-md-surface-variant/40'}`}>
                                                {d}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => handleHostGame()} disabled={isHosting} className="w-full py-5 bg-md-primary rounded-[1.5rem] text-md-on-primary font-bold text-base tracking-wide shadow-lg shadow-md-primary/10 hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-30">
                                {isHosting ? 'Opening Arena...' : 'Create Arena'}
                            </button>
                        </div>

                        {/* JOIN PANEL */}
                        <div className="bg-md-surface border border-md-outline/10 rounded-[2rem] p-8 md:p-10 flex flex-col shadow-lg hover:border-md-secondary/30 transition-colors">
                            <div className="w-14 h-14 rounded-2xl bg-md-secondary/10 flex items-center justify-center text-3xl mb-6 border border-md-secondary/20">
                                🔗
                            </div>
                            <h2 className="text-2xl font-bold text-md-on-surface mb-2">Join Match</h2>
                            <p className="text-md-on-surface-variant text-xs mb-8">Enter an Arena Code to join a battle.</p>
                            <div className="mt-auto space-y-8">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-md-outline uppercase tracking-widest ml-1">Target Difficulty</label>
                                    <div className="flex gap-2">
                                        {['easy', 'medium', 'hard'].map(d => (
                                            <button key={d} onClick={() => setDifficulty(d)} className={`flex-1 py-3 rounded-xl font-bold border transition-all text-[10px] uppercase tracking-widest ${difficulty === d ? 'bg-md-secondary border-md-secondary text-white shadow-md' : 'bg-md-surface-variant/20 border-md-outline/10 text-md-on-surface-variant hover:bg-md-surface-variant/40'}`}>
                                                {d}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <input type="text" maxLength={6} placeholder="ARENA CODE" value={joinPin} onChange={(e) => setJoinPin(e.target.value.toUpperCase())} className="w-full bg-md-surface-variant/20 border border-md-outline/10 rounded-2xl px-6 py-5 text-center text-3xl font-bold text-md-primary tracking-[0.4em] focus:outline-none focus:border-md-primary/50 focus:ring-1 focus:ring-md-primary placeholder:text-md-outline/30 transition-all font-mono" />
                                <button onClick={handleJoinGame} disabled={isJoining || joinPin.length !== 6} className="w-full py-5 bg-md-secondary rounded-[1.5rem] text-md-on-secondary font-bold text-base tracking-wide shadow-lg shadow-md-secondary/10 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 transition-transform">
                                    {isJoining ? 'Linking Arena...' : 'Join Battle'}
                                </button>
                            </div>
                        </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
          </div>

          {/* Rules Modal */}
          <AnimatePresence>
            {showRules && (
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-md-surface/90 backdrop-blur-md"
                >
                    <motion.div 
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        className="bg-md-surface border border-md-outline/10 rounded-[2.5rem] p-10 max-w-lg w-full shadow-2xl relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-8">
                            <button onClick={() => setShowRules(false)} className="text-xl text-md-outline hover:text-md-on-surface transition-colors">✕</button>
                        </div>
                        
                        <h2 className="text-3xl font-bold text-md-on-surface mb-8">Battle Rules</h2>
                        
                        <div className="space-y-8">
                            <div className="flex gap-5">
                                <div className="w-12 h-12 rounded-full bg-md-primary/10 flex items-center justify-center text-2xl shrink-0">🧠</div>
                                <div>
                                    <h3 className="font-bold text-md-on-surface text-sm uppercase tracking-wider mb-1">Neural Speed</h3>
                                    <p className="text-xs leading-relaxed text-md-on-surface-variant">This is a race. No turns. Answer as fast as possible to pull the rope to your side.</p>
                                </div>
                            </div>

                            <div className="flex gap-5">
                                <div className="w-12 h-12 rounded-full bg-md-secondary/10 flex items-center justify-center text-2xl shrink-0">⚖️</div>
                                <div>
                                    <h3 className="font-bold text-md-on-surface text-sm uppercase tracking-wider mb-1">Difficulty Equalizer</h3>
                                    <p className="text-xs leading-relaxed text-md-on-surface-variant">"Hard" questions are 3x more powerful. Players of different levels can compete fairly.</p>
                                </div>
                            </div>

                            <div className="flex gap-5">
                                <div className="w-12 h-12 rounded-full bg-md-success/10 flex items-center justify-center text-2xl shrink-0">🏁</div>
                                <div>
                                    <h3 className="font-bold text-md-on-surface text-sm uppercase tracking-wider mb-1">Victory Condition</h3>
                                    <p className="text-xs leading-relaxed text-md-on-surface-variant">Pull the rope completely to your side (±100) to win the match instantly.</p>
                                </div>
                            </div>
                        </div>

                        <button 
                            onClick={() => setShowRules(false)}
                            className="w-full mt-10 py-5 bg-md-on-surface text-md-surface rounded-2xl font-bold text-sm tracking-wider hover:opacity-90 transition-all shadow-xl shadow-black/5"
                        >
                            Got it, let's go!
                        </button>
                    </motion.div>
                </motion.div>
            )}
          </AnimatePresence>
       </main>
    )
}
