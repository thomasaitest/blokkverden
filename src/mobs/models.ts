import * as THREE from 'three';
import type { Mob, MobKind } from './types';

/** Build a reusable articulated mob template (unit box parts, scaled per kind). */
export function createMobRig(kind: MobKind): THREE.Group {
  const root = new THREE.Group();
  root.name = kind;
  const skin = skinFor(kind);
  const mat = (_hex: number) => new THREE.MeshLambertMaterial({ color: 0xffffff, map: skin });
  const box = (sx: number, sy: number, sz: number, hex: number) =>
    new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(hex));

  const def = KIND_LAYOUT[kind];
  const body = box(def.body[0], def.body[1], def.body[2], def.colors.body);
  body.name = 'body';
  body.position.set(0, def.bodyY, 0);
  root.add(body);

  const head = box(def.head[0], def.head[1], def.head[2], def.colors.head);
  head.name = 'head';
  head.position.set(0, def.headY, def.headZ ?? 0);
  root.add(head);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(def.head[0] * 0.92, def.head[1] * 0.55),
    new THREE.MeshBasicMaterial({ map: faceFor(kind), transparent: true }),
  );
  face.name = 'face';
  face.position.set(0, def.headY, def.head[2] / 2 + 0.01 + (def.headZ ?? 0));
  root.add(face);

  for (const leg of def.legs) {
    const m = box(leg.s[0], leg.s[1], leg.s[2], def.colors.leg);
    m.name = leg.name;
    m.position.set(leg.p[0], leg.p[1], leg.p[2]);
    root.add(m);
  }
  for (const arm of def.arms ?? []) {
    const m = box(arm.s[0], arm.s[1], arm.s[2], def.colors.arm ?? def.colors.leg);
    m.name = arm.name;
    m.position.set(arm.p[0], arm.p[1], arm.p[2]);
    root.add(m);
  }
  // decorative extras
  for (const ex of def.extras ?? []) {
    const m = box(ex.s[0], ex.s[1], ex.s[2], ex.color ?? def.colors.body);
    m.name = ex.name;
    m.position.set(ex.p[0], ex.p[1], ex.p[2]);
    root.add(m);
  }
  return root;
}

type Part = { name: string; s: [number, number, number]; p: [number, number, number]; color?: number };
type Layout = {
  body: [number, number, number]; bodyY: number;
  head: [number, number, number]; headY: number; headZ?: number;
  legs: Part[]; arms?: Part[]; extras?: Part[];
  colors: { body: number; head: number; leg: number; arm?: number };
};

