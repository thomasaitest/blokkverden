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

  // P6 — hotbar wheel: one wheel notch = one slot; a trackpad swipe (many tiny deltas) doesn't spin it
  await acquireLock(page);
  const slotOf = () => page.evaluate(() => (window as any).__bv.inv.selected);
  const w0 = await slotOf();
  await page.evaluate(() => { (window as any).__wd = []; window.addEventListener('wheel', (e: any) => (window as any).__wd.push([e.deltaY, e.wheelDeltaY]), { once: true }); });
  await page.mouse.wheel(0, 100); await sleep(350);
  const w1 = await slotOf();
  const wd = await page.evaluate(() => (window as any).__wd);
  await page.evaluate(() => { (window as any).__wd2 = []; window.addEventListener('wheel', (e: any) => (window as any).__wd2.push([+e.deltaY.toFixed(2), e.wheelDeltaY, e.deltaMode])); });
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 2); await sleep(16); }
  await sleep(300);
  const w2 = await slotOf();
  const swipe = ((w2 - w1) + 9) % 9;
  // CDP can only synthesize mouse-wheel notches (wheelDeltaY=±120), so 30 notches = 30 slots (mod 9 = 3).
  // The trackpad accumulation path (wheelDeltaY = -3·deltaY) is covered by tests/controls.test.ts.
  record('P6-wheel', (w1 - w0 + 9) % 9 === 1 && swipe === 3 ? 'PASS' : 'FAIL', `notch ${w0}→${w1} (deltaY/wheelDeltaY ${JSON.stringify(wd)}) 30 notches ${w1}→${w2} ev=${JSON.stringify(await page.evaluate(() => (window as any).__wd2.slice(0, 6)))} n=${await page.evaluate(() => (window as any).__wd2.length)}`);

  // P7 — the click that captures the mouse doesn't place a block (right-click while unlocked)
  await flatPad(page, 45);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 2, count: 5 }; bv.inv.selected = 0; bv.hud.markDirty(); bv.hud.refreshHotbar(); bv.look(0, -1.2); });
  await page.keyboard.press('Escape'); await sleep(300);
  if (await isPaused(page)) await page.locator('#p-resume').click();
  await page.evaluate(() => document.exitPointerLock()); await sleep(300);
  if (await isPaused(page)) await page.evaluate(() => (window as any).__bv.hidePause());
  await sleep(200);
  const unlocked = !(await st(page)).locked;
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' }); await sleep(80); await page.mouse.up({ button: 'right' });
  await sleep(400);
  const p7 = { unlocked, dirt: await countItem(page, 2), locked: (await st(page)).locked };
  record('P7-focus-click-swallowed', p7.unlocked && p7.dirt === 5 ? 'PASS' : 'FAIL', JSON.stringify(p7));
  // …and once captured, the next right-click places normally
  await page.mouse.down({ button: 'right' }); await sleep(80); await page.mouse.up({ button: 'right' });
  await sleep(300);
  const after = await countItem(page, 2);
  record('P7b-then-places', p7.locked && after === 4 ? 'PASS' : 'FAIL', `dirt ${p7.dirt}→${after}`);

  // P8 — mobs need reach + line of sight (MC): pillar-up beats zombies, a roofed shelter stops arrows
  await flatPad(page, 45);
  const hpAfter = async (ms: number) => {
    const t0 = Date.now(); let min = 20;
    while (Date.now() - t0 < ms) {
      await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.mobs = bv.mobs.mobs.filter((m: any) => m.__test);
        for (const m of bv.mobs.mobs) if (m.__pin) { m.x = m.__pin[0]; m.z = m.__pin[1]; } });
      const h = (await st(page)).health;
      min = Math.min(min, h); await sleep(100);
    }
    return min;
  };
  await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.9); bv.mobs.mobs.length = 0; bv.player.health = 20; bv.player.hunger = 20;
    for (let y = 46; y <= 48; y++) bv.world.setBlock(8, y, 8, 3);
    bv.teleport(8.5, 49.05, 8.5); bv.look(0, -0.6);
    const z = bv.spawnMob('vandrer', 1.25, -3, 0); z.__test = true; });
  await acquireLock(page);
  await page.evaluate(async () => { const bv = (window as any).__bv; await bv.forceRemeshAround(); const m = bv.mobs.mobs[0]; if (m) bv.lookAt(m.x, m.y + 0.9, m.z); });
  await sleep(1500);
  await shot(page, 'it13-04-soyle.png');
  const pillarMin = await hpAfter(6000);
  const pz = await page.evaluate(() => { const bv = (window as any).__bv; const m = bv.mobs.mobs[0]; return { me: [bv.player.x, bv.player.y].map((v: number) => +v.toFixed(2)), mob: m ? [m.x, m.y].map((v: number) => +v.toFixed(2)) : null }; });
  // control: same zombie next to the player on the ground does hit
  await page.evaluate(() => { const bv = (window as any).__bv; bv.player.health = 20; bv.teleport(10.5, 46.05, 8.5); });
  const groundMin = await hpAfter(4000);
  record('P8a-pillar-vs-zombie', pillarMin === 20 && groundMin < 20 ? 'PASS' : 'FAIL', `onPillar minHp=${pillarMin} ${JSON.stringify(pz)} control(ground) minHp=${groundMin}`);

  await flatPad(page, 45);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.mobs.length = 0; bv.player.health = 20; bv.teleport(8.5, 46.05, 8.5);
    const s = bv.spawnMob('bueskytt', 7.3, -0.0001, 0.2); s.y = 46.05; s.__test = true; s.__pin = [s.x, s.z]; });
  const openMin = await hpAfter(8000);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.mobs.length = 0; bv.player.health = 20;
    for (let x = 3; x <= 14; x++) for (let z = 3; z <= 14; z++) {
      bv.world.setBlock(x, 49, z, 3);
      if (x === 3 || x === 14 || z === 3 || z === 14) for (let y = 46; y <= 48; y++) bv.world.setBlock(x, y, z, 3);
    }
    bv.world.setBlock(8, 48, 6, 12); // torch-ish marker inside
    bv.teleport(8.5, 46.05, 8.5); bv.lookAt(16, 47, 8.5);
    const s = bv.spawnMob('bueskytt', 7.3, -0.0001, 0.2); s.y = 46.05; s.__test = true; s.__pin = [s.x, s.z]; });
  await page.evaluate(async () => { await (window as any).__bv.forceRemeshAround(); });
  await sleep(1200);
  await shot(page, 'it13-05-ly-mot-skjelett.png');
  const shelterMin = await hpAfter(8000);
  record('P8b-shelter-vs-skeleton', openMin < 20 && shelterMin === 20 ? 'PASS' : 'FAIL', `open minHp=${openMin} shelter minHp=${shelterMin}`);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.mobs.mobs.length = 0; bv.setDay(0.3); bv.player.health = 20; });

  // P9 — death screen → real click on «Gjenoppstå» goes straight back into the game (mouse captured)
  await acquireLock(page);
  await page.evaluate(() => (window as any).__bv.kill());
  await sleep(500);
  await shot(page, 'it13-06-dod.png');
  await page.locator('#btn-respawn').click(); await sleep(600);
  const p9 = await st(page);
  record('P9-respawn-relock', !p9.dead && p9.locked && !(await isPaused(page)) ? 'PASS' : 'FAIL', `dead=${p9.dead} locked=${p9.locked}`);

  // P10 — achievement «Håndverk» (made something on the workbench) only from a table craft, not from placing a block
  await flatPad(page, 45);
  await page.evaluate(() => { localStorage.removeItem('bv-achieve'); const bv = (window as any).__bv; bv.mobs.mobs.length = 0;
    bv.inv.slots.fill(null); bv.inv.slots[0] = { id: 2, count: 3 }; bv.inv.slots[1] = { id: 5, count: 2 }; bv.inv.selected = 0; bv.hud.markDirty(); bv.hud.refreshHotbar(); });
  await page.evaluate(() => { const a = document.getElementById('achieve-toast'); if (a) a.innerHTML = ''; });
  const toastText = () => page.evaluate(() => document.getElementById('achieve-toast')?.textContent ?? '');
  await aim(page, 8.5, 46.05, 8.5, 8.5, 45.9, 6.5);
  await ensureLocked(page); await sleep(150);
  await page.mouse.down({ button: 'right' }); await sleep(80); await page.mouse.up({ button: 'right' });
  await sleep(600);
  const placedDirt = await countItem(page, 2);
  const tPlace = await toastText();
  // table: place one via __bv (setup), open with real RMB, craft log → planks with real clicks
  await page.evaluate(() => { const bv = (window as any).__bv; bv.world.setBlock(10, 46, 8, 11); });
  await aim(page, 8.5, 46.05, 8.5, 10.5, 46.5, 8.5);
  await ensureLocked(page); await sleep(150);
  await page.mouse.down({ button: 'right' }); await sleep(80); await page.mouse.up({ button: 'right' });
  await sleep(500);
  const tableOpen = await page.evaluate(() => (window as any).__bv.input.inventoryOpen);
  const crafted = tableOpen ? await uiCraft(page, [5], 3) : false;
  await sleep(500);
  await shot(page, 'it13-07-handverk.png');
  const tCraft = await toastText();
  const planks = await countItem(page, 6);
  if (await page.evaluate(() => (window as any).__bv.input.inventoryOpen)) { await page.keyboard.press('KeyE'); await sleep(300); }
  record('P10-craft-achievement', placedDirt === 2 && !/Håndverk/.test(tPlace) && tableOpen && planks === 4 && /Håndverk/.test(tCraft) ? 'PASS' : 'FAIL',
    `placed=${placedDirt === 2} toastAfterPlace="${tPlace}" table=${tableOpen} crafted=${crafted} planks=${planks} toastAfterCraft="${tCraft}"`);

  // P11 — HUD: hearts/hunger rows keep their position as they empty; empty hearts stay visible
  const rowRects = () => page.evaluate(() => {
    const r = (id: string) => { const b = document.getElementById(id)!.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; };
    return { hearts: r('hearts'), hunger: r('hunger') };
  });
  await page.evaluate(() => { const bv = (window as any).__bv; bv.player.health = 20; bv.player.hunger = 20; });
  await sleep(400);
  const full = await rowRects();
  await page.evaluate(() => { const bv = (window as any).__bv; bv.player.health = 3; bv.player.hunger = 1; });
  await sleep(400);
  const low = await rowRects();
  await shot(page, 'it13-08-hud-tom.png');
  await page.evaluate(() => { const bv = (window as any).__bv; bv.player.health = 20; bv.player.hunger = 20; });
  record('P11-hud-stable', JSON.stringify(full) === JSON.stringify(low) ? 'PASS' : 'FAIL', `full=${JSON.stringify(full)} low=${JSON.stringify(low)}`);

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
