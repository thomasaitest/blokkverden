import { describe, it, expect } from 'vitest';
import { createRoom, handleClientMessage, handleDisconnect } from '../src/mp/roomLogic';
import { MP_VERSION } from '../src/mp/protocol';

describe('mp roomLogic', () => {
  it('host creates room; joiner gets welcome + need-world', () => {
    const room = createRoom('ABCDE', 42);
    const hostOut = handleClientMessage(room, 'h1', {
      t: 'hello', v: MP_VERSION, name: 'Ada', playerId: 'p-host', wantHost: true, seed: 42,
    });
    expect(hostOut.some((o) => o.kind === 'to' && o.msg.t === 'welcome')).toBe(true);
    expect(room.hostId).toBe('h1');

    const joinOut = handleClientMessage(room, 'j1', {
      t: 'hello', v: MP_VERSION, name: 'Bo', playerId: 'p-join', wantHost: false,
    });
    expect(joinOut.some((o) => o.kind === 'to' && o.id === 'h1' && o.msg.t === 'need-world')).toBe(true);
    expect(room.members.size).toBe(2);
  });

  it('block relay and host-left closes others', () => {
    const room = createRoom('FGHIJ', 1);
    handleClientMessage(room, 'h1', { t: 'hello', v: MP_VERSION, name: 'Ada', playerId: 'a', wantHost: true, seed: 1 });
    handleClientMessage(room, 'j1', { t: 'hello', v: MP_VERSION, name: 'Bo', playerId: 'b', wantHost: false });
    const b = handleClientMessage(room, 'h1', { t: 'block', x: 1, y: 2, z: 3, id: 0 });
    expect(b.some((o) => o.kind === 'broadcast' && o.msg.t === 'block')).toBe(true);
    const left = handleDisconnect(room, 'h1');
    expect(left.some((o) => o.kind !== 'close' && o.msg.t === 'host-left')).toBe(true);
    expect(left.some((o) => o.kind === 'close')).toBe(true);
  });

  it('drop-take is first-wins (no dup)', () => {
    const room = createRoom('KLMNO', 1);
    handleClientMessage(room, 'h1', { t: 'hello', v: MP_VERSION, name: 'Ada', playerId: 'a', wantHost: true });
    handleClientMessage(room, 'j1', { t: 'hello', v: MP_VERSION, name: 'Bo', playerId: 'b', wantHost: false });
    handleClientMessage(room, 'h1', { t: 'drop-spawn', dropId: 'd1', x: 1, y: 2, z: 3, itemId: 5, count: 1 });
    const t1 = handleClientMessage(room, 'j1', { t: 'drop-take', dropId: 'd1' });
    const t2 = handleClientMessage(room, 'h1', { t: 'drop-take', dropId: 'd1' });
    expect(t1.some((o) => o.kind !== 'close' && o.msg.t === 'drop-take')).toBe(true);
    expect(t2.some((o) => o.kind !== 'close' && o.msg.t === 'drop-take')).toBe(false);
  });
});