const KIND_LAYOUT: Record<MobKind, Layout> = {
  gris: {
    body: [0.85, 0.55, 1.05], bodyY: 0.55,
    head: [0.5, 0.45, 0.45], headY: 0.7, headZ: 0.55,
    legs: [
      { name: 'legFL', s: [0.22, 0.35, 0.22], p: [0.28, 0.18, 0.3] },
      { name: 'legFR', s: [0.22, 0.35, 0.22], p: [-0.28, 0.18, 0.3] },
      { name: 'legBL', s: [0.22, 0.35, 0.22], p: [0.28, 0.18, -0.35] },
      { name: 'legBR', s: [0.22, 0.35, 0.22], p: [-0.28, 0.18, -0.35] },
    ],
    extras: [{ name: 'snout', s: [0.28, 0.2, 0.18], p: [0, 0.65, 0.82], color: 0xe88890 }],
    colors: { body: 0xf0a0a8, head: 0xf0a0a8, leg: 0xe09098 },
  },
  ku: {
    body: [0.9, 0.7, 1.3], bodyY: 0.85,
    head: [0.5, 0.5, 0.4], headY: 1.15, headZ: 0.7,
    legs: [
      { name: 'legFL', s: [0.22, 0.55, 0.22], p: [0.3, 0.28, 0.4] },
      { name: 'legFR', s: [0.22, 0.55, 0.22], p: [-0.3, 0.28, 0.4] },
      { name: 'legBL', s: [0.22, 0.55, 0.22], p: [0.3, 0.28, -0.45] },
      { name: 'legBR', s: [0.22, 0.55, 0.22], p: [-0.3, 0.28, -0.45] },
    ],
    extras: [
      { name: 'hornL', s: [0.08, 0.2, 0.08], p: [0.18, 1.4, 0.7], color: 0xf5f0e0 },
      { name: 'hornR', s: [0.08, 0.2, 0.08], p: [-0.18, 1.4, 0.7], color: 0xf5f0e0 },
      { name: 'udder', s: [0.3, 0.15, 0.25], p: [0, 0.45, -0.2], color: 0xffe0e8 },
    ],
    colors: { body: 0x8b5a2b, head: 0x8b5a2b, leg: 0x6b4420 },
  },
  sau: {
    body: [0.75, 0.7, 1.0], bodyY: 0.7,
    head: [0.4, 0.4, 0.4], headY: 0.95, headZ: 0.5,
    legs: [
      { name: 'legFL', s: [0.18, 0.4, 0.18], p: [0.22, 0.2, 0.28] },
      { name: 'legFR', s: [0.18, 0.4, 0.18], p: [-0.22, 0.2, 0.28] },
      { name: 'legBL', s: [0.18, 0.4, 0.18], p: [0.22, 0.2, -0.3] },
      { name: 'legBR', s: [0.18, 0.4, 0.18], p: [-0.22, 0.2, -0.3] },
    ],
    extras: [
      { name: 'earL', s: [0.12, 0.08, 0.05], p: [0.22, 1.05, 0.5], color: 0x333333 },
      { name: 'earR', s: [0.12, 0.08, 0.05], p: [-0.22, 1.05, 0.5], color: 0x333333 },
    ],
    colors: { body: 0xf5f5f5, head: 0x222222, leg: 0x222222 },
  },
  høne: {
    body: [0.4, 0.35, 0.5], bodyY: 0.4,
    head: [0.28, 0.28, 0.28], headY: 0.65, headZ: 0.22,
    legs: [
      { name: 'legL', s: [0.08, 0.25, 0.08], p: [0.1, 0.12, 0] },
      { name: 'legR', s: [0.08, 0.25, 0.08], p: [-0.1, 0.12, 0] },
    ],
    arms: [
      { name: 'wingL', s: [0.08, 0.25, 0.3], p: [0.25, 0.42, 0] },
      { name: 'wingR', s: [0.08, 0.25, 0.3], p: [-0.25, 0.42, 0] },
    ],
    extras: [
      { name: 'comb', s: [0.06, 0.12, 0.14], p: [0, 0.82, 0.22], color: 0xe33 },
      { name: 'tail', s: [0.08, 0.25, 0.2], p: [0, 0.5, -0.32], color: 0xd4a017 },
    ],
    colors: { body: 0xffeeaa, head: 0xffeeaa, leg: 0xe8a060, arm: 0xffeeaa },
  },
  vandrer: {
    body: [0.5, 0.75, 0.28], bodyY: 1.05,
    head: [0.45, 0.45, 0.45], headY: 1.65,
    legs: [
      { name: 'legL', s: [0.2, 0.7, 0.2], p: [0.12, 0.35, 0] },
      { name: 'legR', s: [0.2, 0.7, 0.2], p: [-0.12, 0.35, 0] },
    ],
    arms: [
      { name: 'armL', s: [0.18, 0.65, 0.18], p: [0.35, 1.05, 0] },
      { name: 'armR', s: [0.18, 0.65, 0.18], p: [-0.35, 1.05, 0] },
    ],
    colors: { body: 0x3d5c3a, head: 0x5a7a50, leg: 0x2a4028, arm: 0x3d5c3a },
  },
  bueskytt: {
    body: [0.5, 0.75, 0.28], bodyY: 1.05,
    head: [0.45, 0.45, 0.45], headY: 1.65,
    legs: [
      { name: 'legL', s: [0.18, 0.7, 0.18], p: [0.12, 0.35, 0] },
      { name: 'legR', s: [0.18, 0.7, 0.18], p: [-0.12, 0.35, 0] },
    ],
    arms: [
      { name: 'armL', s: [0.16, 0.65, 0.16], p: [0.35, 1.05, 0] },
      { name: 'armR', s: [0.16, 0.65, 0.16], p: [-0.35, 1.05, 0] },
    ],
    extras: [{ name: 'bow', s: [0.06, 0.5, 0.08], p: [-0.45, 1.1, 0.15], color: 0x8b6914 }],
    colors: { body: 0xb0b0a0, head: 0xd0d0c0, leg: 0x909080, arm: 0xb0b0a0 },
  },
  vever: {
    body: [0.7, 0.4, 0.9], bodyY: 0.45,
    head: [0.5, 0.35, 0.5], headY: 0.55, headZ: 0.45,
    legs: [
      { name: 'leg1', s: [0.1, 0.35, 0.1], p: [0.35, 0.18, 0.3] },
      { name: 'leg2', s: [0.1, 0.35, 0.1], p: [-0.35, 0.18, 0.3] },
      { name: 'leg3', s: [0.1, 0.35, 0.1], p: [0.4, 0.18, 0] },
      { name: 'leg4', s: [0.1, 0.35, 0.1], p: [-0.4, 0.18, 0] },
      { name: 'leg5', s: [0.1, 0.35, 0.1], p: [0.35, 0.18, -0.3] },
      { name: 'leg6', s: [0.1, 0.35, 0.1], p: [-0.35, 0.18, -0.3] },
    ],
    colors: { body: 0x222222, head: 0x333333, leg: 0x1a1a1a },
  },
  knallbolle: {
    body: [0.55, 1.1, 0.4], bodyY: 0.85,
    head: [0.5, 0.45, 0.4], headY: 1.55,
    legs: [
      { name: 'legL', s: [0.22, 0.35, 0.22], p: [0.14, 0.18, 0] },
      { name: 'legR', s: [0.22, 0.35, 0.22], p: [-0.14, 0.18, 0] },
    ],
    arms: [
      { name: 'armL', s: [0.18, 0.45, 0.18], p: [0.4, 0.9, 0] },
      { name: 'armR', s: [0.18, 0.45, 0.18], p: [-0.4, 0.9, 0] },
    ],
    colors: { body: 0x2ecc71, head: 0x27ae60, leg: 0x1e8449, arm: 0x2ecc71 },
  },
  ulv: {
    body: [0.7, 0.5, 1.0], bodyY: 0.55,
    head: [0.42, 0.4, 0.42], headY: 0.75, headZ: 0.52,
    legs: [
      { name: 'legFL', s: [0.16, 0.35, 0.16], p: [0.22, 0.18, 0.28] },
      { name: 'legFR', s: [0.16, 0.35, 0.16], p: [-0.22, 0.18, 0.28] },
      { name: 'legBL', s: [0.16, 0.35, 0.16], p: [0.22, 0.18, -0.32] },
      { name: 'legBR', s: [0.16, 0.35, 0.16], p: [-0.22, 0.18, -0.32] },
    ],
    extras: [
      { name: 'snout', s: [0.22, 0.16, 0.28], p: [0, 0.68, 0.78], color: 0xb0b4bc },
      { name: 'earL', s: [0.1, 0.18, 0.08], p: [0.14, 0.98, 0.45], color: 0x8a9098 },
      { name: 'earR', s: [0.1, 0.18, 0.08], p: [-0.14, 0.98, 0.45], color: 0x8a9098 },
      { name: 'tail', s: [0.12, 0.12, 0.45], p: [0, 0.6, -0.65], color: 0x9aa0a8 },
      { name: 'collar', s: [0.48, 0.08, 0.48], p: [0, 0.72, 0.35], color: 0xcc3333 },
    ],
    colors: { body: 0x9aa0a8, head: 0x9aa0a8, leg: 0x7a8088 },
  },

};

