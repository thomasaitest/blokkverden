import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, writeFileSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const IT = Number(process.env.IT || 5);
const OUT_PUBLIC = join(process.cwd(), 'public', 'progress', `it${IT}`);
const OUT_SHOTS = join('/workspace/blokkverden-shots', `it${IT}`);
mkdirSync(OUT_PUBLIC, { recursive: true });
mkdirSync(OUT_SHOTS, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type BV = {
  getState: () => { fps: number; chunks: number; meshes: number; dayTime: number; mobs: number; x: number; y: number; z: number; level: number };
  buildPlatform: (n?: number) => { x: number; y: number; z: number };
  waitForMeshes: (ms?: number) => Promise<boolean>;
  setTime: (t: number) => void;
  look: (y: number, p: number) => void;
  lookAt: (x: number, y: number, z: number) => void;
  clearMobs: () => void;
  spawnMob: (k: string, ox?: number, oy?: number, oz?: number) => { x: number; y: number; z: number };
  attack: () => boolean;
  shootBow: (c?: number) => void;
  give: (id: number, n?: number) => void;
  placeBedFront: () => { x: number; y: number; z: number };
  sleep: () => boolean;
  kill: () => void;
  respawn: () => void;
  stageFarm: () => void;
  placeBoatFront: () => unknown;
  placeEnchant: () => void;
  equipArmor: () => void;
  showPause: () => void;
  hidePause: () => void;
  teleport: (x: number, y: number, z: number) => void;
  input: { forward: boolean; sprint: boolean };
  player: { yaw: number; pitch: number; health: number };
  world: { setBlock: (x:number,y:number,z:number,id:number)=>boolean };
  forceRemeshAround: () => Promise<void>;
};

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
    await page.waitForFunction(() => !!(window as unknown as { __bv?: unknown }).__bv, { timeout: 60000 });
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      await bv.waitForMeshes(5000);
      bv.buildPlatform(10);
      await bv.waitForMeshes(4000);
      bv.setTime(0.32);
      bv.look(0.5, -0.3);
      // drain remesh queue
      for (let i = 0; i < 40; i++) {
        await bv.waitForMeshes(200);
      }
    });
    await sleep(800);
    return { context, page };
  };


  // Title screen (no test mode)
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('#title-screen', { timeout: 15000 });
    await sleep(400);
    await saveShot(page, '00-tittel.png');
    await context.close();
  }

  const fpsBefore = 56; // it4 walk
  let fpsWalk = 0;

  {
    const { context, page } = await openGame(false);

    // FPS walk on platform
    fpsWalk = await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.setTime(0.3);
      bv.look(0.2, -0.25);
      // let remesh catch up before measuring
      await bv.waitForMeshes(3000);
      await new Promise((r) => setTimeout(r, 1000));
      bv.input.forward = true;
      bv.input.sprint = true;
      const samples: number[] = [];
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 500));
        samples.push(bv.getState().fps);
      }
      bv.input.forward = false;
      bv.input.sprint = false;
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)]; // median
    });
    console.log('fps_after_walk', fpsWalk);

    // 01 spawn / landscape day
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.setTime(0.32);
      bv.look(0.6, -0.28);
      await bv.waitForMeshes(1500);
    });
    await sleep(400);
    await saveShot(page, '01-spawn.png');

    // 02 mobs night — spawn in front and lookAt
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.clearMobs();
      bv.setTime(0.02);
      bv.buildPlatform(10);
      await bv.waitForMeshes(2500);
      // flatten trees in view by air-carving ahead
      const st = bv.getState();
      for (let z = -8; z <= -1; z++) for (let x = -4; x <= 4; x++) for (let y = 0; y < 5; y++) {
        bv.world.setBlock(Math.floor(st.x) + x, Math.floor(st.y) + y, Math.floor(st.z) + z, 0);
      }
      await bv.waitForMeshes(2000);
      const a = bv.spawnMob('vandrer', 0, 0, -4);
      bv.spawnMob('gris', 2.5, 0, -3.5);
      bv.spawnMob('knallbolle', -2.5, 0, -4.5);
      bv.lookAt(a.x, a.y + 1.2, a.z);
      await new Promise((r) => setTimeout(r, 400));
    });
    await sleep(500);
    await saveShot(page, '02-mobs-natt.png');

    // 03 combat — mob close, sword, attack
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.clearMobs();
      bv.setTime(0.35);
      bv.give(111, 1); // iron sword
      // select sword - put in slot 0
      const m = bv.spawnMob('vandrer', 0, 0, -3.2);
      bv.lookAt(m.x, m.y + 1.0, m.z);
      for (let i = 0; i < 3; i++) { bv.attack(); await new Promise((r) => setTimeout(r, 150)); }
      await new Promise((r) => setTimeout(r, 200));
    });
    await sleep(400);
    await saveShot(page, '03-kamp.png');

    // 04 bow — arrows flying
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.clearMobs();
      bv.setTime(0.3);
      bv.give(62, 1); bv.give(61, 32);
      const m = bv.spawnMob('vever', 0, 0, -6);
      bv.lookAt(m.x, m.y + 0.4, m.z);
      bv.shootBow(1);
      await new Promise((r) => setTimeout(r, 80));
      bv.shootBow(1);
      await new Promise((r) => setTimeout(r, 60));
    });
    await sleep(250);
    await saveShot(page, '04-bue.png');

    // 05 bed + sleep (night -> morning)
    let sleepOk = false;
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.clearMobs();
      bv.setTime(0.9);
      bv.buildPlatform(6);
      await bv.waitForMeshes(1500);
      const bed = bv.placeBedFront();
      bv.lookAt(bed.x + 0.5, bed.y + 0.5, bed.z + 0.5);
      await new Promise((r) => setTimeout(r, 200));
    });
    await sleep(300);
    await saveShot(page, '05-seng-natt.png');
    sleepOk = await page.evaluate(() => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      return bv.sleep();
    });
    console.log('sleep_ok', sleepOk);
    await sleep(400);
    await saveShot(page, '06-seng-morgen.png');

    // 07 farm
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.setTime(0.35);
      bv.buildPlatform(6);
      await bv.waitForMeshes(1500);
      bv.stageFarm();
      await bv.waitForMeshes(2000);
      const st = bv.getState();
      bv.lookAt(st.x - Math.sin(bv.player.yaw) * 2.5, st.y + 0.3, st.z - Math.cos(bv.player.yaw) * 2.5);
    });
    await sleep(400);
    await saveShot(page, '07-jordbruk.png');

    // 08 boat
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.setTime(0.35);
      bv.buildPlatform(6);
      await bv.waitForMeshes(1500);
      const b = bv.placeBoatFront() as { x: number; y: number; z: number };
      await bv.waitForMeshes(2000);
            bv.lookAt(b.x, b.y + 0.3, b.z);
      await new Promise((r) => setTimeout(r, 200));
    });
    await sleep(400);
    await saveShot(page, '08-bat.png');

    // 09 enchant + armor
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.setTime(0.32);
      bv.buildPlatform(8);
      await bv.waitForMeshes(2500);
      bv.look(0.5, -0.3);
      const st = bv.getState();
      const fx = -Math.sin(0.5), fz = -Math.cos(0.5);
      const tx = Math.floor(st.x + fx * 3);
      const tz = Math.floor(st.z + fz * 3);
      const ty = Math.floor(st.y);
      bv.world.setBlock(tx, ty - 1, tz, 3);
      bv.world.setBlock(tx, ty, tz, 24);
      bv.world.setBlock(tx - 1, ty, tz, 6);
      bv.world.setBlock(tx + 1, ty, tz, 6);
      bv.give(115, 1);
      bv.equipArmor();
      bv.look(0.5, -0.35);
    });
    await sleep(2000);
    await saveShot(page, '09-enchant-rustning.png');

    // 10 pause menu
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.buildPlatform(8);
      await bv.waitForMeshes(2500);
      bv.setTime(0.35);
            bv.look(0.3, -0.35);
      await new Promise((r) => setTimeout(r, 300));
      bv.showPause();
    });
    await sleep(400);
    await saveShot(page, '10-pause.png');
    await page.evaluate(() => {
      (window as unknown as { __bv: BV }).__bv.hidePause();
    });

    // 11 death
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.buildPlatform(6);
      await bv.waitForMeshes(2000);
            bv.setTime(0.35);
      bv.look(0.4, -0.3);
      await new Promise((r) => setTimeout(r, 200));
      bv.kill();
    });
    await sleep(400);
    await saveShot(page, '11-dod.png');
    await page.click('#btn-respawn');
    await sleep(600);
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.buildPlatform(8);
      await bv.waitForMeshes(3000);
            await new Promise((r) => setTimeout(r, 600));
      bv.setTime(0.35);
      bv.look(0.6, -0.4);
      await new Promise((r) => setTimeout(r, 400));
    });
    await sleep(700);
    await saveShot(page, '12-respawn.png');

    const state = await page.evaluate(() => (window as unknown as { __bv: BV }).__bv.getState());
    writeFileSync(join(OUT_PUBLIC, 'playtest-state.json'), JSON.stringify({
      fpsBefore, fpsWalk, sleepOk, state,
    }, null, 2));
    console.log('state', state);
    await context.close();
  }

  // Video: mobs + combat
  {
    const { context, page } = await openGame(true);
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.setTime(0.05);
      bv.buildPlatform(8);
      await bv.waitForMeshes(2000);
      bv.clearMobs();
      bv.spawnMob('vandrer', 1, 0, -4);
      bv.spawnMob('gris', -2, 0, -3);
      bv.spawnMob('vever', 3, 0, -5);
      bv.look(0.1, -0.2);
      bv.input.forward = true;
      for (let i = 0; i < 40; i++) {
        if (i % 8 === 0) bv.attack();
        if (i % 12 === 0) bv.shootBow(0.7);
        await new Promise((r) => setTimeout(r, 100));
      }
      bv.input.forward = false;
    });
    await sleep(400);
    const video = page.video();
    await page.close(); await context.close();
    if (video) {
      const raw = await video.path();
      copyFileSync(raw, join(OUT_PUBLIC, 'clip-mobs-kamp.webm'));
      copyFileSync(raw, join(OUT_SHOTS, 'clip-mobs-kamp.webm'));
      console.log('video1', statSync(join(OUT_PUBLIC, 'clip-mobs-kamp.webm')).size);
    }
  }

  // Video: farm / boat / explore
  {
    const { context, page } = await openGame(true);
    await page.evaluate(async () => {
      const bv = (window as unknown as { __bv: BV }).__bv;
      bv.setTime(0.35);
      bv.buildPlatform(6);
      await bv.waitForMeshes(1500);
      bv.stageFarm();
      bv.placeBoatFront();
      await bv.waitForMeshes(1500);
      bv.look(0.8, -0.3);
      bv.input.forward = true;
      for (let i = 0; i < 30; i++) {
        bv.player.yaw += 0.04;
        await new Promise((r) => setTimeout(r, 100));
      }
      bv.input.forward = false;
      bv.setTime(0.9);
      bv.placeBedFront();
      bv.sleep();
      await new Promise((r) => setTimeout(r, 600));
    });
    await sleep(300);
    const video = page.video();
    await page.close(); await context.close();
    if (video) {
      const raw = await video.path();
      copyFileSync(raw, join(OUT_PUBLIC, 'clip-farm-bat-seng.webm'));
      copyFileSync(raw, join(OUT_SHOTS, 'clip-farm-bat-seng.webm'));
      console.log('video2', statSync(join(OUT_PUBLIC, 'clip-farm-bat-seng.webm')).size);
    }
  }

  await browser.close();
  preview.kill('SIGTERM');
  for (const f of readdirSync(OUT_PUBLIC)) {
    if (f.startsWith('page@')) try { unlinkSync(join(OUT_PUBLIC, f)); } catch {}
  }
  console.log('done', readdirSync(OUT_PUBLIC).join(','));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
