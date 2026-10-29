import './style.css';
import { BlockId, BLOCKS } from './blocks/types';
import { createAtlasCanvas } from './blocks/textures';
import { Inventory } from './items/inventory';
import { ITEMS, breakDuration, dropForBlock, damageTool } from './items/types';
import {
  bindDesktopControls,
  consumeLook,
  consumePlace,
  createInput,
} from './player/controls';
import { createPlayer, movePlayer } from './player/physics';
import { raycast } from './player/raycast';
import { GameRenderer } from './render/renderer';
import { loadWorld, saveWorld } from './storage/save';
import { createHud } from './ui/hud';
import { createInventoryUi } from './ui/inventory';
import { setupTouchControls } from './ui/touch';
import { DropSystem } from './world/drops';
import { World } from './world/world';
import { isSolid } from './blocks/types';
import { CHUNK_HEIGHT } from './world/chunk';

const SENS = 0.0022;
const DAY_LEN = 600;

async function boot(): Promise<void> {
  const app = document.querySelector<HTMLElement>('#app')!;
  app.innerHTML = '';

  const atlas = createAtlasCanvas();
  const world = new World(20261029);
  const renderer = new GameRenderer(app);
  const inv = new Inventory();
  const drops = new DropSystem();
  const hud = createHud(app, inv, renderer.getAtlas());
  const input = createInput();

  const doSave = () => saveWorld(world, player, inv, drops, dayTime);

  const invUi = createInventoryUi(app, inv, renderer.getAtlas(), () => {
    hud.refreshHotbar();
  });

  const toggleInv = () => {
    if (invUi.isOpen()) {
      invUi.close();
      input.inventoryOpen = false;
    } else {
      invUi.openPlayer();
      input.inventoryOpen = true;
      input.breakHeld = false;
    }
  };

  setupTouchControls(app, input);
  bindDesktopControls(renderer.canvas, input, (s) => hud.setSlot(s), toggleInv);

  let player = createPlayer(8.5, 40, 8.5);
  let dayTime = 0.28;
  let breakAcc = 0;
  let breakTarget: string | null = null;
  let lastSave = 0;
  let frames = 0;
  let fps = 0;
  let fpsT = performance.now();
  let hungerAcc = 0;

  try {
    const saved = await loadWorld();
    if (saved && (saved.version === 2 || (saved as { version: number }).version === 1)) {
      world.loadChunks(saved.chunks);
      player = createPlayer(saved.player.x, saved.player.y, saved.player.z);
      player.yaw = saved.player.yaw;
      player.pitch = saved.player.pitch;
      if (saved.version === 2) {
        player.health = saved.player.health;
        player.hunger = saved.player.hunger;
        inv.loadJSON(saved.inventory);
        drops.loadJSON(saved.drops);
      } else {
        inv.fillStarter();
      }
      hud.setSlot(saved.hotbarSlot);
      dayTime = saved.dayTime;
    } else {
      world.updateAround(8, 8);
      for (let i = 0; i < 40; i++) world.remeshDirty(8);
      const spawn = world.findSpawn();
      player.x = spawn.x;
      player.y = spawn.y;
      player.z = spawn.z;
      inv.fillStarter();
    }
  } catch {
    world.updateAround(8, 8);
    for (let i = 0; i < 40; i++) world.remeshDirty(8);
    const spawn = world.findSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    inv.fillStarter();
  }

  // If empty inventory (fresh), starter kit
  if (!inv.slots.some(Boolean)) inv.fillStarter();

  world.updateAround(player.x, player.z);
  for (let i = 0; i < 30; i++) world.remeshDirty(6);
  renderer.syncChunks(world);
  hud.refreshHotbar();
  hud.updateBars(player);

  const groundY = (x: number, z: number) => {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (isSolid(world.getBlock(Math.floor(x), y, Math.floor(z)))) return y + 1;
    }
    return 0;
  };

  (window as unknown as { __BV: unknown }).__BV = {
    player,
    world,
    input,
    hud,
    inv,
    drops,
    invUi,
    getState: () => ({
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: player.pitch,
      onGround: player.onGround,
      slot: inv.selected,
      chunks: world.chunks.size,
      dayTime,
      fps,
      health: player.health,
      hunger: player.hunger,
      invOpen: invUi.isOpen(),
      drops: drops.drops.length,
      held: inv.held()?.id ?? 0,
    }),
    forceSave: () => doSave(),
    openInv: () => {
      invUi.openPlayer();
      input.inventoryOpen = true;
    },
    openTable: () => {
      invUi.openTable();
      input.inventoryOpen = true;
    },
    closeInv: () => {
      invUi.close();
      input.inventoryOpen = false;
    },
    breakBlock: () => {
      const hit = raycast(world, player);
      if (!hit) return false;
      const id = world.getBlock(hit.x, hit.y, hit.z);
      if (id === BlockId.Air || id === BlockId.Water) return false;
      const drop = dropForBlock(id, inv.held());
      world.setBlock(hit.x, hit.y, hit.z, BlockId.Air);
      if (drop) drops.spawn(hit.x, hit.y, hit.z, drop);
      inv.setHeld(damageTool(inv.held()));
      world.remeshDirty(8);
      renderer.syncChunks(world);
      hud.refreshHotbar();
      return true;
    },
    placeBlock: () => {
      const hit = raycast(world, player);
      if (!hit) return false;
      const px = hit.x + hit.nx;
      const py = hit.y + hit.ny;
      const pz = hit.z + hit.nz;
      const taken = inv.takeOneFromSelected();
      if (!taken) return false;
      const placeId = ITEMS[taken.id]?.placeBlock;
      if (placeId == null) {
        inv.add(taken);
        return false;
      }
      world.setBlock(px, py, pz, placeId);
      world.remeshDirty(8);
      renderer.syncChunks(world);
      hud.refreshHotbar();
      return true;
    },
    look: (yaw: number, pitch: number) => {
      player.yaw = yaw;
      player.pitch = pitch;
    },
    teleport: (x: number, y: number, z: number) => {
      player.x = x;
      player.y = y;
      player.z = z;
    },
    setDay: (t: number) => {
      dayTime = t;
      renderer.setDayTime(t);
    },
    give: (id: number, n = 1) => {
      inv.add({ id, count: n, durability: ITEMS[id]?.maxDurability });
      hud.refreshHotbar();
    },
  };

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.canvas) app.classList.add('playing');
  });

  let prev = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    let dt = (now - prev) / 1000;
    prev = now;
    if (dt > 0.05) dt = 0.05;

    frames++;
    if (now - fpsT >= 500) {
      fps = (frames * 1000) / (now - fpsT);
      frames = 0;
      fpsT = now;
    }

    if (!invUi.isOpen()) {
      const look = consumeLook(input);
      if (input.pointerLocked || input.touchLookActive || Math.abs(look.dx) + Math.abs(look.dy) > 0) {
        player.yaw -= look.dx * SENS;
        player.pitch -= look.dy * SENS;
        app.classList.add('playing');
      }

      let wishX = 0;
      let wishZ = 0;
      if (input.right) wishX += 1;
      if (input.left) wishX -= 1;
      if (input.forward) wishZ -= 1;
      if (input.back) wishZ += 1;
      if (Math.abs(input.touchMoveX) > 0.05 || Math.abs(input.touchMoveY) > 0.05) {
        wishX = input.touchMoveX;
        wishZ = input.touchMoveY;
        if (Math.hypot(wishX, wishZ) > 0.85) input.sprint = true;
      }
      player.sneaking = input.sneak;
      player.sprinting = input.sprint && !input.sneak && input.forward;

      const move = movePlayer(player, world, wishX, wishZ, input.jump, dt);
      if (move.fallDamage > 0) {
        player.health = Math.max(0, player.health - move.fallDamage);
      }

      // Hunger drain
      hungerAcc += dt * (player.sprinting ? 0.15 : player.vx || player.vz ? 0.04 : 0.01);
      if (hungerAcc > 1) {
        hungerAcc = 0;
        if (player.hunger > 0) player.hunger = Math.max(0, player.hunger - 1);
        else player.health = Math.max(0, player.health - 1);
      }
      if (player.hunger > 16 && player.health < 20) {
        player.health = Math.min(20, player.health + dt * 0.5);
      }
    }

    world.updateAround(player.x, player.z);
    const remeshed = world.remeshDirty(3);
    if (remeshed.length) renderer.syncChunks(world);

    drops.update(dt, player, inv, groundY);
    renderer.syncDrops(drops.drops);
    hud.refreshHotbar();

    const hit = raycast(world, player);
    renderer.setOutline(invUi.isOpen() ? null : hit);

    if (!invUi.isOpen() && input.breakHeld && hit) {
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (breakTarget !== key) {
        breakTarget = key;
        breakAcc = 0;
      }
      const id = world.getBlock(hit.x, hit.y, hit.z);
      const need = breakDuration(id, inv.held());
      breakAcc += dt;
      hud.setBreakProgress(need > 0 ? breakAcc / need : 1);
      if (need > 0 && breakAcc >= need) {
        if (id !== BlockId.Air && id !== BlockId.Water) {
          const drop = dropForBlock(id, inv.held());
          world.setBlock(hit.x, hit.y, hit.z, BlockId.Air);
          if (drop) drops.spawn(hit.x, hit.y, hit.z, drop);
          inv.setHeld(damageTool(inv.held()));
          world.remeshDirty(6);
          renderer.syncChunks(world);
          hud.refreshHotbar();
        }
        breakAcc = 0;
        breakTarget = null;
        hud.setBreakProgress(0);
      }
    } else if (!input.breakHeld) {
      breakAcc = 0;
      breakTarget = null;
      hud.setBreakProgress(0);
    }

    if (!invUi.isOpen() && consumePlace(input) && hit) {
      // Interact with crafting table
      const tid = world.getBlock(hit.x, hit.y, hit.z);
      if (tid === BlockId.CraftingTable) {
        invUi.openTable();
        input.inventoryOpen = true;
      } else {
        const px = hit.x + hit.nx;
        const py = hit.y + hit.ny;
        const pz = hit.z + hit.nz;
        const hw = 0.3;
        const inside =
          px + 1 > player.x - hw &&
          px < player.x + hw &&
          pz + 1 > player.z - hw &&
          pz < player.z + hw &&
          py + 1 > player.y &&
          py < player.y + 1.8;
        if (!inside) {
          const taken = inv.takeOneFromSelected();
          if (taken) {
            const placeId = ITEMS[taken.id]?.placeBlock;
            const dest = world.getBlock(px, py, pz);
            if (placeId != null && (dest === BlockId.Air || dest === BlockId.Water)) {
              world.setBlock(px, py, pz, placeId);
              world.remeshDirty(6);
              renderer.syncChunks(world);
            } else {
              inv.add(taken);
            }
            hud.refreshHotbar();
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

    if (now - lastSave > 15000) {
      lastSave = now;
      void doSave();
    }
  };
  requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void doSave();
  });
}

boot().catch(console.error);
