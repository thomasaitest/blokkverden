import { chromium } from 'playwright';
import {
  mkdirSync, copyFileSync, existsSync, writeFileSync, statSync, readdirSync, unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const IT = Number(process.env.IT || 3);
const OUT_PUBLIC = join(process.cwd(), 'public', 'progress', `it${IT}`);
const OUT_SHOTS = join('/workspace/blokkverden-shots', `it${IT}`);
mkdirSync(OUT_PUBLIC, { recursive: true });
mkdirSync(OUT_SHOTS, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (addr && typeof addr === 'object') { const p = addr.port; s.close(() => resolve(p)); }
      else reject(new Error('no port'));
    });
  });
}

async function main() {
  const PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}`;
  console.log('preview on', BASE);
  const preview: ChildProcess = spawn(
    'npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(BASE + '/')).ok) break; } catch { /* */ }
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
    await page.waitForFunction(() => !!(window as unknown as { __BV?: unknown }).__BV, { timeout: 25000 });
    await sleep(2500); // worker meshes
    return { context, page };
  };

  {
    const { context, page } = await openGame(false);
    await page.evaluate(() => {
      (window as unknown as { __BV: { look: (y: number, p: number) => void } }).__BV.look(0.4, -0.2);
    });
    await sleep(400);
    await saveShot(page, '01-spawn.png');

    // Torch + night
    await page.evaluate(() => {
      const bv = (window as unknown as { __BV: {
        setDay: (t: number) => void; give: (id: number, n?: number) => void;
        placeBlock: () => boolean; look: (y: number, p: number) => void;
        hud: { setSlot: (n: number) => void }; inv: { slots: { id: number }[] };
      } }).__BV;
      bv.setDay(0.0);
      bv.give(12, 4); // torch
      for (let i = 0; i < 9; i++) if (bv.inv.slots[i]?.id === 12) { bv.hud.setSlot(i); break; }
      bv.look(0.2, -0.35);
      bv.placeBlock();
    });
    await sleep(800);
    await saveShot(page, '02-fakkel-natt.png');

    await page.evaluate(() => {
      (window as unknown as { __BV: { setDay: (t: number) => void; look: (y: number, p: number) => void } }).__BV.setDay(0.3);
      (window as unknown as { __BV: { look: (y: number, p: number) => void } }).__BV.look(0.8, -0.15);
    });
    await sleep(500);
    await saveShot(page, '03-biomer.png');

    // Inventory + recipe book
    await page.evaluate(() => {
      (window as unknown as { __BV: { openInv: () => void } }).__BV.openInv();
    });
    await sleep(300);
    await page.click('#btn-book').catch(() => {});
    await sleep(300);
    await saveShot(page, '04-oppskrifter.png');
    await page.evaluate(() => {
      (window as unknown as { __BV: { closeInv: () => void } }).__BV.closeInv();
    });

    // Furnace UI
    await page.evaluate(() => {
      const bv = (window as unknown as { __BV: {
        give: (id: number, n?: number) => void; placeBlock: () => boolean;
        openFurnace: (x: number, y: number, z: number) => void;
        look: (y: number, p: number) => void; hud: { setSlot: (n: number) => void };
        inv: { slots: { id: number }[] }; player: { x: number; y: number; z: number };
        world: { setBlock: (x: number, y: number, z: number, id: number) => boolean };
      } }).__BV;
      const x = Math.floor(bv.player.x) + 1;
      const y = Math.floor(bv.player.y);
      const z = Math.floor(bv.player.z);
      bv.world.setBlock(x, y, z, 14); // furnace
      bv.openFurnace(x, y, z);
    });
    await sleep(400);
    await saveShot(page, '05-ovn.png');
    await page.evaluate(() => {
      (window as unknown as { __BV: { closeInv: () => void } }).__BV.closeInv();
    });

    // Break for drops + eat
    await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: {
        look: (y: number, p: number) => void; breakBlock: () => boolean;
        give: (id: number, n?: number) => void; eat: () => boolean;
        setDay: (t: number) => void;
      } }).__BV;
      bv.setDay(0.28);
      bv.look(0, -0.5);
      bv.give(100, 1);
      for (let i = 0; i < 10; i++) { bv.breakBlock(); await new Promise((r) => setTimeout(r, 60)); }
      bv.give(52, 2);
      bv.eat();
    });
    await sleep(600);
    await saveShot(page, '06-drops-mat.png');

    const state = await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: { forceSave: () => Promise<void>; getState: () => unknown } }).__BV;
      await bv.forceSave();
      return bv.getState();
    });
    writeFileSync(join(OUT_PUBLIC, 'playtest-state.json'), JSON.stringify(state, null, 2));
    console.log('state', state);
    await context.close();
  }

  // clips
  {
    const { context, page } = await openGame(true);
    await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: {
        setDay: (t: number) => void; look: (y: number, p: number) => void;
        input: { forward: boolean; lookDX: number; sprint: boolean };
        give: (id: number, n?: number) => void; placeBlock: () => boolean;
        hud: { setSlot: (n: number) => void }; inv: { slots: { id: number }[] };
      } }).__BV;
      bv.setDay(0.02);
      bv.give(12, 3);
      for (let i = 0; i < 9; i++) if (bv.inv.slots[i]?.id === 12) { bv.hud.setSlot(i); break; }
      bv.look(0.3, -0.3);
      bv.placeBlock();
      bv.input.forward = true;
      bv.input.sprint = true;
      for (let i = 0; i < 40; i++) {
        bv.input.lookDX = 10;
        await new Promise((r) => setTimeout(r, 100));
      }
      bv.input.forward = false;
    });
    await sleep(300);
    const video = page.video();
    await page.close(); await context.close();
    if (video) {
      const raw = await video.path();
      const dest = join(OUT_PUBLIC, 'clip-natt-fakkel.webm');
      copyFileSync(raw, dest); copyFileSync(raw, join(OUT_SHOTS, 'clip-natt-fakkel.webm'));
      console.log('video', dest, statSync(dest).size);
    }
  }

  {
    const { context, page } = await openGame(true);
    await page.evaluate(async () => {
      const bv = (window as unknown as { __BV: {
        openInv: () => void; closeInv: () => void; openFurnace: (x:number,y:number,z:number)=>void;
        look: (y: number, p: number) => void; breakBlock: () => boolean;
        player: { x: number; y: number; z: number };
        world: { setBlock: (x:number,y:number,z:number,id:number)=>boolean };
      } }).__BV;
      bv.openInv();
      await new Promise((r) => setTimeout(r, 1000));
      bv.closeInv();
      const x = Math.floor(bv.player.x)+1, y = Math.floor(bv.player.y), z = Math.floor(bv.player.z);
      bv.world.setBlock(x, y, z, 14);
      bv.openFurnace(x, y, z);
      await new Promise((r) => setTimeout(r, 1200));
      bv.closeInv();
      bv.look(0, -0.4);
      for (let i = 0; i < 8; i++) { bv.breakBlock(); await new Promise((r) => setTimeout(r, 100)); }
    });
    await sleep(300);
    const video = page.video();
    await page.close(); await context.close();
    if (video) {
      const raw = await video.path();
      const dest = join(OUT_PUBLIC, 'clip-ovn-drops.webm');
      copyFileSync(raw, dest); copyFileSync(raw, join(OUT_SHOTS, 'clip-ovn-drops.webm'));
      console.log('video', dest, statSync(dest).size);
    }
  }

  await browser.close();
  preview.kill('SIGTERM');
  for (const f of readdirSync(OUT_PUBLIC)) {
    if (f.startsWith('page@') && f.endsWith('.webm')) try { unlinkSync(join(OUT_PUBLIC, f)); } catch { /* */ }
  }
  const files = readdirSync(OUT_PUBLIC).filter((f) => /\.(png|webm|json)$/.test(f));
  writeFileSync(join(OUT_SHOTS, 'playtest.json'), JSON.stringify({ iteration: IT, files }, null, 2));
  console.log('playtest done', files.join(','));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
