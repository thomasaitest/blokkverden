import './style.css';
import { BlockId, isSolid, BLOCKS, isReplaceable, isFlower } from './blocks/types';
import { createAtlasCanvas, tileUV, ATLAS_W, ATLAS_H, averageTileColor } from './blocks/textures';
import { Inventory } from './items/inventory';
import { updateGravityAround, needsSupportBelow } from './world/gravity';
import { canPlantSapling, growOak, SAPLING_GROW_CHANCE, SAPLING_MIN_LIGHT } from './world/saplings';
import { LeafDecay, LEAF_PERSISTENT } from './world/leafdecay';
import { type ItemStack, ITEMS, breakDuration, dropForBlock, damageTool, armorPoints, ItemId, blockMaterial, miningPenalty } from './items/types';
import { bindDesktopControls, consumeLook, consumePlace, createInput } from './player/controls';
import { createPlayer, movePlayer, EYE_HEIGHT, headInSolid } from './player/physics';
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
import { CHUNK_HEIGHT, CHUNK_SIZE } from './world/chunk';
import { tickWater } from './world/water';
import { applyBoneMeal, boneMealTarget } from './world/bonemeal';
import { canPlaceDoor, doorFacingFromYaw, DOOR_FACING_SHIFT, doorFacing } from './world/doors';
import { SoundBus } from './audio/sound';
import { MobSystem } from './mobs/system';
import { XpSystem } from './world/xp';
import { ProjectileSystem } from './world/projectiles';
import { BoatSystem } from './world/boats';
import { plantCrop, harvestCrop, hoeDirt, setCropStage, tickCrops } from './world/crops';
import { loadSettings, saveSettings, type GameSettings } from './settings';
import type { MobKind } from './mobs/types';
import { WeatherSystem } from './world/weather';
import { FishingSystem } from './world/fishing';
import { tryPlaceStructures, skipStructures, resetStructures, structuresToJSON } from './world/structures';
import { createByttebonde, createTraderRig, tryTrade, type Byttebonde } from './mobs/trader';
import { renderMapCanvas } from './world/mapitem';
import { MusicBus } from './audio/music';
import { RedstoneSystem } from './world/redstone';
import { ParticleSystem } from './world/particles';
import { AchievementBus } from './ui/achievements';
import { openCreativeInventory } from './ui/creative';
import { lightPortal, buildPortalFrame, type DimId } from './world/helvete';

const DAY_LEN = 900; // ~15 min day cycle (MC is 20)

function qs(): URLSearchParams {
  return new URLSearchParams(location.search);
}

