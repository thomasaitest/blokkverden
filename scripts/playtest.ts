/**
 * Headless playtest — screenshots + short webm clips → public/progress/itN + blokkverden-shots.
 */
import { chromium } from 'playwright';
import {
  mkdirSync,
  copyFileSync,
  existsSync,
  writeFileSync,
  statSync,
  readdirSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const IT = Number(process.env.IT || 1);
const OUT_PUBLIC = join(process.cwd(), 'public', 'progress', `it${IT}`);
const OUT_SHOTS = join('/workspace/blokkverden-shots', `it${IT}`);
mkdirSync(OUT_PUBLIC, { recursive: true });
mkdirSync(OUT_SHOTS, { recursive: true });

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (addr && typeof addr === 'object') {
        const p = addr.port;
        s.close(() => resolve(p));
      } else reject(new Error('no port'));
    });
  });
}

async function main() {
  const PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}`;
  console.log('preview on', BASE);

  const preview: ChildProcess = spawn(
    'npx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: process.cwd(), stdio: 'pipe', env: { ...process.env } },
  );
  preview.stderr?.on('data', (d) => process.stderr.write(d));

  // Wait until up
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + '/');
      if (r.ok) break;
    } catch {
      /* retry */
    }
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
      deviceScaleFactor: 1,
      ...(record ? { recordVideo: { dir: OUT_PUBLIC, size: { width: 1280, height: 720 } } } : {}),
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => !!(window as unknown as { __BV?: unknown }).__BV, {
      timeout: 20000,
    });
    await sleep(2000);
    return { context, page };
  };

  // --- Stills session ---
  {
    const { context, page } = await openGame(false);
    await saveShot(page, '01-spawn.png');

    await page.evaluate(() => {
      (window as unknown as { __BV: { look: (y: number, p: number) => void } }).__BV.look(0.5, -0.2);
    });
    await sleep(600);
    await saveShot(page, '02-landskap.png');

    await page.evaluate(async () => {
      const bv = (window as unknown as {
        __BV: { input: { forward: boolean; jump: boolean } };
      }).__BV;
      bv.input.forward = true;
      await new Promise((r) => setTimeout(r, 2200));
      bv.input.forward = false;
      bv.input.jump = true;
      await new Promise((r) => setTimeout(r, 250));
      bv.input.jump = false;
      await new Promise((r) => setTimeout(r, 900));
    });
    await saveShot(page, '03-gange-hopp.png');

    await page.evaluate(() => {
      const bv = (window as unknown as {
        __BV: { look: (y: number, p: number) => void; breakBlock: () => boolean };
      }).__BV;
      bv.look(0, -0.4);
      for (let i = 0; i < 10; i++) bv.breakBlock();
    });
    await sleep(400);
    await saveShot(page, '04-knusing.png');

    await page.evaluate(() => {
      const bv = (window as unknown as {
        __BV: { placeBlock: () => boolean; hud: { setSlot: (n: number) => void }; look: (y: number, p: number) => void };
      }).__BV;
      bv.hud.setSlot(5);
      bv.look(0.15, -0.35);
      for (let i = 0; i < 5; i++) bv.placeBlock();
    });
    await sleep(400);
    await saveShot(page, '05-plassering.png');

    await page.evaluate(() => {
      const bv = (window as unknown as {
        __BV: { look: (y: number, p: number) => void; setDay?: (t: number) => void };
      }).__BV;
      bv.look(1.2, 0.4);
      bv.setDay?.(0.05);
    });
    await sleep(400);
    await saveShot(page, '06-himmel.png');

    const state = await page.evaluate(async () => {
      const bv = (window as unknown as {
        __BV: { forceSave: () => Promise<void>; getState: () => unknown };
      }).__BV;
      await bv.forceSave();
      return bv.getState();
    });
    writeFileSync(join(OUT_PUBLIC, 'playtest-state.json'), JSON.stringify(state, null, 2));
    console.log('state', state);

    await context.close();
  }

  // --- Clip 1: walk ---
  {
    const { context, page } = await openGame(true);
    await page.evaluate(async () => {
      const bv = (window as unknown as {
        __BV: {
          look: (y: number, p: number) => void;
          input: { forward: boolean; lookDX: number };
        };
      }).__BV;
      bv.look(0.3, -0.2);
      bv.input.forward = true;
      for (let i = 0; i < 50; i++) {
        bv.input.lookDX = 10;
        await new Promise((r) => setTimeout(r, 100));
      }
      bv.input.forward = false;
    });
    await sleep(300);
    const video = page.video();
    await page.close();
    await context.close();
    if (video) {
      const raw = await video.path();
      const dest = join(OUT_PUBLIC, 'clip-gange.webm');
      if (existsSync(raw)) {
        copyFileSync(raw, dest);
        copyFileSync(raw, join(OUT_SHOTS, 'clip-gange.webm'));
        console.log('video clip-gange.webm', statSync(dest).size);
      }
    }
  }

  // --- Clip 2: break/place ---
  {
    const { context, page } = await openGame(true);
    await page.evaluate(async () => {
      const bv = (window as unknown as {
        __BV: {
          look: (y: number, p: number) => void;
          breakBlock: () => boolean;
          placeBlock: () => boolean;
          hud: { setSlot: (n: number) => void };
          input: { lookDX: number };
        };
      }).__BV;
      bv.look(0.05, -0.35);
      for (let i = 0; i < 15; i++) {
        bv.breakBlock();
        bv.input.lookDX = 12;
        await new Promise((r) => setTimeout(r, 120));
      }
      bv.hud.setSlot(6);
      for (let i = 0; i < 8; i++) {
        bv.placeBlock();
        bv.input.lookDX = -8;
        await new Promise((r) => setTimeout(r, 180));
      }
    });
    await sleep(300);
    const video = page.video();
    await page.close();
    await context.close();
    if (video) {
      const raw = await video.path();
      const dest = join(OUT_PUBLIC, 'clip-bygge.webm');
      if (existsSync(raw)) {
        copyFileSync(raw, dest);
        copyFileSync(raw, join(OUT_SHOTS, 'clip-bygge.webm'));
        console.log('video clip-bygge.webm', statSync(dest).size);
      }
    }
  }

  // Cleanup leftover playwright video dirs / random names
  for (const f of readdirSync(OUT_PUBLIC)) {
    if (f.endsWith('.webm') && !f.startsWith('clip-')) {
      try {
        // leave renamed only
      } catch {
        /* ignore */
      }
    }
  }

  await browser.close();
  preview.kill('SIGTERM');

  const files = readdirSync(OUT_PUBLIC).filter((f) => /\.(png|webm|json)$/.test(f));
  console.log('playtest done files=', files.join(','));
  writeFileSync(
    join(OUT_SHOTS, 'playtest.json'),
    JSON.stringify({ iteration: IT, files }, null, 2),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
