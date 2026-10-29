import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const IT = Number(process.env.IT || 8);
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

async function main() {
  const PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}`;
  const preview: ChildProcess = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(), stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/')).ok) break; } catch {}
    await sleep(250);
  }
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const saveShot = async (page: import('playwright').Page, name: string) => {
    const p1 = join(OUT_PUBLIC, name);
    await page.screenshot({ path: p1, type: 'png' });
    copyFileSync(p1, join(OUT_SHOTS, name));
    console.log('shot', name, statSync(p1).size);
  };

  const openGame = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
    await page.goto(BASE + '/?test=1', { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForFunction(() => !!(window as any).__bv, { timeout: 60000 });
    await page.evaluate(async () => {
      const bv = (window as any).__bv;
      await bv.waitForMeshes(5000);
      bv.buildPlatform(12);
      await bv.waitForMeshes(4000);
      bv.setTime(0.32);
      bv.look(0.3, -0.25);
    });
    await sleep(600);
    const hintDisp = await page.evaluate(() => {
      const h = document.getElementById('hint');
      return h ? getComputedStyle(h).display : 'missing';
    });
    console.log('hint_display', hintDisp);
    return { context, page };
  };

  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('#title-screen', { timeout: 15000 });
    await sleep(300);
    await saveShot(page, '00-tittel.png');
    // world list
    await page.click('#btn-single');
    await sleep(400);
    await saveShot(page, '01-verdener.png');
    await context.close();
  }

  const { context, page } = await openGame();

  // Perf sample (greedy is always on in mesher now; sector merge toggle still useful)
  const perf = await page.evaluate(`(async () => {
    const bv = window.__bv;
    async function sample() {
      bv.input.forward = true; bv.input.sprint = true;
      const samples = [];
      let lastPerf = bv.getPerf();
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 400));
        samples.push(bv.getState().fps);
        lastPerf = bv.getPerf();
      }
      bv.input.forward = false; bv.input.sprint = false;
      samples.sort((a, b) => a - b);
      return { fps: samples[Math.floor(samples.length / 2)], perf: lastPerf };
    }
    bv.setSectorMerge(false);
    await bv.waitForMeshes(2000);
    await new Promise((r) => setTimeout(r, 800));
    const noMerge = await sample();
    bv.setSectorMerge(true);
    await new Promise((r) => setTimeout(r, 2500));
    const withMerge = await sample();
    return { noMerge, withMerge };
  })()`);
  console.log('perf', JSON.stringify(perf));

  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.setTime(0.32); bv.look(0.5, -0.3);
    await bv.waitForMeshes(1000);
  });
  await sleep(300);
  await saveShot(page, '02-spawn.png');

  // Movement / break / place
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(10);
    await bv.waitForMeshes(1500);
    const st = bv.getState();
    const tx = Math.floor(st.x), ty = Math.floor(st.y), tz = Math.floor(st.z) - 3;
    bv.world.setBlock(tx, ty, tz, 3);
    await bv.waitForMeshes(800);
    bv.lookAt(tx + 0.5, ty + 0.5, tz + 0.5);
    bv.give(104, 1);
    bv.breakLooking();
    await bv.waitForMeshes(800);
    bv.give(4, 16);
    bv.lookAt(tx + 0.5, ty + 0.2, tz + 0.5);
    // place on ground in front
    const gx = tx, gy = ty - 1, gz = tz;
    bv.world.setBlock(gx, gy + 1, gz, 4);
    await bv.waitForMeshes(800);
    bv.lookAt(gx + 0.5, gy + 1.5, gz + 0.5);
  });
  await sleep(300);
  await saveShot(page, '03-knus-plasser.png');

  // Mobs combat
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.clearMobs();
    bv.buildPlatform(10);
    await bv.waitForMeshes(1500);
    bv.give(111, 1);
    const m = bv.spawnMob('vandrer', 0, 0, -4);
    bv.spawnMob('gris', 2, 0, -4);
    bv.lookAt(m.x, m.y + 1, m.z);
    for (let i = 0; i < 4; i++) { bv.attack(); await new Promise((r) => setTimeout(r, 100)); }
  });
  await sleep(300);
  await saveShot(page, '04-kamp.png');

  // Boat
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.clearMobs();
    bv.buildPlatform(8);
    await bv.waitForMeshes(1500);
    bv.stageBoat();
    await bv.waitForMeshes(2000);
  });
  await sleep(400);
  await saveShot(page, '05-bat.png');

  // Doors stairs ladders
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(10);
    await bv.waitForMeshes(1200);
    bv.stageBuild();
    await bv.waitForMeshes(2000);
    // open door via meta
    const st = bv.getState();
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      const x = Math.floor(st.x) + dx, y = Math.floor(st.y), z = Math.floor(st.z) + dz;
      if (bv.world.getBlock(x, y, z) === 26) bv.world.setMeta(x, y, z, 1);
    }
    await bv.waitForMeshes(1000);
  });
  await sleep(300);
  await saveShot(page, '06-dor-trapp-stige.png');

  // Redstone powered visible
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(10);
    await bv.waitForMeshes(1500);
    bv.look(0, -0.25);
    bv.stageRedstone();
    await bv.waitForMeshes(1500);
    const st = bv.getState();
    for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
      const x = Math.floor(st.x) + dx, y = Math.floor(st.y), z = Math.floor(st.z) + dz;
      if (bv.world.getBlock(x, y, z) === 36) {
        bv.redstone.toggleLever(bv.world, x, y, z);
      }
    }
    for (let i = 0; i < 12; i++) {
      bv.redstone.cool = 0;
      bv.redstone.update(bv.world, bv.player, 0.2);
    }
    // apply dust meta + remesh
    for (const d of bv.redstone.lastPoweredDust) {
      bv.world.setMeta(d.x, d.y, d.z, Math.min(15, d.p));
    }
    await bv.forceRemeshAround();
    await new Promise((r) => setTimeout(r, 400));
  });
  await sleep(400);
  await saveShot(page, '07-rodtrad-strom.png');

  // Portal framed far
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(14);
    await bv.waitForMeshes(1500);
    bv.stageHelvetePortal();
    await bv.waitForMeshes(3000);
  });
  await sleep(500);
  await saveShot(page, '08-portal.png');

  // Bed sleep
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(8);
    await bv.waitForMeshes(1200);
    bv.setTime(0.85);
    const b = bv.placeBedFront();
    await bv.waitForMeshes(800);
    bv.lookAt(b.x + 0.5, b.y + 0.5, b.z + 0.5);
    bv.sleep();
    await new Promise((r) => setTimeout(r, 300));
  });
  await sleep(300);
  await saveShot(page, '09-seng.png');

  // Creative fly
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.setCreative(true);
    bv.setTime(0.35);
    bv.input.jump = true;
    await new Promise((r) => setTimeout(r, 500));
    bv.input.jump = false;
    bv.look(0.4, -0.5);
  });
  await sleep(300);
  await saveShot(page, '10-kreativ.png');

  // Trading
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.setCreative(false);
    bv.buildPlatform(8);
    await bv.waitForMeshes(1200);
    bv.stageVillage();
    await bv.waitForMeshes(2000);
    bv.openTrade();
  });
  await sleep(400);
  await saveShot(page, '11-handel.png');

  writeFileSync(join(OUT_PUBLIC, 'playtest-state.json'), JSON.stringify({ perf, hint: 'checked' }, null, 2));
  copyFileSync(join(OUT_PUBLIC, 'playtest-state.json'), join(OUT_SHOTS, 'playtest-state.json'));

  // video clip
  const vctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT_PUBLIC, size: { width: 1280, height: 720 } },
  });
  const vp = await vctx.newPage();
  await vp.goto(BASE + '/?test=1', { waitUntil: 'networkidle', timeout: 90000 });
  await vp.waitForFunction(() => !!(window as any).__bv, { timeout: 60000 });
  await vp.evaluate(async () => {
    const bv = (window as any).__bv;
    await bv.waitForMeshes(4000);
    bv.buildPlatform(10);
    await bv.waitForMeshes(3000);
    bv.stageRedstone();
    const st = bv.getState();
    for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
      const x = Math.floor(st.x) + dx, y = Math.floor(st.y), z = Math.floor(st.z) + dz;
      if (bv.world.getBlock(x, y, z) === 36) bv.redstone.toggleLever(bv.world, x, y, z);
    }
    for (let i = 0; i < 8; i++) { bv.redstone.cool = 0; bv.redstone.update(bv.world, bv.player, 0.2); }
    await bv.forceRemeshAround();
    bv.input.forward = true;
    for (let i = 0; i < 25; i++) {
      bv.player.yaw += 0.04;
      await new Promise((r) => setTimeout(r, 100));
    }
    bv.input.forward = false;
    bv.stageHelvetePortal();
    await bv.waitForMeshes(2000);
  });
  await sleep(600);
  const video = vp.video();
  await vp.close(); await vctx.close();
  if (video) {
    const raw = await video.path();
    copyFileSync(raw, join(OUT_PUBLIC, 'clip-it8.webm'));
    copyFileSync(raw, join(OUT_SHOTS, 'clip-it8.webm'));
    console.log('video', statSync(join(OUT_PUBLIC, 'clip-it8.webm')).size);
  }

  await context.close();
  await browser.close();
  preview.kill();
  console.log('files', readdirSync(OUT_PUBLIC));
  console.log('done');
}
main().catch((e) => { console.error(e); process.exit(1); });
