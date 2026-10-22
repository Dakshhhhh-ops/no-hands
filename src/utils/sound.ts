// Synthesized micro-sound effects using Web Audio API for tactical, responsive studio UI.
// Completely self-contained, zero external audio asset requests.

/** Older Safari exposes the Web Audio constructor only under a vendor prefix. */
type WindowWithWebkitAudio = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

class SoundFX {
  // `declare` keeps these type-only, so the constructor stays the sole initializer.
  declare ctx: AudioContext | null;
  declare enabled: boolean;

  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const win: WindowWithWebkitAudio = window;
      const AudioCtx = win.AudioContext || win.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.init();
      this.blip(580, 'sine', 0.05, 0.05);
    }
    return this.enabled;
  }

  blip(freq = 440, type: OscillatorType = 'sine', duration = 0.04, gainVal = 0.03) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, this.ctx.currentTime + duration);

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // AudioContext unavailable or blocked
    }
  }

  click() {
    this.blip(820, 'triangle', 0.03, 0.025);
  }

  tab() {
    this.blip(640, 'sine', 0.05, 0.035);
  }

  apply() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      // Narrowing on this.ctx does not reach the callback below, so hold the checked context.
      const ctx = this.ctx;
      const now = ctx.currentTime;
      [440, 660, 880].forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + i * 0.04);
        gain.gain.setValueAtTime(0.03, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.04 + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.12);
      });
    } catch {
      // AudioContext unavailable or blocked
    }
  }

  export() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      // Narrowing on this.ctx does not reach the callback below, so hold the checked context.
      const ctx = this.ctx;
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + i * 0.05);
        gain.gain.setValueAtTime(0.025, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.18);
      });
    } catch {
      // AudioContext unavailable or blocked
    }
  }
}

export const sound = new SoundFX();

