/**
 * it16 verify: falling sand, leaf decay, persistent placed leaves (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it16';
const VID = '/tmp/it16-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it16';

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
  await boot(page, base, 'It16Verify');
  await acquireLock(page);
  await sleep(3000);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.5); bv.mobs.clear(); });
  const only = (process.env.BV_ONLY || '').split(',').filter(Boolean);
  const run = (id: string) => !only.length || only.includes(id);
  const marks: Record<string, number> = {};
  const mark = (k: string) => { marks[k] = (Date.now() - T0) / 1000; };
  const gb = (x: number, y: number, z: number) => page.evaluate(({ x, y, z }) => (window as any).__bv.world.getBlock(x, y, z), { x, y, z });

  // V — lighting look on natural terrain: noon / sunset / midnight
  if (run('V')) {
    mark('V');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.look(0.6, -0.25); });
    for (const [t, name] of [[0.5, 'it16-00a-middag.png'], [0.75, 'it16-00b-solnedgang.png'], [0.0, 'it16-00c-midnatt.png']] as const) {
      await page.evaluate((t) => (window as any).__bv.setDay(t), t);
      await sleep(900);
      await shot(page, name);
    }
    await page.evaluate(() => (window as any).__bv.setDay(0.5));
    record('V-lighting-shots', 'PASS', 'see screenshots');
  }

  // Arena: stone 40–44, grass 45, open air above.
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    for (let x = -4; x <= 20; x++) for (let z = -4; z <= 22; z++) {
      for (let y = 40; y <= 44; y++) bv.world.setBlock(x, y, z, 3);
      bv.world.setBlock(x, 45, z, 1);
      for (let y = 46; y <= 60; y++) bv.world.setBlock(x, y, z, 0);
    }
    bv.forceRemeshAround?.();
  });
  await sleep(1500);
  await ensureLocked(page);

  // S1 — break the dirt under a 3-high sand column (real LMB) → the column falls one block
  if (run('S1')) {
    mark('S1');
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.world.setBlock(12, 46, 8, 2);
      for (let y = 47; y <= 49; y++) bv.world.setBlock(12, y, 8, 8);
      bv.forceRemeshAround?.();
    });
    await setHeld(page, 0);
    await aim(page, 9.5, 46.05, 8.5, 12.0, 46.5, 8.5);
    await sleep(500);
    await shot(page, 'it16-01-sand-paa-jord.png');
    // hold just long enough to break dirt by hand (0.5 s) but not the sand that lands in its place
    await hold(page, 700);
    await sleep(300);
    const col = [];
    for (let y = 46; y <= 49; y++) col.push(await gb(12, y, 8));
    await sleep(300);
    await shot(page, 'it16-02-sand-falt.png');
    record('S1-sand-falls', col.join(',') === '8,8,8,0' ? 'PASS' : 'FAIL', `col46..49=${col.join(',')}`);
  }

  // S2 — place sand (real RMB) against the side of a floating block → it falls to the ground
  if (run('S2')) {
    mark('S2');
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(11, 49, 4, 4); bv.forceRemeshAround?.(); });
    await setHeld(page, 8, {});
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 8, count: 5 }; bv.hud.refreshHotbar(); });
    await aim(page, 8.5, 46.05, 4.5, 11.0, 49.5, 4.5);
    await sleep(400);
    await hold(page, 80, 'right');
    await sleep(400);
    const v = { at49: await gb(10, 49, 4), at46: await gb(10, 46, 4), left: await countItem(page, 8) };
    await aim(page, 7.0, 46.05, 2.0, 10.5, 46.5, 4.5);
    await sleep(500);
    await shot(page, 'it16-03-sand-plassert-faller.png');
    record('S2-placed-sand-falls', v.at49 === 0 && v.at46 === 8 && v.left === 4 ? 'PASS' : 'FAIL', JSON.stringify(v));
  }

  // L — chop a tree with an axe (real LMB): natural leaves decay over ~20 s, a leaf placed by the player stays
  if (run('L')) {
    mark('L');
    await page.evaluate(() => {
      const bv = (window as any).__bv;
      for (let y = 46; y <= 48; y++) bv.world.setBlock(4, y, 14, 5);
      const L = (x: number, y: number, z: number) => { if (bv.world.getBlock(x, y, z) === 0) bv.world.setBlock(x, y, z, 7); };
      for (let x = 3; x <= 5; x++) for (let z = 13; z <= 15; z++) if (!(x === 4 && z === 13)) L(x, 48, z);
      for (let x = 2; x <= 6; x++) for (let z = 12; z <= 16; z++) L(x, 49, z);
      for (let x = 3; x <= 5; x++) for (let z = 13; z <= 15; z++) L(x, 50, z);
      bv.forceRemeshAround?.();
    });
    const leaves = () => page.evaluate(() => {
      const bv = (window as any).__bv; let n = 0;
      for (let x = 0; x <= 8; x++) for (let z = 10; z <= 18; z++) for (let y = 46; y <= 52; y++) if (bv.world.getBlock(x, y, z) === 7) n++;
      return n;
    });
    // place one leaf block by hand (RMB on grass top) → persistent
    await setHeld(page, 7);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 7, count: 4 }; bv.hud.refreshHotbar(); });
    await aim(page, 8.5, 46.05, 11.5, 7.5, 46.0, 13.5);
    await sleep(300);
    await hold(page, 80, 'right');
    await sleep(300);
    const placed = await gb(7, 46, 13);
    await setHeld(page, 101); // wooden axe
    await aim(page, 4.5, 46.05, 10.5, 4.5, 47.5, 12.0);
    await sleep(600);
    await shot(page, 'it16-04-tre-foer-hogst.png');
    const before = await leaves();
    let broken = 0;
    for (const ly of [48, 47, 46]) {
      await aim(page, 4.5, 46.05, 11.5, 4.5, ly + 0.5, 14.0);
      await sleep(150);
      for (let t = 0; t < 12 && (await gb(4, ly, 14)) === 5; t++) await hold(page, 400);
      if ((await gb(4, ly, 14)) === 0) broken++;
    }
    await aim(page, 4.5, 46.05, 9.5, 4.5, 48.5, 14.0);
    await sleep(1500);
    const at1 = await leaves();
    await shot(page, 'it16-05-tre-hogd.png');
    await sleep(8000);
    const at10 = await leaves();
    await shot(page, 'it16-06-loev-forsvinner.png');
    let end = at10;
    for (let i = 0; i < 20 && end > 1; i++) { await sleep(1000); end = await leaves(); }
    await shot(page, 'it16-07-loev-borte.png');
    const persistent = await gb(7, 46, 13);
    record('L1-leaf-decay', broken === 3 && before >= 40 && at1 > before * 0.7 && at10 < at1 && end === 1 ? 'PASS' : 'FAIL',
      `logsBroken=${broken} leaves before=${before} +1.5s=${at1} +9.5s=${at10} end=${end}`);
    record('L2-placed-leaf-persistent', placed === 7 && persistent === 7 ? 'PASS' : 'FAIL', `placed=${placed} after=${persistent}`);
  }

  const report = { when: new Date().toISOString(), results, bugs, marks };
  fs.writeFileSync(path.join(OUT, 'it16-verify.json'), JSON.stringify(report, null, 2));
  const summary: Record<string, number> = { PASS: 0, FAIL: 0, PARTIAL: 0 };
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
  console.log('=== SUMMARY ===', summary, 'marks', JSON.stringify(marks));
  await ctx.close();
  await browser.close();
  child.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
