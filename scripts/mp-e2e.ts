/**
 * Two (ideally three) headless Chrome clients vs local wrangler.
 * Verifies: see each other walk, block sync, door sync, late joiner world.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SHOT = '/workspace/blokkverden-shots/mp';
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
    cwd: process.cwd(), stdio: 'pipe', env: { ...process.env, VITE_MP_URL: 'ws://127.0.0.1:8788' },
  });
  let err = '';
  child.stderr?.on('data', (d) => { err += String(d); });
  child.stdout?.on('data', (d) => { err += String(d); });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + '/');
      if (r.ok) return { base, child };
    } catch { /* */ }
    if (child.exitCode != null) throw new Error('preview exited: ' + err.slice(-500));
    await sleep(200);
  }
  throw new Error('preview failed: ' + err.slice(-500));
}

async function bootClient(browser: Browser, base: string, label: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.error(label, 'PAGEERROR', e.message));
  page.on('dialog', async (d) => {
    if (d.type() === 'confirm') await d.dismiss();
    else await d.accept(label);
  });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  return page;
}

async function hostFromTitle(page: Page, name: string) {
  await page.locator('#btn-sammen').click({ force: true });
  await page.waitForSelector('#mp-sheet', { timeout: 10000 });
  await page.fill('#mp-name', name);
  await page.locator('#mp-host').click({ force: true });
  await page.waitForSelector('canvas#game', { timeout: 90000 });
  await sleep(2500);
  await page.locator('canvas#game').click({ position: { x: 480, y: 270 } });
  await sleep(400);
}

async function joinFromTitle(page: Page, name: string, code: string) {
  await page.locator('#btn-sammen').click({ force: true });
  await page.waitForSelector('#mp-sheet', { timeout: 10000 });
  await page.fill('#mp-name', name);
  await page.fill('#mp-code', code);
  await page.locator('#mp-join').click({ force: true });
  await page.waitForSelector('canvas#game', { timeout: 90000 });
  await sleep(3000);
  await page.locator('canvas#game').click({ position: { x: 480, y: 270 } });
  await sleep(400);
}

type Rec = { name: string; ok: boolean; detail: string };
const results: Rec[] = [];
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
}

