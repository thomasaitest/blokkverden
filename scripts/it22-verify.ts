/**
 * it22 verify: falling sand entity, flat ladders, rain stops at roofs, mobs avoid fire/lava, double tall grass (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it22';
const VID = '/tmp/it22-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it22';

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
  await boot(page, base, 'It22Verify');
  await acquireLock(page);
  await sleep(3000);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.5); bv.mobs.clear(); bv.setWeather('clear', 0); });
  const only = (process.env.BV_ONLY || '').split(',').filter(Boolean);
  const run = (id: string) => !only.length || only.includes(id);
  const gb = (x: number, y: number, z: number) => page.evaluate(({ x, y, z }) => (window as any).__bv.world.getBlock(x, y, z), { x, y, z });
  const gm = (x: number, y: number, z: number) => page.evaluate(({ x, y, z }) => (window as any).__bv.world.getWaterLevel(x, y, z), { x, y, z });
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
  const heal = () => page.evaluate(() => { const bv = (window as any).__bv; bv.player.health = 20; bv.player.hunger = 20; bv.burn.burnTime = 0; bv.player.creative = false; });

  // LP1 — a ladder hangs on a stone wall; mine the wall block from the other side (real LMB, iron pickaxe) → the ladder pops off as an item
  if (run('LP1')) {
    await heal(); await clearDrops();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 3; x <= 7; x++) for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, 12, 3); // wall at z=12
      for (let y = 46; y <= 48; y++) { bv.world.setBlock(5, y, 11, 33); bv.world.setMeta(5, y, 11, 4); } // ladders on the wall's −Z face (wall dir +Z)
      bv.world.setBlock(4, 46, 11, 33); bv.world.setMeta(4, 46, 11, 4); // control ladder on a wall block that stays
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 108);
    await aim(page, 5.5, 46.05, 8.8, 5.5, 47.5, 11.2);
    await sleep(400);
    await shot(page, 'it22-01-stiger-paa-vegg.png');
    // go round to the back (+Z side) and mine the middle wall block (5,47,12)
    await aim(page, 5.5, 46.05, 14.6, 5.5, 47.5, 13.0);
    await sleep(300);
    const tgt = await page.evaluate(() => (window as any).__bv.targetHit());
    await hold(page, 1500, 'left'); await sleep(400);
    const wall = await gb(5, 47, 12), lad = [await gb(5, 46, 11), await gb(5, 47, 11), await gb(5, 48, 11)], ctrl = await gb(4, 46, 11);
    const ids = await dropIds();
    await aim(page, 5.5, 46.05, 8.8, 5.5, 47.5, 11.2);
    await sleep(500);
    await shot(page, 'it22-02-stige-falt-av.png');
    record('LP1-ladder-pops-when-wall-mined', tgt?.x === 5 && tgt?.y === 47 && tgt?.z === 12 && wall === 0 && lad.join() === '33,0,33' && ctrl === 33
      && ids.filter((i: number) => i === 33).length === 1 ? 'PASS' : 'FAIL', JSON.stringify({ tgt, wall, lad, ctrl, ids }));
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 3; x <= 7; x++) for (let y = 46; y <= 48; y++) { bv.world.setBlock(x, y, 12, 0); bv.world.setBlock(x, y, 11, 0); } });
  }

  // TP1 — a torch on top of a sand column: mine the dirt under the column (real LMB, shovel) → the sand falls and the torch pops off as an item
  if (run('TP1')) {
    await heal(); await clearDrops();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.world.setBlock(10, 46, 4, 3); bv.world.setBlock(10, 47, 4, 2); // stone, dirt
      bv.world.setBlock(10, 48, 4, 8); bv.world.setBlock(10, 49, 4, 8); bv.world.setBlock(10, 50, 4, 12); // sand ×2 + torch
      bv.world.setBlock(10, 46, 4, 0); // hole under the dirt so the column can fall
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 110);
    await aim(page, 12.5, 47.5, 8.5, 10.5, 49.0, 4.5);
    await sleep(500);
    await shot(page, 'it22-03-fakkel-paa-sand.png');
    await aim(page, 10.5, 46.05, 7.6, 10.5, 47.5, 5.0);
    await sleep(300);
    const tgt = await page.evaluate(() => (window as any).__bv.targetHit());
    // hold LMB only until the dirt breaks (keeping it held would go on to mine the sand that lands)
    await page.mouse.down();
    let saw = false;
    for (let i = 0; i < 80; i++) { await sleep(20); if ((await gb(10, 47, 4)) !== 2) { await page.mouse.up(); break; } }
    await page.mouse.up();
    for (let i = 0; i < 40; i++) { const n = await page.evaluate(() => (window as any).__bv.falling().length); if (n) saw = true; else if (saw) break; await sleep(30); }
    await sleep(500);
    const col = [await gb(10, 46, 4), await gb(10, 47, 4), await gb(10, 48, 4), await gb(10, 49, 4), await gb(10, 50, 4)];
    const ids = await dropIds();
    await aim(page, 12.5, 47.5, 8.5, 10.5, 48.0, 4.5);
    await sleep(400);
    await shot(page, 'it22-04-fakkel-falt-av.png');
    record('TP1-torch-on-falling-sand-pops', tgt?.y === 47 && saw && col.join() === '8,8,0,0,0' && ids.includes(12) && ids.includes(2) ? 'PASS' : 'FAIL', JSON.stringify({ tgt, saw, col, ids }));
    await page.evaluate(() => { const bv = (window as any).__bv; for (let y = 46; y <= 50; y++) bv.world.setBlock(10, y, 4, 0); });
  }

  // DG2 — sand placed (real RMB) above double tall grass falls through both halves and destroys the plant (no sand item)
  if (run('DG2')) {
    await heal(); await clearDrops();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.world.setBlock(14, 46, 4, 84); bv.world.setBlock(14, 47, 4, 85);
      bv.world.setBlock(14, 50, 3, 3); // floating stone; sand goes on its +Z side at (14,50,4)
      bv.world.setBlock(14, 48, 7, 3); // stand
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 8);
    await aim(page, 14.5, 49.05, 7.5, 14.5, 50.5, 3.98);
    await sleep(300);
    await hold(page, 80, 'right');
    let saw = false;
    for (let i = 0; i < 40; i++) { await sleep(50); const n = await page.evaluate(() => (window as any).__bv.falling().length); if (n) saw = true; else if (saw) break; }
    await sleep(500);
    const col = [await gb(14, 46, 4), await gb(14, 47, 4), await gb(14, 50, 4)];
    const ids = await dropIds();
    record('DG2-sand-through-double-grass', saw && col.join() === '8,0,0' && !ids.includes(8) ? 'PASS' : 'FAIL', JSON.stringify({ saw, col, ids }));
    await page.evaluate(() => { const bv = (window as any).__bv; for (const [x, y, z] of [[14, 46, 4], [14, 50, 3], [14, 48, 7]]) bv.world.setBlock(x, y, z, 0); });
  }

  // SH1 — craft shears in the 2×2 grid (real UI clicks), shear leaves (LMB → leaves block, fast), cut tall grass (→ tall grass item), place it (RMB)
  if (run('SH1')) {
    await heal(); await clearDrops();
    await setHeld(page, 0, { 53: 2 });
    await page.keyboard.press('KeyE'); await sleep(400);
    const ok = await uiCraft(page, [0, 53, 53, 0], 2);
    await sleep(200);
    await shot(page, 'it22-05-saks-laget.png');
    await closeUi(page);
    await ensureLocked(page);
    const shears = await countItem(page, 86);
    // move shears into slot 0
    await page.evaluate(() => { const bv = (window as any).__bv; const i = bv.inv.slots.findIndex((s: any) => s?.id === 86); if (i > 0) { bv.inv.slots[0] = bv.inv.slots[i]; bv.inv.slots[i] = null; } bv.inv.selected = 0; bv.hud.refreshHotbar(); });
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 6; x <= 8; x++) for (let y = 46; y <= 47; y++) bv.world.setBlock(x, y, 4, 7);
      bv.world.setBlock(4, 46, 6, 78);
      bv.forceRemeshAround?.();
    });
    await aim(page, 7.5, 46.05, 7.6, 7.5, 46.5, 5.0);
    await sleep(300);
    const t0 = Date.now();
    await page.mouse.down();
    let gone = 0;
    for (let i = 0; i < 40; i++) { await sleep(25); if ((await gb(7, 46, 4)) === 0) { gone = Date.now() - t0; break; } }
    await page.mouse.up(); await sleep(300);
    const leafDrops = (await dropIds()).filter((i: number) => i === 7).length;
    await clearDrops();
    await aim(page, 4.5, 46.05, 8.6, 4.5, 46.3, 6.5);
    await sleep(300);
    await hold(page, 150, 'left'); await sleep(300);
    const grassItem = (await dropIds()).filter((i: number) => i === 78).length;
    // pick it up (walk over it) then place it with RMB on the grass
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(4.5, 46.05, 6.5); });
    await sleep(1200);
    const have78 = await countItem(page, 78);
    await page.evaluate(() => { const bv = (window as any).__bv; const i = bv.inv.slots.findIndex((s: any) => s?.id === 78); bv.inv.selected = i < 9 ? i : bv.inv.selected; bv.hud.refreshHotbar(); });
    const sel = await page.evaluate(() => (window as any).__bv.inv.selected);
    await aim(page, 2.5, 46.05, 9.5, 2.5, 45.9, 7.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(300);
    const placed = await gb(2, 46, 7);
    await aim(page, 3.5, 46.6, 10.5, 4.5, 46.2, 6.5);
    await sleep(400);
    await shot(page, 'it22-06-saks-loev-gress.png');
    const dur = await page.evaluate(() => (window as any).__bv.inv.slots[0]?.durability);
    record('SH1-shears', ok && shears === 1 && gone > 0 && gone < 400 && leafDrops === 1 && grassItem === 1 && have78 === 1 && sel < 9 && placed === 78 && dur === 236 ? 'PASS' : 'FAIL',
      JSON.stringify({ ok, shears, gone, leafDrops, grassItem, have78, sel, placed, dur }));
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 0; x <= 10; x++) for (let z = 0; z <= 10; z++) for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, z, 0); });
  }

  // RB1 — rain puts out burning: player burning under a roof keeps burning; walks out (real W) into the rain → out. Same for pigs.
  if (run('RB1')) {
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 1; x <= 9; x++) for (let z = 12; z <= 20; z++) bv.world.setBlock(x, 50, z, 3); // roof
      bv.forceRemeshAround?.();
      bv.mobs.clear();
      bv.mobs.spawn('gris', 5.5, 46.02, 17.5); bv.mobs.spawn('gris', 14.5, 46.02, 17.5);
      for (const m of bv.mobs.mobs) { m.burn = { burnTime: 8, hotAcc: 0, burnAcc: 0 }; m.burning = true; m.hp = 100; }
      bv.setWeather('rain', 1);
    });
    await setHeld(page, 0);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(5.5, 46.05, 14.5); bv.look(0, 0); bv.burn.burnTime = 8; bv.player.health = 20; });
    await sleep(1500);
    const under = await page.evaluate(() => (window as any).__bv.burn.burnTime);
    const pigs1 = await page.evaluate(() => (window as any).__bv.mobInfo().map((m: any) => +m.burnTime.toFixed(1)));
    await page.evaluate(() => { const bv = (window as any).__bv; bv.lookAt(5.5, 46.8, 4.5); });
    await shot(page, 'it22-07-brenner-under-tak.png');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.look(0, 0); bv.burn.burnTime = Math.max(bv.burn.burnTime, 6); });
    await walk(page, 'KeyW', 1100);
    await sleep(400);
    const out = await page.evaluate(() => { const bv = (window as any).__bv; return { bt: bv.burn.burnTime, z: bv.player.z }; });
    const pigs2 = await page.evaluate(() => (window as any).__bv.mobInfo().map((m: any) => ({ x: +m.x.toFixed(1), z: +m.z.toFixed(1), bt: +m.burnTime.toFixed(1) })));
    await page.evaluate(() => { const bv = (window as any).__bv; bv.lookAt(5.5, 47, 17.5); });
    await sleep(300);
    await shot(page, 'it22-08-regn-slukker.png');
    console.log('RB1 at shot', JSON.stringify(await page.evaluate(() => (window as any).__bv.mobInfo())));
    const roofPig = pigs2.find((p: any) => p.x > 1 && p.x < 10 && p.z > 12 && p.z < 21);
    const skyPig = pigs2.find((p: any) => p.x > 11);
    record('RB1-rain-puts-out-burning', under > 5 && out.z < 11.5 && out.bt === 0 && pigs1[1] === 0 && !!roofPig && roofPig.bt > 3 && !!skyPig && skyPig.bt === 0 ? 'PASS' : 'FAIL',
      JSON.stringify({ under, out, pigs1, pigs2 }));
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); bv.setWeather('clear', 0); bv.burn.burnTime = 0; for (let x = 1; x <= 9; x++) for (let z = 12; z <= 20; z++) bv.world.setBlock(x, 50, z, 0); });
    await sleep(300);
  }

  // FB3 — fire (real flint and steel RMB) burns a plank that holds sand with a torch on top → the sand falls, the torch pops
  if (run('FB3')) {
    await heal(); await clearDrops();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (const [x, y, z] of [[16, 46, 16], [16, 47, 16], [16, 48, 16]]) bv.world.setBlock(x, y, z, 0);
      bv.world.setBlock(16, 46, 16, 6); bv.world.setBlock(16, 47, 16, 8); bv.world.setBlock(16, 48, 16, 12);
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 82);
    let burnt = false, tries = 0;
    for (; tries < 4 && !burnt; tries++) {
      await aim(page, 18.6, 46.05, 16.5, 17.5, 45.9, 16.5); // grass top right next to the plank
      await sleep(250);
      await hold(page, 80, 'right');
      for (let i = 0; i < 40; i++) { await sleep(250); if ((await gb(16, 46, 16)) !== 6) { burnt = true; break; } }
    }
    let saw = false;
    for (let i = 0; i < 40; i++) { const n = await page.evaluate(() => (window as any).__bv.falling().length); if (n) saw = true; else if (saw) break; await sleep(30); }
    await sleep(500);
    const col = [await gb(16, 46, 16), await gb(16, 47, 16), await gb(16, 48, 16)];
    const ids = await dropIds();
    await aim(page, 19.5, 47.2, 19.5, 16.5, 46.5, 16.5);
    await sleep(300);
    await shot(page, 'it22-09-brent-planke-sand.png');
    record('FB3-burnt-support-drops-sand-pops-torch', burnt && col[0] === 8 && col[1] === 0 && col[2] === 0 && ids.includes(12) ? 'PASS' : 'FAIL', JSON.stringify({ burnt, tries, saw, col, ids }));
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 14; x <= 19; x++) for (let z = 14; z <= 19; z++) for (let y = 46; y <= 49; y++) bv.world.setBlock(x, y, z, 0); });
  }

  // FN1 — fences are 1.5 tall (MC): holding W + Space against a fence line can't get over it; a sheep in a 1×1 pen stays inside;
  // RMB opens the gate and you walk through
  if (run('FN1')) {
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 0; x <= 16; x++) for (let z = 4; z <= 14; z++) for (let y = 46; y <= 49; y++) bv.world.setBlock(x, y, z, 0);
      for (let x = 0; x <= 16; x++) bv.world.setBlock(x, 46, 8, x === 8 ? 29 : 28); // fence line along z=8 with a gate at x=8
      bv.world.setMeta(8, 46, 8, 0);
      for (let x = 11; x <= 13; x++) for (let z = 3; z <= 5; z++) if (x !== 12 || z !== 4) bv.world.setBlock(x, 46, z, 28); // 1×1 pen
      bv.forceRemeshAround?.();
      bv.mobs.clear();
      bv.mobs.spawn('sau', 12.5, 46.02, 4.5);
    });
    await setHeld(page, 0);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(4.5, 46.05, 10.5); bv.look(0, 0); });
    await sleep(300);
    let minZ = 99;
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 12; i++) { await page.keyboard.down('Space'); await sleep(120); await page.keyboard.up('Space'); await sleep(130); const pp = await page.evaluate(() => { const p = (window as any).__bv.player; return [+p.y.toFixed(2), +p.z.toFixed(2), p.flying, p.creative, (window as any).__bv.world.getBlock(4, 46, 8)]; }); console.log('FN1', JSON.stringify(pp)); minZ = Math.min(minZ, pp[1] as number); }
    await page.keyboard.up('KeyW');
    const p1 = await st(page);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.lookAt(4.5, 46.8, 7.0); });
    await sleep(300);
    await shot(page, 'it22-13-gjerde-hopp.png');
    // sheep pen: 8 s
    const sheepPos: number[][] = [];
    for (let i = 0; i < 16; i++) { await sleep(500); sheepPos.push(await page.evaluate(() => { const m = (window as any).__bv.mobs.mobs[0]; return [+m.x.toFixed(2), +m.y.toFixed(2), +m.z.toFixed(2)]; })); }
    const stayed = sheepPos.every(([x, y, z]) => x > 12 && x < 13 && z > 4 && z < 5 && y < 46.5);
    // open the gate (RMB) and walk through
    await aim(page, 8.5, 46.05, 10.2, 8.5, 46.5, 8.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    const gateMeta = await page.evaluate(() => (window as any).__bv.world.getWaterLevel(8, 46, 8));
    await page.evaluate(() => { const bv = (window as any).__bv; bv.look(0, 0); });
    await walk(page, 'KeyW', 1000);
    const p2 = await st(page);
    record('FN1-fence-1.5-tall', minZ > 8.9 && p1.y < 46.6 && stayed && (gateMeta & 1) === 1 && p2.z < 7.5 ? 'PASS' : 'FAIL',
      JSON.stringify({ minZ: +minZ.toFixed(2), p1y: +p1.y.toFixed(2), stayed, sheep: sheepPos.slice(-3), gateMeta, p2z: +p2.z.toFixed(2) }));
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); for (let x = 0; x <= 16; x++) for (let z = 2; z <= 14; z++) for (let y = 46; y <= 49; y++) bv.world.setBlock(x, y, z, 0); });
  }

  // SS1 — shears on a sheep (real RMB) → 1–3 wool, the sheep is shorn (slim, skin-coloured); a 2nd click gives nothing; it eats grass → wool back
  if (run('SS1')) {
    await heal(); await clearDrops();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 10; x <= 14; x++) for (let z = 12; z <= 16; z++) for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, z, 0);
      for (let x = 11; x <= 13; x++) for (let z = 13; z <= 15; z++) if (x !== 12 || z !== 14) bv.world.setBlock(x, 46, z, 28); // fence ring, 1×1 pen
      bv.world.setBlock(12, 46, 16, 3); // a step to stand on
      bv.forceRemeshAround?.();
      bv.mobs.clear();
      bv.mobs.spawn('sau', 12.5, 46.02, 14.5);
      bv.mobs.spawn('sau', 6.5, 46.02, 18.5); // woolly control sheep
      bv.mobs.sheepEatSeconds = 1e9;
    });
    await setHeld(page, 86);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0].durability = 238; bv.hud.refreshHotbar(); });
    const aimSheep = () => page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs[0]; bv.teleport(12.5, 47.05, 16.6); bv.lookAt(m.x, m.y + 0.5, m.z); });
    await aimSheep(); await sleep(600);
    await shot(page, 'it22-10-sau-med-ull.png');
    await aimSheep(); await sleep(100);
    console.log('SS1 pick', JSON.stringify(await page.evaluate(() => { const bv = (window as any).__bv; const p = bv.player; const m = bv.mobs.pickAt(p.x, p.y + 1.62, p.z, 3.2, p.yaw, p.pitch); const s = bv.mobs.mobs[0]; return { m: m && [m.kind, m.x, m.y, m.z], s: [s.x, s.y, s.z], p: [p.x, p.y, p.z, p.yaw, p.pitch], locked: bv.input.pointerLocked, held: bv.inv.slots[bv.inv.selected] }; })));
    await hold(page, 80, 'right'); await sleep(700);
    const wool1 = (await dropIds()).filter((i: number) => i === 59).length;
    const st1 = await page.evaluate(() => { const bv = (window as any).__bv; return { sh: bv.mobs.mobs.map((m: any) => !!m.sheared), dur: bv.inv.slots[0]?.durability }; });
    await aimSheep(); await sleep(400);
    await shot(page, 'it22-11-sau-klippet.png');
    await hold(page, 80, 'right'); await sleep(500);
    const wool2 = (await dropIds()).filter((i: number) => i === 59).length;
    // let it graze: shorn sheep eats the grass under it → dirt, wool back
    await page.evaluate(() => { const bv = (window as any).__bv; const prev = bv.mobs.onGrassEaten; bv.mobs.onGrassEaten = (x: number, y: number, z: number) => { (window as any).__eaten = [x, y, z]; prev?.(x, y, z); }; bv.mobs.sheepEatSeconds = 0.5; });
    let regrown = false, dirt = 0;
    for (let i = 0; i < 40 && !regrown; i++) {
      await sleep(250);
      const r = await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs[0]; return { sh: !!m.sheared, g: bv.world.getBlock(Math.floor(m.x), 45, Math.floor(m.z)) }; });
      if (!r.sh) { regrown = true; const e = await page.evaluate(() => (window as any).__eaten); dirt = e ? await gb(e[0], e[1], e[2]) : -1; console.log('SS1 eaten', JSON.stringify(e)); }
    }
    await page.evaluate(() => { (window as any).__bv.mobs.sheepEatSeconds = 1e9; });
    await aimSheep(); await sleep(400);
    await shot(page, 'it22-12-sau-spiste-gress.png');
    record('SS1-shear-sheep', wool1 >= 1 && wool1 <= 3 && st1.sh[0] === true && st1.sh[1] === false && st1.dur === 237 && wool2 === wool1 && regrown && dirt === 2 ? 'PASS' : 'FAIL',
      JSON.stringify({ wool1, st1, wool2, regrown, dirt }));
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); for (let x = 10; x <= 14; x++) for (let z = 12; z <= 17; z++) { bv.world.setBlock(x, 45, z, 1); for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, z, 0); } });
  }

  const sum = { PASS: 0, FAIL: 0, PARTIAL: 0, UNTESTED: 0 } as Record<Status, number>;
  for (const r of results) sum[r.status]++;
  console.log('\n=== SUMMARY ===', sum);
  console.log('BUGS', JSON.stringify(bugs));
  await ctx.close();
  await browser.close();
  child.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
