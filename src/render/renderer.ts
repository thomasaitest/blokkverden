import * as THREE from 'three';
import { createAtlasCanvas } from '../blocks/textures';
import type { MeshData } from '../world/mesher';
import type { World } from '../world/world';
import type { PlayerState } from '../player/physics';
import { EYE_HEIGHT } from '../player/physics';
import type { Hit } from '../player/raycast';

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  private chunkMeshes = new Map<string, THREE.Mesh>();
  private material: THREE.MeshLambertMaterial;
  private waterMaterial: THREE.MeshLambertMaterial;
  private sun: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;
  private outline: THREE.LineSegments;
  private skyColor = new THREE.Color();
  private dayTime = 0.25; // 0–1, 0.25 = morning

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

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 256);
    this.scene.fog = new THREE.Fog(0x87b5e0, 40, 110);

    const atlas = createAtlasCanvas();
    const tex = new THREE.CanvasTexture(atlas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;

    this.material = new THREE.MeshLambertMaterial({
      map: tex,
      vertexColors: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });
    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: tex,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.hemi = new THREE.HemisphereLight(0x87b5e0, 0x3a5a28, 0.35);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.0);
    this.sun.position.set(50, 80, 30);
    this.scene.add(this.ambient, this.hemi, this.sun);

    // Outline for targeted block
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.outline = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 }),
    );
    this.outline.visible = false;
    this.scene.add(this.outline);

    window.addEventListener('resize', () => this.onResize());
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setDayTime(t: number): void {
    this.dayTime = ((t % 1) + 1) % 1;
    // sun angle: 0 = midnight, 0.25 = sunrise, 0.5 = noon
    const angle = this.dayTime * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.sin(angle);
    const sunX = Math.cos(angle);
    this.sun.position.set(sunX * 100, sunY * 100, 40);
    const day = Math.max(0, sunY);
    const night = 1 - day;
    this.sun.intensity = 0.25 + day * 0.9;
    this.ambient.intensity = 0.2 + day * 0.35;

    if (day > 0.2) {
      this.skyColor.setRGB(0.53, 0.71, 0.88);
    } else if (day > 0) {
      // sunrise/sunset
      this.skyColor.setRGB(0.85, 0.45 + day, 0.35);
    } else {
      this.skyColor.setRGB(0.05, 0.06, 0.12);
    }
    this.renderer.setClearColor(this.skyColor);
    (this.scene.fog as THREE.Fog).color.copy(this.skyColor);
    this.hemi.intensity = 0.15 + day * 0.3;
  }

  getDayTime(): number {
    return this.dayTime;
  }

  syncChunks(world: World): void {
    for (const [key, data] of world.meshes) {
      this.upsertMesh(key, data);
    }
    for (const key of this.chunkMeshes.keys()) {
      if (!world.meshes.has(key)) {
        const m = this.chunkMeshes.get(key)!;
        this.scene.remove(m);
        m.geometry.dispose();
        this.chunkMeshes.delete(key);
      }
    }
  }

  private upsertMesh(key: string, data: MeshData): void {
    let mesh = this.chunkMeshes.get(key);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 4));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();

    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geo;
    } else {
      mesh = new THREE.Mesh(geo, this.material);
      mesh.frustumCulled = true;
      this.chunkMeshes.set(key, mesh);
      this.scene.add(mesh);
    }
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

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
