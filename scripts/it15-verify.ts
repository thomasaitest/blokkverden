/**
 * it15 verify: explosions, MC mob loot, string recipes, rotten flesh (Chrome, real input).
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it15';
const VID = '/tmp/it15-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it15';

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
  await boot(page, base, 'It15Verify');
  await acquireLock(page);
  await sleep(3000);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.3); bv.mobs.clear(); });
  const only = (process.env.BV_ONLY || '').split(',').filter(Boolean);
  const run = (id: string) => !only.length || only.includes(id);
  const killMobs = () => page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.mobs = bv.mobs.mobs.filter((m: any) => m.__test); });
  const marks: Record<string, number> = {};
  const mark = (k: string) => { marks[k] = (Date.now() - T0) / 1000; };

  /** Ground: grass at y=45 over 4 layers of stone, open air above. */
  const arena = (lo = -4, hi = 20) => page.evaluate(async ({ lo, hi }) => {
    const bv = (window as any).__bv;
    for (let x = lo; x <= hi; x++) for (let z = lo; z <= hi; z++) {
      for (let y = 40; y <= 44; y++) bv.world.setBlock(x, y, z, 3);
      bv.world.setBlock(x, 45, z, 1);
      for (let y = 46; y <= 52; y++) bv.world.setBlock(x, y, z, 0);
    }
    bv.drops.drops.length = 0;
    await bv.forceRemeshAround();
  }, { lo, hi });

  // X1 — a creeper reached with real W walking hisses and explodes: crater (MC: stone too), nearby chest spills, player hurt but alive
  if (run('X1')) {
    mark('X1');
    await arena();
    await setHeld(page, 0);
    await page.evaluate(() => { const bv = (window as any).__bv;
      bv.mobs.clear(); bv.setDay(0.9); bv.player.health = 20; bv.player.hunger = 20;
      (window as any).__blasts = 0; if (!(window as any).__wrapped) { (window as any).__wrapped = true; const prev = bv.mobs.onBlast; bv.mobs.onBlast = (...a: any[]) => { (window as any).__blasts++; prev?.(...a); }; }
      bv.world.setBlock(7, 46, 4, 13);
      const ch = bv.containers.getChest(7, 46, 4); ch[0] = { id: 55, count: 5 }; ch[1] = { id: 5, count: 9 };
      bv.world.setBlock(10, 46, 4, 12); // torch near the blast
      bv.teleport(8.5, 46.05, 12.5);
      const c = bv.spawnMob('knallbolle', 0, 0, 0); c.x = 8.5; c.z = 5.5; c.y = 46.02; c.__test = true; c.yaw = 0; });
    await page.evaluate(async () => { await (window as any).__bv.forceRemeshAround(); });
    await ensureLocked(page);
    await page.evaluate(() => (window as any).__bv.lookAt(8.5, 47, 5.5));
    await sleep(500);
    await shot(page, 'it15-00-knallbolle-ny-modell.png');
    // walk toward it until it starts to hiss, then stand (player reaction time)
    await page.keyboard.down('KeyW');
    let fuse = 0;
    for (let i = 0; i < 60 && fuse === 0; i++) { await sleep(80); await killMobs(); fuse = await page.evaluate(() => (window as any).__bv.mobs.mobs.find((m: any) => m.__test)?.fuse ?? 0); }
    await page.keyboard.up('KeyW');
    // react like a player: back off a bit (S) — but stay within 7 blocks so it still blows
    await page.keyboard.down('KeyS'); await sleep(450); await page.keyboard.up('KeyS');
    const distAtHiss = await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs.find((m: any) => m.__test); return m ? Math.hypot(m.x - bv.player.x, m.z - bv.player.z) : -1; });
    await sleep(300);
    await shot(page, 'it15-01-knallbolle-freser.png');
    for (let i = 0; i < 30; i++) { await sleep(100); await killMobs(); if (!(await page.evaluate(() => (window as any).__bv.mobs.mobs.some((m: any) => m.__test && m.hp > 0)))) break; }
    await sleep(700);
    const v = await page.evaluate(() => { const bv = (window as any).__bv;
      let crater = 0, stoneGone = 0;
      for (let x = 4; x <= 13; x++) for (let z = 1; z <= 10; z++) {
        if (bv.world.getBlock(x, 45, z) === 0) crater++;
        for (let y = 40; y <= 44; y++) if (bv.world.getBlock(x, y, z) === 0) stoneGone++;
      }
      const ids = bv.drops.drops.map((d: any) => `${d.stack.id}x${d.stack.count}`);
      bv.__x1hp = bv.player.health;
      return { blasts: (window as any).__blasts, crater, stoneGone, chest: bv.world.getBlock(7, 46, 4), torch: bv.world.getBlock(10, 46, 4), hp: +bv.player.health.toFixed(1), dead: bv.getState().dead,
        diamonds: bv.drops.drops.filter((d: any) => d.stack.id === 55).reduce((n: number, d: any) => n + d.stack.count, 0),
        gunpowder: ids.some((s: string) => s.startsWith('74x')), creeper: bv.mobs.mobs.filter((m: any) => m.__test && m.hp > 0).length };
    });
    // look at the crater
    await page.evaluate(async () => { const bv = (window as any).__bv; bv.setDay(0.3); bv.teleport(8.5, 46.05, 13.5); bv.lookAt(8.5, 44, 5.5); });
    await sleep(1200);
    await shot(page, 'it15-02-krater.png');
    record('X1-creeper-blast', fuse > 0 && v.blasts === 1 && v.crater >= 8 && v.chest === 0 && v.diamonds === 5 && v.hp < 20 && v.hp > 0 && !v.dead && !v.gunpowder && v.creeper === 0 ? 'PASS' : 'FAIL',
      `hissAt=${distAtHiss.toFixed(2)} ${JSON.stringify(v)}`);
    mark('X1end');
    await ensureRespawn(page);
  }

  // X2 — kill a zombie, a spider and a creeper with real LMB sword hits: MC loot (rotten flesh / string / gunpowder), never coal
  if (run('X2')) {
    mark('X2');
    await arena();
    const got: Record<string, number[]> = {};
    for (const [kind, want] of [['vandrer', 75], ['vever', 73], ['knallbolle', 74]] as const) {
      got[kind] = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        await ensureRespawn(page);
        await setHeld(page, 115);
        await page.evaluate(({ kind }) => { const bv = (window as any).__bv;
          bv.mobs.clear(); bv.setDay(0.9); bv.player.health = 20; bv.drops.drops.length = 0;
          bv.teleport(8.5, 46.05, 10.5);
          const m = bv.spawnMob(kind, 0, 0, 0); m.x = 8.5; m.z = 8.3; m.y = 46.02; m.__test = true;
          if (kind === 'knallbolle') m.hp = 6; /* scenario: an already-wounded creeper, so one real hit beats the 1.5 s fuse */ }, { kind });
        await ensureLocked(page);
        let clicks = 0;
        for (let i = 0; i < 20; i++) {
          const alive = await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs.find((m: any) => m.__test && m.hp > 0);
            if (m) bv.lookAt(m.x, m.y + m.height * 0.6, m.z); return !!m; });
          if (!alive) break;
          await page.mouse.down(); await sleep(40); await page.mouse.up(); clicks++;
          await sleep(380);
        }
        await sleep(900);
        const ids: number[] = await page.evaluate(() => (window as any).__bv.drops.drops.map((d: any) => d.stack.id).concat(
          (window as any).__bv.inv.slots.filter((s: any) => s && s.id !== 115).map((s: any) => s.id)));
        got[kind].push(...ids);
        if (ids.includes(want)) {
          // walk onto the loot with real W to pick it up
          await page.keyboard.down('KeyW'); await sleep(500); await page.keyboard.up('KeyW'); await sleep(600);
          if (kind === 'vever') await shot(page, 'it15-03-traad-fra-edderkopp.png');
          break;
        }
      }
    }
    const inv = await page.evaluate(() => (window as any).__bv.inv.slots.filter(Boolean).map((s: any) => `${s.id}x${s.count}`));
    const ok = got.vandrer.includes(75) && got.vever.includes(73) && got.knallbolle.includes(74) && !Object.values(got).flat().includes(51);
    record('X2-mob-loot', ok ? 'PASS' : 'FAIL', `${JSON.stringify(got)} invAfter=${JSON.stringify(inv)}`);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); bv.setDay(0.3); });
    mark('X2end');
  }

  // X3 — eat rotten flesh by holding RMB: +4 hunger; Hunger effect turns the bar green and drains it (MC)
  if (run('X3')) {
    await ensureRespawn(page);
    await arena();
    await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(8.5, 46.05, 8.5); bv.look(0, 0.2); bv.player.hunger = 8; bv.player.hungerEffect = 0; });
    await setHeld(page, 75);
    await page.evaluate(() => { (window as any).__bv.inv.slots[0].count = 4; (window as any).__bv.hud.refreshHotbar(); });
    await ensureLocked(page);
    let gained = 0, effect = 0, tries = 0;
    for (; tries < 4 && effect <= 0; tries++) {
      const h0 = await page.evaluate(() => (window as any).__bv.player.hunger);
      await hold(page, 2000, 'right'); await sleep(300);
      const s = await page.evaluate(() => ({ h: (window as any).__bv.player.hunger, e: (window as any).__bv.player.hungerEffect ?? 0 }));
      if (tries === 0) gained = s.h - h0;
      effect = s.e;
    }
    await sleep(400);
    const green = await page.evaluate(() => document.querySelectorAll('#hunger .drum.sick').length);
    await shot(page, 'it15-04-raattent-kjott.png');
    const hA = await page.evaluate(() => (window as any).__bv.player.hunger);
    await sleep(12000);
    const hB = await page.evaluate(() => (window as any).__bv.player.hunger);
    record('X3-rotten-flesh', gained === 4 && effect > 0 && green === 10 && hB < hA ? 'PASS' : 'FAIL', `gained=${gained} tries=${tries} effect=${effect.toFixed(1)} greenDrums=${green} hunger ${hA}→${hB} in 12 s`);
    await page.evaluate(() => { (window as any).__bv.player.hungerEffect = 0; });
  }

  // X4 — crafting with string via real UI clicks: bow on the table (3 sticks + 3 string), 4 string → wool in the 2×2 grid
  if (run('X4')) {
    await ensureRespawn(page);
    await arena();
    await setHeld(page, 0, { 50: 3, 73: 7 });
    await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(10, 46, 8, 11); });
    await page.evaluate(async () => { await (window as any).__bv.forceRemeshAround(); });
    await aim(page, 8.5, 46.05, 8.5, 10.5, 46.5, 8.5);
    await ensureLocked(page); await page.evaluate(() => (window as any).__bv.lookAt(10.5, 46.5, 8.5));
    await hold(page, 80, 'right'); await sleep(500);
    const tableOpen = await page.evaluate(() => (window as any).__bv.input.inventoryOpen);
    if (tableOpen) await uiCraft(page, [0, 50, 73, 50, 0, 73, 0, 50, 73], 3);
    await sleep(300);
    const bow = await countItem(page, 62);
    await shot(page, 'it15-05-bue-av-traad.png');
    await closeUi(page);
    await ensureLocked(page);
    await uiCraft(page, [73, 73, 73, 73], 2);
    await sleep(300);
    const wool = await countItem(page, 59);
    await shot(page, 'it15-06-ull-av-traad.png');
    const icons = await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[30] = { id: 74, count: 3 }; bv.inv.slots[31] = { id: 75, count: 2 }; bv.hud.markDirty(); return true; });
    await closeUi(page);
    record('X4-string-crafting', tableOpen && bow === 1 && wool === 1 ? 'PASS' : 'FAIL', `table=${tableOpen} bow=${bow} wool=${wool} icons=${icons}`);
  }

  // X5 — icons for the new items in the real inventory screen
  if (run('X5')) {
    await setHeld(page, 73, { 74: 5, 75: 3, 62: 1, 59: 2 });
    await ensureLocked(page);
    await page.keyboard.press('KeyE'); await sleep(500);
    const n = await page.evaluate(() => document.querySelectorAll('[data-inv-slot] canvas, [data-inv-slot] img, [data-inv-slot] .icon').length);
    await shot(page, 'it15-07-nye-ikoner.png');
    await closeUi(page);
    record('X5-new-icons', n >= 5 ? 'PASS' : 'PARTIAL', `iconElems=${n} (check screenshot)`);
  }

  // X6 — caves: in a dark, roofed hall (day!) hostiles spawn and come for you; the same hall lit with torches stays empty
  if (run('X6')) {
    await ensureRespawn(page);
    const hall = (lit: boolean) => page.evaluate(async (lit) => { const bv = (window as any).__bv;
      bv.mobs.clear(); bv.setDay(0.3); bv.player.health = 20;
      for (let x = -24; x <= 40; x++) for (let z = -24; z <= 40; z++) {
        for (let y = 12; y <= 32; y++) bv.world.setBlock(x, y, z, (y >= 16 && y <= 18) ? 0 : 3);
        if (lit && (x % 5 === 0) && (z % 5 === 0)) bv.world.setBlock(x, 16, z, 12);
      }
      bv.world.setBlock(8, 16, 9, 12); // one torch by the player so the screenshot shows something
      bv.teleport(8.5, 16.05, 8.5);
      await bv.forceRemeshAround();
    }, lit);
    const watch = async (secs: number) => {
      let seen = 0, near = 0; const kinds = new Set<string>();
      for (let i = 0; i < secs * 2; i++) {
        await sleep(500);
        const r = await page.evaluate(() => { const bv = (window as any).__bv; const p = bv.player;
          const h = bv.mobs.mobs.filter((m: any) => m.hostile && m.hp > 0 && m.y > 15 && m.y < 19);
          return { n: h.length, kinds: h.map((m: any) => m.kind), near: h.filter((m: any) => Math.hypot(m.x - p.x, m.z - p.z) < 6).length }; });
        seen = Math.max(seen, r.n); near = Math.max(near, r.near); r.kinds.forEach((k: string) => kinds.add(k));
        if (near > 0 && i > 10) break;
      }
      return { seen, near, kinds: [...kinds] };
    };
    await hall(true);
    await ensureLocked(page);
    const litRes = await watch(20);
    await hall(false);
    const darkRes = await watch(45);
    await page.evaluate(() => { const bv = (window as any).__bv; const p = bv.player;
      const m = bv.mobs.mobs.filter((m: any) => m.hostile && m.hp > 0).sort((a: any, b: any) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (m) bv.lookAt(m.x, m.y + 1, m.z); });
    await sleep(600);
    await shot(page, 'it15-08-hule-mobber.png');
    const hp = await page.evaluate(() => (window as any).__bv.player.health);
    record('X6-cave-spawns', litRes.seen === 0 && darkRes.seen > 0 && darkRes.near > 0 ? 'PASS' : 'FAIL', `lit=${JSON.stringify(litRes)} dark=${JSON.stringify(darkRes)} hp=${hp}`);
    await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.clear(); });
  }

  const report = { when: new Date().toISOString(), results, bugs, marks };
  fs.writeFileSync(path.join(OUT, 'it15-verify.json'), JSON.stringify(report, null, 2));
  const summary: Record<string, number> = { PASS: 0, FAIL: 0, PARTIAL: 0 };
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
  console.log('=== SUMMARY ===', summary, 'marks', JSON.stringify(marks));
  await ctx.close();
  await browser.close();
  child.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
