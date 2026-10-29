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

  // face plate (eyes)
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
  return root;
}

type Part = { name: string; s: [number, number, number]; p: [number, number, number] };
type Layout = {
  body: [number, number, number]; bodyY: number;
  head: [number, number, number]; headY: number; headZ?: number;
  legs: Part[]; arms?: Part[];
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
    colors: { body: 0x8b5a2b, head: 0x8b5a2b, leg: 0x6b4420 },
  },
  sau: {
    body: [0.75, 0.7, 1.0], bodyY: 0.7,
    head: [0.4, 0.4, 0.4], headY: 0.95, headZ: 0.5,
    legs: [
      { name: 'legFL', s: [0.18, 0.4, 0.18], p: [0.25, 0.2, 0.28] },
      { name: 'legFR', s: [0.18, 0.4, 0.18], p: [-0.25, 0.2, 0.28] },
      { name: 'legBL', s: [0.18, 0.4, 0.18], p: [0.25, 0.2, -0.3] },
      { name: 'legBR', s: [0.18, 0.4, 0.18], p: [-0.25, 0.2, -0.3] },
    ],
    colors: { body: 0xf5f5f5, head: 0x222222, leg: 0x333333 },
  },
  høne: {
    body: [0.35, 0.35, 0.45], bodyY: 0.4,
    head: [0.28, 0.28, 0.28], headY: 0.65, headZ: 0.22,
    legs: [
      { name: 'legL', s: [0.08, 0.25, 0.08], p: [0.08, 0.12, 0] },
      { name: 'legR', s: [0.08, 0.25, 0.08], p: [-0.08, 0.12, 0] },
    ],
    arms: [
      { name: 'wingL', s: [0.08, 0.25, 0.3], p: [0.22, 0.45, 0] },
      { name: 'wingR', s: [0.08, 0.25, 0.3], p: [-0.22, 0.45, 0] },
    ],
    colors: { body: 0xffeeaa, head: 0xffeeaa, leg: 0xffaa44, arm: 0xffeeaa },
  },
  vandrer: {
    body: [0.55, 0.75, 0.3], bodyY: 1.05,
    head: [0.5, 0.5, 0.5], headY: 1.65,
    legs: [
      { name: 'legL', s: [0.22, 0.7, 0.22], p: [0.14, 0.35, 0] },
      { name: 'legR', s: [0.22, 0.7, 0.22], p: [-0.14, 0.35, 0] },
    ],
    arms: [
      { name: 'armL', s: [0.2, 0.7, 0.2], p: [0.4, 1.05, 0] },
      { name: 'armR', s: [0.2, 0.7, 0.2], p: [-0.4, 1.05, 0] },
    ],
    colors: { body: 0x3d5c3a, head: 0x5a7a4a, leg: 0x2a3a28, arm: 0x3d5c3a },
  },
  bueskytt: {
    body: [0.5, 0.7, 0.28], bodyY: 1.05,
    head: [0.48, 0.48, 0.48], headY: 1.6,
    legs: [
      { name: 'legL', s: [0.2, 0.7, 0.2], p: [0.12, 0.35, 0] },
      { name: 'legR', s: [0.2, 0.7, 0.2], p: [-0.12, 0.35, 0] },
    ],
    arms: [
      { name: 'armL', s: [0.18, 0.7, 0.18], p: [0.38, 1.05, 0] },
      { name: 'armR', s: [0.18, 0.7, 0.18], p: [-0.38, 1.05, 0] },
    ],
    colors: { body: 0xb0b0a0, head: 0xe8e0d0, leg: 0x888880, arm: 0xb0b0a0 },
  },
  vever: {
    body: [0.7, 0.4, 0.9], bodyY: 0.45,
    head: [0.45, 0.35, 0.55], headY: 0.5, headZ: 0.55,
    legs: [
      { name: 'leg1', s: [0.12, 0.12, 0.55], p: [0.4, 0.25, 0.25] },
      { name: 'leg2', s: [0.12, 0.12, 0.55], p: [0.4, 0.25, 0] },
      { name: 'leg3', s: [0.12, 0.12, 0.55], p: [0.4, 0.25, -0.25] },
      { name: 'leg4', s: [0.12, 0.12, 0.55], p: [-0.4, 0.25, 0.25] },
      { name: 'leg5', s: [0.12, 0.12, 0.55], p: [-0.4, 0.25, 0] },
      { name: 'leg6', s: [0.12, 0.12, 0.55], p: [-0.4, 0.25, -0.25] },
    ],
    colors: { body: 0x222222, head: 0x440000, leg: 0x111111 },
  },
  knallbolle: {
    body: [0.55, 1.1, 0.55], bodyY: 0.7,
    head: [0.5, 0.45, 0.5], headY: 1.4,
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
};

