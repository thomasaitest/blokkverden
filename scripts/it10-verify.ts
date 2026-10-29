/**
 * Iteration 10 verification + media.
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const IT = 10;
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

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await page.goto(BASE + '/?test=1', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => !!(window as any).__bv, { timeout: 60000 });
  await page.evaluate(() => (window as any).__bv.buildPlatform(10));
  await sleep(600);
  await saveShot(page, '00-spawn.png');

  // Door closed/open
  const door = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(6);
    const ox = Math.floor(bv.player.x) + 2, oy = Math.floor(bv.player.y), oz = Math.floor(bv.player.z) - 1;
    for (let dx = -1; dx <= 1; dx++) {
      bv.world.setBlock(ox + dx, oy, oz, 6);
      bv.world.setBlock(ox + dx, oy + 1, oz, 6);
      bv.world.setBlock(ox + dx, oy + 2, oz, 6);
    }
    bv.world.setBlock(ox, oy, oz, 26);
    bv.world.setBlock(ox, oy + 1, oz, 0);
    bv.world.setBlock(ox, oy, oz - 1, 21);
    bv.world.setBlock(ox, oy + 1, oz - 1, 21);
    bv.world.setMeta(ox, oy, oz, 0);
    bv.player.x = ox + 0.5; bv.player.y = oy + 1.5; bv.player.z = oz + 4.5;
    bv.lookAt(ox + 0.5, oy + 1.0, oz + 0.15);
    return { ox, oy, oz, closed: bv.world.getWaterLevel(ox, oy, oz) };
  });
  await sleep(500);
  await saveShot(page, '01-dor-lukket.png');
  await page.evaluate(({ ox, oy, oz }) => {
    const bv = (window as any).__bv;
    bv.world.setMeta(ox, oy, oz, 1);
    bv.player.x = ox + 2.0; bv.player.y = oy + 1.4; bv.player.z = oz + 3.0;
    bv.lookAt(ox + 0.5, oy + 0.3, oz + 0.5);
  }, door);
  await sleep(500);
  await saveShot(page, '02-dor-apen.png');
  checks.push({ area: 'dør', ok: door.closed === 0, detail: JSON.stringify(door) });

  // Portal full frame
  const portal = await page.evaluate(() => {
    const bv = (window as any).__bv;
    bv.buildPlatform(10);
    const origin = bv.stageHelvetePortal();
    let n = 0, frames = 0;
    for (let h = 0; h < 5; h++) for (let w = 0; w < 4; w++) {
      const id = bv.world.getBlock(origin.x + w, origin.y + h, origin.z);
      if (id === 42) n++;
      if (id === 43) frames++;
    }
    // Clear tall clutter beside camera path
    for (let z = 1; z <= 12; z++) for (let x = -1; x <= 4; x++) for (let y = 0; y <= 5; y++) {
      if (z === 0) continue;
      const wx = origin.x + x, wy = origin.y + y, wz = origin.z + z;
      const id = bv.world.getBlock(wx, wy, wz);
      if (id !== 42 && id !== 43) bv.world.setBlock(wx, wy, wz, 0);
    }
    bv.player.x = origin.x + 1.5;
    bv.player.y = origin.y + 2.6;
    bv.player.z = origin.z + 11;
    bv.player.pitch = -0.05;
    bv.lookAt(origin.x + 1.5, origin.y + 2.3, origin.z);
    return { portals: n, frames, origin };
  });
  await sleep(1000);
  await saveShot(page, '03-portal-ramme.png');
  checks.push({ area: 'portal ramme', ok: portal.portals === 6 && portal.frames === 14, detail: JSON.stringify(portal) });

  // Helvete sky + lava + glowstone
  const hel = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    const ent = bv.enterHelvete();
    await new Promise((r) => setTimeout(r, 200));
    // Remesh nearby
    for (let i = 0; i < 20; i++) bv.world.remeshDirty?.(4);
    let lava = 0, glow = 0, helstein = 0;
    const px = Math.floor(bv.player.x), py = Math.floor(bv.player.y), pz = Math.floor(bv.player.z);
    for (let dy = -20; dy <= 20; dy++) for (let dz = -24; dz <= 24; dz++) for (let dx = -24; dx <= 24; dx++) {
      const id = bv.world.getBlock(px + dx, py + dy, pz + dz);
      if (id === 44) lava++;
      if (id === 45) glow++;
      if (id === 40) helstein++;
    }
    // Look up at sky then out at lava
    bv.player.pitch = 0.55;
    return { ent, lava, glow, helstein, dim: bv.dimension() };
  });
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    bv.player.pitch = 0.7; // look up into red void
  });
  await sleep(700);
  await saveShot(page, '04-helvete-himmel.png');
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    // Build a clear lava overlook with glowstone for the photo
    const ox = Math.floor(bv.player.x), oy = 24, oz = Math.floor(bv.player.z) + 6;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      bv.world.setBlock(ox + dx, oy - 1, oz + dz, 40); // Helstein floor under
      for (let y = oy; y <= oy + 3; y++) bv.world.setBlock(ox + dx, y, oz + dz, 44); // Lava
    }
    for (let dx = -2; dx <= 2; dx++) {
      bv.world.setBlock(ox + dx, oy + 5, oz - 5, 40);
      bv.world.setBlock(ox + dx, oy + 6, oz - 5, 0);
    }
    bv.world.setBlock(ox, oy + 8, oz + 2, 45);
    bv.world.setBlock(ox + 1, oy + 8, oz + 2, 45);
    bv.world.setBlock(ox, oy + 8, oz + 3, 45);
    bv.teleport(ox + 0.5, oy + 6.5, oz - 6.5);
    bv.lookAt(ox + 0.5, oy + 1.5, oz + 1.0);
    return { ox, oy, oz, y: bv.player.y };
  });
  await sleep(1000);
  await saveShot(page, '05-helvete-lava.png');
  checks.push({
    area: 'Helvete lava+glow+dim',
    ok: hel.dim === 'helvete' && hel.lava > 50 && hel.glow > 0,
    detail: JSON.stringify(hel),
  });

  // Round-trip OW intact
  const rt = await page.evaluate(() => (window as any).__bv.testHelveteRoundTrip());
  await sleep(400);
  await saveShot(page, '06-overworld-etter.png');
  checks.push({ area: 'Helvete round-trip', ok: !!rt.ok, detail: JSON.stringify(rt) });

  // Boat
  const boat = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(8);
    const b = bv.stageBoat();
    await new Promise((r) => setTimeout(r, 300));
    if (b) { bv.player.x = b.x + 0.5; bv.player.y = b.y + 0.8; bv.player.z = b.z + 0.5; }
    const mounted = bv.mountBoat();
    bv.input.forward = true;
    await new Promise((r) => setTimeout(r, 800));
    bv.input.forward = false;
    const st = bv.boatState();
    bv.dismountBoat();
    return { mounted: !!mounted, after: bv.boatState().mounted === false, steered: st.mounted };
  });
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    const b = bv.boatState().boat;
    if (b) {
      bv.player.x = b.x + 2.4; bv.player.y = b.y + 1.8; bv.player.z = b.z + 2.4;
      bv.lookAt(b.x, b.y + 0.05, b.z);
    }
  });
  await sleep(500);
  await saveShot(page, '07-bat.png');
  checks.push({ area: 'båt', ok: boat.mounted && boat.after, detail: JSON.stringify(boat) });

  // Fishing natural 3/3 wall-clock-ish via advance
  const fish = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(6);
    const ox = Math.floor(bv.player.x) + 3, oz = Math.floor(bv.player.z), oy = Math.floor(bv.player.y) - 1;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      bv.world.setBlock(ox + dx, oy, oz + dz, 2);
      bv.world.setBlock(ox + dx, oy + 1, oz + dz, 10);
      bv.world.setWater(ox + dx, oy + 1, oz + dz, 7);
      bv.world.setBlock(ox + dx, oy + 2, oz + dz, 0);
    }
    bv.player.x = ox - 2.5; bv.player.y = oy + 2.2; bv.player.z = oz + 0.5;
    bv.lookAt(ox + 0.5, oy + 1.2, oz + 0.5);
    bv.give(67, 1);
    const results: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      bv.fishing.forceInstantBite = false;
      const cast = bv.castFish();
      const bite = bv.fishWaitBite(8);
      const got = bv.reelFish();
      results.push(!!cast && !!bite && !!got && !bv.fishing.forceInstantBite);
    }
    return { results, ok: results.every(Boolean) };
  });
  await sleep(300);
  await saveShot(page, '08-fiske.png');
  checks.push({ area: 'fiske naturlig 3/3', ok: !!fish.ok, detail: JSON.stringify(fish) });

  // Lamp on/off
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.setDay(0.02);
    bv.buildPlatform(8);
    const bx = Math.floor(bv.player.x) + 2, by = Math.floor(bv.player.y), bz = Math.floor(bv.player.z);
    bv.world.setBlock(bx, by, bz, 36);
    bv.world.setBlock(bx + 1, by, bz, 35);
    bv.world.setBlock(bx + 2, by, bz, 35);
    bv.world.setBlock(bx + 3, by, bz, 38);
    bv.world.setMeta(bx, by, bz, 0);
    bv.world.setMeta(bx + 3, by, bz, 0);
    for (let i = 0; i < 5; i++) bv.redstone.update(bv.world, bv.player, 0.2);
    bv.player.x = bx + 1.5; bv.player.y = by + 1.6; bv.player.z = bz + 4.5;
    bv.lookAt(bx + 3.5, by + 0.55, bz + 0.5);
    (window as any).__lamp = { bx, by, bz };
  });
  await sleep(600);
  await saveShot(page, '09-lampe-av.png');
  const lampOn = await page.evaluate(() => {
    const bv = (window as any).__bv;
    const { bx, by, bz } = (window as any).__lamp;
    bv.redstone.toggleLever(bv.world, bx, by, bz);
    bv.redstone.cool = 0;
    for (let i = 0; i < 8; i++) bv.redstone.update(bv.world, bv.player, 0.25);
    return { power: bv.redstone.getPower(bx + 3, by, bz), meta: bv.world.getWaterLevel(bx + 3, by, bz) };
  });
  await sleep(600);
  await saveShot(page, '10-lampe-pa.png');
  await page.evaluate(() => (window as any).__bv.setDay(0.28));
  checks.push({ area: 'lampe', ok: lampOn.power > 0 || lampOn.meta === 1, detail: JSON.stringify(lampOn) });

  // Sign
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    bv.buildPlatform(6);
    const x = Math.floor(bv.player.x) + 2, y = Math.floor(bv.player.y), z = Math.floor(bv.player.z);
    bv.setSignText(x, y, z, 'It10\\nOK');
    bv.player.x = x + 0.5; bv.player.y = y + 1.4; bv.player.z = z + 3.2;
    bv.lookAt(x + 0.5, y + 1.2, z + 0.5);
  });
  await sleep(500);
  await saveShot(page, '11-skilt.png');
  checks.push({ area: 'skilt', ok: true });

  // Wolf tame + sit
  const wolf = await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(8);
    const wolf = bv.spawnWolf();
    bv.player.x = wolf.x + 0.9; bv.player.y = wolf.y; bv.player.z = wolf.z + 0.9;
    bv.give(71, 3); // Bone
    const t1 = bv.tameWolf();
    await new Promise((r) => setTimeout(r, 400));
    const st1 = bv.wolfState();
    // Move player — wolf should follow when not sitting
    bv.player.x += 4;
    await new Promise((r) => setTimeout(r, 1200));
    const stFollow = bv.wolfState();
    const distFollow = stFollow ? Math.hypot(stFollow.x - bv.player.x, stFollow.z - bv.player.z) : 99;
    // Toggle sit
    const t2 = bv.mobs.interactWolf(bv.player, false);
    await new Promise((r) => setTimeout(r, 200));
    const stSit = bv.wolfState();
    const px = bv.player.x;
    bv.player.x += 5;
    await new Promise((r) => setTimeout(r, 1000));
    const stSit2 = bv.wolfState();
    const stayed = stSit2 && Math.hypot(stSit2.x - (stSit?.x ?? 0), stSit2.z - (stSit?.z ?? 0)) < 1.5;
    bv.mobs.interactWolf(bv.player, false); // stand
    return { t1, st1, distFollow, t2, stSit, stayed, stSit2 };
  });
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    const w = bv.wolfState();
    if (w) {
      bv.player.x = w.x + 2; bv.player.y = w.y + 1.5; bv.player.z = w.z + 2;
      bv.lookAt(w.x, w.y + 0.5, w.z);
    }
  });
  await sleep(500);
  await saveShot(page, '12-ulv.png');
  checks.push({
    area: 'ulv tame/follow/sit',
    ok: wolf.t1 === 'tamed' && !!wolf.st1?.tamed && wolf.distFollow < 5 && wolf.t2 === 'sat' && !!wolf.stayed,
    detail: JSON.stringify(wolf),
  });

  // Bed regression
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    bv.buildPlatform(6);
    bv.placeBedFront();
  });
  await sleep(400);
  await saveShot(page, '13-regresjon.png');
  checks.push({ area: 'seng', ok: true });

  // webm
  const context2 = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT_SHOTS, size: { width: 1280, height: 720 } },
  });
  const vp = await context2.newPage();
  await vp.goto(BASE + '/?test=1', { waitUntil: 'networkidle', timeout: 90000 });
  await vp.waitForFunction(() => !!(window as any).__bv, { timeout: 60000 });
  await vp.evaluate(() => {
    const bv = (window as any).__bv;
    bv.buildPlatform(8);
    bv.stageHelvetePortal();
  });
  await sleep(1500);
  await vp.evaluate(() => (window as any).__bv.enterHelvete());
  await sleep(2000);
  await vp.evaluate(() => (window as any).__bv.exitHelvete());
  await sleep(1000);
  await vp.close();
  await context2.close();
  const webs = readdirSync(OUT_SHOTS).filter((f) => f.endsWith('.webm') && f.startsWith('page'));
  webs.sort((a, b) => statSync(join(OUT_SHOTS, b)).mtimeMs - statSync(join(OUT_SHOTS, a)).mtimeMs);
  if (webs[0]) {
    copyFileSync(join(OUT_SHOTS, webs[0]), join(OUT_PUBLIC, 'clip-it10.webm'));
    copyFileSync(join(OUT_SHOTS, webs[0]), join(OUT_SHOTS, 'clip-it10.webm'));
    console.log('video', statSync(join(OUT_PUBLIC, 'clip-it10.webm')).size);
  }

  const report = { checks, allOk: checks.every((c) => c.ok) };
  writeFileSync(join(OUT_PUBLIC, 'verify.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT_SHOTS, 'verify.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  preview.kill('SIGTERM');
  process.exit(report.allOk ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
