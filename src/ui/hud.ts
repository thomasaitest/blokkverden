import { ITEMS, type ItemStack } from '../items/types';
import { createAtlasCanvas, tileUV, ATLAS_SIZE } from '../blocks/textures';
import type { PlayerState } from '../player/physics';
import { CHUNK_SIZE } from '../world/chunk';
import type { Inventory } from '../items/inventory';
import { drawItemIcon } from '../render/renderer';

export interface HudApi {
  setSlot: (s: number) => void;
  setBreakProgress: (t: number) => void;
  updateDebug: (p: PlayerState, fps: number, chunks: number, day: number) => void;
  updateBars: (p: PlayerState) => void;
  refreshHotbar: () => void;
  showDebug: boolean;
  slot: number;
  el: HTMLElement;
  atlas: HTMLCanvasElement;
}

export function createHud(root: HTMLElement, inv: Inventory, atlas?: HTMLCanvasElement): HudApi {
  const el = document.createElement('div');
  el.id = 'hud';
  el.innerHTML = `
    <div id="crosshair"></div>
    <div id="break-bar"><div id="break-fill"></div></div>
    <div id="vitals">
      <div id="hearts"></div>
      <div id="hunger"></div>
    </div>
    <div id="hotbar"></div>
    <pre id="debug"></pre>
    <div id="hint">Klikk for å spille · WASD · dobbel-W sprint · Space · Shift · E inventar · 1–9<br/>På nettbrett: styrespak + dra for å se</div>
  `;
  root.appendChild(el);

  const atlasCanvas = atlas ?? createAtlasCanvas();
  const hotbarEl = el.querySelector('#hotbar') as HTMLElement;
  let slot = inv.selected;
  let showDebug = true;

  const renderHotbar = () => {
    hotbarEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'hb-slot' + (i === slot ? ' active' : '');
      const s = inv.slots[i];
      if (s) {
        const c = document.createElement('canvas');
        c.width = 32;
        c.height = 32;
        const ctx = c.getContext('2d')!;
        drawItemIcon(ctx, atlasCanvas, s.id, 0, 0, 32);
        cell.appendChild(c);
        if (s.count > 1) {
          const lab = document.createElement('span');
          lab.className = 'stack-count';
          lab.textContent = String(s.count);
          cell.appendChild(lab);
        }
      }
      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = String(i + 1);
      cell.appendChild(num);
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        slot = i;
        inv.selected = i;
        api.slot = i;
        renderHotbar();
      });
      hotbarEl.appendChild(cell);
    }
  };

  const breakFill = el.querySelector('#break-fill') as HTMLElement;
  const debugEl = el.querySelector('#debug') as HTMLElement;
  const hearts = el.querySelector('#hearts') as HTMLElement;
  const hunger = el.querySelector('#hunger') as HTMLElement;

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
      inv.selected = slot;
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
      const held = inv.held();
      debugEl.textContent = [
        `Blokkverden it2`,
        `${fps.toFixed(0)} fps`,
        `xyz: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
        `chunk: ${cx} ${cz}`,
        `facing: ${((p.yaw * 180) / Math.PI) | 0}° pitch ${((p.pitch * 180) / Math.PI) | 0}°`,
        `chunks: ${chunks}`,
        `dag: ${(day * 100).toFixed(0)}%`,
        `hp: ${p.health.toFixed(0)} hunger: ${p.hunger.toFixed(0)}`,
        held ? `hold: ${ITEMS[held.id]?.name ?? held.id}` : `hold: —`,
      ].join('\n');
    },
    updateBars: (p) => {
      const h = Math.max(0, Math.min(20, p.health));
      const g = Math.max(0, Math.min(20, p.hunger));
      hearts.textContent = '♥'.repeat(Math.ceil(h / 2)) + (h % 2 ? '' : '');
      hearts.dataset.val = String(h);
      // simpler: 10 icons
      hearts.innerHTML = '';
      hunger.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const full = h >= (i + 1) * 2;
        const half = !full && h >= i * 2 + 1;
        const span = document.createElement('span');
        span.className = 'heart' + (full ? ' full' : half ? ' half' : ' empty');
        span.textContent = full || half ? '♥' : '♡';
        hearts.appendChild(span);
      }
      for (let i = 0; i < 10; i++) {
        const full = g >= (i + 1) * 2;
        const half = !full && g >= i * 2 + 1;
        const span = document.createElement('span');
        span.className = 'drum' + (full ? ' full' : half ? ' half' : ' empty');
        span.textContent = full || half ? '🍗' : '○';
        hunger.appendChild(span);
      }
    },
    refreshHotbar: renderHotbar,
    showDebug,
    slot,
    el,
    atlas: atlasCanvas,
  };

  renderHotbar();
  return api;
}
