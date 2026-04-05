'use client';

import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { createClient } from '../../lib/supabaseClient'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
   const [supabase] = useState(() => createClient());
   const router = useRouter();

   useEffect(() => {
      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
         if (session) {
             // Redirect authenticated users to the Multiplayer Lobby
             router.push('/lobby');
         }
      });
      return () => authListener.subscription.unsubscribe();
   }, [supabase, router]);

   return (
      <main className="flex flex-col items-center justify-center min-h-screen relative p-4 bg-slate-950 overflow-hidden">
         {/* Background aesthetics */}
         <div className="fixed inset-0 pointer-events-none">
            <div className="absolute top-[20%] left-[20%] w-[300px] h-[300px] bg-indigo-600/30 rounded-full blur-[140px]" />
            <div className="absolute bottom-[20%] right-[20%] w-[300px] h-[300px] bg-teal-500/30 rounded-full blur-[140px]" />
         </div>

         <div className="w-full max-w-md p-8 sm:p-10 bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 shadow-[0_10px_40px_-10px_rgba(31,38,135,0.4)] z-10">
            <h1 className="text-4xl font-black text-center mb-2 tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-indigo-300 via-white to-teal-200">
              Neon Arena
            </h1>
            <p className="text-center text-slate-400 text-sm font-bold uppercase tracking-widest mb-8">
               Authenticate to Enter
            </p>
            
            <div className="auth-ui-container">
               <Auth
                  supabaseClient={supabase}
                  appearance={{ 
                     theme: ThemeSupa,
                     variables: {
                        default: {
                           colors: {
                              brand: '#6366f1',
                              brandAccent: '#4f46e5',
                              defaultButtonBackground: '#1e293b',
                              defaultButtonBackgroundHover: '#334155',
                              inputBackground: '#0f172a',
                              inputBorder: '#334155',
                              inputText: '#f8fafc',
                           },
                           radii: {
                              borderRadiusButton: '12px',
                              buttonBorderRadius: '12px',
                              inputBorderRadius: '12px',
                           }
                        }
                     }
                  }}
                  theme="dark"
                  providers={['google']}
                  magicLink={false}
                  showLinks={false}
                  redirectTo={typeof window !== 'undefined' ? `${window.location.origin}/lobby` : ''}
               />
            </div>
         </div>
      </main>
   )
}
