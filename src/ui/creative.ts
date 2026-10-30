import { ITEMS } from '../items/types';
import type { Inventory } from '../items/inventory';
import { drawItemIcon } from '../render/renderer';
import { stack } from '../items/types';

export function openCreativeInventory(
  root: HTMLElement,
  inv: Inventory,
  atlas: HTMLCanvasElement,
  onChange: () => void,
): { close: () => void; el: HTMLElement } {
  const el = document.createElement('div');
  el.id = 'creative-inv';
  el.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.55);z-index:45;display:flex;align-items:center;justify-content:center';
  const panel = document.createElement('div');
  panel.style.cssText = 'background:#1a1a1a;border:2px solid #555;padding:12px;max-width:640px;max-height:80vh;overflow:auto;color:#eee';
  panel.innerHTML = `<h3>Kreativt inventar</h3><input id="cr-search" placeholder="Søk…" style="width:100%;margin-bottom:8px;padding:6px"/><div id="cr-grid" style="display:grid;grid-template-columns:repeat(9,48px);gap:4px"></div><button type="button" id="cr-close">Lukk</button>`;
  el.appendChild(panel);
  root.appendChild(el);
  const grid = panel.querySelector('#cr-grid') as HTMLElement;
  const all = Object.values(ITEMS).filter((i) => i.id > 0);
  const render = (q: string) => {
    grid.innerHTML = '';
    const qq = q.toLowerCase();
    for (const def of all) {
      if (qq && !def.name.toLowerCase().includes(qq)) continue;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.style.cssText = 'width:48px;height:48px;padding:0;background:#333;border:1px solid #666;cursor:pointer';
      const c = document.createElement('canvas');
      c.width = 40; c.height = 40;
      drawItemIcon(c.getContext('2d')!, atlas, def.id, 0, 0, 40);
      cell.appendChild(c);
      cell.title = def.name;
      cell.onclick = () => {
        inv.add(stack(def.id, def.stackable ? 64 : 1, def.maxDurability));
        onChange();
      };
      grid.appendChild(cell);
    }
  };
  render('');
  panel.querySelector('#cr-search')!.addEventListener('input', (e) => render((e.target as HTMLInputElement).value));
  const close = () => el.remove();
  panel.querySelector('#cr-close')!.addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  return { close, el };
}
