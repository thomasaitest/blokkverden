import type { Inventory } from '../items/inventory';
import { matchRecipe, consumeCraft, RECIPES } from '../items/crafting';
import { ITEMS, stack, type ItemStack } from '../items/types';
import { drawItemIcon } from '../render/renderer';
import type { FurnaceState } from '../items/furnace';

export type InvMode = 'closed' | 'player' | 'table' | 'chest' | 'furnace';

export interface InventoryUi {
  mode: InvMode;
  openPlayer: () => void;
  openTable: () => void;
  openChest: (slots: (ItemStack | null)[]) => void;
  openFurnace: (f: FurnaceState) => void;
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
  /** Items that no longer fit when closing (craft grid / cursor) are thrown, not lost. */
  onOverflow: (s: ItemStack) => void = () => {},
  /** Fired when a craft result is taken; arg = crafted on the 3×3 table. */
  onCraft: (onTable: boolean) => void = () => {},
): InventoryUi {
  const el = document.createElement('div');
  el.id = 'inv-overlay';
  el.style.display = 'none';
  root.appendChild(el);

  let mode: InvMode = 'closed';
  let craft: (ItemStack | null)[] = Array(4).fill(null);
  let craftResult: ItemStack | null = null;
  let cursor: ItemStack | null = null;
  let chestSlots: (ItemStack | null)[] | null = null;
  let furnace: FurnaceState | null = null;
  let showBook = false;
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
    c.width = 36; c.height = 36;
    drawItemIcon(c.getContext('2d')!, atlas, s.id, 2, 2, 32);
    cell.appendChild(c);
    if (s.count > 1) {
      const n = document.createElement('span');
      n.className = 'stack-count';
      n.textContent = String(s.count);
      cell.appendChild(n);
    }
  };

  const updateCursorVisual = () => {
    const c = ensureCursor();
    if (!cursor) { c.style.display = 'none'; return; }
    c.style.display = 'block';
    paintSlot(c, cursor);
  };

  const mergeOrSwap = (
    get: () => ItemStack | null,
    set: (s: ItemStack | null) => void,
    right: boolean,
  ) => {
    const slot = get();
    if (right) {
      if (cursor) {
        if (!slot) {
          set(stack(cursor.id, 1, cursor.durability));
          cursor.count -= 1;
          if (cursor.count <= 0) cursor = null;
        } else if (slot.id === cursor.id && ITEMS[cursor.id]?.stackable) {
          slot.count += 1;
          cursor.count -= 1;
          if (cursor.count <= 0) cursor = null;
        }
      } else if (slot) {
        const half = Math.ceil(slot.count / 2);
        cursor = stack(slot.id, half, slot.durability);
        slot.count -= half;
        if (slot.count <= 0) set(null);
      }
    } else if (!cursor) {
      cursor = slot; set(null);
    } else if (!slot) {
      set(cursor); cursor = null;
    } else if (slot.id === cursor.id && ITEMS[cursor.id]?.stackable) {
      const max = ITEMS[cursor.id]!.maxStack;
      const n = Math.min(max - slot.count, cursor.count);
      slot.count += n; cursor.count -= n;
      if (cursor.count <= 0) cursor = null;
    } else {
      set(cursor); cursor = slot;
    }
  };

  /** Shift-click: move stack to other section */
  const shiftMove = (from: 'inv' | 'chest' | 'craft' | 'furnace', index: number) => {
    let item: ItemStack | null = null;
    if (from === 'inv') {
      item = inv.slots[index];
      if (!item) return;
      // to chest if open, else to hotbar/main opposite
      if (chestSlots) {
        for (let i = 0; i < chestSlots.length; i++) {
          if (!chestSlots[i]) { chestSlots[i] = item; inv.slots[index] = null; return; }
          if (chestSlots[i]!.id === item.id && ITEMS[item.id]?.stackable) {
            const max = ITEMS[item.id]!.maxStack;
            const n = Math.min(max - chestSlots[i]!.count, item.count);
            chestSlots[i]!.count += n; item.count -= n;
            if (item.count <= 0) inv.slots[index] = null;
            return;
          }
        }
      } else {
        const targetStart = index < 9 ? 9 : 0;
        const targetEnd = index < 9 ? 36 : 9;
        for (let i = targetStart; i < targetEnd; i++) {
          if (!inv.slots[i]) { inv.slots[i] = item; inv.slots[index] = null; return; }
        }
      }
    } else if (from === 'chest' && chestSlots) {
      item = chestSlots[index];
      if (!item) return;
      const left = inv.add(item);
      if (left <= 0) chestSlots[index] = null;
      else item.count = left;
    } else if (from === 'craft') {
      item = craft[index];
      if (!item) return;
      const left = inv.add(item);
      if (left <= 0) craft[index] = null;
      else item.count = left;
      updateCraft();
    }
  };

  const updateCraft = () => {
    const recipe = matchRecipe(craft);
    craftResult = recipe ? { ...recipe.result } : null;
  };

  const takeResult = () => {
    const recipe = matchRecipe(craft);
    if (!recipe || !craftResult) return;
    if (cursor && (cursor.id !== craftResult.id || !ITEMS[cursor.id]?.stackable)) return;
    if (cursor && cursor.id === craftResult.id) cursor.count += craftResult.count;
    else cursor = { ...craftResult };
    consumeCraft(craft);
    onCraft(mode === 'table');
    craftResult = null;
    updateCraft();
    updateCursorVisual();
    onChange();
  };

  const render = () => {
    updateCraft();
    const gridN = mode === 'table' ? 3 : 2;
    if (mode === 'player' || mode === 'table') {
      if (craft.length !== gridN * gridN) {
        const next: (ItemStack | null)[] = Array(gridN * gridN).fill(null);
        for (let i = 0; i < Math.min(craft.length, next.length); i++) next[i] = craft[i];
        craft = next;
        updateCraft();
      }
    }

    let topHtml = '';
    if (mode === 'player' || mode === 'table') {
      topHtml = `
        <div class="craft-row">
          <div class="craft-grid g${gridN}" id="craft-grid"></div>
          <div class="craft-arrow">→</div>
          <div class="hb-slot craft-out" id="craft-out"></div>
          <button type="button" id="btn-book" class="book-btn">Oppskrifter</button>
        </div>
        <div id="recipe-book" class="recipe-book" style="display:${showBook ? 'block' : 'none'}"></div>`;
    } else if (mode === 'chest') {
      topHtml = `<div class="inv-label">Kiste</div><div class="inv-grid" id="chest-grid"></div>`;
    } else if (mode === 'furnace' && furnace) {
      topHtml = `
        <div class="furnace-row">
          <div class="hb-slot" id="fu-in"></div>
          <div class="furnace-prog"><div id="fu-burn"></div><div id="fu-cook"></div></div>
          <div class="hb-slot" id="fu-fuel"></div>
          <div class="craft-arrow">→</div>
          <div class="hb-slot" id="fu-out"></div>
        </div>`;
    }

    el.innerHTML = `
      <div class="inv-panel">
        <div class="inv-title">${
          mode === 'table' ? 'Arbeidsbenk' : mode === 'chest' ? 'Kiste' : mode === 'furnace' ? 'Ovn' : 'Inventar'
        } <small>E / Esc · Shift-klikk flytter</small></div>
        ${topHtml}
        <div class="inv-label">Ryggsekk</div>
        <div class="inv-grid" id="inv-main"></div>
        <div class="inv-label">Hotbar</div>
        <div class="inv-hotbar" id="inv-hot"></div>
      </div>`;

    const bindSlot = (cell: HTMLElement, onClick: (right: boolean, shift: boolean) => void) => {
      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        onClick(e.button === 2 || e.altKey, e.shiftKey);
        render(); updateCursorVisual(); onChange();
      });
      cell.addEventListener('contextmenu', (e) => e.preventDefault());
    };

    if (mode === 'player' || mode === 'table') {
      const grid = el.querySelector('#craft-grid') as HTMLElement;
      for (let i = 0; i < gridN * gridN; i++) {
        const cell = document.createElement('div');
        cell.className = 'hb-slot';
        cell.dataset.craftSlot = String(i);
        paintSlot(cell, craft[i]);
        bindSlot(cell, (right, shift) => {
          if (shift) { shiftMove('craft', i); return; }
          mergeOrSwap(() => craft[i], (s) => { craft[i] = s; }, right);
          updateCraft();
        });
        grid.appendChild(cell);
      }
      const out = el.querySelector('#craft-out') as HTMLElement;
      out.dataset.craftOut = '1';
      paintSlot(out, craftResult);
      bindSlot(out, () => takeResult());
      el.querySelector('#btn-book')?.addEventListener('click', (e) => {
        e.preventDefault();
        showBook = !showBook;
        render();
      });
      if (showBook) {
        const book = el.querySelector('#recipe-book') as HTMLElement;
        for (const r of RECIPES) {
          const row = document.createElement('div');
          row.className = 'recipe-row';
          const name = ITEMS[r.result.id]?.name ?? String(r.result.id);
          row.textContent = `${name} ×${r.result.count} (${r.w}×${r.h})`;
          row.title = r.pattern.map((id) => (id ? ITEMS[id]?.name ?? id : '·')).join(', ');
          book.appendChild(row);
        }
      }
    }

    if (mode === 'chest' && chestSlots) {
      const grid = el.querySelector('#chest-grid') as HTMLElement;
      for (let i = 0; i < 27; i++) {
        const cell = document.createElement('div');
        cell.className = 'hb-slot';
        paintSlot(cell, chestSlots[i]);
        bindSlot(cell, (right, shift) => {
          if (shift) { shiftMove('chest', i); return; }
          mergeOrSwap(() => chestSlots![i], (s) => { chestSlots![i] = s; }, right);
        });
        grid.appendChild(cell);
      }
    }

    if (mode === 'furnace' && furnace) {
      const bindFu = (id: string, get: () => ItemStack | null, set: (s: ItemStack | null) => void) => {
        const cell = el.querySelector(id) as HTMLElement;
        paintSlot(cell, get());
        bindSlot(cell, (right) => mergeOrSwap(get, set, right));
      };
      bindFu('#fu-in', () => furnace!.input, (s) => { furnace!.input = s; });
      bindFu('#fu-fuel', () => furnace!.fuel, (s) => { furnace!.fuel = s; });
      bindFu('#fu-out', () => furnace!.output, (s) => { furnace!.output = s; });
      const burn = el.querySelector('#fu-burn') as HTMLElement;
      const cook = el.querySelector('#fu-cook') as HTMLElement;
      burn.style.width = furnace.burnMax ? `${(furnace.burnLeft / furnace.burnMax) * 100}%` : '0%';
      cook.style.width = furnace.cookMax ? `${(furnace.cook / furnace.cookMax) * 100}%` : '0%';
    }

    const main = el.querySelector('#inv-main') as HTMLElement;
    for (let i = 9; i < 36; i++) {
      const cell = document.createElement('div');
      cell.className = 'hb-slot';
      cell.dataset.invSlot = String(i);
      paintSlot(cell, inv.slots[i]);
      bindSlot(cell, (right, shift) => {
        if (shift) { shiftMove('inv', i); return; }
        mergeOrSwap(() => inv.slots[i], (s) => { inv.slots[i] = s; }, right);
      });
      main.appendChild(cell);
    }
    const hot = el.querySelector('#inv-hot') as HTMLElement;
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'hb-slot' + (i === inv.selected ? ' active' : '');
      cell.dataset.invSlot = String(i);
      paintSlot(cell, inv.slots[i]);
      bindSlot(cell, (right, shift) => {
        if (shift) { shiftMove('inv', i); return; }
        mergeOrSwap(() => inv.slots[i], (s) => { inv.slots[i] = s; }, right);
      });
      hot.appendChild(cell);
    }
  };

  const api: InventoryUi = {
    mode: 'closed',
    openPlayer: () => {
      mode = 'player'; api.mode = mode; craft = Array(4).fill(null);
      chestSlots = null; furnace = null;
      el.style.display = 'flex'; document.exitPointerLock(); render();
    },
    openTable: () => {
      mode = 'table'; api.mode = mode; craft = Array(9).fill(null);
      chestSlots = null; furnace = null;
      el.style.display = 'flex'; document.exitPointerLock(); render();
    },
    openChest: (slots) => {
      mode = 'chest'; api.mode = mode; chestSlots = slots; furnace = null; craft = [];
      el.style.display = 'flex'; document.exitPointerLock(); render();
    },
    openFurnace: (f) => {
      mode = 'furnace'; api.mode = mode; furnace = f; chestSlots = null; craft = [];
      el.style.display = 'flex'; document.exitPointerLock(); render();
    },
    close: () => {
      const giveBack = (s: ItemStack) => {
        const left = inv.add(s);
        if (left > 0) onOverflow({ ...s, count: left });
      };
      for (const s of craft) if (s) giveBack(s);
      craft = Array(4).fill(null);
      if (cursor) { giveBack(cursor); cursor = null; updateCursorVisual(); }
      mode = 'closed'; api.mode = mode; el.style.display = 'none';
      chestSlots = null; furnace = null; showBook = false; onChange();
    },
    isOpen: () => mode !== 'closed',
    refresh: () => { if (mode !== 'closed') render(); },
    el,
  };

  // Esc is handled by main.togglePause (closes the screen AND clears input.inventoryOpen;
  // a separate close here left inventoryOpen=true → WASD dead + pause menu popped up).

  // Periodic refresh for furnace progress while open
  setInterval(() => {
    if (mode === 'furnace') render();
  }, 200);

  return api;
}
