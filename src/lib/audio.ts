class GameAudio {
   private ctx: AudioContext | null = null;
   
   init() {
       if (typeof window !== 'undefined') {
           if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
           // Resume context on first interaction if blocked by browser policy
           if (this.ctx.state === 'suspended') this.ctx.resume();
       }
   }

   playTone(freq: number, type: OscillatorType, duration: number, vol = 0.1) {
       if (!this.ctx) return;
       const osc = this.ctx.createOscillator();
       const gain = this.ctx.createGain();
       osc.type = type;
       osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
       
       gain.gain.setValueAtTime(vol, this.ctx.currentTime);
       gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
       
       osc.connect(gain);
       gain.connect(this.ctx.destination);
       osc.start();
       osc.stop(this.ctx.currentTime + duration);
   }

   stepSound() {
       this.init();
       this.playTone(400 + Math.random()*100, 'triangle', 0.1, 0.05);
   }

   diceSound() {
       this.init();
       // Rapid clicks creating a shaking effect
       for(let i=0; i<6; i++) {
           setTimeout(() => this.playTone(800 + Math.random() * 400, 'square', 0.05, 0.02), i * 40);
       }
   }

   snakeSound() {
       this.init();
       if (!this.ctx) return;
       const osc = this.ctx.createOscillator();
       const gain = this.ctx.createGain();
       osc.type = 'sawtooth';
       // Sliding pitch down dramatically for a 'penalty' feeling
       osc.frequency.setValueAtTime(400, this.ctx.currentTime);
       osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.8);
       
       gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
       gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.8);
       
       osc.connect(gain);
       gain.connect(this.ctx.destination);
       osc.start();
       osc.stop(this.ctx.currentTime + 0.8);
   }

   ladderSound() {
       this.init();
       if (!this.ctx) return;
       // Arpeggio up for 'promotion' exciting feel
       const freqs = [300, 400, 500, 600, 800, 1000];
       freqs.forEach((f, i) => {
           setTimeout(() => this.playTone(f, 'sine', 0.15, 0.1), i * 80);
       });
   }

   winSound() {
       this.init();
       // Triumphant Fanfare (C major arpeggio)
       const freqs = [523.25, 523.25, 523.25, 659.25, 783.99, 659.25, 1046.50];
       const times = [0, 150, 300, 450, 600, 750, 900];
       freqs.forEach((f, i) => {
           setTimeout(() => this.playTone(f, 'square', 0.3, 0.1), times[i]);
       });
   }
}

export const sfx = new GameAudio();
