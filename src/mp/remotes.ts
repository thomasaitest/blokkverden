import * as THREE from 'three';
import { lerpAngle } from './interp.ts';
import type { PoseWire } from './protocol.ts';

interface RemoteActor {
  id: string;
  name: string;
  root: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  nameSpr: THREE.Sprite;
  x: number; y: number; z: number; yaw: number;
  tx: number; ty: number; tz: number; tyaw: number;
  pose: PoseWire;
  walkPhase: number;
}

function makeNameSprite(text: string): THREE.Sprite {
  const font = 36;
  const pad = 12;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `700 ${font}px system-ui,sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = font + pad * 2;
  c.width = w;
  c.height = h;
  ctx.font = `700 ${font}px system-ui,sans-serif`;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  spr.scale.set(w / 48, h / 48, 1);
  spr.position.y = 2.35;
  spr.renderOrder = 20;
  return spr;
}

function buildFigure(color = 0x3d8bfd): { root: THREE.Group; body: THREE.Mesh; head: THREE.Mesh } {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xe0b090 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), bodyMat);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMat);
  head.position.y = 1.65;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.25), new THREE.MeshLambertMaterial({ color: 0x2a4a7a }));
  legL.position.set(-0.15, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  root.add(body, head, legL, legR);
  root.userData.legL = legL;
  root.userData.legR = legR;
  return { root, body, head };
}

export class RemotePlayers {
  private actors = new Map<string, RemoteActor>();
  private colors = [0x3d8bfd, 0xe74c3c, 0x2ecc71, 0xf1c40f];

  constructor(private scene: THREE.Scene) {}

  upsert(id: string, name: string, x: number, y: number, z: number, yaw: number, pose: PoseWire): void {
    let a = this.actors.get(id);
    if (!a) {
      const fig = buildFigure(this.colors[this.actors.size % this.colors.length]!);
      const nameSpr = makeNameSprite(name);
      fig.root.add(nameSpr);
      this.scene.add(fig.root);
      a = {
        id, name,
        root: fig.root, body: fig.body, head: fig.head, nameSpr,
        x, y, z, yaw, tx: x, ty: y, tz: z, tyaw: yaw, pose, walkPhase: 0,
      };
      this.actors.set(id, a);
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
    const k = Math.min(1, dt * 12);
    for (const a of this.actors.values()) {
      a.x += (a.tx - a.x) * k;
      a.y += (a.ty - a.y) * k;
      a.z += (a.tz - a.z) * k;
      a.yaw = lerpAngle(a.yaw, a.tyaw, k);
      a.root.position.set(a.x, a.y, a.z);
      a.root.rotation.y = a.yaw;
      const moving = a.pose === 'walk' || a.pose === 'sneak';
      if (moving) a.walkPhase += dt * 10;
      const swing = moving ? Math.sin(a.walkPhase) * 0.5 : 0;
      const legL = a.root.userData.legL as THREE.Mesh;
      const legR = a.root.userData.legR as THREE.Mesh;
      if (legL) legL.rotation.x = swing;
      if (legR) legR.rotation.x = -swing;
    }
  }

  has(id: string): boolean {
    return this.actors.has(id);
  }
}
