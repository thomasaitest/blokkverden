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
  const { base, child } = await startPreview();
  process.on('exit', () => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  T0 = Date.now();
  await page.addInitScript('window.__name = (f) => f;');
  page.on('pageerror', (e) => bug('pageerror ' + e.message));
  await boot(page, base, 'It18Explore');
  await acquireLock(page);
  await sleep(3000);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.5); bv.mobs.clear(); });
  const only = (process.env.BV_ONLY || '').split(',').filter(Boolean);
  const run = (id: string) => !only.length || only.includes(id);
  const gb = (x: number, y: number, z: number) => page.evaluate(({ x, y, z }) => (window as any).__bv.world.getBlock(x, y, z), { x, y, z });
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    for (let x = -4; x <= 20; x++) for (let z = -4; z <= 22; z++) {
      for (let y = 40; y <= 44; y++) bv.world.setBlock(x, y, z, 3);
      bv.world.setBlock(x, 45, z, 1);
      for (let y = 46; y <= 60; y++) bv.world.setBlock(x, y, z, 0);
    }
    bv.mobs.clear(); bv.forceRemeshAround?.();
  });
  await sleep(1500);
  await ensureLocked(page);

  // X1 — pillar jump: look straight down, Space + RMB repeatedly → stand 4 blocks up on a dirt pillar
  if (run('X1')) {
    await setHeld(page, 2);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 2, count: 10 }; bv.hud.refreshHotbar(); bv.teleport(8.5, 46.0, 8.5); bv.look(0, -Math.PI / 2 + 0.01); });
    await sleep(500);
    const log: any[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.down('Space');
      // wait until near the top of the jump
      let peak = 0;
      for (let t = 0; t < 20; t++) { await sleep(30); const p = await st(page); if (p.y > peak) peak = p.y; if (p.y - (46 + i) > 1.05) break; }
      await page.keyboard.up('Space');
      await hold(page, 60, 'right');
      await sleep(700);
      const p = await st(page);
      log.push({ y: +p.y.toFixed(2), peak: +peak.toFixed(2), left: await countItem(page, 2) });
    }
    const p = await st(page);
    record('X1-pillar-jump', p.y > 49.9 && (await countItem(page, 2)) === 6 ? 'PASS' : 'FAIL', JSON.stringify(log));
    await shot(page, 'it18-x1-pillar.png');
  }

  // X2 — sneak-bridge: stand at the east edge of a 1-wide ledge over a pit, sneak backwards, look down-back, RMB places on the side face
  if (run('X2')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 0; x <= 16; x++) for (let z = 0; z <= 4; z++) for (let y = 40; y <= 45; y++) bv.world.setBlock(x, y, z + 14, 0);
      for (let y = 40; y <= 45; y++) for (let z = 14; z <= 18; z++) bv.world.setBlock(-1, y, z, 0);
      bv.world.setBlock(2, 45, 16, 3);
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 4);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 4, count: 10 }; bv.hud.refreshHotbar(); bv.teleport(2.5, 46.0, 16.5); bv.look(Math.PI / 2, 0); });
    await sleep(400);
    // face west (yaw=-pi/2?) — walk backwards (S) toward +x while sneaking
    const yaw0 = (await st(page)).yaw;
    await page.keyboard.down('ShiftLeft');
    let placed = 0;
    for (let i = 0; i < 4; i++) {
      await page.keyboard.down('KeyS'); await sleep(900); await page.keyboard.up('KeyS');
      const p = await st(page);
      // look down-back at the edge's side face
      await page.evaluate(({ x, y, z }) => { const bv = (window as any).__bv; bv.lookAt(x, 45.5, z); }, { x: Math.floor(p.x) - 0.02, y: p.y, z: p.z });
      await sleep(100);
      const before = await countItem(page, 4);
      await hold(page, 60, 'right');
      await sleep(250);
      if ((await countItem(page, 4)) < before) placed++;
      await page.evaluate((yaw) => { (window as any).__bv.look(yaw, 0); }, yaw0);
      await sleep(100);
    }
    await page.keyboard.up('ShiftLeft');
    const p = await st(page);
    const row: number[] = []; for (let x = 2; x <= 7; x++) row.push(await gb(x, 45, 16));
    record('X2-sneak-bridge', placed >= 3 && p.y > 45.9 && p.x > 4 ? 'PASS' : 'FAIL', JSON.stringify({ placed, x: p.x.toFixed(2), y: p.y.toFixed(2), row }));
    await shot(page, 'it18-x2-bro.png');
  }

  // X3 — walk through flowers / tall grass (no collision) with W
  if (run('X3')) {
    await page.evaluate(() => { const bv = (window as any).__bv; for (let z = 6; z <= 10; z++) bv.world.setBlock(12, 46, z, z % 3 === 0 ? 79 : z % 3 === 1 ? 80 : 78); bv.teleport(12.5, 46.0, 12.5); bv.look(0, 0); bv.forceRemeshAround?.(); });
    await sleep(300);
    await walk(page, 'KeyW', 1500);
    const p = await st(page);
    record('X3-walk-through-plants', p.z < 6.5 ? 'PASS' : 'FAIL', `z=${p.z.toFixed(2)}`);
  }

  // X4 — dig straight down 3 with a shovel (hold LMB looking down), you drop each time; no stuck
  if (run('X4')) {
    await setHeld(page, 102);
    await page.evaluate(() => { const bv = (window as any).__bv; for (let y = 42; y <= 45; y++) bv.world.setBlock(16, y, 8, 2); bv.teleport(16.5, 46.0, 8.5); bv.look(0, -Math.PI / 2 + 0.01); });
    await sleep(400);
    for (let i = 0; i < 3; i++) { await hold(page, 900); await sleep(500); }
    const p = await st(page);
    record('X4-dig-down', p.y < 43.1 && p.y > 41.9 ? 'PASS' : 'FAIL', `y=${p.y.toFixed(2)}`);
  }

  // X5 — break a block above your head while standing in a 2-high tunnel, then jump into the gap (no head bonk glitch)
  if (run('X5')) {
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 6; x <= 10; x++) for (let z = 4; z <= 6; z++) { bv.world.setBlock(x, 48, z, 3); bv.world.setBlock(x, 49, z, 0); } bv.world.setBlock(8, 49, 5, 0); bv.teleport(8.5, 46.0, 5.5); bv.look(0, Math.PI / 2 - 0.01); });
    await setHeld(page, 104);
    await sleep(300);
    await hold(page, 1600);
    await sleep(300);
    const gone = (await gb(8, 48, 5)) === 0;
    await page.keyboard.down('Space'); await sleep(400);
    const p = await st(page);
    await page.keyboard.up('Space');
    record('X5-mine-ceiling-jump', gone && p.y > 47.0 ? 'PASS' : 'FAIL', `gone=${gone} peakY=${p.y.toFixed(2)}`);
  }


  // X6 — ladder: walk (W) into a ladder on a wall → climb without Space; release → slide; Shift → hold; climb out on top
  if (run('X6')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 2; x <= 8; x++) for (let z = 16; z <= 22; z++) { for (let y = 40; y <= 44; y++) bv.world.setBlock(x, y, z, 3); bv.world.setBlock(x, 45, z, 1); }
      for (let x = 2; x <= 8; x++) for (let y = 46; y <= 51; y++) bv.world.setBlock(x, y, 20, 3);
      for (let y = 46; y <= 51; y++) bv.world.setBlock(5, y, 19, 33);
      bv.teleport(5.5, 46.0, 18.2); bv.look(Math.PI, 0); bv.forceRemeshAround?.();
    });
    await setHeld(page, 0);
    await aim(page, 5.5, 46.0, 16.0, 5.5, 47.5, 19.5);
    await sleep(800);
    await shot(page, 'it18-x6-stige-avstand.png');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(5.5, 46.0, 18.2); bv.look(Math.PI, 0); });
    await sleep(500);
    await page.keyboard.down('KeyW'); await sleep(1000);
    const yClimb = (await st(page)).y;
    await page.keyboard.up('KeyW');
    await page.keyboard.down('ShiftLeft'); await sleep(800);
    const yHold = (await st(page)).y;
    await page.keyboard.up('ShiftLeft');
    await sleep(500);
    const ySlide = (await st(page)).y;
    await shot(page, 'it18-x6-stige.png');
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 40 && (await st(page)).y < 51.95; i++) await sleep(100);
    await sleep(250);
    await page.keyboard.up('KeyW');
    await sleep(500);
    const top = await st(page);
    record('X6-ladder', yClimb > 47.0 && Math.abs(yHold - yClimb) < 0.3 && ySlide < yHold - 0.3 && top.y > 51.9 && top.z > 19.7 && top.z < 21.3 && top.health === 20 ? 'PASS' : 'FAIL',
      JSON.stringify({ yClimb: yClimb.toFixed(2), yHold: yHold.toFixed(2), ySlide: ySlide.toFixed(2), top: [top.x.toFixed(2), top.y.toFixed(2), top.z.toFixed(2)], hp: top.health }));
  }

  // X7 — door: place with RMB (real), it is 2 tall; click its UPPER half to open, walk through, click again to close → blocks you
  if (run('X7')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 10; x <= 16; x++) for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, 2, 4);
      bv.world.setBlock(13, 46, 2, 0); bv.world.setBlock(13, 47, 2, 0);
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 26);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 26, count: 2 }; bv.hud.refreshHotbar(); });
    // place against the floor inside the gap
    await aim(page, 13.5, 46.0, 5.5, 13.5, 45.99, 2.5);
    await hold(page, 60, 'right'); await sleep(300);
    const placed = await gb(13, 46, 2);
    const facing = await page.evaluate(() => ((window as any).__bv.world.getWaterLevel(13, 46, 2) >> 2) & 3);
    // try to place a block into the upper half → refused
    await setHeld(page, 4);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 4, count: 3 }; bv.hud.refreshHotbar(); });
    await aim(page, 13.5, 46.0, 5.5, 13.5, 47.5, 2.6);
    const tgt = await page.evaluate(() => { const h = (window as any).__bv.targetHit(); return h && [h.x, h.y, h.z]; });
    await hold(page, 60, 'right'); await sleep(300);
    const upper = await gb(13, 47, 2);
    // MC: RMB on a door opens it even with a block in hand → it is open now; close it again
    const openedByBlockClick = (await page.evaluate(() => (window as any).__bv.world.getWaterLevel(13, 46, 2))) & 1;
    await hold(page, 60, 'right'); await sleep(300);
    await setHeld(page, 0);
    await aim(page, 13.5, 46.0, 4.5, 13.5, 47.6, 2.5);
    await walk(page, 'KeyW', 800);
    const blocked = (await st(page)).z;
    await aim(page, 13.5, 46.0, 4.5, 13.5, 47.6, 2.5);
    await sleep(300);
    await shot(page, 'it18-x7-doer-lukket.png');
    await hold(page, 60, 'right'); await sleep(300);
    const metaOpen = await page.evaluate(() => (window as any).__bv.world.getWaterLevel(13, 46, 2));
    await sleep(300);
    await shot(page, 'it18-x7-doer-aapen.png');
    await page.evaluate(() => (window as any).__bv.look(0, 0));
    await walk(page, 'KeyW', 1200);
    const through = (await st(page)).z;
    await page.evaluate(() => (window as any).__bv.lookAt(13.5, 47.6, 2.5));
    await hold(page, 60, 'right'); await sleep(300);
    const metaClosed = await page.evaluate(() => (window as any).__bv.world.getWaterLevel(13, 46, 2));
    await page.evaluate(() => (window as any).__bv.look(Math.PI, 0));
    await walk(page, 'KeyW', 800);
    const back = (await st(page)).z;
    const ok = placed === 26 && facing === 0 && openedByBlockClick === 1 && JSON.stringify(tgt) === '[13,46,2]' && upper === 0 && blocked > 3.2 && (metaOpen & 1) === 1 && through < 1.9 && (metaClosed & 1) === 0 && back < 1.9;
    record('X7-door', ok ? 'PASS' : 'FAIL', JSON.stringify({ placed, facing, tgt, upper, openedByBlockClick, blocked: blocked.toFixed(2), metaOpen, through: through.toFixed(2), metaClosed, back: back.toFixed(2) }));
  }

  // X8 — fall 20 blocks into 2-deep water: no fall damage (MC)
  if (run('X8')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 14; x <= 18; x++) for (let z = 14; z <= 18; z++) for (let y = 40; y <= 45; y++) bv.world.setBlock(x, y, z, 3);
      for (let x = 15; x <= 17; x++) for (let z = 15; z <= 17; z++) for (let y = 43; y <= 45; y++) { bv.world.setBlock(x, y, z, 0); bv.world.setWater(x, y, z, 7); }
      bv.forceRemeshAround?.();
      bv.player.health = 20; bv.teleport(16.5, 66, 16.5);
    });
    await sleep(3500);
    const p = await st(page);
    record('X8-water-landing', p.health === 20 && p.y < 46.5 && p.y > 42.9 ? 'PASS' : 'FAIL', `hp=${p.health} y=${p.y.toFixed(2)}`);
    await page.evaluate(() => (window as any).__bv.teleport(8.5, 46, 8.5));
  }

  // X9 — Q drops one of the held stack; walking back picks it up again
  if (run('X9')) {
    await page.evaluate(() => { const bv = (window as any).__bv; bv.drops.drops.length = 0; bv.teleport(8.5, 46, 8.5); bv.look(0, 0); });
    await setHeld(page, 4);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 4, count: 5 }; bv.hud.refreshHotbar(); });
    await page.keyboard.press('KeyQ'); await sleep(300);
    const after = await countItem(page, 4);
    const nDrops = await page.evaluate(() => (window as any).__bv.drops.drops.length);
    await sleep(2200);
    await walk(page, 'KeyW', 1200);
    await sleep(600);
    const back = await countItem(page, 4);
    record('X9-q-drop-pickup', after === 4 && nDrops === 1 && back === 5 ? 'PASS' : 'FAIL', JSON.stringify({ after, nDrops, back }));
  }

  // X10 — sleep in a bed at night (RMB) → morning
  if (run('X10')) {
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); bv.world.setBlock(4, 46, 4, 20); bv.forceRemeshAround?.(); bv.setDay(0.9); });
    await setHeld(page, 0);
    await aim(page, 4.5, 46.0, 6.5, 4.5, 46.3, 4.5);
    await hold(page, 60, 'right'); await sleep(500);
    const t = await page.evaluate(() => (window as any).__bv.getState().dayTime % 1);
    record('X10-bed-sleep', t > 0.25 && t < 0.35 ? 'PASS' : 'FAIL', `dayTime=${t.toFixed(3)}`);
    await page.evaluate(() => (window as any).__bv.setDay(0.5));
  }

  // X11 — mining under water is ×5 slower (dirt by hand: ~0.5 s on land → ~2.5 s with eyes under water)
  if (run('X11')) {
    const timeBreak = async (x: number, y: number, z: number) => {
      const t0 = Date.now();
      await page.mouse.down();
      for (let i = 0; i < 80 && (await gb(x, y, z)) !== 0; i++) await sleep(50);
      await page.mouse.up();
      return Date.now() - t0;
    };
    await setHeld(page, 0);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(2, 46, 10, 2); bv.forceRemeshAround?.(); });
    await aim(page, 2.5, 46.0, 12.5, 2.5, 46.5, 10.5);
    await sleep(300);
    const land = await timeBreak(2, 46, 10);
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 0; x <= 6; x++) for (let z = 12; z <= 18; z++) for (let y = 42; y <= 45; y++) bv.world.setBlock(x, y, z, (x === 0 || x === 6 || z === 12 || z === 18) ? 3 : 0);
      for (let x = 1; x <= 5; x++) for (let z = 13; z <= 17; z++) { bv.world.setBlock(x, 41, z, 3); for (let y = 42; y <= 45; y++) bv.world.setWater(x, y, z, 7); }
      bv.world.setBlock(3, 42, 13, 2);
      bv.forceRemeshAround?.();
    });
    await aim(page, 3.5, 42.0, 15.0, 3.5, 42.5, 13.5);
    await sleep(500);
    const st0 = await st(page);
    const water = await timeBreak(3, 42, 13);
    const st1 = await st(page);
    record('X11-mining-underwater', land < 1100 && water > 2000 && water < 4500 ? 'PASS' : 'FAIL', JSON.stringify({ land, water, y0: st0.y.toFixed(2), y1: st1.y.toFixed(2) }));
    await page.evaluate(() => (window as any).__bv.teleport(8.5, 46, 8.5));
  }

  console.log('=== SUMMARY ===', JSON.stringify(results.map((r) => r.status)), 'BUGS', JSON.stringify(bugs));
  await ctx.close(); await browser.close(); child.kill('SIGKILL'); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
