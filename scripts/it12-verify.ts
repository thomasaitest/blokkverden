/**
 * it12 verify: HUD layout, far leaves, drop icons, starvation (Chrome, real input).
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

function overlap(a: DOMRect | any, b: DOMRect | any) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { base, child } = await startPreview();
  process.on('exit', () => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
  const browser = await chromium.launch({
    headless: true, channel: 'chrome',
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.addInitScript('window.__name = (f) => f;');
  page.on('pageerror', (e) => { console.error('PAGEERROR', e.message); bug('pageerror ' + e.message); });
  await boot(page, base, 'It12Verify');
  await acquireLock(page);
  await sleep(4000);

  // V1 — far leaves: every transparent chunk mesh within render distance is drawn (no bare trunks on horizon)
  const leaf = await page.evaluate(() => {
    const r = (window as any).__bv.renderer;
    r.render();
    let vis = 0, tot = 0;
    for (const m of r.transparentMeshes.values()) { tot++; if (m.visible) vis++; }
    return { vis, tot };
  });
  record('V1-far-leaves', leaf.tot > 0 && leaf.vis === leaf.tot ? 'PASS' : 'FAIL', JSON.stringify(leaf));

  // V2 — HUD layout: hearts/hunger/armour don't overlap XP bar or hotbar (MC stacking)
  await page.evaluate(() => { const bv = (window as any).__bv; bv.player.health = 13; bv.player.hunger = 9; });
  await sleep(400);
  const rects = await page.evaluate(() => {
    const g = (id: string) => { const r = document.getElementById(id)!.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width }; };
    return { hearts: g('hearts'), hunger: g('hunger'), xp: g('xp-bar'), hotbar: g('hotbar'), armor: g('armor-row'), label: g('xp-label') };
  });
  const bad: string[] = [];
  for (const v of ['hearts', 'hunger'] as const) {
    if (overlap(rects[v], rects.xp)) bad.push(v + '/xp');
    if (overlap(rects[v], rects.hotbar)) bad.push(v + '/hotbar');
    if (overlap(rects[v], rects.armor)) bad.push(v + '/armor');
    if (overlap(rects[v], rects.label)) bad.push(v + '/label');
  }
  if (overlap(rects.xp, rects.hotbar)) bad.push('xp/hotbar');
  record('V2-hud-layout', bad.length === 0 ? 'PASS' : 'FAIL', bad.join(',') || JSON.stringify(rects));
  await shot(page, 'it12-11-hud.png');

  await flatPad(page, 45);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.look(Math.PI, -0.03); });
  await sleep(800);
  await shot(page, 'it12-10-horisont-lov.png');

  // V3 — dropped cobble shows its real (grey) icon, not an id-hash colour (real Q key)
  await flatPad(page, 45);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.player.health = 20; bv.player.hunger = 20; bv.give(4, 1); bv.look(0, -0.25); });
  await acquireLock(page);
  await page.keyboard.press('KeyQ');
  await sleep(1200);
  const d = await page.evaluate(() => (window as any).__bv.drops.drops?.map((x: any) => ({ x: x.x, y: x.y, z: x.z, id: x.stack?.id })) ?? null);
  const dr = Array.isArray(d) ? d.find((x: any) => x.id === 4) : null;
  if (dr) {
    // step back and look at it
    await page.evaluate((dr) => { const bv = (window as any).__bv; bv.teleport(dr.x, 46.05, dr.z + 1.6); bv.lookAt(dr.x, dr.y + 0.2, dr.z); }, dr);
    await sleep(500);
  }
  await shot(page, 'it12-12-drop-ikon.png');
  const px = await page.evaluate(() => {
    const c = document.getElementById('game') as HTMLCanvasElement;
    const tmp = document.createElement('canvas'); tmp.width = 40; tmp.height = 40;
    const g = tmp.getContext('2d')!; g.drawImage(c, c.width / 2 - 20, c.height / 2 - 20, 40, 40, 0, 0, 40, 40);
    const a = g.getImageData(0, 0, 40, 40).data; let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) { r += a[i]; gg += a[i + 1]; b += a[i + 2]; n++; }
    return { r: r / n, g: gg / n, b: b / n };
  });
  const grey = Math.max(px.r, px.g, px.b) - Math.min(px.r, px.g, px.b) < 30;
  record('V3-drop-icon', dr && grey ? 'PASS' : 'PARTIAL', `drop=${JSON.stringify(dr)} rgb=${px.r.toFixed(0)},${px.g.toFixed(0)},${px.b.toFixed(0)} (verify png)`);

  // V4 — starvation: hunger 0 → ½ heart per 4 s, stops at ½ heart (MC Normal)
  await page.evaluate(() => { const bv = (window as any).__bv; bv.player.hunger = 0; bv.player.health = 4; bv.teleport(8.5, 46.05, 8.5); });
  await sleep(8800);
  const h1 = await page.evaluate(() => (window as any).__bv.player.health);
  await page.evaluate(() => { (window as any).__bv.player.health = 2; });
  await sleep(9000);
  const h2 = await page.evaluate(() => ({ hp: (window as any).__bv.player.health, dead: (window as any).__bv.getState().dead }));
  record('V4-starvation', (Math.abs(h1 - 2) < 0.01 || Math.abs(h1 - 3) < 0.01) && Math.abs(h2.hp - 1) < 0.01 && !h2.dead ? 'PASS' : 'FAIL', `after8.8s=${h1} (½-heart steps; swiftshader dt clamp may give 1 tick) floor=${JSON.stringify(h2)}`);
  await shot(page, 'it12-13-sult.png');

  // V5 — bed by day (real RMB): can't sleep, but respawn point is set (MC 1.15+) + action-bar text
  await flatPad(page, 45);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.player.hunger = 20; bv.player.health = 20; bv.setDay(0.4);
    bv.mobs.mobs.length = 0; });
  const bed = await page.evaluate(() => { const bv = (window as any).__bv; bv.look(0, 0); return bv.placeBedFront(); });
  await aim(page, 8.5, 46.05, 8.5, bed.x + 0.5, bed.y + 0.3, bed.z + 0.5);
  await acquireLock(page);
  await page.mouse.down({ button: 'right' }); await sleep(80); await page.mouse.up({ button: 'right' });
  await sleep(300);
  const day1 = await page.evaluate(() => ({ t: (window as any).__bv.getState().dayTime, msg: document.getElementById('action-bar')?.textContent, op: document.getElementById('action-bar')?.style.opacity }));
  await shot(page, 'it12-14-seng-dag.png');
  // walk away, die, respawn → should be at bed
  await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(30.5, 60, 30.5); bv.kill(); });
  await sleep(400);
  await ensureRespawn(page);
  await sleep(400);
  const rp = await st(page);
  const atBed = Math.hypot(rp.x - (bed.x + 0.5), rp.z - (bed.z + 0.5)) < 1.5;
  record('V5-bed-day-spawn', day1.t > 0.3 && day1.t < 0.5 && /sove om natten/.test(day1.msg || '') && atBed ? 'PASS' : 'FAIL',
    `day=${day1.t.toFixed(2)} msg="${day1.msg}" respawn=${rp.x.toFixed(1)},${rp.y.toFixed(1)},${rp.z.toFixed(1)} bed=${JSON.stringify(bed)}`);

  // V6 — bed at night (real RMB) skips to morning
  await page.evaluate(() => { const bv = (window as any).__bv; bv.setDay(0.9); bv.mobs.mobs.length = 0; });
  await aim(page, 8.5, 46.05, 8.5, bed.x + 0.5, bed.y + 0.3, bed.z + 0.5);
  await acquireLock(page);
  await page.mouse.down({ button: 'right' }); await sleep(80); await page.mouse.up({ button: 'right' });
  await sleep(400);
  const day2 = await page.evaluate(() => (window as any).__bv.getState().dayTime);
  record('V6-bed-night-sleep', day2 > 0.25 && day2 < 0.35 ? 'PASS' : 'FAIL', `dayAfter=${day2.toFixed(3)}`);

  // V7 — hold-to-eat: click doesn't eat; ~1.6 s hold eats one; full hunger can't eat
  await page.evaluate(() => { const bv = (window as any).__bv; bv.inv.slots[0] = { id: 52, count: 3 }; bv.inv.selected = 0; bv.player.hunger = 10; bv.hud.markDirty(); bv.hud.refreshHotbar(); bv.look(0, 0.6); });
  await acquireLock(page);
  await page.mouse.down({ button: 'right' }); await sleep(80); await page.mouse.up({ button: 'right' });
  await sleep(300);
  const e0 = await st(page);
  await page.mouse.down({ button: 'right' }); await sleep(900);
  await shot(page, 'it12-15-spiser.png');
  const holdT0 = Date.now();
  for (let i = 0; i < 40; i++) { await sleep(100); if ((await st(page)).hunger > 10) break; }
  const heldMs = Date.now() - holdT0 + 900;
  await page.mouse.up({ button: 'right' });
  await sleep(200);
  const e1 = await st(page); const a1 = await countItem(page, 52);
  await page.evaluate(() => { (window as any).__bv.player.hunger = 20; });
  await page.mouse.down({ button: 'right' }); await sleep(2600); await page.mouse.up({ button: 'right' });
  const a2 = await countItem(page, 52);
  record('V7-hold-to-eat', e0.hunger === 10 && e1.hunger === 14 && a1 === 2 && a2 === 2 && heldMs >= 1500 ? 'PASS' : 'FAIL', `click=${e0.hunger} heldMs=${heldMs} hold=${e1.hunger} apples=${a1} fullHungerApples=${a2}`);

  // V8 — item entities merge (MC): Q three dirt (real key) → one entity ×3 on the ground
  await flatPad(page, 45);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.drops.drops.length = 0; bv.inv.slots.fill(null); bv.give(2, 3); bv.look(0, -0.3); });
  await acquireLock(page);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyQ'); await sleep(120); }
  await sleep(1500);
  const md = await page.evaluate(() => (window as any).__bv.drops.drops.filter((d: any) => d.stack.id === 2).map((d: any) => d.stack.count));
  await shot(page, 'it12-16-drop-samlet.png');
  record('V8-drop-merge', md.length === 1 && md[0] === 3 ? 'PASS' : 'FAIL', `dirtEntities=${JSON.stringify(md)}`);

  const report = { when: new Date().toISOString(), results, bugs };
  fs.writeFileSync(path.join(OUT, 'it12-verify.json'), JSON.stringify(report, null, 2));
  const summary: Record<string, number> = { PASS: 0, FAIL: 0, PARTIAL: 0 };
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;
  console.log('=== SUMMARY ===', summary);
  await browser.close();
  child.kill('SIGKILL');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
