import { decodeServer, encode, type ClientMsg, WORLD_MSG_BYTES, MAX_MSG_BYTES } from './protocol.ts';
import type { MpTransport, TransportStatus } from './transport.ts';

export class WsTransport implements MpTransport {
  status: TransportStatus = 'closed';
  onMessage: ((msg: import('./protocol.ts').ServerMsg) => void) | null = null;
  onStatus: ((s: TransportStatus, detail?: string) => void) | null = null;
  private ws: WebSocket | null = null;

  connect(url: string): void {
    this.close();
    this.status = 'connecting';
    this.onStatus?.('connecting');
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.status = 'error';
      this.onStatus?.('error', String(e));
      return;
    }
    this.ws.addEventListener('open', () => {
      this.status = 'open';
      this.onStatus?.('open');
    });
    this.ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      if (ev.data.length > WORLD_MSG_BYTES) return;
      const msg = decodeServer(ev.data);
      if (msg) this.onMessage?.(msg);
    });
    this.ws.addEventListener('close', () => {
      this.status = 'closed';
      this.onStatus?.('closed');
      this.ws = null;
    });
    this.ws.addEventListener('error', () => {
      this.status = 'error';
      this.onStatus?.('error');
    });
  }

  send(msg: ClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const raw = encode(msg);
    const limit = msg.t === 'world-offer' ? WORLD_MSG_BYTES : MAX_MSG_BYTES;
    if (raw.length > limit) return;
    this.ws.send(raw);
  }

  close(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.status = 'closed';
  }
}
