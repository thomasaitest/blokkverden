/** Sliding-window rate limiter for one connection. */

export class RateLimit {
  private times: number[] = [];
  constructor(
    private readonly maxPerSec: number,
    private readonly windowMs = 1000,
  ) {}

  /** Returns false if the event should be dropped. */
  allow(now = Date.now()): boolean {
    const cut = now - this.windowMs;
    this.times = this.times.filter((t) => t >= cut);
    if (this.times.length >= this.maxPerSec) return false;
    this.times.push(now);
    return true;
  }

  reset() {
    this.times = [];
  }
}
