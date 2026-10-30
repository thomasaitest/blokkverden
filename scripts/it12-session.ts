/**
 * Core survival playtest (Chrome). No ?test=1.
 * __bv = scenario setup / assertions only. Actions under test = real keyboard/mouse.
 * Critical: after pointer-lock, Playwright mouse moves inject look deltas — aim via __bv AFTER lock click, then mouse.down without moving.
 */
import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.BV_OUT || 'public/progress/it12';
const VID = '/tmp/it12-vid';
const SHOTS = process.env.BV_SHOTS || '/workspace/blokkverden-shots/it12';

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


async function dropsOf(page: Page, id: number) {
  return page.evaluate((id) => (window as any).__bv.drops.drops.filter((d: any) => d.stack.id === id).map((d: any) => ({ x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: +d.z.toFixed(2), n: d.stack.count })), id);
}
async function setSlots(page: Page, slots: Record<number, any>, sel = 0) {
  await page.evaluate(({ slots, sel }) => {
    const bv = (window as any).__bv;
    for (let i = 0; i < 36; i++) bv.inv.slots[i] = null;
    for (const k of Object.keys(slots)) bv.inv.slots[+k] = slots[k];
    bv.inv.selected = sel; bv.hud.setSlot?.(sel); bv.hud.markDirty?.(); bv.hud.refreshHotbar?.();
  }, { slots, sel });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(VID, { recursive: true });
  const { base, child } = await startPreview();
  process.on('exit', () => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
  const browser = await chromium.launch({
    headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: process.env.NOVID ? undefined : { dir: VID, size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error('PAGEERROR', e.message); bug('pageerror ' + e.message); });

  await boot(page, base, 'It12Session');
  await acquireLock(page);

  // S1 — fresh survival world starts with empty inventory (MC)
  const nonEmpty = await page.evaluate(() => (window as any).__bv.inv.slots.filter(Boolean).length);
  record('S1-empty-start', nonEmpty === 0 ? 'PASS' : 'FAIL', `nonEmptySlots=${nonEmpty}`);
  await shot(page, 'it12-01-tom-start.png');

  // S2 — mine stone under a roof (tunnel/cave): drop must land by the hole and be picked up
  await flatPad(page, 45);
  await sleep(2600); // let chunk (0,0) structure roll happen, then re-flatten (setup)
  await flatPad(page, 45);
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    for (let x = 5; x <= 11; x++) for (let z = 3; z <= 11; z++) bv.world.setBlock(x, 48, z, 3); // roof
    bv.world.setBlock(8, 46, 6, 3); // target stone
  });
  await setSlots(page, { 0: { id: 100, count: 1, durability: 60 } }, 0);
  await page.evaluate(async () => { await (window as any).__bv.waitForMeshes(3000); });
  await aim(page, 8.5, 46.05, 8.5, 8.5, 46.5, 6.5);
  await focusGame(page);
  await page.mouse.down(); await sleep(3200); await page.mouse.up();
  await sleep(600);
  const broke = await page.evaluate(() => (window as any).__bv.world.getBlock(8, 46, 6));
  const cd = await dropsOf(page, 4);
  await shot(page, 'it12-02-hule-drop.png');
  const dropOk = cd.length > 0 && cd[0].y < 47.6;
  record('S2-cave-drop-height', broke === 0 && dropOk ? 'PASS' : 'FAIL', `block=${broke} drops=${JSON.stringify(cd)}`);
  await page.keyboard.down('KeyW'); await sleep(700); await page.keyboard.up('KeyW');
  await sleep(500);
  const cob = await countItem(page, 4);
  record('S2-cave-drop-pickup', cob >= 1 ? 'PASS' : 'FAIL', `cobble=${cob}`);

  await page.evaluate(() => { (window as any).__bv.drops.drops.length = 0; });
  // S3 — Q drops one, Ctrl+Q drops stack, re-pickup after delay
  await flatPad(page, 45);
  await setSlots(page, { 0: { id: 2, count: 5 } }, 0);
  await aim(page, 8.5, 46.05, 12.5, 8.5, 46.6, 6.5);
  await focusGame(page);
  await page.keyboard.press('KeyQ'); await sleep(150);
  const afterQ = await countItem(page, 2);
  const dq = (await dropsOf(page, 2)).filter((d) => d.y > 40);
  await shot(page, 'it12-03-q-drop.png');
  record('S3-q-drop-one', afterQ === 4 && dq.length === 1 && dq[0].n === 1 ? 'PASS' : 'FAIL', `inv=${afterQ} drops=${JSON.stringify(dq)}`);
  await page.keyboard.press('Control+KeyQ'); await sleep(200);
  const afterCQ = await countItem(page, 2);
  const nearNow = await countItem(page, 2);
  record('S3-ctrlq-stack', afterCQ === 0 ? 'PASS' : 'FAIL', `inv=${afterCQ}`);
  await sleep(2300);
  await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW');
  await sleep(400);
  const back = await countItem(page, 2);
  record('S3-q-repickup', back === 5 && nearNow === 0 ? 'PASS' : 'FAIL', `dirt=${back}`);

  // S4 — death scatters inventory + armour; respawn empty; walk back and recover
  await flatPad(page, 45);
  await setSlots(page, { 0: { id: 2, count: 10 }, 1: { id: 100, count: 1, durability: 60 } }, 0);
  await page.evaluate(() => { (window as any).__bv.inv.armor[0] = { id: 124, count: 1, durability: 165 }; });
  await aim(page, 8.5, 46.05, 8.5, 8.5, 46.3, 2.5);
  await page.evaluate(() => (window as any).__bv.kill());
  await sleep(1200);
  await shot(page, 'it12-04-dod-drops.png');
  const box = await page.locator('#btn-respawn').boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(500);
  const afterResp = await page.evaluate(() => {
    const bv = (window as any).__bv;
    return { slots: bv.inv.slots.filter(Boolean).length, armor: bv.inv.armor.filter(Boolean).length, dead: bv.getState().dead };
  });
  record('S4-respawn-empty', afterResp.slots === 0 && afterResp.armor === 0 && !afterResp.dead ? 'PASS' : 'FAIL', JSON.stringify(afterResp));
  // Walk back to where we died (teleport = travel setup), then collect by walking
  await acquireLock(page);
  await aim(page, 8.5, 46.05, 11.5, 8.5, 46.3, 2.5);
  await focusGame(page);
  await page.keyboard.down('KeyW'); await sleep(1100); await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS'); await sleep(500); await page.keyboard.up('KeyS');
  await sleep(400);
  const rec = await page.evaluate(() => {
    const bv = (window as any).__bv;
    let dirt = 0, pick = 0, helm = 0;
    for (const s of bv.inv.slots) { if (!s) continue; if (s.id === 2) dirt += s.count; if (s.id === 100) pick++; if (s.id === 124) helm++; }
    return { dirt, pick, helm, left: bv.drops.drops.length };
  });
  record('S4-recover-drops', rec.dirt === 10 && rec.pick === 1 && rec.helm === 1 ? 'PASS' : 'FAIL', JSON.stringify(rec));

  // S5 — closing inventory with craft-grid item and full inventory: item is thrown, not lost
  await flatPad(page, 45);
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    for (let i = 0; i < 36; i++) bv.inv.slots[i] = { id: 2, count: 64 };
    bv.inv.slots[9] = { id: 6, count: 1 };
    bv.drops.drops.length = 0;
  });
  await focusGame(page);
  await page.keyboard.press('KeyE'); await sleep(300);
  await page.locator('[data-inv-slot="9"]').click(); await sleep(80);
  await page.locator('[data-craft-slot="0"]').click(); await sleep(80);
  await page.evaluate(() => { (window as any).__bv.inv.slots[9] = { id: 2, count: 64 }; }); // inventory now full
  await shot(page, 'it12-05-full-craft.png');
  await page.keyboard.press('KeyE'); await sleep(300);
  const ov = await dropsOf(page, 6);
  record('S5-close-overflow', ov.length === 1 && ov[0].n === 1 ? 'PASS' : 'FAIL', JSON.stringify(ov));

  // S6 — chunk border: break block on x=15|16 border, neighbour face must render (visual) + sprint across borders
  await acquireLock(page);
  await flatPad(page, 45);
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    for (let x = 0; x <= 31; x++) for (let z = 0; z <= 16; z++) { bv.world.setBlock(x, 45, z, 1); bv.world.setBlock(x, 44, z, 3); for (let y = 46; y < 52; y++) bv.world.setBlock(x, y, z, 0); }
  });
  await setSlots(page, { 0: { id: 102, count: 1, durability: 60 } }, 0);
  await page.evaluate(async () => { await (window as any).__bv.waitForMeshes(3000); });
  await aim(page, 13.5, 46.05, 8.5, 15.5, 45.5, 8.5);
  await focusGame(page);
  await page.mouse.down(); await sleep(1500); await page.mouse.up();
  await sleep(300);
  await aim(page, 13.5, 46.05, 8.5, 16.5, 45.5, 8.5);
  await page.mouse.down(); await sleep(1500); await page.mouse.up();
  await page.evaluate(async () => { await (window as any).__bv.waitForMeshes(3000); });
  await sleep(500);
  await aim(page, 13.0, 47.6, 8.5, 16.0, 44.5, 8.5);
  await sleep(500);
  const b15 = await page.evaluate(() => [(window as any).__bv.world.getBlock(15, 45, 8), (window as any).__bv.world.getBlock(16, 45, 8)]);
  await shot(page, 'it12-06-chunkkant.png');
  record('S6-chunk-border-dig', b15[0] === 0 && b15[1] === 0 ? 'PASS' : 'FAIL', `blocks=${b15} (visual check png)`);

  // S7 — sprint ~10 s across natural terrain / chunk borders: no fall-through, fps
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    // pick a dry-land start (sea floor runs gave terrain-dependent 'stuck' results)
    let x = 200, z = 200, gy = 60;
    for (let tries = 0; tries < 12; tries++, z += 24) {
      bv.world.updateAround?.(x, z);
      let top = 0, topId = 0;
      for (let y = 63; y > 1; y--) { const b = bv.world.getBlock(x, y, z); if (b !== 0 && b !== 7) { top = y; topId = b; break; } }
      gy = top + 1;
      if (topId !== 10 && top > 30) break;
    }
    bv.player.vy = 0;
    bv.teleport(x + 0.5, gy + 0.05, z + 0.5);
    bv.look(Math.PI / 2, 0);
  });
  await page.evaluate(async () => { await (window as any).__bv.waitForMeshes(5000); });
  await sleep(2500);
  await focusGame(page);
  const fpsS: number[] = []; let minY = 1e9; let stuck = 0; let lastX = 0; let embedded = 0;
  const startX = (await st(page)).x;
  await page.keyboard.down('KeyW'); await sleep(80); await page.keyboard.up('KeyW'); await sleep(60);
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 20; i++) {
    await page.keyboard.down('Space'); await sleep(120); await page.keyboard.up('Space');
    await sleep(380);
    const s = await st(page);
    fpsS.push(s.fps);
    // fall-through check: feet/head inside a solid block = embedded (caves/overhangs above are legit)
    const emb = await page.evaluate(({ x, y, z }) => { const bv = (window as any).__bv; const ok = (b: number) => b === 0 || b === 9 || b === 10 || b === 7;
      return !ok(bv.world.getBlock(Math.floor(x), Math.floor(y + 0.2), Math.floor(z))) || !ok(bv.world.getBlock(Math.floor(x), Math.floor(y + 1.5), Math.floor(z))); }, { x: s.x, y: s.y, z: s.z });
    if (emb) embedded++;
    minY = Math.min(minY, s.y);
    if (i > 0 && Math.abs(s.x - lastX) < 0.05) stuck++;
    lastX = s.x;
  }
  await page.keyboard.up('KeyW');
  const endS = await st(page);
  const dist = Math.hypot(endS.x - startX, 0);
  await shot(page, 'it12-07-sprint.png');
  const avg = fpsS.reduce((a, b) => a + b, 0) / fpsS.length;
  record('S7-sprint-borders', embedded === 0 && dist > 20 ? 'PASS' : (embedded === 0 && dist > 8 ? 'PARTIAL' : 'FAIL'), `dist=${dist.toFixed(1)} embedded=${embedded} minY=${minY.toFixed(2)} fpsAvg=${avg.toFixed(0)} fpsMin=${Math.min(...fpsS)} stuckSamples=${stuck}`);

  // S8 — save/reload keeps a thrown drop
  await setSlots(page, { 0: { id: 6, count: 3 } }, 0);
  await page.evaluate(() => { (window as any).__bv.drops.drops.length = 0; });
  await focusGame(page);
  await page.keyboard.press('KeyQ'); await sleep(800);
  await page.evaluate(async () => { await (window as any).__bv.forceSave(); });
  const pre = await dropsOf(page, 6);
  await page.reload({ waitUntil: 'domcontentloaded' });
  page.removeAllListeners('dialog');
  page.on('dialog', async (d) => { await d.accept(); });
  await page.locator('#btn-single').click(); await sleep(400);
  await page.locator('[data-play="It12Session"]').click();
  await sleep(300);
  for (let i = 0; i < 80; i++) { if (await page.evaluate(() => !!(window as any).__bv)) break; await sleep(250); }
  await sleep(800);
  const post = await page.evaluate(() => (window as any).__bv ? (window as any).__bv.drops.drops.filter((d: any) => d.stack.id === 6).length : -1);
  const invAfter = await page.evaluate(() => (window as any).__bv ? (window as any).__bv.inv.slots.filter(Boolean).map((s: any) => s.id + 'x' + s.count) : null);
  const planksTotal = await page.evaluate(() => { const bv = (window as any).__bv; let n = 0; for (const s of bv.inv.slots) if (s?.id === 6) n += s.count; for (const d of bv.drops.drops) if (d.stack.id === 6) n += d.stack.count; return n; });
  record('S8-save-drop', pre.length === 1 && planksTotal === 3 ? 'PASS' : 'FAIL', `pre=${pre.length} post=${post} planksTotal(inv+drops)=${planksTotal} inv=${JSON.stringify(invAfter)}`);
  await shot(page, 'it12-08-reload.png');

  // S9 — village is NOT re-stamped over player changes after save/reload
  await acquireLock(page);
  const wall = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    // village chunk (-2,3) → house origin (-28, y, 52); west wall at x=-28, z=54
    const X = -28, Z = 54;
    bv.world.updateAround?.(X, Z);
    let gy = 60; for (let y = 63; y > 1; y--) { const b = bv.world.getBlock(X - 3, y, Z); if (b !== 0 && b !== 9 && b !== 10 && b !== 7) { gy = y + 1; break; } }
    bv.player.vy = 0; bv.teleport(X - 2.5, gy + 0.05, Z + 0.5);
    await new Promise((r) => setTimeout(r, 3000));
    for (let y = 60; y > 20; y--) if (bv.world.getBlock(X, y, Z) === 6) return { x: X, y, z: Z };
    return null;
  });
  if (!wall) { record('S9-village-no-restamp', 'UNTESTED', 'no village wall at chunk 0,0'); }
  else {
    await setSlots(page, { 0: { id: 101, count: 1, durability: 60 } }, 0);
    await page.evaluate(({ x, y, z }) => {
      const bv = (window as any).__bv;
      bv.world.setBlock(x - 1, y - 1, z, 4); bv.world.setBlock(x - 1, y, z, 0); bv.world.setBlock(x - 1, y + 1, z, 0);
      bv.world.setBlock(x - 2, y - 1, z, 4); bv.world.setBlock(x - 2, y, z, 0); bv.world.setBlock(x - 2, y + 1, z, 0);
    }, wall);
    await page.evaluate(async () => { await (window as any).__bv.waitForMeshes(3000); });
    await aim(page, wall.x - 1.5, wall.y + 0.05, wall.z + 0.5, wall.x + 0.5, wall.y + 0.5, wall.z + 0.5);
    await focusGame(page);
    await page.mouse.down(); await sleep(2500); await page.mouse.up(); await sleep(300);
    const minedNow = await page.evaluate(({ x, y, z }) => (window as any).__bv.world.getBlock(x, y, z), wall);
    await page.evaluate(async () => { await (window as any).__bv.forceSave(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#btn-single').click(); await sleep(400);
    await page.locator('[data-play="It12Session"]').click();
    for (let i = 0; i < 80; i++) { if (await page.evaluate(() => !!(window as any).__bv)) break; await sleep(250); }
    await sleep(4500);
    const after = await page.evaluate(({ x, y, z }) => (window as any).__bv.world.getBlock(x, y, z), wall);
    await shot(page, 'it12-09-landsby-reload.png');
    record('S9-village-no-restamp', minedNow === 0 && after === 0 ? 'PASS' : 'FAIL', `wall=${JSON.stringify(wall)} minedNow=${minedNow} afterReload=${after}`);
  }

  // S10 — MC: no sprinting at hunger ≤ 6 (real Ctrl+W input)
  await acquireLock(page);
  const sprintDist = async (hunger: number) => {
    await flatPad(page, 45);
    await page.evaluate((h) => { const bv = (window as any).__bv; bv.player.hunger = h; bv.look(0, 0); bv.teleport(8.5, 46.05, 15.5); }, hunger);
    await sleep(300);
    await focusGame(page);
    const a = await st(page);
    await page.keyboard.down('Control'); await page.keyboard.down('KeyW'); await sleep(1500);
    await page.keyboard.up('KeyW'); await page.keyboard.up('Control');
    await sleep(200);
    const b = await st(page);
    return a.z - b.z;
  };
  const dFed = await sprintDist(20);
  const dHungry = await sprintDist(5);
  record('S10-no-sprint-hungry', dFed > dHungry * 1.15 ? 'PASS' : 'FAIL', `fed=${dFed.toFixed(2)} hungry=${dHungry.toFixed(2)}`);

  const report = { when: new Date().toISOString(), results, bugs };
  fs.writeFileSync(path.join(OUT, 'it12-session.json'), JSON.stringify(report, null, 2));
  const summary: Record<string, number> = { PASS: 0, FAIL: 0, PARTIAL: 0 };
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
  console.log('=== SUMMARY ===', summary);
  setTimeout(() => process.exit(0), 20000);
  await ctx.close();
  const vid = await page.video()?.path().catch(() => null);
  if (vid) console.log('VIDEO', vid);
  await browser.close();
  child.kill('SIGKILL');
}
main().catch((e) => { console.error(e); process.exit(1); });
