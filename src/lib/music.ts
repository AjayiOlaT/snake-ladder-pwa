/**
 * Procedural music engine — pure Web Audio API, no external files.
 *
 * Normal mode  : 108 BPM, triangle-wave melody, light hi-hat + kick
 * Intense mode : 152 BPM, added harmony layer, sharper filter, louder
 *
 * Uses a look-ahead scheduler (setInterval at 50 ms) so timing is tight.
 */

// C-major pentatonic: C4 D4 E4 G4 A4 C5 D5 E5 G5
const P = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 784.0];

// Melody — indices into P, 16-note loop
const MELODY = [0, 2, 4, 3, 2, 0, 1, 2, 4, 5, 4, 3, 2, 4, 3, 0];

// Bass root notes (one every 4 melody beats) — indices into P shifted down 2 octaves
const BASS_ROOTS = [0, 2, 4, 2]; // C3 D3 E3 D3

class MusicEngine {
  private ctx:    AudioContext | null = null;
  private master: GainNode     | null = null;

  private _playing  = false;
  private _intense  = false;
  private _noteIdx  = 0;
  private _schedAt  = 0;          // next unscheduled time in AudioContext seconds
  private _ticker:  ReturnType<typeof setInterval> | null = null;

  // ─── Public API ────────────────────────────────────────────────────────────

  play() {
    if (typeof window === 'undefined') return;
    this._ensureCtx();
    if (this.ctx!.state === 'suspended') this.ctx!.resume();
    if (this._playing) return;
    this._playing = true;
    this._schedAt = this.ctx!.currentTime + 0.05;
    this._tick();
    this._ticker = setInterval(() => this._tick(), 50);
  }

  stop() {
    this._playing = false;
    if (this._ticker) { clearInterval(this._ticker); this._ticker = null; }
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setValueAtTime(this.master.gain.value, this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.0);
      // Reset volume silently after fade-out so next play() starts fresh
      setTimeout(() => { if (this.master) this.master.gain.value = this._masterVol(); }, 1200);
    }
  }

  setIntense(intense: boolean) {
    if (this._intense === intense || !this.ctx || !this.master) return;
    this._intense = intense;
    const target = this._masterVol();
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 2.0);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _ensureCtx() {
    if (this.ctx) return;
    this.ctx   = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._masterVol();
    this.master.connect(this.ctx.destination);
  }

  private _masterVol() { return this._intense ? 0.26 : 0.16; }
  private _beatSec()   { return this._intense ? 60 / 152 : 60 / 108; }

  private _tick() {
    if (!this._playing || !this.ctx) return;
    const horizon = this.ctx.currentTime + 0.15; // schedule 150 ms ahead

    while (this._schedAt < horizon) {
      const b    = this._beatSec();
      const mIdx = this._noteIdx % MELODY.length;
      const freq = P[MELODY[mIdx]];
      const t    = this._schedAt;

      // ── Melody note ──────────────────────────────────────────────────────
      this._tone(freq, t, b * 0.82, 0.13, 'triangle');

      // ── Harmony (5th above) in intense mode ──────────────────────────────
      if (this._intense)
        this._tone(freq * 1.5, t, b * 0.82, 0.065, 'triangle');

      // ── Bass every 4 beats ───────────────────────────────────────────────
      if (mIdx % 4 === 0) {
        const bassFreq = P[BASS_ROOTS[Math.floor(mIdx / 4) % BASS_ROOTS.length]] / 2;
        this._bass(bassFreq, t, b * 3.6);
      }

      // ── Kick on beats 0 and 8 ────────────────────────────────────────────
      if (mIdx === 0 || mIdx === 8) this._kick(t);

      // ── Hi-hat every beat ────────────────────────────────────────────────
      this._hihat(t);

      // ── Off-beat hi-hat in intense mode ──────────────────────────────────
      if (this._intense) this._hihat(t + b * 0.5, 0.025);

      this._noteIdx++;
      this._schedAt += b;
    }
  }

  // ── Synthesis helpers ─────────────────────────────────────────────────────

  private _tone(
    freq: number, time: number, dur: number,
    vol: number, type: OscillatorType = 'triangle'
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const lpf = ctx.createBiquadFilter();

    osc.type           = type;
    osc.frequency.value = freq;
    lpf.type           = 'lowpass';
    lpf.frequency.value = this._intense ? 2400 : 1400;
    lpf.Q.value         = 0.7;

    osc.connect(lpf); lpf.connect(env); env.connect(this.master!);

    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(vol, time + 0.015);
    env.gain.setValueAtTime(vol * 0.75, time + dur * 0.5);
    env.gain.linearRampToValueAtTime(0, time + dur);

    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  private _bass(freq: number, time: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type            = 'sine';
    osc.frequency.value = freq;

    osc.connect(env); env.connect(this.master!);

    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.18, time + 0.04);
    env.gain.setValueAtTime(0.09, time + 0.3);
    env.gain.linearRampToValueAtTime(0, time + dur);

    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  private _hihat(time: number, vol = 0.04) {
    const ctx     = this.ctx!;
    const frames  = Math.floor(ctx.sampleRate * 0.045);
    const buf     = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data    = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    const src    = ctx.createBufferSource();
    src.buffer   = buf;
    const hpf    = ctx.createBiquadFilter();
    hpf.type     = 'highpass';
    hpf.frequency.value = 8000;

    const env = ctx.createGain();
    env.gain.setValueAtTime(vol, time);
    env.gain.linearRampToValueAtTime(0, time + 0.045);

    src.connect(hpf); hpf.connect(env); env.connect(this.master!);
    src.start(time);
  }

  private _kick(time: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.18);

    env.gain.setValueAtTime(0.55, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.32);

    osc.connect(env); env.connect(this.master!);
    osc.start(time);
    osc.stop(time + 0.36);
  }
}

export const music = new MusicEngine();
