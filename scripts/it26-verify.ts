/**
 * it26 verify: water current pushes the player and items, Helvete lava flows 7 blocks fast, milk bucket from a cow + drinking clears Sult, water step side (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it26';
const VID = '/tmp/it26-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it26';

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
  await boot(page, base, 'It26Verify');
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


  const boatInfo = () => page.evaluate(() => (window as any).__bv.boatSys.boats.map((b: any) => ({ x: b.x, y: b.y, z: b.z, yaw: b.yaw })));
  const clearBoats = () => page.evaluate(() => { const bs = (window as any).__bv.boatSys; if (bs.mounted) bs.dismount((window as any).__bv.player); bs.boats.length = 0; });
  const channel = async () => {
    await resetArena();
    await heal();
    await clearBoats();
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 1; x <= 14; x++) { bv.world.setBlock(x, 46, 7, 3); bv.world.setBlock(x, 46, 9, 3); bv.world.setBlock(x, 47, 7, 3); bv.world.setBlock(x, 47, 9, 3); } bv.world.setBlock(1, 46, 8, 3); bv.world.setBlock(1, 47, 8, 3); bv.forceRemeshAround?.(); });
    await sleep(500);
    await setHeld(page, 88);
    await aim(page, 1.5, 48.0, 8.5, 2.5, 45.95, 8.5); // on the end wall, looking down the channel
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    await simSleep(6);
  };

  // BD1 — a boat placed (real RMB) in a flowing channel drifts with the current (MC)
  if (run('BD1')) {
    await channel();
    const src = await gb(2, 46, 8);
    await setHeld(page, 66);
    await aim(page, 1.5, 48.0, 8.5, 3.5, 45.9, 8.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(200);
    const b0 = (await boatInfo())[0];
    await page.evaluate(() => { (window as any).__bv.teleport(9.5, 48.0, 9.5); (window as any).__bv.lookAt(5, 46.3, 8.5); });
    await simSleep(2.0);
    const b1 = (await boatInfo())[0];
    await shot(page, 'it26-01-bat-driver.png');
    record('BD1-boat-drifts', src === 10 && !!b0 && !!b1 && b1.x - b0.x > 1.2 && Math.abs(b1.z - 8.5) < 0.2 ? 'PASS' : 'FAIL',
      JSON.stringify({ src, b0, b1 }));
  }

  // BC1 — riding a boat (real RMB to mount, W to row) into a wall: it stops at the wall instead of sailing through it
  if (run('BC1')) {
    await resetArena();
    await heal();
    await clearBoats();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 2; x <= 14; x++) for (let z = 4; z <= 12; z++) { bv.world.setBlock(x, 45, z, 10); bv.world.setWater(x, 45, z, 7); }
      for (let z = 2; z <= 14; z++) { bv.world.setBlock(12, 45, z, 3); bv.world.setBlock(12, 46, z, 3); bv.world.setBlock(12, 47, z, 3); }
      bv.forceRemeshAround?.();
    });
    await sleep(600);
    await setHeld(page, 66);
    await aim(page, 4.5, 46.05, 3.6, 4.5, 45.0, 6.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    const placed = (await boatInfo()).length;
    await setHeld(page, 0);
    const bb = (await boatInfo())[0];
    await aim(page, 4.5, 46.05, 6.2, bb?.x ?? 4.5, (bb?.y ?? 45.9) + 0.2, bb?.z ?? 8.5);
    await sleep(150);
    await hold(page, 80, 'right'); await sleep(300);
    const mounted = await page.evaluate(() => (window as any).__bv.boatSys.mounted);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.look(-Math.PI / 2, -0.15); const b = bv.boatSys.getMounted(); if (b) b.yaw = -Math.PI / 2; });
    await sleep(100);
    await page.keyboard.down('KeyW'); await simSleep(4.0);
    const mid = (await boatInfo())[0];
    await shot(page, 'it26-02-bat-mot-vegg.png');
    await simSleep(1.0); await page.keyboard.up('KeyW');
    const end = (await boatInfo())[0];
    await page.keyboard.press('ShiftLeft'); await sleep(300);
    record('BC1-boat-stops-at-wall', placed === 1 && mounted && !!end && end.x < 11.6 && end.x > 10.5 && Math.abs(end.x - mid.x) < 0.05 ? 'PASS' : 'FAIL',
      JSON.stringify({ placed, mounted, mid, end }));
  }

  // BB1 — three real LMB punches break a boat and drop the boat item, which you pick up; damage wears off after a pause
  if (run('BB1')) {
    await resetArena();
    await heal();
    await clearBoats();
    await clearDrops();
    await page.evaluate(() => { const bv = (window as any).__bv; bv.boatSys.place(8.5, 46.0, 6.5); });
    await setHeld(page, 0);
    await aim(page, 8.5, 46.0, 9.2, 8.5, 46.3, 6.5);
    await sleep(300);
    await shot(page, 'it26-03-bat-for-slag.png');
    await hold(page, 60, 'left'); await sleep(500);
    await hold(page, 60, 'left'); await sleep(500);
    const after2 = (await boatInfo()).length;
    await hold(page, 60, 'left'); await sleep(400);
    const after3 = (await boatInfo()).length;
    const dropped = await dropIds();
    await shot(page, 'it26-04-bat-knust.png');
    await walk(page, 'KeyW', 900); await sleep(800);
    const got = await countItem(page, 66);
    // a pause between hits: 2 hits, wait 4 s, 1 hit → still there
    await page.evaluate(() => { const bv = (window as any).__bv; bv.boatSys.place(8.5, 46.0, 6.5); });
    await aim(page, 8.5, 46.0, 9.2, 8.5, 46.3, 6.5);
    await sleep(200);
    await hold(page, 60, 'left'); await sleep(500);
    await hold(page, 60, 'left'); await sleep(500);
    await simSleep(4.0);
    await hold(page, 60, 'left'); await sleep(400);
    const stays = (await boatInfo()).length;
    // creative: one punch, no drop
    await clearDrops();
    await page.evaluate(() => { (window as any).__bv.player.creative = true; });
    await hold(page, 60, 'left'); await sleep(400);
    const cre = (await boatInfo()).length, creDrops = (await dropIds()).length;
    await heal();
    record('BB1-punch-boat', after2 === 1 && after3 === 0 && dropped.includes(66) && got === 1 && stays === 1 && cre === 0 && creDrops === 0 ? 'PASS' : 'FAIL',
      JSON.stringify({ after2, after3, dropped, got, stays, cre, creDrops }));
  }

  // LH1 — Helvete lava: the cell next to the source (strength 7) is drawn lower than the source (was full height)
  if (run('LH1')) {
    await heal();
    await clearBoats();
    const ent = await page.evaluate(() => (window as any).__bv.enterHelvete());
    await sleep(2500);
    const pad = await page.evaluate(() => {
      const bv = (window as any).__bv; const p = bv.player;
      const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z) - 8;
      for (let x = cx - 10; x <= cx + 10; x++) for (let z = cz - 10; z <= cz + 10; z++) {
        bv.world.setBlock(x, cy - 1, z, 40);
        for (let y = cy; y <= cy + 5; y++) bv.world.setBlock(x, y, z, 0);
      }
      bv.forceRemeshAround?.();
      return { cx, cy, cz };
    });
    await sleep(1500);
    const { cx, cy, cz } = pad;
    await setHeld(page, 89);
    await aim(page, cx + 0.5, cy + 0.05, cz + 4.6, cx + 0.5, cy - 0.05, cz + 0.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(200);
    await page.evaluate(({ cx, cy, cz }) => { const bv = (window as any).__bv; bv.world.setBlock(cx, cy, cz + 6, 40); bv.world.setBlock(cx, cy + 1, cz + 6, 40); bv.teleport(cx + 0.5, cy + 2.0, cz + 6.5); }, pad);
    await simSleep(4.5);
    const m = [await gm(cx, cy, cz), await gm(cx + 1, cy, cz), await gm(cx + 2, cy, cz)];
    await aim(page, cx + 3.5, cy + 0.9, cz + 0.5, cx - 0.5, cy + 0.5, cz + 0.5);
    await page.evaluate(({ cx, cy, cz }) => { const bv = (window as any).__bv; bv.teleport(cx + 4.5, cy + 2.0, cz + 0.5); bv.lookAt(cx + 0.5, cy + 0.8, cz + 0.5); }, pad);
    await sleep(900);
    await shot(page, 'it26-05-helvete-lava-trinn.png');
    await page.evaluate(() => (window as any).__bv.exitHelvete());
    await sleep(2000);
    await ensureLocked(page);
    record('LH1-helvete-lava-step', ent?.ok && m[0] === 0 && m[1] === 7 && m[2] === 6 ? 'PASS' : 'FAIL', JSON.stringify({ ent: ent?.ok, m, note: 'visual check of screenshot' }));
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
