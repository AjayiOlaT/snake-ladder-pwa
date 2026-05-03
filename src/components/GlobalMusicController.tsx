'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { music } from '../lib/music';

/**
 * GlobalMusicController
 * Handles persistent audio playback across Next.js route transitions.
 * Detects current game context via URL and swaps procedural music scenes.
 */
export default function GlobalAudioController() {
    const pathname = usePathname();
    const hasStartedRef = useRef(false);

    useEffect(() => {
        const initAudio = async () => {
            if (music.isPlaying()) return;
            
            try {
                await music.play();
                hasStartedRef.current = true;
                // If successful, we can stop listening for fallback interactions
                window.removeEventListener('mousedown', handleInteraction);
                window.removeEventListener('touchstart', handleInteraction);
                window.removeEventListener('keydown', handleInteraction);
            } catch (e) {
                console.warn("Autoplay blocked, waiting for interaction...");
            }
        };

        const handleInteraction = () => {
            initAudio();
        };

        // Aggressive listening for any user intent
        window.addEventListener('mousedown', handleInteraction);
        window.addEventListener('touchstart', handleInteraction);
        window.addEventListener('keydown', handleInteraction);

        // Also try immediately (might work if returning from OAuth/previously interacted)
        initAudio();

        return () => {
            window.removeEventListener('mousedown', handleInteraction);
            window.removeEventListener('touchstart', handleInteraction);
            window.removeEventListener('keydown', handleInteraction);
        };
    }, []);

    useEffect(() => {
        // Route-aware Scene Switching
        if (pathname === '/arcade') {
            // Let the Arcade page handle specific carousel selection
            music.setScene('hub');
        } else if (pathname.startsWith('/games/snake-ladder')) {
            music.setScene('snake-ladder');
        } else if (pathname.startsWith('/games/number-duel')) {
            music.setScene('number-duel');
        } else if (pathname.startsWith('/games/tug-of-war')) {
            music.setScene('tug-of-war');
        } else {
            // Keep current or default to hub for other shared areas (profile, etc)
            music.setScene('hub');
        }
    }, [pathname]);

    return null; // Side-effect component
}
