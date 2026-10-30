/**
 * it13 verify: HUD layout, far leaves, drop icons, starvation (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it13';
const VID = '/tmp/it13-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it13';

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
  const child = spawn('node_modules/.bin/vite', ['preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
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

async function isPaused(page: Page) {
  return page.evaluate(() => {
    const el = document.getElementById('pause-menu');
    return !!el && getComputedStyle(el).display !== 'none';
  });
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
  await page.addInitScript('window.__name = (f) => f;');
  page.on('pageerror', (e) => { console.error('PAGEERROR', e.message); bug('pageerror ' + e.message); });
  await boot(page, base, 'It13Verify');
  await acquireLock(page);
  await sleep(3000);

  // P1 — Esc while pointer-locked (real key) → pause menu, game frozen (MC: Esc = Game Menu)
  await acquireLock(page);
  const l0 = await st(page);
  await page.keyboard.press('Escape');
  await sleep(500);
  const p1 = { locked: (await st(page)).locked, paused: await isPaused(page) };
  await shot(page, 'it13-01-esc-pause.png');
  record('P1-esc-pauses', l0.locked && !p1.locked && p1.paused ? 'PASS' : 'FAIL', `before.locked=${l0.locked} after=${JSON.stringify(p1)}`);
  // resume via real click on "Fortsett"
  if (p1.paused) { await page.locator('#p-resume').click(); await sleep(600); }
  const p1b = { locked: (await st(page)).locked, paused: await isPaused(page) };
  record('P1b-resume', !p1b.paused ? 'PASS' : 'FAIL', JSON.stringify(p1b));

  // P2 — E opens inventory, E again closes and recaptures the mouse (MC)
  await acquireLock(page);
  await page.keyboard.press('KeyE'); await sleep(400);
  const inv1 = await page.evaluate(() => (window as any).__bv.input.inventoryOpen);
  await page.keyboard.press('KeyE'); await sleep(600);
  const p2 = { inv1, invAfter: await page.evaluate(() => (window as any).__bv.input.inventoryOpen), locked: (await st(page)).locked, paused: await isPaused(page) };
  record('P2-inv-close-relock', p2.inv1 && !p2.invAfter && p2.locked && !p2.paused ? 'PASS' : 'FAIL', JSON.stringify(p2));

  // P3 — Esc closes inventory without opening the pause menu
  await acquireLock(page);
  await page.keyboard.press('KeyE'); await sleep(400);
  await page.keyboard.press('Escape'); await sleep(500);
  const p3 = { inv: await page.evaluate(() => (window as any).__bv.input.inventoryOpen), paused: await isPaused(page) };
  await shot(page, 'it13-02-inv-esc.png');
  record('P3-esc-closes-inv', !p3.inv && !p3.paused ? 'PASS' : 'FAIL', JSON.stringify(p3));

  if (await page.evaluate(() => (window as any).__bv.input.inventoryOpen)) { await page.keyboard.press('KeyE'); await sleep(400); }
  // P4 — keys held when focus/lock is lost do not stay stuck (Cmd+Tab on Mac)
  await acquireLock(page);
  await page.keyboard.down('KeyW'); await sleep(300);
  const p4a = await page.evaluate(() => ({ f: (window as any).__bv.input.forward, inv: (window as any).__bv.input.inventoryOpen, locked: (window as any).__bv.input.pointerLocked }));
  await page.evaluate(() => document.exitPointerLock()); // what Chrome does on Cmd+Tab / window blur
  await sleep(300);
  const p4 = await page.evaluate(() => ({ f: (window as any).__bv.input.forward }));
  await page.keyboard.up('KeyW');
  record('P4-no-stuck-keys', p4a.f && !p4.f ? 'PASS' : 'FAIL', `held=${JSON.stringify(p4a)} afterLockLoss=${JSON.stringify(p4)}`);
  if (await isPaused(page)) { await page.locator('#p-resume').click(); await sleep(400); }

  // P5 — quit to title, reopen the same world: old session must be gone (no loop, no autosave
  // over the reopened world, WebGL context freed), and the world/position must reload.
  await flatPad(page, 45);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(5.5, 46.05, 11.5); (window as any).__oldbv = bv; });
  await acquireLock(page);
  await page.keyboard.press('Escape'); await sleep(400);
  await page.locator('#p-quit').click(); await sleep(1500);
  await page.locator('#btn-single').click(); await sleep(600);
  await page.locator('[data-play="It13Verify"]').first().click();
  for (let i = 0; i < 80; i++) { if (await page.evaluate(() => (window as any).__bv && (window as any).__bv !== (window as any).__oldbv)) break; await sleep(250); }
  await sleep(2500);
  const pos = await st(page);
  // Real Esc twice (pause + resume) — old code also toggled the zombie session awake.
  await acquireLock(page);
  await page.keyboard.press('Escape'); await sleep(300);
  if (await isPaused(page)) await page.locator('#p-resume').click();
  await sleep(300);
  const o0 = await page.evaluate(() => (window as any).__oldbv.getState().dayTime);
  await sleep(3000);
  const o1 = await page.evaluate(() => ({ t: (window as any).__oldbv.getState().dayTime, lost: (window as any).__oldbv.getState().glLost, canvases: document.querySelectorAll('canvas#game').length }));
  await shot(page, 'it13-03-gjenapnet.png');
  const posOk = Math.abs(pos.x - 5.5) < 1 && Math.abs(pos.z - 11.5) < 1;
  record('P5-quit-reopen', o0 === o1.t && o1.canvases === 1 && posOk ? 'PASS' : 'FAIL', `oldDay ${o0}→${o1.t} glLost=${o1.lost} canvases=${o1.canvases} pos=${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}`);

  const report = { when: new Date().toISOString(), results, bugs };
  fs.writeFileSync(path.join(OUT, 'it13-verify.json'), JSON.stringify(report, null, 2));
  const summary: Record<string, number> = { PASS: 0, FAIL: 0, PARTIAL: 0 };
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
  console.log('=== SUMMARY ===', summary);
  await ctx.close();
  await browser.close();
  child.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
