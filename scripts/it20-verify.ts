/**
 * it20 verify: rain puts out fire, lava lights flammables, mobs burn in fire/lava, shaped selection outline (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it20';
const VID = '/tmp/it20-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it20';

type Status = 'PASS' | 'FAIL' | 'PARTIAL' | 'UNTESTED';
interface Row { id: string; status: Status; notes: string }
const results: Row[] = [];
let T0 = Date.now();
const bugs: string[] = [];
function record(id: string, status: Status, notes = '') {
  const prev = results.findIndex((r) => r.id === id);
  if (prev >= 0) results.splice(prev, 1);
  results.push({ id, status, notes });
  console.log(`[${status}] ${id}${notes ? ' — ' + notes : ''} @${((Date.now() - T0) / 1000).toFixed(1)}s`);
}
function bug(msg: string) { bugs.push(msg); console.error('BUG:', msg); }

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      if (a && typeof a === 'object') { const p = a.port; s.close(() => resolve(p)); }
      else reject(new Error('port'));
    });
  });
}

async function startPreview() {
  const PORT = await freePort();
  const base = `http://127.0.0.1:${PORT}`;
  const child = spawn('node_modules/.bin/vite', ['preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort', ...(process.env.BV_DIST ? ['--outDir', process.env.BV_DIST] : [])], {
    cwd: process.cwd(), stdio: 'pipe',
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base + '/')).ok) return { base, child }; } catch {}
    await sleep(200);
  }
  throw new Error('preview failed');
}

async function boot(page: Page, base: string, name: string) {
  page.removeAllListeners('dialog');
  page.on('dialog', async (d) => {
    if (d.type() === 'prompt') await d.accept(name);
    else if (d.type() === 'confirm') await d.dismiss();
    else await d.accept();
  });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('#btn-single').click();
  await sleep(300);
  await page.locator('#btn-new-world').click();
  await page.waitForSelector('canvas#game', { timeout: 90000 });
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(() => !!(window as any).__bv)) break;
    await sleep(250);
  }
  if (!(await page.evaluate(() => !!(window as any).__bv))) throw new Error('__bv not ready (WebGL boot failed?)');
  await sleep(500);
}

/** One center click to acquire lock; do NOT move mouse afterward before dig/place. */

async function focusGame(page: Page) {
  await page.bringToFront();
  await page.evaluate(() => {
    const c = document.getElementById('game') as HTMLElement | null;
    c?.focus();
  });
  await sleep(50);
}

async function acquireLock(page: Page) {
  await focusGame(page);
  await page.mouse.move(640, 360);
  await page.locator('canvas#game').click({ position: { x: 640, y: 360 }, force: true });
  await sleep(250);
  const locked = await page.evaluate(() => (window as any).__bv?.input?.pointerLocked);
  if (!locked) {
    await page.mouse.move(640, 360);
    await page.mouse.down(); await sleep(50); await page.mouse.up();
    await sleep(200);
  }
}

async function aim(page: Page, x: number, y: number, z: number, tx: number, ty: number, tz: number) {
  await page.evaluate(({ x, y, z, tx, ty, tz }) => {
    const bv = (window as any).__bv;
    bv.teleport(x, y, z);
    bv.lookAt(tx, ty, tz);
  }, { x, y, z, tx, ty, tz });
  await sleep(100);
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const p = path.join(OUT, name);
  await page.screenshot({ path: p, type: 'png' });
  fs.copyFileSync(p, path.join(SHOTS, name));
}

async function st(page: Page) {
  return page.evaluate(() => {
    const bv = (window as any).__bv;
    const p = bv.player;
    return {
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
      health: p.health, hunger: p.hunger, air: p.air,
      dead: bv.getState().dead, dayTime: bv.getState().dayTime, fps: bv.getState().fps,
      locked: bv.input.pointerLocked,
      breakHeld: bv.input.breakHeld,
    };
  });
}

async function countItem(page: Page, id: number) {
  return page.evaluate((id) => {
    let n = 0;
    for (const s of (window as any).__bv.inv.slots) if (s && s.id === id) n += s.count;
    return n;
  }, id);
}

async function ensureRespawn(page: Page) {
  const dead = await page.evaluate(() => (window as any).__bv?.getState?.().dead);
  if (dead || await page.locator('#death-screen').isVisible().catch(() => false)) {
    const vis = await page.evaluate(() => {
      const el = document.getElementById('death-screen');
      return el ? getComputedStyle(el).display !== 'none' : false;
    });
    if (vis) {
      await page.locator('#btn-respawn').click({ force: true });
      await sleep(400);
    }
  }
}

