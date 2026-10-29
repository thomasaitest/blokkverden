import './style.css';
import { BlockId, isSolid } from './blocks/types';
import { Inventory } from './items/inventory';
import { ITEMS, breakDuration, dropForBlock, damageTool, armorPoints, ItemId, blockMaterial } from './items/types';
import { bindDesktopControls, consumeLook, consumePlace, createInput } from './player/controls';
import { createPlayer, movePlayer, EYE_HEIGHT } from './player/physics';
import { raycast } from './player/raycast';
import { GameRenderer } from './render/renderer';
import { loadWorld, saveWorld } from './storage/save';
import { createHud } from './ui/hud';
import { createInventoryUi } from './ui/inventory';
import { setupTouchControls } from './ui/touch';
import { DropSystem } from './world/drops';
import { ContainerStore } from './world/containers';
import { World } from './world/world';
import { CHUNK_HEIGHT } from './world/chunk';
import { tickWater } from './world/water';
import { SoundBus } from './audio/sound';
import { MobSystem } from './mobs/system';

const SENS = 0.0022;
const DAY_LEN = 600;

async function boot(): Promise<void> {
  const app = document.querySelector<HTMLElement>('#app')!;
  app.innerHTML = '';

  const world = new World(20261029);
  const renderer = new GameRenderer(app);
  const inv = new Inventory();
  const drops = new DropSystem();
  const containers = new ContainerStore();
  const sound = new SoundBus();
  const mobs = new MobSystem();
  const hud = createHud(app, inv, renderer.getAtlas());
  const input = createInput();

  let player = createPlayer(8.5, 40, 8.5);
  let dayTime = 0.28;
  let breakAcc = 0;
  let breakTarget: string | null = null;
  let lastSave = 0;
  let frames = 0, fps = 0, fpsT = performance.now();
  let hungerAcc = 0, waterAcc = 0;
  let respawn = { x: 8.5, y: 40, z: 8.5 };
  let dead = false;
  let attackCool = 0;
  let bowCharge = 0;
  let meshesDirty = true;
  let lastMeshRev = -1;

  const deathEl = document.createElement('div');
  deathEl.id = 'death-screen';
  deathEl.innerHTML = `<div><h1>Du døde</h1><button type="button" id="btn-respawn">Respawn</button></div>`;
  deathEl.style.display = 'none';
  app.appendChild(deathEl);
  deathEl.querySelector('#btn-respawn')!.addEventListener('click', () => respawnPlayer());

  const doSave = () => saveWorld(world, player, inv, drops, containers, dayTime, respawn);
  const markMesh = () => { meshesDirty = true; renderer.markChunksDirty(); };

  const invUi = createInventoryUi(app, inv, renderer.getAtlas(), () => {
    hud.markDirty(); hud.refreshHotbar();
  });
  const toggleInv = () => {
    if (dead) return;
    if (invUi.isOpen()) { invUi.close(); input.inventoryOpen = false; }
    else { invUi.openPlayer(); input.inventoryOpen = true; input.breakHeld = false; }
  };

  setupTouchControls(app, input);
  bindDesktopControls(renderer.canvas, input, (s) => hud.setSlot(s), toggleInv);
  renderer.canvas.addEventListener('pointerdown', () => sound.unlock());

  try {
    const saved = await loadWorld();
    if (saved && saved.version >= 2) {
      world.loadChunks(saved.chunks);
      player = createPlayer(saved.player.x, saved.player.y, saved.player.z);
      player.yaw = saved.player.yaw; player.pitch = saved.player.pitch;
      player.health = saved.player.health; player.hunger = saved.player.hunger;
      player.air = saved.player.air ?? 20;
      if (saved.version >= 3 && 'containers' in saved) containers.loadJSON((saved as { containers: Parameters<ContainerStore['loadJSON']>[0] }).containers);
      if (saved.version >= 4 && saved.respawn) respawn = { ...saved.respawn };
      if (saved.version >= 4) inv.loadJSON(saved.inventory);
      else inv.loadJSON((saved as { inventory: Parameters<Inventory['loadJSON']>[0] }).inventory);
      drops.loadJSON(saved.drops);
      hud.setSlot(saved.hotbarSlot);
      dayTime = saved.dayTime;
    } else {
      world.updateAround(8, 8);
      for (let i = 0; i < 60; i++) world.remeshDirty(10);
      Object.assign(player, world.findSpawn());
      respawn = { x: player.x, y: player.y, z: player.z };
      inv.fillStarter();
    }
  } catch {
    world.updateAround(8, 8);
    for (let i = 0; i < 60; i++) world.remeshDirty(10);
    Object.assign(player, world.findSpawn());
    respawn = { x: player.x, y: player.y, z: player.z };
    inv.fillStarter();
  }
  if (!inv.slots.some(Boolean)) inv.fillStarter();

  world.updateAround(player.x, player.z);
  for (let i = 0; i < 50; i++) world.remeshDirty(8);
  await new Promise((r) => setTimeout(r, 400));
  for (let i = 0; i < 40; i++) world.remeshDirty(8);
  renderer.syncChunks(world, true);
  hud.markDirty(); hud.refreshHotbar(); hud.updateBars(player);

  const groundY = (x: number, z: number) => {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (isSolid(world.getBlock(Math.floor(x), y, Math.floor(z)))) return y + 1;
    }
    return 0;
  };

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
    // Drop inventory
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
    hud.markDirty(); hud.refreshHotbar();
  }

  function trySleep(hx: number, hy: number, hz: number): boolean {
    const night = dayTime < 0.25 || dayTime > 0.75;
    if (!night) return false;
    // Clear hostiles nearby
    if (mobs.mobs.some((m) => m.hostile && Math.hypot(m.x - player.x, m.z - player.z) < 12)) return false;
    dayTime = 0.28;
    respawn = { x: hx + 0.5, y: hy + 1, z: hz + 0.5 };
    player.x = respawn.x; player.y = respawn.y; player.z = respawn.z;
    player.health = Math.min(20, player.health + 4);
    return true;
  }

  (window as unknown as { __BV: unknown }).__BV = {
    player, world, input, hud, inv, drops, containers, mobs, sound,
    getState: () => ({
      x: player.x, y: player.y, z: player.z, fps, chunks: world.chunks.size,
      meshes: world.meshes.size, health: player.health, hunger: player.hunger,
      dayTime, mobs: mobs.mobs.length, dead, view: 6,
    }),
    forceSave: () => doSave(),
    openInv: () => { invUi.openPlayer(); input.inventoryOpen = true; },
    closeInv: () => { invUi.close(); input.inventoryOpen = false; },
    look: (y: number, p: number) => { player.yaw = y; player.pitch = p; },
    setDay: (t: number) => { dayTime = t; renderer.setDayTime(t); },
    teleport: (x: number, y: number, z: number) => { player.x = x; player.y = y; player.z = z; },
    give: (id: number, n = 1) => { inv.add({ id, count: n, durability: ITEMS[id]?.maxDurability }); hud.markDirty(); hud.refreshHotbar(); },
    breakBlock: () => {
      const hit = raycast(world, player);
      if (!hit) return false;
      const id = world.getBlock(hit.x, hit.y, hit.z);
      if (id === BlockId.Air || id === BlockId.Water) return false;
      const drop = dropForBlock(id, inv.held());
      world.setBlock(hit.x, hit.y, hit.z, BlockId.Air);
      if (drop) drops.spawn(hit.x, hit.y, hit.z, drop);
      sound.breakBlock();
      markMesh();
      return true;
    },
    spawnMob: (kind: string) => mobs.spawn(kind as 'gris', player.x + 3, player.y, player.z),
    attack: () => {
      const held = inv.held();
      const atk = ITEMS[held?.id ?? -1]?.attack ?? 1;
      const crit = player.vy < -0.1 ? 1.5 : 1;
      sound.swing();
      return mobs.hitAt(player.x, player.y + EYE_HEIGHT, player.z, 3.2, player.yaw, player.pitch, atk * crit, sound);
    },
    sleep: () => {
      const hit = raycast(world, player);
      if (hit && world.getBlock(hit.x, hit.y, hit.z) === BlockId.Bed) return trySleep(hit.x, hit.y, hit.z);
      return false;
    },
    respawn: () => respawnPlayer(),
  };

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.canvas) app.classList.add('playing');
  });

  // Melee on click when not breaking long
  renderer.canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || invUi.isOpen() || dead) return;
    if (!input.pointerLocked) return;
    // short attack pulse
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

    if (!dead && !invUi.isOpen()) {
      const look = consumeLook(input);
      if (input.pointerLocked || input.touchLookActive || Math.abs(look.dx) + Math.abs(look.dy) > 0) {
        player.yaw -= look.dx * SENS;
        player.pitch -= look.dy * SENS;
        app.classList.add('playing');
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

      // Bow charge while holding break with bow
      const held = inv.held();
      if (input.breakHeld && ITEMS[held?.id ?? -1]?.tool === 'bow') {
        bowCharge = Math.min(1, bowCharge + dt);
      } else if (bowCharge > 0.2 && ITEMS[held?.id ?? -1]?.tool === 'bow') {
        // Fire
        const arrowSlot = inv.slots.findIndex((s) => s && s.id === ItemId.Arrow);
        if (arrowSlot >= 0) {
          inv.slots[arrowSlot]!.count -= 1;
          if (inv.slots[arrowSlot]!.count <= 0) inv.slots[arrowSlot] = null;
          sound.bow();
          const dmg = 4 + bowCharge * 6;
          mobs.hitAt(player.x, player.y + EYE_HEIGHT, player.z, 20, player.yaw, player.pitch, dmg, sound);
          inv.setHeld(damageTool(held));
          hud.markDirty();
        }
        bowCharge = 0;
      } else {
        bowCharge = 0;
      }

      const move = movePlayer(player, world, wishX, wishZ, input.jump, dt);
      if (move.fallDamage > 0) hurtPlayer(move.fallDamage);

      if (player.onGround && (wishX || wishZ)) {
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

    if (!dead) {
      world.updateAround(player.x, player.z);
      waterAcc += dt;
      if (waterAcc > 0.3) { waterAcc = 0; tickWater(world, 40); markMesh(); }
      containers.tick(dt);
      mobs.trySpawn(world, player, dayTime, dt);
      mobs.update(world, player, dt, drops, sound, (d, kx, kz) => hurtPlayer(d, kx, kz));
      sound.ambient(dayTime, dt);

      const remeshed = world.remeshDirty(2);
      if (remeshed.length) markMesh();
      if (world.meshRevision !== lastMeshRev) {
        lastMeshRev = world.meshRevision;
        meshesDirty = true;
      }
      if (meshesDirty) { renderer.syncChunks(world, true); meshesDirty = false; }

      drops.update(dt, player, inv, groundY);
      renderer.syncDrops(drops.drops);
      renderer.syncMobs(mobs.mobs);
      hud.refreshHotbar();

      const hit = raycast(world, player);
      renderer.setOutline(invUi.isOpen() ? null : hit);

      if (!invUi.isOpen() && input.breakHeld && hit && ITEMS[inv.held()?.id ?? -1]?.tool !== 'bow') {
        const key = `${hit.x},${hit.y},${hit.z}`;
        if (breakTarget !== key) { breakTarget = key; breakAcc = 0; }
        const id = world.getBlock(hit.x, hit.y, hit.z);
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
      } else if (!input.breakHeld) {
        breakAcc = 0; breakTarget = null; hud.setBreakProgress(0);
      }

      if (!invUi.isOpen() && consumePlace(input) && hit) {
        const tid = world.getBlock(hit.x, hit.y, hit.z);
        if (tid === BlockId.CraftingTable) { invUi.openTable(); input.inventoryOpen = true; }
        else if (tid === BlockId.Chest) { invUi.openChest(containers.getChest(hit.x, hit.y, hit.z)); input.inventoryOpen = true; }
        else if (tid === BlockId.Furnace) { invUi.openFurnace(containers.getFurnace(hit.x, hit.y, hit.z)); input.inventoryOpen = true; }
        else if (tid === BlockId.Bed) { trySleep(hit.x, hit.y, hit.z); }
        else {
          const held = inv.held();
          if (held && ITEMS[held.id]?.armorSlot) {
            const left = inv.tryEquip(held);
            inv.setHeld(left);
            hud.markDirty();
          } else if (held && ITEMS[held.id]?.food && !ITEMS[held.id]?.placeBlock) {
            player.hunger = Math.min(20, player.hunger + (ITEMS[held.id].food ?? 0));
            held.count -= 1;
            if (held.count <= 0) inv.setHeld(null);
            sound.eat();
            hud.markDirty();
          } else {
            const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
            const taken = inv.takeOneFromSelected();
            if (taken) {
              const placeId = ITEMS[taken.id]?.placeBlock;
              const dest = world.getBlock(px, py, pz);
              if (placeId != null && (dest === BlockId.Air || dest === BlockId.Water)) {
                world.setBlock(px, py, pz, placeId);
                sound.placeBlock();
                markMesh();
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

boot().catch(console.error);
