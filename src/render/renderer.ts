import * as THREE from 'three';
import { createAtlasCanvas, tileUV, ATLAS_SIZE } from '../blocks/textures';
import type { ChunkMeshes, MeshData } from '../world/mesher';
import type { World } from '../world/world';
import type { PlayerState } from '../player/physics';
import { EYE_HEIGHT } from '../player/physics';
import type { Hit } from '../player/raycast';
import type { DropEntity } from '../world/drops';
import type { Mob } from '../mobs/types';
import { ITEMS } from '../items/types';
import type { Projectile } from '../world/projectiles';
import type { Boat } from '../world/boats';
import type { XpOrb } from '../world/xp';

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  private opaqueMeshes = new Map<string, THREE.Mesh>();
  private meshVersions = new Map<string, number>();
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
  private dropMat: THREE.MeshLambertMaterial;
  private mobGroup = new THREE.Group();
  private mobPool: THREE.Mesh[] = [];
  private mobGeo = new THREE.BoxGeometry(1, 1, 1);
  private needsChunkSync = true;
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private arrowGroup = new THREE.Group();
  private arrowPool: THREE.Mesh[] = [];
  private boatGroup = new THREE.Group();
  private boatPool: THREE.Mesh[] = [];
  private xpGroup = new THREE.Group();
  private xpPool: THREE.Mesh[] = [];
  private viewRadius = 7;
  private fov = 70;
  private armorVis: THREE.Group;
  private _sphere = new THREE.Sphere();
  private _euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private _lookTarget = new THREE.Vector3();
  private _armorOff = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true, // reliable screenshots
    });
    this.renderer.setPixelRatio(1); // perf
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.sortObjects = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 160);
    this.scene.fog = new THREE.Fog(0x87b5e0, 48, 120);

    this.atlasCanvas = createAtlasCanvas();
    const tex = new THREE.CanvasTexture(this.atlasCanvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.generateMipmaps = false;

    this.opaqueMat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.FrontSide });
    this.transparentMat = new THREE.MeshLambertMaterial({
      map: tex, vertexColors: true, transparent: true, depthWrite: false,
      side: THREE.FrontSide, alphaTest: 0.02,
    });
    this.dropMat = new THREE.MeshLambertMaterial({ map: tex });

    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.hemi = new THREE.HemisphereLight(0x87b5e0, 0x3a5a28, 0.3);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 0.9);
    this.sun.position.set(50, 80, 30);
    this.scene.add(this.ambient, this.hemi, this.sun);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 }));
    this.outline.visible = false;
    this.outline.frustumCulled = false;
    this.scene.add(this.outline);
    this.scene.add(this.dropGroup);
    this.scene.add(this.mobGroup);
    this.scene.add(this.arrowGroup);
    this.scene.add(this.boatGroup);
    this.scene.add(this.xpGroup);
    this.armorVis = new THREE.Group();
    this.armorVis.visible = false;
    this.scene.add(this.armorVis);
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.55), new THREE.MeshLambertMaterial({ color: 0xaaaaaa }));
    helm.position.y = 0.25;
    this.armorVis.add(helm);

    window.addEventListener('resize', () => this.onResize());
  }

  getAtlas(): HTMLCanvasElement { return this.atlasCanvas; }
  markChunksDirty(): void { this.needsChunkSync = true; }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setDayTime(t: number): void {
    this.dayTime = ((t % 1) + 1) % 1;
    const angle = this.dayTime * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.sin(angle);
    this.sun.position.set(Math.cos(angle) * 100, sunY * 100, 40);
    const day = Math.max(0, sunY);
    this.sun.intensity = 0.2 + day * 0.85;
    this.ambient.intensity = 0.22 + day * 0.35;
    if (day > 0.2) this.skyColor.setRGB(0.53, 0.71, 0.88);
    else if (day > 0) this.skyColor.setRGB(0.85, 0.45 + day, 0.35);
    else this.skyColor.setRGB(0.04, 0.05, 0.1);
    this.renderer.setClearColor(this.skyColor);
    (this.scene.fog as THREE.Fog).color.copy(this.skyColor);
    this.hemi.intensity = 0.12 + day * 0.28;
  }

  getDayTime(): number { return this.dayTime; }

  syncChunks(world: World, force = false): void {
    if (!force && !this.needsChunkSync) return;
    this.needsChunkSync = false;
    for (const [key, data] of world.meshes) {
      const c = world.chunks.get(key);
      const ver = c?.meshVersion ?? 0;
      if (!force && this.meshVersions.get(key) === ver && this.opaqueMeshes.has(key)) continue;
      this.upsert(key, data);
      this.meshVersions.set(key, ver);
    }
    for (const key of [...this.opaqueMeshes.keys()]) {
      if (!world.meshes.has(key)) {
        this.removeKey(key);
        this.meshVersions.delete(key);
      }
    }
  }

  private removeKey(key: string): void {
    for (const map of [this.opaqueMeshes, this.transparentMeshes]) {
      const m = map.get(key);
      if (m) { this.scene.remove(m); m.geometry.dispose(); map.delete(key); }
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
    const put = (map: Map<string, THREE.Mesh>, meshData: MeshData, mat: THREE.Material, order: number) => {
      if (meshData.indices.length === 0) {
        const old = map.get(key);
        if (old) { this.scene.remove(old); old.geometry.dispose(); map.delete(key); }
        return;
      }
      let mesh = map.get(key);
      const geo = this.geoFrom(meshData);
      if (mesh) { mesh.geometry.dispose(); mesh.geometry = geo; }
      else {
        mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = true;
        mesh.renderOrder = order;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        map.set(key, mesh);
        this.scene.add(mesh);
      }
    };
    put(this.opaqueMeshes, data.opaque, this.opaqueMat, 0);
    put(this.transparentMeshes, data.transparent, this.transparentMat, 2);
  }

  updateCamera(p: PlayerState): void {
    this.camera.position.set(p.x, p.y + EYE_HEIGHT, p.z);
    this._euler.set(p.pitch, p.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._euler);
  }

  setOutline(hit: Hit | null): void {
    if (!hit) { this.outline.visible = false; return; }
    this.outline.visible = true;
    this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  syncDrops(drops: DropEntity[]): void {
    while (this.dropPool.length < drops.length) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      this.dropPool.push(mesh);
      this.dropGroup.add(mesh);
    }
    for (let i = 0; i < this.dropPool.length; i++) {
      const mesh = this.dropPool[i];
      if (i >= drops.length) { mesh.visible = false; continue; }
      const d = drops[i];
      mesh.visible = true;
      mesh.position.set(d.x, d.y + 0.15 + Math.sin(d.age * 3) * 0.08, d.z);
      mesh.rotation.y = d.age * 2.2;
      const mat = mesh.material as THREE.MeshLambertMaterial;
      const id = d.stack?.id ?? 0;
      // stable color from id
      mat.color.setHex(0x404040 + ((id * 97) % 0xbfbfbf));
    }
  }

  syncMobs(mobs: Mob[]): void {
    while (this.mobPool.length < mobs.length) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.mobGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }));
      const head = new THREE.Mesh(this.mobGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }));
      head.name = 'head';
      body.name = 'body';
      g.add(body); g.add(head);
      this.mobPool.push(g as unknown as THREE.Mesh);
      this.mobGroup.add(g);
    }
    for (let i = 0; i < this.mobPool.length; i++) {
      const g = this.mobPool[i] as unknown as THREE.Group;
      if (i >= mobs.length) { g.visible = false; continue; }
      const m = mobs[i];
      g.visible = true;
      const bob = Math.sin(m.age * 8) * 0.05 * (Math.hypot(m.vx, m.vz) > 0.15 ? 1 : 0);
      g.position.set(m.x, m.y + bob, m.z);
      g.rotation.y = m.yaw;
      const body = g.children.find((c) => c.name === 'body') as THREE.Mesh;
      const head = g.children.find((c) => c.name === 'head') as THREE.Mesh;
      const col = m.fuse > 0 ? 0xffffff : m.color;
      if (body) {
        body.scale.set(m.width, m.height * 0.65, m.width * 0.85);
        body.position.set(0, m.height * 0.35, 0);
        (body.material as THREE.MeshLambertMaterial).color.setHex(col);
      }
      if (head) {
        const hs = Math.min(m.width, 0.55);
        head.scale.set(hs, hs, hs);
        head.position.set(0, m.height * 0.85, 0);
        (head.material as THREE.MeshLambertMaterial).color.setHex(col);
        // bob head slightly
        head.rotation.x = Math.sin(m.age * 6) * 0.1;
      }
    }
  }


  applySettings(rd: number, fov: number): void {
    this.viewRadius = rd;
    this.fov = fov;
    this.camera.fov = fov;
    this.camera.far = rd * 16 + 40;
    this.camera.updateProjectionMatrix();
    const fogFar = rd * 16 * 0.95;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = fogFar * 0.45;
    fog.far = fogFar;
  }

  syncProjectiles(list: Projectile[]): void {
    while (this.arrowPool.length < list.length) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.55), new THREE.MeshLambertMaterial({ color: 0xcaa060 }));
      this.arrowPool.push(m);
      this.arrowGroup.add(m);
    }
    for (let i = 0; i < this.arrowPool.length; i++) {
      const mesh = this.arrowPool[i];
      if (i >= list.length) { mesh.visible = false; continue; }
      const p = list[i];
      mesh.visible = true;
      mesh.position.set(p.x, p.y, p.z);
      mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
    }
  }

  syncBoats(boats: Boat[]): void {
    while (this.boatPool.length < boats.length) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.1), new THREE.MeshLambertMaterial({ color: 0xc48a3a }));
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.7), new THREE.MeshLambertMaterial({ color: 0x6b4420 }));
      seat.position.y = 0.2;
      g.add(hull); g.add(seat);
      this.boatPool.push(g as unknown as THREE.Mesh);
      this.boatGroup.add(g);
    }
    for (let i = 0; i < this.boatPool.length; i++) {
      const mesh = this.boatPool[i] as unknown as THREE.Group;
      if (i >= boats.length) { mesh.visible = false; continue; }
      const b = boats[i];
      mesh.visible = true;
      mesh.position.set(b.x, b.y, b.z);
      mesh.rotation.y = b.yaw;
    }
  }

  syncXp(orbs: XpOrb[]): void {
    while (this.xpPool.length < orbs.length) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: 0x55ff55, emissive: 0x228822 }));
      this.xpPool.push(m);
      this.xpGroup.add(m);
    }
    for (let i = 0; i < this.xpPool.length; i++) {
      const mesh = this.xpPool[i];
      if (i >= orbs.length) { mesh.visible = false; continue; }
      const o = orbs[i];
      mesh.visible = true;
      mesh.position.set(o.x, o.y, o.z);
      mesh.rotation.y = o.age * 4;
    }
  }

  setArmorVisible(on: boolean, color = 0xaaaaaa): void {
    // First-person armor mesh disabled — HUD armor slots are the indicator.
    // Keeping a world mesh parented to the camera caused full-frame cover in headless GL.
    this.armorVis.visible = false;
    void on; void color;
  }

  render(): void {
    this.camera.updateMatrixWorld();
    this.projScreen.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const maxDist = this.viewRadius * 16;
    const lodDist = maxDist * 0.55;
    const cam = this.camera.position;
    for (const mesh of this.opaqueMeshes.values()) {
      mesh.visible = true; // culling off — was hiding meshes with bad spheres
    }
    for (const mesh of this.transparentMeshes.values()) {
      const sp = mesh.geometry.boundingSphere;
      if (!sp) { mesh.visible = true; continue; }
      const dist = cam.distanceTo(sp.center);
      mesh.visible = !(dist > lodDist && Number.isFinite(dist));
    }
    if (this.armorVis.visible) {
      this._armorOff.set(0, -0.2, -0.4).applyQuaternion(this.camera.quaternion);
      this.armorVis.position.copy(cam).add(this._armorOff);
      this.armorVis.quaternion.copy(this.camera.quaternion);
    }
    this.renderer.render(this.scene, this.camera);
  }
}

export function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  atlas: HTMLCanvasElement,
  itemId: number,
  dx: number, dy: number, size: number,
): void {
  const def = ITEMS[itemId];
  const tile = def?.iconTile ?? 1;
  const uv = tileUV(tile);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, uv.u0 * ATLAS_SIZE, uv.v0 * ATLAS_SIZE, 16, 16, dx, dy, size, size);
}
