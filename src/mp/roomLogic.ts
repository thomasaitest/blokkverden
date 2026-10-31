/**
 * Pure room state for Blokkverden multiplayer (host-authoritative world).
 * Shared by Durable Object and unit tests.
 */

import {
  MAX_PLAYERS,
  MP_VERSION,
  type ClientMsg,
  type PlayerSnapshot,
  type PoseWire,
  type ServerMsg,
  type ChunkWire,
  snapshotFromHello,
} from './protocol.ts';
import { filterName } from './names.ts';
import { RateLimit } from './rateLimit.ts';

export interface RoomMember {
  id: string;
  name: string;
  host: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  pose: PoseWire;
  rate: RateLimit;
}

export interface RoomState {
  code: string;
  hostId: string | null;
  seed: number;
  members: Map<string, RoomMember>;
  /** dropId → owner/last touch (anti-dup: first take wins) */
  drops: Set<string>;
  worldChunks: ChunkWire[] | null;
  createdAt: number;
}

export type Outbound =
  | { kind: 'to'; id: string; msg: ServerMsg }
  | { kind: 'broadcast'; msg: ServerMsg; except?: string }
  | { kind: 'close'; id: string; code: number; reason: string };

export function createRoom(code: string, seed = 0): RoomState {
  return {
    code: code.toUpperCase(),
    hostId: null,
    seed: seed | 0,
    members: new Map(),
    drops: new Set(),
    worldChunks: null,
    createdAt: Date.now(),
  };
}

export function memberCount(room: RoomState): number {
  return room.members.size;
}

function toSnapshot(m: RoomMember): PlayerSnapshot {
  return {
    id: m.id,
    name: m.name,
    x: m.x,
    y: m.y,
    z: m.z,
    yaw: m.yaw,
    pitch: m.pitch,
    pose: m.pose,
    host: m.host,
  };
}

