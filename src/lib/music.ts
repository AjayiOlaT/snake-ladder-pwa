/**
 * Procedural music engine — pure Web Audio API, no external files.
 * Supports dynamic switching between scenes (Hub, Neon Arena, Number Duel).
 */

const SCALES = {
  major: [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25], // C Major
  pentatonic: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 784.0], // C Pentatonic
  mystic: [261.63, 277.18, 329.63, 349.23, 392.0, 415.3, 493.88, 523.25], // C Phrygian Dominant
};

interface SceneConfig {
  bpm: number;
  melody: number[];
  bass: number[];
  scale: number[];
  wave: OscillatorType;
  lpf: number;
}

const SCENES: Record<string, SceneConfig> = {
  'hub': {
    bpm: 92,
    melody: [0, 2, 4, 2, 0, 4, 3, 2, 0, 2, 5, 4, 2, 4, 0, 0],
    bass: [0, 3, 4, 3],
    scale: SCALES.major,
    wave: 'sine',
    lpf: 1200
  },
  'snake-ladder': {
    bpm: 108, // Base speed
    melody: [0, 2, 4, 3, 2, 0, 1, 2, 4, 5, 4, 3, 2, 4, 3, 0],
    bass: [0, 2, 4, 2],
    scale: SCALES.pentatonic,
    wave: 'triangle',
    lpf: 1400
  },
  'number-duel': {
    bpm: 124,
    melody: [0, 1, 4, 3, 1, 0, 1, 4, 3, 6, 5, 4, 3, 1, 0, 0],
    bass: [0, 1, 3, 1],
    scale: SCALES.mystic,
    wave: 'sawtooth',
    lpf: 1000
  },
  'tug-of-war': {
    bpm: 132,
    melody: [0, 4, 5, 4, 0, 3, 4, 3, 0, 2, 3, 2, 0, 1, 2, 1],
    bass: [0, 1, 0, 1],
    scale: SCALES.mystic,
    wave: 'sawtooth',
    lpf: 1300
  }
};

class MusicEngine {
  private ctx:    AudioContext | null = null;
  private master: GainNode     | null = null;

  private _playing  = false;
  private _muted    = false;
  private _scene:   keyof typeof SCENES = 'hub';
  private _intense  = false;
  private _noteIdx  = 0;
  private _schedAt  = 0;
  private _ticker:  ReturnType<typeof setInterval> | null = null;

