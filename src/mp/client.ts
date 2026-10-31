import type * as THREE from 'three';
import { STATE_HZ, type ChunkWire, type PoseWire, type ServerMsg } from './protocol.ts';
import { RemotePlayers } from './remotes.ts';
import { WsTransport } from './wsTransport.ts';
import {
  defaultMpUrl,
  getOrCreatePlayerId,
  getSavedName,
  newHostCode,
  roomWsUrl,
  saveName,
} from './session.ts';
import { cleanCode, isValidCode } from './codes.ts';
import { filterName } from './names.ts';

export interface MpGameHooks {
  scene: THREE.Scene;
  getPose: () => {
    x: number; y: number; z: number; yaw: number; pitch: number; pose: PoseWire;
  };
  /** Host: serialize modified chunks for joiners. */
  getWorldOffer?: () => { seed: number; chunks: ChunkWire[] };
  /** Apply host world on joiner (and late join). */
  applyWorld?: (seed: number, chunks: ChunkWire[]) => void;
  /** Remote block change (place/break/door meta). */
  applyBlock?: (x: number, y: number, z: number, id: number, meta?: number) => void;
  applyDropSpawn?: (dropId: string, x: number, y: number, z: number, itemId: number, count: number) => void;
  applyDropTake?: (dropId: string) => void;
  onHostLeft?: () => void;
  onChat?: (name: string, text: string) => void;
  onStatus?: (msg: string, kind?: 'ok' | 'bad' | 'info') => void;
  /** Joiner: host seed from welcome (before chunks). */
  onWelcomeSeed?: (seed: number) => void;
}

export class MpClient {
  remotes: RemotePlayers;
  private transport = new WsTransport();
  private you = '';
  private hostId = '';
  code = '';
  seed = 0;
  active = false;
  isHost = false;
  private lastStateAt = 0;
  private name = '';
  private playerId = getOrCreatePlayerId();
  private pendingHost = false;

  constructor(private hooks: MpGameHooks) {
    this.remotes = new RemotePlayers(hooks.scene);
    this.transport.onMessage = (msg) => this.onServer(msg);
    this.transport.onStatus = (s, detail) => {
      if (s === 'error') this.hooks.onStatus?.(detail || 'Tilkoblingsfeil', 'bad');
      if (s === 'closed' && this.active) {
        this.active = false;
        this.hooks.onStatus?.('Frakoblet', 'info');
      }
    };
  }

  /** Create a room as host (world already running). */
  host(displayName: string, seed: number): string | null {
    const name = filterName(displayName);
    if (!name) return null;
    saveName(name);
    this.name = name;
    this.seed = seed;
    this.isHost = true;
    this.pendingHost = true;
    this.code = newHostCode();
    this.connect(this.code, true);
    return this.code;
  }

  /** Join an existing room; world applied when welcome/world arrives. */
  join(displayName: string, codeRaw: string): boolean {
    const name = filterName(displayName);
    const code = cleanCode(codeRaw);
    if (!name || !isValidCode(code)) return false;
    saveName(name);
    this.name = name;
    this.isHost = false;
    this.pendingHost = false;
    this.code = code;
    this.connect(code, false);
    return true;
  }

  private connect(code: string, wantHost: boolean) {
    const url = roomWsUrl(defaultMpUrl(), code);
    this.transport.connect(url);
    const tryHello = () => {
      if (this.transport.status !== 'open') return;
      this.transport.send({
        t: 'hello',
        v: 1,
        name: this.name,
        playerId: this.playerId,
        wantHost,
        seed: wantHost ? this.seed : undefined,
      });
    };
    if (this.transport.status === 'open') tryHello();
    else {
      const prev = this.transport.onStatus;
      this.transport.onStatus = (s, d) => {
        prev?.(s, d);
        if (s === 'open') tryHello();
      };
    }
  }

  leave() {
    this.transport.close();
    this.active = false;
    this.code = '';
    this.you = '';
    this.hostId = '';
    this.remotes.clear();
  }

  sendBlock(x: number, y: number, z: number, id: number, meta?: number) {
    if (!this.active) return;
    this.transport.send({ t: 'block', x, y, z, id, meta });
  }

