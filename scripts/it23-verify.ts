/**
 * it23 verify: buckets (craft, scoop/pour water and lava, flowing water dries up), water+lava → obsidian, lava bucket as furnace fuel (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it23';
const VID = '/tmp/it23-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it23';

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
  await boot(page, base, 'It23Verify');
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

  // BK1 — craft a bucket at a crafting table (real RMB on the table + real UI clicks: 3 iron ingots in a V)
  if (run('BK1')) {
    await heal();
    await setHeld(page, 0, { 53: 3 });
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(8, 46, 3, 11); bv.forceRemeshAround?.(); });
    await aim(page, 8.5, 46.05, 5.6, 8.5, 46.5, 3.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(400);
    const tableOpen = await page.evaluate(() => (window as any).__bv.input.inventoryOpen);
    const ok = await uiCraft(page, [53, 0, 53, 0, 53, 0, 0, 0, 0], 3);
    await sleep(200);
    await shot(page, 'it23-01-botte-laget.png');
    await closeUi(page);
    await ensureLocked(page);
    const buckets = await countItem(page, 87), iron = await countItem(page, 53);
    record('BK1-craft-bucket', tableOpen && ok && buckets === 1 && iron === 0 ? 'PASS' : 'FAIL', JSON.stringify({ tableOpen, ok, buckets, iron }));
    await page.evaluate(() => { (window as any).__bv.world.setBlock(8, 46, 3, 0); });
  }

  // BK2 — scoop a water source with an empty bucket (real RMB), pour it on the ground (spreads), scoop it back → the flow dries up
  if (run('BK2')) {
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.world.setBlock(6, 45, 6, 0); bv.world.setWater(6, 45, 6, 7); // 1×1 pond
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 87);
    await aim(page, 6.5, 46.05, 8.2, 6.5, 45.5, 6.5);
    await sleep(500);
    await shot(page, 'it23-02-dam-for.png');
    await hold(page, 80, 'right'); await sleep(400);
    const h1 = await held(), pond = await gb(6, 45, 6);
    // pour onto the grass top at (11,45,8)
    await aim(page, 11.5, 46.05, 10.6, 11.5, 45.9, 8.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(300);
    const h2 = await held(), placed = await gb(11, 46, 8), lvl = await gm(11, 46, 8);
    await sleep(3500);
    const spread = await waterCount(46, 7, 15, 4, 12);
    await aim(page, 11.5, 46.05, 11.8, 11.5, 46.0, 8.5);
    await sleep(500);
    await shot(page, 'it23-03-vann-helt-ut.png');
    // scoop the source back
    await aim(page, 11.5, 46.05, 10.6, 11.5, 46.3, 8.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(300);
    const h3 = await held();
    let left = 99;
    for (let i = 0; i < 24 && left > 0; i++) { await sleep(500); left = await waterCount(46, 7, 15, 4, 12); }
    await aim(page, 11.5, 46.05, 11.8, 11.5, 46.0, 8.5);
    await sleep(400);
    await shot(page, 'it23-04-vann-hentet-torket-opp.png');
    record('BK2-water-bucket', h1?.id === 88 && pond === 0 && h2?.id === 87 && placed === 10 && lvl === 7 && spread >= 5 && h3?.id === 88 && left === 0 ? 'PASS' : 'FAIL',
      JSON.stringify({ h1, pond, h2, placed, lvl, spread, h3, left }));
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(6, 45, 6, 1); });
  }

  // BK3 — scoop lava (real RMB), pour it, then pour water beside it → the lava turns into obsidian (portalramme)
  if (run('BK3')) {
    await heal();
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.world.setBlock(4, 45, 14, 44); // lava pit
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 87);
    await aim(page, 4.5, 46.05, 16.4, 4.5, 45.5, 14.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(300);
    const h1 = await held(), pit = await gb(4, 45, 14);
    // pour the lava into a stone-lined hole at (10,45,16)
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(10, 45, 16, 0); bv.world.setBlock(10, 44, 16, 3); bv.forceRemeshAround?.(); });
    await aim(page, 10.5, 46.05, 17.3, 10.5, 44.95, 16.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(400);
    const h2 = await held(), lava = await gb(10, 45, 16);
    await aim(page, 10.5, 46.6, 19.0, 10.5, 45.5, 16.5);
    await sleep(400);
    await shot(page, 'it23-05-lava-helt-ut.png');
    // water bucket: pour onto the grass beside the lava, level with it → it flows in and the lava fizzes into obsidian
    await setHeld(page, 88);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(11, 45, 16, 0); bv.world.setBlock(11, 44, 16, 3); bv.forceRemeshAround?.(); });
    await aim(page, 11.5, 46.05, 17.3, 11.5, 44.95, 16.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(300);
    const water = await gb(11, 45, 16);
    let obs = 0;
    for (let i = 0; i < 12 && obs !== 43; i++) { await sleep(400); obs = await gb(10, 45, 16); }
    await aim(page, 10.5, 46.6, 19.0, 10.5, 45.5, 16.5);
    await sleep(500);
    await shot(page, 'it23-06-lava-ble-obsidian.png');
    record('BK3-lava-bucket-obsidian', h1?.id === 89 && pit === 0 && h2?.id === 87 && lava === 44 && water === 10 && obs === 43 ? 'PASS' : 'FAIL',
      JSON.stringify({ h1, pit, h2, lava, water, obs }));
  }

  // BK4 — a lava bucket as furnace fuel (real RMB on the furnace + UI clicks) burns and leaves the empty bucket
  if (run('BK4')) {
    await heal();
    await setHeld(page, 89, { 4: 8 });
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(14, 46, 3, 14); bv.forceRemeshAround?.(); });
    await aim(page, 14.5, 46.05, 5.6, 14.5, 46.5, 3.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(400);
    const open = await page.evaluate(() => (window as any).__bv.input.inventoryOpen);
    await page.locator('[data-inv-slot="0"]').click(); await sleep(80);
    await page.locator('#fu-fuel').click(); await sleep(80);
    await page.locator('[data-inv-slot="1"]').click(); await sleep(80);
    await page.locator('#fu-in').click(); await sleep(80);
    await sleep(1500);
    const f = await page.evaluate(() => { const fu = (window as any).__bv.containers.getFurnace(14, 46, 3); return { fuel: fu.fuel && { id: fu.fuel.id, count: fu.fuel.count }, burnMax: fu.burnMax, burnLeft: Math.round(fu.burnLeft), cook: fu.cook }; });
    await shot(page, 'it23-07-lavabotte-i-ovn.png');
    await closeUi(page);
    await ensureLocked(page);
    record('BK4-lava-bucket-fuel', open && f.fuel?.id === 87 && f.burnMax === 20000 && f.burnLeft > 19900 && f.cook > 0 ? 'PASS' : 'FAIL', JSON.stringify({ open, f }));
    await page.evaluate(() => { (window as any).__bv.world.setBlock(14, 46, 3, 0); });
  }

  // BK5 — water bucket on a burning block puts the fire out (real RMB)
  if (run('BK5')) {
    await heal();
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(3, 46, 6, 6); bv.forceRemeshAround?.(); });
    await setHeld(page, 82);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0].durability = 64; });
    await aim(page, 3.5, 46.05, 9.2, 3.5, 46.99, 6.5);
    await sleep(200);
    await hold(page, 80, 'right'); await sleep(400);
    const fire = await gb(3, 47, 6);
    await setHeld(page, 88);
    await aim(page, 3.5, 46.05, 9.2, 3.5, 46.99, 6.5);
    await sleep(200);
    const tgt = await page.evaluate(() => (window as any).__bv.targetHit());
    await hold(page, 80, 'right'); await sleep(400);
    const after = await gb(3, 47, 6), h = await held();
    await shot(page, 'it23-08-ild-slukket.png');
    record('BK5-water-puts-out-fire', fire === 83 && after === 10 && h?.id === 87 ? 'PASS' : 'FAIL', JSON.stringify({ fire, after, h, tgt }));
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(3, 46, 6, 0); bv.world.setBlock(3, 47, 6, 0); });
  }

  // BK6 — scooping with a stack of empty buckets keeps the rest in your hand and puts the water bucket in the inventory
  if (run('BK6')) {
    await heal();
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(6, 45, 10, 0); bv.world.setWater(6, 45, 10, 7); bv.forceRemeshAround?.(); });
    await setHeld(page, 87);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0].count = 3; bv.hud.refreshHotbar(); });
    await aim(page, 6.5, 46.05, 12.2, 6.5, 45.5, 10.5);
    await sleep(300);
    await hold(page, 80, 'right'); await sleep(400);
    const h = await held(), wb = await countItem(page, 88), cell = await gb(6, 45, 10);
    await shot(page, 'it23-09-botter-i-stabel.png');
    record('BK6-bucket-stack', h?.id === 87 && h.count === 2 && wb === 1 && cell === 0 ? 'PASS' : 'FAIL', JSON.stringify({ h, wb, cell }));
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(6, 45, 10, 1); });
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