const skinCache = new Map<string, THREE.CanvasTexture>();
const faceCache = new Map<string, THREE.CanvasTexture>();

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

function shadeFill(ctx: CanvasRenderingContext2D, base: string, dark: string, light: string): void {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const hi = (x + y) % 7 === 0;
    ctx.fillStyle = edge ? dark : hi ? light : base;
    ctx.fillRect(x, y, 1, 1);
  }
}

function skinFor(kind: MobKind): THREE.CanvasTexture {
  const key = 's2:' + kind;
  let t = skinCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d')!;

  if (kind === 'gris') {
    shadeFill(ctx, '#f0a0a8', '#c07078', '#ffc0c8');
    px(ctx, 6, 10, '#e88890', 4, 3); // snout area
    px(ctx, 7, 11, '#d06070', 1, 1); px(ctx, 9, 11, '#d06070', 1, 1);
  } else if (kind === 'ku') {
    shadeFill(ctx, '#8b5a2b', '#5a3818', '#a87848');
    px(ctx, 2, 3, '#f5f0e0', 5, 4); px(ctx, 10, 8, '#f5f0e0', 4, 5);
    px(ctx, 4, 12, '#3a2810', 3, 2);
  } else if (kind === 'sau') {
    shadeFill(ctx, '#f0f0f0', '#c8c8c8', '#ffffff');
    // wool tufts
    for (let i = 0; i < 12; i++) px(ctx, 1 + (i * 5) % 14, 1 + ((i * 7) % 14), '#e8e8e8', 2, 2);
  } else if (kind === 'høne') {
    shadeFill(ctx, '#f5e6a0', '#c8b060', '#fff0b0');
    px(ctx, 2, 2, '#e8d080', 3, 3); px(ctx, 11, 8, '#d4a017', 3, 4);
    px(ctx, 7, 1, '#e33', 2, 2); // comb hint
  } else if (kind === 'vandrer') {
    shadeFill(ctx, '#3d5c3a', '#2a4028', '#5a7a50');
    // torn shirt stripes
    for (let y = 4; y < 12; y += 2) px(ctx, 2, y, '#4a6a45', 12, 1);
    px(ctx, 5, 6, '#2a3020', 2, 3); px(ctx, 10, 9, '#2a3020', 3, 2);
  } else if (kind === 'bueskytt') {
    shadeFill(ctx, '#c8c8b8', '#909080', '#e0e0d0');
    // bone ribs
    for (let y = 3; y < 14; y += 3) px(ctx, 3, y, '#e8e8d8', 10, 1);
    px(ctx, 1, 1, '#a0a090', 2, 14); px(ctx, 13, 1, '#a0a090', 2, 14);
  } else if (kind === 'vever') {
    shadeFill(ctx, '#1a1a1a', '#0a0a0a', '#333');
    // abdomen pattern
    px(ctx, 4, 4, '#2a1010', 8, 8);
    px(ctx, 6, 6, '#441818', 4, 4);
    px(ctx, 7, 7, '#f44', 2, 2);
  } else if (kind === 'ulv') {
    shadeFill(ctx, '#9aa0a8', '#6a7078', '#c0c4cc');
    px(ctx, 2, 2, '#7a8088', 12, 2);
  } else if (kind === 'knallbolle') {
    shadeFill(ctx, '#2ecc71', '#1e8449', '#58d68d');
    // face feet pattern on body
    px(ctx, 4, 3, '#111', 2, 2); px(ctx, 10, 3, '#111', 2, 2);
    px(ctx, 5, 7, '#111', 6, 1);
    px(ctx, 4, 9, '#111', 2, 2); px(ctx, 7, 10, '#111', 2, 2); px(ctx, 10, 9, '#111', 2, 2);
  }

  t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  skinCache.set(key, t);
  return t;
}