  sendDropSpawn(dropId: string, x: number, y: number, z: number, itemId: number, count: number) {
    if (!this.active) return;
    this.transport.send({ t: 'drop-spawn', dropId, x, y, z, itemId, count });
  }

  sendDropTake(dropId: string) {
    if (!this.active) return;
    this.transport.send({ t: 'drop-take', dropId });
  }

  sendChat(text: string) {
    if (!this.active) return;
    this.transport.send({ t: 'chat', text });
  }

  offerWorld() {
    if (!this.active || !this.isHost || !this.hooks.getWorldOffer) return;
    const offer = this.hooks.getWorldOffer();
    // Batch chunks so large worlds stay under the WS frame limit.
    const batch = 2;
    const chunks = offer.chunks;
    if (chunks.length === 0) {
      this.transport.send({ t: 'world-offer', seed: offer.seed, chunks: [] });
      return;
    }
    for (let i = 0; i < chunks.length; i += batch) {
      this.transport.send({ t: 'world-offer', seed: offer.seed, chunks: chunks.slice(i, i + batch) });
    }
  }

  tick(dt: number) {
    this.remotes.tick(dt);
    if (!this.active) return;
    const now = performance.now();
    if (now - this.lastStateAt < 1000 / STATE_HZ) return;
    this.lastStateAt = now;
    const pose = this.hooks.getPose();
    this.transport.send({
      t: 'state',
      x: pose.x,
      y: pose.y,
      z: pose.z,
      yaw: pose.yaw,
      pitch: pose.pitch,
      pose: pose.pose,
    });
  }

  private onServer(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome': {
        this.you = msg.you;
        this.code = msg.code;
        this.hostId = msg.hostId;
        this.seed = msg.seed;
        this.active = true;
        this.isHost = msg.hostId === msg.you;
        this.hooks.onStatus?.(
          this.isHost ? ('Rom ' + msg.code + ' - del koden') : ('Koblet til ' + msg.code),
          'ok',
        );
        if (!this.isHost) this.hooks.onWelcomeSeed?.(msg.seed);
        for (const pl of msg.players) {
          if (pl.id === this.you) continue;
          this.remotes.upsert(pl.id, pl.name, pl.x, pl.y, pl.z, pl.yaw, pl.pose);
        }
        if (this.isHost) this.offerWorld();
        break;
      }
      case 'joined':
        if (msg.player.id !== this.you) {
          this.remotes.upsert(
            msg.player.id, msg.player.name,
            msg.player.x, msg.player.y, msg.player.z, msg.player.yaw, msg.player.pose,
          );
          this.hooks.onStatus?.(`${msg.player.name} ble med`, 'info');
          if (this.isHost) this.offerWorld();
        }
        break;
      case 'left':
        this.remotes.remove(msg.id);
        break;
      case 'host-left':
        this.hooks.onStatus?.('Verten forlot - rommet er stengt', 'bad');
        this.hooks.onHostLeft?.();
        this.leave();
        break;
      case 'state':
        if (msg.id !== this.you) {
          this.remotes.upsert(msg.id, this.remotes.has(msg.id) ? '' : 'Spiller', msg.x, msg.y, msg.z, msg.yaw, msg.pose);
          // name preserved inside remotes if already known - upsert with empty name keeps old
        }
        break;
      case 'block':
        if (msg.by !== this.you) this.hooks.applyBlock?.(msg.x, msg.y, msg.z, msg.id, msg.meta);
        break;
      case 'drop-spawn':
        if (msg.by !== this.you) {
          this.hooks.applyDropSpawn?.(msg.dropId, msg.x, msg.y, msg.z, msg.itemId, msg.count);
        }
        break;
      case 'drop-take':
        if (msg.by !== this.you) this.hooks.applyDropTake?.(msg.dropId);
        break;
      case 'world':
        this.seed = msg.seed;
        this.hooks.applyWorld?.(msg.seed, msg.chunks);
        break;
      case 'need-world':
        if (this.isHost) this.offerWorld();
        break;
      case 'chat':
        this.hooks.onChat?.(msg.name, msg.text);
        break;
      case 'error':
        this.hooks.onStatus?.(msg.message, 'bad');
        break;
      default:
        break;
    }
  }
}

export { getSavedName, filterName, cleanCode, isValidCode };
