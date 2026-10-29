/** Honest fishing: no forceInstantBite. Wall-clock wait via game loop. Need 3/3. */
import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

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
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + '/')).ok) break; } catch {}
    await sleep(250);
  }
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await page.goto(BASE + '/?test=1', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => !!(window as any).__bv, { timeout: 60000 });

  await page.evaluate(() => {
    const bv = (window as any).__bv;
    bv.buildPlatform(8);
    const ox = Math.floor(bv.player.x) + 3, oz = Math.floor(bv.player.z), oy = Math.floor(bv.player.y) - 1;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      bv.world.setBlock(ox + dx, oy, oz + dz, 2);
      bv.world.setBlock(ox + dx, oy + 1, oz + dz, 10);
      bv.world.setWater(ox + dx, oy + 1, oz + dz, 7);
      bv.world.setBlock(ox + dx, oy + 2, oz + dz, 0);
    }
    (window as any).__pond = { ox, oy, oz };
    bv.player.x = ox - 2.5; bv.player.y = oy + 2.2; bv.player.z = oz + 0.5;
    bv.lookAt(ox + 0.5, oy + 1.2, oz + 0.5);
    bv.give(67, 1);
  });
  await sleep(500);

  const runs: unknown[] = [];
  for (let i = 0; i < 3; i++) {
    const cast = await page.evaluate(() => {
      const bv = (window as any).__bv;
      bv.fishing.forceInstantBite = false;
      const ok = bv.castFish(); // no forceBite opt
      return { ok, forced: !!bv.fishing.forceInstantBite, casting: bv.fishing.casting, timer: bv.fishing.timer };
    });
    // Poll game-loop state up to 10s for natural bite (timer 1.2–2.7s)
    const bite = await page.waitForFunction(() => {
      const f = (window as any).__bv.fishing;
      return f.bite === true;
    }, { timeout: 10000 }).then(() => true).catch(() => false);
    const got = await page.evaluate(() => {
      const bv = (window as any).__bv;
      const g = bv.reelFish();
      return {
        got: g ? { id: g.id, count: g.count } : null,
        forced: !!bv.fishing.forceInstantBite,
        biteWas: true,
      };
    });
    runs.push({ cast, bite, got });
    console.log('run', i + 1, JSON.stringify({ cast, bite, got }));
  }

  const ok = runs.every((r: any) => r.cast?.ok && r.bite && r.got?.got && !r.cast?.forced && !r.got?.forced);
  console.log(JSON.stringify({ ok, runs }, null, 2));
  await browser.close();
  preview.kill('SIGTERM');
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
