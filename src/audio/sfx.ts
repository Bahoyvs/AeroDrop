/**
 * All audio is synthesised with WebAudio - no files to download, and the
 * clicky/bubbly palette matches the 2000s UI without shipping a sample pack.
 * The context is created lazily on the first gesture, as browsers require.
 */

type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  /** Ads must play against silence; this is separate from the user's mute. */
  private ducked = false;

  /** Safe to call repeatedly; only the first call inside a gesture matters. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Silences everything while an ad is on screen. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.applyGain();
  }

  private applyGain(): void {
    if (!this.master || !this.ctx) return;
    const target = this.muted || this.ducked ? 0 : 0.55;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  private get out(): GainNode | null {
    if (!this.ctx || !this.master) return null;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.master;
  }

  private tone(
    freq: number,
    duration: number,
    options: {
      type?: Wave;
      gain?: number;
      sweepTo?: number;
      delay?: number;
      attack?: number;
      detune?: number;
    } = {},
  ): void {
    const out = this.out;
    if (!out || !this.ctx) return;
    const now = this.ctx.currentTime + (options.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, now);
    if (options.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.sweepTo), now + duration);
    if (options.detune) osc.detune.value = options.detune;

    const peak = options.gain ?? 0.2;
    const attack = options.attack ?? 0.006;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  private noise(duration: number, options: { gain?: number; freq?: number; sweepTo?: number; q?: number } = {}): void {
    const out = this.out;
    if (!out || !this.ctx) return;
    if (!this.noiseBuffer) {
      const length = Math.floor(this.ctx.sampleRate * 1.2);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(options.freq ?? 900, now);
    filter.Q.value = options.q ?? 1.1;
    if (options.sweepTo) filter.frequency.exponentialRampToValueAtTime(options.sweepTo, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.15, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter).connect(gain).connect(out);
    src.start(now);
    src.stop(now + duration + 0.05);
  }

  // ----------------------------------------------------------------- events

  /** Chunky plastic button press. */
  click(): void {
    this.tone(880, 0.06, { type: 'square', gain: 0.09, sweepTo: 1320 });
    this.noise(0.05, { gain: 0.05, freq: 2600, sweepTo: 1400 });
  }

  hover(): void {
    this.tone(1500, 0.035, { type: 'sine', gain: 0.025 });
  }

  /** Water-drop blip when food is absorbed; pitch rises with the streak. */
  eatFood(streak: number): void {
    const step = Math.min(14, streak);
    this.tone(520 * Math.pow(1.0293, step), 0.075, {
      type: 'sine',
      gain: 0.055,
      sweepTo: 900 * Math.pow(1.0293, step),
    });
  }

  eatDrop(): void {
    this.tone(180, 0.28, { type: 'sine', gain: 0.24, sweepTo: 70 });
    this.noise(0.32, { gain: 0.16, freq: 500, sweepTo: 130, q: 0.7 });
    this.tone(660, 0.18, { type: 'triangle', gain: 0.09, sweepTo: 1200, delay: 0.02 });
  }

  boost(): void {
    this.noise(0.24, { gain: 0.13, freq: 320, sweepTo: 2400, q: 0.8 });
    this.tone(320, 0.2, { type: 'sawtooth', gain: 0.06, sweepTo: 720 });
  }

  death(): void {
    this.tone(420, 0.7, { type: 'triangle', gain: 0.22, sweepTo: 60 });
    this.tone(210, 0.9, { type: 'sine', gain: 0.16, sweepTo: 40, delay: 0.05 });
    this.noise(0.7, { gain: 0.12, freq: 800, sweepTo: 90, q: 0.6 });
  }

  spawn(): void {
    this.tone(300, 0.3, { type: 'sine', gain: 0.15, sweepTo: 900 });
    this.tone(600, 0.25, { type: 'sine', gain: 0.08, sweepTo: 1400, delay: 0.05 });
  }

  /** Cosmetic unlocked / reward granted jingle. */
  reward(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, 0.26, { type: 'triangle', gain: 0.13, delay: i * 0.075 });
    });
  }

  countdown(): void {
    this.tone(1200, 0.09, { type: 'square', gain: 0.07 });
  }

  /** Slow underwater drone, started when a match begins. */
  startAmbient(): void {
    const out = this.out;
    if (!out || !this.ctx || this.ambientGain) return;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.1, this.ctx.currentTime, 1.6);
    gain.connect(out);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    filter.connect(gain);

    for (const [freq, detune] of [
      [55, 0],
      [82.4, 7],
      [110, -6],
    ] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start();
      this.ambientNodes.push(osc);
    }

    // Slow filter sweep so the drone breathes instead of sitting flat.
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.06;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.ambientNodes.push(lfo);

    this.ambientGain = gain;
  }

  stopAmbient(): void {
    if (!this.ctx || !this.ambientGain) return;
    const gain = this.ambientGain;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    const nodes = this.ambientNodes;
    this.ambientGain = null;
    this.ambientNodes = [];
    window.setTimeout(() => {
      for (const node of nodes) {
        if ('stop' in node) (node as OscillatorNode).stop();
        node.disconnect();
      }
      gain.disconnect();
    }, 1200);
  }
}

export const sfx = new Sfx();