function faceFor(kind: MobKind): THREE.CanvasTexture {
  let t = faceCache.get(kind);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 16, 16);

  if (kind === 'gris') {
    px(ctx, 3, 5, '#fff', 4, 4); px(ctx, 9, 5, '#fff', 4, 4);
    px(ctx, 5, 6, '#222', 2, 2); px(ctx, 11, 6, '#222', 2, 2);
    px(ctx, 6, 11, '#e88890', 4, 3); px(ctx, 7, 12, '#c06070'); px(ctx, 9, 12, '#c06070');
  } else if (kind === 'ku') {
    px(ctx, 3, 4, '#fff', 4, 4); px(ctx, 9, 4, '#fff', 4, 4);
    px(ctx, 5, 5, '#222', 2, 2); px(ctx, 11, 5, '#222', 2, 2);
    px(ctx, 6, 10, '#3a2810', 4, 3); px(ctx, 7, 11, '#222', 2, 1);
  } else if (kind === 'sau') {
    px(ctx, 3, 5, '#fff', 4, 4); px(ctx, 9, 5, '#fff', 4, 4);
    px(ctx, 5, 6, '#111', 2, 2); px(ctx, 11, 6, '#111', 2, 2);
    px(ctx, 7, 11, '#444', 2, 2);
  } else if (kind === 'høne') {
    px(ctx, 4, 5, '#fff', 3, 3); px(ctx, 9, 5, '#fff', 3, 3);
    px(ctx, 5, 6, '#222'); px(ctx, 10, 6, '#222');
    px(ctx, 7, 10, '#e80', 2, 3); // beak
    px(ctx, 6, 1, '#e33', 4, 2); // comb
  } else if (kind === 'vandrer' || kind === 'vever') {
    px(ctx, 3, 5, '#fff', 4, 4); px(ctx, 9, 5, '#fff', 4, 4);
    px(ctx, 5, 6, '#f44', 2, 2); px(ctx, 11, 6, '#f44', 2, 2);
    if (kind === 'vandrer') px(ctx, 5, 11, '#2a3020', 6, 2);
  } else if (kind === 'bueskytt') {
    px(ctx, 3, 5, '#222', 4, 3); px(ctx, 9, 5, '#222', 4, 3); // empty sockets
    px(ctx, 4, 6, '#88f', 2, 1); px(ctx, 10, 6, '#88f', 2, 1);
    px(ctx, 6, 11, '#c8c8b8', 4, 2);
  } else if (kind === 'ulv') {
    px(ctx, 4, 6, '#222', 2, 2); px(ctx, 10, 6, '#222', 2, 2);
    px(ctx, 6, 10, '#444', 4, 2);
  } else if (kind === 'knallbolle') {
    px(ctx, 3, 4, '#111', 3, 3); px(ctx, 10, 4, '#111', 3, 3);
    px(ctx, 4, 5, '#fff', 1, 1); px(ctx, 11, 5, '#fff', 1, 1);
    px(ctx, 5, 9, '#111', 6, 2);
    px(ctx, 4, 12, '#111', 2, 2); px(ctx, 7, 13, '#111', 2, 2); px(ctx, 10, 12, '#111', 2, 2);
  }

  t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  faceCache.set(kind, t);
  return t;
}

