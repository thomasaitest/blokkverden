/** Blokkverden multiplayer wire protocol (client + Cloudflare DO). */

export const MP_VERSION = 1;
export const MAX_PLAYERS = 4;
export const STATE_HZ = 12;
/** State/emote messages; world chunks use WORLD_MSG_BYTES. */
export const MAX_MSG_BYTES = 32768;
export const WORLD_MSG_BYTES = 2_000_000;
export const MAX_MSG_PER_SEC = 30;

export type PoseWire = 'idle' | 'walk' | 'sneak' | 'jump' | 'swim' | 'fly';

export interface PlayerSnapshot {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  pose: PoseWire;
  host: boolean;
}

export interface ChunkWire {
  cx: number;
  cz: number;
  blocks: number[];
  waterLevel?: number[];
}

/** Client → server */
export type ClientMsg =
  | { t: 'hello'; v: number; name: string; playerId: string; wantHost: boolean; seed?: number }
  | { t: 'state'; x: number; y: number; z: number; yaw: number; pitch: number; pose: PoseWire }
  | { t: 'block'; x: number; y: number; z: number; id: number; meta?: number }
  | { t: 'drop-spawn'; dropId: string; x: number; y: number; z: number; itemId: number; count: number }
  | { t: 'drop-take'; dropId: string }
  | { t: 'world-offer'; seed: number; chunks: ChunkWire[] }
  | { t: 'chat'; text: string }
  | { t: 'ping'; n: number };

/** Server → client */
export type ServerMsg =
  | { t: 'welcome'; you: string; code: string; hostId: string; seed: number; players: PlayerSnapshot[] }
  | { t: 'joined'; player: PlayerSnapshot }
  | { t: 'left'; id: string }
  | { t: 'host-left' }
  | {
      t: 'state';
      id: string;
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
      pose: PoseWire;
    }
  | { t: 'block'; by: string; x: number; y: number; z: number; id: number; meta?: number }
  | { t: 'drop-spawn'; by: string; dropId: string; x: number; y: number; z: number; itemId: number; count: number }
  | { t: 'drop-take'; by: string; dropId: string }
  | { t: 'world'; seed: number; chunks: ChunkWire[] }
  | { t: 'need-world'; from: string }
  | { t: 'chat'; id: string; name: string; text: string }
  | { t: 'pong'; n: number }
  | { t: 'error'; code: string; message: string };

export function encode(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg);
}

export function decodeClient(raw: string): ClientMsg | null {
  try {
    return parseClient(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function decodeServer(raw: string): ServerMsg | null {
  try {
    return parseServer(JSON.parse(raw));
  } catch {
    return null;
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const POSES: PoseWire[] = ['idle', 'walk', 'sneak', 'jump', 'swim', 'fly'];

function parsePose(v: unknown): PoseWire {
  return isStr(v) && (POSES as string[]).includes(v) ? (v as PoseWire) : 'idle';
}

function clampCoord(n: number): number {
  return Math.max(-3e5, Math.min(3e5, n));
}

function parseChunk(v: unknown): ChunkWire | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isNum(o.cx) || !isNum(o.cz) || !Array.isArray(o.blocks)) return null;
  if (o.blocks.length > 20_000) return null;
  const blocks = o.blocks.map((b) => (isNum(b) ? (b | 0) : 0));
  const waterLevel = Array.isArray(o.waterLevel)
    ? o.waterLevel.map((b) => (isNum(b) ? (b | 0) : 0))
    : undefined;
  return { cx: o.cx | 0, cz: o.cz | 0, blocks, waterLevel };
}

export function parseClient(data: unknown): ClientMsg | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (!isStr(o.t)) return null;
  switch (o.t) {
    case 'hello':
      if (!isNum(o.v) || !isStr(o.name) || !isStr(o.playerId)) return null;
      if (o.playerId.length > 64 || o.name.length > 24) return null;
      return {
        t: 'hello',
        v: o.v | 0,
        name: o.name,
        playerId: o.playerId.slice(0, 64),
        wantHost: !!o.wantHost,
        seed: isNum(o.seed) ? (o.seed | 0) : undefined,
      };
    case 'state': {
      if (![o.x, o.y, o.z, o.yaw, o.pitch].every(isNum)) return null;
      const x = o.x as number, y = o.y as number, z = o.z as number;
      const yaw = o.yaw as number, pitch = o.pitch as number;
      return {
        t: 'state',
        x: clampCoord(x),
        y: clampCoord(y),
        z: clampCoord(z),
        yaw,
        pitch: Math.max(-1.55, Math.min(1.55, pitch)),
        pose: parsePose(o.pose),
      };
    }
    case 'block': {
      if (![o.x, o.y, o.z, o.id].every(isNum)) return null;
      return {
        t: 'block',
        x: (o.x as number) | 0,
        y: (o.y as number) | 0,
        z: (o.z as number) | 0,
        id: (o.id as number) | 0,
        meta: isNum(o.meta) ? (o.meta | 0) : undefined,
      };
    }
    case 'drop-spawn': {
      if (!isStr(o.dropId) || o.dropId.length > 40) return null;
      if (![o.x, o.y, o.z, o.itemId, o.count].every(isNum)) return null;
      return {
        t: 'drop-spawn',
        dropId: o.dropId.slice(0, 40),
        x: clampCoord(o.x as number),
        y: clampCoord(o.y as number),
        z: clampCoord(o.z as number),
        itemId: (o.itemId as number) | 0,
        count: Math.max(1, Math.min(64, (o.count as number) | 0)),
      };
    }
    case 'drop-take':
      if (!isStr(o.dropId) || o.dropId.length > 40) return null;
      return { t: 'drop-take', dropId: o.dropId.slice(0, 40) };
    case 'world-offer': {
      if (!isNum(o.seed) || !Array.isArray(o.chunks)) return null;
      if (o.chunks.length > 256) return null;
      const chunks: ChunkWire[] = [];
      for (const c of o.chunks) {
        const parsed = parseChunk(c);
        if (!parsed) return null;
        chunks.push(parsed);
      }
      return { t: 'world-offer', seed: o.seed | 0, chunks };
    }
    case 'chat':
      if (!isStr(o.text) || o.text.length > 80) return null;
      return { t: 'chat', text: o.text.slice(0, 80) };
    case 'ping':
      if (!isNum(o.n)) return null;
      return { t: 'ping', n: o.n | 0 };
    default:
      return null;
  }
}

export function parseServer(data: unknown): ServerMsg | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (!isStr(o.t)) return null;
  switch (o.t) {
    case 'welcome':
    case 'joined':
    case 'left':
    case 'host-left':
    case 'state':
    case 'block':
    case 'drop-spawn':
    case 'drop-take':
    case 'world':
    case 'need-world':
    case 'chat':
    case 'pong':
    case 'error':
      return data as ServerMsg;
    default:
      return null;
  }
}

export function snapshotFromHello(id: string, name: string, host: boolean): PlayerSnapshot {
  return { id, name, x: 0, y: 40, z: 0, yaw: 0, pitch: 0, pose: 'idle', host };
}