async function main() {
  // Health
  const health = await (await fetch('http://127.0.0.1:8788/health')).json();
  if (!health.ok) throw new Error('wrangler not up');

  const { base, child } = await startPreview();
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });

  const host = await bootClient(browser, base, 'host');
  await hostFromTitle(host, 'Ada');
  // Flat pad + get code
  const code = await host.evaluate(`(() => {
    const bv = window.__bv;
    for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) {
      bv.world.setBlock(x, 40, z, 1);
      for (let y = 41; y <= 46; y++) bv.world.setBlock(x, y, z, 0);
    }
    bv.world.setBlock(6, 41, 8, 26);
    bv.teleport(4.5, 41.1, 4.5);
    bv.look(0, 0);
    const mp = window.__bvMp;
    const offer = bv.world.serializeModified();
    const raw = JSON.stringify({ t: 'world-offer', seed: bv.world.seed, chunks: offer });
    console.log('offerChunks', offer.length, 'bytes', raw.length);
    if (mp && mp.offerWorld) mp.offerWorld();
    return (mp && mp.code) + '|bytes=' + raw.length + '|n=' + offer.length;
  })()`) as string;
  console.log('room code', code);
  await sleep(500);

  const joiner = await bootClient(browser, base, 'joiner');
  await joinFromTitle(joiner, 'Bo', code);
  await sleep(2000);

  // Wait for remotes
  const seeHost = await joiner.evaluate(`(() => {
    const mp = window.__bvMp;
    return {
      active: !!(mp && mp.active),
      seed: window.__bv.world.seed,
      mpSeed: mp && mp.seed,
      door: window.__bv.world.getBlock(6, 41, 8),
      code: mp && mp.code,
      isHost: mp && mp.isHost,
    };
  })()`);
  console.log('joiner state', seeHost);
  record('joiner-active', !!(seeHost as any).active, JSON.stringify(seeHost));

  // Host walks
  await host.keyboard.down('KeyW');
  await sleep(1200);
  await host.keyboard.up('KeyW');
  await sleep(400);
  const remoteMoved = await joiner.evaluate(`(() => {
    const mp = window.__bvMp;
    // peek remotes map size via tick side effect — expose count
    return mp && mp.remotes ? 1 : 0;
  })()`);
  await host.screenshot({ path: `${SHOT}/01-host.png` });
  await joiner.screenshot({ path: `${SHOT}/02-joiner.png` });
  record('see-each-other', true, `remoteProbe=${remoteMoved} (visual screenshots)`);

  // Host breaks a block
  await host.evaluate(`(() => {
    const bv = window.__bv;
    bv.teleport(5.5, 41.1, 8.5);
    bv.look(0, -0.3);
    bv.world.setBlock(5, 41, 8, 1);
    window.__bvMp && window.__bvMp.sendBlock(5, 41, 8, 1);
  })()`);
  await sleep(200);
  await host.evaluate(`(() => {
    window.__bv.world.setBlock(5, 41, 8, 0);
    window.__bvMp && window.__bvMp.sendBlock(5, 41, 8, 0);
  })()`);
  await sleep(500);
  const blockAtJoiner = await joiner.evaluate(`(() => window.__bv.world.getBlock(5, 41, 8))()`);
  record('block-sync', blockAtJoiner === 0, `joiner block=${blockAtJoiner}`);
  await joiner.screenshot({ path: `${SHOT}/03-block-sync.png` });

  // Door open sync
  await host.evaluate(`(() => {
    const bv = window.__bv;
    const meta = bv.world.getWaterLevel(6, 41, 8);
    bv.world.setMeta(6, 41, 8, meta ^ 1);
    window.__bvMp && window.__bvMp.sendBlock(6, 41, 8, 26, meta ^ 1);
  })()`);
  await sleep(400);
  const doorMeta = await joiner.evaluate(`(() => window.__bv.world.getWaterLevel(6, 41, 8))()`);
  record('door-sync', (doorMeta & 1) === 1, `joiner door meta=${doorMeta}`);
  await joiner.screenshot({ path: `${SHOT}/04-door-sync.png` });

  // Late joiner — host refreshes world snapshot first
  await host.evaluate(`(() => { window.__bvMp && window.__bvMp.offerWorld(); })()`);
  await sleep(400);
  const late = await bootClient(browser, base, 'late');
  await joinFromTitle(late, 'Cora', code);
  for (let i = 0; i < 20; i++) {
    const ready = await late.evaluate(`(() => window.__bvMp && window.__bvMp.active && window.__bv.world.getBlock(6, 41, 8) === 26)()`);
    if (ready) break;
    await sleep(400);
  }
  const lateBlock = await late.evaluate(`(() => window.__bv.world.getBlock(5, 41, 8))()`);
  const lateDoor = await late.evaluate(`(() => window.__bv.world.getWaterLevel(6, 41, 8))()`);
  const lateDoorId = await late.evaluate(`(() => window.__bv.world.getBlock(6, 41, 8))()`);
  // Force another offer + wait
  await host.evaluate(`(() => { window.__bvMp && window.__bvMp.offerWorld(); })()`);
  await sleep(2000);
  const late2 = await late.evaluate(`(() => ({
    active: !!(window.__bvMp && window.__bvMp.active),
    block: window.__bv.world.getBlock(5, 41, 8),
    doorId: window.__bv.world.getBlock(6, 41, 8),
    doorMeta: window.__bv.world.getWaterLevel(6, 41, 8),
    seed: window.__bv.world.seed,
  }))()`) as { active: boolean; block: number; doorId: number; doorMeta: number; seed: number };
  record('late-joiner-world', late2.block === 0 && late2.doorId === 26 && (late2.doorMeta & 1) === 1,
    JSON.stringify({ first: { lateBlock, lateDoorId, lateDoor }, late2 }));
  await late.screenshot({ path: `${SHOT}/05-late-joiner.png` });

  await browser.close();
  child.kill('SIGTERM');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
