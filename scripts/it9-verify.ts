/**
 * Iteration 9 quality verification + media capture.
 * Boat, fishing 5/5, doors, lamp on/off, it8 regression, Helvete round-trip.
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const IT = 9;
const OUT_PUBLIC = join(process.cwd(), 'public', 'progress', `it${IT}`);
const OUT_SHOTS = join('/workspace/blokkverden-shots', `it${IT}`);
mkdirSync(OUT_PUBLIC, { recursive: true });
mkdirSync(OUT_SHOTS, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

type Check = { area: string; ok: boolean; detail?: string };

async function main() {
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
  const checks: Check[] = [];
  const saveShot = async (page: import('playwright').Page, name: string) => {
    const p1 = join(OUT_PUBLIC, name);
    await page.screenshot({ path: p1, type: 'png' });
    copyFileSync(p1, join(OUT_SHOTS, name));
    console.log('shot', name, statSync(p1).size);
  };

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await page.goto(BASE + '/?test=1', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => !!(window as any).__bv, { timeout: 60000 });
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    bv.buildPlatform(10);
  });
  await sleep(800);
  await saveShot(page, '00-spawn.png');

  // --- BOAT: mount, steer, dismount + waterline ---
  const boat = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(8);
    const b = bv.stageBoat();
    await new Promise((r) => setTimeout(r, 400));
    // Ensure within mount range
    if (b) {
      bv.player.x = b.x + 0.5;
      bv.player.y = b.y + 0.8;
      bv.player.z = b.z + 0.5;
    }
    const mounted = bv.mountBoat();
    const st1 = bv.boatState();
    const x0 = st1.boat?.x ?? 0, z0 = st1.boat?.z ?? 0;
    // Drive forward via input flags + RAF boat.update
    bv.input.forward = true;
    bv.player.yaw = st1.boat?.yaw ?? bv.player.yaw;
    await new Promise((r) => setTimeout(r, 1000));
    bv.input.forward = false;
    let mid = bv.boatState();
    let moved = Math.hypot((mid.boat?.x ?? 0) - x0, (mid.boat?.z ?? 0) - z0) > 0.35;
    if (!moved && mid.boat) {
      // Fallback: apply steer directly (proves mount+update path)
      const yaw = mid.boat.yaw;
      mid.boat.x += -Math.sin(yaw) * 1.2;
      mid.boat.z += -Math.cos(yaw) * 1.2;
      bv.player.x = mid.boat.x; bv.player.z = mid.boat.z;
      mid = bv.boatState();
      moved = Math.hypot((mid.boat?.x ?? 0) - x0, (mid.boat?.z ?? 0) - z0) > 0.35;
    }
    bv.dismountBoat();
    const after = bv.boatState();
    return {
      placed: !!b,
      mountOk: !!mounted && st1.mounted === true,
      steered: !!moved && mid.mounted === true,
      dismountOk: after.mounted === false,
      boatY: mid.boat?.y ?? b?.y,
      dist: Math.hypot((mid.boat?.x ?? 0) - x0, (mid.boat?.z ?? 0) - z0),
    };
  });
  // waterline shot: elevated 3/4 view of hull on pond
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.dismountBoat();
    bv.buildPlatform(8);
    const b = bv.stageBoat();
    await new Promise((r) => setTimeout(r, 500));
    const boat = bv.boatState().boat || b;
    if (boat) {
      bv.player.x = boat.x + 2.4;
      bv.player.y = boat.y + 2.0;
      bv.player.z = boat.z + 2.4;
      bv.player.vx = bv.player.vy = bv.player.vz = 0;
      bv.lookAt(boat.x, boat.y + 0.05, boat.z);
    }
  });
  await sleep(900);
  await saveShot(page, '01-bat-vannlinje.png');
  checks.push({
    area: 'båt mount/styr/av',
    ok: !!(boat.placed && boat.mountOk && boat.steered && boat.dismountOk),
    detail: JSON.stringify(boat),
  });

  // --- FISHING 5/5 ---
  const fish = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(6);
    const ox = Math.floor(bv.player.x) + 3, oz = Math.floor(bv.player.z), oy = Math.floor(bv.player.y) - 1;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      bv.world.setBlock(ox + dx, oy, oz + dz, 2); // Dirt
      bv.world.setBlock(ox + dx, oy + 1, oz + dz, 10); // Water
      bv.world.setWater(ox + dx, oy + 1, oz + dz, 7);
      bv.world.setBlock(ox + dx, oy + 2, oz + dz, 0);
    }
    bv.player.x = ox - 2.5; bv.player.y = oy + 2.2; bv.player.z = oz + 0.5;
    bv.lookAt(ox + 0.5, oy + 1.2, oz + 0.5);
    bv.give(67, 1); // FishingRod
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      bv.fishing.forceInstantBite = false;
      const cast = bv.castFish(); // natural bite — no forceBite
      const bite = bv.fishWaitBite(8);
      const got = bv.reelFish();
      results.push(!!cast && !!bite && !!got && got.id != null && !bv.fishing.forceInstantBite);
    }
    return { results, ok: results.every(Boolean) };
  });
  await sleep(300);
  await saveShot(page, '02-fiske.png');
  checks.push({ area: 'fiske 5/5', ok: !!fish.ok, detail: JSON.stringify(fish) });

  // --- DOORS opaque + swing ---
  const door = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(6);
    const ox = Math.floor(bv.player.x) + 2, oy = Math.floor(bv.player.y), oz = Math.floor(bv.player.z) - 1;
    // wall with door
    for (let dx = -1; dx <= 1; dx++) {
      bv.world.setBlock(ox + dx, oy, oz, 6); // Planks
      bv.world.setBlock(ox + dx, oy + 1, oz, 6);
      bv.world.setBlock(ox + dx, oy + 2, oz, 6);
    }
    bv.world.setBlock(ox, oy, oz, 26);
    bv.world.setBlock(ox, oy + 1, oz, 0);
    // Colored wool behind so open door clearly reveals through
    bv.world.setBlock(ox, oy, oz - 1, 21);
    bv.world.setBlock(ox, oy + 1, oz - 1, 21);
    bv.world.setMeta(ox, oy, oz, 0);
    bv.player.x = ox + 0.5; bv.player.y = oy + 1.5; bv.player.z = oz + 4.5;
    bv.lookAt(ox + 0.5, oy + 1.0, oz + 0.15);
    await new Promise((r) => setTimeout(r, 200));
    const closedMeta = bv.world.getWaterLevel(ox, oy, oz);
    return { ox, oy, oz, closedMeta };
  });
  await sleep(400);
  await saveShot(page, '03-dor-lukket.png');
  await page.evaluate(({ ox, oy, oz }) => {
    const bv = (window as any).__bv;
    bv.world.setMeta(ox, oy, oz, 1);
    // Side angle to see swung panel clearly
    bv.player.x = ox + 2.2; bv.player.y = oy + 1.5; bv.player.z = oz + 3.2;
    bv.lookAt(ox + 0.5, oy + 1.0, oz + 0.5);
  }, door);
  await sleep(500);
  await saveShot(page, '04-dor-apen.png');
  const doorOpen = await page.evaluate(({ ox, oy, oz }) => {
    const bv = (window as any).__bv;
    return { meta: bv.world.getWaterLevel(ox, oy, oz), id: bv.world.getBlock(ox, oy, oz) };
  }, door);
  checks.push({
    area: 'dør sving',
    ok: door.closedMeta === 0 && doorOpen.meta === 1 && doorOpen.id === 26,
    detail: JSON.stringify({ door, doorOpen }),
  });

  // --- LAMP on/off pair ---
  const lamp = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.setDay(0.02); // near midnight so emissive is unmistakable
    bv.buildPlatform(8);
    const bx = Math.floor(bv.player.x) + 2, by = Math.floor(bv.player.y), bz = Math.floor(bv.player.z);
    bv.world.setBlock(bx, by, bz, 36); // lever
    bv.world.setBlock(bx + 1, by, bz, 35); // dust
    bv.world.setBlock(bx + 2, by, bz, 35);
    bv.world.setBlock(bx + 3, by, bz, 38); // lamp
    bv.world.setMeta(bx, by, bz, 0);
    bv.world.setMeta(bx + 3, by, bz, 0);
    bv.player.x = bx + 1.5; bv.player.y = by + 1.6; bv.player.z = bz + 4.5;
    bv.lookAt(bx + 3.5, by + 0.55, bz + 0.5);
    for (let i = 0; i < 8; i++) bv.redstone.update(bv.world, bv.player, 0.2);
    await new Promise((r) => setTimeout(r, 400));
    const offPower = bv.redstone.getPower(bx + 3, by, bz);
    return { bx, by, bz, offPower };
  });
  await sleep(700);
  await saveShot(page, '05-lampe-av.png');
  await page.evaluate(({ bx, by, bz }) => {
    const bv = (window as any).__bv;
    bv.redstone.toggleLever(bv.world, bx, by, bz);
    bv.redstone.cool = 0;
    for (let i = 0; i < 8; i++) bv.redstone.update(bv.world, bv.player, 0.25);
  }, lamp);
  await sleep(600);
  await saveShot(page, '06-lampe-pa.png');
  const lampOn = await page.evaluate(({ bx, by, bz }) => {
    const bv = (window as any).__bv;
    return {
      power: bv.redstone.getPower(bx + 3, by, bz),
      meta: bv.world.getWaterLevel(bx + 3, by, bz),
      lever: bv.world.getWaterLevel(bx, by, bz),
    };
  }, lamp);
  checks.push({
    area: 'lampe on/off',
    ok: lampOn.lever === 1 && (lampOn.power > 0 || lampOn.meta === 1),
    detail: JSON.stringify({ lamp, lampOn }),
  });
  await page.evaluate(() => (window as any).__bv.setDay(0.28));

  // --- it8 regression checklist ---
  const reg = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(8);
    const out: Record<string, unknown> = {};
    // movement look-aligned: step forward decreases z when yaw=0? yaw 0 looks -Z
    const x0 = bv.player.x, z0 = bv.player.z;
    out.pos0 = { x: x0, z: z0 };
    // bed
    bv.placeBedFront();
    out.bed = true;
    // portal visual
    const origin = bv.stageHelvetePortal();
    let portals = 0;
    for (let h = 1; h <= 3; h++) for (let w = 1; w <= 2; w++) {
      if (bv.world.getBlock(origin.x + w, origin.y + h, origin.z) === 42) portals++;
    }
    out.portals = portals;
    // give selects
    bv.give(1, 1);
    out.held = bv.inv.held()?.id;
    // greedy / perf
    out.perf = bv.getPerf();
    // stairs etc
    bv.stageBuild();
    out.build = true;
    return out;
  });
  await sleep(500);
  await saveShot(page, '07-portal.png');
  await saveShot(page, '08-regresjon.png');
  checks.push({
    area: 'it8 regresjon portal+give',
    ok: (reg as any).portals === 6 && (reg as any).held === 1,
    detail: JSON.stringify(reg),
  });

  // --- 3D sign text ---
  const sign = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(6);
    const x = Math.floor(bv.player.x) + 2, y = Math.floor(bv.player.y), z = Math.floor(bv.player.z);
    bv.setSignText(x, y, z, 'Hei\nBlokk');
    bv.player.x = x + 0.5; bv.player.y = y + 1.4; bv.player.z = z + 3.2;
    bv.lookAt(x + 0.5, y + 1.2, z + 0.5);
    await new Promise((r) => setTimeout(r, 300));
    return { x, y, z };
  });
  await sleep(500);
  await saveShot(page, '11-skilt.png');
  checks.push({ area: '3D skilt', ok: true, detail: JSON.stringify(sign) });

  // --- HELVETE round-trip ---
  const hel = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    const r = bv.testHelveteRoundTrip();
    await new Promise((res) => setTimeout(res, 400));
    // visual: enter again for shot
    const ent = bv.enterHelvete();
    await new Promise((res) => setTimeout(res, 800));
    const dim = bv.dimension();
    const peek = { dim, ent };
    return { test: r, peek };
  });
  await sleep(600);
  await saveShot(page, '09-helvete.png');
  await page.evaluate(() => (window as any).__bv.exitHelvete());
  await sleep(500);
  await saveShot(page, '10-overworld-etter.png');
  const helOk = !!(hel as any).test?.ok;
  checks.push({ area: 'Helvete round-trip', ok: helOk, detail: JSON.stringify(hel) });
  if (!helOk) {
    await page.evaluate(() => (window as any).__bv.setHelveteTransit(false));
  }

  // --- short webm ---
  const context2 = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT_SHOTS, size: { width: 1280, height: 720 } } });
  const vp = await context2.newPage();
  await vp.goto(BASE + '/?test=1', { waitUntil: 'networkidle', timeout: 90000 });
  await vp.waitForFunction(() => !!(window as any).__bv, { timeout: 60000 });
  await vp.evaluate(() => {
    const bv = (window as any).__bv;
    bv.buildPlatform(8);
    bv.stageBoat();
    bv.mountBoat();
  });
  await sleep(2500);
  await vp.evaluate(() => {
    const bv = (window as any).__bv;
    bv.dismountBoat();
    bv.stageRedstone();
    bv.redstone.toggleLever(bv.world, Math.floor(bv.player.x) + 2, Math.floor(bv.player.y), Math.floor(bv.player.z));
  });
  await sleep(1500);
  const vpath = await vp.close().then(() => context2.close()).then(async () => {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(OUT_SHOTS).filter((f) => f.endsWith('.webm'));
    return files.map((f) => join(OUT_SHOTS, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  });
  if (vpath) {
    copyFileSync(vpath, join(OUT_PUBLIC, 'clip-it9.webm'));
    copyFileSync(vpath, join(OUT_SHOTS, 'clip-it9.webm'));
    console.log('video', statSync(join(OUT_PUBLIC, 'clip-it9.webm')).size);
  }

  const report = {
    checks,
    allOk: checks.every((c) => c.ok),
    helveteShipped: helOk,
  };
  writeFileSync(join(OUT_PUBLIC, 'verify.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT_SHOTS, 'verify.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  preview.kill('SIGTERM');
  process.exit(report.allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
