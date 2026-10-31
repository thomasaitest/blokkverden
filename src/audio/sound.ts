/** Procedural original SFX via Web Audio — no Mojang samples. */
export class SoundBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private stepCool = 0;
  private ambientTimer = 0;
  private vol = 0.25;

  setVolume(v: number): void {
    this.vol = Math.max(0, Math.min(1, v)) * 0.35;
    if (this.master) this.master.gain.value = this.vol;
  }

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.vol;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private beep(
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    vol = 0.2,
    slide = 0,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.15, filterFreq = 800): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start();
  }

  unlock(): void {
    this.ensure();
  }

  step(onGround: boolean, sprinting: boolean, dt: number, material: 'grass' | 'stone' | 'sand' | 'wood' | 'other'): void {
    if (!onGround) return;
    this.stepCool -= dt;
    if (this.stepCool > 0) return;
    this.stepCool = sprinting ? 0.28 : 0.4;
    const base = material === 'stone' ? 120 : material === 'sand' ? 90 : material === 'wood' ? 160 : 140;
    this.noise(0.05, 0.08, base + Math.random() * 40);
  }

  breakBlock(): void {
    this.noise(0.12, 0.22, 400);
    this.beep(180, 0.08, 'sawtooth', 0.08, -80);
  }

  placeBlock(): void {
    this.beep(220, 0.06, 'triangle', 0.12);
    this.noise(0.04, 0.1, 600);
  }

  /** MC item pickup "pop" */
  pickup(): void {
    this.beep(900 + Math.random() * 300, 0.05, 'sine', 0.06, 500);
  }

  hurt(): void {
    this.beep(200, 0.15, 'sawtooth', 0.2, -120);
  }

  eat(): void {
    this.beep(400, 0.05, 'sine', 0.1);
    this.beep(320, 0.08, 'sine', 0.08);
  }

  /** it20: hiss when rain/water puts out fire. */
  fizz(): void {
    this.noise(0.25, 0.12, 3000);
  }

  /** it22: shears — two short snips */
  shear(): void {
    this.noise(0.04, 0.12, 4200);
    setTimeout(() => this.noise(0.04, 0.1, 4800), 90);
  }

  /** it25: milking a cow — a low moo and a splash into the bucket */
  milk(): void {
    this.beep(150, 0.35, 'sawtooth', 0.08, -40);
    setTimeout(() => this.noise(0.12, 0.08, 1800), 120);
  }

  swing(): void {
    this.noise(0.06, 0.1, 1200);
  }

  bow(): void {
    this.beep(500, 0.1, 'triangle', 0.1, -200);
  }

  explode(): void {
    this.noise(0.4, 0.35, 100);
    this.beep(80, 0.3, 'sawtooth', 0.2, -60);
  }

  mobHit(): void {
    this.beep(150, 0.1, 'square', 0.12, -50);
  }

  ambient(dayTime: number, dt: number): void {
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 4 + Math.random() * 6;
    const night = dayTime < 0.2 || dayTime > 0.75;
    if (night) this.beep(90 + Math.random() * 40, 0.4, 'sine', 0.03);
    else this.beep(600 + Math.random() * 200, 0.15, 'sine', 0.02);
  }
}
