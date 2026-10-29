import * as THREE from 'three';
import { createAtlasCanvas } from '../blocks/textures';
import type { ChunkMeshes, MeshData } from '../world/mesher';
import type { World } from '../world/world';
import type { PlayerState } from '../player/physics';
import { EYE_HEIGHT } from '../player/physics';
import type { Hit } from '../player/raycast';
import type { DropEntity } from '../world/drops';
import { ITEMS } from '../items/types';
import { tileUV, ATLAS_SIZE } from '../blocks/textures';

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  private opaqueMeshes = new Map<string, THREE.Mesh>();
  private transparentMeshes = new Map<string, THREE.Mesh>();
  private opaqueMat: THREE.MeshLambertMaterial;
  private transparentMat: THREE.MeshLambertMaterial;
  private sun: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;
  private outline: THREE.LineSegments;
  private skyColor = new THREE.Color();
  private dayTime = 0.25;
  private atlasCanvas: HTMLCanvasElement;
  private dropGroup = new THREE.Group();
  private dropPool: THREE.Mesh[] = [];

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.sortObjects = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 256);
    this.scene.fog = new THREE.Fog(0x87b5e0, 40, 110);

    this.atlasCanvas = createAtlasCanvas();
    const tex = new THREE.CanvasTexture(this.atlasCanvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;

    this.opaqueMat = new THREE.MeshLambertMaterial({
      map: tex,
      vertexColors: true,
      side: THREE.FrontSide,
    });
    this.transparentMat = new THREE.MeshLambertMaterial({
      map: tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      alphaTest: 0.05,
    });

    this.ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.hemi = new THREE.HemisphereLight(0x87b5e0, 0x3a5a28, 0.35);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.0);
    this.sun.position.set(50, 80, 30);
    this.scene.add(this.ambient, this.hemi, this.sun);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.outline = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 }),
    );
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.scene.add(this.dropGroup);

    window.addEventListener('resize', () => this.onResize());
  }

  getAtlas(): HTMLCanvasElement {
    return this.atlasCanvas;
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setDayTime(t: number): void {
    this.dayTime = ((t % 1) + 1) % 1;
    const angle = this.dayTime * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.sin(angle);
    const sunX = Math.cos(angle);
    this.sun.position.set(sunX * 100, sunY * 100, 40);
    const day = Math.max(0, sunY);
    this.sun.intensity = 0.25 + day * 0.9;
    this.ambient.intensity = 0.2 + day * 0.35;
    if (day > 0.2) this.skyColor.setRGB(0.53, 0.71, 0.88);
    else if (day > 0) this.skyColor.setRGB(0.85, 0.45 + day, 0.35);
    else this.skyColor.setRGB(0.05, 0.06, 0.12);
    this.renderer.setClearColor(this.skyColor);
    (this.scene.fog as THREE.Fog).color.copy(this.skyColor);
    this.hemi.intensity = 0.15 + day * 0.3;
  }

  getDayTime(): number {
    return this.dayTime;
  }

  syncChunks(world: World): void {
    for (const [key, data] of world.meshes) {
      this.upsert(key, data);
    }
    for (const key of [...this.opaqueMeshes.keys()]) {
      if (!world.meshes.has(key)) {
        this.removeKey(key);
      }
    }
  }

  private removeKey(key: string): void {
    for (const map of [this.opaqueMeshes, this.transparentMeshes]) {
      const m = map.get(key);
      if (m) {
        this.scene.remove(m);
        m.geometry.dispose();
        map.delete(key);
      }
    }
  }

  private geoFrom(data: MeshData): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 4));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  private upsert(key: string, data: ChunkMeshes): void {
    const put = (
      map: Map<string, THREE.Mesh>,
      meshData: MeshData,
      mat: THREE.Material,
      renderOrder: number,
    ) => {
      if (meshData.indices.length === 0) {
        const old = map.get(key);
        if (old) {
          this.scene.remove(old);
          old.geometry.dispose();
          map.delete(key);
        }
        return;
      }
      let mesh = map.get(key);
      const geo = this.geoFrom(meshData);
      if (mesh) {
        mesh.geometry.dispose();
        mesh.geometry = geo;
      } else {
        mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = true;
        mesh.renderOrder = renderOrder;
        map.set(key, mesh);
        this.scene.add(mesh);
      }
    };
    put(this.opaqueMeshes, data.opaque, this.opaqueMat, 0);
    put(this.transparentMeshes, data.transparent, this.transparentMat, 2);
  }

  updateCamera(p: PlayerState): void {
    this.camera.position.set(p.x, p.y + EYE_HEIGHT, p.z);
    const el = new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(el);
  }

  setOutline(hit: Hit | null): void {
    if (!hit) {
      this.outline.visible = false;
      return;
    }
    this.outline.visible = true;
    this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  syncDrops(drops: DropEntity[]): void {
    while (this.dropPool.length < drops.length) {
      const g = new THREE.BoxGeometry(0.25, 0.25, 0.25);
      const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(g, m);
      this.dropPool.push(mesh);
      this.dropGroup.add(mesh);
    }
    for (let i = 0; i < this.dropPool.length; i++) {
      const mesh = this.dropPool[i];
      if (i >= drops.length) {
        mesh.visible = false;
        continue;
      }
      const d = drops[i];
      mesh.visible = true;
      mesh.position.set(d.x, d.y + Math.sin(d.age * 3) * 0.05, d.z);
      mesh.rotation.y = d.age * 2;
      const def = ITEMS[d.stack.id];
      const tile = def?.iconTile ?? 1;
      // tint by hashing tile
      const col = new THREE.Color().setHSL((tile * 0.07) % 1, 0.45, 0.55);
      (mesh.material as THREE.MeshLambertMaterial).color = col;
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

export function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  atlas: HTMLCanvasElement,
  itemId: number,
  dx: number,
  dy: number,
  size: number,
): void {
  const def = ITEMS[itemId];
  const tile = def?.iconTile ?? 1;
  const uv = tileUV(tile);
  const sx = uv.u0 * ATLAS_SIZE;
  const sy = uv.v0 * ATLAS_SIZE;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, sx, sy, 16, 16, dx, dy, size, size);
}
