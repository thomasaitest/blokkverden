/**
 * Chrome e2e: movement must not die after Esc pause/resume while WASD still held,
 * and long walks across terrain / walls / blur must not leave the player frozen
 * with forward still true.
 */
import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SHOT = '/workspace/blokkverden-shots/mp/../stuck';
mkdirSync(SHOT, { recursive: true });

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

async function startPreview(): Promise<{ base: string; child: ChildProcess }> {
  const PORT = await freePort();
  const base = `http://127.0.0.1:${PORT}`;
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(), stdio: 'pipe',
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base + '/')).ok) return { base, child }; } catch { /* */ }
    await sleep(200);
  }
  throw new Error('preview failed');
}

type Rec = { name: string; ok: boolean; detail: string };
const results: Rec[] = [];
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
}

async function main() {
  // Ensure build is current
  const { base, child } = await startPreview();
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('dialog', async (d) => { if (d.type() === 'confirm') await d.dismiss(); else await d.accept('StuckTest'); });

  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('#btn-single').click();
  await sleep(300);
  await page.locator('#btn-new-world').click();
  await page.waitForSelector('canvas#game', { timeout: 90000 });
  await sleep(2000);

  const canvas = page.locator('canvas#game');
  await canvas.click({ position: { x: 640, y: 360 } });
  await sleep(400);

  // Flat pad for controlled tests
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    for (let x = -8; x <= 24; x++) for (let z = -8; z <= 24; z++) {
      bv.world.setBlock(x, 40, z, 1);
      for (let y = 41; y <= 48; y++) bv.world.setBlock(x, y, z, 0);
    }
    // Wall for jump-along
    for (let z = 0; z < 20; z++) for (let y = 41; y <= 45; y++) bv.world.setBlock(12, y, z, 1);
    bv.teleport(4.5, 41.1, 4.5);
    bv.look(0, 0);
  });
  await sleep(200);

  // --- A: Esc pause/resume while holding W ---
  await canvas.click({ position: { x: 640, y: 360 } });
  await sleep(200);
  await page.keyboard.down('KeyW');
  await sleep(400);
  const before = await page.evaluate(() => {
    const bv = (window as any).__bv;
    return { f: bv.input.forward, x: bv.player.x, z: bv.player.z };
  });
  await page.keyboard.press('Escape');
  await sleep(400);
  const paused = await page.evaluate(() => {
    const el = document.getElementById('pause-menu');
    return !!(el && getComputedStyle(el).display !== 'none');
  });
  const mid = await page.evaluate(() => ({ f: (window as any).__bv.input.forward }));
  await page.locator('#p-resume').click();
  await sleep(300);
  await canvas.click({ position: { x: 640, y: 360 } });
  await sleep(200);
  const p0 = await page.evaluate(() => {
    const bv = (window as any).__bv;
    return { f: bv.input.forward, x: bv.player.x, z: bv.player.z };
  });
  await sleep(600);
  const p1 = await page.evaluate(() => {
    const bv = (window as any).__bv;
    return { x: bv.player.x, z: bv.player.z };
  });
  const movedAfterResume = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  await page.keyboard.up('KeyW');
  record('A-pause-resume-keeps-WASD', before.f && mid.f && p0.f && movedAfterResume > 0.5 && paused,
    `before=${JSON.stringify(before)} midF=${mid.f} afterResumeF=${p0.f} moved=${movedAfterResume.toFixed(2)} paused=${paused}`);
  await page.screenshot({ path: `${SHOT}/A-after-resume.png` });

  // --- B: long walk on flat ---
  await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(0.5, 41.1, 0.5); bv.look(0, 0); });
  await canvas.click({ position: { x: 640, y: 360 } });
  await page.keyboard.down('KeyW');
  const b0 = await page.evaluate(() => ({ x: (window as any).__bv.player.x, z: (window as any).__bv.player.z }));
  let maxGap = 0, last = b0, gap = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const s = await page.evaluate(() => ({
      x: (window as any).__bv.player.x, z: (window as any).__bv.player.z, f: (window as any).__bv.input.forward,
    }));
    const d = Math.hypot(s.x - last.x, s.z - last.z);
    if (s.f && d < 0.05) { gap++; maxGap = Math.max(maxGap, gap); } else gap = 0;
    last = s;
  }
  await page.keyboard.up('KeyW');
  const b1 = last;
  const dist = Math.hypot(b1.x - b0.x, b1.z - b0.z);
  record('B-long-walk', dist > 15 && maxGap < 4, `dist=${dist.toFixed(1)} maxStuckSamples=${maxGap}`);
  await page.screenshot({ path: `${SHOT}/B-long-walk.png` });

  // --- C: jump along wall ---
  await page.evaluate(() => { const bv = (window as any).__bv; bv.teleport(11.2, 41.1, 2.5); bv.look(0, 0); });
  await canvas.click({ position: { x: 640, y: 360 } });
  await page.keyboard.down('KeyW');
  const c0 = await page.evaluate(() => ({ z: (window as any).__bv.player.z }));
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Space'); await sleep(350); }
  await sleep(500);
  const c1 = await page.evaluate(() => ({ z: (window as any).__bv.player.z, x: (window as any).__bv.player.x }));
  await page.keyboard.up('KeyW');
  record('C-jump-along-wall', (c0.z - c1.z) > 2, `dz=${(c0.z - c1.z).toFixed(2)} x=${c1.x.toFixed(2)}`);
  await page.screenshot({ path: `${SHOT}/C-jump-wall.png` });

  // --- D: visibility hidden clears keys (Cmd+Tab) ---
  await canvas.click({ position: { x: 640, y: 360 } });
  await page.keyboard.down('KeyW');
  await sleep(200);
  await page.evaluate(`(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await sleep(100);
  const dHidden = await page.evaluate(`(() => window.__bv.input.forward)()`);
  await page.evaluate(`(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await page.keyboard.up('KeyW');
  record('D-hidden-clears-keys', dHidden === false, `forwardAfterHidden=${dHidden}`);

  await browser.close();
  child.kill('SIGTERM');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