  async play() {
    if (typeof window === 'undefined') return;
    this._ensureCtx();
    
    if (this.ctx!.state === 'suspended') {
        await this.ctx!.resume();
    }

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
      this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
    }
  }

  isPlaying() {
    return this._playing && this.ctx?.state === 'running';
  }

  setScene(scene: keyof typeof SCENES) {
    if (this._scene === scene || !SCENES[scene]) return;
    this._scene = scene;
    // Reset index for clean start if switching
    this._noteIdx = 0;
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this.master && this.ctx) {
      const vol = this._muted ? 0 : this._masterVol();
      this.master.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
    }
    return this._muted;
  }

  isMuted() { return this._muted; }

  setIntense(intense: boolean) {
    if (this._intense === intense || !this.ctx || !this.master) return;
    this._intense = intense;
    const target = this._masterVol();
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 1.0);
  }

  private _ensureCtx() {
    if (this.ctx) return;
    this.ctx   = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._muted ? 0 : this._masterVol();
    this.master.connect(this.ctx.destination);
  }

  private _masterVol() { 
    if (this._scene === 'hub') return 0.12;
    return this._intense ? 0.22 : 0.14; 
  }

  private _getBPM() {
    const base = SCENES[this._scene].bpm;
    return this._intense ? base + 40 : base;
  }

  private _tick() {
    if (!this._playing || !this.ctx) return;
    const horizon = this.ctx.currentTime + 0.15;
    const config  = SCENES[this._scene];

    while (this._schedAt < horizon) {
      if (this._muted) {
        this._schedAt += (60 / this._getBPM());
        continue;
      }

      const b    = 60 / this._getBPM();
      const mIdx = this._noteIdx % config.melody.length;
      const freq = config.scale[config.melody[mIdx]];
      const t    = this._schedAt;

      // ── Melody ───────────────────────────────────────────────────────────
      this._tone(freq, t, b * 0.85, 0.12, config.wave);

      // ── Harmony (intense or specific duel layer) ─────────────────────────
      if (this._intense || this._scene === 'number-duel' || this._scene === 'tug-of-war') {
        const harm = (this._scene === 'number-duel' || this._scene === 'tug-of-war') ? 1.25 : 1.5; 
        this._tone(freq * harm, t, b * 0.85, 0.05, 'sine');
      }

      // ── Bass ─────────────────────────────────────────────────────────────
      if (this._noteIdx % 4 === 0) {
        const bassIdx = Math.floor(this._noteIdx / 4) % config.bass.length;
        this._bass(config.scale[config.bass[bassIdx]] / 2, t, b * 3.5);
      }

      // ── Percussion ───────────────────────────────────────────────────────
      if (this._noteIdx % 8 === 0) this._kick(t);
      this._hihat(t, this._scene === 'hub' ? 0.02 : 0.04);

      if (this._intense && (this._noteIdx % 2 === 1)) this._hihat(t, 0.015);

      this._noteIdx++;
      this._schedAt += b;
    }
  }

  private _tone(freq: number, time: number, dur: number, vol: number, type: OscillatorType) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const lpf = ctx.createBiquadFilter();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(SCENES[this._scene].lpf, time);

    osc.connect(lpf); lpf.connect(env); env.connect(this.master!);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(vol, time + 0.01);
    env.gain.linearRampToValueAtTime(0, time + dur);

    osc.start(time);
    osc.stop(time + dur + 0.1);
  }

  private _bass(freq: number, time: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    osc.connect(env); env.connect(this.master!);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.15, time + 0.05);
    env.gain.linearRampToValueAtTime(0, time + dur);
    osc.start(time);
    osc.stop(time + dur + 0.1);
  }

  private _hihat(time: number, vol: number) {
    const ctx = this.ctx!;
    const frames = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(7000, time);
    const env = ctx.createGain();
    env.gain.setValueAtTime(vol, time);
    env.gain.linearRampToValueAtTime(0, time + 0.04);
    src.connect(hpf); hpf.connect(env); env.connect(this.master!);
    src.start(time);
  }

  private _kick(time: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.001, time + 0.2);
    env.gain.setValueAtTime(0.4, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(env); env.connect(this.master!);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  // ── Standalone SFX ───────────────────────────────────────────────────
  async _prepareSFX() {
      if (typeof window === 'undefined') return false;
      this._ensureCtx();
      if (this.ctx!.state === 'suspended') await this.ctx!.resume();
      if (this._muted) return false;
      return true;
  }

  async playWinSound() {
    if (!(await this._prepareSFX())) return;
    const t = this.ctx!.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, i) => {
      this._tone(freq, t + i * 0.15, 0.4, 0.2, 'sawtooth');
      this._tone(freq * 1.5, t + i * 0.15, 0.4, 0.1, 'sine');
    });
  }

  async playHigherSound() {
    if (!(await this._prepareSFX())) return;
    const t = this.ctx!.currentTime;
    const notes = [392.0, 523.25];
    notes.forEach((freq, i) => {
      this._tone(freq, t + i * 0.1, 0.2, 0.15, 'square');
    });
  }

  async playLowerSound() {
    if (!(await this._prepareSFX())) return;
    const t = this.ctx!.currentTime;
    const notes = [392.0, 261.63];
    notes.forEach((freq, i) => {
      this._tone(freq, t + i * 0.1, 0.2, 0.15, 'triangle');
    });
  }

  async playMatchSound() {
    if (!(await this._prepareSFX())) return;
    const t = this.ctx!.currentTime;
    const notes = [261.63, 329.63, 392.0];
    notes.forEach((freq) => {
      this._tone(freq, t, 0.6, 0.15, 'sine');
      this._tone(freq * 2, t, 0.6, 0.08, 'triangle');
    });
  }

  async playMoveSound() {
    if (!(await this._prepareSFX())) return;
    const t = this.ctx!.currentTime;
    // A quick "tug" sound
    const notes = [150, 100];
    notes.forEach((freq, i) => {
      this._tone(freq, t + i * 0.05, 0.1, 0.2, 'sawtooth');
    });
  }
}

export const music = new MusicEngine();

