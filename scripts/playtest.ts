import { chromium } from 'playwright';
import {
  mkdirSync, copyFileSync, existsSync, writeFileSync, statSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const IT = Number(process.env.IT || 2);
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
    { cwd: process.cwd(), stdio: 'pipe' },
  );

  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(BASE + '/')).ok) break;
    } catch { /* */ }
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
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => !!(window as unknown as { __BV?: unknown }).__BV, { timeout: 20000 });
    await sleep(2000);
    // Clear IndexedDB soft: teleport & give items via API for deterministic test
    await page.evaluate(() => {
      const bv = (window as unknown as { __BV: {
        teleport: (x:number,y:number,z:number)=>void;
        look: (y:number,p:number)=>void;
        give: (id:number,n?:number)=>void;
      }}).__BV;
      bv.look(0.3, -0.25);
    });
    return { context, page };
  };

  {
    const { context, page } = await openGame(false);
    await saveShot(page, '01-spawn.png');

    await page.evaluate(() => {
      (window as unknown as { __BV: { look: (y:number,p:number)=>void } }).__BV.look(0.6, -0.2);
    });
    await sleep(500);
    await saveShot(page, '02-terreng.png');

    // Walk + jump
    await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: { input: { forward:boolean; jump:boolean; sprint:boolean } } }).__BV;
      bv.input.forward = true;
      bv.input.sprint = true;
      await new Promise((r) => setTimeout(r, 1800));
      bv.input.jump = true;
      await new Promise((r) => setTimeout(r, 200));
      bv.input.jump = false;
      bv.input.forward = false;
      await new Promise((r) => setTimeout(r, 600));
    });
    await saveShot(page, '03-gange.png');

    // Open inventory
    await page.evaluate(() => {
      (window as unknown as { __BV: { openInv: ()=>void } }).__BV.openInv();
    });
    await sleep(400);
    await saveShot(page, '04-inventar.png');
    await page.evaluate(() => {
      (window as unknown as { __BV: { closeInv: ()=>void } }).__BV.closeInv();
    });

    // Break + drops
    await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: {
        look: (y:number,p:number)=>void;
        breakBlock: ()=>boolean;
        give: (id:number,n?:number)=>void;
      }}).__BV;
      bv.look(0, -0.45);
      bv.give(100, 1); // wood pick
      for (let i = 0; i < 12; i++) {
        bv.breakBlock();
        await new Promise((r) => setTimeout(r, 80));
      }
    });
    await sleep(800);
    await saveShot(page, '05-drops.png');

    // Place crafting table + open
    await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: {
        give: (id:number,n?:number)=>void;
        placeBlock: ()=>boolean;
        openTable: ()=>void;
        look: (y:number,p:number)=>void;
        hud: { setSlot: (n:number)=>void };
        inv: { selected: number; slots: {id:number}[] };
      }}).__BV;
      bv.give(11, 1); // crafting table item
      // select crafting table slot
      for (let i = 0; i < 9; i++) {
        if (bv.inv.slots[i]?.id === 11) {
          bv.hud.setSlot(i);
          break;
        }
      }
      bv.look(0.1, -0.4);
      bv.placeBlock();
      await new Promise((r) => setTimeout(r, 200));
      bv.openTable();
    });
    await sleep(400);
    await saveShot(page, '06-arbeidsbenk.png');

    const state = await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: { forceSave: ()=>Promise<void>; getState: ()=>unknown } }).__BV;
      await bv.forceSave();
      return bv.getState();
    });
    writeFileSync(join(OUT_PUBLIC, 'playtest-state.json'), JSON.stringify(state, null, 2));
    console.log('state', state);
    await context.close();
  }

  // clip walk
  {
    const { context, page } = await openGame(true);
    await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: {
        look: (y:number,p:number)=>void;
        input: { forward:boolean; lookDX:number; sprint:boolean };
      }}).__BV;
      bv.look(0.2, -0.2);
      bv.input.forward = true;
      bv.input.sprint = true;
      for (let i = 0; i < 45; i++) {
        bv.input.lookDX = 12;
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
      const dest = join(OUT_PUBLIC, 'clip-utforsk.webm');
      copyFileSync(raw, dest);
      copyFileSync(raw, join(OUT_SHOTS, 'clip-utforsk.webm'));
      console.log('video', dest, statSync(dest).size);
    }
  }

  // clip inventory/build
  {
    const { context, page } = await openGame(true);
    await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: {
        openInv: ()=>void; closeInv: ()=>void; openTable: ()=>void;
        breakBlock: ()=>boolean; placeBlock: ()=>boolean;
        look: (y:number,p:number)=>void; give: (id:number,n?:number)=>void;
        input: { lookDX:number };
      }}).__BV;
      bv.openInv();
      await new Promise((r) => setTimeout(r, 1200));
      bv.closeInv();
      bv.look(0, -0.4);
      bv.give(100, 1);
      for (let i = 0; i < 10; i++) {
        bv.breakBlock();
        bv.input.lookDX = 10;
        await new Promise((r) => setTimeout(r, 120));
      }
      bv.openTable();
      await new Promise((r) => setTimeout(r, 1000));
      bv.closeInv();
    });
    await sleep(300);
    const video = page.video();
    await page.close();
    await context.close();
    if (video) {
      const raw = await video.path();
      const dest = join(OUT_PUBLIC, 'clip-inventar.webm');
      copyFileSync(raw, dest);
      copyFileSync(raw, join(OUT_SHOTS, 'clip-inventar.webm'));
      console.log('video', dest, statSync(dest).size);
    }
  }

  await browser.close();
  preview.kill('SIGTERM');

  for (const f of readdirSync(OUT_PUBLIC)) {
    if (f.startsWith('page@') && f.endsWith('.webm')) {
      try { const { unlinkSync } = await import('node:fs'); unlinkSync(join(OUT_PUBLIC, f)); } catch { /* */ }
    }
  }

  const files = readdirSync(OUT_PUBLIC).filter((f) => /\.(png|webm|json)$/.test(f));
  writeFileSync(join(OUT_SHOTS, 'playtest.json'), JSON.stringify({ iteration: IT, files }, null, 2));
  console.log('playtest done', files.join(','));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
