import { BLOCKS, HOTBAR_DEFAULT, type BlockId } from '../blocks/types';
import { createAtlasCanvas, tileUV, ATLAS_SIZE } from '../blocks/textures';
import type { PlayerState } from '../player/physics';
import { CHUNK_SIZE } from '../world/chunk';

export interface HudApi {
  setSlot: (s: number) => void;
  setBreakProgress: (t: number) => void;
  updateDebug: (p: PlayerState, fps: number, chunks: number, day: number) => void;
  showDebug: boolean;
  hotbar: BlockId[];
  slot: number;
  el: HTMLElement;
}

export function createHud(root: HTMLElement): HudApi {
  const el = document.createElement('div');
  el.id = 'hud';
  el.innerHTML = `
    <div id="crosshair"></div>
    <div id="break-bar"><div id="break-fill"></div></div>
    <div id="hotbar"></div>
    <pre id="debug"></pre>
    <div id="hint">Klikk for å spille · WASD · Space · Shift · 1–9 · Esc løser mus<br/>På nettbrett: styrespak + dra for å se</div>
  `;
  root.appendChild(el);

  const atlas = createAtlasCanvas();
  const hotbarEl = el.querySelector('#hotbar') as HTMLElement;
  const hotbar = [...HOTBAR_DEFAULT];
  let slot = 0;

  const renderHotbar = () => {
    hotbarEl.innerHTML = '';
    hotbar.forEach((id, i) => {
      const cell = document.createElement('div');
      cell.className = 'hb-slot' + (i === slot ? ' active' : '');
      const def = BLOCKS[id];
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 32;
      const ctx = c.getContext('2d')!;
      const uv = tileUV(def.tiles.side);
      const sx = uv.u0 * ATLAS_SIZE;
      const sy = uv.v0 * ATLAS_SIZE;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(atlas, sx, sy, 16, 16, 0, 0, 32, 32);
      cell.appendChild(c);
      const lab = document.createElement('span');
      lab.textContent = String(i + 1);
      cell.appendChild(lab);
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        slot = i;
        api.slot = i;
        renderHotbar();
      });
      hotbarEl.appendChild(cell);
    });
  };

  const breakFill = el.querySelector('#break-fill') as HTMLElement;
  const debugEl = el.querySelector('#debug') as HTMLElement;
  let showDebug = true;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF3') {
      showDebug = !showDebug;
      debugEl.style.display = showDebug ? 'block' : 'none';
      api.showDebug = showDebug;
    }
  });

  const api: HudApi = {
    setSlot: (s) => {
      slot = ((s % 9) + 9) % 9;
      api.slot = slot;
      renderHotbar();
    },
    setBreakProgress: (t) => {
      breakFill.style.width = `${Math.max(0, Math.min(1, t)) * 100}%`;
      (el.querySelector('#break-bar') as HTMLElement).style.opacity = t > 0 ? '1' : '0';
    },
    updateDebug: (p, fps, chunks, day) => {
      if (!showDebug) return;
      const cx = Math.floor(p.x / CHUNK_SIZE);
      const cz = Math.floor(p.z / CHUNK_SIZE);
      debugEl.textContent = [
        `Blokkverden it1`,
        `${fps.toFixed(0)} fps`,
        `xyz: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
        `chunk: ${cx} ${cz}`,
        `facing: ${(p.yaw * 180) / Math.PI | 0}° pitch ${(p.pitch * 180) / Math.PI | 0}°`,
        `chunks: ${chunks}`,
        `dag: ${(day * 100).toFixed(0)}%`,
      ].join('\n');
    },
    showDebug,
    hotbar,
    slot,
    el,
  };

  renderHotbar();
  return api;
}
