import './style.css';
import { BlockId, BLOCKS, HOTBAR_DEFAULT } from './blocks/types';
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
import { setupTouchControls } from './ui/touch';
import { World } from './world/world';

const SENS = 0.0022;
const DAY_LEN = 600; // seconds for full day cycle

async function boot(): Promise<void> {
  const app = document.querySelector<HTMLElement>('#app')!;
  app.innerHTML = '';

  const world = new World(20261029);
  const renderer = new GameRenderer(app);
  const hud = createHud(app);
  const input = createInput();
  setupTouchControls(app, input);
  bindDesktopControls(renderer.canvas, input, (s) => hud.setSlot(s));

  let player = createPlayer(8.5, 40, 8.5);
  let dayTime = 0.28;
  let breakAcc = 0;
  let breakTarget: string | null = null;
  let lastSave = 0;
  let frames = 0;
  let fps = 0;
  let fpsT = performance.now();

  // Load or spawn
  try {
    const saved = await loadWorld();
    if (saved && saved.version === 1) {
      world.loadChunks(saved.chunks);
      player = createPlayer(saved.player.x, saved.player.y, saved.player.z);
      player.yaw = saved.player.yaw;
      player.pitch = saved.player.pitch;
      hud.setSlot(saved.hotbarSlot);
      dayTime = saved.dayTime;
    } else {
      world.updateAround(8, 8);
      for (let i = 0; i < 40; i++) world.remeshDirty(8);
      const spawn = world.findSpawn();
      player.x = spawn.x;
      player.y = spawn.y;
      player.z = spawn.z;
    }
  } catch {
    world.updateAround(8, 8);
    for (let i = 0; i < 40; i++) world.remeshDirty(8);
    const spawn = world.findSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
  }

  world.updateAround(player.x, player.z);
  for (let i = 0; i < 30; i++) world.remeshDirty(6);
  renderer.syncChunks(world);

  // Expose for playtest automation
  (window as unknown as { __BV: unknown }).__BV = {
    player,
    world,
    input,
    hud,
    getState: () => ({
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: player.pitch,
      onGround: player.onGround,
      slot: hud.slot,
      chunks: world.chunks.size,
      dayTime,
      fps,
    }),
    forceSave: () => saveWorld(world, player, hud.slot, dayTime),
    breakBlock: () => {
      const hit = raycast(world, player);
      if (hit) {
        world.setBlock(hit.x, hit.y, hit.z, BlockId.Air);
        world.remeshDirty(8);
        renderer.syncChunks(world);
        return true;
      }
      return false;
    },
    placeBlock: () => {
      const hit = raycast(world, player);
      if (!hit) return false;
      const px = hit.x + hit.nx;
      const py = hit.y + hit.ny;
      const pz = hit.z + hit.nz;
      const id = HOTBAR_DEFAULT[hud.slot] ?? BlockId.Dirt;
      world.setBlock(px, py, pz, id);
      world.remeshDirty(8);
      renderer.syncChunks(world);
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

    // Look
    const look = consumeLook(input);
    if (input.pointerLocked || input.touchLookActive || Math.abs(look.dx) + Math.abs(look.dy) > 0) {
      player.yaw -= look.dx * SENS;
      player.pitch -= look.dy * SENS;
      app.classList.add('playing');
    }

    // Move
    let wishX = 0;
    let wishZ = 0;
    if (input.right) wishX += 1;
    if (input.left) wishX -= 1;
    if (input.forward) wishZ -= 1;
    if (input.back) wishZ += 1;
    // Analog stick blend
    if (Math.abs(input.touchMoveX) > 0.05 || Math.abs(input.touchMoveY) > 0.05) {
      wishX = input.touchMoveX;
      wishZ = input.touchMoveY;
    }
    player.sneaking = input.sneak;
    player.sprinting = input.sprint && !input.sneak;

    movePlayer(player, world, wishX, wishZ, input.jump, dt);

    world.updateAround(player.x, player.z);
    const remeshed = world.remeshDirty(3);
    if (remeshed.length) renderer.syncChunks(world);

    // Raycast / break / place
    const hit = raycast(world, player);
    renderer.setOutline(hit);

    if (input.breakHeld && hit) {
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (breakTarget !== key) {
        breakTarget = key;
        breakAcc = 0;
      }
      const def = BLOCKS[world.getBlock(hit.x, hit.y, hit.z)];
      const need = def?.breakTime || 0.5;
      breakAcc += dt;
      hud.setBreakProgress(breakAcc / need);
      if (breakAcc >= need) {
        const id = world.getBlock(hit.x, hit.y, hit.z);
        if (id !== BlockId.Air && id !== BlockId.Water) {
          // Drop cobble if stone
          world.setBlock(hit.x, hit.y, hit.z, BlockId.Air);
          world.remeshDirty(6);
          renderer.syncChunks(world);
        }
        breakAcc = 0;
        breakTarget = null;
        hud.setBreakProgress(0);
      }
    } else {
      breakAcc = 0;
      breakTarget = null;
      hud.setBreakProgress(0);
    }

    if (consumePlace(input) && hit) {
      const px = hit.x + hit.nx;
      const py = hit.y + hit.ny;
      const pz = hit.z + hit.nz;
      // Don't place inside player
      const hw = 0.3;
      if (
        !(
          px + 1 > player.x - hw &&
          px < player.x + hw &&
          pz + 1 > player.z - hw &&
          pz < player.z + hw &&
          py + 1 > player.y &&
          py < player.y + 1.8
        )
      ) {
        const id = HOTBAR_DEFAULT[hud.slot] ?? BlockId.Dirt;
        if (world.getBlock(px, py, pz) === BlockId.Air || world.getBlock(px, py, pz) === BlockId.Water) {
          world.setBlock(px, py, pz, id);
          world.remeshDirty(6);
          renderer.syncChunks(world);
        }
      }
    }

    dayTime += dt / DAY_LEN;
    renderer.setDayTime(dayTime);
    renderer.updateCamera(player);
    renderer.render();

    hud.updateDebug(player, fps, world.chunks.size, dayTime);

    // Autosave every 15s
    if (now - lastSave > 15000) {
      lastSave = now;
      void saveWorld(world, player, hud.slot, dayTime);
    }
  };
  requestAnimationFrame(loop);

  // Save on hide
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void saveWorld(world, player, hud.slot, dayTime);
    }
  });
}

boot().catch(console.error);
