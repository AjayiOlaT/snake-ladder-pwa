'use client';

import React, { useState, useEffect } from 'react';
import GameBoard, { RAW_CONFIGS } from '../../../components/GameBoard';
import { sfx } from '../../../lib/audio';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '../../../lib/supabaseClient';
import { useRouter, useParams } from 'next/navigation';

const DiceIcon = ({ value }: { value: number | null }) => {
    if (!value) return <span className="text-3xl sm:text-4xl">🎲</span>;
    const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
    return <span className="text-5xl text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]">{faces[value - 1]}</span>;
}

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.id as string;
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<any>(null);
  const [game, setGame] = useState<any>(null);

  const [player1Pos, setPlayer1Pos] = useState(0);
  const [player2Pos, setPlayer2Pos] = useState(0);
  const [turn, setTurn] = useState<1 | 2>(1);
  const [diceResult, setDiceResult] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<{ text: string, type: 'roll' | 'ladder' | 'snake' | null } | null>(null);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);

  // Phase 9/10: Fetch initial context and wait for Player 2
  useEffect(() => {
     let isMounted = true;

     const checkSession = async () => {
         const { data: { session } } = await supabase.auth.getSession();
         if (!session) {
             router.replace('/login');
             return;
         }
         setUser(session.user);

         const { data, error } = await supabase.from('games').select('*').eq('id', gameId).single();
         if (error || !data) {
             router.replace('/lobby');
             return;
         }
         if (isMounted) setGame(data);
     };
     
     if (gameId) checkSession();

     // Phase 10: REALTIME POSTGRES SOCKET LISTENER!
     const channel = supabase.channel(`game-${gameId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`
        }, (payload) => {
            console.log("REALTIME UPDATE DETECTED!", payload);
            const updatedGame = payload.new as any;
            if (isMounted) {
                setGame(updatedGame);
                if (updatedGame.status === 'finished' && updatedGame.winner_id) {
                    setWinner(updatedGame.winner_id);
                }
            }
        })
        .subscribe();

     return () => { 
         isMounted = false; 
         supabase.removeChannel(channel);
     };
  }, [gameId, supabase, router]);

  // Phase 10: Executing a formal Surrender writes the Opponents UUID natively as the champion
  const executeSurrender = async () => {
      if (!game || !user) return;
      const isHost = user.id === game.player1_id;
      const opponentId = isHost ? game.player2_id : game.player1_id;

      await supabase.from('games').update({ 
          status: 'finished',
          winner_id: opponentId // Give victory to the other connected player
      }).eq('id', game.id);
      
      router.push('/lobby');
  };

  // Temporary local mock logic mapped to the new difficulty ceiling
  // (Full postgres channel listener replaces this next)
  const mockRoll = async () => {
     if (!game || isRolling || winner) return;
     sfx.init(); 
     setIsRolling(true);
     setDiceResult(null);
     setAnnouncement(null);

     const boardMax = game.difficulty === 'hard' ? 99 : (game.difficulty === 'medium' ? 49 : 29);
     const configSet = RAW_CONFIGS[game.difficulty || 'easy'];

     sfx.diceSound();
     let current = turn === 1 ? player1Pos : player2Pos;

     let roll = 1;
     for (let i = 0; i < 10; i++) {
        roll = Math.floor(Math.random() * 6) + 1;
        // BRUTAL RNG: If Hard Mode and within 15 spaces of the finish line, heavily manipulate the dice against the player!
        if (game.difficulty === 'hard' && (boardMax - current) <= 15) {
            // 60% chance to forcefully downgrade any 4, 5, or 6 roll down into a 1, 2, or 3!
            if (roll > 3 && Math.random() > 0.4) roll = Math.floor(Math.random() * 3) + 1;
        }
        setDiceResult(roll);
        await new Promise(r => setTimeout(r, Math.random() * 40 + 40));
     }
     
     setAnnouncement({ text: `PLAYER ${turn} ROLLED ${roll}!`, type: 'roll' });
     
     if (current === boardMax) {
         await new Promise(r => setTimeout(r, 600)); 
         const winningId = turn === 1 ? game?.player1_id : game?.player2_id;
         if (winningId) setWinner(winningId);
     }
     
     if (current + roll > boardMax) {
         await new Promise(r => setTimeout(r, 500)); 
         setAnnouncement({ text: `OVERSHOT! TURN VOIDED 🚫`, type: 'snake' });
         sfx.snakeSound();
         await new Promise(r => setTimeout(r, 1000)); 
     } else {
         await new Promise(r => setTimeout(r, 600)); 
         for (let step = 0; step < roll; step++) {
             await new Promise(r => setTimeout(r, 450)); 
             sfx.stepSound(); 
             current += 1;
             
             if (turn === 1) setPlayer1Pos(current);
             else setPlayer2Pos(current);
         }
     }

     if (current === boardMax) {
         const winningId = turn === 1 ? game?.player1_id : game?.player2_id;
         setWinner(winningId || null);
         sfx.winSound(); 
         setIsRolling(false);
         return;
     }

     await new Promise(r => setTimeout(r, 500)); 
     const cfg = configSet[current];
     
     if (cfg) {
         if (cfg.type === 'ladder') {
             sfx.ladderSound();
             setAnnouncement({ text: `PROMOTION! 🚀`, type: 'ladder' });
             current = cfg.target!;
         } else if (cfg.type === 'snake') {
             sfx.snakeSound();
             setAnnouncement({ text: `DEMOTION! 🐍`, type: 'snake' });
             current = cfg.target!;
         } else if (cfg.type === 'modifier') {
             setAnnouncement({ text: cfg.modifier! > 0 ? `BONUS! +${cfg.modifier}` : `PENALTY! ${cfg.modifier}`, type: 'roll' });
             current += cfg.modifier!;
         }
         
         if (turn === 1) setPlayer1Pos(current);
         else setPlayer2Pos(current);

         if (current === boardMax) {
             sfx.winSound();
             const winningId = turn === 1 ? game?.player1_id : game?.player2_id;
             setWinner(winningId || null);
             setIsRolling(false);
             return;
         }
         await new Promise(r => setTimeout(r, 600)); 
     }

     await new Promise(r => setTimeout(r, 800));
     setAnnouncement(null);
     setTurn(turn === 1 ? 2 : 1);
     setIsRolling(false);
  }

  if (!game) {
      return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white relative">
          <div className="animate-spin text-4xl">⏳</div>
      </div>;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-12 overflow-hidden relative">
      
      <AnimatePresence>
          {winner && (
              <motion.div 
                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                 className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
              >
                  <motion.div 
                     initial={{ scale: 0.5, y: 50 }} animate={{ scale: 1, y: 0 }}
                     className="bg-slate-900/80 p-10 md:p-16 rounded-[3rem] border border-white/20 text-center shadow-[0_0_100px_rgba(250,204,21,0.3)] flex flex-col items-center gap-6 pointer-events-auto"
                  >
                      <div className="text-8xl flex">🏆</div>
                      <h3 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-500">
                          Player {winner} Wins!
                      </h3>
                      <button 
                          onClick={() => router.push('/lobby')} 
                          className="mt-6 px-10 py-4 bg-gradient-to-r from-indigo-500 to-teal-400 text-white shadow-lg text-xl font-black tracking-widest uppercase rounded-2xl"
                      >
                          BACK TO LOBBY
                      </button>
                  </motion.div>
              </motion.div>
          )}

          {/* WAITING FOR OPPONENT OVERLAY */}
          {game.status === 'waiting' && !winner && (
             <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
             >
                 <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                    className="w-full max-w-lg bg-indigo-900/20 p-6 sm:p-10 md:p-16 rounded-[2rem] sm:rounded-[3rem] border border-indigo-500/30 text-center shadow-[0_0_80px_rgba(99,102,241,0.2)] flex flex-col items-center gap-4 sm:gap-6"
                 >
                     <div className="animate-spin text-4xl sm:text-5xl mb-2 sm:mb-4">🌀</div>
                     
                     {game.player2_id ? (
                        <>
                            <h3 className="text-2xl sm:text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300 leading-tight">Opponent Connected!</h3>
                            <p className="text-slate-300 text-sm sm:text-base font-medium max-w-xs sm:max-w-sm">
                                Both players are in the lobby. The arena is sealed.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 w-full justify-center mt-4">
                                <button onClick={async () => { await supabase.from('games').update({ status: 'finished' }).eq('id', game.id); router.push('/lobby'); }} className="w-full sm:w-auto px-6 py-3 sm:py-4 border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-bold uppercase tracking-widest text-[10px] sm:text-xs rounded-xl transition-colors">
                                    Cancel Match
                                </button>
                                <button onClick={async () => { await supabase.from('games').update({ status: 'active' }).eq('id', game.id); }} className="w-full sm:w-auto px-6 py-3 sm:py-4 border border-teal-500 bg-teal-500 text-slate-900 hover:bg-teal-400 font-extrabold uppercase tracking-widest text-[10px] sm:text-xs rounded-xl transition-all shadow-[0_0_30px_rgba(20,184,166,0.6)]">
                                    START MATCH 🚀
                                </button>
                            </div>
                        </>
                     ) : (
                        <>
                            <h3 className="text-2xl sm:text-3xl md:text-5xl font-black text-white leading-tight">Waiting for Player 2</h3>
                            <p className="text-slate-400 text-sm sm:text-base font-medium max-w-xs sm:max-w-sm">
                                Send this 6-Digit Match PIN to your opponent so they can connect!
                            </p>
                            
                            <div className="mt-2 sm:mt-4 bg-black/50 border border-white/10 px-6 py-4 sm:px-10 sm:py-6 rounded-2xl w-full flex justify-center mb-2 sm:mb-4">
                                <p className="text-3xl sm:text-5xl font-mono font-black tracking-[0.2em] sm:tracking-[0.3em] text-teal-400">
                                   {game.join_code}
                                </p>
                            </div>

                            <div className="flex w-full justify-center mt-2">
                                <button onClick={async () => { await supabase.from('games').update({ status: 'finished' }).eq('id', game.id); router.push('/lobby'); }} className="w-full sm:w-auto px-8 py-3 sm:py-4 border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-bold uppercase tracking-widest text-[10px] sm:text-xs rounded-xl transition-colors">
                                    Cancel Match
                                </button>
                            </div>
                        </>
                     )}
                 </motion.div>
             </motion.div>
         )}

         {/* SURRENDER CONFIRMATION MODAL */}
         {showSurrenderConfirm && (
             <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
             >
                 <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                    className="w-full max-w-sm bg-slate-900 border-2 border-red-500/30 p-8 sm:p-10 rounded-[3rem] text-center shadow-[0_0_80px_rgba(239,68,68,0.2)] flex flex-col items-center gap-4"
                 >
                     <div className="text-6xl mb-2">🚩</div>
                     <h3 className="text-2xl font-black text-white leading-tight uppercase tracking-widest">Surrender Arena?</h3>
                     <p className="text-slate-400 text-sm font-medium mt-2">
                         Are you sure you want to forfeit? Your opponent will instantly claim the victory.
                     </p>
                     
                     <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mt-6">
                         <button onClick={() => setShowSurrenderConfirm(false)} className="w-full px-6 py-4 border border-white/20 bg-white/5 text-white hover:bg-white/10 font-bold uppercase tracking-widest text-[10px] sm:text-xs rounded-xl transition-colors">
                             Resume
                         </button>
                         <button onClick={executeSurrender} className="w-full px-6 py-4 border border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500/20 font-bold uppercase tracking-widest text-[10px] sm:text-xs rounded-xl transition-colors shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                             Forfeit
                         </button>
                     </div>
                 </motion.div>
             </motion.div>
         )}

         {/* VICTORY NOTIFICATION HIJACK OVERLAY */}
         {winner && (
             <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
             >
                 <motion.div 
                    initial={{ scale: 0.5, y: 50 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 15 }}
                    className="w-full max-w-lg bg-slate-950 p-8 sm:p-12 rounded-[3rem] border-4 border-indigo-500/50 text-center shadow-[0_0_150px_rgba(99,102,241,0.5)] flex flex-col items-center gap-6"
                 >
                     <div className="text-7xl sm:text-8xl mb-4 animate-bounce drop-shadow-2xl">
                         {winner === user?.id ? '🏆' : '💀'}
                     </div>
                     <h3 className={`text-4xl sm:text-6xl font-black leading-tight uppercase tracking-widest ${winner === user?.id ? 'text-amber-400 drop-shadow-[0_0_30px_rgba(251,191,36,0.6)]' : 'text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.6)]'}`}>
                         {winner === user?.id ? 'VICTORY' : 'DEFEATED'}
                     </h3>
                     <p className="text-indigo-200 text-base sm:text-lg font-medium tracking-wide">
                         {winner === user?.id 
                             ? (game?.status === 'finished' ? 'Opponent surrendered! The arena is yours!' : 'You conquered the Neon Ladders!') 
                             : 'The opponent claimed victory...'}
                     </p>
                     
                     <button onClick={() => router.push('/lobby')} className="mt-8 w-full px-8 py-5 border-2 border-indigo-400 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/40 hover:text-white font-black uppercase tracking-[0.2em] text-sm sm:text-base rounded-2xl transition-all shadow-[0_0_40px_rgba(99,102,241,0.3)]">
                         Return to Lobby
                     </button>
                 </motion.div>
             </motion.div>
         )}
      </AnimatePresence>

      <div className="fixed inset-0 -z-10 bg-slate-950">
         <div className="absolute top-[10%] left-[10%] w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-indigo-600/30 rounded-full blur-[140px]" />
         <div className="absolute bottom-[10%] right-[10%] w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-teal-500/30 rounded-full blur-[140px]" />
      </div>

      <div className="z-10 w-full flex flex-col items-center gap-6 sm:gap-8 relative mt-10">
         
         <div className="absolute -top-10 right-0 sm:right-6">
             <button 
                 onClick={() => setShowSurrenderConfirm(true)} 
                 className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-red-400 border border-white/10 hover:border-red-500/50 px-4 py-2 rounded-full transition-colors bg-white/5 shadow-md hover:shadow-red-500/20"
             >
                 Surrender
             </button>
         </div>

         <div className="text-center w-full">
            <h1 className="text-3xl sm:text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-indigo-300 via-white to-teal-200">
               Neon Ladders <span className="text-sm bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full uppercase ml-2 border border-indigo-500/30 align-middle hidden sm:inline-block">{game.difficulty} MODE</span>
            </h1>
         </div>

         <div className="relative w-full max-w-4xl mx-auto">
             <GameBoard player1Pos={player1Pos} player2Pos={player2Pos} difficulty={game.difficulty} />
             
             {/* Action Announcements */}
             <AnimatePresence>
                 {announcement && (
                    <motion.div
                       initial={{ scale: 0.8, opacity: 0, y: -20 }}
                       animate={{ scale: 1, opacity: 1, y: 0 }}
                       exit={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                       transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                       className="fixed top-20 sm:top-24 left-0 w-full flex items-center justify-center pointer-events-none z-[100] px-4"
                    >
                       <div className={`px-6 py-3 sm:px-10 sm:py-4 rounded-2xl border-2 backdrop-blur-xl shadow-2xl text-center 
                           ${announcement.type === 'ladder' ? 'bg-amber-500/20 border-amber-400/50 shadow-[0_10px_40px_rgba(251,191,36,0.3)]' : 
                             announcement.type === 'snake' ? 'bg-red-600/20 border-red-500/50 shadow-[0_10px_40px_rgba(239,68,68,0.3)]' : 
                             'bg-indigo-600/30 border-indigo-400/50 shadow-[0_10px_40px_rgba(99,102,241,0.3)]'}`}
                       >
                           <h2 className={`font-black uppercase tracking-[0.1em] text-lg sm:text-2xl drop-shadow-lg
                               ${announcement.type === 'ladder' ? 'text-amber-400' : 
                                 announcement.type === 'snake' ? 'text-red-400' : 
                                 'text-white'}`}
                           >
                               {announcement.text}
                           </h2>
                       </div>
                    </motion.div>
                 )}
             </AnimatePresence>
         </div>

         {/* Dice Controller */}
         <div className="flex gap-4 sm:gap-6 w-full max-w-4xl bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-2xl justify-between items-center relative overflow-hidden transition-all duration-300">
             
             {/* Player 1 HUD */}
             <div className={`flex flex-col sm:flex-row items-center gap-2 sm:gap-4 relative z-10 w-20 sm:w-auto p-2 rounded-xl transition-colors duration-300 ${turn === 1 && !isRolling && !winner ? 'bg-indigo-500/20 shadow-inner border border-indigo-500/50 text-indigo-100' : 'text-slate-400'}`}>
                 <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.6)] border-2 border-white/40 ${(turn === 1 && !winner) ? 'animate-pulse' : 'opacity-50'}`} />
                 <div className="text-center sm:text-left hidden sm:block">
                     <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1">Player 1</p>
                     <p className="text-2xl sm:text-3xl font-extrabold font-mono leading-none">{player1Pos}</p>
                 </div>
             </div>

             <div className="flex flex-col items-center gap-3 relative z-10 shrink-0">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-inner flex items-center justify-center">
                    <DiceIcon value={diceResult} />
                </div>
                <button 
                    onClick={mockRoll}
                    disabled={isRolling || winner !== null}
                    className="px-6 sm:px-8 py-3 bg-gradient-to-tr from-indigo-600 to-teal-400 text-white font-black tracking-widest uppercase text-xs sm:text-sm rounded-2xl shadow-lg hover:shadow-indigo-500/40 transition-all hover:scale-105 active:scale-95 border border-white/20 disabled:opacity-50 disabled:pointer-events-none"
                >
                    {isRolling ? 'ROLLING...' : (winner ? 'GAME OVER' : `PLAYER ${turn} ROLL`)}
                </button>
             </div>

             {/* Player 2 HUD */}
             <div className={`flex flex-col-reverse sm:flex-row items-center gap-2 sm:gap-4 justify-end relative z-10 w-20 sm:w-auto p-2 rounded-xl transition-colors duration-300 ${turn === 2 && !isRolling && !winner ? 'bg-cyan-500/20 shadow-inner border border-cyan-500/50 text-cyan-100' : 'text-slate-400'}`}>
                 <div className="text-center sm:text-right hidden sm:block">
                     <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1">Player 2</p>
                     <p className="text-2xl sm:text-3xl font-extrabold font-mono leading-none">{player2Pos}</p>
                 </div>
                 <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)] border-2 border-white/40 ${(turn === 2 && !winner) ? 'animate-pulse' : 'opacity-50'}`} />
             </div>
         </div>
      </div>
    </main>
  );
}
