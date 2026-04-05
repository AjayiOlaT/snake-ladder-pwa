'use client';

import React, { useState, useEffect, useRef } from 'react';
import GameBoard, { RAW_CONFIGS } from '../../../components/GameBoard';
import { sfx } from '../../../lib/audio';
import { music } from '../../../lib/music';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '../../../lib/supabaseClient';
import { useRouter, useParams } from 'next/navigation';

const DiceIcon = ({ value }: { value: number | null }) => {
  if (!value) return <span className="text-3xl sm:text-4xl">🎲</span>;
  const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  return <span className="text-5xl text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]">{faces[value - 1]}</span>;
};

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.id as string;
  const [supabase] = useState(() => createClient());

  // ─── State ─────────────────────────────────────────────────────────────────
  const [user, setUser]           = useState<any>(null);
  const [game, setGame]           = useState<any>(null);
  const [player1Pos, setP1Pos]    = useState(0);
  const [player2Pos, setP2Pos]    = useState(0);
  const [diceResult, setDice]     = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [winner, setWinner]       = useState<string | null>(null);
  const [announcement, setAnn]    = useState<{ text: string; type: 'roll' | 'ladder' | 'snake' } | null>(null);
  const [showSurrender, setShowSurrender] = useState(false);

  // ─── Refs (survive stale closures, safe in Realtime callbacks) ─────────────
  const channelRef        = useRef<any>(null);   // Supabase channel (for Broadcast)
  const isRollingRef      = useRef(false);        // true while MY animation runs
  const oppRollingRef     = useRef(false);        // true while OPPONENT animation runs
  const annTimer          = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef           = useRef<any>(null);
  const gameRef           = useRef<any>(null);
  const p1Ref             = useRef(0);
  const p2Ref             = useRef(0);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { p1Ref.current = player1Pos; }, [player1Pos]);
  useEffect(() => { p2Ref.current = player2Pos; }, [player2Pos]);

  // ─── Announcement helper ───────────────────────────────────────────────────
  const flash = (text: string, type: 'roll' | 'ladder' | 'snake', ms = 2500) => {
    if (annTimer.current) clearTimeout(annTimer.current);
    setAnn({ text, type });
    annTimer.current = setTimeout(() => setAnn(null), ms);
  };

  // ─── Broadcast helper — send animation events to opponent ─────────────────
  const bc = (event: string, payload: Record<string, any>) => {
    channelRef.current?.send({ type: 'broadcast', event, payload: { ...payload, uid: userRef.current?.id } });
  };

  // ─── Main Effect: Session + Poll + Realtime + Broadcast listeners ─────────
  useEffect(() => {
    if (!gameId) return;
    let mounted = true;

    // Session + initial load
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      setUser(session.user);
      userRef.current = session.user;

      const { data, error } = await supabase.from('games').select('*').eq('id', gameId).single();
      if (!mounted) return;
      if (error || !data) { router.replace('/lobby'); return; }
      setGame(data);
      setP1Pos(data.player1_pos ?? 0);
      setP2Pos(data.player2_pos ?? 0);
      if (data.winner_id) setWinner(data.winner_id);
    })();

    // Always-on polling — safety net for positions + game over
    const poll = setInterval(async () => {
      if (!mounted) return;
      const { data } = await supabase.from('games').select('*').eq('id', gameId).single();
      if (!mounted || !data) return;
      setGame(data);
      if (data.status === 'finished' && data.winner_id) setWinner(data.winner_id);
      // Only force positions from DB when nobody is animating
      if (!isRollingRef.current && !oppRollingRef.current) {
        setP1Pos(data.player1_pos ?? 0);
        setP2Pos(data.player2_pos ?? 0);
      }
    }, 3000);

    // ── Build channel with BOTH postgres_changes AND broadcast handlers ──────
    const channel = supabase.channel(`game-room-${gameId}`, {
      config: { broadcast: { self: false } },  // don't echo back to sender
    })
      // ── Postgres Realtime (for waiting→active, active→finished) ──────────
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}`,
      }, (payload) => {
        if (!mounted) return;
        const d = payload.new as any;
        setGame(d);
        if (d.status === 'finished' && d.winner_id) setWinner(d.winner_id);
        // Only sync positions from DB if no animation is running
        if (!isRollingRef.current && !oppRollingRef.current) {
          setP1Pos(d.player1_pos ?? 0);
          setP2Pos(d.player2_pos ?? 0);
        }
      })

      // ── Broadcast: opponent started rolling ───────────────────────────────
      .on('broadcast', { event: 'roll_start' }, () => {
        if (!mounted) return;
        oppRollingRef.current = true;
        setIsRolling(true);   // Grey out button for watching player too
        setDice(null);
        setAnn(null);
      })

      // ── Broadcast: each dice spin frame ───────────────────────────────────
      .on('broadcast', { event: 'dice_frame' }, ({ payload }) => {
        if (!mounted) return;
        setDice(payload.value);
      })

      // ── Broadcast: announcement (roll text, snake, ladder, etc.) ─────────
      .on('broadcast', { event: 'show_ann' }, ({ payload }) => {
        if (!mounted) return;
        flash(payload.text, payload.type, payload.ms ?? 2500);
      })

      // ── Broadcast: each movement step ────────────────────────────────────
      .on('broadcast', { event: 'move_step' }, ({ payload }) => {
        if (!mounted) return;
        sfx.stepSound();
        if (payload.player === 1) setP1Pos(payload.pos);
        else setP2Pos(payload.pos);
      })

      // ── Broadcast: roll fully finished ────────────────────────────────────
      .on('broadcast', { event: 'roll_end' }, () => {
        if (!mounted) return;
        oppRollingRef.current = false;
        setIsRolling(false);
      })

      // ── Broadcast: game over (winner or surrender) ────────────────────────
      .on('broadcast', { event: 'game_over' }, ({ payload }) => {
        if (!mounted) return;
        setWinner(payload.winnerId);
      })

      .subscribe((status) => console.log('[CHANNEL]', status));

    channelRef.current = channel;

    return () => {
      mounted = false;
      clearInterval(poll);
      if (annTimer.current) clearTimeout(annTimer.current);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // ─── Music: stop on unmount ───────────────────────────────────────────────
  useEffect(() => () => { music.stop(); }, []);

  // ─── Music: start when game goes active, stop on game over ───────────────
  useEffect(() => {
    if (!game) return;
    if (game.status === 'active' && !winner) {
      music.play();
    }
    if (winner) {
      // Short delay so the win-sound plays first, then music fades
      setTimeout(() => music.stop(), 800);
    }
  }, [game?.status, winner]);

  // ─── Music: intensify when a player enters the final 15% of the board ────
  useEffect(() => {
    if (!game || winner) return;
    const boardMax = game.difficulty === 'hard' ? 99 : game.difficulty === 'medium' ? 49 : 29;
    const threshold = Math.max(4, Math.floor(boardMax * 0.15));
    const closest   = Math.max(player1Pos, player2Pos);
    music.setIntense(closest >= boardMax - threshold);
  }, [player1Pos, player2Pos, game?.difficulty, winner]);

  // ─── Surrender ─────────────────────────────────────────────────────────────
  const executeSurrender = async () => {
    const g = gameRef.current; const u = userRef.current;
    if (!g || !u) return;
    const opponentId = u.id === g.player1_id ? g.player2_id : g.player1_id;
    // Broadcast game_over immediately so opponent sees VICTORY instantly
    bc('game_over', { winnerId: opponentId });
    await supabase.from('games').update({ 
      status: 'finished', 
      winner_id: opponentId,
      surrendered_by: u.id
    }).eq('id', g.id);
    router.push('/lobby');
  };

  // ─── Roll Dice — local animation + simultaneous broadcast to opponent ──────
  const doRoll = async () => {
    const g = gameRef.current; const u = userRef.current;
    if (!g || !u || isRolling || winner) return;
    if (g.current_turn_id !== u.id) return;

    sfx.init();
    music.play(); // resume / start (safe to call repeatedly; satisfies autoplay policy)
    setIsRolling(true);
    isRollingRef.current = true;
    setDice(null);
    setAnn(null);

    const isP1     = u.id === g.player1_id;
    const label    = isP1 ? 'PLAYER 1' : 'PLAYER 2';
    const boardMax = g.difficulty === 'hard' ? 99 : g.difficulty === 'medium' ? 49 : 29;
    const cfgSet   = RAW_CONFIGS[g.difficulty || 'easy'];

    // Notify opponent that rolling has started
    bc('roll_start', {});
    sfx.diceSound();

    let pos = isP1 ? p1Ref.current : p2Ref.current;
    let lastEvText = ''; let lastEvType: 'roll'|'ladder'|'snake' = 'roll';
    let roll = 1;

    // ── Dice animation (broadcast each frame to opponent) ──────────────────
    for (let i = 0; i < 10; i++) {
      roll = Math.floor(Math.random() * 6) + 1;
      if (g.difficulty === 'hard' && boardMax - pos <= 15) {
        if (roll > 3 && Math.random() > 0.4) roll = Math.floor(Math.random() * 3) + 1;
      }
      setDice(roll);
      bc('dice_frame', { value: roll });
      await new Promise(r => setTimeout(r, Math.random() * 40 + 40));
    }

    lastEvText = `${label} ROLLED ${roll}!`; lastEvType = 'roll';
    flash(lastEvText, 'roll');
    bc('show_ann', { text: lastEvText, type: 'roll', ms: 2500 });

    // Saves to DB and triggers Realtime for opponent's postgres_changes handler
    const persist = async (finalPos: number, finished: boolean, evText = lastEvText, evType = lastEvType) => {
      await supabase.from('games').update({
        player1_pos:      isP1 ? finalPos : p1Ref.current,
        player2_pos:      isP1 ? p2Ref.current : finalPos,
        current_turn_id:  finished ? g.current_turn_id : (isP1 ? g.player2_id : g.player1_id),
        last_roll:        roll,
        last_event_text:  evText,
        last_event_type:  evType,
        ...(finished ? { status: 'finished', winner_id: u.id } : {}),
      }).eq('id', g.id);
    };

    const endRoll = () => {
      bc('roll_end', {});
      setIsRolling(false);
      isRollingRef.current = false;
    };

    const finishGame = async (finalPos: number, evText: string, evType: 'roll'|'ladder'|'snake') => {
      sfx.winSound();
      // Broadcast game_over BEFORE the DB write so opponent sees DEFEATED
      // at the same moment the winner sees VICTORY — no postgres_changes lag.
      bc('game_over', { winnerId: u.id });
      await persist(finalPos, true, evText, evType);
      setWinner(u.id);
      endRoll();
    };

    if (pos === boardMax) { await new Promise(r => setTimeout(r, 600)); await finishGame(pos, lastEvText, lastEvType); return; }

    // ── Overshoot ──────────────────────────────────────────────────────────
    if (pos + roll > boardMax) {
      await new Promise(r => setTimeout(r, 500));
      lastEvText = 'OVERSHOT! TURN VOIDED 🚫'; lastEvType = 'snake';
      flash(lastEvText, 'snake');
      bc('show_ann', { text: lastEvText, type: 'snake', ms: 2500 });
      sfx.snakeSound();
      await new Promise(r => setTimeout(r, 1200));
      await persist(pos, false, lastEvText, lastEvType);
      endRoll();
      return;
    }

    // ── Step-by-step movement (broadcast every step) ───────────────────────
    await new Promise(r => setTimeout(r, 600));
    for (let s = 0; s < roll; s++) {
      await new Promise(r => setTimeout(r, 450));
      sfx.stepSound();
      pos += 1;
      if (isP1) setP1Pos(pos); else setP2Pos(pos);
      bc('move_step', { player: isP1 ? 1 : 2, pos });
    }

    if (pos === boardMax) { await finishGame(pos, lastEvText, lastEvType); return; }

    // ── Recursive tile resolution ──────────────────────────────────────────
    const resolveSpecialTiles = async (currentPos: number): Promise<number> => {
      await new Promise(r => setTimeout(r, 600));
      const cfg = cfgSet[currentPos];
      if (!cfg) return currentPos;

      let nextPos = currentPos;
      if (cfg.type === 'ladder') {
        sfx.ladderSound();
        lastEvText = 'PROMOTION! 🚀'; lastEvType = 'ladder';
        flash(lastEvText, 'ladder');
        bc('show_ann', { text: lastEvText, type: 'ladder', ms: 2500 });
        nextPos = cfg.target!;
      } else if (cfg.type === 'snake') {
        sfx.snakeSound();
        lastEvText = 'DEMOTION! 🐍'; lastEvType = 'snake';
        flash(lastEvText, 'snake');
        bc('show_ann', { text: lastEvText, type: 'snake', ms: 2500 });
        nextPos = cfg.target!;
      } else if (cfg.type === 'modifier') {
        lastEvText = cfg.modifier! > 0 ? `BONUS! +${cfg.modifier}` : `PENALTY! ${cfg.modifier}`;
        lastEvType = 'roll';
        flash(lastEvText, 'roll');
        bc('show_ann', { text: lastEvText, type: 'roll', ms: 2500 });
        nextPos = Math.max(0, Math.min(boardMax, currentPos + cfg.modifier!));
      }

      if (nextPos !== currentPos) {
        if (isP1) setP1Pos(nextPos); else setP2Pos(nextPos);
        bc('move_step', { player: isP1 ? 1 : 2, pos: nextPos });
        if (nextPos === boardMax) return nextPos;
        // Check AGAIN for the new tile (chained resolution)
        return await resolveSpecialTiles(nextPos);
      }
      return nextPos;
    };

    pos = await resolveSpecialTiles(pos);

    if (pos === boardMax) { await finishGame(pos, lastEvText, lastEvType); return; }

    await new Promise(r => setTimeout(r, 800));
    await persist(pos, false, lastEvText, lastEvType);
    endRoll();
  };

  // ─── Derived UI values ─────────────────────────────────────────────────────
  const isMyTurn  = game?.current_turn_id === user?.id;
  const isPlayer1 = user?.id === game?.player1_id;
  const turnIsP1  = game?.current_turn_id === game?.player1_id;

  const rollBtnLabel = isRolling
    ? 'ROLLING...'
    : winner ? 'GAME OVER'
    : isMyTurn ? 'ROLL DICE 🎲'
    : turnIsP1 ? "PLAYER 1's TURN"
    : "PLAYER 2's TURN";

  if (!game) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="animate-spin text-4xl">⏳</div>
    </div>
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-12 overflow-hidden relative">

      <AnimatePresence>

        {/* ── WAITING OVERLAY ── */}
        {game.status === 'waiting' && !winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="w-full max-w-lg bg-indigo-900/20 p-6 sm:p-10 md:p-16 rounded-[3rem] border border-indigo-500/30 text-center shadow-[0_0_80px_rgba(99,102,241,0.2)] flex flex-col items-center gap-4 sm:gap-6">
              <div className="animate-spin text-5xl">🌀</div>
              {game.player2_id ? (
                <>
                  <h3 className="text-3xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300">Opponent Connected!</h3>
                  <p className="text-slate-300 text-sm sm:text-base font-medium">
                    {isPlayer1 ? 'Press START when ready!' : 'Waiting for the host to start…'}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 w-full justify-center mt-4">
                    {isPlayer1 ? (
                      <>
                        <button onClick={async () => { await supabase.from('games').update({ status: 'finished' }).eq('id', game.id); router.push('/lobby'); }} className="px-6 py-3 border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-bold uppercase tracking-widest text-xs rounded-xl">Cancel</button>
                        <button onClick={async () => { await supabase.from('games').update({ status: 'active', current_turn_id: game.player1_id }).eq('id', game.id); }} className="px-6 py-3 border border-teal-500 bg-teal-500 text-slate-900 hover:bg-teal-400 font-extrabold uppercase tracking-widest text-xs rounded-xl shadow-[0_0_30px_rgba(20,184,166,0.6)]">START MATCH 🚀</button>
                      </>
                    ) : (
                      <div className="flex items-center gap-3 px-6 py-4 bg-white/5 border border-white/10 rounded-xl">
                        <span className="animate-spin">⏳</span>
                        <span className="text-slate-300 text-xs font-bold uppercase tracking-widest">Waiting for host…</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-3xl sm:text-5xl font-black text-white">Waiting for Player 2</h3>
                  <p className="text-slate-400 text-sm">Send this PIN to your opponent!</p>
                  <div className="bg-black/50 border border-white/10 px-8 py-5 rounded-2xl w-full flex justify-center">
                    <p className="text-4xl sm:text-5xl font-mono font-black tracking-[0.3em] text-teal-400">{game.join_code}</p>
                  </div>
                  {isPlayer1 && (
                    <button onClick={async () => { await supabase.from('games').update({ status: 'finished' }).eq('id', game.id); router.push('/lobby'); }} className="px-8 py-3 border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-bold uppercase tracking-widest text-xs rounded-xl">Cancel Match</button>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* ── SURRENDER ── */}
        {showSurrender && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-slate-900 border-2 border-red-500/30 p-10 rounded-[3rem] text-center flex flex-col items-center gap-4">
              <div className="text-6xl">🚩</div>
              <h3 className="text-2xl font-black text-white uppercase tracking-widest">Surrender?</h3>
              <p className="text-slate-400 text-sm">Your opponent will instantly claim victory.</p>
              <div className="flex gap-4 w-full mt-4">
                <button onClick={() => setShowSurrender(false)} className="flex-1 py-4 border border-white/20 bg-white/5 text-white font-bold uppercase tracking-widest text-xs rounded-xl">Resume</button>
                <button onClick={executeSurrender} className="flex-1 py-4 border border-red-500/50 bg-red-500/10 text-red-500 font-bold uppercase tracking-widest text-xs rounded-xl">Forfeit</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ── VICTORY / DEFEAT ── */}
        {winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.5, y: 50 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 15 }}
              className="w-full max-w-lg bg-slate-950 p-8 sm:p-12 rounded-[3rem] border-4 border-indigo-500/50 text-center shadow-[0_0_150px_rgba(99,102,241,0.5)] flex flex-col items-center gap-6">
              <div className="text-8xl animate-bounce">{winner === user?.id ? '🏆' : '💀'}</div>
              <h3 className={`text-5xl sm:text-6xl font-black uppercase tracking-widest ${winner === user?.id ? 'text-amber-400' : 'text-red-500'}`}>
                {winner === user?.id ? 'VICTORY' : 'DEFEATED'}
              </h3>
              <p className="text-indigo-200 text-lg font-medium">
                {winner === user?.id ? 'You conquered the Neon Ladders!' : 'The opponent claimed victory…'}
              </p>
              <button onClick={() => router.push('/lobby')} className="mt-4 w-full px-8 py-5 border-2 border-indigo-400 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/40 font-black uppercase tracking-[0.2em] text-base rounded-2xl transition-all">
                Return to Lobby
              </button>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* Background */}
      <div className="fixed inset-0 -z-10 bg-slate-950">
        <div className="absolute top-[10%] left-[10%] w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[140px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[500px] h-[500px] bg-teal-500/30 rounded-full blur-[140px]" />
      </div>

      <div className="z-10 w-full flex flex-col items-center gap-6 sm:gap-8 relative mt-10">

        {/* Surrender btn */}
        <div className="absolute -top-10 right-0 sm:right-6">
          <button onClick={() => setShowSurrender(true)} className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-red-400 border border-white/10 hover:border-red-500/50 px-4 py-2 rounded-full transition-colors bg-white/5">
            Surrender
          </button>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-indigo-300 via-white to-teal-200">
          Neon Ladders{' '}
          <span className="text-sm bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full uppercase border border-indigo-500/30 align-middle hidden sm:inline-block">{game.difficulty} MODE</span>
        </h1>

        {/* Board + Announcement */}
        <div className="relative w-full max-w-4xl mx-auto">
          <GameBoard player1Pos={player1Pos} player2Pos={player2Pos} difficulty={game.difficulty} />
          <AnimatePresence>
            {announcement && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0, y: -20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="fixed top-20 sm:top-24 left-0 w-full flex justify-center pointer-events-none z-[100] px-4"
              >
                <div className={`px-8 py-3 sm:px-10 sm:py-4 rounded-2xl border-2 shadow-2xl text-center
                  ${announcement.type === 'ladder' ? 'bg-slate-900 border-amber-400 shadow-[0_10px_40px_rgba(251,191,36,0.4)]' :
                    announcement.type === 'snake'  ? 'bg-slate-900 border-red-500   shadow-[0_10px_40px_rgba(239,68,68,0.4)]'   :
                    'bg-slate-900 border-indigo-400 shadow-[0_10px_40px_rgba(99,102,241,0.4)]'}`}>
                  <h2 className={`font-black uppercase tracking-[0.1em] text-lg sm:text-2xl
                    ${announcement.type === 'ladder' ? 'text-amber-400' :
                      announcement.type === 'snake'  ? 'text-red-400'   : 'text-white'}`}>
                    {announcement.text}
                  </h2>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* HUD */}
        <div className="flex gap-4 sm:gap-6 w-full max-w-4xl bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-2xl justify-between items-center">

          {/* P1 */}
          <div className={`flex flex-col sm:flex-row items-center gap-2 sm:gap-4 w-20 sm:w-auto p-2 rounded-xl transition-colors duration-300 ${turnIsP1 && !winner ? 'bg-indigo-500/20 border border-indigo-500/50 text-indigo-100' : 'text-slate-400'}`}>
            <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-indigo-500 border-2 border-white/40 shadow-[0_0_20px_rgba(99,102,241,0.6)] transition-all ${turnIsP1 && !winner ? 'animate-pulse scale-110' : 'opacity-50'}`} />
            <div className="hidden sm:block">
              <p className="text-xs font-bold uppercase tracking-widest">Player 1{isPlayer1 ? ' (You)' : ''}</p>
              <p className="text-3xl font-extrabold font-mono">{player1Pos}</p>
            </div>
          </div>

          {/* Dice + Roll button */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 border border-white/20 shadow-inner flex items-center justify-center">
              <DiceIcon value={diceResult} />
            </div>
            {isRolling && !isMyTurn && (
              <p className="text-[10px] uppercase tracking-widest text-teal-400 font-bold animate-pulse">Rolling…</p>
            )}
            {!isRolling && !isMyTurn && !winner && (
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                {turnIsP1 ? "Player 1's turn" : "Player 2's turn"}
              </p>
            )}
            <button
              onClick={doRoll}
              disabled={isRolling || !isMyTurn || !!winner}
              className={`px-6 sm:px-8 py-3 font-black tracking-widest uppercase text-xs sm:text-sm rounded-2xl border border-white/20 transition-all
                ${isMyTurn && !winner
                  ? 'bg-gradient-to-tr from-indigo-600 to-teal-400 text-white hover:scale-105 active:scale-95 shadow-lg hover:shadow-indigo-500/40'
                  : 'bg-white/5 text-slate-500 opacity-60'
                } disabled:pointer-events-none`}
            >
              {rollBtnLabel}
            </button>
          </div>

          {/* P2 */}
          <div className={`flex flex-col-reverse sm:flex-row items-center gap-2 sm:gap-4 justify-end w-20 sm:w-auto p-2 rounded-xl transition-colors duration-300 ${!turnIsP1 && !winner ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-100' : 'text-slate-400'}`}>
            <div className="hidden sm:block text-right">
              <p className="text-xs font-bold uppercase tracking-widest">Player 2{!isPlayer1 ? ' (You)' : ''}</p>
              <p className="text-3xl font-extrabold font-mono">{player2Pos}</p>
            </div>
            <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-cyan-400 border-2 border-white/40 shadow-[0_0_20px_rgba(34,211,238,0.6)] transition-all ${!turnIsP1 && !winner ? 'animate-pulse scale-110' : 'opacity-50'}`} />
          </div>

        </div>
      </div>
    </main>
  );
}
