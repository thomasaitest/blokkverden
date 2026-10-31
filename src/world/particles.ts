import * as THREE from 'three';

export type ParticleKind = 'break' | 'sprint' | 'splash' | 'redstone';

interface P {
  mesh: THREE.Mesh;
  vx: number; vy: number; vz: number;
  life: number;
}

export class ParticleSystem {
  private list: P[] = [];
  private group = new THREE.Group();
  private geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);
  }

  burst(x: number, y: number, z: number, color: number, n = 12, kind: ParticleKind = 'break'): void {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.position.set(x + Math.random() * 0.6 - 0.3, y + Math.random() * 0.4, z + Math.random() * 0.6 - 0.3);
      this.group.add(mesh);
      this.list.push({
        mesh,
        vx: (Math.random() - 0.5) * (kind === 'sprint' ? 2 : 3),
        vy: Math.random() * (kind === 'sprint' ? 1.5 : 4) + 0.5,
        vz: (Math.random() - 0.5) * (kind === 'sprint' ? 2 : 3),
        life: 0.4 + Math.random() * 0.4,
      });
    }
  }

  count(): number { return this.list.length; }

  update(dt: number): void {
    this.list = this.list.filter((p) => {
      p.life -= dt;
      p.vy -= 12 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  }
}
