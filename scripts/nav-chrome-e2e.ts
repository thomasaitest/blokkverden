/**
 * Chrome navigation e2e — real keys, no __bv teleport for the tested actions.
 * Covers: title→play, WASD dirs, arrows, jump, drag-look, Esc pause→resume.
 */
import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TARGET = process.env.TARGET || 'local';

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

async function startLocal(): Promise<{ base: string; child: ChildProcess }> {
  const PORT = await freePort();
  const base = `http://127.0.0.1:${PORT}`;
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(), stdio: 'pipe',
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base + '/')).ok) return { base, child }; } catch {}
    await sleep(200);
  }
  throw new Error('preview failed');
}

async function main() {
  let base = 'https://thomasaitest.github.io/blokkverden';
  let child: ChildProcess | null = null;
  if (TARGET === 'local') {
    const l = await startLocal();
    base = l.base; child = l.child;
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: false });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));

  page.on('dialog', async (d) => {
    if (d.type() === 'prompt') await d.accept('NavTest');
    else if (d.type() === 'confirm') await d.dismiss();
    else await d.accept();
  });

  await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 120000 });
  await page.locator('#btn-single').click();
  await sleep(300);
  await page.locator('#btn-new-world').click();
  await page.waitForSelector('canvas#game', { timeout: 60000 });
  await sleep(1500);

  const canvas = page.locator('canvas#game');
  await canvas.click({ position: { x: 640, y: 360 } });
  await sleep(300);

  // Setup: known yaw via __bv (scenario only), then REAL keys for movement.
  await page.evaluate(() => {
    const bv = (window as any).__bv;
    bv.look(0, 0);
    bv.teleport(8.5, bv.player.y, 8.5);
  });
  await sleep(100);
  const p0 = await page.evaluate(() => {
    const p = (window as any).__bv.player;
    return { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
  });

  await page.keyboard.down('KeyW');
  await sleep(700);
  await page.keyboard.up('KeyW');
  const pW = await page.evaluate(() => {
    const p = (window as any).__bv.player;
    return { x: p.x, z: p.z };
  });
  const dW = { dx: pW.x - p0.x, dz: pW.z - p0.z };
  const wOk = dW.dz < -0.8 && Math.abs(dW.dx) < 0.5; // forward -Z at yaw 0
  console.log('W', dW, wOk ? 'OK' : 'FAIL');

  await page.evaluate(() => { const bv = (window as any).__bv; bv.look(0, 0); bv.teleport(8.5, bv.player.y, 8.5); });
  await sleep(80);
  await page.keyboard.down('KeyS');
  await sleep(700);
  await page.keyboard.up('KeyS');
  const pS = await page.evaluate(() => ({ x: (window as any).__bv.player.x, z: (window as any).__bv.player.z }));
  const sOk = (pS.z - 8.5) > 0.8 && Math.abs(pS.x - 8.5) < 0.5;
  console.log('S', pS, sOk ? 'OK' : 'FAIL');

  await page.evaluate(() => { const bv = (window as any).__bv; bv.look(0, 0); bv.teleport(8.5, bv.player.y, 8.5); });
  await sleep(80);
  await page.keyboard.down('KeyD');
  await sleep(700);
  await page.keyboard.up('KeyD');
  const pD = await page.evaluate(() => ({ x: (window as any).__bv.player.x, z: (window as any).__bv.player.z }));
  const dOk = (pD.x - 8.5) > 0.8 && Math.abs(pD.z - 8.5) < 0.5;
  console.log('D', pD, dOk ? 'OK' : 'FAIL');

  await page.evaluate(() => { const bv = (window as any).__bv; bv.look(0, 0); bv.teleport(8.5, bv.player.y, 8.5); });
  await sleep(80);
  await page.keyboard.down('ArrowLeft');
  await sleep(700);
  await page.keyboard.up('ArrowLeft');
  const pA = await page.evaluate(() => ({ x: (window as any).__bv.player.x, z: (window as any).__bv.player.z }));
  const aOk = (pA.x - 8.5) < -0.8 && Math.abs(pA.z - 8.5) < 0.5;
  console.log('ArrowLeft', pA, aOk ? 'OK' : 'FAIL');

  // Jump
  const y0 = await page.evaluate(() => (window as any).__bv.player.y);
  await page.keyboard.down('Space');
  await sleep(60);
  await page.keyboard.up('Space');
  await sleep(120);
  const y1 = await page.evaluate(() => (window as any).__bv.player.y);
  const jumpOk = y1 > y0 + 0.15;
  console.log('Jump', y0, '->', y1, jumpOk ? 'OK' : 'FAIL');

  // Force unlock + drag look
  await page.evaluate(() => { document.exitPointerLock(); (window as any).__bv.look(0, 0); });
  await sleep(200);
  const yaw0 = await page.evaluate(() => (window as any).__bv.player.yaw);
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(700, 360, { steps: 12 });
  await page.mouse.up();
  await sleep(100);
  const yaw1 = await page.evaluate(() => (window as any).__bv.player.yaw);
  const dragOk = Math.abs(yaw1 - yaw0) > 0.05;
  console.log('DragLook', yaw0, '->', yaw1, dragOk ? 'OK' : 'FAIL');

  // Esc pause → resume → W still moves
  await page.keyboard.press('Escape');
  await sleep(300);
  const paused = await page.evaluate(() => getComputedStyle(document.getElementById('pause-menu')!).display !== 'none');
  await page.locator('#p-resume').click();
  await sleep(500);
  // Click canvas again so gesture + focus are on the game (mirrors a real player).
  await page.locator('canvas#game').click({ position: { x: 640, y: 360 } });
  await sleep(300);
  const mid = await page.evaluate(() => {
    const bv = (window as any).__bv;
    return {
      pauseDisplay: getComputedStyle(document.getElementById('pause-menu')!).display,
      locked: bv.input.pointerLocked,
      inv: bv.input.inventoryOpen,
      y: bv.player.y,
    };
  });
  console.log('postResume', mid);
  await page.evaluate(() => { const bv = (window as any).__bv; bv.look(0, 0); bv.teleport(8.5, bv.player.y, 8.5); });
  await sleep(100);
  await page.keyboard.down('KeyW');
  await sleep(700);
  await page.keyboard.up('KeyW');
  const pAfter = await page.evaluate(() => ({
    x: (window as any).__bv.player.x,
    z: (window as any).__bv.player.z,
    locked: (window as any).__bv.input.pointerLocked,
    forward: (window as any).__bv.input.forward,
  }));
  const resumeOk = (8.5 - pAfter.z) > 0.8;
  console.log('Resume+W', pAfter, paused, resumeOk ? 'OK' : 'FAIL');

  const all = wOk && sOk && dOk && aOk && jumpOk && dragOk && resumeOk && paused;
  console.log('RESULT', all ? 'PASS' : 'FAIL');

  await browser.close();
  child?.kill('SIGTERM');
  process.exit(all ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
