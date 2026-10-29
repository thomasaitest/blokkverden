/** Original procedural background music — pentatonic pads + soft melody. */
export class MusicBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private playing = false;
  private nextNote = 0;
  private step = 0;
  private enabled = true;
  private vol = 0.08;

  setVolume(v: number): void {
    this.vol = Math.max(0, Math.min(1, v)) * 0.12;
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

  start(): void {
    this.ensure();
    this.playing = true;
  }

  stop(): void { this.playing = false; }

  /** Call each frame; schedules soft notes ahead. */
  update(dayTime: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.playing) return;
    const now = ctx.currentTime;
    if (now < this.nextNote) return;
    const night = dayTime < 0.2 || dayTime > 0.75;
    // C pentatonic-ish original scale
    const scale = night
      ? [130.81, 155.56, 174.61, 196.0, 233.08, 261.63]
      : [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    const freq = scale[this.step % scale.length];
    this.step++;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const dur = 1.2 + (this.step % 3) * 0.4;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.15, now + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.05);
    // soft fifth pad every 4 notes
    if (this.step % 4 === 0) {
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'triangle';
      o2.frequency.value = freq * 1.5;
      g2.gain.setValueAtTime(0.001, now);
      g2.gain.linearRampToValueAtTime(0.06, now + 0.3);
      g2.gain.exponentialRampToValueAtTime(0.001, now + dur * 1.5);
      o2.connect(g2); g2.connect(this.master);
      o2.start(now); o2.stop(now + dur * 1.5 + 0.05);
    }
    this.nextNote = now + 0.85 + (this.step % 5) * 0.15;
  }

  rain(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const n = Math.floor(ctx.sampleRate * 0.3);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.value = 0.04;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }

  thunder(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.8);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.connect(g); g.connect(this.master);
    osc.start(); osc.stop(ctx.currentTime + 1.3);
  }
}
