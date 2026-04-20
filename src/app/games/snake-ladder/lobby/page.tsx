'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function LobbyPage() {
   const [supabase] = useState(() => createClient());
   const router = useRouter();
   const [user, setUser] = useState<any>(null);
   
   const [isHosting, setIsHosting] = useState(false);
   const [isJoining, setIsJoining] = useState(false);
   const [joinPin, setJoinPin] = useState('');
   const [difficulty, setDifficulty] = useState('easy');
   const [errorMsg, setErrorMsg] = useState('');

   useEffect(() => {
      // Listen dynamically for the session to prevent race conditions during OAuth redirect callbacks
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
       
       const { data, error } = await supabase
           .from('snake_ladder_matches')
           .insert({ 
               player1_id: user.id,
               difficulty: difficulty
           })
           .select()
           .single();
           
       setIsHosting(false);
       
       if (error) {
           setErrorMsg('Failed to create game. ' + error.message);
           return;
       }
       
       // Route to the new game room
       router.push(`/games/snake-ladder/${data.id}`);
   };

   const handleJoinGame = async () => {
       if (!user || !joinPin || joinPin.length < 6) return;
       setIsJoining(true);
       setErrorMsg('');

       const pin = joinPin.toUpperCase().trim();

       // Call the SECURITY DEFINER RPC — bypasses the RLS block that prevents
       // Player 2 from updating a row they're not yet a participant of.
       const { data: gameId, error } = await supabase
           .rpc('sl_join_game', { p_join_code: pin });

       setIsJoining(false);

       if (error || !gameId) {
           setErrorMsg(
               error?.message?.includes('own game')
                   ? "You can't join your own game!"
                   : 'Invalid PIN or the game has already started!'
           );
           return;
       }

       // Success! Route to the arena — host will press START MATCH
       router.push(`/games/snake-ladder/${gameId}`);
   };

   if (!user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading...</div>;

   return (
      <main className="flex flex-col items-center justify-center min-h-screen relative p-4 bg-slate-950 overflow-hidden">
         {/* Background aesthetics */}
         <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-[10%] left-[10%] w-[400px] h-[400px] bg-indigo-600/30 rounded-full blur-[150px]" />
            <div className="absolute top-[40%] right-[10%] w-[300px] h-[300px] bg-teal-500/30 rounded-full blur-[150px]" />
         </div>

         <div className="z-10 w-full max-w-4xl flex flex-col pt-10 pb-20 px-4 md:px-0">
             
             {/* Header */}
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 sm:gap-0 mb-8 sm:mb-12">
                 <div>
                    <h2 className="text-sm sm:text-xl text-teal-400 font-bold tracking-widest uppercase mb-1">Neon Arena</h2>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
                        Multiplayer Lobby
                    </h1>
                 </div>
                 
                 <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto text-left sm:text-right bg-white/5 sm:bg-transparent p-3 sm:p-0 rounded-2xl sm:rounded-none border sm:border-0 border-white/5">
                     <div>
                         <p className="text-slate-500 text-[10px] sm:text-sm font-medium uppercase tracking-widest">Logged in as</p>
                         <p className="text-white font-bold text-xs sm:text-base truncate w-[140px] sm:w-auto">{user?.user_metadata?.full_name || user?.email}</p>
                     </div>
                     <button onClick={() => router.push('/profile')} className="mt-0 sm:mt-2 text-[9px] sm:text-xs text-teal-400 hover:text-teal-300 font-bold tracking-widest uppercase border border-teal-500/30 hover:bg-teal-500/10 px-3 py-1.5 sm:py-1 rounded-full transition-all shadow-[0_0_10px_rgba(20,184,166,0.1)] hover:shadow-teal-500/30 shrink-0">
                         View Profile
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
                 <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 md:p-10 flex flex-col shadow-2xl relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
                     <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                     
                     <div className="relative z-10">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-4xl mb-6 shadow-inner border border-indigo-500/30">
                            🛡️
                        </div>
                        <h2 className="text-3xl font-black text-white mb-2">Host Arena</h2>
                        <p className="text-slate-400 font-medium mb-8">Create a secure multiplayer lobby and generate a 6 digit PIN to challenge an opponent.</p>
                        
                        <div className="space-y-4 mb-8">
                            <label className="text-sm font-bold text-slate-300 uppercase tracking-widest">Select Difficulty</label>
                            <div className="grid grid-cols-3 gap-3">
                                {['easy', 'medium', 'hard'].map((level) => (
                                    <button 
                                        key={level}
                                        onClick={() => setDifficulty(level)}
                                        className={`py-3 rounded-xl font-bold uppercase tracking-wide text-xs md:text-sm border transition-all ${difficulty === level ? 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                                    >
                                        {level}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button 
                            onClick={handleHostGame}
                            disabled={isHosting}
                            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-xl text-white font-black text-lg tracking-wider uppercase shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-transform flex justify-center"
                        >
                            {isHosting ? <span className="animate-pulse">Building Arena...</span> : 'Generate PIN'}
                        </button>
                     </div>
                 </div>

                 {/* JOIN PANEL */}
                 <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 md:p-10 flex flex-col shadow-2xl relative overflow-hidden group hover:border-teal-500/50 transition-colors">
                     <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                     
                     <div className="relative z-10 flex flex-col h-full">
                        <div className="w-16 h-16 rounded-2xl bg-teal-500/20 flex items-center justify-center text-4xl mb-6 shadow-inner border border-teal-500/30">
                            🚀
                        </div>
                        <h2 className="text-3xl font-black text-white mb-2">Join Arena</h2>
                        <p className="text-slate-400 font-medium mb-12">Enter a 6-digit Join PIN from a waiting Host to seamlessly jump into their reality.</p>
                        
                        <div className="mt-auto space-y-4">
                            <input 
                                type="text"
                                maxLength={6}
                                placeholder="ENTER 6 DIGIT PIN"
                                value={joinPin}
                                onChange={(e) => setJoinPin(e.target.value.toUpperCase())}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-6 py-5 text-center text-3xl font-black text-teal-300 tracking-[0.5em] focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500 placeholder:text-slate-700 transition-all font-mono"
                            />

                            <button 
                                onClick={handleJoinGame}
                                disabled={isJoining || joinPin.length !== 6}
                                className="w-full py-4 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-xl text-white font-black text-lg tracking-wider uppercase shadow-[0_0_20px_rgba(20,184,166,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:hover:scale-100 transition-all flex justify-center"
                            >
                                {isJoining ? <span className="animate-pulse">Connecting...</span> : 'Join Match'}
                            </button>
                        </div>
                     </div>
                 </div>

             </div>
         </div>
         {/* Footer Links */}
         <div className="absolute bottom-6 w-full text-center z-10">
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))} className="text-slate-500 text-sm font-bold tracking-widest uppercase hover:text-white transition-colors">
                Sign Out
            </button>
         </div>
      </main>
   )
}
