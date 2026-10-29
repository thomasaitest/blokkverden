import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const IT = Number(process.env.IT || 7);
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

  const openGame = async (record = false) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ...(record ? { recordVideo: { dir: OUT_PUBLIC, size: { width: 1280, height: 720 } } } : {}),
    });
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
    // verify hint hidden
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
    await context.close();
  }

  const { context, page } = await openGame(false);

  // Perf before (merge off) / after (merge on)
  const perf = await page.evaluate(`(async () => {
    const bv = window.__bv;
    async function sample() {
      bv.input.forward = true; bv.input.sprint = true;
      const samples = [];
      let lastPerf = bv.getPerf();
      for (let i = 0; i < 6; i++) {
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
    const before = await sample();
    bv.setSectorMerge(true);
    await new Promise((r) => setTimeout(r, 2500));
    const after = await sample();
    return { before, after };
  })()`);
  console.log('perf', JSON.stringify(perf));

  // 01 spawn no hint
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.setTime(0.32); bv.look(0.5, -0.3);
    await bv.waitForMeshes(1000);
  });
  await sleep(300);
  await saveShot(page, '01-spawn.png');

  // 02 detailed mob skins
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.clearMobs();
    bv.buildPlatform(12);
    await bv.waitForMeshes(2000);
    const st = bv.getState();
    for (let z = -10; z <= -1; z++) for (let x = -8; x <= 8; x++) for (let y = 0; y < 6; y++)
      bv.world.setBlock(Math.floor(st.x) + x, Math.floor(st.y) + y, Math.floor(st.z) + z, 0);
    await bv.waitForMeshes(2000);
    bv.look(0, -0.15);
    bv.stageMobs();
    await new Promise((r) => setTimeout(r, 700));
  });
  await sleep(400);
  await saveShot(page, '02-mobs-skins.png');

  // 03 combat
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.clearMobs();
    bv.give(111, 1);
    const m = bv.spawnMob('vandrer', 0, 0, -4);
    bv.spawnMob('gris', 2.2, 0, -4.5);
    bv.lookAt(m.x, m.y + 1, m.z);
    for (let i = 0; i < 4; i++) { bv.attack(); await new Promise((r) => setTimeout(r, 100)); }
  });
  await sleep(250);
  await saveShot(page, '03-kamp.png');

  // 04 boat framed
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.clearMobs();
    bv.buildPlatform(8);
    await bv.waitForMeshes(1500);
    const b = bv.stageBoat();
    await bv.waitForMeshes(2000);
    await new Promise((r) => setTimeout(r, 400));
  });
  await sleep(400);
  await saveShot(page, '04-bat.png');

  // 05 redstone
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(8);
    await bv.waitForMeshes(1500);
    bv.stageRedstone();
    await bv.waitForMeshes(2000);
  });
  await sleep(400);
  await saveShot(page, '05-rodtrad.png');

  // 06 build blocks
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.stageBuild();
    await bv.waitForMeshes(2000);
  });
  await sleep(400);
  await saveShot(page, '06-byggeklosser.png');

  // 07 helvete portal
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.buildPlatform(10);
    await bv.waitForMeshes(1500);
    bv.stageHelvetePortal();
    await bv.waitForMeshes(2500);
  });
  await sleep(400);
  await saveShot(page, '07-helvete-portal.png');

  // 08 creative
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.setCreative(true);
    bv.setTime(0.35);
    bv.look(0.4, -0.3);
  });
  await sleep(300);
  await saveShot(page, '08-kreativ.png');

  // 09 weather + toast
  await page.evaluate(async () => {
    const bv = (window as any).__bv;
    bv.setCreative(false);
    bv.setWeather('rain', 1);
    bv.toast('first_block');
    await new Promise((r) => setTimeout(r, 400));
  });
  await sleep(400);
  await saveShot(page, '09-regn-toast.png');

  // 10 pause
  await page.evaluate(() => (window as any).__bv.showPause());
  await sleep(300);
  await saveShot(page, '10-pause.png');
  await page.evaluate(() => (window as any).__bv.hidePause());

  writeFileSync(join(OUT_PUBLIC, 'playtest-state.json'), JSON.stringify({ perf, hint: 'checked' }, null, 2));

  // video
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
    bv.stageMobs();
    bv.setWeather('rain', 0.8);
    bv.input.forward = true;
    for (let i = 0; i < 35; i++) {
      if (i % 10 === 0) bv.attack();
      bv.player.yaw += 0.03;
      await new Promise((r) => setTimeout(r, 100));
    }
    bv.input.forward = false;
    bv.stageBoat();
  });
  await sleep(500);
  const video = vp.video();
  await vp.close(); await vctx.close();
  if (video) {
    const raw = await video.path();
    copyFileSync(raw, join(OUT_PUBLIC, 'clip-it7.webm'));
    copyFileSync(raw, join(OUT_SHOTS, 'clip-it7.webm'));
    console.log('video', statSync(join(OUT_PUBLIC, 'clip-it7.webm')).size);
  }

  await context.close();
  await browser.close();
  preview.kill();
  console.log('done');
}
main().catch((e) => { console.error(e); process.exit(1); });
