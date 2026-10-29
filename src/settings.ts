export interface GameSettings {
  renderDistance: number;
  fov: number;
  sensitivity: number;
  volume: number;
}

const KEY = 'bv-settings';
const DEFAULTS: GameSettings = { renderDistance: 7, fov: 70, sensitivity: 1, volume: 0.7 };

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: GameSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
