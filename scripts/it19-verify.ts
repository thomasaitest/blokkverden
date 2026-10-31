/**
 * it19 verify: fire + flint and steel, burning, lava, thin door panel (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it19';
const VID = '/tmp/it19-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it19';

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
  await boot(page, base, 'It19Verify');
  await acquireLock(page);
  await sleep(3000);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.5); bv.mobs.clear(); });
  const only = (process.env.BV_ONLY || '').split(',').filter(Boolean);
  const run = (id: string) => !only.length || only.includes(id);
  const gb = (x: number, y: number, z: number) => page.evaluate(({ x, y, z }) => (window as any).__bv.world.getBlock(x, y, z), { x, y, z });
  const meta = (x: number, y: number, z: number) => page.evaluate(({ x, y, z }) => (window as any).__bv.world.getWaterLevel(x, y, z), { x, y, z });
  const dropIds = () => page.evaluate(() => (window as any).__bv.drops.drops.map((d: any) => d.stack.id));
  const clearDrops = () => page.evaluate(() => { (window as any).__bv.drops.drops.length = 0; });

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

  const health = () => page.evaluate(() => (window as any).__bv.player.health);
  const heal = () => page.evaluate(() => { const bv = (window as any).__bv; bv.player.health = 20; bv.player.hunger = 20; bv.burn.burnTime = 0; });
  const heldDur = () => page.evaluate(() => (window as any).__bv.inv.slots[0]?.durability ?? null);
  const fsSlot = () => page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots.fill(null); bv.inv.slots[0] = { id: 82, count: 1, durability: 64 }; bv.inv.selected = 0; bv.hud.refreshHotbar(); bv.hud.markDirty(); });

  // FS0 — craft flint and steel: iron ingot + flint in the 2×2 grid (real UI clicks)
  if (run('FS0')) {
    await setHeld(page, 0, { 53: 2, 77: 2 });
    const ok = await uiCraft(page, [77, 53], 2);
    await closeUi(page);
    await ensureLocked(page);
    const fs1 = await countItem(page, 82), iron = await countItem(page, 53), flint = await countItem(page, 77);
    record('FS0-craft-flint-and-steel', ok && fs1 === 1 && iron === 1 && flint === 1 ? 'PASS' : 'FAIL', JSON.stringify({ fs1, iron, flint }));
  }

  // FS1 — RMB on the grass with flint and steel → fire on top (lit, light), 1 durability used; burns out on its own
  if (run('FS1')) {
    await fsSlot();
    await page.evaluate(() => (window as any).__bv.setDay(0.85)); // night: see the light
    await aim(page, 8.5, 46.05, 11.5, 8.5, 45.95, 8.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(400);
    const lit = await gb(8, 46, 8);
    const dur = await heldDur();
    const light = await page.evaluate(() => { const bv = (window as any).__bv; return bv.world.getLight ? bv.world.getLight(8, 46, 9) : null; });
    await page.evaluate(() => (window as any).__bv.teleport(8.5, 46.05, 11.5));
    await page.evaluate(() => (window as any).__bv.lookAt(8.5, 46.5, 8.5));
    await sleep(700);
    await shot(page, 'it19-01-ild-natt.png');
    let t = 0;
    for (; t < 14 && (await gb(8, 46, 8)) === 83; t++) await sleep(1000);
    const after = await gb(8, 46, 8);
    await page.evaluate(() => (window as any).__bv.setDay(0.5));
    record('FS1-light-fire', lit === 83 && dur === 63 && after === 0 && t >= 2 ? 'PASS' : 'FAIL', JSON.stringify({ lit, dur, light, burnedOutAfter: t, after }));
  }

  // FS2 — fire next to a planks hut spreads and burns it away
  if (run('FS2')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 1; x <= 5; x++) for (let z = 14; z <= 18; z++) for (let y = 46; y <= 48; y++) {
        const wall = x === 1 || x === 5 || z === 14 || z === 18 || y === 48;
        bv.world.setBlock(x, y, z, wall ? 6 : 0);
      }
      bv.forceRemeshAround?.();
    });
    await fsSlot();
    const planks = () => page.evaluate(() => { const bv = (window as any).__bv; let n = 0; for (let x = 1; x <= 5; x++) for (let z = 14; z <= 18; z++) for (let y = 46; y <= 48; y++) if (bv.world.getBlock(x, y, z) === 6) n++; return n; });
    const p0 = await planks();
    // RMB on the hut's +X wall face (x=5) → fire in the air cell at x=6 next to it
    await aim(page, 9.5, 46.05, 16.5, 5.5, 46.5, 16.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(300);
    const lit = await gb(6, 46, 16);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(11.5, 46.05, 21.5); bv.lookAt(3, 47, 16); });
    let maxFires = 0;
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      const n = await page.evaluate(() => (window as any).__bv.fire.fires.size);
      maxFires = Math.max(maxFires, n);
      if (i === 8) await shot(page, 'it19-02-ild-sprer-seg.png');
    }
    const p1 = await planks();
    await shot(page, 'it19-03-hytte-brent.png');
    record('FS2-fire-spreads', lit === 83 && maxFires >= 3 && p1 <= p0 - 6 ? 'PASS' : 'FAIL', JSON.stringify({ lit, p0, p1, maxFires }));
  }

  // FS3 — walk (W) through fire: damage + keep burning after; walk on into water → put out
  if (run('FS3')) {
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 10; x <= 14; x++) for (let z = 2; z <= 10; z++) { bv.world.setBlock(x, 45, z, 1); for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, z, 0); }
      for (let x = 11; x <= 13; x++) for (let z = 2; z <= 4; z++) bv.world.setBlock(x, 45, z, 10); // water pit 1 deep
      bv.world.setBlock(12, 46, 7, 83); bv.fire.track(12, 46, 7); bv.fire.fires.get('12,46,7').life = 60;
      bv.forceRemeshAround?.();
      bv.teleport(12.5, 46.05, 9.5); bv.look(0, 0);
    });
    await setHeld(page, 0);
    await sleep(500);
    const h0 = await health();
    await page.keyboard.down('KeyW'); await sleep(450); await page.keyboard.up('KeyW');
    await sleep(500);
    const inside = await page.evaluate(() => ({ burn: (window as any).__bv.burn.burnTime, z: (window as any).__bv.player.z, overlay: getComputedStyle(document.getElementById('fire-overlay')!).display }));
    await shot(page, 'it19-04-brenner.png');
    await page.keyboard.down('KeyW'); await sleep(1000); await page.keyboard.up('KeyW');
    await sleep(1500);
    const s1 = await page.evaluate(() => ({ overlay: getComputedStyle(document.getElementById('fire-overlay')!).display, burn: (window as any).__bv.burn.burnTime, inWater: (window as any).__bv.player.inWater, z: (window as any).__bv.player.z }));
    const h1 = await health();
    record('FS3-burn-and-water', h1 < h0 && inside.burn > 0 && inside.overlay === 'block' && s1.inWater && s1.burn === 0 && s1.overlay === 'none' ? 'PASS' : 'FAIL', JSON.stringify({ h0, h1, inside, s1 }));
    await heal();
  }

  // FS4 — portal frame lit with flint and steel (RMB on the frame's bottom row), 1 durability used
  if (run('FS4')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let w = 0; w < 4; w++) for (let h = 0; h < 5; h++) {
        const border = h === 0 || h === 4 || w === 0 || w === 3;
        bv.world.setBlock(14 + w, 46 + h, 14, border ? 43 : 0);
      }
      bv.forceRemeshAround?.();
    });
    await fsSlot();
    await aim(page, 15.9, 46.05, 18.5, 15.9, 46.95, 14.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(500);
    const portal = await page.evaluate(() => { const bv = (window as any).__bv; let n = 0; for (let w = 1; w <= 2; w++) for (let h = 1; h <= 3; h++) if (bv.world.getBlock(14 + w, 46 + h, 14) === 42) n++; return n; });
    const dur = await heldDur();
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(16, 46.05, 19.5); bv.lookAt(16, 48.5, 14.5); });
    await sleep(800);
    await shot(page, 'it19-05-portal-fyrstaal.png');
    record('FS4-portal-flint-and-steel', portal === 6 && dur === 63 ? 'PASS' : 'FAIL', JSON.stringify({ portal, dur }));
  }

  // L1 — lava: walking in is slow and burns (4 dmg / 0.5 s), you keep burning after getting out
  if (run('L1')) {
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 0; x <= 4; x++) for (let z = 2; z <= 8; z++) { bv.world.setBlock(x, 45, z, 3); for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, z, 0); }
      for (let x = 1; x <= 3; x++) for (let z = 3; z <= 5; z++) bv.world.setBlock(x, 45, z, 44);
      bv.forceRemeshAround?.();
      bv.teleport(2.5, 46.05, 7.5); bv.look(0, 0);
    });
    await setHeld(page, 0);
    await sleep(500);
    await page.keyboard.down('KeyW'); await sleep(700);
    const zIn = (await st(page)).z;
    await sleep(800);
    const zIn2 = (await st(page)).z;
    await page.keyboard.up('KeyW');
    const s = await page.evaluate(() => ({ inLava: (window as any).__bv.player.inLava, hp: (window as any).__bv.player.health, burn: (window as any).__bv.burn.burnTime }));
    await shot(page, 'it19-06-lava.png');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(2.5, 46.05, 7.5); });
    await sleep(1600);
    const out = await page.evaluate(() => ({ hp: (window as any).__bv.player.health, burn: (window as any).__bv.burn.burnTime }));
    const speed = (zIn - zIn2) / 0.8;
    record('L1-lava', s.inLava && s.hp <= 17 && speed < 1.6 && out.burn > 10 && out.hp < s.hp ? 'PASS' : 'FAIL', JSON.stringify({ s, speed: speed.toFixed(2), out }));
    await heal();
  }

  // D1 — door: thin panel. Closed: you can step into the door cell up to the panel; open: walk through
  if (run('D1')) {
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 6; x <= 10; x++) for (let z = 15; z <= 21; z++) { bv.world.setBlock(x, 45, z, 1); for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, z, 0); }
      for (let x = 6; x <= 10; x++) for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, 17, 4);
      bv.world.setBlock(8, 46, 17, 0); bv.world.setBlock(8, 47, 17, 0);
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 26);
    await aim(page, 8.5, 46.05, 20.5, 8.5, 45.99, 17.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(400);
    const placed = await gb(8, 46, 17);
    const m = await meta(8, 46, 17);
    await setHeld(page, 0);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(8.5, 46.05, 19.5); bv.look(0, 0); });
    await sleep(300);
    await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
    await sleep(300);
    const zClosed = (await st(page)).z;
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(8.5, 46.05, 19.5); bv.lookAt(8.5, 47.2, 17.5); });
    await sleep(600);
    await shot(page, 'it19-07-doer-tynn.png');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.look(0, 0); });
    await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.lookAt(8.5, 47.0, 17.5); });
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    const open = (await meta(8, 46, 17)) & 1;
    await page.evaluate(() => { const bv = (window as any).__bv; bv.look(0, 0); });
    await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
    await sleep(300);
    const zOpen = (await st(page)).z;
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(10.2, 46.05, 15.2); bv.lookAt(8.5, 46.8, 17.5); });
    await sleep(600);
    await shot(page, 'it19-08-doer-aapen.png');
    record('D1-door-thin-panel', placed === 26 && zClosed > 17.4 && zClosed < 17.6 && open === 1 && zOpen < 16.6 ? 'PASS' : 'FAIL', JSON.stringify({ placed, m, zClosed: zClosed.toFixed(2), open, zOpen: zOpen.toFixed(2) }));
  }

  // NL1 — night: a torch placed with RMB lights up the ground around it (block light is not dimmed at night)
  if (run('NL1')) {
    await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.85); for (let x = 15; x <= 18; x++) for (let z = 4; z <= 9; z++) for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, z, 0); bv.forceRemeshAround?.(); });
    await setHeld(page, 12);
    await aim(page, 16.5, 46.05, 9.5, 16.5, 46.0, 6.5);
    await sleep(1200);
    const lum = async (name: string) => {
      const buf = await page.screenshot({ type: 'png' });
      if (name) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), buf); }
      return page.evaluate(async (b64) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
        const m = (x0: number, y0: number, w: number, h: number) => { const d = g.getImageData(x0, y0, w, h).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
        const W = img.width, H = img.height;
        return { near: m(W * 0.35 | 0, H * 0.55 | 0, W * 0.3 | 0, H * 0.15 | 0), far: m(0, H * 0.5 | 0, W * 0.1 | 0, H * 0.1 | 0) };
      }, buf.toString('base64'));
    };
    const before = await lum('it19-09a-foer-fakkel.png');
    await hold(page, 80, 'right'); await sleep(1500);
    const torch = await gb(16, 46, 6);
    let after = await lum('it19-09-fakkel-natt.png');
    // remesh after the torch can take a moment in headless swiftshader
    for (let i = 0; i < 6 && after.near < before.near * 1.8; i++) { await sleep(1000); after = await lum('it19-09-fakkel-natt.png'); }
    await page.evaluate(() => { const bv = (window as any).__bv; bv.player.creative = true; bv.player.flying = true; bv.teleport(16.5, 58, 20.5); bv.lookAt(16.5, 46, 6.5); });
    await sleep(1500);
    await shot(page, 'it19-10-fakkel-ovenfra.png');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.player.flying = false; bv.player.creative = false; bv.teleport(16.5, 46.05, 9.5); });
    await page.evaluate(() => (window as any).__bv.setDay(0.5));
    record('NL1-torch-lights-night', torch === 12 && after.near > before.near * 1.8 && after.near > 40 ? 'PASS' : 'FAIL', JSON.stringify({ torch, before, after }));
  }

  const report = { when: new Date().toISOString(), results, bugs };
  fs.writeFileSync(path.join(OUT, 'it19-verify.json'), JSON.stringify(report, null, 2));
  const summary: Record<string, number> = { PASS: 0, FAIL: 0, PARTIAL: 0 };
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
  console.log('=== SUMMARY ===', summary, 'BUGS', JSON.stringify(bugs));
  await ctx.close();
  await browser.close();
  child.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
