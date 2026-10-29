import * as THREE from 'three';
import { createAtlasCanvas, tileUV, ATLAS_W, ATLAS_H } from '../blocks/textures';
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
import { BlockId } from '../blocks/types';
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
  private dimensionVisual: 'overworld' | 'helvete' = 'overworld';
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
  private useSectorMerge = true;
  private dirtySectors = new Set<string>();
  private sectorRebuildQueue: string[] = [];
  private needsChunkSync = true;
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private arrowGroup = new THREE.Group();
  private arrowPool: THREE.Mesh[] = [];
  private boatGroup = new THREE.Group();
  private boatPool: THREE.Mesh[] = [];
  private xpGroup = new THREE.Group();
  private xpPool: THREE.Mesh[] = [];
  private doorGroup = new THREE.Group();
  private doorPool: THREE.Group[] = [];
  private lampGroup = new THREE.Group();
  private signGroup = new THREE.Group();
  private signPool: THREE.Mesh[] = [];
  private lampPool: { mesh: THREE.Mesh; light: THREE.PointLight }[] = [];
  private viewRadius = 7;
  private fov = 70;
  private armorVis: THREE.Group;
  private _sphere = new THREE.Sphere();
  private _euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private _lookTarget = new THREE.Vector3();
  private _armorOff = new THREE.Vector3();
  private _playerPos = { x: 0, y: 0, z: 0 };

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
    this.scene.add(this.doorGroup);
    this.scene.add(this.lampGroup);
    this.scene.add(this.signGroup);
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
    if (this.dimensionVisual === 'helvete') {
      this.applyHelveteSky();
      return;
    }
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

  private applyHelveteSky(): void {
    // Deep red-black void — never pale/white
    this.skyColor.setRGB(0.12, 0.02, 0.015);
    this.renderer.setClearColor(this.skyColor);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setRGB(0.18, 0.03, 0.02);
    fog.near = 6;
    fog.far = 42;
    this.sun.intensity = 0.05;
    this.ambient.intensity = 0.45;
    this.hemi.intensity = 0.35;
    this.hemi.color.setHex(0xff4422);
    this.hemi.groundColor.setHex(0x220800);
  }

  getDayTime(): number { return this.dayTime; }

  /** Helvete: red fog/sky; overworld restores day cycle colors. */
  setDimensionVisuals(dim: 'overworld' | 'helvete'): void {
    this.dimensionVisual = dim;
    if (dim === 'helvete') {
      this.applyHelveteSky();
    } else {
      this.hemi.color.setHex(0xb1c4e8);
      this.hemi.groundColor.setHex(0x3b2a1a);
      this.setDayTime(this.dayTime);
    }
  }

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
    if (this.useSectorMerge) this.markSectorsDirtyFromMeshes();
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
    this._playerPos.x = p.x; this._playerPos.y = p.y; this._playerPos.z = p.z;
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
      const mat = mesh.material as THREE.MeshStandardMaterial;
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
      animateMobRig(root, m, dt, this._playerPos);
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
    if (flash > 0.05 && this.dimensionVisual !== 'helvete') {
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
    if (this.dimensionVisual === 'helvete') {
      this.applyHelveteSky();
      return;
    }
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
    this.tickSectorMerge(2);
    this.renderer.render(this.scene, this.camera);
    this.lastDrawCalls = this.renderer.info.render.calls;
    this.lastTriangles = this.renderer.info.render.triangles;
  }

  private sectorKey(cx: number, cz: number): string {
    return `${cx >> 1},${cz >> 1}`;
  }

  private markSectorsDirtyFromMeshes(): void {
    for (const key of this.opaqueMeshes.keys()) {
      const [cx, cz] = key.split(',').map(Number);
      const sk = this.sectorKey(cx, cz);
      if (!this.dirtySectors.has(sk)) {
        this.dirtySectors.add(sk);
        this.sectorRebuildQueue.push(sk);
      }
    }
    // also remove sectors with no chunks
    for (const sk of [...this.sectorOpaque.keys()]) {
      const [sx, sz] = sk.split(',').map(Number);
      let any = false;
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
        if (this.opaqueMeshes.has(`${(sx << 1) + dx},${(sz << 1) + dz}`)) any = true;
      }
      if (!any) {
        const m = this.sectorOpaque.get(sk);
        if (m) { this.scene.remove(m); m.geometry.dispose(); this.sectorOpaque.delete(sk); }
      }
    }
  }

  /** Budgeted incremental sector merge — call each frame. */
  tickSectorMerge(budget = 2): void {
    if (!this.useSectorMerge) {
      for (const mesh of this.opaqueMeshes.values()) mesh.visible = true;
      return;
    }
    let n = 0;
    while (n < budget && this.sectorRebuildQueue.length) {
      const sk = this.sectorRebuildQueue.shift()!;
      this.dirtySectors.delete(sk);
      this.rebuildOneSector(sk);
      n++;
    }
    // hide per-chunk opaque once sector exists
    for (const [key, mesh] of this.opaqueMeshes) {
      const [cx, cz] = key.split(',').map(Number);
      mesh.visible = !this.sectorOpaque.has(this.sectorKey(cx, cz));
    }
  }

  private rebuildOneSector(sk: string): void {
    const old = this.sectorOpaque.get(sk);
    if (old) { this.scene.remove(old); old.geometry.dispose(); this.sectorOpaque.delete(sk); }
    const [sx, sz] = sk.split(',').map(Number);
    const geos: THREE.BufferGeometry[] = [];
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
      const key = `${(sx << 1) + dx},${(sz << 1) + dz}`;
      const mesh = this.opaqueMeshes.get(key);
      if (mesh && mesh.geometry.getAttribute('position')?.count) {
        geos.push(mesh.geometry.clone());
      }
    }
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    if (!merged) return;
    // dispose clones? mergeGeometries may reuse — dispose sources we cloned
    for (const g of geos) g.dispose();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, this.opaqueMat);
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.sectorOpaque.set(sk, mesh);
    this.scene.add(mesh);
  }


  /** Swinging wooden door panels — closed fills the block face, open swings ~90°. */
  syncDoors(doors: { x: number; y: number; z: number; open: boolean }[]): void {
    while (this.doorPool.length < doors.length) {
      const g = new THREE.Group();
      // 2-block tall panel flush with floor (no sky gap at threshold)
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 1.98, 0.12),
        new THREE.MeshLambertMaterial({ color: 0x8b5a2b, side: THREE.DoubleSide }),
      );
      panel.position.set(0.49, 0.99, 0.06);
      const knob = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshLambertMaterial({ color: 0xc9a227 }),
      );
      knob.position.set(0.82, 1.0, 0.14);
      const boardMat = new THREE.MeshLambertMaterial({ color: 0x6b4220 });
      for (const by of [0.4, 1.0, 1.55]) {
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.14), boardMat);
        board.position.set(0.49, by, 0.07);
        g.add(board);
      }
      // Threshold sill closes the floor gap
      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.06, 0.2),
        new THREE.MeshLambertMaterial({ color: 0x5a3a18 }),
      );
      sill.position.set(0.49, 0.03, 0.1);
      g.add(panel); g.add(knob); g.add(sill);
      this.doorPool.push(g);
      this.doorGroup.add(g);
    }
    for (let i = 0; i < this.doorPool.length; i++) {
      const g = this.doorPool[i];
      if (i >= doors.length) { g.visible = false; continue; }
      const d = doors[i];
      g.visible = true;
      // Anchor hinge at block's -X,-Z corner
      g.position.set(d.x, d.y, d.z);
      g.rotation.y = d.open ? -Math.PI / 2 : 0;
    }
  }

  /** Lit lamps: BasicMaterial when on (screen-bright), near-black when off. */
  syncLamps(lamps: { x: number; y: number; z: number; on: boolean }[]): void {
    while (this.lampPool.length < lamps.length) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.95, 0.95),
        new THREE.MeshBasicMaterial({ color: 0x111110 }),
      );
      const light = new THREE.PointLight(0xffcc66, 0, 8, 2);
      this.lampPool.push({ mesh, light });
      this.lampGroup.add(mesh);
      this.lampGroup.add(light);
    }
    for (let i = 0; i < this.lampPool.length; i++) {
      const { mesh, light } = this.lampPool[i];
      if (i >= lamps.length) { mesh.visible = false; light.intensity = 0; continue; }
      const L = lamps[i];
      mesh.visible = true;
      mesh.position.set(L.x + 0.5, L.y + 0.5, L.z + 0.5);
      light.position.copy(mesh.position);
      // Swap material for unmistakable on/off
      const prev = mesh.material as THREE.Material;
      if (L.on) {
        if (!(prev instanceof THREE.MeshBasicMaterial) || (prev as THREE.MeshBasicMaterial).color.getHex() !== 0xfff7a0) {
          prev.dispose();
          mesh.material = new THREE.MeshBasicMaterial({ color: 0xfff7a0 });
        } else {
          (prev as THREE.MeshBasicMaterial).color.setHex(0xfff7a0);
        }
        light.intensity = 7.0;
        light.distance = 20;
        light.color.setHex(0xffe088);
      } else {
        if (!(prev instanceof THREE.MeshBasicMaterial) || (prev as THREE.MeshBasicMaterial).color.getHex() !== 0x1a1a18) {
          prev.dispose();
          mesh.material = new THREE.MeshBasicMaterial({ color: 0x1a1a18 });
        } else {
          (prev as THREE.MeshBasicMaterial).color.setHex(0x1a1a18);
        }
        light.intensity = 0;
      }
    }
  }

  /** 3D sign posts with canvas text. */
  syncSigns(signs: { x: number; y: number; z: number; text: string }[]): void {
    while (this.signPool.length < signs.length) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(1.0, 0.5),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
      );
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.7, 0.1),
        new THREE.MeshLambertMaterial({ color: 0x6b4220 }),
      );
      post.position.set(0, -0.6, 0);
      const g = new THREE.Group();
      g.add(board); g.add(post);
      board.userData = { canvas, tex };
      this.signPool.push(g as unknown as THREE.Mesh);
      this.signGroup.add(g);
    }
    for (let i = 0; i < this.signPool.length; i++) {
      const g = this.signPool[i] as unknown as THREE.Group;
      if (i >= signs.length) { g.visible = false; continue; }
      const s = signs[i];
      g.visible = true;
      g.position.set(s.x + 0.5, s.y + 1.05, s.z + 0.5);
      const board = g.children[0] as THREE.Mesh;
      const ud = board.userData as { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
      const { canvas, tex } = ud;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#c4a574';
      ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, 250, 122);
      ctx.fillStyle = '#1a0e05';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = (s.text || 'Skilt').split(/\n/).slice(0, 3);
      lines.forEach((line, li) => {
        ctx.fillText(line.slice(0, 14), 128, 32 + li * 32);
      });
      tex.needsUpdate = true;
    }
  }

  setSectorMerge(on: boolean): void {
    this.useSectorMerge = on;
    if (!on) {
      for (const m of this.sectorOpaque.values()) { this.scene.remove(m); m.geometry.dispose(); }
      this.sectorOpaque.clear();
      this.dirtySectors.clear();
      this.sectorRebuildQueue.length = 0;
      for (const mesh of this.opaqueMeshes.values()) mesh.visible = true;
    } else {
      this.markSectorsDirtyFromMeshes();
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
  ctx.drawImage(atlas, uv.u0 * ATLAS_W, uv.v0 * ATLAS_H, 16, 16, dx, dy, size, size);
}
