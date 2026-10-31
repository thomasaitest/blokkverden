import { generateCode } from './codes.ts';

const KEY = 'bv_mp_player_id';
const NAME_KEY = 'bv_mp_name';

export function getOrCreatePlayerId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || id.length < 8) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function getSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.slice(0, 24));
  } catch {
    /* ignore */
  }
}

export function newHostCode(): string {
  return generateCode();
}

/** Default WS URL: Vite injects VITE_MP_URL; fall back to local wrangler. */
export function defaultMpUrl(): string {
  const env = (import.meta as { env?: { VITE_MP_URL?: string } }).env?.VITE_MP_URL;
  if (env) return env.replace(/\/$/, '');
  if (typeof location !== 'undefined') {
    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'ws://127.0.0.1:8788';
    }
  }
  return 'wss://blokkverden-mp.thomas-aanensen.workers.dev';
}

export function roomWsUrl(base: string, code: string): string {
  const c = code.trim().toUpperCase();
  const root = base.replace(/\/$/, '');
  if (root.startsWith('ws')) return `${root}/room/${c}`;
  if (root.startsWith('http')) return root.replace(/^http/, 'ws') + `/room/${c}`;
  return `wss://${root}/room/${c}`;
}
