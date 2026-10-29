export type MobKind =
  | 'gris'
  | 'ku'
  | 'sau'
  | 'høne'
  | 'vandrer' // zombie-like
  | 'bueskytt' // skeleton-like
  | 'vever' // spider-like
  | 'knallbolle'; // creeper-like original

export interface Mob {
  id: number;
  kind: MobKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vy: number;
  vz: number;
  hp: number;
  maxHp: number;
  hostile: boolean;
  age: number;
  attackCool: number;
  /** knallbolle fuse */
  fuse: number;
  onGround: boolean;
  width: number;
  height: number;
  color: number;
}

export const MOB_DEFS: Record<
  MobKind,
  { hp: number; hostile: boolean; w: number; h: number; color: number; speed: number }
> = {
  gris: { hp: 10, hostile: false, w: 0.7, h: 0.7, color: 0xf0a0a8, speed: 1.4 },
  ku: { hp: 14, hostile: false, w: 0.8, h: 1.2, color: 0x8b5a2b, speed: 1.2 },
  sau: { hp: 8, hostile: false, w: 0.7, h: 0.9, color: 0xf5f5f5, speed: 1.5 },
  høne: { hp: 4, hostile: false, w: 0.4, h: 0.5, color: 0xffeeaa, speed: 1.8 },
  vandrer: { hp: 20, hostile: true, w: 0.6, h: 1.8, color: 0x3d5c3a, speed: 1.6 },
  bueskytt: { hp: 16, hostile: true, w: 0.6, h: 1.8, color: 0xb0b0a0, speed: 1.5 },
  vever: { hp: 14, hostile: true, w: 1.0, h: 0.6, color: 0x222222, speed: 2.0 },
  knallbolle: { hp: 18, hostile: true, w: 0.6, h: 1.5, color: 0x2ecc71, speed: 1.3 },
};
