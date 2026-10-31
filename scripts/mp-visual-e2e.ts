/**
 * Visual proof e2e: open flat pad, frame remotes clearly.
 * Shots → /workspace/blokkverden-shots/mp2/
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SHOT = '/workspace/blokkverden-shots/mp2';
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
  let err = '';
  child.stderr?.on('data', (d) => { err += String(d); });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/')).ok) return { base, child }; } catch { /* */ }
    if (child.exitCode != null) throw new Error('preview exited: ' + err.slice(-400));
    await sleep(200);
  }
  throw new Error('preview failed');
}

async function newClient(browser: Browser, base: string, playerId: string, label: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Unique MP identity per client (shared localStorage would collide)
  await ctx.addInitScript((id) => {
    try {
      localStorage.setItem('bv_mp_player_id', id);
      localStorage.setItem('bv_mp_name', '');
    } catch { /* */ }
  }, playerId);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(label, e.message));
  page.on('dialog', async (d) => {
    if (d.type() === 'confirm') await d.accept(); // creative OK
    else if (d.type() === 'prompt') await d.accept(label);
    else await d.accept();
  });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  return { ctx, page };
}

async function hostGame(page: Page, name: string) {
  await page.locator('#btn-sammen').click({ force: true });
  await page.waitForSelector('#mp-sheet', { timeout: 10000 });
  await page.fill('#mp-name', name);
  await page.locator('#mp-host').click({ force: true });
  await page.waitForSelector('canvas#game', { timeout: 90000 });
  await sleep(2000);
  await page.locator('canvas#game').click({ position: { x: 640, y: 360 } });
  await sleep(300);
}

async function joinGame(page: Page, name: string, code: string) {
  await page.locator('#btn-sammen').click({ force: true });
  await page.waitForSelector('#mp-sheet', { timeout: 10000 });
  await page.fill('#mp-name', name);
  await page.fill('#mp-code', code);
  await page.locator('#mp-join').click({ force: true });
  await page.waitForSelector('canvas#game', { timeout: 90000 });
  await sleep(2500);
  await page.locator('canvas#game').click({ position: { x: 640, y: 360 } });
  await sleep(300);
}

/** Flat grass stage at y=40, clear of trees, big enough for framing. */
async function buildStage(page: Page) {
  await page.evaluate(`(() => {
    const bv = window.__bv;
    for (let x = -8; x <= 24; x++) for (let z = -8; z <= 24; z++) {
      bv.world.setBlock(x, 40, z, 1); // grass
      for (let y = 41; y <= 50; y++) bv.world.setBlock(x, y, z, 0);
    }
    // Distinctive door for sync test (facing default)
    bv.world.setBlock(10, 41, 8, 26); // Door
    bv.world.setBlock(10, 40, 8, 1);
    if (window.__bvMp && window.__bvMp.offerWorld) window.__bvMp.offerWorld();
  })()`);
  await sleep(400);
}

async function placeAt(page: Page, x: number, y: number, z: number, yaw: number) {
  await page.evaluate(`((x,y,z,yaw) => {
    const bv = window.__bv;
    bv.teleport(x, y, z);
    bv.look(yaw, 0);
    // Force a state send
    if (window.__bvMp) {
      const mp = window.__bvMp;
      // nudge pose
      bv.player.vx = 0.01;
    }
  })(${x},${y},${z},${yaw})`);
  await sleep(200);
}

async function waitRemotes(page: Page, n: number, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const c = await page.evaluate(`(() => window.__bvMp && window.__bvMp.remotes ? window.__bvMp.remotes.count() : 0)()`) as number;
    if (c >= n) return c;
    await sleep(200);
  }
  return await page.evaluate(`(() => window.__bvMp && window.__bvMp.remotes ? window.__bvMp.remotes.count() : 0)()`) as number;
}

type Rec = { name: string; ok: boolean; detail: string };
const results: Rec[] = [];
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
}

