/**
 * it21 verify: falling sand entity, flat ladders, rain stops at roofs, mobs avoid fire/lava, double tall grass (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it21';
const VID = '/tmp/it21-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it21';

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
  await boot(page, base, 'It21Verify');
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

  // FB1 — break the dirt under a 4-high sand column on a pillar (real LMB): the sand visibly falls (entity, mid-air y) and lands
  if (run('FB1')) {
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      // pillar of stone 46..49 at (4,_,4); dirt at 50; sand 51..54. Breaking dirt → sand falls 1 block.
      // Second column: sand floating 8 blocks over the ground at (8,_,4) on a dirt block → break the dirt → falls 8
      for (let y = 46; y <= 52; y++) bv.world.setBlock(8, y, 4, 0);
      bv.world.setBlock(8, 53, 4, 2);
      for (let y = 54; y <= 56; y++) bv.world.setBlock(8, y, 4, 8);
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 0);
    await aim(page, 8.5, 52.0, 7.5, 8.5, 53.5, 4.5); // flying-height viewpoint; stand on a temp block
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(8, 51, 7, 3); bv.forceRemeshAround?.(); bv.teleport(8.5, 52.0, 7.5); bv.lookAt(8.5, 53.5, 4.5); });
    await sleep(400);
    const t0 = Date.now();
    await page.mouse.down();
    let seen: { y: number }[] = []; let maxN = 0; const ys: number[] = [];
    for (let i = 0; i < 40; i++) {
      await sleep(50);
      const f = await page.evaluate(() => (window as any).__bv.falling());
      if (f.length) { seen = f; maxN = Math.max(maxN, f.length); ys.push(+Math.min(...f.map((q: any) => q.y)).toFixed(2)); if (ys.length === 1) { await page.mouse.up(); await page.evaluate(() => { const bv = (window as any).__bv; bv.player.flying = true; bv.teleport(12.5, 49.5, 9.5); bv.lookAt(8.5, 51, 4.5); }); } if (ys.length === 5) await shot(page, 'it21-01-sand-faller.png'); }
      if (ys.length && !f.length) break;
    }
    await page.mouse.up();
    await sleep(800);
    await page.evaluate(() => { (window as any).__bv.player.flying = false; });
    const col = [];
    for (let y = 45; y <= 49; y++) col.push(await gb(8, y, 4));
    await shot(page, 'it21-02-sand-landet.png');
    const midAir = ys.some((y) => y < 53 && y > 47);
    record('FB1-sand-falls-as-entity', maxN === 3 && midAir && col.join(',') === '1,8,8,8,0' ? 'PASS' : 'FAIL',
      JSON.stringify({ maxN, ys: ys.slice(0, 12), col, ms: Date.now() - t0, seen: seen.length }));
    await page.evaluate(() => { const bv = (window as any).__bv; for (let y = 46; y <= 56; y++) bv.world.setBlock(8, y, 4, 0); bv.world.setBlock(8, 51, 7, 0); });
  }

  // FB2 — place sand (real RMB) on the side of a floating block → it falls and lands on the ground; gravel on a torch → breaks into an item
  if (run('FB2')) {
    await heal(); await clearDrops();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.world.setBlock(12, 50, 4, 3); // floating stone
      bv.world.setBlock(14, 46, 9, 12); // torch on the grass (under where the gravel goes)
      bv.world.setBlock(14, 50, 8, 3); // floating stone over the torch
      bv.world.setBlock(12, 48, 7, 3); bv.world.setBlock(14, 48, 11, 3); // stands for the player
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 8);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0].count = 4; bv.inv.slots[1] = { id: 49, count: 4 }; bv.hud.refreshHotbar(); });
    await aim(page, 12.5, 49.0, 7.5, 12.5, 50.5, 4.98); // look at the +Z side of the floating stone
    await sleep(300);
    await hold(page, 80, 'right');
    let saw = false;
    for (let i = 0; i < 30; i++) { await sleep(50); if ((await page.evaluate(() => (window as any).__bv.falling().length)) > 0) saw = true; else if (saw) break; }
    await sleep(300);
    const landed = await gb(12, 46, 5), stillUp = await gb(12, 50, 5);
    await page.keyboard.press('Digit2'); await sleep(150);
    await aim(page, 14.5, 49.0, 11.5, 14.5, 50.5, 8.98);
    await sleep(300);
    const tgt2 = await page.evaluate(() => (window as any).__bv.targetHit());
    const sel = await page.evaluate(() => { const bv = (window as any).__bv; return [bv.inv.selected, bv.inv.slots[bv.inv.selected]?.id]; });
    await hold(page, 80, 'right');
    let saw2 = false;
    for (let i = 0; i < 30; i++) { await sleep(50); if ((await page.evaluate(() => (window as any).__bv.falling().length)) > 0) saw2 = true; else if (saw2) break; }
    await sleep(500);
    console.log('FB2 dbg', JSON.stringify({ tgt2, sel, saw2, inv: await countItem(page, 49) }));
    const torch = await gb(14, 46, 9), gravAt = await gb(14, 47, 9);
    const ids = await dropIds();
    record('FB2-placed-sand-falls-gravel-on-torch-pops', saw && landed === 8 && stillUp === 0 && torch === 12 && gravAt === 0 && ids.includes(49) ? 'PASS' : 'FAIL',
      JSON.stringify({ saw, landed, stillUp, torch, gravAt, ids }));
    await page.evaluate(() => { const bv = (window as any).__bv; for (const [x, y, z] of [[12, 50, 4], [12, 46, 5], [14, 46, 9], [14, 50, 8], [12, 48, 7], [14, 48, 11]]) bv.world.setBlock(x, y, z, 0); });
  }

  // LD1 — ladder placed with RMB on a wall side hangs flat on that wall (meta), thin outline; RMB on the top of the ground is refused; climb it (W)
  if (run('LD1')) {
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 2; x <= 8; x++) for (let y = 46; y <= 50; y++) bv.world.setBlock(x, y, 12, 3); // wall at z=12
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 33);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0].count = 16; bv.hud.refreshHotbar(); });
    let placed = 0;
    for (let y = 46; y <= 49; y++) {
      await aim(page, 5.5, 46.05, 9.0, 5.5, y + 0.5, 12.0); // look at the wall's −Z face
      await sleep(200);
      await hold(page, 80, 'right'); await sleep(200);
      if ((await gb(5, y, 11)) === 33) placed++;
    }
    const meta = await gm(5, 46, 11);
    // outline while looking at the ladder
    await aim(page, 5.5, 47.0, 8.5, 5.5, 47.5, 11.9);
    await sleep(250);
    const box = await page.evaluate(() => (window as any).__bv.outlineBox());
    await page.evaluate(() => (window as any).__bv.teleport(3.0, 47.2, 8.6));
    await page.evaluate(() => (window as any).__bv.lookAt(5.5, 47.5, 11.5));
    await sleep(400);
    await shot(page, 'it21-03-stige-flat.png');
    // refused on the top of the grass
    await aim(page, 9.5, 46.05, 8.5, 9.5, 45.5, 10.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(200);
    const onTop = await gb(9, 46, 10);
    // climb: walk (W) into the ladder
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(5.5, 46.0, 10.2); bv.look(0, 0); });
    await sleep(200);
    const lookZ = await page.evaluate(() => { const bv = (window as any).__bv; bv.lookAt(5.5, 47.6, 13); return bv.player.yaw; });
    await page.keyboard.down('KeyW'); await sleep(1500);
    const yClimb = (await st(page)).y;
    await page.keyboard.up('KeyW');
    const thin = Array.isArray(box) ? Math.abs(box[5] - box[2]) : -1;
    record('LD1-ladder-flat-thin-outline-climb', placed === 4 && meta === 4 && thin > 0 && thin < 0.25 && onTop === 0 && yClimb > 47.5 ? 'PASS' : 'FAIL',
      JSON.stringify({ placed, meta, box, thin, onTop, yClimb: +yClimb.toFixed(2), lookZ }));
  }

  // RN1 — rain under a roof: no rain streaks below the roof (they stop on it); in the open they reach the ground
  if (run('RN1')) {
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = -4; x <= 22; x++) for (let z = -4; z <= 22; z++) for (let y = 46; y <= 63; y++) bv.world.setBlock(x, y, z, 0);
      for (let x = 0; x <= 10; x++) for (let z = 0; z <= 10; z++) bv.world.setBlock(x, 50, z, 6); // planks roof 11×11 at y=50
      for (const [x, z] of [[0, 0], [10, 0], [0, 10], [10, 10]]) for (let y = 46; y <= 49; y++) bv.world.setBlock(x, y, z, 5);
      bv.forceRemeshAround?.();
      bv.teleport(5.5, 46.05, 5.5); bv.look(0, 0.1);
      bv.setWeather('rain', 1);
    });
    await sleep(2500);
    const under = await page.evaluate(() => {
      const bv = (window as any).__bv; const r = bv.renderer; const L = r.rainLines;
      if (!L || !L.visible) return { ok: false, inside: -1, outsideLow: -1 };
      const p = L.geometry.attributes.position; const o = L.position;
      let inside = 0, outsideLow = 0, total = 0;
      for (let i = 0; i < p.count; i += 2) {
        const wx = o.x + p.getX(i), wz = o.z + p.getZ(i), y0 = o.y + p.getY(i), y1 = o.y + p.getY(i + 1);
        if (y1 - y0 < 1e-3) continue; total++;
        const roofed = wx >= 0 && wx < 11 && wz >= 0 && wz < 11;
        if (roofed && y0 < 49.99) inside++;
        if (!roofed && y0 < 49 && y0 > 45.9) outsideLow++;
      }
      return { ok: true, inside, outsideLow, total };
    });
    await shot(page, 'it21-04-regn-under-tak.png');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(5.5, 46.05, 5.5); bv.look(Math.PI / 2, 0.15); });
    await sleep(800);
    await shot(page, 'it21-05-regn-ute-fra-tak.png');
    await page.evaluate(() => { const bv = (window as any).__bv; for (let x = 0; x <= 10; x++) for (let z = 0; z <= 10; z++) { bv.world.setBlock(x, 50, z, 0); for (let y = 46; y <= 49; y++) bv.world.setBlock(x, y, z, 0); } bv.setWeather('clear', 0); bv.forceRemeshAround?.(); });
    record('RN1-rain-stops-at-roof', under.ok && under.inside === 0 && (under.outsideLow ?? 0) > 20 ? 'PASS' : 'FAIL', JSON.stringify(under));
  }

  // MA1 — pigs fenced in by a ring of fire (eternal, on helstein) and a zombie behind a lava moat never step into fire/lava (30 s)
  if (run('MA1')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.setDay(0.85);
      for (let x = -4; x <= 22; x++) for (let z = -4; z <= 22; z++) for (let y = 46; y <= 63; y++) bv.world.setBlock(x, y, z, 0);
      // fire ring: 7×7 area x 2..8, z 2..8, ring at the border
      for (let x = 1; x <= 9; x++) for (let z = 1; z <= 9; z++) if (x === 1 || x === 9 || z === 1 || z === 9) { bv.world.setBlock(x, 45, z, 40); bv.world.setBlock(x, 46, z, 83); }
      // lava moat around a 3×3 island x 14..16, z 14..16
      for (let x = 12; x <= 18; x++) for (let z = 12; z <= 18; z++) if (x <= 12 || x >= 18 || z <= 12 || z >= 18 || x === 13 || x === 17 || z === 13 || z === 17) bv.world.setBlock(x, 45, z, 44);
      bv.forceRemeshAround?.();
      bv.mobs.clear();
      bv.mobs.spawn('gris', 5.5, 46.02, 5.5); bv.mobs.spawn('gris', 4.5, 46.02, 6.5); bv.mobs.spawn('ku', 6.5, 46.02, 4.5);
      bv.mobs.spawn('vandrer', 15.5, 46.02, 15.5);
      bv.player.creative = true;
      bv.teleport(10.5, 56, 10.5); bv.player.flying = true; bv.lookAt(9, 46, 9);
    });
    await sleep(1200);
    await shot(page, 'it21-06-mobber-ild-ring.png');
    let hurt = 0, inHaz = 0, escaped = 0; const hp0 = await page.evaluate(() => (window as any).__bv.mobInfo().slice(0, 4).map((m: any) => m.hp));
    for (let t = 0; t < 60; t++) {
      await sleep(500);
      // the zombie wants the player: keep the player just across the moat
      if (t === 2) await page.evaluate(() => { const bv = (window as any).__bv; bv.player.flying = false; bv.teleport(20.5, 46.05, 15.5); bv.lookAt(15.5, 46.5, 15.5); });
      const info = await page.evaluate(() => {
        const bv = (window as any).__bv;
        return bv.mobInfo().map((m: any) => ({ k: m.kind, hp: m.hp, b: m.burning, x: m.x, z: m.z, f: bv.world.getBlock(Math.floor(m.x), Math.floor(m.y + 0.05), Math.floor(m.z)), u: bv.world.getBlock(Math.floor(m.x), Math.floor(m.y - 0.1), Math.floor(m.z)) }));
      });
      for (const m of info.slice(0, 4)) {
        if (m.f === 83 || m.f === 44 || m.u === 44) inHaz++;
        if (m.b) hurt++;
        if (m.k !== 'vandrer' && (m.x < 1 || m.x > 10 || m.z < 1 || m.z > 10)) escaped++;
      }
      if (t === 20) await shot(page, 'it21-07-zombie-lavagrav.png');
    }
    const hp1 = await page.evaluate(() => (window as any).__bv.mobInfo().slice(0, 4).map((m: any) => m.hp));
    record('MA1-mobs-avoid-fire-lava', inHaz === 0 && hurt === 0 && escaped === 0 && hp1.slice(0, 4).join() === hp0.join() ? 'PASS' : 'FAIL',
      JSON.stringify({ inHaz, hurt, escaped, hp0, hp1 }));
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); bv.player.creative = false; bv.setDay(0.5);
      for (let x = -4; x <= 22; x++) for (let z = -4; z <= 22; z++) { bv.world.setBlock(x, 45, z, 1); for (let y = 46; y <= 63; y++) bv.world.setBlock(x, y, z, 0); } bv.forceRemeshAround?.(); });
    await sleep(500);
  }

  // DG1 — bone meal (RMB) on tall grass grows double tall grass; LMB on the top half removes both halves
  if (run('DG1')) {
    await heal(); await clearDrops();
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(6, 46, 6, 78); bv.world.setBlock(7, 46, 6, 78); bv.world.setBlock(5, 46, 6, 78); bv.forceRemeshAround?.(); });
    await setHeld(page, 81);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0].count = 8; bv.hud.refreshHotbar(); });
    let grown = 0;
    for (const x of [5, 6, 7]) {
      await aim(page, x + 0.5, 46.05, 9.5, x + 0.5, 46.3, 6.5);
      await sleep(200);
      await hold(page, 80, 'right'); await sleep(200);
      if ((await gb(x, 46, 6)) === 84 && (await gb(x, 47, 6)) === 85) grown++;
    }
    const left = await countItem(page, 81);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(6.5, 46.05, 10.5); bv.lookAt(6.5, 47.2, 6.5); });
    await sleep(500);
    await shot(page, 'it21-08-dobbelt-gress.png');
    await setHeld(page, 0);
    await aim(page, 6.5, 46.05, 9.5, 6.5, 47.75, 6.5); // aim at the upper half
    await sleep(200);
    const tgt = await page.evaluate(() => (window as any).__bv.targetHit());
    await hold(page, 150, 'left'); await sleep(300);
    const after = [await gb(6, 46, 6), await gb(6, 47, 6)];
    record('DG1-double-tall-grass', grown === 3 && left === 5 && tgt?.y === 47 && after.join() === '0,0' ? 'PASS' : 'FAIL', JSON.stringify({ grown, left, tgt, after }));
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