async function boot(): Promise<void> {
  const app = document.querySelector<HTMLElement>('#app')!;
  app.innerHTML = '';
  const testMode = qs().get('test') === '1' || qs().get('test') === 'true';
  let settings = loadSettings();

  const startGame = async (worldName: string, seed?: number, fresh = false, creative = false) => {
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
    }, creative);
  };

  const title = createTitleMenu(app, {
    onPlay: (name, seed, fresh, creative) => { void startGame(name, seed, !!fresh, !!creative); },
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
  creativeMode = false,
): Promise<void> {
  setViewRadius(settings.renderDistance);
  // Session lifetime: quitting to title must stop the loop, listeners and autosave of this
  // world (a zombie session kept rendering and later saved stale state over the reopened world).
  const life = new AbortController();
  const gameActive = () => !life.signal.aborted;
  const sig = { signal: life.signal };
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
  const weather = new WeatherSystem();
  const fishing = new FishingSystem();
  const music = new MusicBus();
  music.setVolume(settings.volume);
  if (settings.music) music.start();
  const traders: Byttebonde[] = [];
  const traderMeshes: ReturnType<typeof createTraderRig>[] = [];
  let structuresAcc = 0;
  let mapOpen = false;
  const mapOverlay = document.createElement('canvas');
  mapOverlay.width = 256; mapOverlay.height = 256;
  mapOverlay.id = 'map-overlay';
  mapOverlay.style.cssText = 'display:none;position:absolute;right:16px;top:16px;width:220px;height:220px;border:3px solid #5a3a1a;image-rendering:pixelated;z-index:30;background:#222';
  app.appendChild(mapOverlay);
  const tradeUi = document.createElement('div');
  tradeUi.id = 'trade-ui';
  tradeUi.style.cssText = 'display:none;position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);background:rgba(20,20,20,0.92);color:#eee;padding:16px;border:2px solid #8b5a2b;z-index:40;min-width:280px';
  app.appendChild(tradeUi);
  const hud = createHud(app, inv, renderer.getAtlas());
  if (testMode) hud.setHintVisible(false);
  else hud.setHintVisible(!!settings.showHints);
  const clickLook = document.createElement('div');
  clickLook.id = 'click-look';
  clickLook.textContent = 'Klikk for å se rundt · WASD for å gå · Esc = pause';
  clickLook.style.cssText = 'display:none;position:fixed;left:50%;top:18%;transform:translateX(-50%);background:rgba(0,0,0,0.55);color:#fff;padding:10px 16px;border-radius:8px;z-index:25;pointer-events:none;font-size:14px;text-align:center;';
  app.appendChild(clickLook);
  const redstone = new RedstoneSystem();
  const particles = new ParticleSystem(renderer.scene);
  const achieve = new AchievementBus(app);
  let dimension: DimId = 'overworld';
  let portalCooldown = 0;
  let owReturn = { x: 8.5, y: 40, z: 8.5 };
  /** Helvete transit: enabled once dual-store round-trip is verified. */
  let helveteTransit = true;
  let creativeOpen: { close: () => void } | null = null;
  // creative applied after player create
  const input = createInput();
  (window as any).__bvEarly = true;

  let player = createPlayer(8.5, 40, 8.5);
  if (creativeMode) { player.creative = true; player.flying = true; }
  let dayTime = 0.28;
  let breakAcc = 0;
  let breakTarget: string | null = null;
  let lastSave = 0;
  let frames = 0, fps = 0, fpsT = performance.now();
  let hungerAcc = 0, waterAcc = 0, cropAcc = 0, starveAcc = 0;
  let jumpTapAge = 0;
  let eatTimer = 0, eatSoundAcc = 0;
  const EAT_TIME = 1.6;
  let respawn = { x: 8.5, y: 40, z: 8.5 };
  let dead = false;
  let attackCool = 0;
  let bowCharge = 0;
  let flyTap = 0;
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
  // MC-style action-bar message above the hotbar (bed feedback etc.)
  const actionBar = document.createElement('div');
  actionBar.id = 'action-bar';
  app.appendChild(actionBar);
  let actionBarT: ReturnType<typeof setTimeout> | null = null;
  function showActionBar(text: string): void {
    actionBar.textContent = text;
    actionBar.style.opacity = '1';
    if (actionBarT) clearTimeout(actionBarT);
    actionBarT = setTimeout(() => { actionBar.style.opacity = '0'; }, 2500);
  }

  const deathEl = document.createElement('div');
  deathEl.id = 'death-screen';
  deathEl.innerHTML = `<div><h1>Du døde</h1><button type="button" id="btn-respawn">Gjenoppstå</button></div>`;
  deathEl.style.display = 'none';
  app.appendChild(deathEl);

  const doSave = () => saveWorldNamed(worldName, world, player, inv, drops, containers, dayTime, respawn, xp.toJSON(), structuresToJSON(), leafDecay.toJSON());
  const leafDecay = new LeafDecay();
  let suffocateAcc = 0;
  // MC: with your head inside a block you see that block's texture (darkened), not through the world
  const inBlockOverlay = document.createElement('div');
  inBlockOverlay.id = 'in-block-overlay';
  inBlockOverlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;display:none;image-rendering:pixelated;background-size:25vmin 25vmin;filter:brightness(0.3);';
  document.body.appendChild(inBlockOverlay);
  const inBlockUrls = new Map<number, string>();
  let inBlockAtlas: HTMLCanvasElement | null = null;
  let inBlockShown = -1;
  const updateInBlockOverlay = () => {
    const id = headInSolid(world, player.x, player.y, player.z)
      ? world.getBlock(Math.floor(player.x), Math.floor(player.y + EYE_HEIGHT), Math.floor(player.z)) : -1;
    if (id === inBlockShown) return;
    inBlockShown = id;
    if (id < 0) { inBlockOverlay.style.display = 'none'; return; }
    let url = inBlockUrls.get(id);
    if (!url) {
      inBlockAtlas ??= createAtlasCanvas();
      const uv = tileUV(BLOCKS[id]?.tiles.side ?? 0);
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      c.getContext('2d')!.drawImage(inBlockAtlas, uv.u0 * ATLAS_W, uv.v0 * ATLAS_H, 16, 16, 0, 0, 16, 16);
      url = c.toDataURL();
      inBlockUrls.set(id, url);
    }
    inBlockOverlay.style.backgroundImage = `url(${url})`;
    inBlockOverlay.style.display = 'block';
  };
  // MC: break particles take the colour of the broken block's texture (was always brown)
  const particleColors = new Map<number, number>();
  let particleAtlasData: Uint8ClampedArray | null = null;
  const blockParticleColor = (id: number): number => {
    let c = particleColors.get(id);
    if (c === undefined) {
      try {
        if (!particleAtlasData) {
          const a = renderer.getAtlas();
          particleAtlasData = a.getContext('2d')!.getImageData(0, 0, a.width, a.height).data;
        }
        c = averageTileColor(particleAtlasData, ATLAS_W, BLOCKS[id]?.tiles.side ?? 0);
      } catch { c = 0x8b6914; }
      particleColors.set(id, c);
    }
    return c;
  };
  (window as unknown as { __bvParticleColor?: (id: number) => number }).__bvParticleColor = blockParticleColor;
  const markMesh = () => { meshesDirty = true; renderer.markChunksDirty(); };
  let saplingChance = SAPLING_GROW_CHANCE;
  /** Scan chunks near the player for saplings; each grows with saplingChance per tick. */
  const tickSaplings = (): boolean => {
    let grew = false;
    const pcx = Math.floor(player.x / CHUNK_SIZE), pcz = Math.floor(player.z / CHUNK_SIZE);
    for (const c of world.chunks.values()) {
      if (Math.abs(c.cx - pcx) > 3 || Math.abs(c.cz - pcz) > 3) continue;
      const b = c.blocks;
      for (let i = 0; i < b.length; i++) {
        if (b[i] !== BlockId.Sapling) continue;
        if (Math.random() >= saplingChance) continue;
        // decode index → local coords (Chunk.index = lx + lz*S + y*S*S)
        const lx = i % CHUNK_SIZE, lz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE, ly = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
        const wx = c.cx * CHUNK_SIZE + lx, wz = c.cz * CHUNK_SIZE + lz;
        if (world.getLight(wx, ly, wz) < SAPLING_MIN_LIGHT) continue;
        if (growOak(world, wx, ly, wz, Math.random, CHUNK_HEIGHT - 1)) grew = true;
      }
    }
    return grew;
  };
  // MC explosions: containers spill, chunks remesh, smoke puff
  mobs.takeContainer = (x, y, z) => { const c = containers.contentsAt(x, y, z); containers.removeAt(x, y, z); return c; };
  mobs.onBlast = (x, y, z, blocks) => {
    particles.burst(x, y, z, 0x555555, 40, 'break');
    // MC: sand over the crater falls; blasted trees shed their leaves
    for (const b of blocks) {
      if (b.id === BlockId.Log || b.id === BlockId.Leaves) leafDecay.onRemoved(world, b.x, b.y, b.z);
      updateGravityAround(world, b.x, b.y, b.z, (gx, gy, gz, gid) => { const gd = dropForBlock(gid, null); if (gd) drops.spawn(gx, gy, gz, gd); });
    }
    if (blocks.length) { markMesh(); hud.markDirty(); }
  };

  const applySettings = (s: GameSettings) => {
    settings = s;
    setViewRadius(s.renderDistance);
    renderer.applySettings(s.renderDistance, s.fov);
    sound.setVolume(s.volume);
    music.setVolume(s.volume);
    if (s.music) music.start(); else music.stop();
    if (testMode) hud.setHintVisible(false);
    else hud.setHintVisible(!!s.showHints);
    sens = 0.0022 * s.sensitivity;
    onSettings(s);
  };

  const openTrade = (tr: Byttebonde) => {
    tradeUi.style.display = 'block';
    tradeUi.innerHTML = '<h3>Byttebonde</h3>';
    for (const o of tr.offers) {
      const row = document.createElement('button');
      row.type = 'button';
      row.style.cssText = 'display:block;width:100%;margin:6px 0;padding:8px;text-align:left';
      const wn = ITEMS[o.want.id]?.name ?? o.want.id;
      const gn = ITEMS[o.give.id]?.name ?? o.give.id;
      row.textContent = `${o.want.count}× ${wn} → ${o.give.count}× ${gn}`;
      row.onclick = () => {
        if (tryTrade(inv, o.want, o.give)) { hud.markDirty(); hud.refreshHotbar(); sound.placeBlock(); }
      };
      tradeUi.appendChild(row);
    }
    const close = document.createElement('button');
    close.textContent = 'Lukk';
    close.onclick = () => { tradeUi.style.display = 'none'; };
    tradeUi.appendChild(close);
  };

  const syncTraders = () => {
    while (traderMeshes.length < traders.length) {
      const g = createTraderRig();
      renderer.scene.add(g);
      traderMeshes.push(g);
    }
    for (let i = 0; i < traderMeshes.length; i++) {
      const g = traderMeshes[i];
      if (i >= traders.length) { g.visible = false; continue; }
      const tr = traders[i];
      g.visible = true;
      g.position.set(tr.x, tr.y, tr.z);
      g.rotation.y = tr.yaw;
    }
  };

  let endSession: () => Promise<void> = async () => { /* set once the loop is running */ };
  const pause = createPauseMenu(app, {
    onResume: () => {
      paused = false;
      pause.hide();
      try { renderer.canvas.focus({ preventScroll: true }); } catch { renderer.canvas.focus(); }
      // Re-acquire look immediately from the resume click (user gesture).
      try { renderer.canvas.requestPointerLock(); } catch { /* drag-look fallback in controls */ }
    },
    onSettingsChange: applySettings,
    onQuit: () => { void endSession().then(onQuit); },
  });

  const invUi = createInventoryUi(app, inv, renderer.getAtlas(), () => {
    hud.markDirty(); hud.refreshHotbar();
  }, (s) => throwFromPlayer(s), (onTable) => { if (onTable) achieve.grant('first_craft'); });
  /** MC: closing a container screen returns straight to the game (mouse recaptured). */
  const relock = () => {
    try { renderer.canvas.focus({ preventScroll: true }); } catch { renderer.canvas.focus(); }
    try {
      const r = renderer.canvas.requestPointerLock() as unknown;
      if (r && typeof (r as Promise<void>).then === 'function') (r as Promise<void>).catch(() => { /* click-to-look overlay */ });
    } catch { /* click-to-look overlay */ }
  };
  const closeScreens = (): boolean => {
    if (creativeOpen) { creativeOpen.close(); creativeOpen = null; input.inventoryOpen = false; relock(); return true; }
    if (invUi.isOpen() || input.inventoryOpen) { invUi.close(); input.inventoryOpen = false; relock(); return true; }
    return false;
  };
  const toggleInv = () => {
    if (dead || paused) return;
    if (closeScreens()) return;
    if (player.creative) {
      creativeOpen = openCreativeInventory(app, inv, renderer.getAtlas(), () => { hud.markDirty(); hud.refreshHotbar(); });
      input.inventoryOpen = true; input.breakHeld = false;
      return;
    }
    invUi.openPlayer(); input.inventoryOpen = true; input.breakHeld = false;
  };
  let autoPauseAt = -1e9;
  const togglePause = () => {
    if (dead) return;
    if (closeScreens()) return;
    // Lock loss already opened the menu for this same Esc press — don't toggle it shut.
    if (paused && performance.now() - autoPauseAt < 400) return;
    paused = !paused;
    if (paused) { pause.show(); document.exitPointerLock(); }
    else pause.hide();
  };

  // Chrome (headed) swallows the Esc keydown that exits pointer lock, and Cmd+Tab /
  // window switches drop the lock too. MC opens the Game Menu on focus loss.
  document.addEventListener('pointerlockchange', () => {
    if (!gameActive()) return;
    if (document.pointerLockElement === renderer.canvas) return;
    if (paused || dead || input.inventoryOpen || creativeOpen || !gameActive()) return;
    paused = true; autoPauseAt = performance.now(); pause.show();
  }, sig);
  const unbindTouch = setupTouchControls(app, input, { onInventory: toggleInv, onPause: togglePause });
  const unbindDesktop = bindDesktopControls(renderer.canvas, input, (s) => hud.setSlot(s), toggleInv);
  renderer.canvas.addEventListener('pointerdown', () => sound.unlock());
  try { renderer.canvas.focus({ preventScroll: true }); } catch { renderer.canvas.focus(); }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { e.preventDefault(); togglePause(); }
    // MC: Q drops one of the held item, Ctrl+Q the whole stack.
    if (e.code === 'KeyQ' && !e.repeat && !dead && !paused && !input.inventoryOpen) {
      e.preventDefault();
      dropHeld(e.ctrlKey || e.metaKey);
    }
  }, sig);
  function throwFromPlayer(s: ItemStack): void {
    const cy = Math.cos(player.pitch);
    const dx = -Math.sin(player.yaw) * cy, dz = -Math.cos(player.yaw) * cy, dy = Math.sin(player.pitch);
    drops.throwItem(player.x + dx * 0.3, player.y + 1.3, player.z + dz * 0.3, dx * 4, dy * 4 + 2, dz * 4, s, 2);
  }
  function dropHeld(all: boolean): void {
    const h = inv.held();
    if (!h) return;
    const n = all ? h.count : 1;
    throwFromPlayer({ ...h, count: n });
    if (h.count - n <= 0) inv.setHeld(null); else inv.setHeld({ ...h, count: h.count - n });
    hud.markDirty(); hud.refreshHotbar();
  }

  // Load / fresh
  resetStructures(); // per-world (was leaking across worlds + lost on reload → re-stamped villages)
  if (!fresh) {
    try {
      const saved = await loadWorldNamed(worldName);
      if (saved && saved.version >= 2) {
        world.loadChunks(saved.chunks);
        // Old saves (pre-it12) have no list: treat every saved chunk as already stamped.
        resetStructures(saved.structures ?? saved.chunks.map((c) => `${c.cx},${c.cz}`));
        leafDecay.loadJSON(saved.leafDecay);
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
    // Minecraft survival: start with an empty inventory (punch a tree first).
    if (player.creative) inv.fillStarter();
  }

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

  function hurtPlayer(dmg: number, kx = 0, kz = 0, bypassArmor = false): void {
    if (dead) return;
    // MC: armour reduces mob/attack damage, not fall damage or starvation.
    const armor = bypassArmor ? 0 : armorPoints(inv.armor);
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
    if (invUi.isOpen()) { invUi.close(); input.inventoryOpen = false; }
    // MC: inventory + armour scatter as item entities where you died.
    const scatter = (s: ItemStack) => {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2;
      drops.throwItem(player.x, player.y + 0.6, player.z, Math.cos(a) * v, 3 + Math.random() * 2, Math.sin(a) * v, s, 0.5);
    };
    for (let i = 0; i < 36; i++) {
      const s = inv.slots[i];
      if (s) scatter(s);
      inv.slots[i] = null;
    }
    for (let i = 0; i < inv.armor.length; i++) {
      const s = inv.armor[i];
      if (s) scatter(s);
      inv.armor[i] = null;
    }
    hud.markDirty(); hud.refreshHotbar(); updateArmorUi();
  }
  function respawnPlayer(): void {
    dead = false;
    deathEl.style.display = 'none';
    player.health = 20; player.hunger = 20; player.air = 20;
    player.x = respawn.x; player.y = respawn.y; player.z = respawn.z;
    player.vx = player.vy = player.vz = 0;
    if (player.creative) inv.fillStarter();
    hud.markDirty(); hud.refreshHotbar(); updateArmorUi();
  }
  deathEl.querySelector('#btn-respawn')!.addEventListener('click', () => { respawnPlayer(); relock(); });

  function trySleep(hx: number, hy: number, hz: number): boolean {
    // MC (Java 1.15+): using a bed always sets the respawn point, even when you can't sleep.
    const bedSpawn = { x: hx + 0.5, y: hy + 1, z: hz + 0.5 };
    const changed = respawn.x !== bedSpawn.x || respawn.y !== bedSpawn.y || respawn.z !== bedSpawn.z;
    respawn = bedSpawn;
    const night = dayTime < 0.25 || dayTime > 0.75;
    if (!night) { showActionBar(changed ? 'Gjenopplivingspunkt satt · Du kan bare sove om natten' : 'Du kan bare sove om natten'); return false; }
    if (mobs.mobs.some((m) => m.hostile && Math.hypot(m.x - player.x, m.y - player.y, m.z - player.z) < 8)) {
      showActionBar('Du kan ikke hvile nå, det er monstre i nærheten');
      return false;
    }
    dayTime = 0.28;
    renderer.setDayTime(dayTime);
    player.x = respawn.x; player.y = respawn.y; player.z = respawn.z;
    showActionBar('God morgen!');
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
    leafDecayPending: () => leafDecay.pending.length,
    /** Test setup only: speed up sapling growth (MC bone-meal stand-in). */
    setSaplingChance: (c: number) => { saplingChance = c; },
    openInv: () => { invUi.openPlayer(); input.inventoryOpen = true; },
    closeInv: () => { invUi.close(); input.inventoryOpen = false; },
    look: (y: number, p: number) => { player.yaw = y; player.pitch = p; },
    targetHit: () => raycast(world, player),
    particleCount: () => particles.count(),

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
      let slot = inv.slots.findIndex((s) => s && s.id === id);
      if (slot >= 9) {
        // Swap into hotbar so the item is immediately usable
        const cur = inv.selected;
        const tmp = inv.slots[cur];
        inv.slots[cur] = inv.slots[slot];
        inv.slots[slot] = tmp;
        slot = cur;
      }
      if (slot >= 0 && slot < 9) inv.selected = slot;
      hud.markDirty(); hud.refreshHotbar();
    },
    /** Break the looked-at block instantly (test helper). */
    breakLooking: () => {
      const hit = raycast(world, player);
      if (!hit) return false;
      const id = world.getBlock(hit.x, hit.y, hit.z);
      if (id === BlockId.Air || id === BlockId.Water || id === BlockId.Lava) return false;
      const drop = dropForBlock(id, inv.held());
      world.setBlock(hit.x, hit.y, hit.z, BlockId.Air);
      if (drop) drops.spawn(hit.x, hit.y, hit.z, drop);
      markMesh();
      return true;
    },
    /** Place held block on the looked-at face (test helper). */
    placeLooking: () => {
      const hit = raycast(world, player);
      if (!hit) return false;
      const taken = inv.takeOneFromSelected();
      if (!taken) return false;
      const placeId = ITEMS[taken.id]?.placeBlock;
      const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
      const hw = 0.3, ph = player.sneaking ? 1.5 : 1.8;
      const intersectsPlayer = !(
        px + 1 <= player.x - hw || px >= player.x + hw ||
        py + 1 <= player.y || py >= player.y + ph ||
        pz + 1 <= player.z - hw || pz >= player.z + hw
      );
      if (placeId == null || intersectsPlayer || (world.getBlock(px, py, pz) !== BlockId.Air && world.getBlock(px, py, pz) !== BlockId.Water)) {
        inv.add(taken);
        return false;
      }
      world.setBlock(px, py, pz, placeId);
      if (player.creative) inv.add(taken);
      markMesh();
      return true;
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
      const y = Math.floor(player.y) - 1;
      // Axis-aligned 7×7 pond in front of player for a clear waterline
      const ox = Math.floor(player.x + fx * 5);
      const oz = Math.floor(player.z + fz * 5);
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        const x = ox + dx, z = oz + dz;
        world.setBlock(x, y, z, BlockId.Dirt);
        world.setBlock(x, y + 1, z, BlockId.Water);
        world.setWater(x, y + 1, z, 7);
        world.setBlock(x, y + 2, z, BlockId.Air);
        world.setBlock(x, y + 3, z, BlockId.Air);
      }
      const bx = ox + 0.5, bz = oz + 0.5;
      const b = boats.place(bx, y + 1.88, bz);
      b.yaw = player.yaw;
      const surf = boats.waterSurfaceY(world, bx, bz, y + 2);
      b.y = (surf ?? (y + 2)) - 0.12;
      player.pitch = -0.45;
      // Stay within mount range (~2.8) so tryMount works immediately
      player.x = bx - fx * 1.6; player.z = bz - fz * 1.6; player.y = y + 2.4;
      player.vx = player.vy = player.vz = 0;
      api.lookAt(bx, b.y + 0.15, bz);
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
    setWeather: (kind: 'clear' | 'rain' | 'snow' | 'thunder', intensity = 0.8) => { weather.set(kind, intensity); },
    stageMobs: () => {
      api.clearMobs();
      const kinds: MobKind[] = ['gris', 'ku', 'sau', 'høne', 'vandrer', 'bueskytt', 'vever', 'knallbolle'];
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      const rx = -fz, rz = fx;
      kinds.forEach((k, i) => {
        const side = (i - (kinds.length - 1) / 2) * 1.35;
        api.spawnMob(k, fx * 5 + rx * side, 0, fz * 5 + rz * side);
      });
      player.pitch = -0.18;
    },
    stageVillage: () => {
      const cx = Math.floor(player.x / CHUNK_SIZE), cz = Math.floor(player.z / CHUNK_SIZE);
      tryPlaceStructures(world, containers, cx, cz);
      tryPlaceStructures(world, containers, cx + 1, cz);
      const ox = Math.floor(player.x) + 4, oz = Math.floor(player.z) + 4;
      let y = 40;
      for (let yy = 70; yy > 20; yy--) {
        const id = world.getBlock(ox, yy, oz);
        if (id === BlockId.Grass || id === BlockId.Sand || id === BlockId.Dirt || id === BlockId.SnowGrass) { y = yy; break; }
      }
      for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 5; dz++) {
        world.setBlock(ox + dx, y, oz + dz, BlockId.Cobble);
        for (let dy = 1; dy <= 3; dy++) {
          const wall = dx === 0 || dx === 4 || dz === 0 || dz === 4;
          world.setBlock(ox + dx, y + dy, oz + dz, wall ? BlockId.Planks : BlockId.Air);
        }
        world.setBlock(ox + dx, y + 4, oz + dz, BlockId.Log);
      }
      world.setBlock(ox + 2, y + 1, oz, BlockId.Air);
      world.setBlock(ox + 2, y + 2, oz, BlockId.Air);
      world.setBlock(ox, y + 2, oz + 2, BlockId.Glass);
      if (traders.length === 0) traders.push(createByttebonde(ox + 2.5, y + 1, oz + 2.5));
      markMesh();
      api.lookAt(ox + 2.5, y + 2, oz + 2.5);
      return { x: ox, y, z: oz };
    },
    stageDungeon: () => {
      const ox = Math.floor(player.x) + 6, oz = Math.floor(player.z) + 2;
      const y = Math.max(12, Math.floor(player.y) - 8);
      for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 5; dy++) for (let dz = 0; dz < 7; dz++) {
        const wall = dx === 0 || dy === 0 || dz === 0 || dx === 6 || dy === 4 || dz === 6;
        world.setBlock(ox + dx, y + dy, oz + dz, wall ? BlockId.Cobble : BlockId.Air);
      }
      world.setBlock(ox + 3, y + 1, oz + 3, BlockId.MobSpawner);
      world.setBlock(ox + 1, y + 1, oz + 1, BlockId.Chest);
      const chest = containers.getChest(ox + 1, y + 1, oz + 1);
      chest[0] = { id: ItemId.GoldIngot, count: 2 };
      chest[1] = { id: ItemId.Diamond, count: 1 };
      chest[2] = { id: ItemId.IronSword, count: 1, durability: 250 };
      world.setBlock(ox + 3, y + 1, oz + 5, BlockId.Torch);
      for (let i = 0; i < 8; i++) world.setBlock(ox + 3, y + 1 + i, oz - 1 - i, BlockId.Cobble);
      markMesh();
      player.x = ox + 3.5; player.y = y + 1.1; player.z = oz + 3.5;
      api.lookAt(ox + 3.5, y + 1.5, oz + 3.5);
      return { x: ox, y, z: oz };
    },
    castFish: (opts?: { forceBite?: boolean }) => {
      // Never auto-force just because ?test=1 — callers must opt in
      fishing.forceInstantBite = !!(opts && opts.forceBite);
      return fishing.start(player.x, player.y, player.z, player.yaw, player.pitch, world);
    },
    reelFish: () => {
      const got = fishing.reel();
      if (got) { inv.add(got); hud.markDirty(); hud.refreshHotbar(); }
      return got;
    },
    fishWaitBite: (maxSec = 6) => fishing.advanceUntilBite(maxSec),
    fishState: () => ({ casting: fishing.casting, bite: fishing.bite, timer: fishing.timer }),
    mountBoat: () => boats.tryMount(player),
    dismountBoat: () => { boats.dismount(player); },
    boatState: () => ({
      mounted: boats.mounted,
      count: boats.boats.length,
      boat: boats.getMounted() ?? boats.boats[0] ?? null,
    }),
    openMap: () => {
      mapOpen = true;
      mapOverlay.style.display = 'block';
      renderMapCanvas(mapOverlay, world, world.noise, player.x, player.z);
    },
    closeMap: () => { mapOpen = false; mapOverlay.style.display = 'none'; },
    openTrade: () => { if (traders[0]) openTrade(traders[0]); },
    getPerf: () => renderer.getPerfStats(),
    setSectorMerge: (on: boolean) => renderer.setSectorMerge(on),
    setCreative: (on: boolean) => { player.creative = on; player.flying = on; },
    spawnWolf: () => {
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      const x = player.x + fx * 3, z = player.z + fz * 3;
      const y = Math.floor(player.y);
      return mobs.spawn('ulv', x, y, z);
    },
    tameWolf: () => {
      api.give(ItemId.Bone, 1);
      const w = mobs.nearest('ulv', player.x, player.y, player.z, 16);
      if (w) {
        player.x = w.x + 0.8; player.y = w.y; player.z = w.z + 0.8;
        player.vx = player.vy = player.vz = 0;
      }
      return mobs.interactWolf(player, true);
    },
    wolfState: () => {
      const w = mobs.nearest('ulv', player.x, player.y, player.z, 12);
      return w ? { id: w.id, tamed: !!w.tamed, sitting: !!w.sitting, x: w.x, y: w.y, z: w.z } : null;
    },
    stageBoat: () => {
      const b = api.placeBoatFront();
      return b;
    },
    stageRedstone: () => {
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      const bx = Math.floor(player.x + fx * 2), bz = Math.floor(player.z + fz * 2);
      const by = Math.floor(player.y);
      world.setBlock(bx, by, bz, BlockId.Lever);
      for (let i = 1; i <= 5; i++) world.setBlock(bx + Math.round(fx * i), by, bz + Math.round(fz * i), BlockId.RedDust);
      world.setBlock(bx + Math.round(fx * 6), by, bz + Math.round(fz * 6), BlockId.Lamp);
      world.setBlock(bx + Math.round(fx * 7), by, bz + Math.round(fz * 7), BlockId.Door);
      markMesh();
      api.lookAt(bx + fx * 3, by + 0.5, bz + fz * 3);
    },
    setSignText: (x: number, y: number, z: number, text: string) => {
      (world as unknown as { _signs?: Map<string, string> })._signs ??= new Map();
      (world as unknown as { _signs: Map<string, string> })._signs.set(`${x},${y},${z}`, text.slice(0, 48));
      world.setBlock(x, y, z, BlockId.Sign);
      markMesh();
    },
    stageBuild: () => {
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      const ox = Math.floor(player.x + fx * 3), oz = Math.floor(player.z + fz * 3);
      const oy = Math.floor(player.y);
      world.setBlock(ox, oy, oz, BlockId.Stairs);
      world.setBlock(ox + 1, oy, oz, BlockId.Slab);
      world.setBlock(ox + 2, oy, oz, BlockId.Fence);
      world.setBlock(ox + 3, oy, oz, BlockId.GlassPane);
      world.setBlock(ox + 4, oy, oz, BlockId.Ladder);
      world.setBlock(ox + 5, oy, oz, BlockId.Door);
      world.setBlock(ox + 6, oy, oz, BlockId.Sign);
      markMesh();
      api.lookAt(ox + 3, oy + 0.5, oz);
    },
    stageHelvetePortal: () => {
      api.buildPlatform(12);
      const ox = Math.floor(player.x) + 3, oz = Math.floor(player.z) - 2;
      const oy = Math.floor(player.y);
      // Flat pad, clear volume, THEN place lit frame
      for (let w = -2; w <= 5; w++) for (let d = -2; d <= 2; d++) {
        world.setBlock(ox + w, oy - 1, oz + d, BlockId.Cobble);
        for (let yy = 0; yy <= 6; yy++) world.setBlock(ox + w, oy + yy, oz + d, BlockId.Air);
      }
      const origin = buildPortalFrame(world, ox, oy, oz);
      markMesh();
      // Isolated camera: south of frame, nothing between
      for (let z = 1; z <= 14; z++) for (let x = -3; x <= 6; x++) for (let y = 0; y <= 6; y++) {
        const id = world.getBlock(ox + x, oy + y, oz + z);
        if (id !== BlockId.Portal && id !== BlockId.PortalFrame && id !== BlockId.Cobble) {
          world.setBlock(ox + x, oy + y, oz + z, BlockId.Air);
        }
      }
      markMesh();
      player.x = ox + 1.5; player.y = oy + 2.8; player.z = oz + 12.0;
      player.vx = player.vy = player.vz = 0;
      player.pitch = -0.05;
      api.lookAt(ox + 1.5, oy + 2.3, oz);
      return origin;
    },
    toast: (id: string) => achieve.grant(id as 'first_block'),
    weather,
    fishing,
    traders,
    music,
    achieve,
    redstone,
    dimension: () => dimension,
    helveteEnabled: () => helveteTransit,
    setHelveteTransit: (on: boolean) => { helveteTransit = !!on; },
    enterHelvete: () => {
      if (dimension === 'helvete') return { ok: false, reason: 'already' };
      owReturn = { x: player.x, y: player.y, z: player.z };
      leafDecay.clear(); world.switchDimension('helvete');
      dimension = 'helvete';
      const spawn = world.findHelveteSpawn();
      const rx = Math.floor(spawn.x) - 1, ry = Math.floor(spawn.y), rz = Math.floor(spawn.z) + 3;
      if (world.getBlock(rx + 1, ry + 1, rz) !== BlockId.Portal) {
        for (let w = -1; w <= 4; w++) world.setBlock(rx + w, ry - 1, rz, BlockId.Helstein);
        buildPortalFrame(world, rx, ry, rz);
      }
      player.x = spawn.x; player.y = spawn.y; player.z = spawn.z;
      player.vx = player.vy = player.vz = 0;
      portalCooldown = 2;
      renderer.setDimensionVisuals('helvete');
      markMesh();
      renderer.syncChunks(world, true);
      return { ok: true, dim: dimension, x: player.x, y: player.y, z: player.z };
    },
    exitHelvete: () => {
      if (dimension !== 'helvete') return { ok: false, reason: 'not-in-helvete' };
      leafDecay.clear(); world.switchDimension('overworld');
      dimension = 'overworld';
      player.x = owReturn.x; player.y = owReturn.y; player.z = owReturn.z;
      player.vx = player.vy = player.vz = 0;
      portalCooldown = 2;
      renderer.setDimensionVisuals('overworld');
      markMesh();
      renderer.syncChunks(world, true);
      return { ok: true, dim: dimension, x: player.x, y: player.y, z: player.z };
    },
    /** Place marker in OW, round-trip Helvete, assert OW marker untouched. */
    testHelveteRoundTrip: () => {
      if (dimension !== 'overworld') api.exitHelvete();
      api.buildPlatform(6);
      const mx = Math.floor(player.x) + 2;
      const my = Math.floor(player.y) - 1;
      const mz = Math.floor(player.z);
      world.setBlock(mx, my, mz, BlockId.GoldOre);
      const before = world.getBlock(mx, my, mz);
      const beforeHash: number[] = [];
      for (let dy = -1; dy <= 3; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        beforeHash.push(world.getBlock(mx + dx, my + dy, mz + dz));
      }
      const ent = api.enterHelvete();
      // Mutate helvete — must not affect OW
      const hx = Math.floor(player.x), hy = Math.floor(player.y) - 1, hz = Math.floor(player.z);
      world.setBlock(hx, hy, hz, BlockId.Helkvarts);
      const helveteBlock = world.getBlock(hx, hy, hz);
      const peekOw = world.peekBlock('overworld', mx, my, mz);
      const ex = api.exitHelvete();
      const after = world.getBlock(mx, my, mz);
      const afterHash: number[] = [];
      for (let dy = -1; dy <= 3; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        afterHash.push(world.getBlock(mx + dx, my + dy, mz + dz));
      }
      const same = before === after && before === BlockId.GoldOre && peekOw === BlockId.GoldOre
        && beforeHash.length === afterHash.length && beforeHash.every((v, i) => v === afterHash[i]);
      return {
        ok: !!ent.ok && !!ex.ok && helveteBlock === BlockId.Helkvarts && same,
        before, after, peekOw, helveteBlock, same,
        enter: ent, exit: ex,
      };
    },
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
      if (hit) achieve.grant('first_kill');
      if (hit && held && ITEMS[held.id]?.tool === 'sword' && !player.creative) inv.setHeld(damageTool(held));
    }
  });

  let prev = performance.now();
  const loop = (now: number) => {
    if (!gameActive()) return;
    requestAnimationFrame(loop);
    let dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    frames++;
    if (now - fpsT >= 500) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
    attackCool -= dt;

    clickLook.style.display = (!paused && !dead && !input.pointerLocked && !input.inventoryOpen) ? 'block' : 'none';
    if (paused || dead) {
      hud.updateBars(player); // MC: empty hearts on the death screen
      renderer.setDayTime(dayTime);
      renderer.updateCamera(player);
      renderer.render();
      {
        const perf = renderer.getPerfStats();
        hud.updateDebug(player, fps, world.chunks.size, dayTime, `draw: ${perf.drawCalls} tris: ${perf.triangles}`);
      }
      return;
    }

    if (!invUi.isOpen()) {
      const look = consumeLook(input);
      if (input.pointerLocked || input.touchLookActive || input.dragLookFallback || Math.abs(look.dx) + Math.abs(look.dy) > 0) {
        player.yaw -= look.dx * sens;
        player.pitch -= look.dy * sens; // -pitch looks down in this camera setup
        app.classList.add('playing');
        document.getElementById('game-root')?.classList.add('playing');
        hud.hideHintNow();
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
      // MC: cannot sprint with hunger ≤ 6 (3 drumsticks).
      player.sprinting = input.sprint && !input.sneak && !!input.forward && (player.creative || player.hunger > 6);
      if (player.creative && input.jump) {
        if (flyTap > 0 && flyTap < 0.35) { player.flying = !player.flying; flyTap = -1; }
        else if (flyTap <= 0) flyTap = 0.001;
      }
      if (flyTap > 0) flyTap += dt;
      if (!input.jump && flyTap > 0.35) flyTap = 0;
      if (!input.jump && flyTap < 0) flyTap = 0;

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

      if (boats.mounted && input.sneak) {
        boats.dismount(player);
      }
      if (!boats.mounted) {
        // it17: latch short Space taps for up to 0.15 s — a quick tap while landing (or shorter than a
        // frame at low fps) was lost and the player didn't jump
        if (input.jumpTap) jumpTapAge += dt; else jumpTapAge = 0;
        const wasGround = player.onGround || player.inWater;
        const move = movePlayer(player, world, wishX, wishZ, input.jump || !!input.jumpTap, dt);
        if (wasGround || jumpTapAge > 0.15) { input.jumpTap = false; jumpTapAge = 0; }
        if (move.fallDamage > 0) hurtPlayer(move.fallDamage, 0, 0, true);
      }
      // MC suffocation: eye inside a full solid block → 1 damage every 0.5 s (dig out!)
      if (!player.creative && !dead && headInSolid(world, player.x, player.y, player.z)) {
        suffocateAcc += dt;
        if (suffocateAcc >= 0.5) { suffocateAcc -= 0.5; hurtPlayer(1, 0, 0, true); }
      } else suffocateAcc = 0;
      updateInBlockOverlay();
      boats.update(dt, world, player, wishX, wishZ, !!input.forward);

      if (player.onGround && (wishX || wishZ) && !boats.mounted) {
        const feet = world.getBlock(Math.floor(player.x), Math.floor(player.y - 0.1), Math.floor(player.z));
        const mat = blockMaterial(feet);
        const stepMat = mat === 'ground' ? 'grass' : mat === 'wood' ? 'wood' : mat === 'stone' ? 'stone' : mat === 'plant' ? 'grass' : feet === BlockId.Sand || feet === BlockId.Sjelegrus ? 'sand' : 'other';
        sound.step(true, player.sprinting, dt, stepMat as 'grass' | 'stone' | 'sand' | 'wood' | 'other');
        if (player.sprinting && Math.random() < dt * 8) {
          const col = feet === BlockId.Sand ? 0xc2b280 : feet === BlockId.Stone || feet === BlockId.Cobble ? 0x888888 : 0x5a8f3a;
          particles.burst(player.x, player.y + 0.1, player.z, col, 3, 'sprint');
        }
      }
      // creative double-space fly toggle
      if (player.creative && input.jump && !(input as { _jumpWas?: boolean })._jumpWas) {
        /* edge handled below */
      }

      hungerAcc += dt * (player.sprinting ? 0.04 : (player.vx || player.vz) ? 0.008 : 0.001);
      if (player.hungerEffect && player.hungerEffect > 0) {
        hungerAcc += dt * 0.12; // ≈ 3–4 hunger points over 30 s
        player.hungerEffect = Math.max(0, player.hungerEffect - dt);
      }
      if (hungerAcc > 1) {
        hungerAcc = 0;
        if (player.hunger > 0) player.hunger = Math.max(0, player.hunger - 1);
      }
      // MC: at empty hunger, ½ heart starvation damage every 4 s (Normal: stops at ½ heart left),
      // independent of how fast the hunger bar drains.
      if (player.hunger <= 0) {
        starveAcc += dt;
        if (starveAcc >= 4) {
          starveAcc = 0;
          if (player.health > 1) hurtPlayer(Math.min(1, player.health - 1), 0, 0, true);
        }
      } else starveAcc = 0;
      if (player.hunger > 17 && player.health < 20) player.health = Math.min(20, player.health + dt * 0.25);
    }

    // Helvete portal transit (dual chunk store — overworld untouched while away)
    if (portalCooldown > 0) portalCooldown -= dt;
    if (helveteTransit && portalCooldown <= 0 && !dead && !paused) {
      const bx = Math.floor(player.x), by = Math.floor(player.y), bz = Math.floor(player.z);
      const inPortal = world.getBlock(bx, by, bz) === BlockId.Portal
        || world.getBlock(bx, by + 1, bz) === BlockId.Portal;
      if (inPortal) {
        if (dimension === 'overworld') {
          owReturn = { x: player.x, y: player.y, z: player.z };
          leafDecay.clear(); world.switchDimension('helvete');
          dimension = 'helvete';
          const spawn = world.findHelveteSpawn();
          // Return portal near spawn (only once if not already lit nearby)
          const rx = Math.floor(spawn.x) - 1, ry = Math.floor(spawn.y), rz = Math.floor(spawn.z) + 3;
          if (world.getBlock(rx + 1, ry + 1, rz) !== BlockId.Portal) {
            for (let w = -1; w <= 4; w++) world.setBlock(rx + w, ry - 1, rz, BlockId.Helstein);
            buildPortalFrame(world, rx, ry, rz);
          }
          player.x = spawn.x; player.y = spawn.y; player.z = spawn.z;
          player.vx = player.vy = player.vz = 0;
          portalCooldown = 4;
          renderer.setDimensionVisuals('helvete');
          markMesh();
          renderer.syncChunks(world, true);
        } else {
          leafDecay.clear(); world.switchDimension('overworld');
          dimension = 'overworld';
          player.x = owReturn.x; player.y = owReturn.y; player.z = owReturn.z;
          player.vx = player.vy = player.vz = 0;
          portalCooldown = 4;
          renderer.setDimensionVisuals('overworld');
          markMesh();
          renderer.syncChunks(world, true);
        }
      }
    }

    world.updateAround(player.x, player.z);
    waterAcc += dt;
    if (waterAcc > 0.8) {
      waterAcc = 0;
      // MC: flowing water washes away torches, red dust and plants as items
      tickWater(world, 20, (wx, wy, wz, wid) => {
        if (wid === BlockId.Crop) harvestCrop(world, wx, wy, wz, drops);
        else { const wd = dropForBlock(wid, null); if (wd) drops.spawn(wx, wy, wz, wd); }
        markMesh();
      }, { x: player.x, z: player.z, radius: 4 });
    }
    cropAcc += dt;
    if (cropAcc > 1.2) {
      cropAcc = 0;
      if (tickCrops(world, 16) > 0) markMesh();
      // MC: saplings (light ≥ 9, room above) grow into an oak after a few minutes
      if (tickSaplings()) markMesh();
    }
    containers.tick(dt);
    mobs.trySpawn(world, player, dayTime, dt);
    mobs.update(world, player, dt, drops, sound, (d, kx, kz) => hurtPlayer(d, kx, kz), xp);
    projectiles.update(dt, world, mobs, sound);
    xp.update(dt, player);
    updateXpUi();
    sound.ambient(dayTime, dt);
    weather.update(dt, world.noise, player.x, player.z);
    if ((weather.kind === 'rain' || weather.kind === 'thunder') && Math.random() < dt * 2) music.rain();
    if (weather.flash > 0.8) music.thunder();
    music.update(dayTime);
    fishing.update(dt);
    structuresAcc += dt;
    if (structuresAcc > 2) {
      structuresAcc = 0;
      if (dimension === 'overworld') {
        const pcx = Math.floor(player.x / CHUNK_SIZE), pcz = Math.floor(player.z / CHUNK_SIZE);
        // MC generates structures with the terrain. Before it16 they were stamped only once you came
        // within 2 chunks: houses popped into view next to you, over your own builds, or around you.
        // Now every chunk in view distance gets its structures within ~2 s of being generated.
        const R = VIEW_RADIUS;
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
          if (!world.hasChunkAt((pcx + dx) * CHUNK_SIZE, (pcz + dz) * CHUNK_SIZE)) continue;
          // Never build a structure on top of / around the player (new world, teleport, portal):
          // chunks within 2 of you that are still unbuilt simply get none.
          if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) skipStructures(pcx + dx, pcz + dz);
          else tryPlaceStructures(world, containers, pcx + dx, pcz + dz);
        }
      }
    }
    syncTraders();
    redstone.update(world, player, dt);
    if (redstone.dirty.length) {
      for (const d of redstone.dirty) world.markMeshDirty(Math.floor(d.x / 16), Math.floor(d.z / 16));
      markMesh();
    }
    // Persist dust power into meta so mesher can show glow tile
    for (const d of redstone.lastPoweredDust) {
      if (world.getBlock(d.x, d.y, d.z) === BlockId.RedDust) world.setMeta(d.x, d.y, d.z, Math.min(15, d.p));
    }
    // Clear unpowered dust meta nearby (cheap: only dirty lamps/doors already handled)
    if (redstone.lastPoweredDust.length && Math.random() < 0.3) {
      const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
      for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) {
        const x = px + dx, y = py, z = pz + dz;
        if (world.getBlock(x, y, z) === BlockId.RedDust && redstone.getPower(x, y, z) <= 0 && world.getWaterLevel(x, y, z) !== 0) {
          world.setMeta(x, y, z, 0);
          world.markMeshDirty(Math.floor(x / 16), Math.floor(z / 16));
          markMesh();
        }
      }
    }
    for (const d of redstone.lastPoweredDust) {
      if (Math.random() < dt * 4) particles.burst(d.x + 0.5, d.y + 0.15, d.z + 0.5, 0xff4422, 1, 'redstone');
    }
    particles.update(dt);
    if (boats.mounted) achieve.grant('boat_ride');
    if (player.creative && player.flying) achieve.grant('fly');

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

    // Picked-up items must show in the hotbar right away (hotbar only redraws when marked dirty).
    if (drops.update(dt, player, inv, (x, y, z) => isSolid(world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)))) > 0) {
      hud.markDirty(); sound.pickup();
    }
    renderer.syncDrops(drops.drops);
    renderer.syncMobs(mobs.mobs, dt);
    renderer.syncWeather(weather.kind, weather.intensity, renderer.camera.position, weather.flash);
    renderer.syncProjectiles(projectiles.list);
    renderer.syncBoats(boats.boats);
    renderer.syncXp(xp.orbs);
    {
      const doors: { x: number; y: number; z: number; open: boolean; facing: number }[] = [];
      const lamps: { x: number; y: number; z: number; on: boolean }[] = [];
      const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
      for (let dy = -3; dy <= 4; dy++) for (let dz = -16; dz <= 16; dz++) for (let dx = -16; dx <= 16; dx++) {
        const x = px + dx, y = py + dy, z = pz + dz;
        const id = world.getBlock(x, y, z);
        if (id === BlockId.Door) { const dm = world.getWaterLevel(x, y, z); doors.push({ x, y, z, open: !!(dm & 1), facing: doorFacing(dm) }); }
        if (id === BlockId.Lamp) lamps.push({ x, y, z, on: !!(world.getWaterLevel(x, y, z) & 1) || redstone.getPower(x, y, z) > 0 });
      }
      renderer.syncDoors(doors);
      renderer.syncLamps(lamps);
      const signMap = (world as unknown as { _signs?: Map<string, string> })._signs;
      const signs: { x: number; y: number; z: number; text: string }[] = [];
      if (signMap) {
        for (const [k, text] of signMap) {
          const [x, y, z] = k.split(',').map(Number);
          if (world.getBlock(x, y, z) === BlockId.Sign) signs.push({ x, y, z, text });
        }
      }
      // Also show nearby blank signs as posts
      for (let dy = -2; dy <= 3; dy++) for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) {
        const x = px + dx, y = py + dy, z = pz + dz;
        if (world.getBlock(x, y, z) !== BlockId.Sign) continue;
        const key = `${x},${y},${z}`;
        if (signMap?.has(key)) continue;
        signs.push({ x, y, z, text: '' });
      }
      renderer.syncSigns(signs);
    }
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
        // MC creative: blocks (even bedrock) break instantly
        const eyesInWater = world.getBlock(Math.floor(player.x), Math.floor(player.y + EYE_HEIGHT), Math.floor(player.z)) === BlockId.Water;
        const need = player.creative ? 0.05 : breakDuration(id, inv.held()) * miningPenalty(player.onGround || boats.mounted, eyesInWater);
        breakAcc += dt;
        hud.setBreakProgress(need > 0 ? breakAcc / need : 1);
        if (need > 0 && breakAcc >= need) {
          if (id !== BlockId.Air && id !== BlockId.Water) {
            const drop = dropForBlock(id, inv.held());
            world.setBlock(hit.x, hit.y, hit.z, BlockId.Air);
            if (id === BlockId.Chest || id === BlockId.Furnace) {
              // MC: breaking a chest/furnace spills its contents instead of deleting them
              for (const s of containers.contentsAt(hit.x, hit.y, hit.z)) drops.spawn(hit.x, hit.y, hit.z, s);
              containers.removeAt(hit.x, hit.y, hit.z);
            }
            if (drop) drops.spawn(hit.x, hit.y, hit.z, drop);
            // MC: cut logs/leaves make unconnected natural leaves decay over time
            if (id === BlockId.Log || id === BlockId.Leaves) leafDecay.onRemoved(world, hit.x, hit.y, hit.z);
            // MC: sand above the broken block falls
            updateGravityAround(world, hit.x, hit.y, hit.z, (gx, gy, gz, gid) => { const gd = dropForBlock(gid, null); if (gd) drops.spawn(gx, gy, gz, gd); });
            // MC: a torch / red dust / pressure plate / crop / sapling / tall grass on the broken block pops off as an item
            {
              const above = world.getBlock(hit.x, hit.y + 1, hit.z);
              if (above === BlockId.Crop) harvestCrop(world, hit.x, hit.y + 1, hit.z, drops);
              else if (needsSupportBelow(above)) {
                world.setBlock(hit.x, hit.y + 1, hit.z, BlockId.Air);
                const d2 = dropForBlock(above, null);
                if (d2) drops.spawn(hit.x, hit.y + 1, hit.z, d2);
              }
            }
            if (!player.creative) inv.setHeld(damageTool(inv.held()));
            sound.breakBlock();
            particles.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, blockParticleColor(id), 14, 'break');
            achieve.grant('first_block');
            markMesh();
            hud.markDirty();
          }
          breakAcc = 0; breakTarget = null; hud.setBreakProgress(0);
        }
      }
    } else if (!input.breakHeld) {
      breakAcc = 0; breakTarget = null; hud.setBreakProgress(0);
    }

    // ---- Hold-to-eat (MC: 32 ticks = 1.6 s with RMB held) ----
    {
      const hf = inv.held();
      const tidE = hit ? world.getBlock(hit.x, hit.y, hit.z) : BlockId.Air;
      const useableE = tidE === BlockId.CraftingTable || tidE === BlockId.Chest || tidE === BlockId.Furnace
        || tidE === BlockId.Bed || tidE === BlockId.Door || tidE === BlockId.Gate || tidE === BlockId.Trapdoor
        || tidE === BlockId.Lever || tidE === BlockId.Button || tidE === BlockId.Sign || tidE === BlockId.EnchantTable;
      const eating = !dead && !invUi.isOpen() && input.useHeld && !!hf && !!ITEMS[hf.id]?.food
        && !ITEMS[hf.id]?.placeBlock && player.hunger < 20 && !useableE;
      if (eating && hf) {
        eatTimer += dt;
        eatSoundAcc += dt;
        if (eatSoundAcc > 0.3) { eatSoundAcc = 0; sound.eat(); }
        if (eatTimer >= EAT_TIME) {
          eatTimer = 0;
          player.hunger = Math.min(20, player.hunger + (ITEMS[hf.id].food ?? 0));
          // MC: rotten flesh gives Hunger for 30 s with 80 % chance
          if (hf.id === ItemId.RottenFlesh && Math.random() < 0.8) player.hungerEffect = 30;
          hf.count -= 1;
          if (hf.count <= 0) inv.setHeld(null);
          sound.eat(); hud.markDirty(); hud.refreshHotbar();
        }
        if (!input.breakHeld) hud.setBreakProgress(Math.min(1, eatTimer / EAT_TIME));
      } else if (eatTimer > 0) {
        eatTimer = 0; eatSoundAcc = 0;
        if (!input.breakHeld) hud.setBreakProgress(0);
      }
    }

    if (!invUi.isOpen() && consumePlace(input)) {
      let ateThisClick = false;
      {
        const heldFood = inv.held();
        if (heldFood && ITEMS[heldFood.id]?.food && !ITEMS[heldFood.id]?.placeBlock && player.hunger < 20) {
          const tid0 = hit ? world.getBlock(hit.x, hit.y, hit.z) : BlockId.Air;
          const useable = tid0 === BlockId.CraftingTable || tid0 === BlockId.Chest || tid0 === BlockId.Furnace
            || tid0 === BlockId.Bed || tid0 === BlockId.Door || tid0 === BlockId.Gate || tid0 === BlockId.Trapdoor
            || tid0 === BlockId.Lever || tid0 === BlockId.Button || tid0 === BlockId.Sign || tid0 === BlockId.EnchantTable;
          // MC: food is eaten by HOLDING right mouse (~1.6 s, see eatTimer below), not on click.
          if (!useable) ateThisClick = true;
        }
      }
      if (!hit || ateThisClick) { /* eaten or nothing to interact with */ }
      else {
      const tid = world.getBlock(hit.x, hit.y, hit.z);
      if (tid === BlockId.CraftingTable) { invUi.openTable(); input.inventoryOpen = true; }
      else if (tid === BlockId.Chest) { invUi.openChest(containers.getChest(hit.x, hit.y, hit.z)); input.inventoryOpen = true; }
      else if (tid === BlockId.Furnace) { invUi.openFurnace(containers.getFurnace(hit.x, hit.y, hit.z)); input.inventoryOpen = true; }
      else if (tid === BlockId.Bed) { trySleep(hit.x, hit.y, hit.z); }
      else if (tid === BlockId.EnchantTable) {
        if (api.enchantHeld()) sound.placeBlock();
      } else {
        const held = inv.held();
        if (held && held.id === ItemId.BoneMeal && boneMealTarget(world, hit.x, hit.y, hit.z)) {
          // MC bone meal: grows crops 2–5 stages, saplings 45 %, grass block → tall grass/flowers around
          if (applyBoneMeal(world, hit.x, hit.y, hit.z, Math.random, CHUNK_HEIGHT - 1)) {
            if (!player.creative) { held.count -= 1; if (held.count <= 0) inv.setHeld(null); }
            particles.burst(hit.x + 0.5, hit.y + 1.1, hit.z + 0.5, 0x55dd44, 10, 'sprint');
            sound.placeBlock(); markMesh(); hud.markDirty();
          }
        } else if (held && ITEMS[held.id]?.tool === 'hoe') {
          if (hoeDirt(world, hit.x, hit.y, hit.z)) {
            inv.setHeld(damageTool(held)); sound.placeBlock(); markMesh(); hud.markDirty();
          }
        } else if (held && held.id === ItemId.Seeds) {
          const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
          if (plantCrop(world, px, py, pz)) {
            held.count -= 1; if (held.count <= 0) inv.setHeld(null);
            sound.placeBlock(); markMesh(); hud.markDirty();
          }
        } else if (tid === BlockId.Door || tid === BlockId.Gate || tid === BlockId.Trapdoor) {
          const meta = world.getWaterLevel(hit.x, hit.y, hit.z);
          world.setMeta(hit.x, hit.y, hit.z, meta ^ 1);
          sound.placeBlock(); markMesh();
        } else if (tid === BlockId.Lever) {
          redstone.toggleLever(world, hit.x, hit.y, hit.z); sound.placeBlock(); markMesh();
        } else if (tid === BlockId.Button) {
          redstone.pulseButton(world, hit.x, hit.y, hit.z); sound.placeBlock();
        } else if (tid === BlockId.Sign) {
          const txt = prompt('Skilttekst', '') ?? '';
          (world as unknown as { _signs?: Map<string, string> })._signs ??= new Map();
          (world as unknown as { _signs: Map<string, string> })._signs.set(`${hit.x},${hit.y},${hit.z}`, txt.slice(0, 48));
        } else if (tid === BlockId.PortalFrame || tid === BlockId.Portal) {
          if (lightPortal(world, hit.x, hit.y, hit.z)) { markMesh(); sound.placeBlock(); }
        } else if (held && held.id === ItemId.Boat) {
          const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
          boats.place(px + 0.5, py + 0.4, pz + 0.5);
          inv.setHeld(null); hud.markDirty(); sound.placeBlock();
        } else if (held && held.id === ItemId.FishingRod) {
          if (fishing.casting) {
            const got = fishing.reel();
            if (got) { inv.add(got); sound.placeBlock(); if (got.id === ItemId.RawFish) achieve.grant('fish'); }
            inv.setHeld(damageTool(held));
            hud.markDirty();
          } else if (fishing.start(player.x, player.y, player.z, player.yaw, player.pitch, world)) {
            sound.swing();
          }
        } else if (held && held.id === ItemId.MapItem) {
          mapOpen = !mapOpen;
          mapOverlay.style.display = mapOpen ? 'block' : 'none';
          if (mapOpen) renderMapCanvas(mapOverlay, world, world.noise, player.x, player.z);
        } else if (held && ITEMS[held.id]?.armorSlot) {
          const left = inv.tryEquip(held);
          inv.setHeld(left);
          hud.markDirty(); updateArmorUi();
        } else if (held && ITEMS[held.id]?.food && !ITEMS[held.id]?.placeBlock) {
          /* MC: cannot eat with a full hunger bar; eating itself is hold-to-eat (eatTimer). */
        } else {
          const nearTrader = traders.find((tr) => Math.hypot(tr.x - player.x, tr.y - player.y, tr.z - player.z) < 3);
          if (nearTrader) {
            openTrade(nearTrader);
          } else if (held && held.id === ItemId.Bone) {
            const r = mobs.interactWolf(player, true);
            if (r === 'tamed' || r === 'sat' || r === 'stood') {
              if (r === 'tamed') {
                held.count -= 1;
                if (held.count <= 0) inv.setHeld(null);
                hud.markDirty();
                achieve.grant('wolf_friend' as 'first_block');
              }
              sound.placeBlock();
            }
          } else if (mobs.nearest('ulv', player.x, player.y, player.z, 2.5)?.tamed) {
            mobs.interactWolf(player, false);
            sound.placeBlock();
          } else if (boats.nearest(player.x, player.y, player.z, 2.2)) {
            boats.tryMount(player);
          } else {
            // MC: aiming at a replaceable block (tall grass) places into that cell instead of next to it
            const intoHit = isReplaceable(tid);
            const px = intoHit ? hit.x : hit.x + hit.nx, py = intoHit ? hit.y : hit.y + hit.ny, pz = intoHit ? hit.z : hit.z + hit.nz;
            const taken = inv.takeOneFromSelected();
            if (taken) {
              const placeId = ITEMS[taken.id]?.placeBlock;
              const dest = world.getBlock(px, py, pz);
              // Minecraft: cannot place a block that intersects the player
              const hw = 0.3, ph = player.sneaking ? 1.5 : 1.8;
              // …but non-colliding blocks (torch, ladder, red dust, sign…) may go where you stand
              const intersectsPlayer = placeId != null && isSolid(placeId) && !(
                px + 1 <= player.x - hw || px >= player.x + hw ||
                py + 1 <= player.y || py >= player.y + ph ||
                pz + 1 <= player.z - hw || pz >= player.z + hw
              );
              // MC: plants / torches need a supporting block; saplings only on grass/dirt/farmland
              const below = world.getBlock(px, py - 1, pz);
              const supportOk = placeId === BlockId.Sapling || isFlower(placeId ?? 0) ? canPlantSapling(below)
                : placeId === BlockId.TallGrass ? below === BlockId.Grass
                : placeId === BlockId.Door ? canPlaceDoor(world, px, py, pz, isSolid) && (
                  // MC: the door's upper half may not overlap the player either
                  px + 1 <= player.x - hw || px >= player.x + hw || py + 2 <= player.y || py >= player.y + ph || pz + 1 <= player.z - hw || pz >= player.z + hw)
                : true;
              // MC: nothing can be placed into a door's upper half
              const intoDoorTop = below === BlockId.Door;
              if (placeId != null && isReplaceable(dest) && !intersectsPlayer && supportOk && !intoDoorTop) {
                world.setBlock(px, py, pz, placeId);
                if (placeId === BlockId.Door) world.setMeta(px, py, pz, doorFacingFromYaw(player.yaw) << DOOR_FACING_SHIFT);
                // MC: player-placed leaves are persistent (never decay)
                if (placeId === BlockId.Leaves) world.setMeta(px, py, pz, LEAF_PERSISTENT);
                // MC: sand placed over air falls
                updateGravityAround(world, px, py, pz, (gx, gy, gz, gid) => { const gd = dropForBlock(gid, null); if (gd) drops.spawn(gx, gy, gz, gd); });
                if (player.creative) inv.add(taken); // restore
                if (placeId === BlockId.PortalFrame) lightPortal(world, px, py, pz);
                sound.placeBlock(); markMesh();
              } else if (!player.creative) inv.add(taken);
              else inv.add(taken);
              hud.markDirty();
            }
          }
        }
      }
      }
    }

    for (const lp of leafDecay.update(dt, world)) {
      const ld = dropForBlock(BlockId.Leaves, null);
      if (ld) drops.spawn(lp.x, lp.y, lp.z, ld);
      particles.burst(lp.x + 0.5, lp.y + 0.5, lp.z + 0.5, blockParticleColor(BlockId.Leaves), 6, 'break');
      markMesh();
    }

    dayTime += dt / DAY_LEN;
    renderer.setDayTime(dayTime);
    renderer.updateCamera(player);
    renderer.render();
    {
      const perf = renderer.getPerfStats();
      hud.updateDebug(player, fps, world.chunks.size, dayTime,
        `draw: ${perf.drawCalls} tris: ${perf.triangles} | vær: ${weather.kind}`);
    }
    hud.updateBars(player);
    if (mapOpen) renderMapCanvas(mapOverlay, world, world.noise, player.x, player.z);

    if (now - lastSave > 20000) { lastSave = now; void doSave(); }
  };
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void doSave();
  }, sig);
  // Final save, then tear the session down so nothing from it can run or save again.
  endSession = async () => {
    if (!gameActive()) return;
    try { await doSave(); } catch { /* keep quitting */ }
    life.abort();
    unbindDesktop(); unbindTouch();
    try { music.stop(); } catch { /* */ }
    if (document.pointerLockElement) document.exitPointerLock();
    world.dispose();
    renderer.dispose();
  };
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
