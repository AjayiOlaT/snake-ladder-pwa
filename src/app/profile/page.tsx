'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function ProfilePage() {
   const [supabase] = useState(() => createClient());
   const router = useRouter();
   const [user, setUser] = useState<any>(null);
   const [stats, setStats] = useState({ played: 0, active: 0, won: 0, lost: 0, surrendered: 0 });
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      const fetchProfile = async () => {
         const { data: { session } } = await supabase.auth.getSession();
         if (!session) {
            router.replace('/login');
            return;
         }
         setUser(session.user);

         // Fetch all games involving the user
         const { data: games, error } = await supabase
             .from('games')
             .select('*')
             .or(`player1_id.eq.${session.user.id},player2_id.eq.${session.user.id}`);
             
         if (!error && games) {
             const active = games.filter(g => g.status !== 'finished').length;
             const finished = games.filter(g => g.status === 'finished');
             const won = finished.filter(g => g.winner_id === session.user.id).length;
             const lost = finished.filter(g => g.winner_id !== session.user.id).length;
             const surrendered = finished.filter(g => g.surrendered_by === session.user.id).length;
             
             setStats({
                 played: games.length,
                 active: active,
                 won: won,
                 lost: lost,
                 surrendered: surrendered
             });
         }
         setLoading(false);
      };
      
      fetchProfile();
   }, [supabase, router]);

   if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white"><div className="animate-spin text-4xl">⏳</div></div>;

   return (
      <main className="flex flex-col items-center min-h-screen relative p-4 bg-slate-950 overflow-hidden">
         {/* Background aesthetics */}
         <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[150px]" />
            <div className="absolute bottom-[20%] right-[10%] w-[300px] h-[300px] bg-orange-500/20 rounded-full blur-[150px]" />
         </div>

         <div className="z-10 w-full max-w-4xl flex flex-col pt-10 px-4 md:px-0">
             
             {/* Header */}
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 sm:mb-12 border-b border-white/10 pb-6">
                 <div>
                    <h1 className="text-2xl sm:text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-300">
                        Historical Profile
                    </h1>
                    <p className="text-slate-400 text-xs sm:text-sm font-medium uppercase tracking-widest mt-1 sm:mt-2 truncate w-[250px] sm:w-auto">{user?.email}</p>
                 </div>
                 
                 <button onClick={() => router.push('/lobby')} className="text-[10px] sm:text-xs md:text-sm bg-white/5 hover:bg-white/10 border border-white/20 text-white font-bold tracking-widest uppercase px-4 py-2 sm:px-6 sm:py-3 rounded-full transition-all w-full sm:w-auto mt-2 sm:mt-0">
                     Back to Lobby
                 </button>
             </div>

             {/* STATS MATRIX */}
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
                 
                 <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 flex flex-col shadow-xl">
                     <span className="text-4xl mb-4">⚔️</span>
                     <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Total Matches</p>
                     <p className="text-5xl font-black font-mono text-white">{stats.played}</p>
                 </div>

                 <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 flex flex-col shadow-xl">
                     <span className="text-4xl mb-4">🏆</span>
                     <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Victories</p>
                     <p className="text-5xl font-black font-mono text-purple-400">{stats.won}</p>
                 </div>

                 <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 flex flex-col shadow-xl relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/20 blur-[50px]" />
                     <span className="text-4xl mb-4 relative z-10">🔥</span>
                     <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1 relative z-10">Active Brawls</p>
                     <p className="text-5xl font-black font-mono text-orange-400 relative z-10">{stats.active}</p>
                 </div>

             </div>
 
             {/* SUB STATS */}
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
                 <div className="bg-white/5 border border-white/10 p-4 rounded-3xl text-center">
                     <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">Defeats</p>
                     <p className="text-2xl font-black text-red-400">{stats.lost}</p>
                 </div>
                 <div className="bg-white/5 border border-white/10 p-4 rounded-3xl text-center">
                     <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">Surrenders</p>
                     <p className="text-2xl font-black text-orange-400">{stats.surrendered}</p>
                 </div>
                 <div className="bg-white/5 border border-white/10 p-4 rounded-3xl text-center">
                     <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">Win Rate</p>
                     <p className="text-2xl font-black text-teal-400">
                         {stats.played > 0 ? Math.round((stats.won / (stats.won + stats.lost)) * 100) || 0 : 0}%
                     </p>
                 </div>
                 <div className="bg-white/5 border border-white/10 p-4 rounded-3xl text-center">
                     <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">Exp Level</p>
                     <p className="text-2xl font-black text-indigo-400">{Math.floor(stats.played / 5) + 1}</p>
                 </div>
             </div>

             {/* Recent Matches */}
             <div className="w-full">
                 <h2 className="text-xl font-bold text-white mb-6 tracking-widest uppercase">Combat Log</h2>
                 <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center text-slate-500 font-medium">
                     <div className="text-4xl mb-4 opacity-50">📜</div>
                     No recent matches have concluded yet.
                 </div>
             </div>

         </div>
      </main>
   )
}
