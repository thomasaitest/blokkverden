import * as THREE from 'three';
import { createAtlasCanvas, tileUV, ATLAS_SIZE } from '../blocks/textures';
import type { ChunkMeshes, MeshData } from '../world/mesher';
import type { World } from '../world/world';
import type { PlayerState } from '../player/physics';
import { EYE_HEIGHT } from '../player/physics';
import type { Hit } from '../player/raycast';
import type { DropEntity } from '../world/drops';
import type { Mob } from '../mobs/types';
import { createMobRig, animateMobRig, createDeathPoof, updateDeathPoof } from '../mobs/models';
import type { WeatherKind } from '../world/weather';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  private mobPool: THREE.Group[] = [];
  private mobKinds: string[] = [];
  private poofs: THREE.Points[] = [];
  private weatherPoints: THREE.Points | null = null;
  private weatherKind: WeatherKind = 'clear';
  private lastDrawCalls = 0;
  private lastTriangles = 0;
  private sectorOpaque = new Map<string, THREE.Mesh>();
  private useSectorMerge = false;
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
    this.rebuildSectors();
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

  syncMobs(mobs: Mob[], dt = 0.016): void {
    // rebuild pool entries when kind mismatches
    while (this.mobPool.length < mobs.length) {
      const kind = mobs[this.mobPool.length]?.kind ?? 'gris';
      const g = createMobRig(kind);
      this.mobPool.push(g);
      this.mobKinds.push(kind);
      this.mobGroup.add(g);
    }
    for (let i = 0; i < this.mobPool.length; i++) {
      const g = this.mobPool[i];
      if (i >= mobs.length) { g.visible = false; continue; }
      const m = mobs[i];
      if (this.mobKinds[i] !== m.kind) {
        this.mobGroup.remove(g);
        const ng = createMobRig(m.kind);
        this.mobPool[i] = ng;
        this.mobKinds[i] = m.kind;
        this.mobGroup.add(ng);
      }
      const root = this.mobPool[i];
      root.visible = true;
      root.position.set(m.x, m.y, m.z);
      root.rotation.y = m.yaw;
      animateMobRig(root, m, dt);
      if (m.deathT != null && m.deathT > 0.35 && m.deathT < 0.35 + dt + 0.02) {
        const poof = createDeathPoof();
        poof.position.set(m.x, m.y + 0.6, m.z);
        this.scene.add(poof);
        this.poofs.push(poof);
      }
    }
    // update poofs
    this.poofs = this.poofs.filter((p) => {
      const alive = updateDeathPoof(p, dt);
      if (!alive) { this.scene.remove(p); p.geometry.dispose(); }
      return alive;
    });
  }

  syncWeather(kind: WeatherKind, intensity: number, cam: THREE.Vector3, flash: number): void {
    this.weatherKind = kind;
    if (flash > 0.05) {
      this.renderer.setClearColor(new THREE.Color(0.9, 0.9, 1.0));
    }
    if (kind === 'clear' || intensity < 0.05) {
      if (this.weatherPoints) this.weatherPoints.visible = false;
      return;
    }
    if (!this.weatherPoints) {
      const n = 800;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 40;
        pos[i * 3 + 1] = Math.random() * 30;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ size: 0.08, color: 0xaaccff, transparent: true, opacity: 0.7 });
      this.weatherPoints = new THREE.Points(geo, mat);
      this.weatherPoints.frustumCulled = false;
      this.scene.add(this.weatherPoints);
    }
    this.weatherPoints.visible = true;
    const mat = this.weatherPoints.material as THREE.PointsMaterial;
    mat.color.setHex(kind === 'snow' ? 0xffffff : 0x88aaff);
    mat.size = kind === 'snow' ? 0.12 : 0.06;
    this.weatherPoints.position.set(cam.x, cam.y, cam.z);
    const pos = this.weatherPoints.geometry.attributes.position as THREE.BufferAttribute;
    const speed = kind === 'snow' ? 2 : 12;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - speed * 0.016 * intensity;
      if (y < -5) y = 25;
      pos.setY(i, y);
      if (kind === 'rain') pos.setX(i, pos.getX(i) + 0.02);
    }
    pos.needsUpdate = true;
  }

  getPerfStats(): { drawCalls: number; triangles: number; programs: number } {
    return { drawCalls: this.lastDrawCalls, triangles: this.lastTriangles, programs: this.renderer.info.programs?.length ?? 0 };
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
    this.renderer.info.reset();
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
    this.lastDrawCalls = this.renderer.info.render.calls;
    this.lastTriangles = this.renderer.info.render.triangles;
  }

  /** Merge opaque chunk meshes into 2×2 sectors to cut draw calls. */
  rebuildSectors(): void {
    for (const m of this.sectorOpaque.values()) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.sectorOpaque.clear();
    if (!this.useSectorMerge) {
      for (const mesh of this.opaqueMeshes.values()) mesh.visible = true;
      return;
    }
    // group by floor(cx/2), floor(cz/2)
    const groups = new Map<string, THREE.BufferGeometry[]>();
    for (const [key, mesh] of this.opaqueMeshes) {
      const [cx, cz] = key.split(',').map(Number);
      const sk = `${cx >> 1},${cz >> 1}`;
      let arr = groups.get(sk);
      if (!arr) { arr = []; groups.set(sk, arr); }
      // clone geometry with world offset already in verts (mesher uses world coords)
      arr.push(mesh.geometry.clone());
      mesh.visible = false; // replaced by sector
    }
    for (const [sk, geos] of groups) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.opaqueMat);
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.sectorOpaque.set(sk, mesh);
      this.scene.add(mesh);
    }
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