async function main() {
  const health = await (await fetch('http://127.0.0.1:8788/health')).json();
  if (!health.ok) throw new Error('wrangler not up — start server with npm run dev in server/');

  const { base, child } = await startPreview();
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });

  // --- Host A ---
  const A = await newClient(browser, base, 'player-aaa-1111', 'Ada');
  await hostGame(A.page, 'Ada');
  await buildStage(A.page);
  const codeInfo = await A.page.evaluate(`(() => {
    const mp = window.__bvMp;
    // Ensure touched door/pad is offered
    if (mp && mp.offerWorld) mp.offerWorld();
    return mp && mp.code;
  })()`) as string;
  console.log('code', codeInfo);
  // Ada stands at (4.5, 41.1, 8.5), facing +X (toward Bo)
  await placeAt(A.page, 4.5, 41.1, 8.5, -Math.PI / 2);

  // --- Joiner B ---
  const B = await newClient(browser, base, 'player-bbb-2222', 'Bo');
  await joinGame(B.page, 'Bo', codeInfo);
  // Wait for world sync
  for (let i = 0; i < 25; i++) {
    const door = await B.page.evaluate(`(() => window.__bv.world.getBlock(10, 41, 8))()`);
    if (door === 26) break;
    await A.page.evaluate(`(() => { window.__bvMp && window.__bvMp.offerWorld(); })()`);
    await sleep(400);
  }
  // Bo stands ~4 m east of Ada, looking at Ada (-X)
  await placeAt(B.page, 8.5, 41.1, 8.5, Math.PI / 2);
  await placeAt(A.page, 4.5, 41.1, 8.5, -Math.PI / 2);
  // Walk briefly so pose = walk (arms/legs animate) then idle facing
  await A.page.keyboard.down('KeyW');
  await sleep(400);
  await A.page.keyboard.up('KeyW');
  await placeAt(A.page, 4.5, 41.1, 8.5, -Math.PI / 2);
  await sleep(600);

  const remB = await waitRemotes(B.page, 1);
  const listB = await B.page.evaluate(`(() => window.__bvMp.remotes.list())()`);
  console.log('B remotes', remB, listB);

  // (a) B looking at A's model + nametag
  await B.page.evaluate(`(() => {
    const bv = window.__bv;
    const rem = window.__bvMp.remotes.list()[0];
    if (rem) {
      bv.teleport(rem.x + 4.0, rem.y + 0.1, rem.z);
      bv.lookAt(rem.x, rem.y + 1.5, rem.z);
    } else {
      bv.teleport(8.5, 41.1, 8.5);
      bv.lookAt(4.5, 42.5, 8.5);
    }
  })()`);
  await sleep(500);
  // Force remotes to snap to latest
  await B.page.evaluate(`(() => { for (let i = 0; i < 30; i++) window.__bvMp.tick(1/30); })()`);
  await sleep(200);
  await B.page.screenshot({ path: `${SHOT}/a-B-sees-A-nametag.png` });
  record('a-B-sees-A', remB >= 1, `remotes=${remB} list=${JSON.stringify(listB)}`);

  // (b) before/after stone pillar in B's view
  // Frame: B looks at empty cell (6,41,8) between them
  await B.page.evaluate(`(() => {
    const bv = window.__bv;
    bv.teleport(8.5, 41.1, 8.5);
    bv.lookAt(6.5, 42.5, 8.5);
  })()`);
  await sleep(300);
  await B.page.screenshot({ path: `${SHOT}/b-before-pillar.png` });

  await A.page.evaluate(`(() => {
    const bv = window.__bv;
    // Distinctive 3-high stone pillar at (6,41-43,8)
    for (let y = 41; y <= 43; y++) {
      bv.world.setBlock(6, y, 8, 3); // stone
      window.__bvMp.sendBlock(6, y, 8, 3);
    }
    bv.world.setBlock(6, 44, 8, 4);
  })()`);
  // Prefer gold on top for colour pop
  await A.page.evaluate(`(() => {
    const bv = window.__bv;
    bv.world.setBlock(6, 44, 8, 17); // GoldOre
    window.__bvMp.sendBlock(6, 44, 8, 17);
  })()`);
  await sleep(800);
  await B.page.evaluate(`(() => {
    window.__bv.lookAt(6.5, 42.8, 8.5);
  })()`);
  await sleep(200);
  await B.page.screenshot({ path: `${SHOT}/b-after-pillar.png` });
  const pillar = await B.page.evaluate(`(() => ({
    b41: window.__bv.world.getBlock(6, 41, 8),
    b42: window.__bv.world.getBlock(6, 42, 8),
    b44: window.__bv.world.getBlock(6, 44, 8),
  }))()`);
  record('b-pillar-sync', (pillar as any).b41 === 3 && (pillar as any).b42 === 3, JSON.stringify(pillar));

  // (c) door open — B looks at door at (10,41,8)
  await B.page.evaluate(`(() => {
    const bv = window.__bv;
    bv.teleport(10.5, 41.1, 12.5);
    bv.lookAt(10.5, 41.8, 8.5);
  })()`);
  await sleep(300);
  await B.page.screenshot({ path: `${SHOT}/c-door-before.png` });
  const metaBefore = await B.page.evaluate(`(() => window.__bv.world.getWaterLevel(10, 41, 8))()`);

  await A.page.evaluate(`(() => {
    const bv = window.__bv;
    const meta = bv.world.getWaterLevel(10, 41, 8);
    const next = meta ^ 1;
    bv.world.setMeta(10, 41, 8, next);
    window.__bvMp.sendBlock(10, 41, 8, 26, next);
  })()`);
  await sleep(600);
  await B.page.screenshot({ path: `${SHOT}/c-door-after.png` });
  const metaAfter = await B.page.evaluate(`(() => window.__bv.world.getWaterLevel(10, 41, 8))()`);
  record('c-door-open', (Number(metaBefore) & 1) === 0 && (Number(metaAfter) & 1) === 1,
    `before=${metaBefore} after=${metaAfter}`);

  // (d) late joiner C sees A and B
  const C = await newClient(browser, base, 'player-ccc-3333', 'Cora');
  await A.page.evaluate(`(() => { window.__bvMp && window.__bvMp.offerWorld(); })()`);
  await sleep(300);
  await joinGame(C.page, 'Cora', codeInfo);
  for (let i = 0; i < 20; i++) {
    const n = await waitRemotes(C.page, 2, 1000);
    if (n >= 2) break;
    await A.page.evaluate(`(() => { window.__bvMp && window.__bvMp.offerWorld(); })()`);
    await sleep(400);
  }
  // Position A and B on the pad so C can see both
  await placeAt(A.page, 4.5, 41.1, 8.5, -Math.PI / 2);
  await placeAt(B.page, 8.5, 41.1, 8.5, Math.PI / 2);
  await sleep(800);
  await C.page.evaluate(`(() => {
    const bv = window.__bv;
    bv.teleport(6.5, 41.1, 14.5);
    bv.lookAt(6.5, 42.2, 8.5);
  })()`);
  await C.page.evaluate(`(() => { for (let i = 0; i < 40; i++) window.__bvMp.tick(1/30); })()`);
  await sleep(400);
  const remC = await C.page.evaluate(`(() => ({
    n: window.__bvMp.remotes.count(),
    list: window.__bvMp.remotes.list(),
  }))()`);
  await C.page.screenshot({ path: `${SHOT}/d-C-sees-A-and-B.png` });
  record('d-late-sees-both', (remC as any).n >= 2, JSON.stringify(remC));

  // Also host view of both for completeness
  await A.page.evaluate(`(() => {
    const bv = window.__bv;
    bv.teleport(6.5, 41.1, 14.5);
    bv.lookAt(6.5, 42.2, 8.5);
  })()`);
  await A.page.evaluate(`(() => { for (let i = 0; i < 40; i++) window.__bvMp.tick(1/30); })()`);
  await sleep(300);
  await A.page.screenshot({ path: `${SHOT}/e-host-sees-both.png` });

  await A.ctx.close(); await B.ctx.close(); await C.ctx.close();
  await browser.close();
  child.kill('SIGTERM');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
