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
const OUT = process.env.BV_OUT || 'public/progress/it15';
const VID = '/tmp/it15-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it15';

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
/**
 * it15 natural session: a real night on the surface of a fresh world, defending yourself with a stone sword
 * (real LMB clicks, real W/S movement). __bv only sets the scene (night, starting kit, aim at the nearest mob).
 */
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
  await boot(page, base, 'It15Session');
  await sleep(2500);
  await acquireLock(page);
  const log = (k: string, v: unknown) => console.log(k, JSON.stringify(v));
  const fpsSamples: number[] = [];
  log('land', await page.evaluate(() => { const bv = (window as any).__bv;
    for (let r = 0; r < 40; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const x = 8 + dx, z = 8 + dz;
      for (let y = 90; y > 2; y--) { const id = bv.world.getBlock(x, y, z); if (id === 0) continue;
        if (id === 1) { bv.teleport(x + 0.5, y + 1.05, z + 0.5); return [x, y, z]; } break; }
    } return null; }));
  await sleep(1500);
  await page.evaluate(() => { const bv = (window as any).__bv;
    bv.inv.slots.fill(null);
    bv.inv.slots[0] = { id: 107, count: 1, durability: 132 }; bv.inv.slots[1] = { id: 65, count: 6 }; bv.inv.selected = 0; bv.hud.markDirty(); bv.hud.refreshHotbar();
    bv.setDay(0.8); bv.mobs.clear();
    (window as any).__blasts = 0; const prev = bv.mobs.onBlast; bv.mobs.onBlast = (...a: any[]) => { (window as any).__blasts++; prev?.(...a); };
    (window as any).__hp = []; });
  await ensureLocked(page);
  let hits = 0; const misses: string[] = [];
  let kills = 0, clicks = 0, deaths = 0, minHp = 20;
  const t0 = Date.now();
  let shotN = 0;
  while (Date.now() - t0 < 100_000) {
    const s = await st(page);
    fpsSamples.push(s.fps); minHp = Math.min(minHp, s.health);
    if (s.dead) { deaths++; await ensureRespawn(page); await ensureLocked(page); continue; }
    const tgt = await page.evaluate(() => { const bv = (window as any).__bv; const p = bv.player;
      let best: any = null, bd = 12;
      for (const m of bv.mobs.mobs) { if (!m.hostile || m.hp <= 0) continue; const d = Math.hypot(m.x - p.x, m.z - p.z); if (d < bd) { bd = d; best = m; } }
      if (!best) return null;
      bv.lookAt(best.x, best.y + best.height * 0.6, best.z);
      return { kind: best.kind, d: bd, id: best.id, fuse: best.fuse, hp: best.hp, dy: +(best.y - p.y).toFixed(1) };
    });
    if (!tgt) {
      // wander a little like a player waiting for the night
      await page.keyboard.down('KeyW'); await sleep(400); await page.keyboard.up('KeyW');
      await page.mouse.move(640 + 80, 360); await sleep(300);
      continue;
    }
    if (tgt.kind === 'knallbolle' && tgt.fuse > 0) { // hissing: back off like a player
      await page.keyboard.down('KeyS'); await sleep(900); await page.keyboard.up('KeyS'); continue;
    }
    if (tgt.d > 2.6) { await page.keyboard.down('KeyW'); await sleep(Math.min(700, (tgt.d - 2) * 230)); await page.keyboard.up('KeyW'); }
    const pre = await page.evaluate((id) => { const bv = (window as any).__bv; const m = bv.mobs.mobs.find((m: any) => m.id === id); return m ? { hp: m.hp, d: Math.hypot(m.x - bv.player.x, m.z - bv.player.z), dy: m.y - bv.player.y } : null; }, tgt.id);
    await page.mouse.down(); await sleep(40); await page.mouse.up(); clicks++;
    await sleep(400);
    const post = await page.evaluate((id) => (window as any).__bv.mobs.mobs.find((m: any) => m.id === id)?.hp ?? -1, tgt.id);
    if (pre && post < pre.hp) hits++; else if (pre && misses.length < 25) misses.push(`${tgt.kind} d=${pre.d.toFixed(1)} dy=${pre.dy.toFixed(1)}`);
    const dead = await page.evaluate((id) => !(window as any).__bv.mobs.mobs.some((m: any) => m.id === id && m.hp > 0), tgt.id);
    if (dead) { kills++; log('kill', tgt.kind); if (shotN < 2) await shot(page, `it15-s${++shotN}-natt-kamp.png`); }
    // eat when hungry (hold RMB)
    if (s.hunger < 12) { await page.keyboard.press('Digit2'); await sleep(100); await page.mouse.down({ button: 'right' }); await sleep(1900); await page.mouse.up({ button: 'right' }); await page.keyboard.press('Digit1'); }
  }
  await sleep(1500);
  const inv = await page.evaluate(() => (window as any).__bv.inv.slots.filter(Boolean).map((s: any) => `${(window as any).__bv.ITEMS?.[s.id]?.name ?? s.id}x${s.count}`));
  const blasts = await page.evaluate(() => (window as any).__blasts);
  // sunrise: zombies/skeletons in the open burn
  await page.evaluate(() => (window as any).__bv.setDay(0.3));
  await sleep(10000);
  const morning = await page.evaluate(() => (window as any).__bv.mobs.mobs.filter((m: any) => m.hostile).map((m: any) => { const bv = (window as any).__bv; let cover = ''; for (let y = Math.floor(m.y + m.height * 0.9) + 1; y < 128; y++) { const id = bv.world.getBlock(Math.floor(m.x), y, Math.floor(m.z)); if (id && id !== 12) { cover = `${id}@${y}`; break; } }
    return `${m.kind}:${m.hp.toFixed(0)}${m.burning ? 'B' : ''} y=${m.y.toFixed(1)} cover=${cover}`; }));
  await shot(page, 'it15-s3-morgen.png');
  const s3 = await st(page);
  log('misses', misses);
  log('session', { kills, hits, clicks, deaths, minHp: +minHp.toFixed(1), blasts, inv, morning, hpEnd: +s3.health.toFixed(1) });
  log('fps', { min: Math.min(...fpsSamples).toFixed(0), avg: (fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length).toFixed(0), n: fpsSamples.length });
  log('errors', errors);
  await ctx.close(); await browser.close(); child.kill('SIGKILL'); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
