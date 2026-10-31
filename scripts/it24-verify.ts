/**
 * it24 verify: falling water dries up, flowing lava (spreads 3, recedes), cobblestone generator, lava onto water → stone, fence model (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it24';
const VID = '/tmp/it24-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it24';

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
  await boot(page, base, 'It24Verify');
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

  const held = () => page.evaluate(() => { const s = (window as any).__bv.inv.held(); return s ? { id: s.id, count: s.count } : null; });
  const waterCount = (y: number, x0: number, x1: number, z0: number, z1: number) => page.evaluate(({ y, x0, x1, z0, z1 }) => {
    const w = (window as any).__bv.world; let n = 0;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (w.getBlock(x, y, z) === 10) n++;
    return n;
  }, { y, x0, x1, z0, z1 });

  const resetArena = async () => {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = -4; x <= 22; x++) for (let z = -4; z <= 22; z++) {
        for (let y = 40; y <= 44; y++) bv.world.setBlock(x, y, z, 3);
        bv.world.setBlock(x, 45, z, 1);
        for (let y = 46; y <= 52; y++) bv.world.setBlock(x, y, z, 0);
      }
      bv.forceRemeshAround?.();
    });
    await sleep(600);
  };
  const lavaCount = (y: number, x0: number, x1: number, z0: number, z1: number) => page.evaluate(({ y, x0, x1, z0, z1 }) => {
    const w = (window as any).__bv.world; let n = 0;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (w.getBlock(x, y, z) === 44) n++;
    return n;
  }, { y, x0, x1, z0, z1 });

  // FW1 — water poured on a pillar falls down (level 8), spreads at the bottom; scoop the source → ALL of it dries up (it23: stayed forever)
  if (run('FW1')) {
    await resetArena();
    await heal();
    await page.evaluate(() => { const bv = (window as any).__bv; for (let y = 46; y <= 47; y++) { bv.world.setBlock(10, y, 8, 3); bv.world.setBlock(10, y, 12, 3); } bv.forceRemeshAround?.(); });
    await setHeld(page, 88);
    await aim(page, 10.5, 48.05, 12.5, 10.5, 47.95, 8.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(300);
    const src = await gb(10, 48, 8), srcLvl = await gm(10, 48, 8);
    await sleep(6000);
    const bottom = await waterCount(46, 2, 18, 0, 16), fall = await gm(11, 47, 8);
    await aim(page, 10.5, 47.0, 17.5, 10.5, 46.5, 8.5);
    await sleep(500);
    await shot(page, 'it24-01-foss-fra-soyle.png');
    await setHeld(page, 87);
    await aim(page, 10.5, 48.05, 12.5, 10.5, 48.5, 8.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    const h = await held();
    let left = 99;
    for (let i = 0; i < 40 && left > 0; i++) {
      await sleep(500);
      left = 0; for (let y = 46; y <= 48; y++) left += await waterCount(y, 0, 20, -2, 18);
    }
    await aim(page, 10.5, 47.0, 17.5, 10.5, 46.5, 8.5);
    await sleep(500);
    await shot(page, 'it24-02-foss-torket-opp.png');
    record('FW1-falling-water-dries', src === 10 && srcLvl === 7 && bottom >= 8 && fall === 8 && h?.id === 88 && left === 0 ? 'PASS' : 'FAIL',
      JSON.stringify({ src, srcLvl, bottom, fall, h, left }));
    await page.evaluate(() => { const bv = (window as any).__bv; for (let y = 46; y <= 48; y++) { bv.world.setBlock(10, y, 8, 0); bv.world.setBlock(10, y, 12, 0); } });
  }

  // LV1 — lava poured on the ground flows 3 blocks (slowly), lower at the edges; scoop the source → the flow recedes and vanishes
  if (run('LV1')) {
    await resetArena();
    await heal();
    await setHeld(page, 89);
    await aim(page, 5.5, 46.05, 9.6, 5.5, 45.95, 5.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(300);
    const placed = await gb(5, 46, 5), meta0 = await gm(5, 46, 5);
    const early = await lavaCount(46, 0, 10, 0, 10);
    await sleep(6500);
    const full = await lavaCount(46, 0, 10, 0, 10), m1 = await gm(6, 46, 5), m3 = await gm(8, 46, 5), out = await gb(9, 46, 5);
    await aim(page, 5.5, 47.6, 10.5, 5.5, 46.0, 5.5);
    await sleep(500);
    await shot(page, 'it24-03-lava-renner.png');
    await setHeld(page, 87);
    await aim(page, 5.5, 46.05, 9.6, 5.5, 46.5, 5.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    const h = await held();
    let left = 99;
    for (let i = 0; i < 30 && left > 0; i++) { await sleep(500); left = await lavaCount(46, 0, 10, 0, 10); }
    await aim(page, 5.5, 47.6, 10.5, 5.5, 46.0, 5.5);
    await sleep(500);
    await shot(page, 'it24-04-lava-trukket-tilbake.png');
    const hp = await page.evaluate(() => (window as any).__bv.player.health);
    record('LV1-lava-flows-recedes', placed === 44 && meta0 === 0 && early <= 5 && full === 25 && m1 === 6 && m3 === 2 && out === 0 && h?.id === 89 && left === 0 && hp === 20 ? 'PASS' : 'FAIL',
      JSON.stringify({ placed, meta0, early, full, m1, m3, out, h, left, hp }));
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 0; x <= 10; x++) for (let z = 0; z <= 10; z++) bv.world.setBlock(x, 46, z, 0); bv.fire?.clear?.(); });
  }

  // CB1 — cobblestone generator: lava at one end of a trench, water at the other → cobblestone where they meet; mine it (real LMB) and it forms again
  if (run('CB1')) {
    await resetArena();
    await heal();
    await clearDrops();
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 2; x <= 10; x++) bv.world.setBlock(x, 45, 14, 0); bv.forceRemeshAround?.(); });
    await setHeld(page, 89);
    await aim(page, 2.5, 46.05, 15.6, 2.5, 44.95, 14.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(300);
    const lava = await gb(2, 45, 14);
    await setHeld(page, 88);
    await aim(page, 10.5, 46.05, 15.6, 10.5, 44.95, 14.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(300);
    const water = await gb(10, 45, 14);
    const row = () => page.evaluate(() => { const w = (window as any).__bv.world; const a: number[] = []; for (let x = 2; x <= 10; x++) a.push(w.getBlock(x, 45, 14)); return a; });
    let r = await row();
    for (let i = 0; i < 20 && !r.includes(4); i++) { await sleep(500); r = await row(); }
    await sleep(2000); r = await row();
    const cx = 2 + r.indexOf(4);
    await aim(page, 6.5, 47.0, 17.5, 6.5, 45.0, 14.5);
    await sleep(500);
    await shot(page, 'it24-05-brosteinsgenerator.png');
    // mine it with an iron pickaxe (real LMB hold)
    await setHeld(page, 108);
    await aim(page, cx + 0.5, 46.05, 15.6, cx + 0.5, 45.5, 14.5);
    await sleep(200);
    const tgt = await page.evaluate(() => (window as any).__bv.targetHit());
    await hold(page, 900, 'left'); await sleep(300);
    // it26: an iron pickaxe mines cobblestone in ~0.4 s and the generator can refill within the 900 ms hold, so a
    // cobble at cx right after can be a new one (then ≥2 were mined)
    const mined = await gb(cx, 45, 14);
    await sleep(1500);
    const got = (await countItem(page, 4)) + (await dropIds()).filter((d: number) => d === 4).length;
    let again = await row();
    for (let i = 0; i < 16 && !again.includes(4); i++) { await sleep(500); again = await row(); }
    await aim(page, 6.5, 47.0, 17.5, 6.5, 45.0, 14.5);
    await sleep(400);
    await shot(page, 'it24-06-brostein-igjen.png');
    const obs = r.includes(43) || again.includes(43);
    record('CB1-cobble-generator', lava === 44 && water === 10 && cx >= 3 && cx <= 9 && (mined !== 4 || got >= 2) && got >= 1 && again.includes(4) && !obs && r[0] === 44 ? 'PASS' : 'FAIL',
      JSON.stringify({ lava, water, r, cx, tgt, mined, got, again }));
  }

  // ST1 — lava poured above a water pool falls onto it and turns the water into stone
  if (run('ST1')) {
    await resetArena();
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.world.setBlock(16, 45, 4, 0); bv.world.setWater(16, 45, 4, 7);
      bv.world.setBlock(17, 46, 4, 3); bv.world.setBlock(17, 47, 4, 3);
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 89);
    await aim(page, 12.4, 46.05, 4.5, 16.99, 47.5, 4.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(300);
    const poured = await gb(16, 47, 4);
    let cell = 10;
    for (let i = 0; i < 12 && cell !== 3; i++) { await sleep(500); cell = await gb(16, 45, 4); }
    await aim(page, 12.5, 47.5, 7.5, 16.5, 45.5, 4.5);
    await sleep(500);
    await shot(page, 'it24-07-lava-pa-vann-stein.png');
    await setHeld(page, 87);
    await aim(page, 12.4, 46.05, 4.5, 16.5, 47.5, 4.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    const h = await held();
    record('ST1-lava-onto-water-stone', poured === 44 && cell === 3 && h?.id === 89 ? 'PASS' : 'FAIL', JSON.stringify({ poured, cell, h }));
    await sleep(6000);
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 12; x <= 20; x++) for (let z = 0; z <= 8; z++) for (let y = 46; y <= 47; y++) bv.world.setBlock(x, y, z, 0); bv.world.setBlock(16, 45, 4, 1); });
  }

  // FN1 — fences placed with real RMB use the MC model (thin post + rails to neighbours), not a full block
  if (run('FN1')) {
    await resetArena();
    await heal();
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(2, 46, 19, 3); bv.forceRemeshAround?.(); });
    await setHeld(page, 28);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0].count = 8; bv.hud.refreshHotbar(); });
    for (const x of [3, 4, 5, 8]) {
      await aim(page, x + 0.5, 46.05, 21.6, x + 0.5, 45.95, 19.5);
      await sleep(150);
      await hold(page, 80, 'right'); await sleep(250);
    }
    const ids = [await gb(3, 46, 19), await gb(4, 46, 19), await gb(5, 46, 19), await gb(8, 46, 19)];
    await aim(page, 6.0, 47.3, 22.5, 5.0, 46.3, 19.5);
    await sleep(800);
    await shot(page, 'it24-08-gjerde-modell.png');
    const mesh = await page.evaluate(() => (window as any).__bv.getState().fps);
    record('FN1-fence-model', ids.every((i) => i === 28) ? 'PASS' : 'FAIL', JSON.stringify({ ids, fps: mesh, note: 'visual check of screenshot' }));
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