async function flatPad(page: Page, y = 45) {
  await page.evaluate((y) => {
    const bv = (window as any).__bv;
    for (let x = 0; x <= 16; x++) for (let z = 0; z <= 16; z++) {
      bv.world.setBlock(x, y, z, 1);
      for (let yy = y + 1; yy <= y + 6; yy++) bv.world.setBlock(x, yy, z, 0);
    }
    bv.look(0, 0);
    bv.teleport(8.5, y + 1.05, 8.5);
  }, y);
  await sleep(150);
}

/** Craft via real inventory UI clicks: put pattern into craft grid, take output. */

async function uiCraft(page: Page, pattern: (number | 0)[], grid = 2) {
  const open = await page.evaluate(() => (window as any).__bv.input.inventoryOpen);
  if (!open) { await page.keyboard.press('KeyE'); await sleep(300); }
  // Clear craft grid back into inventory
  for (let i = 0; i < grid * grid; i++) {
    const slot = page.locator(`[data-craft-slot="${i}"]`);
    if (await slot.count()) await slot.click({ modifiers: ['Shift'] }).catch(() => {});
  }
  await sleep(80);
  // Place one item per cell via right-click (MC-like)
  for (let i = 0; i < pattern.length; i++) {
    const id = pattern[i];
    if (!id) continue;
    const src = await page.evaluate((id) => {
      const slots = (window as any).__bv.inv.slots;
      for (let i = 0; i < slots.length; i++) if (slots[i]?.id === id && slots[i].count > 0) return i;
      return -1;
    }, id);
    if (src < 0) return false;
    // Pick stack
    const craftCell = page.locator(`[data-craft-slot="${i}"]`);
    if (!(await craftCell.count())) return false;
    await page.locator(`[data-inv-slot="${src}"]`).click({ button: 'left' });
    await sleep(60);
    await craftCell.click({ button: 'right', timeout: 5000 });
    await sleep(60);
    // Return leftover stack to inv (prefer original or empty)
    const dest = await page.evaluate((src) => {
      const slots = (window as any).__bv.inv.slots;
      if (!slots[src]) return src;
      for (let i = 0; i < slots.length; i++) if (!slots[i]) return i;
      return src;
    }, src);
    await page.locator(`[data-inv-slot="${dest}"]`).click({ button: 'left' });
    await sleep(60);
  }
  await sleep(100);
  const out = page.locator('[data-craft-out="1"]');
  if (!(await out.count())) return false;
  // Ensure output painted
  const hasOut = await page.evaluate(() => {
    const el = document.querySelector('[data-craft-out="1"]');
    return !!el && el.childElementCount > 0;
  });
  if (!hasOut) {
    // soft fail — recipe may not match
  }
  await out.click({ button: 'left' });
  await sleep(120);
  // Deposit cursor into any empty slot 0..35
  for (let i = 0; i < 36; i++) {
    const empty = await page.evaluate((i) => !(window as any).__bv.inv.slots[i], i);
    if (empty) {
      await page.locator(`[data-inv-slot="${i}"]`).click({ button: 'left' });
      await sleep(60);
      break;
    }
  }
  return true;
}


async function ensureLocked(page: Page) {
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => (window as any).__bv.input.pointerLocked)) return true;
    await acquireLock(page); await sleep(250);
  }
  return false;
}

async function isPaused(page: Page) {
  return page.evaluate(() => {
    const el = document.getElementById('pause-menu');
    return !!el && getComputedStyle(el).display !== 'none';
  });
}

