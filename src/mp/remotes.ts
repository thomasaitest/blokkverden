import * as THREE from 'three';
import { lerpAngle } from './interp.ts';
import type { PoseWire } from './protocol.ts';

/** Stable hue from id so the same peer keeps the same shirt colour. */
export function colorForPlayerId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hues = [0x3d8bfd, 0xe74c3c, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22];
  return hues[h % hues.length]!;
}

interface LimbRig {
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
}

interface RemoteActor {
  id: string;
  name: string;
  root: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  limbs: LimbRig;
  nameSpr: THREE.Sprite;
  x: number; y: number; z: number; yaw: number;
  tx: number; ty: number; tz: number; tyaw: number;
  pose: PoseWire;
  walkPhase: number;
}

function makeNameSprite(text: string): THREE.Sprite {
  const font = 42;
  const pad = 14;
  const label = text.slice(0, 16) || 'Spiller';
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `700 ${font}px system-ui,sans-serif`;
  const w = Math.max(64, Math.ceil(ctx.measureText(label).width) + pad * 2);
  const h = font + pad * 2;
  c.width = w;
  c.height = h;
  ctx.font = `700 ${font}px system-ui,sans-serif`;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  // ~1.4 m wide nametag floating above the head
  spr.scale.set((w / 48) * 0.85, (h / 48) * 0.85, 1);
  spr.position.y = 2.45;
  spr.renderOrder = 30;
  return spr;
}

/**
 * Blocky player: head / torso / 2 arms / 2 legs (MC proportions, ~1.8 tall).
 * Shirt colour is per-player; skin + pants shared.
 */
function buildFigure(shirt: number): { root: THREE.Group; body: THREE.Mesh; head: THREE.Mesh; limbs: LimbRig } {
  const root = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0b090 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pants = new THREE.MeshLambertMaterial({ color: 0x3a4a6a });
  const boots = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

  // Head 0.5³ sitting on shoulders (~1.5–2.0)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 1.75;
  // Eyes (dark boxes on face so orientation is readable)
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), eyeMat);
  eyeL.position.set(-0.12, 1.78, -0.26);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.12;

  // Torso
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.3), shirtMat);
  body.position.y = 1.125;

  // Arms pivot at shoulder
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), shirtMat);
  armL.position.set(-0.4, 1.1, 0);
  armL.geometry.translate(0, -0.3, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), shirtMat);
  armR.position.set(0.4, 1.1, 0);
  armR.geometry.translate(0, -0.3, 0);

  // Legs pivot at hip
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), pants);
  legL.position.set(-0.14, 0.7, 0);
  legL.geometry.translate(0, -0.35, 0);
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.28), boots);
  bootL.position.set(0, -0.62, 0.02);
  legL.add(bootL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), pants);
  legR.position.set(0.14, 0.7, 0);
  legR.geometry.translate(0, -0.35, 0);
  const bootR = bootL.clone();
  legR.add(bootR);

  root.add(body, head, eyeL, eyeR, armL, armR, legL, legR);
  return { root, body, head, limbs: { armL, armR, legL, legR } };
}

export class RemotePlayers {
  private actors = new Map<string, RemoteActor>();

  constructor(private scene: THREE.Scene) {}

  /** How many remotes are currently drawn (tests / e2e). */
  count(): number {
    return this.actors.size;
  }

  /** Snapshot of remote positions for e2e framing. */
  list(): { id: string; name: string; x: number; y: number; z: number }[] {
    return [...this.actors.values()].map((a) => ({ id: a.id, name: a.name, x: a.x, y: a.y, z: a.z }));
  }

  upsert(id: string, name: string, x: number, y: number, z: number, yaw: number, pose: PoseWire): void {
    let a = this.actors.get(id);
    if (!a) {
      const fig = buildFigure(colorForPlayerId(id));
      const nameSpr = makeNameSprite(name || 'Spiller');
      fig.root.add(nameSpr);
      this.scene.add(fig.root);
      a = {
        id, name: name || 'Spiller',
        root: fig.root, body: fig.body, head: fig.head, limbs: fig.limbs, nameSpr,
        x, y, z, yaw, tx: x, ty: y, tz: z, tyaw: yaw, pose, walkPhase: 0,
      };
      this.actors.set(id, a);
      // Snap immediately so first frame is correct for screenshots
      fig.root.position.set(x, y, z);
      fig.root.rotation.y = yaw;
    } else {
      a.tx = x; a.ty = y; a.tz = z; a.tyaw = yaw; a.pose = pose;
      if (name && a.name !== name) {
        a.name = name;
        a.root.remove(a.nameSpr);
        (a.nameSpr.material as THREE.SpriteMaterial).map?.dispose();
        (a.nameSpr.material as THREE.Material).dispose();
        a.nameSpr = makeNameSprite(name);
        a.root.add(a.nameSpr);
      }
    }
  }

  remove(id: string): void {
    const a = this.actors.get(id);
    if (!a) return;
    this.scene.remove(a.root);
    a.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        const mat = m.material as THREE.Material & { map?: THREE.Texture };
        mat.map?.dispose();
        mat.dispose();
      }
    });
    this.actors.delete(id);
  }

  clear(): void {
    for (const id of [...this.actors.keys()]) this.remove(id);
  }

  tick(dt: number): void {
    const k = Math.min(1, dt * 14);
    for (const a of this.actors.values()) {
      a.x += (a.tx - a.x) * k;
      a.y += (a.ty - a.y) * k;
      a.z += (a.tz - a.z) * k;
      a.yaw = lerpAngle(a.yaw, a.tyaw, k);
      a.root.position.set(a.x, a.y, a.z);
      a.root.rotation.y = a.yaw;

      const moving = a.pose === 'walk' || a.pose === 'sneak' || a.pose === 'jump';
      if (moving) a.walkPhase += dt * (a.pose === 'sneak' ? 7 : 11);
      else a.walkPhase *= 0.85;
      const swing = moving ? Math.sin(a.walkPhase) * 0.7 : 0;
      a.limbs.legL.rotation.x = swing;
      a.limbs.legR.rotation.x = -swing;
      a.limbs.armL.rotation.x = -swing * 0.85;
      a.limbs.armR.rotation.x = swing * 0.85;
      // Sneak: crouch body slightly
      a.body.position.y = a.pose === 'sneak' ? 1.0 : 1.125;
      a.head.position.y = a.pose === 'sneak' ? 1.6 : 1.75;
    }
  }

  has(id: string): boolean {
    return this.actors.has(id);
  }
}
