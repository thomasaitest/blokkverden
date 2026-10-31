import type { ClientMsg, ServerMsg } from './protocol.ts';

export type TransportStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface MpTransport {
  readonly status: TransportStatus;
  connect(url: string): void;
  send(msg: ClientMsg): void;
  close(): void;
  onMessage: ((msg: ServerMsg) => void) | null;
  onStatus: ((s: TransportStatus, detail?: string) => void) | null;
}
