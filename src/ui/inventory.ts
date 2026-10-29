import type { Inventory } from '../items/inventory';
import { matchRecipe, consumeCraft, type Recipe } from '../items/crafting';
import { ITEMS, stack, type ItemStack } from '../items/types';
import { drawItemIcon } from '../render/renderer';

export type InvMode = 'closed' | 'player' | 'table';

export interface InventoryUi {
  mode: InvMode;
  openPlayer: () => void;
  openTable: () => void;
  close: () => void;
  isOpen: () => boolean;
  refresh: () => void;
  el: HTMLElement;
}

export function createInventoryUi(
  root: HTMLElement,
  inv: Inventory,
  atlas: HTMLCanvasElement,
  onChange: () => void,
): InventoryUi {
  const el = document.createElement('div');
  el.id = 'inv-overlay';
  el.style.display = 'none';
  root.appendChild(el);

  let mode: InvMode = 'closed';
  let craft: (ItemStack | null)[] = Array(4).fill(null);
  let craftResult: ItemStack | null = null;
  let cursor: ItemStack | null = null;
  let cursorEl: HTMLElement | null = null;

  const ensureCursor = () => {
    if (cursorEl) return cursorEl;
    cursorEl = document.createElement('div');
    cursorEl.id = 'inv-cursor';
    root.appendChild(cursorEl);
    window.addEventListener('pointermove', (e) => {
      if (!cursorEl || !cursor) return;
      cursorEl.style.left = `${e.clientX + 8}px`;
      cursorEl.style.top = `${e.clientY + 8}px`;
    });
    return cursorEl;
  };

  const paintSlot = (cell: HTMLElement, s: ItemStack | null) => {
    cell.innerHTML = '';
    if (!s) return;
    const c = document.createElement('canvas');
    c.width = 36;
    c.height = 36;
    const ctx = c.getContext('2d')!;
    drawItemIcon(ctx, atlas, s.id, 2, 2, 32);
    cell.appendChild(c);
    if (s.count > 1) {
      const n = document.createElement('span');
      n.className = 'stack-count';
      n.textContent = String(s.count);
      cell.appendChild(n);
    }
    const def = ITEMS[s.id];
    if (def?.maxDurability && s.durability != null && s.durability < def.maxDurability) {
      const bar = document.createElement('div');
      bar.className = 'dur-bar';
      const pct = s.durability / def.maxDurability;
      bar.innerHTML = `<i style="width:${pct * 100}%"></i>`;
      cell.appendChild(bar);
    }
  };

  const updateCursorVisual = () => {
    const c = ensureCursor();
    if (!cursor) {
      c.style.display = 'none';
      return;
    }
    c.style.display = 'block';
    paintSlot(c, cursor);
  };

  const takeResult = () => {
    const recipe = matchRecipe(craft);
    if (!recipe || !craftResult) return;
    if (cursor && (cursor.id !== craftResult.id || !ITEMS[cursor.id]?.stackable)) return;
    if (cursor && cursor.id === craftResult.id) {
      cursor.count += craftResult.count;
    } else {
      cursor = { ...craftResult };
    }
    consumeCraft(craft);
    craftResult = null;
    updateCraft();
    updateCursorVisual();
    onChange();
  };

  const updateCraft = () => {
    const recipe: Recipe | null = matchRecipe(craft);
    craftResult = recipe ? { ...recipe.result } : null;
  };

  const clickCraftSlot = (i: number, right: boolean) => {
    if (right) {
      // place one
      if (cursor) {
        if (!craft[i]) {
          craft[i] = stack(cursor.id, 1, cursor.durability);
          cursor.count -= 1;
          if (cursor.count <= 0) cursor = null;
        } else if (craft[i]!.id === cursor.id && ITEMS[cursor.id]?.stackable) {
          craft[i]!.count += 1;
          cursor.count -= 1;
          if (cursor.count <= 0) cursor = null;
        }
      } else if (craft[i]) {
        cursor = stack(craft[i]!.id, 1, craft[i]!.durability);
        craft[i]!.count -= 1;
        if (craft[i]!.count <= 0) craft[i] = null;
      }
    } else {
      // swap / merge
      if (!cursor) {
        cursor = craft[i];
        craft[i] = null;
      } else if (!craft[i]) {
        craft[i] = cursor;
        cursor = null;
      } else if (craft[i]!.id === cursor.id && ITEMS[cursor.id]?.stackable) {
        const max = ITEMS[cursor.id]!.maxStack;
        const space = max - craft[i]!.count;
        const n = Math.min(space, cursor.count);
        craft[i]!.count += n;
        cursor.count -= n;
        if (cursor.count <= 0) cursor = null;
      } else {
        const t = craft[i];
        craft[i] = cursor;
        cursor = t;
      }
    }
    updateCraft();
    render();
    updateCursorVisual();
    onChange();
  };

  const clickInvSlot = (i: number, right: boolean) => {
    if (right) {
      if (cursor) {
        if (!inv.slots[i]) {
          inv.slots[i] = stack(cursor.id, 1, cursor.durability);
          cursor.count -= 1;
          if (cursor.count <= 0) cursor = null;
        } else if (inv.slots[i]!.id === cursor.id && ITEMS[cursor.id]?.stackable) {
          inv.slots[i]!.count += 1;
          cursor.count -= 1;
          if (cursor.count <= 0) cursor = null;
        }
      } else if (inv.slots[i]) {
        const half = Math.ceil(inv.slots[i]!.count / 2);
        cursor = stack(inv.slots[i]!.id, half, inv.slots[i]!.durability);
        inv.slots[i]!.count -= half;
        if (inv.slots[i]!.count <= 0) inv.slots[i] = null;
      }
    } else {
      if (!cursor) {
        cursor = inv.slots[i];
        inv.slots[i] = null;
      } else if (!inv.slots[i]) {
        inv.slots[i] = cursor;
        cursor = null;
      } else if (inv.slots[i]!.id === cursor.id && ITEMS[cursor.id]?.stackable) {
        const max = ITEMS[cursor.id]!.maxStack;
        const space = max - inv.slots[i]!.count;
        const n = Math.min(space, cursor.count);
        inv.slots[i]!.count += n;
        cursor.count -= n;
        if (cursor.count <= 0) cursor = null;
      } else {
        const t = inv.slots[i];
        inv.slots[i] = cursor;
        cursor = t;
      }
    }
    render();
    updateCursorVisual();
    onChange();
  };

  const render = () => {
    updateCraft();
    const gridN = mode === 'table' ? 3 : 2;
    if (craft.length !== gridN * gridN) {
      const next: (ItemStack | null)[] = Array(gridN * gridN).fill(null);
      for (let i = 0; i < Math.min(craft.length, next.length); i++) next[i] = craft[i];
      craft = next;
      updateCraft();
    }

    el.innerHTML = `
      <div class="inv-panel">
        <div class="inv-title">${mode === 'table' ? 'Arbeidsbenk' : 'Inventar'} <small>E / Esc lukker</small></div>
        <div class="craft-row">
          <div class="craft-grid g${gridN}" id="craft-grid"></div>
          <div class="craft-arrow">→</div>
          <div class="hb-slot craft-out" id="craft-out"></div>
        </div>
        <div class="inv-label">Ryggsekk</div>
        <div class="inv-grid" id="inv-main"></div>
        <div class="inv-label">Hotbar</div>
        <div class="inv-hotbar" id="inv-hot"></div>
      </div>
    `;

    const grid = el.querySelector('#craft-grid') as HTMLElement;
    for (let i = 0; i < gridN * gridN; i++) {
      const cell = document.createElement('div');
      cell.className = 'hb-slot';
      paintSlot(cell, craft[i]);
      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clickCraftSlot(i, e.button === 2 || e.altKey);
      });
      cell.addEventListener('contextmenu', (e) => e.preventDefault());
      grid.appendChild(cell);
    }

    const out = el.querySelector('#craft-out') as HTMLElement;
    paintSlot(out, craftResult);
    out.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      takeResult();
      render();
    });

    const main = el.querySelector('#inv-main') as HTMLElement;
    for (let i = 9; i < 36; i++) {
      const cell = document.createElement('div');
      cell.className = 'hb-slot';
      paintSlot(cell, inv.slots[i]);
      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clickInvSlot(i, e.button === 2 || e.altKey);
      });
      cell.addEventListener('contextmenu', (e) => e.preventDefault());
      main.appendChild(cell);
    }
    const hot = el.querySelector('#inv-hot') as HTMLElement;
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'hb-slot' + (i === inv.selected ? ' active' : '');
      paintSlot(cell, inv.slots[i]);
      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clickInvSlot(i, e.button === 2 || e.altKey);
      });
      cell.addEventListener('contextmenu', (e) => e.preventDefault());
      hot.appendChild(cell);
    }
  };

  const api: InventoryUi = {
    mode: 'closed',
    openPlayer: () => {
      mode = 'player';
      api.mode = mode;
      craft = Array(4).fill(null);
      el.style.display = 'flex';
      document.exitPointerLock();
      render();
    },
    openTable: () => {
      mode = 'table';
      api.mode = mode;
      craft = Array(9).fill(null);
      el.style.display = 'flex';
      document.exitPointerLock();
      render();
    },
    close: () => {
      // Return craft items
      for (const s of craft) {
        if (s) inv.add(s);
      }
      craft = Array(4).fill(null);
      if (cursor) {
        inv.add(cursor);
        cursor = null;
        updateCursorVisual();
      }
      mode = 'closed';
      api.mode = mode;
      el.style.display = 'none';
      onChange();
    },
    isOpen: () => mode !== 'closed',
    refresh: () => {
      if (mode !== 'closed') render();
    },
    el,
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && mode !== 'closed') {
      api.close();
    }
  });

  return api;
}