const skinCache = new Map<string, THREE.CanvasTexture>();
const faceCache = new Map<string, THREE.CanvasTexture>();

function skinFor(kind: MobKind): THREE.CanvasTexture {
  const key = 's:' + kind;
  let t = skinCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d')!;
  const base = KIND_LAYOUT[kind].colors.body;
  const r = (base >> 16) & 255, g = (base >> 8) & 255, b = base & 255;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = ((x * 7 + y * 13) % 5) - 2;
    ctx.fillStyle = `rgb(${clamp(r + n * 8)},${clamp(g + n * 6)},${clamp(b + n * 5)})`;
    ctx.fillRect(x, y, 1, 1);
  }
  // spots for cow/sheep accents
  if (kind === 'ku') {
    ctx.fillStyle = '#f5f0e0';
    ctx.fillRect(2, 3, 4, 3); ctx.fillRect(10, 8, 3, 4);
  }
  if (kind === 'knallbolle') {
    ctx.fillStyle = '#111';
    for (let i = 0; i < 8; i++) ctx.fillRect(2 + (i % 4) * 3, 2 + ((i / 4) | 0) * 6, 2, 2);
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
  // eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(3, 5, 4, 4); ctx.fillRect(9, 5, 4, 4);
  ctx.fillStyle = kind === 'vandrer' || kind === 'vever' ? '#f44' : '#222';
  ctx.fillRect(5, 6, 2, 2); ctx.fillRect(11, 6, 2, 2);
  if (kind === 'knallbolle') {
    ctx.fillStyle = '#111';
    ctx.fillRect(5, 11, 6, 2);
  }
  if (kind === 'høne') {
    ctx.fillStyle = '#e33';
    ctx.fillRect(7, 10, 2, 3);
  }
  t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  faceCache.set(kind, t);
  return t;
}

function clamp(n: number): number { return Math.max(0, Math.min(255, n | 0)); }

/** Animate limbs; flash red when hurt; death shrink. */
export function animateMobRig(root: THREE.Group, m: Mob, dt: number): void {
  const moving = Math.hypot(m.vx, m.vz) > 0.12;
  const swing = moving ? Math.sin(m.age * 10) * 0.55 : 0;
  const attack = m.attackCool > 0.7 ? Math.sin((1 - m.attackCool) * 20) * 0.8 : 0;
  for (const ch of root.children) {
    if (!(ch instanceof THREE.Mesh) && !(ch instanceof THREE.Group)) continue;
    if (ch.name.startsWith('leg')) {
      const sign = ch.name.includes('L') || ch.name.includes('1') || ch.name.includes('3') || ch.name.includes('5') ? 1 : -1;
      ch.rotation.x = swing * sign;
    }
    if (ch.name.startsWith('arm') || ch.name.startsWith('wing')) {
      const sign = ch.name.includes('L') ? 1 : -1;
      ch.rotation.x = -swing * sign + (ch.name.includes('R') ? attack : 0);
    }
    if (ch.name === 'head') ch.rotation.y = Math.sin(m.age * 2) * 0.08;
  }
  // hurt flash
  const hurt = (m as Mob & { hurtFlash?: number }).hurtFlash ?? 0;
  // hurtFlash decremented in MobSystem
  const flash = hurt > 0;
  const fuseWhite = m.fuse > 0 && ((m.fuse * 10) | 0) % 2 === 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material && 'color' in o.material) {
      const mat = o.material as THREE.MeshLambertMaterial;
      if (flash) mat.emissive?.setHex(0xff0000);
      else if (fuseWhite) mat.emissive?.setHex(0xffffff);
      else mat.emissive?.setHex(0x000000);
    }
  });
  // death: shrink handled by caller via deathT
  const deathT = (m as Mob & { deathT?: number }).deathT;
  if (deathT != null && deathT > 0) {
    const s = Math.max(0.01, 1 - deathT);
    root.scale.setScalar(s);
    root.position.y = m.y + (1 - s) * 0.5;
  } else {
    root.scale.setScalar(1);
  }
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
