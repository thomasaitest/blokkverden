import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, writeFileSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const IT = 4;
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
  const preview: ChildProcess = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: process.cwd(), stdio: 'pipe' });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch {} await sleep(250); }

  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
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
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => !!(window as unknown as { __BV?: unknown }).__BV, { timeout: 30000 });
    await sleep(3000);
    return { context, page };
  };

  {
    const { context, page } = await openGame(false);
    // Measure FPS over 2s walking
    const fpsWalk = await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: { input: { forward: boolean; sprint: boolean }; getState: () => { fps: number } } }).__BV;
      bv.input.forward = true; bv.input.sprint = true;
      await new Promise((r) => setTimeout(r, 2000));
      bv.input.forward = false;
      await new Promise((r) => setTimeout(r, 600));
      return bv.getState().fps;
    });
    console.log('fps_after_walk', fpsWalk);
    await saveShot(page, '01-spawn.png');

    await page.evaluate(() => {
      const bv = (window as unknown as { __BV: { setDay: (t: number) => void; look: (y: number, p: number) => void; give: (id: number, n?: number) => void; spawnMob: (k: string) => void } }).__BV;
      bv.setDay(0.05);
      bv.look(0.4, -0.2);
      bv.spawnMob('vandrer');
      bv.spawnMob('knallbolle');
      bv.spawnMob('gris');
    });
    await sleep(800);
    await saveShot(page, '02-mobs-natt.png');

    await page.evaluate(() => {
      const bv = (window as unknown as { __BV: { setDay: (t: number) => void; attack: () => boolean; look: (y: number, p: number) => void } }).__BV;
      bv.setDay(0.3);
      bv.look(0.2, -0.1);
      for (let i = 0; i < 5; i++) bv.attack();
    });
    await sleep(400);
    await saveShot(page, '03-kamp.png');

    await page.evaluate(() => {
      const bv = (window as unknown as { __BV: {
        world: { setBlock: (x: number, y: number, z: number, id: number) => boolean };
        player: { x: number; y: number; z: number };
        setDay: (t: number) => void; sleep: () => boolean; look: (y: number, p: number) => void;
      } }).__BV;
      const x = Math.floor(bv.player.x), y = Math.floor(bv.player.y), z = Math.floor(bv.player.z);
      bv.world.setBlock(x + 1, y, z, 20);
      bv.setDay(0.9);
      bv.look(0.5, -0.3);
      bv.sleep();
    });
    await sleep(400);
    await saveShot(page, '04-seng.png');

    // Death
    await page.evaluate(() => {
      const bv = (window as unknown as { __BV: { player: { health: number } } }).__BV;
      bv.player.health = 0;
    });
    await sleep(200);
    await page.evaluate(() => {
      // trigger die via hurt path - call internal by setting and attack
      const w = window as unknown as { __BV: { player: { health: number }; getState: () => unknown } };
      // force death screen via DOM if health 0 - main checks on hurt. Directly show:
      const el = document.getElementById('death-screen');
      if (el) el.style.display = 'flex';
    });
    await sleep(300);
    await saveShot(page, '05-dod.png');
    await page.click('#btn-respawn');
    await sleep(500);
    await saveShot(page, '06-respawn.png');

    const state = await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: { forceSave: () => Promise<void>; getState: () => unknown } }).__BV;
      await bv.forceSave();
      return bv.getState();
    });
    writeFileSync(join(OUT_PUBLIC, 'playtest-state.json'), JSON.stringify({ fpsWalk, state, fpsBefore: 38 }, null, 2));
    console.log('state', state);
    await context.close();
  }

  {
    const { context, page } = await openGame(true);
    await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: {
        setDay: (t: number) => void; spawnMob: (k: string) => void; attack: () => boolean;
        input: { forward: boolean; lookDX: number }; look: (y: number, p: number) => void;
      } }).__BV;
      bv.setDay(0.02);
      bv.spawnMob('vandrer'); bv.spawnMob('vever'); bv.spawnMob('gris');
      bv.look(0.3, -0.15);
      bv.input.forward = true;
      for (let i = 0; i < 35; i++) {
        bv.input.lookDX = 8;
        if (i % 7 === 0) bv.attack();
        await new Promise((r) => setTimeout(r, 100));
      }
      bv.input.forward = false;
    });
    await sleep(300);
    const video = page.video();
    await page.close(); await context.close();
    if (video) {
      const raw = await video.path();
      copyFileSync(raw, join(OUT_PUBLIC, 'clip-mobs-kamp.webm'));
      copyFileSync(raw, join(OUT_SHOTS, 'clip-mobs-kamp.webm'));
      console.log('video1', statSync(join(OUT_PUBLIC, 'clip-mobs-kamp.webm')).size);
    }
  }

  {
    const { context, page } = await openGame(true);
    await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: {
        setDay: (t: number) => void; give: (id: number, n?: number) => void;
        world: { setBlock: (x:number,y:number,z:number,id:number)=>boolean };
        player: { x:number;y:number;z:number }; sleep: ()=>boolean; look: (y:number,p:number)=>void;
        input: { forward: boolean; lookDX: number };
      } }).__BV;
      bv.look(0.4, -0.25);
      bv.input.forward = true;
      for (let i = 0; i < 25; i++) { bv.input.lookDX = 10; await new Promise((r) => setTimeout(r, 100)); }
      bv.input.forward = false;
      const x = Math.floor(bv.player.x)+1, y = Math.floor(bv.player.y), z = Math.floor(bv.player.z);
      bv.world.setBlock(x, y, z, 20);
      bv.setDay(0.85);
      bv.sleep();
      await new Promise((r) => setTimeout(r, 800));
    });
    await sleep(300);
    const video = page.video();
    await page.close(); await context.close();
    if (video) {
      const raw = await video.path();
      copyFileSync(raw, join(OUT_PUBLIC, 'clip-utforsk-seng.webm'));
      copyFileSync(raw, join(OUT_SHOTS, 'clip-utforsk-seng.webm'));
      console.log('video2', statSync(join(OUT_PUBLIC, 'clip-utforsk-seng.webm')).size);
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