export function handleClientMessage(
  room: RoomState,
  senderId: string,
  msg: ClientMsg,
  now = Date.now(),
): Outbound[] {
  const out: Outbound[] = [];
  const member = room.members.get(senderId);

  if (msg.t === 'hello') {
    if (msg.v !== MP_VERSION) {
      out.push({
        kind: 'to',
        id: senderId,
        msg: { t: 'error', code: 'version', message: `Trenger protokoll v${MP_VERSION}` },
      });
      out.push({ kind: 'close', id: senderId, code: 4000, reason: 'version' });
      return out;
    }
    if (room.members.has(senderId)) {
      out.push({
        kind: 'to',
        id: senderId,
        msg: { t: 'error', code: 'dup', message: 'Allerede tilkoblet' },
      });
      return out;
    }
    if (room.members.size >= MAX_PLAYERS) {
      out.push({
        kind: 'to',
        id: senderId,
        msg: { t: 'error', code: 'full', message: 'Rommet er fullt (maks 4)' },
      });
      out.push({ kind: 'close', id: senderId, code: 4001, reason: 'full' });
      return out;
    }

    const wantHost = msg.wantHost && room.hostId === null;
    const name = filterName(msg.name) ?? ('Spiller' + String(room.members.size + 1));
    const m: RoomMember = {
      id: senderId,
      name,
      host: wantHost,
      x: 0,
      y: 40,
      z: 0,
      yaw: 0,
      pitch: 0,
      pose: 'idle',
      rate: new RateLimit(30),
    };
    if (wantHost) {
      room.hostId = senderId;
      if (typeof msg.seed === 'number') room.seed = msg.seed | 0;
    }
    room.members.set(senderId, m);

    const players = [...room.members.values()].map(toSnapshot);
    out.push({
      kind: 'to',
      id: senderId,
      msg: {
        t: 'welcome',
        you: senderId,
        code: room.code,
        hostId: room.hostId ?? senderId,
        seed: room.seed,
        players,
      },
    });
    out.push({
      kind: 'broadcast',
      msg: { t: 'joined', player: toSnapshot(m) },
      except: senderId,
    });

    // Always ask the host for a fresh snapshot (cache can be stale vs live block/door edits).
    if (!wantHost && room.hostId) {
      out.push({
        kind: 'to',
        id: room.hostId,
        msg: { t: 'need-world', from: senderId },
      });
      // Also push cache immediately if present (joiner may get a second fresher offer after).
      if (room.worldChunks && room.worldChunks.length > 0) {
        out.push({
          kind: 'to',
          id: senderId,
          msg: { t: 'world', seed: room.seed, chunks: room.worldChunks },
        });
      }
    }
    return out;
  }

  if (!member) {
    out.push({
      kind: 'to',
      id: senderId,
      msg: { t: 'error', code: 'no-hello', message: 'Send hello først' },
    });
    return out;
  }

  if (!member.rate.allow(now)) {
    out.push({
      kind: 'to',
      id: senderId,
      msg: { t: 'error', code: 'rate', message: 'For mange meldinger' },
    });
    return out;
  }

  switch (msg.t) {
    case 'state': {
      member.x = msg.x;
      member.y = msg.y;
      member.z = msg.z;
      member.yaw = msg.yaw;
      member.pitch = msg.pitch;
      member.pose = msg.pose;
      out.push({
        kind: 'broadcast',
        msg: {
          t: 'state',
          id: senderId,
          x: msg.x,
          y: msg.y,
          z: msg.z,
          yaw: msg.yaw,
          pitch: msg.pitch,
          pose: msg.pose,
        },
        except: senderId,
      });
      break;
    }
    case 'block': {
      out.push({
        kind: 'broadcast',
        msg: {
          t: 'block',
          by: senderId,
          x: msg.x,
          y: msg.y,
          z: msg.z,
          id: msg.id,
          meta: msg.meta,
        },
        except: senderId,
      });
      // Invalidate cached world so next joiner gets fresh offer
      room.worldChunks = null;
      break;
    }
    case 'drop-spawn': {
      if (room.drops.has(msg.dropId)) break;
      room.drops.add(msg.dropId);
      out.push({
        kind: 'broadcast',
        msg: {
          t: 'drop-spawn',
          by: senderId,
          dropId: msg.dropId,
          x: msg.x,
          y: msg.y,
          z: msg.z,
          itemId: msg.itemId,
          count: msg.count,
        },
        except: senderId,
      });
      break;
    }
    case 'drop-take': {
      if (!room.drops.has(msg.dropId)) break;
      room.drops.delete(msg.dropId);
      out.push({
        kind: 'broadcast',
        msg: { t: 'drop-take', by: senderId, dropId: msg.dropId },
        except: senderId,
      });
      break;
    }
    case 'world-offer': {
      if (senderId !== room.hostId) {
        out.push({
          kind: 'to',
          id: senderId,
          msg: { t: 'error', code: 'not-host', message: 'Bare verten kan sende verden' },
        });
        break;
      }
      room.seed = msg.seed;
      // Merge batches into the room cache (keyed by cx,cz)
      const byKey = new Map<string, typeof msg.chunks[number]>();
      for (const c of room.worldChunks ?? []) byKey.set(`${c.cx},${c.cz}`, c);
      for (const c of msg.chunks) byKey.set(`${c.cx},${c.cz}`, c);
      room.worldChunks = [...byKey.values()];
      out.push({
        kind: 'broadcast',
        msg: { t: 'world', seed: msg.seed, chunks: msg.chunks },
        except: senderId,
      });
      break;
    }
    case 'chat': {
      const text = msg.text.trim();
      if (!text) break;
      out.push({
        kind: 'broadcast',
        msg: { t: 'chat', id: senderId, name: member.name, text },
      });
      break;
    }
    case 'ping': {
      out.push({ kind: 'to', id: senderId, msg: { t: 'pong', n: msg.n } });
      break;
    }
    default:
      break;
  }
  return out;
}

export function handleDisconnect(room: RoomState, id: string): Outbound[] {
  const out: Outbound[] = [];
  const m = room.members.get(id);
  if (!m) return out;
  room.members.delete(id);
  out.push({ kind: 'broadcast', msg: { t: 'left', id } });
  if (m.host || id === room.hostId) {
    room.hostId = null;
    room.worldChunks = null;
    out.push({ kind: 'broadcast', msg: { t: 'host-left' } });
    // Close remaining sockets so clients leave cleanly
    for (const other of room.members.keys()) {
      out.push({ kind: 'close', id: other, code: 4002, reason: 'host-left' });
    }
  }
  return out;
}

export { snapshotFromHello };