function clamp(n: number): number { return Math.max(0, Math.min(255, n | 0)); }
void clamp;

/** Animate limbs; look-at player; idle wiggle; hurt flash; death. */
export function animateMobRig(root: THREE.Group, m: Mob, dt: number, playerPos?: { x: number; y: number; z: number }): void {
  const moving = Math.hypot(m.vx, m.vz) > 0.12;
  const swing = moving ? Math.sin(m.age * 10) * 0.55 : 0;
  const attack = m.attackCool > 0.7 ? Math.sin((1 - m.attackCool) * 20) * 0.8 : 0;
  const idle = Math.sin(m.age * 2.2) * 0.08;

  for (const ch of root.children) {
    if (!(ch instanceof THREE.Mesh) && !(ch instanceof THREE.Group)) continue;
    if (ch.name.startsWith('leg')) {
      const sign = ch.name.includes('L') || ch.name.includes('1') || ch.name.includes('3') || ch.name.includes('5') ? 1 : -1;
      ch.rotation.x = moving ? swing * sign : idle * sign * 0.3;
    }
    if (ch.name.startsWith('arm') || ch.name.startsWith('wing')) {
      const sign = ch.name.includes('L') ? 1 : -1;
      ch.rotation.x = moving ? -swing * sign : idle * 0.5;
      if (ch.name.includes('R')) ch.rotation.x += attack;
      if (ch.name.startsWith('wing') && !moving) ch.rotation.z = Math.sin(m.age * 4) * 0.15 * sign;
    }
    if (ch.name === 'earL' || ch.name === 'earR') {
      ch.rotation.z = Math.sin(m.age * 5 + (ch.name === 'earL' ? 0 : 1)) * 0.25;
    }
    if (ch.name === 'tail' || ch.name === 'comb') {
      ch.rotation.y = Math.sin(m.age * 3) * 0.2;
    }
    if (ch.name === 'head' || ch.name === 'face') {
      if (playerPos && !moving) {
        const dx = playerPos.x - m.x;
        const dz = playerPos.z - m.z;
        const dy = (playerPos.y + 1.4) - (m.y + (root.children.find((c) => c.name === 'head')?.position.y ?? 1));
        let yaw = Math.atan2(-dx, -dz) - m.yaw;
        while (yaw > Math.PI) yaw -= Math.PI * 2;
        while (yaw < -Math.PI) yaw += Math.PI * 2;
        yaw = Math.max(-0.6, Math.min(0.6, yaw));
        const pitch = Math.max(-0.35, Math.min(0.35, -Math.atan2(dy, Math.hypot(dx, dz))));
        if (ch.name === 'head') { ch.rotation.y = yaw; ch.rotation.x = pitch; }
        if (ch.name === 'face') { ch.rotation.y = yaw; ch.rotation.x = pitch; }
      } else if (ch.name === 'head') {
        ch.rotation.y = Math.sin(m.age * 1.5) * 0.12;
        ch.rotation.x = 0;
      }
    }
  }

  const hurt = m.hurtFlash ?? 0;
  const flash = hurt > 0;
  const fuseWhite = m.fuse > 0 && ((m.fuse * 10) | 0) % 2 === 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material && 'emissive' in (o.material as THREE.MeshLambertMaterial)) {
      const mat = o.material as THREE.MeshLambertMaterial;
      if (flash) mat.emissive?.setHex(0xff0000);
      else if (fuseWhite) mat.emissive?.setHex(0xffffff);
      else mat.emissive?.setHex(0x000000);
    }
  });

  const deathT = m.deathT;
  if (deathT != null && deathT > 0) {
    const s = Math.max(0.01, 1 - deathT);
    root.scale.setScalar(s);
    root.position.y = m.y + (1 - s) * 0.5;
  } else {
    root.scale.setScalar(1);
  }
  void dt;
}

export function createDeathPoof(): THREE.Points {
  const n = 24;
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xcccccc, size: 0.12, transparent: true, opacity: 0.9 });
  const p = new THREE.Points(geo, mat);
  p.userData = { age: 0, vel: Array.from({ length: n }, () => [
    (Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3,
  ]) };
  return p;
}

export function updateDeathPoof(p: THREE.Points, dt: number): boolean {
  p.userData.age += dt;
  const pos = p.geometry.attributes.position as THREE.BufferAttribute;
  const vel = p.userData.vel as number[][];
  for (let i = 0; i < vel.length; i++) {
    vel[i][1] -= 8 * dt;
    pos.setXYZ(i,
      pos.getX(i) + vel[i][0] * dt,
      pos.getY(i) + vel[i][1] * dt,
      pos.getZ(i) + vel[i][2] * dt,
    );
  }
  pos.needsUpdate = true;
  (p.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - p.userData.age * 2);
  return p.userData.age < 0.6;
}
