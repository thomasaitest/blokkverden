/**
 * it17 verify: falling sand, leaf decay, persistent placed leaves (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it17';
const VID = '/tmp/it17-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it17';

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
  await boot(page, base, 'It17Verify');
  await acquireLock(page);
  await sleep(3000);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.5); bv.mobs.clear(); });
  const only = (process.env.BV_ONLY || '').split(',').filter(Boolean);
  const run = (id: string) => !only.length || only.includes(id);
  const marks: Record<string, number> = {};
  const mark = (k: string) => { marks[k] = (Date.now() - T0) / 1000; };
  const gb = (x: number, y: number, z: number) => page.evaluate(({ x, y, z }) => (window as any).__bv.world.getBlock(x, y, z), { x, y, z });

  const dropIds = () => page.evaluate(() => (window as any).__bv.drops.drops.map((d: any) => d.stack.id));
  const clearDrops = () => page.evaluate(() => { (window as any).__bv.drops.drops.length = 0; });

  // B2probe — replicate core B2 (fresh spawn → teleport up 14 blocks → fall → teleport → Space tap 50 ms)
  if (run('B2')) {
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(8.5, 46.05, 8.5); bv.world.updateAround(8.5, 8.5); });
      await sleep(2500);
      await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 0; x <= 16; x++) for (let z = 0; z <= 16; z++) { bv.world.setBlock(x, 45, z, 1); for (let yy = 46; yy <= 51; yy++) bv.world.setBlock(x, yy, z, 0); } bv.teleport(8.5, 46.05, 8.5); bv.look(0, 0); });
      await sleep(150);
      await focusGame(page);
      await page.keyboard.down('KeyW'); await sleep(600); await page.keyboard.up('KeyW');
      await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(8.5, 46.35, 8.5); bv.look(0, 0); }); // airborne: lands ~0.1 s later
      const s0 = await page.evaluate(() => { const p = (window as any).__bv.player; return { y: p.y, g: p.onGround, hp: p.health, tap: (window as any).__bv.input.jumpTap, lock: (window as any).__bv.input.pointerLocked, inv: (window as any).__bv.input.inventoryOpen }; });
      await page.keyboard.down('Space'); await sleep(50);
      const sMid = await page.evaluate(() => { const bv = (window as any).__bv; return { tap: bv.input.jumpTap, jump: bv.input.jump, y: bv.player.y }; });
      await page.keyboard.up('Space');
      await sleep(150);
      const s1 = await page.evaluate(() => { const p = (window as any).__bv.player; return { y: p.y, g: p.onGround, vy: p.vy, fps: (window as any).__bv.getState().fps, paused: !!document.querySelector('#pause-menu') && getComputedStyle(document.querySelector('#pause-menu')!).display !== 'none' }; });
      console.log('B2probe', i, JSON.stringify({ s0, sMid, s1 }));
    }
  }

  // N0 — natural terrain: tall grass tufts near spawn (look at the nearest one)
  if (run('N0')) {
    mark('N0');
    const tuft = await page.evaluate(() => {
      const bv = (window as any).__bv; const p = bv.player;
      let best: any = null; let n = 0;
      for (let dx = -24; dx <= 24; dx++) for (let dz = -24; dz <= 24; dz++) for (let y = 30; y < 90; y++) {
        const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
        if (bv.world.getBlock(x, y, z) !== 78) continue;
        n++;
        const d = Math.hypot(dx, dz);
        if (d > 3 && (!best || d < best.d)) best = { x, y, z, d };
      }
      return { best, n };
    });
    if (tuft.best) {
      const b = tuft.best;
      await aim(page, b.x + 3.5, b.y + 0.6, b.z + 3.5, b.x + 0.5, b.y + 0.3, b.z + 0.5);
      await sleep(1500);
    }
    await shot(page, 'it17-00-hoeyt-gress-natur.png');
    record('N0-tallgrass-generated', tuft.n >= 10 ? 'PASS' : 'FAIL', `tufts within 24=${tuft.n}`);
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

  // P1 — break tall grass by hand (real LMB) — near instant
  if (run('P1')) {
    mark('P1');
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 2; x <= 14; x += 2) bv.world.setBlock(x, 46, 4, 78); bv.forceRemeshAround?.(); });
    await setHeld(page, 0);
    await aim(page, 8.5, 46.05, 8.5, 8.5, 46.4, 4.5);
    await sleep(600);
    await shot(page, 'it17-01-hoeyt-gress-arena.png');
    let broken = 0;
    for (let x = 2; x <= 14; x += 2) {
      await aim(page, x + 0.5, 46.05, 7.5, x + 0.5, 46.4, 4.5);
      await sleep(80);
      await hold(page, 150);
      await sleep(80);
      if ((await gb(x, 46, 4)) === 0) broken++;
    }
    record('P1-break-tallgrass', broken === 7 ? 'PASS' : 'FAIL', `broken=${broken}/7 (LMB 150 ms each)`);
  }

  // P2 — RMB with dirt aimed at tall grass → the dirt replaces the tuft (MC replaceable), not stacked above it
  if (run('P2')) {
    mark('P2');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(8, 46, 2, 78); bv.forceRemeshAround?.(); });
    await setHeld(page, 2);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 2, count: 3 }; bv.hud.refreshHotbar(); });
    await aim(page, 8.5, 46.05, 5.5, 8.5, 46.3, 2.5);
    await sleep(300);
    await hold(page, 80, 'right');
    await sleep(300);
    const v = { at46: await gb(8, 46, 2), at47: await gb(8, 47, 2), left: await countItem(page, 2) };
    record('P2-place-into-tallgrass', v.at46 === 2 && v.at47 === 0 && v.left === 2 ? 'PASS' : 'FAIL', JSON.stringify(v));
  }

  // P3 — torch: place (RMB) then break it by aiming at it (LMB) → torch item drops
  if (run('P3')) {
    mark('P3');
    await clearDrops();
    await setHeld(page, 12);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 12, count: 2 }; bv.hud.refreshHotbar(); });
    await aim(page, 12.5, 46.05, 12.5, 12.5, 45.99, 10.5);
    await sleep(200);
    await hold(page, 80, 'right');
    await sleep(300);
    const placed = await gb(12, 46, 10);
    await setHeld(page, 0);
    await aim(page, 12.5, 46.05, 12.5, 12.5, 46.3, 10.5);
    await sleep(200);
    const target = await page.evaluate(() => (window as any).__bv.targetHit());
    await hold(page, 200);
    await sleep(300);
    const after = await gb(12, 46, 10);
    const ids = await dropIds();
    record('P3-break-torch', placed === 12 && after === 0 && ids.includes(12) ? 'PASS' : 'FAIL', `placed=${placed} target=${JSON.stringify(target && [target.x, target.y, target.z])} after=${after} drops=${ids}`);
  }

  // P4 — crops: LMB on a crop harvests it; breaking the farmland under a crop pops the crop
  if (run('P4')) {
    mark('P4');
    await clearDrops();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.world.setBlock(4, 45, 16, 22); bv.world.setBlock(4, 46, 16, 23); bv.world.setMeta(4, 46, 16, 7);
      // raised farmland (side exposed) with a ripe crop on it
      bv.world.setBlock(6, 46, 16, 22); bv.world.setBlock(6, 47, 16, 23); bv.world.setMeta(6, 47, 16, 7);
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 0);
    await aim(page, 4.5, 46.05, 19.5, 4.5, 46.4, 16.5);
    await sleep(500);
    await shot(page, 'it17-02-avling.png');
    await hold(page, 120);
    await sleep(300);
    const crop1 = await gb(4, 46, 16);
    const ids1 = await dropIds();
    await clearDrops();
    await setHeld(page, 102);
    await aim(page, 6.5, 46.05, 19.5, 6.5, 46.4, 17.0); // side of the raised farmland
    await sleep(200);
    const tgt = await page.evaluate(() => (window as any).__bv.targetHit());
    const tgt2 = tgt;
    await shot(page, 'it17-02b-avling-paa-aaker.png');
    for (let t = 0; t < 8 && (await gb(6, 46, 16)) === 22; t++) await hold(page, 300);
    await sleep(300);
    const v = { farmland: await gb(6, 46, 16), crop: await gb(6, 47, 16), drops: await dropIds() };
    record('P4a-harvest-crop-LMB', crop1 === 0 && ids1.includes(64) ? 'PASS' : 'FAIL', `crop=${crop1} drops=${ids1}`);
    record('P4b-crop-pops', tgt?.y === 46 && v.farmland === 0 && v.crop === 0 && v.drops.includes(64) ? 'PASS' : 'FAIL', JSON.stringify({ ...v, tgt: tgt && [tgt.x, tgt.y, tgt.z], tgt2: tgt2 && [tgt2.x, tgt2.y, tgt2.z] }));
  }

  // G1 — gravel: break the dirt under a 3-high gravel column (LMB) → it falls; screenshot texture
  if (run('G1')) {
    mark('G1');
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.world.setBlock(16, 46, 8, 2);
      for (let y = 47; y <= 49; y++) bv.world.setBlock(16, y, 8, 49);
      for (let x = 17; x <= 18; x++) for (let y = 46; y <= 47; y++) bv.world.setBlock(x, y, 8, 49);
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 0);
    await aim(page, 13.5, 46.05, 8.5, 16.0, 46.5, 8.5);
    await sleep(1500);
    await shot(page, 'it17-03-grus.png');
    for (let t = 0; t < 10 && (await gb(16, 46, 8)) === 2; t++) await hold(page, 650);
    await sleep(300);
    const col = [];
    for (let y = 46; y <= 49; y++) col.push(await gb(16, y, 8));
    record('G1-gravel-falls', col.join(',') === '49,49,49,0' ? 'PASS' : 'FAIL', `col46..49=${col.join(',')}`);
    // G2 — dig gravel with a shovel (real LMB) until we've broken 30 blocks; expect gravel and (likely) flint drops
    await clearDrops();
    await page.evaluate(() => { const bv = (window as any).__bv; for (let z = 10; z <= 20; z++) for (let y = 46; y <= 48; y++) bv.world.setBlock(19, y, z, 49); bv.forceRemeshAround?.(); });
    await setHeld(page, 106);
    let dug = 0;
    for (let z = 10; z <= 20 && dug < 30; z++) {
      for (let k = 0; k < 4 && (await gb(19, 46, z)) === 49; k++) {
        await aim(page, 17.5, 46.05, z + 0.5, 19.0, 46.5, z + 0.5);
        await sleep(60);
        await hold(page, 250);
        await sleep(120);
        if ((await gb(19, 46, z)) !== 49 || k >= 0) dug++;
      }
    }
    await sleep(1500); // let drops settle / be picked up
    const dropped = await page.evaluate(() => { const r: Record<number, number> = {}; for (const d of (window as any).__bv.drops.drops) r[d.stack.id] = (r[d.stack.id] ?? 0) + d.stack.count; return r; });
    const remaining = await page.evaluate(() => { const bv = (window as any).__bv; let n = 0; for (let z = 10; z <= 20; z++) for (let y = 46; y <= 48; y++) if (bv.world.getBlock(19, y, z) === 49) n++; return n; });
    const brokenN = 33 - remaining;
    const gravel = (dropped[49] ?? 0) + await countItem(page, 49), flint = (dropped[77] ?? 0) + await countItem(page, 77);
    await shot(page, 'it17-03b-grus-gravd.png');
    record('G2-gravel-drops', brokenN >= 20 && gravel + flint === brokenN && gravel > flint ? 'PASS' : 'FAIL', `broken=${brokenN} gravel=${gravel} flint=${flint} (10 % flint expected)`);
  }

  // S — sapling: RMB on grass plants it, RMB on stone does nothing; it grows into an oak (growth sped up via setup hook)
  if (run('S')) {
    mark('S');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(3, 46, 8, 3); bv.forceRemeshAround?.(); });
    await setHeld(page, 76);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 76, count: 3 }; bv.hud.refreshHotbar(); });
    await aim(page, 3.5, 46.05, 11.5, 3.5, 46.99, 8.5); // top of stone block
    await sleep(200);
    await hold(page, 80, 'right');
    await sleep(300);
    const onStone = await gb(3, 47, 8);
    await aim(page, 6.5, 46.05, 11.5, 6.5, 45.99, 8.5); // grass top
    await sleep(200);
    await hold(page, 80, 'right');
    await sleep(400);
    const onGrass = await gb(6, 46, 8);
    const left = await countItem(page, 76);
    await aim(page, 6.5, 46.6, 10.0, 6.5, 46.4, 8.5);
    await sleep(700);
    await shot(page, 'it17-04-spire.png');
    record('S1-plant-sapling', onStone === 0 && onGrass === 76 && left === 2 ? 'PASS' : 'FAIL', `onStone=${onStone} onGrass=${onGrass} left=${left}`);
    // walk into it: no collision
    await aim(page, 6.5, 46.05, 10.5, 6.5, 46.5, 7.5);
    await page.evaluate(() => (window as any).__bv.look(0, 0));
    await walk(page, 'KeyW', 700);
    const pz = (await st(page)).z;
    record('S2-sapling-no-collision', pz < 8.9 ? 'PASS' : 'FAIL', `z after walking through=${pz.toFixed(2)}`);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(6.5, 46.05, 16.5); bv.setSaplingChance(1); });
    let logs = 0;
    for (let i = 0; i < 12 && logs < 4; i++) {
      await sleep(500);
      logs = 0; for (let y = 46; y <= 52; y++) if ((await gb(6, y, 8)) === 5) logs++;
    }
    await page.evaluate(() => (window as any).__bv.setSaplingChance(0.0075));
    await aim(page, 6.5, 47.0, 15.5, 6.5, 49.5, 8.5);
    await sleep(1500);
    await shot(page, 'it17-05-spire-vokst.png');
    const leaves = await page.evaluate(() => { const bv = (window as any).__bv; let n = 0; for (let x = 3; x <= 9; x++) for (let z = 5; z <= 11; z++) for (let y = 47; y <= 54; y++) if (bv.world.getBlock(x, y, z) === 7) n++; return n; });
    record('S3-sapling-grows', logs >= 4 && leaves > 30 && (await gb(6, 45, 8)) === 2 ? 'PASS' : 'FAIL', `logs=${logs} leaves=${leaves} below=${await gb(6, 45, 8)}`);
  }

  // J — quick Space tap (down+up with no delay) still jumps
  if (run('J')) {
    mark('J');
    await aim(page, 12.5, 46.05, 16.5, 12.5, 46.05, 10.5);
    await sleep(300);
    let ok = 0;
    for (let i = 0; i < 5; i++) {
      const y0 = (await st(page)).y;
      await page.keyboard.press('Space');
      let maxY = y0;
      for (let k = 0; k < 6; k++) { await sleep(40); maxY = Math.max(maxY, (await st(page)).y); }
      if (maxY > y0 + 0.3) ok++;
      await sleep(1300);
    }
    record('J-jump-tap', ok === 5 ? 'PASS' : 'FAIL', `jumped ${ok}/5`);
  }

  // L3 — chop a tree (real LMB), quit to title right away (Esc → «Til tittel», saves), reload the world: leaves still decay
  if (run('L3')) {
    mark('L3');
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.world.setBlock(10, 46, 14, 5);
      for (let x = 9; x <= 11; x++) for (let z = 13; z <= 15; z++) if (!(x === 10 && z === 14)) bv.world.setBlock(x, 47, z, 7);
      bv.world.setBlock(10, 47, 14, 7); bv.world.setBlock(10, 48, 14, 7);
      bv.forceRemeshAround?.();
    });
    await sleep(800);
    await setHeld(page, 101);
    await aim(page, 10.5, 46.05, 16.5, 10.5, 46.5, 15.0);
    await sleep(200);
    for (let t = 0; t < 12 && (await gb(10, 46, 14)) === 5; t++) await hold(page, 400);
    const logGone = (await gb(10, 46, 14)) === 0;
    const pend = await page.evaluate(() => (window as any).__bv.leafDecayPending?.() ?? -1);
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.locator('#p-quit').click();
    await sleep(1200);
    await page.locator('#btn-single').click().catch(() => {});
    await sleep(500);
    await page.evaluate(() => { const b = document.querySelector('[data-play="It17Verify"]') as HTMLButtonElement | null; b?.click(); });
    await page.waitForSelector('canvas#game', { timeout: 60000 });
    for (let i = 0; i < 40; i++) { if (await page.evaluate(() => !!(window as any).__bv?.world)) break; await sleep(250); }
    await sleep(1500);
    await acquireLock(page);
    const leavesNow = () => page.evaluate(() => { const bv = (window as any).__bv; let n = 0; for (let x = 9; x <= 11; x++) for (let z = 13; z <= 15; z++) for (let y = 47; y <= 48; y++) if (bv.world.getBlock(x, y, z) === 7) n++; return n; });
    const afterLoad = await leavesNow();
    let end = afterLoad;
    for (let i = 0; i < 30 && end > 0; i++) { await sleep(1000); end = await leavesNow(); }
    await aim(page, 10.5, 47.0, 18.5, 10.5, 47.0, 14.5);
    await sleep(800);
    await shot(page, 'it17-06-loev-etter-lasting.png');
    const dbg = await page.evaluate(() => { const bv = (window as any).__bv; const out: any[] = []; for (let x = 9; x <= 11; x++) for (let z = 13; z <= 15; z++) for (let y = 47; y <= 48; y++) if (bv.world.getBlock(x, y, z) === 7) out.push([x, y, z, bv.world.getWaterLevel(x, y, z)]); return { out, pend: bv.leafDecayPending() }; });
    console.log('L3 dbg', JSON.stringify(dbg));
    record('L3-leaf-decay-after-reload', logGone && afterLoad >= 6 && end === 0 ? 'PASS' : 'FAIL', `logGone=${logGone} pendingBeforeQuit=${pend} leavesAfterLoad=${afterLoad} end=${end}`);
  }

  const report = { when: new Date().toISOString(), results, bugs, marks };
  fs.writeFileSync(path.join(OUT, 'it17-verify.json'), JSON.stringify(report, null, 2));
  const summary: Record<string, number> = { PASS: 0, FAIL: 0, PARTIAL: 0 };
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
  console.log('=== SUMMARY ===', summary, 'marks', JSON.stringify(marks));
  await ctx.close();
  await browser.close();
  child.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