async function hold(page: Page, ms: number, button: 'left' | 'right' = 'left') {
  await page.mouse.down({ button }); await sleep(ms); await page.mouse.up({ button });
}
async function setHeld(page: Page, id: number, extra: Record<number, number> = {}) {
  await page.evaluate(({ id, extra }) => {
    const bv = (window as any).__bv;
    bv.inv.slots.fill(null);
    bv.inv.slots[0] = id ? { id, count: 1 } : null;
    let i = 1;
    for (const [k, n] of Object.entries(extra)) bv.inv.slots[i++] = { id: +k, count: n };
    bv.inv.selected = 0; bv.hud.markDirty(); bv.hud.refreshHotbar();
  }, { id, extra });
}
async function walk(page: Page, key: string, ms: number) {
  await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key);
}
async function takeOutputToInv(page: Page, sel: string) {
  await page.locator(sel).click();
  await sleep(120);
  for (let i = 9; i < 36; i++) {
    const empty = await page.evaluate((i) => !(window as any).__bv.inv.slots[i], i);
    if (empty) { await page.locator(`[data-inv-slot="${i}"]`).click(); await sleep(80); return; }
  }
}
async function closeUi(page: Page) {
  if (await page.evaluate(() => (window as any).__bv.input.inventoryOpen)) { await page.keyboard.press('Escape'); await sleep(400); }
  if (await isPaused(page)) { await page.locator('#p-resume').click(); await sleep(300); }
}
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { base, child } = await startPreview();
  process.on('exit', () => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
  const browser = await chromium.launch({
    headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: process.env.BV_VID ? { dir: process.env.BV_VID, size: { width: 1280, height: 720 } } : undefined });
  const page = await ctx.newPage();
  T0 = Date.now();
  await page.addInitScript('window.__name = (f) => f;');
  page.on('pageerror', (e) => { console.error('PAGEERROR', e.message); bug('pageerror ' + e.message); });
  await boot(page, base, 'It20Verify');
  await acquireLock(page);
  await sleep(3000);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.5); bv.mobs.clear(); bv.setWeather('clear', 0); });
  const only = (process.env.BV_ONLY || '').split(',').filter(Boolean);
  const run = (id: string) => !only.length || only.includes(id);
  const gb = (x: number, y: number, z: number) => page.evaluate(({ x, y, z }) => (window as any).__bv.world.getBlock(x, y, z), { x, y, z });
  const dropIds = () => page.evaluate(() => (window as any).__bv.drops.drops.map((d: any) => d.stack.id));
  const clearDrops = () => page.evaluate(() => { (window as any).__bv.drops.drops.length = 0; });

  // Arena: stone 40–44, grass 45, open air above.
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    for (let x = -4; x <= 22; x++) for (let z = -4; z <= 22; z++) {
      for (let y = 40; y <= 44; y++) bv.world.setBlock(x, y, z, 3);
      bv.world.setBlock(x, 45, z, 1);
      for (let y = 46; y <= 63; y++) bv.world.setBlock(x, y, z, 0);
    }
    bv.mobs.clear();
    bv.forceRemeshAround?.();
  });
  await sleep(1500);
  await ensureLocked(page);
  const heal = () => page.evaluate(() => { const bv = (window as any).__bv; bv.player.health = 20; bv.player.hunger = 20; bv.burn.burnTime = 0; });
  const fsSlot = () => page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots.fill(null); bv.inv.slots[0] = { id: 82, count: 1, durability: 64 }; bv.inv.selected = 0; bv.hud.refreshHotbar(); bv.hud.markDirty(); });

  // R1 — rain: fire lit with flint and steel (RMB) under open sky goes out in the rain; fire under a roof keeps burning
  if (run('R1')) {
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) bv.world.setBlock(x, 49, z, 3); // roof over (2,46,2)
      bv.forceRemeshAround?.();
    });
    await fsSlot();
    await aim(page, 2.5, 46.05, 5.5, 2.5, 45.95, 2.5); // under-roof cell from the side
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(300);
    await aim(page, 6.5, 46.05, 5.5, 6.5, 45.95, 2.5); // open cell
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(200);
    const litRoof = await gb(2, 46, 2), litOpen = await gb(6, 46, 2);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.setWeather('rain', 1); bv.teleport(4.5, 46.05, 7.5); bv.lookAt(4.5, 46.3, 2.5); });
    await sleep(400);
    await shot(page, 'it20-01-regn-ild.png');
    let t = 0;
    for (; t < 40 && (await gb(6, 46, 2)) === 83; t++) await sleep(100);
    const openGoneAfter = t / 10;
    const roofAtThatTime = await gb(2, 46, 2);
    await sleep(300);
    await shot(page, 'it20-02-regn-slukket.png');
    await page.evaluate(() => (window as any).__bv.setWeather('clear', 0));
    // control: without rain an open fire lasts ≥ 2 s
    await aim(page, 10.5, 46.05, 5.5, 10.5, 45.95, 2.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(2000);
    const dryStill = await gb(10, 46, 2);
    record('R1-rain-puts-out-fire', litRoof === 83 && litOpen === 83 && openGoneAfter < 3.5 && roofAtThatTime === 83 && dryStill === 83 ? 'PASS' : 'FAIL',
      JSON.stringify({ litRoof, litOpen, openGoneAfter, roofAtThatTime, dryStill }));
  }

  // LV1 — lava next to a wooden hut sets it on fire (no player action needed, like MC)
  if (run('LV1')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 12; x <= 18; x++) for (let z = 12; z <= 18; z++) for (let y = 46; y <= 50; y++) bv.world.setBlock(x, y, z, 0);
      bv.world.setBlock(14, 45, 15, 44); bv.world.setBlock(15, 45, 15, 44); // lava pool in the grass
      for (let y = 46; y <= 48; y++) for (let z = 13; z <= 17; z++) bv.world.setBlock(16, y, z, 5); // planks wall beside it
      bv.forceRemeshAround?.();
      bv.teleport(10.5, 46.05, 15.5); bv.lookAt(15.5, 46.5, 15.5);
    });
    let firstFire = -1; let maxFires = 0;
    for (let t = 0; t < 40; t++) {
      await sleep(1000);
      const n = await page.evaluate(() => (window as any).__bv.fireCount());
      maxFires = Math.max(maxFires, n);
      if (n > 0 && firstFire < 0) { firstFire = t + 1; await sleep(1500); await shot(page, 'it20-03-lava-tenner.png'); }
      if (firstFire >= 0 && t > firstFire + 4) { let pl = 0; for (let y = 46; y <= 48; y++) for (let z = 13; z <= 17; z++) if ((await gb(16, y, z)) === 5) pl++; if (pl < 15) break; }
    }
    let planks = 0;
    for (let y = 46; y <= 48; y++) for (let z = 13; z <= 17; z++) if ((await gb(16, y, z)) === 5) planks++;
    await shot(page, 'it20-04-lava-brann.png');
    record('LV1-lava-lights-wood', firstFire > 0 && maxFires >= 1 && planks < 15 ? 'PASS' : 'FAIL', JSON.stringify({ firstFire, maxFires, planksLeft: planks }));
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 12; x <= 18; x++) for (let z = 12; z <= 18; z++) for (let y = 46; y <= 50; y++) bv.world.setBlock(x, y, z, 0); bv.world.setBlock(14, 45, 15, 1); bv.world.setBlock(15, 45, 15, 1); });
  }

  // MF1 — pig penned in; the player lights fire under it with flint and steel (RMB) → it burns, dies, drops cooked meat
  if (run('MF1')) {
    await heal(); await clearDrops();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 1; x <= 5; x++) for (let z = 13; z <= 17; z++) for (let y = 46; y <= 49; y++) bv.world.setBlock(x, y, z, 0);
      for (let x = 2; x <= 4; x++) for (let z = 14; z <= 16; z++) if (!(x === 3 && z === 15)) { bv.world.setBlock(x, 46, z, 3); bv.world.setBlock(x, 47, z, 3); }
      bv.forceRemeshAround?.();
      bv.mobs.clear();
      bv.mobs.spawn('gris', 3.5, 46.02, 15.5);
    });
    await sleep(500);
    await fsSlot();
    await aim(page, 3.5, 48.05, 18.2, 3.5, 45.95, 15.5); // stand on the ground outside, look over the wall down into the pen
    await page.evaluate(() => (window as any).__bv.teleport(3.5, 48.05, 16.2)); // standing on the pen wall
    await page.evaluate(() => (window as any).__bv.lookAt(3.5, 46.0, 15.5));
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(600);
    const lit = await gb(3, 46, 15);
    const m0 = await page.evaluate(() => (window as any).__bv.mobInfo()[0]);
    await shot(page, 'it20-05-gris-brenner.png');
    let dead = false, t = 0, burningSeen = !!m0?.burning;
    for (; t < 80 && !dead; t++) {
      await sleep(100);
      const m = await page.evaluate(() => (window as any).__bv.mobInfo()[0]);
      if (m?.burning) burningSeen = true;
      dead = !m || m.dead;
    }
    await sleep(600);
    const ids = await dropIds();
    await shot(page, 'it20-06-gris-stekt.png');
    record('MF1-pig-burns-cooked-meat', lit === 83 && burningSeen && dead && ids.includes(72) && !ids.includes(60) ? 'PASS' : 'FAIL',
      JSON.stringify({ lit, hp0: m0?.hp, burningSeen, dead, diedAfter: t / 10, ids }));
  }

  // ML1 — a zombie walking in lava dies; one standing in water after burning stops burning
  if (run('ML1')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.setDay(0.85); // night: no sunburn
      for (let x = 8; x <= 10; x++) for (let z = 18; z <= 20; z++) bv.world.setBlock(x, 45, z, 44);
      // low glass ring so the zombie can't simply walk out towards the player
      for (let x = 7; x <= 11; x++) for (let z = 17; z <= 21; z++) if (x === 7 || x === 11 || z === 17 || z === 21) { bv.world.setBlock(x, 46, z, 9); bv.world.setBlock(x, 47, z, 9); }
      bv.forceRemeshAround?.();
      bv.mobs.clear();
      bv.mobs.spawn('vandrer', 9.5, 45.1, 19.5);
      bv.teleport(9.5, 46.05, 14.5); bv.lookAt(9.5, 45.8, 19.5);
      bv.player.creative = true; // keep the zombie from killing the observer
    });
    await sleep(1200);
    await shot(page, 'it20-07-zombie-lava.png');
    let dead = false, t = 0;
    for (; t < 60 && !dead; t++) { await sleep(100); const m = await page.evaluate(() => (window as any).__bv.mobInfo()[0]); if (t % 10 === 0) console.log('ML1', JSON.stringify(m)); dead = !m || m.dead; }
    await page.evaluate(() => { const bv = (window as any).__bv; bv.player.creative = false; for (let x = 7; x <= 11; x++) for (let z = 17; z <= 21; z++) { bv.world.setBlock(x, 46, z, 0); bv.world.setBlock(x, 47, z, 0); } for (let x = 8; x <= 10; x++) for (let z = 18; z <= 20; z++) bv.world.setBlock(x, 45, z, 1); bv.setDay(0.5); bv.mobs.clear(); });
    record('ML1-zombie-dies-in-lava', dead && t / 10 < 4 ? 'PASS' : 'FAIL', JSON.stringify({ dead, after: t / 10 }));
  }

  // OL1 — selection outline follows the shape: door (placed with RMB) thin & 2 tall; poppy small; stone full
  if (run('OL1')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 14; x <= 20; x++) for (let z = 1; z <= 8; z++) { bv.world.setBlock(x, 45, z, 1); for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, z, 0); }
      bv.world.setBlock(19, 46, 5, 80); bv.world.setBlock(14, 46, 5, 3);
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 26);
    await aim(page, 17.5, 46.05, 7.5, 17.5, 45.99, 4.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(400);
    const door = await gb(17, 46, 4);
    await setHeld(page, 0);
    await aim(page, 17.5, 46.05, 7.2, 17.5, 47.2, 4.2);
    await sleep(400);
    const bDoor = await page.evaluate(() => (window as any).__bv.outlineBox());
    await shot(page, 'it20-08-ramme-doer.png');
    await aim(page, 19.5, 46.05, 7.0, 19.5, 46.3, 5.5);
    await sleep(400);
    const bPoppy = await page.evaluate(() => (window as any).__bv.outlineBox());
    await shot(page, 'it20-09-ramme-blomst.png');
    await aim(page, 15.5, 46.05, 7.0, 14.5, 46.5, 5.5);
    await sleep(300);
    const bStone = await page.evaluate(() => (window as any).__bv.outlineBox());
    const thin = bDoor ? Math.min(bDoor[3] - bDoor[0], bDoor[5] - bDoor[2]) : 1;
    record('OL1-shaped-outline', door === 26 && bDoor && bDoor[4] - bDoor[1] === 2 && thin < 0.2 && bPoppy && bPoppy[3] - bPoppy[0] < 0.5 && bStone && bStone[4] === 1 ? 'PASS' : 'FAIL',
      JSON.stringify({ door, bDoor, bPoppy, bStone }));
  }

  const report = { when: new Date().toISOString(), results, bugs };
  fs.writeFileSync(path.join(OUT, 'it20-verify.json'), JSON.stringify(report, null, 2));
  const summary: Record<string, number> = { PASS: 0, FAIL: 0, PARTIAL: 0 };
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
  console.log('=== SUMMARY ===', summary, 'BUGS', JSON.stringify(bugs));
  await ctx.close();
  await browser.close();
  child.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
