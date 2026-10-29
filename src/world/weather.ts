import { biomeAt } from './terrain';
import type { SeededNoise } from './noise';

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'thunder';

export class WeatherSystem {
  kind: WeatherKind = 'clear';
  intensity = 0;
  timer = 30;
  thunderCool = 0;
  flash = 0;

  update(dt: number, noise: SeededNoise, px: number, pz: number): void {
    this.timer -= dt;
    this.thunderCool -= dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.timer <= 0) {
      this.timer = 40 + Math.random() * 80;
      const biome = biomeAt(noise, px, pz);
      const roll = Math.random();
      if (biome === 'snow') {
        this.kind = roll < 0.55 ? 'snow' : 'clear';
      } else if (biome === 'desert') {
        this.kind = roll < 0.1 ? 'rain' : 'clear';
      } else {
        if (roll < 0.12) this.kind = 'thunder';
        else if (roll < 0.4) this.kind = 'rain';
        else this.kind = 'clear';
      }
      this.intensity = this.kind === 'clear' ? 0 : 0.5 + Math.random() * 0.5;
    }
    if (this.kind === 'thunder' && this.thunderCool <= 0 && Math.random() < 0.02) {
      this.flash = 1;
      this.thunderCool = 4 + Math.random() * 8;
    }
  }

  set(kind: WeatherKind, intensity = 0.8): void {
    this.kind = kind;
    this.intensity = intensity;
    this.timer = 60;
  }
}
