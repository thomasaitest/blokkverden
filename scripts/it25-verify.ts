/**
 * it25 verify: water current pushes the player and items, Helvete lava flows 7 blocks fast, milk bucket from a cow + drinking clears Sult, water step side (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it25';
const VID = '/tmp/it25-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it25';

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
  await boot(page, base, 'It25Verify');
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


  const simT = () => page.evaluate(() => (window as any).__bv.getState().simT ?? 0);
  const simSleep = async (sec: number) => { const t0 = await simT(); for (let i = 0; i < 600; i++) { if ((await simT()) - t0 >= sec) return; await sleep(20); } };

  // CU1 — water poured (real RMB) at the end of a walled channel flows along it; standing still in the flow pushes you (MC current)
  if (run('CU1')) {
    await resetArena();
    await heal();
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 1; x <= 12; x++) { bv.world.setBlock(x, 46, 7, 3); bv.world.setBlock(x, 46, 9, 3); } bv.world.setBlock(1, 46, 8, 3); bv.forceRemeshAround?.(); });
    await sleep(500);
    await setHeld(page, 88);
    await aim(page, 2.5, 47.0, 9.5, 2.5, 45.95, 8.4); // stand on the channel wall
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    const src = await gb(2, 46, 8), srcLvl = await gm(2, 46, 8);
    await sleep(6000);
    const lv = [await gm(3, 46, 8), await gm(5, 46, 8), await gm(7, 46, 8)];
    await aim(page, 8.5, 47.0, 9.5, 4.5, 46.0, 8.5); // on the wall, looking along the channel towards the source
    await sleep(600);
    await shot(page, 'it25-01-strom-kanal.png');
    // stand in the flow, no keys held
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(3.5, 46.0, 8.5); bv.look(-Math.PI / 2, -0.3); bv.player.vx = 0; bv.player.vz = 0; });
    await sleep(100);
    const x0 = (await st(page)).x;
    await simSleep(1.5);
    const p1 = await st(page);
    const fx = await page.evaluate(() => (window as any).__bv.player.flowX ?? 0);
    await shot(page, 'it25-02-strom-dytter.png');
    record('CU1-water-current-pushes-player', src === 10 && srcLvl === 7 && lv[0] === 6 && lv[2] >= 1 && p1.x - x0 > 1.0 && Math.abs(p1.z - 8.5) < 0.3 && fx > 1 ? 'PASS' : 'FAIL',
      JSON.stringify({ src, srcLvl, lv, x0: x0.toFixed(2), x1: p1.x.toFixed(2), z1: p1.z.toFixed(2), fx }));
  }

  // CU2 — an item dropped (real Q key) into the flowing water drifts along the current
  if (run('CU2')) {
    await clearDrops();
    await setHeld(page, 5);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0].count = 4; bv.hud.refreshHotbar(); });
    // look down onto the channel from the side wall so the thrown item lands in the water
    await aim(page, 4.5, 47.05, 9.5, 4.5, 46.2, 8.3);
    await sleep(200);
    await page.keyboard.press('KeyQ'); await sleep(200);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(4.5, 49.5, 13.5); });
    const d0 = await page.evaluate(() => { const d = (window as any).__bv.drops.drops.find((q: any) => q.stack.id === 5); return d ? { x: d.x, z: d.z } : null; });
    await simSleep(2.0);
    const d1 = await page.evaluate(() => { const d = (window as any).__bv.drops.drops.find((q: any) => q.stack.id === 5); return d ? { x: d.x, y: d.y, z: d.z } : null; });
    await aim(page, 7.5, 48.6, 12.5, 7.5, 46.0, 8.5);
    await sleep(400);
    await shot(page, 'it25-03-ting-driver.png');
    record('CU2-item-drifts', !!d0 && !!d1 && d1.x - d0.x > 1.0 ? 'PASS' : 'FAIL', JSON.stringify({ d0, d1 }));
    await clearDrops();
  }

  // CU3 — a pig in the flowing channel drifts along the current (MC: mobs are pushed too)
  if (run('CU3')) {
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); for (let x = 1; x <= 12; x++) { bv.world.setBlock(x, 47, 7, 3); bv.world.setBlock(x, 47, 9, 3); } bv.forceRemeshAround?.(); bv.teleport(8.5, 48.0, 9.5); const m = bv.spawnMob('gris', 0, 0, 0); m.x = 3.5; m.y = 46.0; m.z = 8.5; m.vx = 0; m.vz = 0; });
    const m0 = await page.evaluate(() => { const m = (window as any).__bv.mobs.mobs[0]; return { x: m.x, z: m.z }; });
    await simSleep(2.0);
    const m1 = await page.evaluate(() => { const m = (window as any).__bv.mobs.mobs[0]; return m ? { x: m.x, y: m.y, z: m.z } : null; });
    await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs[0]; bv.lookAt(m.x, m.y + 0.4, m.z); });
    await sleep(300);
    await shot(page, 'it25-09-gris-i-strom.png');
    record('CU3-mob-drifts', !!m1 && m1.x - m0.x > 1.0 ? 'PASS' : 'FAIL', JSON.stringify({ m0, m1 }));
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); bv.world.setBlock(2, 46, 8, 0); for (let x = 1; x <= 12; x++) { bv.world.setBlock(x, 47, 7, 0); bv.world.setBlock(x, 47, 9, 0); } });
    await sleep(6000);
  }

  // MK1 — RMB a cow with an empty bucket → milk bucket; hold RMB 1.6 s to drink → Sult removed, empty bucket back
  if (run('MK1')) {
    await resetArena();
    await heal();
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); });
    await setHeld(page, 87);
    const cow = await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(8.5, 46.0, 12.5); const m = bv.spawnMob('ku', 0, 0, -2.2); return m ? { x: m.x, y: m.y, z: m.z, kind: m.kind } : null; });
    await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs[0]; m.x = 8.5; m.z = 10.3; m.vx = 0; m.vz = 0; bv.teleport(8.5, 46.0, 12.5); bv.lookAt(8.5, 46.7, 10.3); });
    await sleep(150);
    await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs[0]; m.x = 8.5; m.z = 10.3; bv.lookAt(m.x, m.y + 0.7, m.z); });
    await hold(page, 80, 'right'); await sleep(300);
    const h1 = await held();
    await shot(page, 'it25-04-melk-ku.png');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.player.hungerEffect = 20; bv.mobs.clear(); bv.look(0, -0.4); });
    await sleep(200);
    const sick = await page.evaluate(() => (window as any).__bv.player.hungerEffect);
    await page.mouse.down({ button: 'right' }); await sleep(900);
    const mid = await held();
    await shot(page, 'it25-05-drikker-melk.png');
    await sleep(1300); await page.mouse.up({ button: 'right' }); await sleep(200);
    const h2 = await held();
    const after = await page.evaluate(() => (window as any).__bv.player.hungerEffect);
    record('MK1-milk-bucket', cow?.kind === 'ku' && h1?.id === 90 && mid?.id === 90 && sick > 0 && h2?.id === 87 && after === 0 ? 'PASS' : 'FAIL',
      JSON.stringify({ cow, h1, mid, sick, h2, after }));
  }

  // MK2 — a stack of 3 buckets: milking gives 2 in hand + the milk bucket in the inventory; other mobs (pig) give nothing
  if (run('MK2')) {
    await heal();
    await setHeld(page, 87);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0].count = 3; bv.hud.refreshHotbar(); bv.mobs.clear(); bv.teleport(8.5, 46.0, 12.5); bv.spawnMob('gris', 0, 0, -2.2); });
    await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs[0]; m.x = 8.5; m.z = 10.3; bv.lookAt(m.x, m.y + 0.5, m.z); });
    await hold(page, 80, 'right'); await sleep(300);
    const pig = await held(), milk0 = await countItem(page, 90);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); bv.spawnMob('ku', 0, 0, -2.2); const m = bv.mobs.mobs[0]; m.x = 8.5; m.z = 10.3; bv.lookAt(m.x, m.y + 0.7, m.z); });
    await sleep(100);
    await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs[0]; m.x = 8.5; m.z = 10.3; bv.lookAt(m.x, m.y + 0.7, m.z); });
    await hold(page, 80, 'right'); await sleep(300);
    const h = await held(), milk = await countItem(page, 90);
    record('MK2-milk-stack-and-pig', pig?.id === 87 && pig.count === 3 && milk0 === 0 && h?.id === 87 && h.count === 2 && milk === 1 ? 'PASS' : 'FAIL', JSON.stringify({ pig, milk0, h, milk }));
    await page.evaluate(() => { (window as any).__bv.mobs.clear(); });
  }

  // HL1 — in Helvete lava poured with real RMB flows 7 blocks within a few seconds (MC: farther and faster than the overworld's 3)
  if (run('HL1')) {
    await heal();
    const ent = await page.evaluate(() => (window as any).__bv.enterHelvete());
    await sleep(2500);
    const pad = await page.evaluate(() => {
      const bv = (window as any).__bv; const p = bv.player;
      const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z) - 12;
      for (let x = cx - 10; x <= cx + 10; x++) for (let z = cz - 10; z <= cz + 10; z++) {
        bv.world.setBlock(x, cy - 1, z, 40);
        for (let y = cy; y <= cy + 5; y++) bv.world.setBlock(x, y, z, 0);
      }
      bv.forceRemeshAround?.();
      return { cx, cy, cz };
    });
    await sleep(1500);
    await setHeld(page, 89);
    const { cx, cy, cz } = pad;
    await aim(page, cx + 0.5, cy + 0.05, cz + 4.6, cx + 0.5, cy - 0.05, cz + 0.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(200);
    const placed = await gb(cx, cy, cz);
    await page.evaluate(({ cx, cy, cz }) => { const bv = (window as any).__bv; bv.teleport(cx + 0.5, cy + 4.0, cz + 9.5); }, pad);
    await simSleep(4.5);
    const reach = [await gb(cx + 7, cy, cz), await gm(cx + 7, cy, cz), await gb(cx + 8, cy, cz), await gm(cx + 1, cy, cz)];
    const cnt = await page.evaluate(({ cx, cy, cz }) => { const w = (window as any).__bv.world; let n = 0; for (let x = cx - 9; x <= cx + 9; x++) for (let z = cz - 9; z <= cz + 9; z++) if (w.getBlock(x, cy, z) === 44) n++; return n; }, pad);
    // stand on a helstein pillar (no creative/flying) for the screenshot and the scoop
    await page.evaluate(({ cx, cy, cz }) => { const bv = (window as any).__bv; bv.world.setBlock(cx, cy, cz + 3, 40); bv.world.setBlock(cx, cy + 1, cz + 3, 40); bv.world.setBlock(cx, cy + 2, cz + 3, 40); bv.forceRemeshAround?.(); }, pad);
    await aim(page, cx + 0.5, cy + 3.0, cz + 3.5, cx + 0.5, cy + 0.5, cz - 1.5);
    await sleep(900);
    await shot(page, 'it25-06-helvete-lava-7.png');
    // scoop the source (real RMB) → recedes
    await setHeld(page, 87);
    await aim(page, cx + 0.5, cy + 3.0, cz + 3.5, cx + 0.5, cy + 0.5, cz + 0.5);
    await sleep(150);
    await hold(page, 80, 'right'); await sleep(300);
    const h = await held();
    await simSleep(5.0);
    const left = await page.evaluate(({ cx, cy, cz }) => { const w = (window as any).__bv.world; let n = 0; for (let x = cx - 9; x <= cx + 9; x++) for (let z = cz - 9; z <= cz + 9; z++) if (w.getBlock(x, cy, z) === 44) n++; return n; }, pad);
    const hp = await page.evaluate(() => (window as any).__bv.player.health);
    await page.evaluate(() => (window as any).__bv.exitHelvete());
    await sleep(2000);
    await ensureLocked(page);
    record('HL1-helvete-lava-7', ent?.ok && placed === 44 && reach[0] === 44 && reach[1] === 1 && reach[2] !== 44 && reach[3] === 7 && cnt === 113 && h?.id === 89 && left === 0 && hp === 20 ? 'PASS' : 'FAIL',
      JSON.stringify({ ent: ent?.ok, placed, reach, cnt, h, left, hp }));
  }

  // OW1 — overworld lava still flows only 3 (regression of the encoding change)
  if (run('OW1')) {
    await resetArena();
    await heal();
    await setHeld(page, 89);
    await aim(page, 8.5, 46.05, 12.6, 8.5, 45.95, 8.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    await page.evaluate(() => { (window as any).__bv.teleport(8.5, 46.0, 15.5); });
    await simSleep(6.5);
    const full = await lavaCount(46, 0, 17, 0, 17), m = [await gm(9, 46, 8), await gm(10, 46, 8), await gm(11, 46, 8)], out = await gb(12, 46, 8);
    await aim(page, 8.5, 48.6, 14.5, 8.5, 46.0, 8.5);
    await sleep(500);
    await shot(page, 'it25-07-lava-oververden-3.png');
    record('OW1-overworld-lava-3', full === 25 && m[0] === 6 && m[1] === 4 && m[2] === 2 && out === 0 ? 'PASS' : 'FAIL', JSON.stringify({ full, m, out }));
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 0; x <= 17; x++) for (let z = 0; z <= 17; z++) bv.world.setBlock(x, 46, z, 0); });
  }

  // WS1 — water flowing down a staircase: the step side is drawn only above the lower cell's surface (no double dark layer) — visual check
  if (run('WS1')) {
    await resetArena();
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 4; x <= 12; x++) for (let z = 4; z <= 12; z++) bv.world.setBlock(x, 46, z, 0); });
    await setHeld(page, 88);
    await aim(page, 8.5, 46.05, 12.0, 8.5, 45.95, 8.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    await simSleep(5);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(14, 46, 8, 3); bv.forceRemeshAround?.(); });
    await aim(page, 14.5, 47.0, 8.5, 9.5, 46.1, 8.5); // low pillar outside the pool, looking across the steps
    await sleep(900);
    await shot(page, 'it25-08-vann-trinn.png');
    const lv = [await gm(9, 46, 8), await gm(11, 46, 8)];
    record('WS1-water-step-side', lv[0] === 6 && lv[1] === 4 ? 'PASS' : 'FAIL', JSON.stringify({ lv, note: 'visual check of screenshot' }));
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
