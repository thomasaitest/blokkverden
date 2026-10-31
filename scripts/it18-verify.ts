/**
 * it18 verify: falling sand, leaf decay, persistent placed leaves (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it18';
const VID = '/tmp/it18-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it18';

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
  await boot(page, base, 'It18Verify');
  await acquireLock(page);
  await sleep(3000);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.5); bv.mobs.clear(); });
  const only = (process.env.BV_ONLY || '').split(',').filter(Boolean);
  const run = (id: string) => !only.length || only.includes(id);
  const gb = (x: number, y: number, z: number) => page.evaluate(({ x, y, z }) => (window as any).__bv.world.getBlock(x, y, z), { x, y, z });
  const meta = (x: number, y: number, z: number) => page.evaluate(({ x, y, z }) => (window as any).__bv.world.getWaterLevel(x, y, z), { x, y, z });
  const dropIds = () => page.evaluate(() => (window as any).__bv.drops.drops.map((d: any) => d.stack.id));
  const clearDrops = () => page.evaluate(() => { (window as any).__bv.drops.drops.length = 0; });

  // FL1 — natural flowers near spawn
  if (run('FL1')) {
    const f = await page.evaluate(() => {
      const bv = (window as any).__bv; const p = bv.player;
      let best: any = null; let n = 0; let badGround = 0;
      for (let dx = -40; dx <= 40; dx++) for (let dz = -40; dz <= 40; dz++) for (let y = 30; y < 100; y++) {
        const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
        const id = bv.world.getBlock(x, y, z);
        if (id !== 79 && id !== 80) continue;
        n++; if (bv.world.getBlock(x, y - 1, z) !== 1) badGround++;
        const d = Math.hypot(dx, dz);
        // camera spot 2.5 blocks away must be open air (eye + feet) with air between
        let open = true;
        for (const [ox, oz] of [[1, 1], [2, 2], [3, 3]]) for (const oy of [0, 1]) if (bv.world.getBlock(x + ox, y + oy, z + oz) !== 0) open = false;
        if (open && (!best || d < best.d)) best = { x, y, z, d, id };
      }
      return { best, n, badGround };
    });
    if (f.best) {
      const b = f.best;
      await aim(page, b.x + 3.5, b.y + 0.05, b.z + 3.5, b.x + 0.5, b.y + 0.35, b.z + 0.5);
      await sleep(1500);
    }
    await shot(page, 'it18-00-blomster-natur.png');
    record('FL1-flowers-generated', f.n >= 3 && f.badGround === 0 ? 'PASS' : 'FAIL', JSON.stringify(f));
  }

  // Arena: stone 40–44, grass 45, open air above.
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    for (let x = -4; x <= 20; x++) for (let z = -4; z <= 22; z++) {
      for (let y = 40; y <= 44; y++) bv.world.setBlock(x, y, z, 3);
      bv.world.setBlock(x, 45, z, 1);
      for (let y = 46; y <= 60; y++) bv.world.setBlock(x, y, z, 0);
    }
    bv.mobs.clear();
    bv.forceRemeshAround?.();
  });
  await sleep(1500);
  await ensureLocked(page);

  // BM0 — craft bone → 3 bone meal in the inventory 2×2 grid (real UI clicks)
  if (run('BM0')) {
    await setHeld(page, 0, { 71: 2 });
    const ok = await uiCraft(page, [71], 2);
    await closeUi(page);
    await ensureLocked(page);
    const meal = await countItem(page, 81), bones = await countItem(page, 71);
    record('BM0-craft-bonemeal', ok && meal === 3 && bones === 1 ? 'PASS' : 'FAIL', `meal=${meal} bones=${bones}`);
  }

  // BM1 — bone meal on a young crop (RMB) → +2..5 stages, one meal used; ripe crop: nothing used
  if (run('BM1')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 4; x <= 8; x++) { bv.world.setBlock(x, 45, 6, 22); bv.world.setBlock(x, 46, 6, 23); bv.world.setMeta(x, 46, 6, 0); }
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 81);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 81, count: 10 }; bv.hud.refreshHotbar(); });
    await aim(page, 6.5, 46.05, 9.5, 6.5, 46.2, 6.5);
    await sleep(700);
    await shot(page, 'it18-01-avling-foer-beinmel.png');
    const s0 = await meta(6, 46, 6);
    await hold(page, 80, 'right'); await sleep(300);
    const s1 = await meta(6, 46, 6), left1 = await countItem(page, 81);
    for (let i = 0; i < 4 && (await meta(6, 46, 6)) < 7; i++) { await hold(page, 80, 'right'); await sleep(250); }
    const s2 = await meta(6, 46, 6), left2 = await countItem(page, 81);
    await hold(page, 80, 'right'); await sleep(250);
    const left3 = await countItem(page, 81);
    await sleep(500);
    await shot(page, 'it18-02-avling-etter-beinmel.png');
    // it25: s0 may already be 1 — the crop can grow by itself (random tick) during the 0.7 s wait; check the jump instead
    const ok = s0 <= 2 && s1 - s0 >= 2 && s1 - s0 <= 5 && left1 === 9 && s2 === 7 && left3 === left2;
    record('BM1-bonemeal-crop', ok ? 'PASS' : 'FAIL', JSON.stringify({ s0, s1, left1, s2, left2, left3 }));
  }

  // BM2 — bone meal on a sapling: RMB until it grows (45 % each), each use costs one
  if (run('BM2')) {
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(12, 46, 12, 76); bv.forceRemeshAround?.(); });
    await setHeld(page, 81);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 81, count: 20 }; bv.hud.refreshHotbar(); });
    await aim(page, 12.5, 46.05, 16.5, 12.5, 46.3, 12.5);
    await sleep(500);
    let uses = 0;
    for (; uses < 15 && (await gb(12, 46, 12)) === 76; uses++) { await hold(page, 80, 'right'); await sleep(250); }
    const grown = (await gb(12, 46, 12)) === 5;
    const left = await countItem(page, 81);
    await aim(page, 12.5, 48.5, 20.5, 12.5, 48.5, 12.5);
    await sleep(1200);
    await shot(page, 'it18-03-spire-beinmel-tre.png');
    record('BM2-bonemeal-sapling', grown && left === 20 - uses ? 'PASS' : 'FAIL', `uses=${uses} grown=${grown} left=${left}`);
  }

  // BM3 — bone meal on a grass block → tall grass (+ maybe flowers) around
  if (run('BM3')) {
    await setHeld(page, 81);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 81, count: 5 }; bv.hud.refreshHotbar(); });
    const plantsAround = () => page.evaluate(() => { const bv = (window as any).__bv; let n = 0; for (let x = 0; x <= 8; x++) for (let z = 12; z <= 20; z++) { const id = bv.world.getBlock(x, 46, z); if (id === 78 || id === 79 || id === 80) n++; } return n; });
    const before = await plantsAround();
    await aim(page, 4.5, 46.05, 20.5, 4.5, 45.9, 16.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(250);
    await hold(page, 80, 'right'); await sleep(400);
    const after = await plantsAround();
    const left = await countItem(page, 81);
    await aim(page, 4.5, 47.5, 22.5, 4.5, 46.0, 16.5);
    await sleep(1000);
    await shot(page, 'it18-04-gress-beinmel.png');
    record('BM3-bonemeal-grass', before === 0 && after >= 4 && left <= 4 ? 'PASS' : 'FAIL', `before=${before} after=${after} left=${left}`);
  }

  // FL2 — flowers: place on grass (RMB), not on stone; LMB breaks instantly → flower item
  if (run('FL2')) {
    await clearDrops();
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(16, 45, 4, 3); bv.forceRemeshAround?.(); });
    await setHeld(page, 79);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 79, count: 2 }; bv.inv.slots[1] = { id: 80, count: 1 }; bv.hud.refreshHotbar(); });
    await aim(page, 14.5, 46.05, 7.5, 14.5, 45.99, 4.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(250);
    const onGrass = await gb(14, 46, 4);
    await aim(page, 16.5, 46.05, 7.5, 16.5, 45.99, 4.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(250);
    const onStone = await gb(16, 46, 4);
    await page.keyboard.press('Digit2'); await sleep(150);
    await aim(page, 15.5, 46.05, 7.5, 15.5, 45.99, 4.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    const poppy = await gb(15, 46, 4);
    await aim(page, 14.5, 46.6, 6.5, 15.0, 46.3, 4.5);
    await sleep(800);
    await shot(page, 'it18-05-blomster-plassert.png');
    await setHeld(page, 0);
    await aim(page, 14.5, 46.05, 7.5, 14.5, 46.3, 4.5);
    await sleep(200);
    await hold(page, 150); await sleep(300);
    const broken = await gb(14, 46, 4);
    const ids = await dropIds();
    console.log('FL2 drops', JSON.stringify(await page.evaluate(() => (window as any).__bv.drops.drops.map((d: any) => [d.stack.id, Math.round(d.x), Math.round(d.y), Math.round(d.z)]))));
    record('FL2-place-break-flower', onGrass === 79 && onStone === 0 && poppy === 80 && broken === 0 && ids.includes(79) ? 'PASS' : 'FAIL', JSON.stringify({ onGrass, onStone, poppy, broken, ids }));
  }

  // W1 — flowing water washes away tall grass, a torch and a flower as items
  if (run('W1')) {
    await clearDrops();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      // basin: stone walls around x 2..8, z 0..2 on the grass at 45
      for (let x = 1; x <= 9; x++) for (let z = -1; z <= 3; z++) if (x === 1 || x === 9 || z === -1 || z === 3) bv.world.setBlock(x, 46, z, 3);
      bv.world.setBlock(4, 46, 1, 78); bv.world.setBlock(5, 46, 1, 12); bv.world.setBlock(6, 46, 1, 79);
      bv.world.setWater(3, 46, 1, 7);
      for (let y = 46; y <= 48; y++) bv.world.setBlock(5, y, 6, 3); // viewing pillar
      bv.forceRemeshAround?.();
    });
    await aim(page, 5.5, 49.05, 6.5, 5.5, 46.3, 1.5);
    await sleep(600);
    await shot(page, 'it18-06-vann-foer.png');
    let t = 0;
    for (; t < 30; t++) { await sleep(1000); const all = [await gb(4, 46, 1), await gb(5, 46, 1), await gb(6, 46, 1)]; if (all.every((v) => v === 10)) break; }
    const cells = [await gb(4, 46, 1), await gb(5, 46, 1), await gb(6, 46, 1)];
    const ids = await dropIds();
    await aim(page, 5.5, 49.05, 6.5, 5.5, 46.3, 1.5);
    await sleep(500);
    await shot(page, 'it18-07-vann-etter.png');
    record('W1-water-washes-plants', cells.every((v) => v === 10) && ids.includes(12) && ids.includes(79) ? 'PASS' : 'FAIL', `t=${t}s cells=${cells} drops=${ids}`);
  }

  // PC1 — break particles take the block's colour (LMB on leaves → green, sand → sandy)
  if (run('PC1')) {
    const cols = await page.evaluate(() => { const f = (window as any).__bvParticleColor; return { leaves: f(7), sand: f(8), stone: f(3), dirt: f(2) }; });
    const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const L = rgb(cols.leaves), S = rgb(cols.sand), St = rgb(cols.stone);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); for (let y = 46; y <= 48; y++) bv.world.setBlock(10, y, 18, 7); bv.forceRemeshAround?.(); });
    await setHeld(page, 0);
    await aim(page, 10.5, 46.05, 21.0, 10.5, 46.5, 18.5);
    await sleep(400);
    await page.mouse.down();
    let caught = false;
    for (let i = 0; i < 20; i++) { await sleep(40); if ((await gb(10, 46, 18)) === 0) { caught = true; break; } }
    await page.mouse.up();
    const nPart = await page.evaluate(() => (window as any).__bv.particleCount?.() ?? -1);
    await shot(page, 'it18-08-partikler-loev.png');
    console.log('particles alive', nPart);
    const greenOk = L[1] > L[0] && L[1] > L[2];
    const sandOk = S[0] > 150 && S[1] > 130;
    const stoneOk = Math.abs(St[0] - St[1]) < 15;
    record('PC1-particle-colours', caught && greenOk && sandOk && stoneOk ? 'PASS' : 'FAIL', JSON.stringify({ caught, leaves: L, sand: S, stone: St }));
  }

  const report = { when: new Date().toISOString(), results, bugs };
  fs.writeFileSync(path.join(OUT, 'it18-verify.json'), JSON.stringify(report, null, 2));
  const summary: Record<string, number> = { PASS: 0, FAIL: 0, PARTIAL: 0 };
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
  console.log('=== SUMMARY ===', summary, 'BUGS', JSON.stringify(bugs));
  await ctx.close();
  await browser.close();
  child.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
