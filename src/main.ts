import './style.css';
import { BlockId, isSolid } from './blocks/types';
import { Inventory } from './items/inventory';
import { ITEMS, breakDuration, dropForBlock, damageTool, armorPoints, ItemId, blockMaterial } from './items/types';
import { bindDesktopControls, consumeLook, consumePlace, createInput } from './player/controls';
import { createPlayer, movePlayer, EYE_HEIGHT } from './player/physics';
import { raycast } from './player/raycast';
import { GameRenderer } from './render/renderer';
import { loadWorldNamed, saveWorldNamed, listWorlds } from './storage/save';
import { createHud } from './ui/hud';
import { createInventoryUi } from './ui/inventory';
import { setupTouchControls } from './ui/touch';
import { createTitleMenu, createPauseMenu } from './ui/menus';
import { DropSystem } from './world/drops';
import { ContainerStore } from './world/containers';
import { World, setViewRadius, VIEW_RADIUS } from './world/world';
import { CHUNK_HEIGHT } from './world/chunk';
import { tickWater } from './world/water';
import { SoundBus } from './audio/sound';
import { MobSystem } from './mobs/system';
import { XpSystem } from './world/xp';
import { ProjectileSystem } from './world/projectiles';
import { BoatSystem } from './world/boats';
import { plantCrop, harvestCrop, hoeDirt, setCropStage, tickCrops } from './world/crops';
import { loadSettings, saveSettings, type GameSettings } from './settings';
import type { MobKind } from './mobs/types';

const DAY_LEN = 900; // ~15 min day cycle (MC is 20)

function qs(): URLSearchParams {
  return new URLSearchParams(location.search);
}

async function boot(): Promise<void> {
  const app = document.querySelector<HTMLElement>('#app')!;
  app.innerHTML = '';
  const testMode = qs().get('test') === '1' || qs().get('test') === 'true';
  let settings = loadSettings();

  const startGame = async (worldName: string, seed?: number, fresh = false) => {
    title.hide();
    app.querySelector('#game-root')?.remove();
    const root = document.createElement('div');
    root.id = 'game-root';
    root.style.cssText = 'position:absolute;inset:0;';
    app.appendChild(root);
    await runGame(root, worldName, seed ?? (Date.now() & 0x7fffffff), fresh || testMode, testMode, settings, (s) => {
      settings = s;
      saveSettings(s);
    }, () => {
      root.remove();
      void title.show();
    });
  };

  const title = createTitleMenu(app, {
    onPlay: (name, seed, fresh) => { void startGame(name, seed, !!fresh); },
    onSettingsChange: (s) => { settings = s; },
  });

  if (testMode) {
    title.hide();
    await startGame('__test__', 20261029, true);
  } else {
    await title.show();
    // Auto-open if ?world=
    const w = qs().get('world');
    if (w) await startGame(w, undefined, false);
  }
}

