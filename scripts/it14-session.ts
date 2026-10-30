/**
 * it14 verify: HUD layout, far leaves, drop icons, starvation (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it14';
const VID = '/tmp/it14-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it14';

type Status = 'PASS' | 'FAIL' | 'PARTIAL' | 'UNTESTED';
interface Row { id: string; status: Status; notes: string }
const results: Row[] = [];
const bugs: string[] = [];
function record(id: string, status: Status, notes = '') {
  const prev = results.findIndex((r) => r.id === id);
  if (prev >= 0) results.splice(prev, 1);
  results.push({ id, status, notes });
  console.log(`[${status}] ${id}${notes ? ' — ' + notes : ''}`);
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

/** Natural-terrain session: real mouse look, walking, digging straight down into the ground, night. */
async function main() {
  const { base, child } = await startPreview();
  process.on('exit', () => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
  const browser = await chromium.launch({ headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: process.env.BV_VID ? { dir: process.env.BV_VID, size: { width: 1280, height: 720 } } : undefined });
  const page = await ctx.newPage();
  await page.addInitScript('window.__name = (f) => f;');
  const errors: string[] = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.error('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await boot(page, base, 'It14Session');
  await sleep(2500);
  await acquireLock(page);
  const log = (k: string, v: unknown) => console.log(k, JSON.stringify(v));
  const fpsSamples: number[] = [];
  const sample = async () => { const s = await st(page); fpsSamples.push(s.fps); return s; };
  // 1) Look around with real mouse movement and walk/jump for ~12 s
  const s0 = await sample();
  for (let i = 0; i < 20; i++) { await page.mouse.move(640 + (i % 2 ? 60 : -40), 360); await sleep(40); }
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 24; i++) {
    if (i % 6 === 3) { await page.keyboard.down('Space'); await sleep(250); await page.keyboard.up('Space'); }
    await page.mouse.move(640 + (i % 2 ? 25 : -25), 360);
    await sleep(500);
    if (i % 4 === 0) await sample();
  }
  await page.keyboard.up('KeyW');
  const s1 = await sample();
  log('walk', { from: [s0.x, s0.y, s0.z].map((v) => +v.toFixed(1)), to: [s1.x, s1.y, s1.z].map((v) => +v.toFixed(1)), hp: s1.health });
  await shot(page, 'it14-s1-utforsk.png');
  // 2) Dig straight down with a stone pickaxe (real LMB) for ~25 s
  // setup: stand on dry land (grass) near spawn — the walk may have ended in the sea
  log('land', await page.evaluate(() => { const bv = (window as any).__bv;
    for (let r = 0; r < 40; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const x = 8 + dx, z = 8 + dz;
      for (let y = 90; y > 2; y--) { const id = bv.world.getBlock(x, y, z); if (id === 0) continue;
        if (id === 1) { bv.teleport(x + 0.5, y + 1.05, z + 0.5); return [x, y, z]; } break; }
    } return null; }));
  await sleep(1500);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 104, count: 1, durability: 132 }; bv.inv.slots[1] = { id: 12, count: 16 }; bv.inv.selected = 0; bv.hud.markDirty(); });
  await ensureLocked(page);
  await page.evaluate(() => (window as any).__bv.look((window as any).__bv.player.yaw, -Math.PI / 2 + 0.02));
  const yTop = (await st(page)).y;
  await page.mouse.down();
  for (let i = 0; i < 50; i++) { await sleep(500); if (i % 10 === 0) await sample(); }
  await page.mouse.up();
  const s2 = await sample();
  const inv = await page.evaluate(() => (window as any).__bv.inv.slots.filter(Boolean).map((s: any) => `${s.id}x${s.count}`));
  log('dig', { yTop: +yTop.toFixed(1), yNow: +s2.y.toFixed(2), hp: s2.health, inv, dead: s2.dead });
  // place a torch on the wall with real RMB (press 2, look at wall), then screenshot
  await page.keyboard.press('Digit2'); await sleep(200);
  await page.evaluate(() => (window as any).__bv.look((window as any).__bv.player.yaw, -0.2));
  await page.mouse.down({ button: 'right' }); await sleep(80); await page.mouse.up({ button: 'right' });
  await sleep(600);
  await shot(page, 'it14-s2-sjakt.png');
  const torches = await countItem(page, 12);
  log('torch', { left: torches });
  // 3) Back to the surface at night: mobs spawn, sun-up burns zombies
  await page.evaluate(() => { const bv = (window as any).__bv; const p = bv.player; let y = 120; while (y > 1 && !bv.world.getBlock(Math.floor(p.x) + 3, y - 1, Math.floor(p.z))) y--; bv.teleport(Math.floor(p.x) + 3.5, y + 0.05, p.z); bv.setDay(0.85); });
  await sleep(12000);
  const night = await page.evaluate(() => (window as any).__bv.mobs.mobs.filter((m: any) => m.hostile).map((m: any) => m.kind));
  await shot(page, 'it14-s3-natt.png');
  await page.evaluate(() => { const bv = (window as any).__bv; bv.player.health = 20; bv.setDay(0.3); });
  await sleep(14000);
  const morning = await page.evaluate(() => (window as any).__bv.mobs.mobs.filter((m: any) => m.hostile).map((m: any) => `${m.kind}:${m.hp.toFixed(0)}${m.burning ? 'B' : ''}`));
  log('mobs', { night, morning });
  const s3 = await sample();
  log('fps', { min: Math.min(...fpsSamples).toFixed(0), avg: (fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length).toFixed(0), n: fpsSamples.length, hp: s3.health, dead: s3.dead });
  log('errors', errors);
  await ctx.close(); await browser.close(); child.kill('SIGKILL'); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
