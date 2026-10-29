import { ITEMS } from '../items/types';
import type { PlayerState } from '../player/physics';
import { CHUNK_SIZE } from '../world/chunk';
import type { Inventory } from '../items/inventory';
import { drawItemIcon } from '../render/renderer';

export interface HudApi {
  setSlot: (s: number) => void;
  setBreakProgress: (t: number) => void;
  updateDebug: (p: PlayerState, fps: number, chunks: number, day: number, extra?: string) => void;
  updateBars: (p: PlayerState) => void;
  refreshHotbar: () => void;
  markDirty: () => void;
  setHintVisible: (on: boolean) => void;
  hideHintNow: () => void;
  showDebug: boolean;
  slot: number;
  el: HTMLElement;
  atlas: HTMLCanvasElement;
}

export function createHud(root: HTMLElement, inv: Inventory, atlas: HTMLCanvasElement): HudApi {
  const el = document.createElement('div');
  el.id = 'hud';
  el.innerHTML = `
    <div id="crosshair"></div>
    <div id="break-bar"><div id="break-fill"></div></div>
    <div id="vitals"><div id="hearts"></div><div id="hunger"></div><div id="bubbles"></div></div>
    <div id="hotbar"></div>
    <pre id="debug"></pre>
    <div id="hint" style="display:none">Klikk · WASD · dobbel-W · Space · Shift · E · 1–9 · høyreklikk ovn/kiste/benk<br/>Spis: høyreklikk mat i hotbar · På nettbrett: styrespak</div>
  `;
  root.appendChild(el);
  const hintEl = el.querySelector('#hint') as HTMLElement;
  let hintVisible = false;
  let hintAllowed = true; // false in test / when user disables
  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  const applyHint = () => { hintEl.style.display = hintVisible && hintAllowed ? 'block' : 'none'; };
  const armHintTimeout = () => {
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintVisible = false; applyHint(); }, 8000);
  };

  const hotbarEl = el.querySelector('#hotbar') as HTMLElement;
  let slot = inv.selected;
  let showDebug = true;
  let hotbarDirty = true;
  let lastBars = '';

  const renderHotbar = () => {
    hotbarEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'hb-slot' + (i === slot ? ' active' : '');
      const s = inv.slots[i];
      if (s) {
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        drawItemIcon(c.getContext('2d')!, atlas, s.id, 0, 0, 32);
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
        slot = i; inv.selected = i; api.slot = i; hotbarDirty = true; renderHotbar();
      });
      hotbarEl.appendChild(cell);
    }
    hotbarDirty = false;
  };

  const breakFill = el.querySelector('#break-fill') as HTMLElement;
  const debugEl = el.querySelector('#debug') as HTMLElement;
  const hearts = el.querySelector('#hearts') as HTMLElement;
  const hunger = el.querySelector('#hunger') as HTMLElement;
  const bubbles = el.querySelector('#bubbles') as HTMLElement;

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
      hotbarDirty = true;
      renderHotbar();
    },
    setBreakProgress: (t) => {
      breakFill.style.width = `${Math.max(0, Math.min(1, t)) * 100}%`;
      (el.querySelector('#break-bar') as HTMLElement).style.opacity = t > 0 ? '1' : '0';
    },
    updateDebug: (p, fps, chunks, day, extra) => {
      if (!showDebug) return;
      const cx = Math.floor(p.x / CHUNK_SIZE);
      const cz = Math.floor(p.z / CHUNK_SIZE);
      const held = inv.held();
      debugEl.textContent = [
        `Blokkverden it8`,
        `${fps.toFixed(0)} fps`,
        `xyz: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
        `chunk: ${cx} ${cz}`,
        `facing: ${((p.yaw * 180) / Math.PI) | 0}°`,
        `chunks: ${chunks}`,
        `dag: ${(day * 100).toFixed(0)}%`,
        `hp: ${p.health.toFixed(0)} hunger: ${p.hunger.toFixed(1)} air: ${p.air.toFixed(0)}`,
        held ? `hold: ${ITEMS[held.id]?.name ?? held.id}` : `hold: —`,
        p.inWater ? 'i vann' : '',
        extra ?? '',
      ].filter(Boolean).join('\n');
    },
    setHintVisible: (on) => {
      hintAllowed = on;
      if (on) { hintVisible = true; armHintTimeout(); }
      else { hintVisible = false; if (hintTimer) clearTimeout(hintTimer); }
      applyHint();
    },
    hideHintNow: () => { hintVisible = false; applyHint(); },
    updateBars: (p) => {
      const key = `${p.health|0},${p.hunger|0},${p.air|0},${p.inWater?1:0}`;
      if (key === lastBars) return;
      lastBars = key;
      hearts.innerHTML = '';
      hunger.innerHTML = '';
      bubbles.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const full = p.health >= (i + 1) * 2;
        const half = !full && p.health >= i * 2 + 1;
        const span = document.createElement('span');
        span.className = 'heart' + (full ? ' full' : half ? ' half' : ' empty');
        span.textContent = full || half ? '♥' : '♡';
        hearts.appendChild(span);
      }
      for (let i = 0; i < 10; i++) {
        const full = p.hunger >= (i + 1) * 2;
        const half = !full && p.hunger >= i * 2 + 1;
        const span = document.createElement('span');
        span.className = 'drum' + (full ? ' full' : half ? ' half' : ' empty');
        span.textContent = full || half ? '🍗' : '○';
        hunger.appendChild(span);
      }
      if (p.inWater || p.air < 20) {
        for (let i = 0; i < 10; i++) {
          const full = p.air >= (i + 1) * 2;
          const span = document.createElement('span');
          span.textContent = full ? '○' : '·';
          span.style.opacity = full ? '1' : '0.3';
          bubbles.appendChild(span);
        }
      }
    },
    refreshHotbar: () => { if (hotbarDirty) renderHotbar(); },
    markDirty: () => { hotbarDirty = true; },
    showDebug,
    slot,
    el,
    atlas,
  };

  renderHotbar();
  return api;
}
