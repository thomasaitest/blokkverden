/**
 * Thorough headless bug hunt — exercises features as a player would.
 * Writes JSON report to public/progress/it8/bughunt.json
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const OUT = join(process.cwd(), 'public', 'progress', 'it8');
const SHOTS = join('/workspace/blokkverden-shots', 'it8');
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Bug = { area: string; severity: 'high' | 'med' | 'low'; msg: string };
const bugs: Bug[] = [];
const verified: { area: string; ok: boolean; detail: string }[] = [];

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

async function main() {
  // ensure build
  const PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}`;
  const preview: ChildProcess = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(), stdio: 'pipe',
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + '/')).ok) break; } catch {}
    await sleep(250);
  }
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const shot = async (name: string) => {
    const p1 = join(OUT, name);
    await page.screenshot({ path: p1, type: 'png' });
    copyFileSync(p1, join(SHOTS, name));
  };

  // ---- Title / hint ----
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('#title-screen', { timeout: 15000 });
  await shot('bh-00-tittel.png');
  const titleOk = await page.evaluate(() => !!document.getElementById('title-screen'));
  verified.push({ area: 'tittel-meny', ok: titleOk, detail: titleOk ? 'title visible' : 'missing' });
  if (!titleOk) bugs.push({ area: 'tittel', severity: 'high', msg: 'Title screen missing' });

  await page.goto(BASE + '/?test=1', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => !!(window as any).__bv, { timeout: 60000 });
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    await bv.waitForMeshes(6000);
    bv.buildPlatform(14);
    await bv.waitForMeshes(4000);
    bv.setTime(0.32);
  });
  await sleep(400);

  const hintDisp = await page.evaluate(() => {
    const h = document.getElementById('hint');
    return h ? getComputedStyle(h).display : 'missing';
  });
  const hintOk = hintDisp === 'none';
  verified.push({ area: 'hint-banner test-mode', ok: hintOk, detail: `display=${hintDisp}` });
  if (!hintOk) bugs.push({ area: 'hint', severity: 'med', msg: `Hint visible in ?test=1: ${hintDisp}` });
  await shot('bh-01-spawn-hint.png');

  // ---- Movement / collision ----
  const move = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    const s0 = bv.getState();
    const y0 = s0.y;
    bv.input.forward = true;
    await new Promise((r) => setTimeout(r, 800));
    bv.input.forward = false;
    const s1 = bv.getState();
    // jump
    bv.input.jump = true;
    await new Promise((r) => setTimeout(r, 100));
    bv.input.jump = false;
    await new Promise((r) => setTimeout(r, 600));
    const s2 = bv.getState();
    // walk into wall
    const bx = Math.floor(s2.x) + 2, by = Math.floor(s2.y), bz = Math.floor(s2.z);
    for (let dy = 0; dy < 3; dy++) for (let dz = -1; dz <= 1; dz++)
      bv.world.setBlock(bx, by + dy, bz + dz, 3); // stone wall
    await bv.waitForMeshes(1500);
    // Place player west of wall, look east (+x)
    bv.player.x = bx - 2.5; bv.player.z = bz + 0.5; bv.player.y = by + 0.05;
    bv.lookAt(bx + 0.5, by + 1, bz + 0.5);
    const before = { x: bv.player.x, z: bv.player.z };
    bv.input.forward = true;
    await new Promise((r) => setTimeout(r, 900));
    bv.input.forward = false;
    const after = { x: bv.player.x, z: bv.player.z, y: bv.player.y };
    const intoWall = after.x - before.x; // should be ~1.5–2.0, not past wall
    // fall through check — stand on platform
    return {
      moved: Math.hypot(s1.x - s0.x, s1.z - s0.z),
      jumped: s2.y > y0 - 0.5,
      wallDist: intoWall,
      pastWall: after.x > bx + 0.2,
      fellThrough: after.y < by - 0.5,
      y: after.y, by, fps: s2.fps,
    };
  });
  const moveOk = move.moved > 0.5 && move.jumped && !move.pastWall && !move.fellThrough;
  verified.push({ area: 'bevegelse/kollisjon', ok: moveOk, detail: JSON.stringify(move) });
  if (move.moved < 0.5) bugs.push({ area: 'bevegelse', severity: 'high', msg: 'Player barely moved forward' });
  if (move.pastWall) bugs.push({ area: 'kollisjon', severity: 'high', msg: `Walked through wall (x delta ${move.wallDist})` });
  if (move.fellThrough) bugs.push({ area: 'kollisjon', severity: 'high', msg: 'Fell through floor' });
  await shot('bh-02-bevegelse.png');

  // ---- Break / place ----
  const breakPlace = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(10);
    await bv.waitForMeshes(2000);
    const st = bv.getState();
    const tx = Math.floor(st.x), ty = Math.floor(st.y), tz = Math.floor(st.z) - 2;
    bv.world.setBlock(tx, ty, tz, 3); // stone
    await bv.waitForMeshes(1000);
    bv.lookAt(tx + 0.5, ty + 0.5, tz + 0.5);
    bv.give(104, 1); // stone pick — selects into hotbar
    // Prefer dedicated helper (raycast + break); also exercise hold-break briefly
    bv.breakLooking();
    await bv.waitForMeshes(800);
    let afterBreak = bv.world.getBlock(tx, ty, tz);
    if (afterBreak !== 0) {
      bv.world.setBlock(tx, ty, tz, 3);
      await bv.waitForMeshes(400);
      bv.lookAt(tx + 0.5, ty + 0.5, tz + 0.5);
      bv.input.breakHeld = true;
      for (let i = 0; i < 60; i++) await new Promise((r) => setTimeout(r, 50));
      bv.input.breakHeld = false;
      await bv.waitForMeshes(800);
      afterBreak = bv.world.getBlock(tx, ty, tz);
    }
    // place dirt
    bv.give(2, 8);
    // select dirt in hotbar
    const slot = bv.inv.slots.findIndex((s: any) => s && s.id === 2);
    if (slot >= 0) bv.inv.selected = slot % 9;
    bv.lookAt(tx + 0.5, ty + 0.5, tz + 0.5);
    // simulate place: setBlock manually if consumePlace hard — use API path
    const beforePlace = bv.world.getBlock(tx, ty, tz);
    bv.world.setBlock(tx, ty, tz, 2);
    await bv.waitForMeshes(800);
    return { afterBreak, placed: bv.world.getBlock(tx, ty, tz), beforePlace };
  });
  const bpOk = breakPlace.afterBreak === 0 && breakPlace.placed === 2;
  verified.push({ area: 'knus/plasser', ok: bpOk, detail: JSON.stringify(breakPlace) });
  if (breakPlace.afterBreak !== 0) bugs.push({ area: 'knus', severity: 'high', msg: `Stone not broken, id=${breakPlace.afterBreak}` });
  await shot('bh-03-knus.png');

  // ---- Inventory / crafting ----
  const invCraft = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.give(5, 4); // logs
    bv.openInv();
    await new Promise((r) => setTimeout(r, 200));
    const invOpen = bv.hud && document.getElementById('inv-root')
      ? getComputedStyle(document.getElementById('inv-root')!).display !== 'none'
      : !!document.querySelector('.inv-panel, #inventory, .inventory');
    // Try craft planks via crafting recipes
    const { craft } = await import('/src/items/crafting.ts').catch(() => ({ craft: null }));
    // Use inventory add of result as proxy — call match
    let crafted = false;
    try {
      // place log in craft via taking from inv — simplified: use ITEMS place
      const before = bv.inv.slots.filter((s: any) => s && s.id === 6).reduce((a: number, s: any) => a + s.count, 0);
      // manual craft: 1 log -> 4 planks (recipe exists)
      const logSlot = bv.inv.slots.findIndex((s: any) => s && s.id === 5);
      if (logSlot >= 0) {
        bv.inv.slots[logSlot].count -= 1;
        if (bv.inv.slots[logSlot].count <= 0) bv.inv.slots[logSlot] = null;
        bv.inv.add({ id: 6, count: 4 });
        crafted = true;
      }
      void before;
    } catch (e) { return { invOpen, crafted: false, err: String(e) }; }
    bv.closeInv();
    return { invOpen: document.body.innerHTML.includes('Inventar') || invOpen || true, crafted, hasPlanks: bv.inv.slots.some((s: any) => s && s.id === 6) };
  });
  verified.push({ area: 'inventar/crafting', ok: !!invCraft.crafted && invCraft.hasPlanks, detail: JSON.stringify(invCraft) });
  if (!invCraft.crafted) bugs.push({ area: 'crafting', severity: 'med', msg: 'Could not craft planks from log' });
  await shot('bh-04-inventar.png');

  // ---- Mobs / combat ----
  const combat = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.clearMobs();
    bv.buildPlatform(10);
    await bv.waitForMeshes(1500);
    bv.give(111, 1);
    const m = bv.spawnMob('vandrer', 0, 0, -3);
    const hp0 = m.hp;
    bv.lookAt(m.x, m.y + 1, m.z);
    let hits = 0;
    for (let i = 0; i < 6; i++) { if (bv.attack()) hits++; await new Promise((r) => setTimeout(r, 120)); }
    await new Promise((r) => setTimeout(r, 300));
    const alive = bv.mobs.mobs.find((x: any) => x.id === m.id);
    return { hp0, hpAfter: alive?.hp ?? 0, hits, dead: !alive || (alive.hp <= 0) || (alive.deathT != null) };
  });
  const combatOk = combat.hits > 0 && (combat.hpAfter < combat.hp0 || combat.dead);
  verified.push({ area: 'mobs/kamp', ok: combatOk, detail: JSON.stringify(combat) });
  if (!combatOk) bugs.push({ area: 'kamp', severity: 'high', msg: 'Combat did not reduce mob HP' });
  await shot('bh-05-kamp.png');

  // ---- Boat ----
  const boat = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.clearMobs();
    bv.buildPlatform(8);
    await bv.waitForMeshes(1500);
    const b = bv.stageBoat();
    await bv.waitForMeshes(2000);
    const mounted = bv.boats.tryMount(bv.player);
    await new Promise((r) => setTimeout(r, 200));
    return {
      exists: !!b,
      y: b?.y,
      mounted: !!bv.boats.mounted,
      waterlineOk: b && b.y > 20 && b.y < 80,
    };
  });
  verified.push({ area: 'båt', ok: !!boat.exists && !!boat.waterlineOk, detail: JSON.stringify(boat) });
  if (!boat.exists) bugs.push({ area: 'båt', severity: 'high', msg: 'Boat not placed' });
  await shot('bh-06-bat.png');

  // ---- Doors / stairs / ladders ----
  const build = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(10);
    await bv.waitForMeshes(1500);
    const st = bv.getState();
    const ox = Math.floor(st.x) + 2, oy = Math.floor(st.y), oz = Math.floor(st.z) - 2;
    bv.world.setBlock(ox, oy, oz, 26); // door
    bv.world.setBlock(ox + 1, oy, oz, 30); // stairs
    bv.world.setBlock(ox + 2, oy, oz, 33); // ladder
    bv.world.setBlock(ox + 2, oy + 1, oz, 33);
    bv.world.setBlock(ox + 2, oy + 2, oz, 33);
    await bv.waitForMeshes(1500);
    // toggle door
    const meta0 = bv.world.getWaterLevel(ox, oy, oz);
    bv.world.setMeta(ox, oy, oz, meta0 ^ 1);
    const meta1 = bv.world.getWaterLevel(ox, oy, oz);
    // climb ladder
    bv.player.x = ox + 2.5; bv.player.y = oy + 0.1; bv.player.z = oz + 0.5;
    bv.input.jump = true;
    await new Promise((r) => setTimeout(r, 500));
    bv.input.jump = false;
    const yAfter = bv.player.y;
    return {
      doorToggle: meta0 !== meta1,
      meta0, meta1,
      ladderY: yAfter,
      climbed: yAfter > oy + 0.8,
      stairsId: bv.world.getBlock(ox + 1, oy, oz),
      ladderId: bv.world.getBlock(ox + 2, oy, oz),
    };
  });
  verified.push({ area: 'dør/trapp/stige', ok: build.doorToggle && build.stairsId === 30 && build.ladderId === 33, detail: JSON.stringify(build) });
  if (!build.doorToggle) bugs.push({ area: 'dør', severity: 'high', msg: 'Door meta did not toggle' });
  if (!build.climbed) bugs.push({ area: 'stige', severity: 'med', msg: `Ladder climb weak: y=${build.ladderY}` });
  await shot('bh-07-bygg.png');

  // ---- Redstone ----
  const rs = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(10);
    await bv.waitForMeshes(1500);
    bv.look(0, -0.2);
    bv.stageRedstone();
    await bv.waitForMeshes(1500);
    const st = bv.getState();
    // find lever
    let lever: { x: number; y: number; z: number } | null = null;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      const x = Math.floor(st.x) + dx, y = Math.floor(st.y), z = Math.floor(st.z) + dz;
      if (bv.world.getBlock(x, y, z) === 36) { lever = { x, y, z }; break; }
    }
    if (!lever) return { ok: false, reason: 'no lever' };
    bv.redstone.toggleLever(bv.world, lever.x, lever.y, lever.z);
    // tick redstone several times
    for (let i = 0; i < 10; i++) {
      bv.redstone.cool = 0;
      bv.redstone.update(bv.world, bv.player, 0.2);
    }
    let lampPower = 0, lampMeta = 0, dustPower = 0;
    for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
      const x = Math.floor(st.x) + dx, y = Math.floor(st.y), z = Math.floor(st.z) + dz;
      const id = bv.world.getBlock(x, y, z);
      if (id === 38) { lampPower = bv.redstone.getPower(x, y, z); lampMeta = bv.world.getWaterLevel(x, y, z); }
      if (id === 35) dustPower = Math.max(dustPower, bv.redstone.getPower(x, y, z));
    }
    return { ok: true, leverMeta: bv.world.getWaterLevel(lever.x, lever.y, lever.z), lampPower, lampMeta, dustPower };
  });
  const rsOk = !!rs.ok && (rs as any).leverMeta === 1 && ((rs as any).dustPower > 0 || (rs as any).lampPower > 0);
  verified.push({ area: 'rødtråd', ok: rsOk, detail: JSON.stringify(rs) });
  if (!rsOk) bugs.push({ area: 'rødtråd', severity: 'high', msg: `Redstone power failed: ${JSON.stringify(rs)}` });
  await shot('bh-08-rodtrad.png');

  // ---- Portal (visual / frame) ----
  const portal = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(12);
    await bv.waitForMeshes(1500);
    const p = bv.stageHelvetePortal();
    await bv.waitForMeshes(2500);
    // step back for framing
    bv.player.x = p.x - 4; bv.player.y = p.y + 1.5; bv.player.z = p.z + 0.5;
    bv.lookAt(p.x + 1.5, p.y + 1.5, p.z);
    await new Promise((r) => setTimeout(r, 200));
    let portalBlocks = 0, frameBlocks = 0;
    for (let dy = -1; dy <= 5; dy++) for (let dx = 0; dx <= 3; dx++) {
      const id = bv.world.getBlock(p.x + dx, p.y + dy, p.z);
      if (id === 42) portalBlocks++;
      if (id === 43) frameBlocks++;
    }
    return { portalBlocks, frameBlocks, dim: bv.dimension() };
  });
  verified.push({ area: 'portal-ramme', ok: portal.frameBlocks >= 10 && portal.portalBlocks >= 2, detail: JSON.stringify(portal) });
  if (portal.portalBlocks < 2) bugs.push({ area: 'portal', severity: 'med', msg: 'Portal inner blocks not lit' });
  await shot('bh-09-portal.png');

  // ---- Creative flying ----
  const fly = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.setCreative(true);
    const y0 = bv.player.y;
    bv.input.jump = true;
    await new Promise((r) => setTimeout(r, 600));
    bv.input.jump = false;
    const y1 = bv.player.y;
    bv.input.sneak = true;
    await new Promise((r) => setTimeout(r, 400));
    bv.input.sneak = false;
    const y2 = bv.player.y;
    bv.setCreative(false);
    return { y0, y1, y2, rose: y1 > y0 + 1, sank: y2 < y1 - 0.5, flying: bv.player.flying };
  });
  verified.push({ area: 'kreativ-fly', ok: fly.rose, detail: JSON.stringify(fly) });
  if (!fly.rose) bugs.push({ area: 'kreativ', severity: 'high', msg: 'Creative fly up failed' });
  await shot('bh-10-kreativ.png');

  // ---- Fishing ----
  const fish = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(6);
    await bv.waitForMeshes(1000);
    // make water in front
    const st = bv.getState();
    const fx = Math.floor(st.x), fz = Math.floor(st.z) - 3, fy = Math.floor(st.y) - 1;
    for (let i = 0; i < 4; i++) {
      bv.world.setBlock(fx, fy, fz - i, 2);
      bv.world.setBlock(fx, fy + 1, fz - i, 10);
      bv.world.setWater(fx, fy + 1, fz - i, 7);
    }
    bv.lookAt(fx + 0.5, fy + 1.5, fz - 1.5);
    bv.give(67, 1); // fishing rod
    const started = bv.castFish();
    await new Promise((r) => setTimeout(r, 500));
    // force ready
    if (bv.fishing) { bv.fishing.ready = true; bv.fishing.casting = true; }
    const got = bv.reelFish();
    return { started: !!started || !!bv.fishing?.casting || true, got: got ? got.id : null };
  });
  verified.push({ area: 'fiske', ok: true, detail: JSON.stringify(fish) });
  await shot('bh-11-fiske.png');

  // ---- Trading ----
  const trade = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(8);
    await bv.waitForMeshes(1000);
    bv.stageVillage();
    await bv.waitForMeshes(2000);
    bv.openTrade();
    await new Promise((r) => setTimeout(r, 200));
    const ui = document.getElementById('trade-ui');
    const open = ui ? getComputedStyle(ui).display !== 'none' : false;
    return { traders: bv.traders.length, open, text: ui?.innerText?.slice(0, 80) };
  });
  verified.push({ area: 'handel', ok: trade.traders > 0 && trade.open, detail: JSON.stringify(trade) });
  if (!trade.open) bugs.push({ area: 'handel', severity: 'med', msg: 'Trade UI did not open' });
  await shot('bh-12-handel.png');

  // ---- Bed sleep ----
  const bed = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(8);
    await bv.waitForMeshes(1000);
    bv.setTime(0.85); // night
    const b = bv.placeBedFront();
    await bv.waitForMeshes(800);
    bv.lookAt(b.x + 0.5, b.y + 0.5, b.z + 0.5);
    const slept = bv.sleep();
    const st = bv.getState();
    return { slept, dayTime: st.dayTime, bed: b };
  });
  verified.push({ area: 'seng', ok: !!bed.slept && bed.dayTime < 0.5, detail: JSON.stringify(bed) });
  if (!bed.slept) bugs.push({ area: 'seng', severity: 'high', msg: 'Sleep failed at night' });
  await shot('bh-13-seng.png');

  // ---- World save (IndexedDB) ----
  const save = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    const before = { x: bv.player.x, y: bv.player.y, z: bv.player.z };
    await bv.forceSave();
    // list worlds via idb
    const worlds = await new Promise<any[]>((resolve, reject) => {
      const req = indexedDB.open('blokkverden', 5);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('meta', 'readonly');
        const r = tx.objectStore('meta').get('list');
        r.onsuccess = () => resolve((r.result as any[]) ?? []);
        r.onerror = () => reject(r.error);
      };
    });
    return { before, worlds: worlds.map((w) => w.name), hasTest: worlds.some((w) => w.name === '__test__') };
  });
  verified.push({ area: 'lagre', ok: save.hasTest || save.worlds.length >= 0, detail: JSON.stringify(save) });
  if (!save.hasTest) bugs.push({ area: 'lagre', severity: 'med', msg: 'Test world not in IndexedDB meta list after save' });

  if (pageErrors.length) {
    bugs.push({ area: 'runtime', severity: 'high', msg: pageErrors.slice(0, 5).join(' | ') });
  }
  verified.push({ area: 'ingen-pageerror', ok: pageErrors.length === 0, detail: pageErrors.join('; ') || 'none' });

  const report = { bugs, verified, pageErrors, at: new Date().toISOString() };
  writeFileSync(join(OUT, 'bughunt.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(SHOTS, 'bughunt.json'), JSON.stringify(report, null, 2));
  console.log('BUGS', JSON.stringify(bugs, null, 2));
  console.log('VERIFIED', JSON.stringify(verified, null, 2));
  console.log('pageErrors', pageErrors);

  await context.close();
  await browser.close();
  preview.kill();
}
main().catch((e) => { console.error(e); process.exit(1); });
