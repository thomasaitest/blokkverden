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
  await boot(page, base, 'It14Verify');
  await acquireLock(page);
  await sleep(3000);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.3); bv.mobs.clear(); });
  const only = (process.env.BV_ONLY || '').split(',').filter(Boolean);
  const run = (id: string) => !only.length || only.includes(id);
  const killMobs = () => page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.mobs = bv.mobs.mobs.filter((m: any) => m.__test); });

  // V1 — mine straight down with a real held LMB: stops on bedrock (MC), no falling out of the world
  if (run('V1')) {
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let x = 6; x <= 10; x++) for (let z = 6; z <= 10; z++) for (let y = 1; y <= 12; y++) bv.world.setBlock(x, y, z, 3);
      for (let y = 5; y <= 12; y++) bv.world.setBlock(8, y, 8, 0);
      bv.world.setBlock(8, 0, 8, 48);
      bv.teleport(8.5, 5.05, 8.5); bv.player.vy = 0;
      bv.world.setBlock(9, 8, 8, 12); // torch in the shaft wall so the screenshot isn't black
    });
    await setHeld(page, 108);
    await page.evaluate(async () => { await (window as any).__bv.forceRemeshAround(); });
    await acquireLock(page);
    await page.evaluate(() => (window as any).__bv.look(0.3, -Math.PI / 2 + 0.01));
    await hold(page, 9000);
    await sleep(800);
    const v1 = await page.evaluate(() => { const bv = (window as any).__bv; return {
      y: +bv.player.y.toFixed(2), bottom: bv.world.getBlock(8, 0, 8), y1: bv.world.getBlock(8, 1, 8),
      cobble: bv.inv.slots.reduce((n: number, s: any) => n + (s?.id === 4 ? s.count : 0), 0), dead: bv.getState().dead }; });
    // screenshot: open a small lit chamber at the bottom so the bedrock floor is visible
    await page.evaluate(async () => { const bv = (window as any).__bv;
      for (let x = 6; x <= 10; x++) for (let z = 6; z <= 10; z++) for (let y = 1; y <= 3; y++) bv.world.setBlock(x, y, z, 0);
      bv.world.setBlock(10, 1, 10, 12); bv.world.setBlock(6, 1, 6, 12);
      for (let x = 5; x <= 11; x++) for (let z = 5; z <= 11; z++) { if (x === 5 || x === 11 || z === 5 || z === 11) for (let y = 1; y <= 3; y++) bv.world.setBlock(x, y, z, 3); }
      bv.teleport(8.5, 1.05, 10.3); bv.lookAt(8.5, 0.6, 6.5);
      await bv.forceRemeshAround(); });
    await sleep(1200);
    await shot(page, 'it14-01-grunnfjell.png');
    record('V1-bedrock-floor', v1.bottom === 48 && v1.y1 === 0 && Math.abs(v1.y - 1) < 0.1 && v1.cobble >= 3 && !v1.dead ? 'PASS' : 'FAIL', JSON.stringify(v1));
  }

  // V2 — pickaxe tiers with real mining: wood pick gets nothing from iron ore, stone pick does; diamond needs iron
  if (run('V2')) {
    console.log(`V2 start @${((Date.now() - T0) / 1000).toFixed(1)}s`);
    await flatPad(page, 45);
    const mineOre = async (ore: number, pick: number, ms: number) => {
      await page.evaluate((ore) => { const bv = (window as any).__bv; bv.world.setBlock(8, 46, 6, ore); bv.drops.drops.length = 0; }, ore);
      await setHeld(page, pick);
      await aim(page, 8.5, 46.05, 8.5, 8.5, 46.5, 6.5);
      await ensureLocked(page);
      await page.evaluate(() => (window as any).__bv.lookAt(8.5, 46.5, 6.5));
      const t0 = Date.now();
      await page.mouse.down();
      for (let i = 0; i < ms / 100; i++) { await sleep(100); if (await page.evaluate(() => (window as any).__bv.world.getBlock(8, 46, 6) === 0)) break; }
      await page.mouse.up();
      const took = Date.now() - t0;
      await walk(page, 'KeyW', 900); await sleep(600);
      const items = await page.evaluate(() => (window as any).__bv.inv.slots.filter((s: any) => s && s.id !== (window as any).__bv.inv.slots[0]?.id).map((s: any) => `${s.id}x${s.count}`));
      const broken = await page.evaluate(() => (window as any).__bv.world.getBlock(8, 46, 6) === 0);
      await page.evaluate(() => (window as any).__bv.teleport(8.5, 46.05, 8.5));
      return { broken, items, took };
    };
    const a = await mineOre(16, 100, 9000); // iron ore, wood pick
    const b = await mineOre(16, 104, 9000); // iron ore, stone pick
    const c = await mineOre(18, 104, 12000); // diamond ore, stone pick
    const d = await mineOre(18, 108, 9000); // diamond ore, iron pick
    await shot(page, 'it14-02-diamant.png');
    record('V2-pick-tiers', a.broken && a.items.length === 0 && b.items.join() === '16x1' && c.broken && c.items.length === 0 && d.items.join() === '55x1' ? 'PASS' : 'FAIL',
      `woodOnIron=${JSON.stringify(a)} stoneOnIron=${JSON.stringify(b)} stoneOnDiamond=${JSON.stringify(c)} ironOnDiamond=${JSON.stringify(d)}`);
  }

  // V3 — crafting chain: smelt 3 iron ore in the furnace UI → craft iron pickaxe at the table (all real clicks)
  if (run('V3')) {
    await flatPad(page, 45);
    await killMobs();
    await setHeld(page, 104, { 16: 3, 51: 2, 50: 2 });
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(8, 46, 6, 14); bv.world.setBlock(10, 46, 8, 11); });
    await aim(page, 8.5, 46.05, 8.5, 8.5, 46.5, 6.5);
    await ensureLocked(page); await page.evaluate(() => (window as any).__bv.lookAt(8.5, 46.5, 6.5));
    await hold(page, 80, 'right'); await sleep(500);
    const fuOpen = await page.evaluate(() => (window as any).__bv.input.inventoryOpen && !!document.querySelector('#fu-in'));
    const slotOf = (id: number) => page.evaluate((id) => (window as any).__bv.inv.slots.findIndex((s: any) => s?.id === id), id);
    let ingots = 0;
    if (fuOpen) {
      await page.locator(`[data-inv-slot="${await slotOf(16)}"]`).click(); await page.locator('#fu-in').click();
      await page.locator(`[data-inv-slot="${await slotOf(51)}"]`).click(); await page.locator('#fu-fuel').click();
      for (let i = 0; i < 80; i++) {
        await sleep(500);
        const o = await page.evaluate(() => (window as any).__bv.containers.getFurnace(8, 46, 6).output?.count ?? 0);
        if (i === 6) await shot(page, 'it14-03-ovn.png');
        if (o >= 3) break;
      }
      await takeOutputToInv(page, '#fu-out');
      ingots = await countItem(page, 53);
    }
    await closeUi(page);
    await aim(page, 8.5, 46.05, 8.5, 10.5, 46.5, 8.5);
    await ensureLocked(page); await page.evaluate(() => (window as any).__bv.lookAt(10.5, 46.5, 8.5));
    await hold(page, 80, 'right'); await sleep(500);
    const tableOpen = await page.evaluate(() => (window as any).__bv.input.inventoryOpen);
    if (tableOpen) await uiCraft(page, [53, 53, 53, 0, 50, 0, 0, 50, 0], 3);
    await sleep(300);
    await shot(page, 'it14-04-jernhakke.png');
    const ironPick = await countItem(page, 108);
    await closeUi(page);
    record('V3-iron-chain', fuOpen && ingots === 3 && tableOpen && ironPick === 1 ? 'PASS' : 'FAIL', `furnaceUi=${fuOpen} ingots=${ingots} table=${tableOpen} ironPick=${ironPick}`);
  }

  // V4 — cook raw meat in the furnace (MC: cooked porkchop) and eat it by holding RMB
  if (run('V4')) {
    await flatPad(page, 45);
    await killMobs();
    await setHeld(page, 0, { 60: 1, 51: 1 });
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(8, 46, 6, 14); bv.containers.removeAt(8, 46, 6); bv.player.hunger = 8; });
    await aim(page, 8.5, 46.05, 8.5, 8.5, 46.5, 6.5);
    await ensureLocked(page); await page.evaluate(() => (window as any).__bv.lookAt(8.5, 46.5, 6.5));
    await hold(page, 80, 'right'); await sleep(500);
    const slotOf = (id: number) => page.evaluate((id) => (window as any).__bv.inv.slots.findIndex((s: any) => s?.id === id), id);
    await page.locator(`[data-inv-slot="${await slotOf(60)}"]`).click(); await page.locator('#fu-in').click();
    await page.locator(`[data-inv-slot="${await slotOf(51)}"]`).click(); await page.locator('#fu-fuel').click();
    for (let i = 0; i < 30; i++) { await sleep(500); if (await page.evaluate(() => (window as any).__bv.containers.getFurnace(8, 46, 6).output?.id === 72)) break; }
    // take straight into hotbar slot 0
    await page.locator('#fu-out').click(); await sleep(100); await page.locator('[data-inv-slot="0"]').click(); await sleep(100);
    const label = await page.evaluate(() => document.querySelector('[data-inv-slot="0"]')?.getAttribute('title') ?? '');
    await shot(page, 'it14-05-stekt-kjott.png');
    await closeUi(page);
    const h0 = (await st(page)).hunger;
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.selected = 0; bv.look(0, 0.2); bv.hud.refreshHotbar(); });
    await ensureLocked(page);
    await page.evaluate(() => (window as any).__bv.look(0, 0.3)); // look up at the sky (no usable block)
    await hold(page, 2200, 'right'); await sleep(300);
    const h1 = (await st(page)).hunger;
    const left = await countItem(page, 72);
    record('V4-cook-eat-meat', h1 - h0 === 8 && left === 0 ? 'PASS' : 'FAIL', `hunger ${h0}→${h1} cookedLeft=${left} title="${label}"`);
  }

  // V5 — breaking a chest spills its contents (MC); before, they vanished
  if (run('V5')) {
    await flatPad(page, 45);
    await killMobs();
    await setHeld(page, 101);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(8, 46, 6, 13); bv.containers.removeAt(8, 46, 6);
      const s = bv.containers.getChest(8, 46, 6); s[0] = { id: 55, count: 5 }; s[3] = { id: 5, count: 12 }; s[20] = { id: 53, count: 7 }; });
    await aim(page, 8.5, 46.05, 8.5, 8.5, 46.5, 6.5);
    await ensureLocked(page); await page.evaluate(() => (window as any).__bv.lookAt(8.5, 46.5, 6.5));
    await page.mouse.down();
    for (let i = 0; i < 60; i++) { await sleep(100); if (await page.evaluate(() => (window as any).__bv.world.getBlock(8, 46, 6) === 0)) break; }
    await page.mouse.up();
    await sleep(500);
    await page.evaluate(() => (window as any).__bv.look(0, -0.7));
    await sleep(300);
    await shot(page, 'it14-06-kiste-sol.png');
    await walk(page, 'KeyW', 1000); await sleep(800);
    const got = { diamond: await countItem(page, 55), log: await countItem(page, 5), iron: await countItem(page, 53), chest: await countItem(page, 13) };
    record('V5-chest-spills', got.diamond === 5 && got.log === 12 && got.iron === 7 && got.chest === 1 ? 'PASS' : 'FAIL', JSON.stringify(got));
  }

  // V6 — morning: zombies/skeletons in the open burn and die; under a roof they survive; creepers don't burn
  if (run('V6')) {
    console.log(`V6 start @${((Date.now() - T0) / 1000).toFixed(1)}s`);
    await flatPad(page, 45);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); bv.setDay(0.35); bv.player.health = 20;
      for (let x = 12; x <= 15; x++) for (let z = 12; z <= 15; z++) bv.world.setBlock(x, 49, z, 6);
      const a = bv.spawnMob('vandrer', 0, 0, 0); a.x = 4.5; a.z = 13.5; a.y = 46.02; a.__test = true; a.__pin = [4.5, 13.5];
      const b = bv.spawnMob('bueskytt', 0, 0, 0); b.x = 6.5; b.z = 14.5; b.y = 46.02; b.__test = true; b.__pin = [6.5, 14.5];
      const c = bv.spawnMob('vandrer', 0, 0, 0); c.x = 13.5; c.z = 13.5; c.y = 46.02; c.__test = true; c.__pin = [13.5, 13.5];
      const d = bv.spawnMob('knallbolle', 0, 0, 0); d.x = 2.5; d.z = 11.5; d.y = 46.02; d.__test = true; d.__pin = [2.5, 11.5];
      bv.teleport(8.5, 46.05, 2.5); bv.lookAt(7, 47, 13); });
    await page.evaluate(async () => { await (window as any).__bv.forceRemeshAround(); });
    await ensureLocked(page); await page.evaluate(() => (window as any).__bv.lookAt(7, 47, 13));
    let snap = false;
    const t0 = Date.now();
    let hp: any = null;
    while (Date.now() - t0 < 16000) {
      hp = await page.evaluate(() => { const bv = (window as any).__bv;
        for (const m of bv.mobs.mobs) if (m.__pin) { m.x = m.__pin[0]; m.z = m.__pin[1]; }
        bv.mobs.mobs = bv.mobs.mobs.filter((m: any) => m.__test);
        return bv.mobs.mobs.map((m: any) => `${m.kind}@${m.x.toFixed(0)}:${m.hp.toFixed(1)}${m.burning ? 'B' : ''}`); });
      if (!snap && Date.now() - t0 > 2500) { await shot(page, 'it14-07-brenner-i-sola.png'); snap = true; }
      await sleep(250);
    }
    const alive = hp as string[];
    const openDead = !alive.some((s) => /^(vandrer@5|bueskytt@7)/.test(s));
    const roofOk = alive.some((s) => s.startsWith('vandrer@14') && !s.endsWith('B'));
    const creeperOk = alive.some((s) => s.startsWith('knallbolle'));
    record('V6-sun-burn', openDead && roofOk && creeperOk ? 'PASS' : 'FAIL', `after16s=${JSON.stringify(alive)}`);
    await page.evaluate(() => (window as any).__bv.mobs.clear());
  }

  // V7 — creeper hiss: run away with real S key → fuse winds down, no blast; come back later → no instant blast
  if (run('V7')) {
    console.log(`V7 start @${((Date.now() - T0) / 1000).toFixed(1)}s`);
    await flatPad(page, 45);
    await page.evaluate(() => { const bv = (window as any).__bv;
      for (let x = -4; x <= 34; x++) for (let z = 0; z <= 16; z++) { bv.world.setBlock(x, 45, z, 1); for (let y = 46; y <= 50; y++) bv.world.setBlock(x, y, z, 0); }
      bv.mobs.clear(); bv.setDay(0.3); bv.player.health = 20;
      bv.teleport(8.5, 46.05, 8.5); bv.look(Math.PI / 2, 0);
      const c = bv.spawnMob('knallbolle', 0, 0, 0); c.x = 5.3; c.z = 8.5; c.y = 46.02; c.__test = true; });
    await page.evaluate(async () => { await (window as any).__bv.forceRemeshAround(); });
    await ensureLocked(page); await page.evaluate(() => (window as any).__bv.look(Math.PI / 2, -0.1));
    // react like a player: the hiss starts, turn and sprint (no polling delay)
    let f0 = 0;
    await sleep(300);
    // facing -x (yaw π/2 looks toward −x?) — run away using S + sprint, whichever direction increases distance
    const x0 = (await st(page)).x;
    // turn around (real mouse would) and sprint away with double-tap W like a player
    await page.evaluate(() => (window as any).__bv.look(-Math.PI / 2, 0));
    await page.keyboard.press('KeyW'); await sleep(60);
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 25; i++) { await sleep(100); await killMobs();
      f0 = Math.max(f0, await page.evaluate(() => (window as any).__bv.mobs.mobs.find((m: any) => m.__test)?.fuse ?? 0));
      if (process.env.BV_DBG) console.log(await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs.find((m: any) => m.__test); return m ? `fuse=${m.fuse.toFixed(2)} mx=${m.x.toFixed(1)} px=${bv.player.x.toFixed(1)} hp=${m.hp}` : 'gone'; })); }
    await page.keyboard.up('KeyW');
    for (let i = 0; i < 15; i++) { await sleep(100); await killMobs(); }
    const x1 = (await st(page)).x;
    console.log('V7 moved x', x0.toFixed(2), '→', x1.toFixed(2));
    await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs.find((m: any) => m.__test); if (m) bv.lookAt(m.x, m.y + 1, m.z); });
    await sleep(400);
    await shot(page, 'it14-08-knallbolle.png');
    const v7 = await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs.find((m: any) => m.__test);
      return { fuse: m ? +m.fuse.toFixed(2) : null, alive: !!m && m.hp > 0, dist: m ? +Math.hypot(m.x - bv.player.x, m.z - bv.player.z).toFixed(1) : null, hp: bv.player.health,
        ground: bv.world.getBlock(7, 45, 8) }; });
    record('V7-creeper-defuse', f0 > 0 && v7.alive && v7.fuse === 0 && v7.hp === 20 && v7.ground === 1 ? 'PASS' : 'FAIL', `fuseNear=${f0.toFixed?.(2)} after=${JSON.stringify(v7)}`);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); bv.setDay(0.3); });
  }

  // V8 — held item name pops up above the hotbar on real key 1–9 (MC), F3 toggles debug (hidden by default)
  if (run('V8')) {
    await closeUi(page);
    const dbg0 = await page.evaluate(() => getComputedStyle(document.getElementById('debug')!).display);
    await setHeld(page, 104, { 116: 1 });
    await ensureLocked(page);
    await page.keyboard.press('Digit2'); await sleep(250);
    const n1 = await page.evaluate(() => { const e = document.getElementById('held-name')!; return { t: e.textContent, o: getComputedStyle(e).opacity }; });
    await shot(page, 'it14-09-navn-over-hotbar.png');
    await sleep(2800);
    const n2 = await page.evaluate(() => getComputedStyle(document.getElementById('held-name')!).opacity);
    await page.keyboard.press('Digit1'); await sleep(250);
    const n3 = await page.evaluate(() => document.getElementById('held-name')!.textContent);
    await page.keyboard.press('F3'); await sleep(300);
    const dbg1 = await page.evaluate(() => ({ d: getComputedStyle(document.getElementById('debug')!).display, t: document.getElementById('debug')!.textContent!.slice(0, 40) }));
    await page.keyboard.press('F3'); await sleep(300);
    const dbg2 = await page.evaluate(() => getComputedStyle(document.getElementById('debug')!).display);
    record('V8-held-name-f3', dbg0 === 'none' && n1.t === 'Trekrafse' && n1.o === '1' && n2 === '0' && n3 === 'Steinhakke' && dbg1.d === 'block' && dbg2 === 'none' ? 'PASS' : 'FAIL',
      `debug0=${dbg0} name=${JSON.stringify(n1)} after2.8s=${n2} slot1=${n3} F3=${JSON.stringify(dbg1)} F3again=${dbg2}`);
  }

  // V9 — walking over a drop shows it in the hotbar immediately (DOM), not only in the inventory data
  if (run('V9')) {
    await closeUi(page);
    await flatPad(page, 45);
    await killMobs();
    await setHeld(page, 104);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.drops.drops.length = 0; bv.drops.spawn(8, 46, 6, { id: 52, count: 3 }); bv.hud.refreshHotbar(); });
    await ensureLocked(page);
    await page.evaluate(() => (window as any).__bv.look(0, -0.5));
    await sleep(800);
    const before = await page.evaluate(() => document.querySelectorAll('#hotbar .hb-slot')[1]?.querySelector('canvas') ? 1 : 0);
    await walk(page, 'KeyW', 900); await sleep(700);
    const inv = await countItem(page, 52);
    const dom = await page.evaluate(() => ({ icon: !!document.querySelectorAll('#hotbar .hb-slot')[1]?.querySelector('canvas'), n: document.querySelectorAll('#hotbar .hb-slot')[1]?.querySelector('.stack-count')?.textContent }));
    await shot(page, 'it14-10-plukket-opp.png');
    record('V9-pickup-shows-in-hotbar', before === 0 && inv === 3 && dom.icon && dom.n === '3' ? 'PASS' : 'FAIL', `before=${before} inv=${inv} dom=${JSON.stringify(dom)}`);
  }

  // V10 — tools have their own icons (pickaxe/axe/shovel/sword/hoe per tier), hotbar + inventory
  if (run('V10')) {
    await closeUi(page);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots.fill(null);
      const ids = [100, 104, 108, 112, 109, 110, 111, 116, 62, 61, 124, 125, 126, 127, 129, 121, 53, 55];
      ids.forEach((id, i) => { bv.inv.slots[i] = { id, count: id === 61 || id === 53 || id === 55 ? 8 : 1 }; });
      bv.inv.selected = 0; bv.hud.markDirty(); bv.hud.refreshHotbar(); });
    await ensureLocked(page);
    await page.keyboard.press('KeyE'); await sleep(500);
    await shot(page, 'it14-11-verktoy-ikoner.png');
    const urls = await page.evaluate(() => [...document.querySelectorAll('#hotbar .hb-slot canvas')].map((c) => (c as HTMLCanvasElement).toDataURL()));
    await closeUi(page);
    const distinct = new Set(urls).size;
    record('V10-distinct-tool-icons', urls.length === 9 && distinct === 9 ? 'PASS' : 'FAIL', `hotbar icons=${urls.length} distinct=${distinct}`);
  }

  // V11 — at the bottom of a 1×1 shaft: right-click the wall with a torch places it (not blocked by your own body);
  // then mining the block under a torch pops the torch off as an item (MC)
  if (run('V11')) {
    await closeUi(page);
    await page.evaluate(() => { const bv = (window as any).__bv;
      for (let x = 6; x <= 10; x++) for (let z = 6; z <= 10; z++) for (let y = 1; y <= 12; y++) bv.world.setBlock(x, y, z, 3);
      for (let y = 2; y <= 12; y++) bv.world.setBlock(8, y, 8, 0);
      bv.teleport(8.5, 2.05, 8.5); bv.player.vy = 0; bv.mobs.clear(); bv.drops.drops.length = 0; });
    await setHeld(page, 12, { 104: 1 });
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0].count = 4; bv.hud.markDirty(); });
    await page.evaluate(async () => { await (window as any).__bv.forceRemeshAround(); });
    await ensureLocked(page);
    await page.evaluate(() => (window as any).__bv.look(0, -0.35)); // the wall in front, low
    await hold(page, 80, 'right'); await sleep(700);
    const placed = await page.evaluate(() => { const w = (window as any).__bv.world; return w.getBlock(8, 2, 8) === 12 || w.getBlock(8, 3, 8) === 12 ? 12 : -1; });
    const left = await countItem(page, 12);
    await page.evaluate(() => (window as any).__bv.look(0, -0.15));
    await sleep(300);
    if (process.env.BV_DBG) for (let k = 0; k < 4; k++) { console.log('light', await page.evaluate(() => { const w = (window as any).__bv.world; return [w.getBlock(8,2,8), w.getBlock(8,3,8), w.getBlockLight(8,2,8), w.getBlockLight(8,3,8), w.getBlockLight(8,4,8), w.getLight(8,3,8), w.chunks.get('0,0')?.lightDirty, w.dirtyMeshes.size]; })); await sleep(1000); }
    await shot(page, 'it14-12-fakkel-i-sjakt.png');
    record('V11a-torch-in-own-cell', placed === 12 && left === 3 ? 'PASS' : 'FAIL', `torchInShaft=${placed === 12} torchesLeft=${left}`);
    // torch on a block on a flat pad; mine the block under it with a real held LMB
    await flatPad(page, 45);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(8, 46, 6, 3); bv.world.setBlock(8, 47, 6, 12); bv.drops.drops.length = 0; });
    await setHeld(page, 104);
    await aim(page, 8.5, 46.05, 8.5, 8.5, 46.5, 6.5);
    await ensureLocked(page); await page.evaluate(() => (window as any).__bv.lookAt(8.5, 46.5, 6.5));
    await page.mouse.down();
    for (let i = 0; i < 40; i++) { await sleep(100); if (await page.evaluate(() => (window as any).__bv.world.getBlock(8, 46, 6) === 0)) break; }
    await page.mouse.up();
    await sleep(400);
    const torchBlock = await page.evaluate(() => (window as any).__bv.world.getBlock(8, 47, 6));
    await walk(page, 'KeyW', 900); await sleep(700);
    const got = await countItem(page, 12);
    record('V11b-torch-pops-off', torchBlock === 0 && got === 1 ? 'PASS' : 'FAIL', `torchBlockAfter=${torchBlock} torchItems=${got}`);
  }

  // V12 — creative mode: blocks (even bedrock) break at once with a real click; survival stays unbreakable (V1)
  if (run('V12')) {
    await closeUi(page);
    await flatPad(page, 45);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(8, 46, 6, 48); bv.world.setBlock(9, 46, 6, 3); bv.setCreative(true); });
    await setHeld(page, 0);
    await aim(page, 8.5, 46.05, 8.5, 8.5, 46.5, 6.5);
    await ensureLocked(page); await page.evaluate(() => (window as any).__bv.lookAt(8.5, 46.5, 6.5));
    const t0 = Date.now();
    await page.mouse.down();
    for (let i = 0; i < 30; i++) { await sleep(50); if (await page.evaluate(() => (window as any).__bv.world.getBlock(8, 46, 6) === 0)) break; }
    await page.mouse.up();
    const ms = Date.now() - t0;
    const gone = await page.evaluate(() => (window as any).__bv.world.getBlock(8, 46, 6) === 0);
    await page.evaluate(() => (window as any).__bv.setCreative(false));
    record('V12-creative-instant-break', gone && ms < 1200 ? 'PASS' : 'FAIL', `bedrockGone=${gone} in ${ms} ms`);
  }

  // V13 — save & reopen via the real pause menu: new items (cooked meat, iron pickaxe) and a dug-out bedrock floor survive
  if (run('V13')) {
    await closeUi(page);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots.fill(null);
      bv.inv.slots[0] = { id: 72, count: 5 }; bv.inv.slots[1] = { id: 108, count: 1, durability: 200 }; bv.inv.slots[2] = { id: 55, count: 2 };
      bv.world.setBlock(3, 1, 3, 0); bv.hud.markDirty(); (window as any).__oldbv = bv; });
    await ensureLocked(page);
    await page.keyboard.press('Escape'); await sleep(400);
    await page.locator('#p-quit').click(); await sleep(1500);
    await page.locator('#btn-single').click(); await sleep(600);
    await page.locator('[data-play="It14Verify"]').first().click();
    for (let i = 0; i < 80; i++) { if (await page.evaluate(() => (window as any).__bv && (window as any).__bv !== (window as any).__oldbv)) break; await sleep(250); }
    await sleep(2500);
    const v = await page.evaluate(() => { const bv = (window as any).__bv; const s = bv.inv.slots;
      return { meat: s[0]?.id === 72 && s[0].count === 5, pick: s[1]?.id === 108 && s[1].durability === 200, dia: s[2]?.id === 55, y0: bv.world.getBlock(3, 0, 3), y1: bv.world.getBlock(3, 1, 3) }; });
    record('V13-save-reopen', v.meat && v.pick && v.dia && v.y0 === 48 && v.y1 === 0 ? 'PASS' : 'FAIL', JSON.stringify(v));
  }

  const report = { when: new Date().toISOString(), results, bugs };
  fs.writeFileSync(path.join(OUT, 'it14-verify.json'), JSON.stringify(report, null, 2));
  const summary: Record<string, number> = { PASS: 0, FAIL: 0, PARTIAL: 0 };
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
  console.log('=== SUMMARY ===', summary);
  await ctx.close();
  await browser.close();
  child.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
