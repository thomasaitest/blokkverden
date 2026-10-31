import {
  createRoom,
  handleClientMessage,
  handleDisconnect,
  type Outbound,
  type RoomState,
} from '../../src/mp/roomLogic.ts';
import { decodeClient, encode, WORLD_MSG_BYTES } from '../../src/mp/protocol.ts';

/**
 * One Durable Object per invite code. WebSocket hibernation API.
 * Host world is authoritative; joiners receive seed + modified chunks.
 */
export class RoomDurableObject {
  private room: RoomState | null = null;
  private sockets = new Map<WebSocket, string>();
  private seq = 0;

  constructor(
    private readonly ctx: DurableObjectState,
    _env: unknown,
  ) {
    for (const ws of this.ctx.getWebSockets()) {
      const key = (ws.deserializeAttachment() as { key?: string } | null)?.key;
      if (key) this.sockets.set(ws, key);
    }
  }

  private ensureRoom(code: string): RoomState {
    if (!this.room) this.room = createRoom(code);
    return this.room;
  }

  async fetch(request: Request): Promise<Response> {
    const code = request.headers.get('X-Room-Code') || '?????';
    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({ error: 'Expected WebSocket' }, { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const key = `p${++this.seq}-${Math.random().toString(36).slice(2, 8)}`;

    this.ensureRoom(code);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ key });
    this.sockets.set(server, key);

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const key = this.sockets.get(ws);
    if (!key || !this.room) return;
    if (typeof message !== 'string') {
      this.safeSend(ws, encode({ t: 'error', code: 'bad_msg', message: 'Ugyldig melding.' }));
      return;
    }
    if (message.length > WORLD_MSG_BYTES) {
      this.safeSend(ws, encode({ t: 'error', code: 'too_big', message: 'Melding for stor.' }));
      return;
    }
    const msg = decodeClient(message);
    if (!msg) {
      this.safeSend(ws, encode({ t: 'error', code: 'bad_msg', message: 'Ugyldig melding.' }));
      return;
    }
    const out = handleClientMessage(this.room, key, msg);
    this.dispatch(out);
  }

  webSocketClose(ws: WebSocket): void {
    this.drop(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.drop(ws);
  }

  private drop(ws: WebSocket) {
    const key = this.sockets.get(ws);
    this.sockets.delete(ws);
    if (!key || !this.room) return;
    const out = handleDisconnect(this.room, key);
    this.dispatch(out);
  }

  private dispatch(out: Outbound[]) {
    for (const o of out) {
      if (o.kind === 'close') {
        for (const [ws, id] of this.sockets) {
          if (id === o.id) {
            try { ws.close(o.code, o.reason); } catch { /* */ }
          }
        }
        continue;
      }
      const raw = encode(o.msg);
      if (o.kind === 'broadcast') {
        for (const [ws, id] of this.sockets) {
          if (o.except && id === o.except) continue;
          this.safeSend(ws, raw);
        }
      } else {
        for (const [ws, id] of this.sockets) {
          if (id === o.id) this.safeSend(ws, raw);
        }
      }
    }
  }

  private safeSend(ws: WebSocket, raw: string) {
    try {
      ws.send(raw);
    } catch {
      /* closed */
    }
  }
}