async function runGame(
  app: HTMLElement,
  worldName: string,
  seed: number,
  fresh: boolean,
  testMode: boolean,
  settings: GameSettings,
  onSettings: (s: GameSettings) => void,
  onQuit: () => void,
): Promise<void> {
  setViewRadius(settings.renderDistance);
  const world = new World(seed);
  const renderer = new GameRenderer(app);
  renderer.applySettings(settings.renderDistance, settings.fov);
  const inv = new Inventory();
  const drops = new DropSystem();
  const containers = new ContainerStore();
  const sound = new SoundBus();
  sound.setVolume(settings.volume);
  const mobs = new MobSystem();
  const xp = new XpSystem();
  const projectiles = new ProjectileSystem();
  const boats = new BoatSystem();
  const hud = createHud(app, inv, renderer.getAtlas());
  const input = createInput();

  let player = createPlayer(8.5, 40, 8.5);
  let dayTime = 0.28;
  let breakAcc = 0;
  let breakTarget: string | null = null;
  let lastSave = 0;
  let frames = 0, fps = 0, fpsT = performance.now();
  let hungerAcc = 0, waterAcc = 0, cropAcc = 0;
  let respawn = { x: 8.5, y: 40, z: 8.5 };
  let dead = false;
  let attackCool = 0;
  let bowCharge = 0;
  let meshesDirty = true;
  let lastMeshRev = -1;
  let paused = false;
  let sens = 0.0022 * settings.sensitivity;

  // XP UI
  const xpBar = document.createElement('div');
  xpBar.id = 'xp-bar'; xpBar.innerHTML = '<div id="xp-fill"></div>';
  const xpLabel = document.createElement('div');
  xpLabel.id = 'xp-label';
  const armorRow = document.createElement('div');
  armorRow.id = 'armor-row';
  for (let i = 0; i < 4; i++) {
    const a = document.createElement('div'); a.className = 'arm'; armorRow.appendChild(a);
  }
  app.appendChild(xpBar); app.appendChild(xpLabel); app.appendChild(armorRow);

  const deathEl = document.createElement('div');
  deathEl.id = 'death-screen';
  deathEl.innerHTML = `<div><h1>Du døde</h1><button type="button" id="btn-respawn">Respawn</button></div>`;
  deathEl.style.display = 'none';
  app.appendChild(deathEl);

  const doSave = () => saveWorldNamed(worldName, world, player, inv, drops, containers, dayTime, respawn, xp.toJSON());
  const markMesh = () => { meshesDirty = true; renderer.markChunksDirty(); };

  const applySettings = (s: GameSettings) => {
    settings = s;
    setViewRadius(s.renderDistance);
    renderer.applySettings(s.renderDistance, s.fov);
    sound.setVolume(s.volume);
    sens = 0.0022 * s.sensitivity;
    onSettings(s);
  };

  const pause = createPauseMenu(app, {
    onResume: () => { paused = false; pause.hide(); },
    onSettingsChange: applySettings,
    onQuit: () => { void doSave(); onQuit(); },
  });

  const invUi = createInventoryUi(app, inv, renderer.getAtlas(), () => {
    hud.markDirty(); hud.refreshHotbar();
  });
  const toggleInv = () => {
    if (dead || paused) return;
    if (invUi.isOpen()) { invUi.close(); input.inventoryOpen = false; }
    else { invUi.openPlayer(); input.inventoryOpen = true; input.breakHeld = false; }
  };
  const togglePause = () => {
    if (dead) return;
    if (invUi.isOpen()) { invUi.close(); input.inventoryOpen = false; return; }
    paused = !paused;
    if (paused) { pause.show(); document.exitPointerLock(); }
    else pause.hide();
  };

  setupTouchControls(app, input, { onInventory: toggleInv, onPause: togglePause });
  bindDesktopControls(renderer.canvas, input, (s) => hud.setSlot(s), toggleInv);
  renderer.canvas.addEventListener('pointerdown', () => sound.unlock());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') togglePause();
  });

  // Load / fresh
  if (!fresh) {
    try {
      const saved = await loadWorldNamed(worldName);
      if (saved && saved.version >= 2) {
        world.loadChunks(saved.chunks);
        player = createPlayer(saved.player.x, saved.player.y, saved.player.z);
        player.yaw = saved.player.yaw; player.pitch = saved.player.pitch;
        player.health = saved.player.health; player.hunger = saved.player.hunger;
        player.air = saved.player.air ?? 20;
        if (saved.version >= 3 && 'containers' in saved) containers.loadJSON((saved as { containers: Parameters<ContainerStore['loadJSON']>[0] }).containers);
        if (saved.respawn) respawn = { ...saved.respawn };
        inv.loadJSON(saved.inventory);
        drops.loadJSON(saved.drops);
        hud.setSlot(saved.hotbarSlot);
        dayTime = saved.dayTime;
        if (saved.xp) xp.loadJSON(saved.xp);
      } else fresh = true;
    } catch { fresh = true; }
  }
  if (fresh) {
    world.updateAround(8, 8);
    for (let i = 0; i < 80; i++) world.remeshDirty(12);
    Object.assign(player, world.findSpawn());
    respawn = { x: player.x, y: player.y, z: player.z };
    inv.fillStarter();
  }
  if (!inv.slots.some(Boolean)) inv.fillStarter();

  world.updateAround(player.x, player.z);
  for (let i = 0; i < 60; i++) world.remeshDirty(10);
  await waitMeshesInner(world, renderer, 2500);
  renderer.syncChunks(world, true);
  hud.markDirty(); hud.refreshHotbar(); hud.updateBars(player);
  updateXpUi();
  updateArmorUi();

  const groundY = (x: number, z: number) => {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (isSolid(world.getBlock(Math.floor(x), y, Math.floor(z)))) return y + 1;
    }
    return 0;
  };

  function updateXpUi(): void {
    const need = xp.need();
    const fill = document.getElementById('xp-fill');
    if (fill) fill.style.width = `${(xp.xp / need) * 100}%`;
    xpLabel.textContent = `Nivå ${xp.level}`;
  }
  function updateArmorUi(): void {
    const cells = armorRow.querySelectorAll('.arm');
    cells.forEach((c, i) => c.classList.toggle('on', !!inv.armor[i]));
    const pts = armorPoints(inv.armor);
    renderer.setArmorVisible(pts > 0, pts >= 10 ? 0x55eeee : pts >= 5 ? 0xcccccc : 0xaa8866);
  }

  function hurtPlayer(dmg: number, kx = 0, kz = 0): void {
    if (dead) return;
    const armor = armorPoints(inv.armor);
    const reduced = Math.max(0.5, dmg * (1 - armor / 25));
    player.health = Math.max(0, player.health - reduced);
    const len = Math.hypot(kx, kz) || 1;
    player.vx += (kx / len) * 6;
    player.vz += (kz / len) * 6;
    sound.hurt();
    if (player.health <= 0) die();
  }
  function die(): void {
    dead = true;
    deathEl.style.display = 'flex';
    document.exitPointerLock();
    for (let i = 0; i < 36; i++) {
      const s = inv.slots[i];
      if (s) drops.spawn(Math.floor(player.x), Math.floor(player.y), Math.floor(player.z), s);
      inv.slots[i] = null;
    }
    hud.markDirty();
  }
  function respawnPlayer(): void {
    dead = false;
    deathEl.style.display = 'none';
    player.health = 20; player.hunger = 20; player.air = 20;
    player.x = respawn.x; player.y = respawn.y; player.z = respawn.z;
    player.vx = player.vy = player.vz = 0;
    inv.fillStarter();
    hud.markDirty(); hud.refreshHotbar(); updateArmorUi();
  }
  deathEl.querySelector('#btn-respawn')!.addEventListener('click', () => respawnPlayer());

  function trySleep(hx: number, hy: number, hz: number): boolean {
    const night = dayTime < 0.25 || dayTime > 0.75;
    if (!night) return false;
    if (mobs.mobs.some((m) => m.hostile && Math.hypot(m.x - player.x, m.z - player.z) < 12)) return false;
    dayTime = 0.28;
    respawn = { x: hx + 0.5, y: hy + 1, z: hz + 0.5 };
    player.x = respawn.x; player.y = respawn.y; player.z = respawn.z;
    player.health = Math.min(20, player.health + 4);
    return true;
  }

  async function waitMeshes(ms = 3000): Promise<boolean> {
    return waitMeshesInner(world, renderer, ms);
  }

  // ---- Test / debug API ----
  const api = {
    player, world, input, hud, inv, drops, containers, mobs, sound, xp, projectiles, boats, renderer,
    getState: () => ({
      x: player.x, y: player.y, z: player.z, fps,
      chunks: world.chunks.size, meshes: world.meshes.size,
      health: player.health, hunger: player.hunger, dayTime,
      mobs: mobs.mobs.length, dead, view: VIEW_RADIUS,
      xp: xp.xp, level: xp.level, armor: armorPoints(inv.armor),
      projectiles: projectiles.list.length, boats: boats.boats.length,
      glLost: renderer.renderer.getContext()?.isContextLost?.() ?? null,
    }),
    forceSave: () => doSave(),
    openInv: () => { invUi.openPlayer(); input.inventoryOpen = true; },
    closeInv: () => { invUi.close(); input.inventoryOpen = false; },
    look: (y: number, p: number) => { player.yaw = y; player.pitch = p; },
    lookAt: (x: number, y: number, z: number) => {
      const dx = x - player.x, dy = y - (player.y + EYE_HEIGHT), dz = z - player.z;
      player.yaw = Math.atan2(-dx, -dz);
      // +pitch looks up in our camera; atan2(dy, horiz) matches
      player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    setDay: (t: number) => { dayTime = t; renderer.setDayTime(t); },
    setTime: (t: number) => { dayTime = t; renderer.setDayTime(t); },
    teleport: (x: number, y: number, z: number) => {
      player.x = x; player.y = y; player.z = z;
      player.vx = player.vy = player.vz = 0;
      world.updateAround(x, z);
    },
    give: (id: number, n = 1) => {
      inv.add({ id, count: n, durability: ITEMS[id]?.maxDurability });
      hud.markDirty(); hud.refreshHotbar();
    },
    clearMobs: () => { mobs.clear(); },
    spawnMob: (kind: string, ox = 3, oy = 0, oz = 0) => {
      const x = player.x + ox, z = player.z + oz;
      let y = player.y + oy;
      if (oy === 0) {
        for (let yy = 70; yy > 0; yy--) {
          if (isSolid(world.getBlock(Math.floor(x), yy, Math.floor(z)))
            && world.getBlock(Math.floor(x), yy + 1, Math.floor(z)) === BlockId.Air) {
            y = yy + 1; break;
          }
        }
      }
      return mobs.spawn(kind as MobKind, x, y, z);
    },
    attack: () => {
      const held = inv.held();
      const atk = ITEMS[held?.id ?? -1]?.attack ?? 1;
      const crit = player.vy < -0.1 ? 1.5 : 1;
      sound.swing();
      return mobs.hitAt(player.x, player.y + EYE_HEIGHT, player.z, 3.2, player.yaw, player.pitch, atk * crit, sound);
    },
    shootBow: (charge = 1) => {
      const arrowSlot = inv.slots.findIndex((s) => s && s.id === ItemId.Arrow);
      if (arrowSlot < 0) inv.add({ id: ItemId.Arrow, count: 16 });
      const slot = inv.slots.findIndex((s) => s && s.id === ItemId.Arrow);
      if (slot >= 0) {
        inv.slots[slot]!.count -= 1;
        if (inv.slots[slot]!.count <= 0) inv.slots[slot] = null;
      }
      sound.bow();
      const dmg = 4 + charge * 6;
      projectiles.shoot(player.x, player.y + EYE_HEIGHT, player.z, player.yaw, player.pitch, 28 + charge * 12, dmg);
      hud.markDirty();
    },
    sleep: () => {
      const hit = raycast(world, player);
      if (hit && world.getBlock(hit.x, hit.y, hit.z) === BlockId.Bed) return trySleep(hit.x, hit.y, hit.z);
      // Force sleep on nearest bed block below/around
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++) {
            const x = Math.floor(player.x) + dx, y = Math.floor(player.y) + dy, z = Math.floor(player.z) + dz;
            if (world.getBlock(x, y, z) === BlockId.Bed) return trySleep(x, y, z);
          }
      return false;
    },
    respawn: () => respawnPlayer(),
    kill: () => { player.health = 0; die(); },
    waitForMeshes: (ms = 3000) => waitMeshes(ms),
    forceRemeshAround: async () => {
      const cx = Math.floor(player.x / 16), cz = Math.floor(player.z / 16);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        world.markMeshDirty(cx + dx, cz + dz);
      }
      await waitMeshes(3500);
    },
    buildPlatform: (size = 8) => {
      // Prefer a dry surface near spawn; never stack platforms upward
      let cx = Math.floor(respawn.x), cz = Math.floor(respawn.z);
      let gy = groundY(cx, cz);
      // Search for grass/sand above sea
      outer: for (let r = 0; r < 24; r++) {
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          const x = Math.floor(respawn.x) + dx, z = Math.floor(respawn.z) + dz;
          const y = groundY(x, z);
          const below = world.getBlock(x, y - 1, z);
          if (y > 28 && (below === BlockId.Grass || below === BlockId.Sand || below === BlockId.Dirt || below === BlockId.SnowGrass)) {
            cx = x; cz = z; gy = y; break outer;
          }
        }
      }
      const y = gy - 1;
      for (let dx = -size; dx <= size; dx++)
        for (let dz = -size; dz <= size; dz++) {
          world.setBlock(cx + dx, y, cz + dz, BlockId.Grass);
          for (let yy = 1; yy <= 6; yy++) world.setBlock(cx + dx, y + yy, cz + dz, BlockId.Air);
        }
      player.x = cx + 0.5; player.y = y + 1.05; player.z = cz + 0.5;
      player.vx = player.vy = player.vz = 0;
      player.inWater = false;
      world.updateAround(player.x, player.z);
      markMesh();
      return { x: player.x, y: player.y, z: player.z, platformY: y };
    },
    stageFarm: () => {
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      const bx = Math.floor(player.x + fx * 2), bz = Math.floor(player.z + fz * 2);
      const by = Math.floor(player.y) - 1;
      for (let i = 0; i < 5; i++) {
        const rx = -fz, rz = fx;
        const x = Math.floor(bx + rx * (i - 2)), z = Math.floor(bz + rz * (i - 2));
        world.setBlock(x, by, z, BlockId.Farmland);
        world.setBlock(x, by + 1, z, BlockId.Crop);
        setCropStage(world, x, by + 1, z, i === 4 ? 7 : i + 2);
      }
      player.pitch = -0.55;
      markMesh();
    },
    placeBedFront: () => {
      const x = Math.floor(player.x - Math.sin(player.yaw) * 2);
      const z = Math.floor(player.z - Math.cos(player.yaw) * 2);
      const y = Math.floor(player.y);
      world.setBlock(x, y, z, BlockId.Bed);
      markMesh();
      return { x, y, z };
    },
    placeBoatFront: () => {
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      const x0 = Math.floor(player.x + fx * 3);
      const z0 = Math.floor(player.z + fz * 3);
      const y = Math.floor(player.y) - 1;
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(x0 + fx * i), z = Math.floor(z0 + fz * i);
        world.setBlock(x, y, z, BlockId.Dirt);
        world.setBlock(x, y + 1, z, BlockId.Water);
        world.setWater(x, y + 1, z, 7);
        world.setBlock(x, y + 2, z, BlockId.Air);
      }
      const bx = x0 + fx * 2 + 0.5, bz = z0 + fz * 2 + 0.5;
      const b = boats.place(bx, y + 1.55, bz);
      b.yaw = player.yaw;
      player.pitch = -0.35;
      api.lookAt(bx, y + 1.7, bz);
      markMesh();
      return b;
    },
    placeEnchant: () => {
      const x = Math.floor(player.x - Math.sin(player.yaw) * 2.5);
      const z = Math.floor(player.z - Math.cos(player.yaw) * 2.5);
      const y = Math.floor(player.y);
      world.setBlock(x, y - 1, z, BlockId.Stone);
      world.setBlock(x, y, z, BlockId.EnchantTable);
      xp.level = Math.max(xp.level, 3);
      xp.xp = 4;
      updateXpUi();
      markMesh();
      api.lookAt(x + 0.5, y + 0.5, z + 0.5);
    },
    equipArmor: () => {
      inv.armor[0] = { id: ItemId.IronHelmet, count: 1, durability: 165 };
      inv.armor[1] = { id: ItemId.IronChest, count: 1, durability: 240 };
      inv.armor[2] = { id: ItemId.IronLegs, count: 1, durability: 225 };
      inv.armor[3] = { id: ItemId.IronBoots, count: 1, durability: 195 };
      updateArmorUi();
    },
    enchantHeld: () => {
      if (!xp.tryEnchant()) return false;
      const h = inv.held();
      if (h && h.durability != null) h.durability = (ITEMS[h.id]?.maxDurability ?? h.durability) + 50;
      updateXpUi();
      return true;
    },
    showPause: () => { paused = true; pause.show(); },
    hidePause: () => { paused = false; pause.hide(); },
    showTitle: () => {},
  };
  (window as unknown as { __bv: typeof api; __BV: typeof api }).__bv = api;
  (window as unknown as { __BV: typeof api }).__BV = api;

  // Melee
  renderer.canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || invUi.isOpen() || dead || paused) return;
    if (!input.pointerLocked) return;
    if (attackCool <= 0) {
      attackCool = 0.35;
      const held = inv.held();
      if (ITEMS[held?.id ?? -1]?.tool === 'bow') return;
      const atk = ITEMS[held?.id ?? -1]?.attack ?? 1;
      const crit = !player.onGround && player.vy < -0.05 ? 1.5 : 1;
      sound.swing();
      const hit = mobs.hitAt(player.x, player.y + EYE_HEIGHT, player.z, 3.2, player.yaw, player.pitch, atk * crit, sound);
      if (hit && held && ITEMS[held.id]?.tool === 'sword') inv.setHeld(damageTool(held));
    }
  });

  let prev = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    let dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    frames++;
    if (now - fpsT >= 500) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
    attackCool -= dt;

    if (paused || dead) {
      renderer.setDayTime(dayTime);
      renderer.updateCamera(player);
      renderer.render();
      hud.updateDebug(player, fps, world.chunks.size, dayTime);
      return;
    }

    if (!invUi.isOpen()) {
      const look = consumeLook(input);
      if (input.pointerLocked || input.touchLookActive || Math.abs(look.dx) + Math.abs(look.dy) > 0) {
        player.yaw -= look.dx * sens;
        player.pitch -= look.dy * sens; // -pitch looks down in this camera setup
        app.classList.add('playing');
        document.getElementById('game-root')?.classList.add('playing');
        const hint = document.getElementById('hint');
        if (hint) hint.style.display = 'none';
      }
      let wishX = 0, wishZ = 0;
      if (input.right) wishX += 1;
      if (input.left) wishX -= 1;
      if (input.forward) wishZ -= 1;
      if (input.back) wishZ += 1;
      if (Math.abs(input.touchMoveX) > 0.05 || Math.abs(input.touchMoveY) > 0.05) {
        wishX = input.touchMoveX; wishZ = input.touchMoveY;
        if (Math.hypot(wishX, wishZ) > 0.85) input.sprint = true;
      }
      player.sneaking = input.sneak;
      player.sprinting = input.sprint && !input.sneak && !!input.forward;

      const held = inv.held();
      if (input.breakHeld && ITEMS[held?.id ?? -1]?.tool === 'bow') {
        bowCharge = Math.min(1, bowCharge + dt);
      } else if (bowCharge > 0.2 && ITEMS[held?.id ?? -1]?.tool === 'bow') {
        const arrowSlot = inv.slots.findIndex((s) => s && s.id === ItemId.Arrow);
        if (arrowSlot >= 0) {
          inv.slots[arrowSlot]!.count -= 1;
          if (inv.slots[arrowSlot]!.count <= 0) inv.slots[arrowSlot] = null;
          sound.bow();
          const dmg = 4 + bowCharge * 6;
          projectiles.shoot(player.x, player.y + EYE_HEIGHT, player.z, player.yaw, player.pitch, 28 + bowCharge * 12, dmg);
          inv.setHeld(damageTool(held));
          hud.markDirty();
        }
        bowCharge = 0;
      } else bowCharge = 0;

      if (!boats.mounted) {
        const move = movePlayer(player, world, wishX, wishZ, input.jump, dt);
        if (move.fallDamage > 0) hurtPlayer(move.fallDamage);
      }
      boats.update(dt, world, player, wishX, wishZ, !!input.forward);

      if (player.onGround && (wishX || wishZ) && !boats.mounted) {
        const feet = world.getBlock(Math.floor(player.x), Math.floor(player.y - 0.1), Math.floor(player.z));
        const mat = blockMaterial(feet);
        sound.step(true, player.sprinting, dt, mat === 'stone' || mat === 'wood' || mat === 'ground' || mat === 'plant' ? (mat === 'ground' ? 'grass' : mat === 'wood' ? 'wood' : mat === 'stone' ? 'stone' : 'other') : 'other');
      }

      hungerAcc += dt * (player.sprinting ? 0.04 : (player.vx || player.vz) ? 0.008 : 0.001);
      if (hungerAcc > 1) {
        hungerAcc = 0;
        if (player.hunger > 0) player.hunger = Math.max(0, player.hunger - 1);
        else hurtPlayer(0.5);
      }
      if (player.hunger > 17 && player.health < 20) player.health = Math.min(20, player.health + dt * 0.25);
    }

    world.updateAround(player.x, player.z);
    waterAcc += dt;
    if (waterAcc > 0.8) { waterAcc = 0; tickWater(world, 20); }
    cropAcc += dt;
    if (cropAcc > 1.2) { cropAcc = 0; if (tickCrops(world, 16) > 0) markMesh(); }
    containers.tick(dt);
    mobs.trySpawn(world, player, dayTime, dt);
    mobs.update(world, player, dt, drops, sound, (d, kx, kz) => hurtPlayer(d, kx, kz), xp);
    projectiles.update(dt, world, mobs, sound);
    xp.update(dt, player);
    updateXpUi();
    sound.ambient(dayTime, dt);

    // Remesh budget scales with dirty backlog but capped to avoid spikes
    const dirtyN = world.meshQueue().dirty;
    const budget = dirtyN > 40 ? 4 : dirtyN > 15 ? 3 : 2;
    const remeshed = world.remeshDirty(budget);
    if (remeshed.length) markMesh();
    if (world.meshRevision !== lastMeshRev) {
      lastMeshRev = world.meshRevision;
      meshesDirty = true;
    }
    if (meshesDirty) { renderer.syncChunks(world, true); meshesDirty = false; }

    drops.update(dt, player, inv, groundY);
    renderer.syncDrops(drops.drops);
    renderer.syncMobs(mobs.mobs);
    renderer.syncProjectiles(projectiles.list);
    renderer.syncBoats(boats.boats);
    renderer.syncXp(xp.orbs);
    hud.refreshHotbar();

    const hit = raycast(world, player);
    renderer.setOutline(invUi.isOpen() ? null : hit);

    if (!invUi.isOpen() && input.breakHeld && hit && ITEMS[inv.held()?.id ?? -1]?.tool !== 'bow') {
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (breakTarget !== key) { breakTarget = key; breakAcc = 0; }
      const id = world.getBlock(hit.x, hit.y, hit.z);
      if (id === BlockId.Crop) {
        harvestCrop(world, hit.x, hit.y, hit.z, drops);
        sound.breakBlock(); markMesh(); hud.markDirty();
        breakAcc = 0; breakTarget = null; hud.setBreakProgress(0);
      } else {
        const need = breakDuration(id, inv.held());
        breakAcc += dt;
        hud.setBreakProgress(need > 0 ? breakAcc / need : 1);
        if (need > 0 && breakAcc >= need) {
          if (id !== BlockId.Air && id !== BlockId.Water) {
            const drop = dropForBlock(id, inv.held());
            world.setBlock(hit.x, hit.y, hit.z, BlockId.Air);
            if (id === BlockId.Chest || id === BlockId.Furnace) containers.removeAt(hit.x, hit.y, hit.z);
            if (drop) drops.spawn(hit.x, hit.y, hit.z, drop);
            inv.setHeld(damageTool(inv.held()));
            sound.breakBlock();
            markMesh();
            hud.markDirty();
          }
          breakAcc = 0; breakTarget = null; hud.setBreakProgress(0);
        }
      }
    } else if (!input.breakHeld) {
      breakAcc = 0; breakTarget = null; hud.setBreakProgress(0);
    }

    if (!invUi.isOpen() && consumePlace(input) && hit) {
      const tid = world.getBlock(hit.x, hit.y, hit.z);
      if (tid === BlockId.CraftingTable) { invUi.openTable(); input.inventoryOpen = true; }
      else if (tid === BlockId.Chest) { invUi.openChest(containers.getChest(hit.x, hit.y, hit.z)); input.inventoryOpen = true; }
      else if (tid === BlockId.Furnace) { invUi.openFurnace(containers.getFurnace(hit.x, hit.y, hit.z)); input.inventoryOpen = true; }
      else if (tid === BlockId.Bed) { trySleep(hit.x, hit.y, hit.z); }
      else if (tid === BlockId.EnchantTable) {
        if (api.enchantHeld()) sound.placeBlock();
      } else {
        const held = inv.held();
        if (held && ITEMS[held.id]?.tool === 'hoe') {
          if (hoeDirt(world, hit.x, hit.y, hit.z)) {
            inv.setHeld(damageTool(held)); sound.placeBlock(); markMesh(); hud.markDirty();
          }
        } else if (held && held.id === ItemId.Seeds) {
          const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
          if (plantCrop(world, px, py, pz)) {
            held.count -= 1; if (held.count <= 0) inv.setHeld(null);
            sound.placeBlock(); markMesh(); hud.markDirty();
          }
        } else if (held && held.id === ItemId.Boat) {
          const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
          boats.place(px + 0.5, py + 0.4, pz + 0.5);
          inv.setHeld(null); hud.markDirty(); sound.placeBlock();
        } else if (held && ITEMS[held.id]?.armorSlot) {
          const left = inv.tryEquip(held);
          inv.setHeld(left);
          hud.markDirty(); updateArmorUi();
        } else if (held && ITEMS[held.id]?.food && !ITEMS[held.id]?.placeBlock) {
          player.hunger = Math.min(20, player.hunger + (ITEMS[held.id].food ?? 0));
          held.count -= 1;
          if (held.count <= 0) inv.setHeld(null);
          sound.eat(); hud.markDirty();
        } else {
          // Mount boat if near
          if (boats.nearest(player.x, player.y, player.z, 2.2)) {
            boats.tryMount(player);
          } else {
            const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
            const taken = inv.takeOneFromSelected();
            if (taken) {
              const placeId = ITEMS[taken.id]?.placeBlock;
              const dest = world.getBlock(px, py, pz);
              if (placeId != null && (dest === BlockId.Air || dest === BlockId.Water)) {
                world.setBlock(px, py, pz, placeId);
                sound.placeBlock(); markMesh();
              } else inv.add(taken);
              hud.markDirty();
            }
          }
        }
      }
    }

    dayTime += dt / DAY_LEN;
    renderer.setDayTime(dayTime);
    renderer.updateCamera(player);
    renderer.render();
    hud.updateDebug(player, fps, world.chunks.size, dayTime);
    hud.updateBars(player);

    if (now - lastSave > 20000) { lastSave = now; void doSave(); }
  };
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void doSave();
  });
}

async function waitMeshesInner(world: World, renderer: GameRenderer, ms: number): Promise<boolean> {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    for (let i = 0; i < 8; i++) world.remeshDirty(6);
    renderer.syncChunks(world, true);
    const q = world.meshQueue();
    if (q.dirty === 0 && q.meshing === 0 && world.meshes.size > 0) {
      await new Promise((r) => setTimeout(r, 100));
      renderer.syncChunks(world, true);
      return true;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  renderer.syncChunks(world, true);
  return world.meshes.size > 0;
}

boot().catch(console.error);
