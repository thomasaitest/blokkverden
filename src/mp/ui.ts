import { NAME_MAX, nameError } from './names.ts';
import { cleanCode, isValidCode } from './codes.ts';
import { getSavedName } from './session.ts';

export type MpMenuResult =
  | { mode: 'host'; name: string }
  | { mode: 'join'; name: string; code: string }
  | null;

/** Simple Sammen sheet on the title screen. */
export function openMpSheet(): Promise<MpMenuResult> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.id = 'mp-sheet';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:200;display:flex;align-items:center;justify-content:center;';
    const panel = document.createElement('div');
    panel.style.cssText = 'background:#1a1a1a;color:#eee;padding:20px 24px;border:2px solid #8b5a2b;min-width:320px;max-width:92vw;';
    panel.innerHTML = `
      <h2 style="margin:0 0 8px">Spill sammen</h2>
      <p style="opacity:0.8;font-size:13px;margin:0 0 12px">Lag et rom (vertens verden) eller skriv inn en 5-bokstavs kode. Maks 4 spillere.</p>
      <label style="display:block;margin:8px 0">Navn<br/>
        <input id="mp-name" maxlength="${NAME_MAX}" value="${getSavedName().replace(/"/g, '&quot;')}" style="width:100%;padding:8px;font-size:16px"/>
      </label>
      <label style="display:block;margin:8px 0">Kode (for å bli med)<br/>
        <input id="mp-code" maxlength="5" placeholder="K7H2M" style="width:100%;padding:8px;font-size:20px;letter-spacing:0.15em;text-transform:uppercase;text-align:center"/>
      </label>
      <p id="mp-err" style="color:#f66;min-height:1.2em;margin:6px 0"></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" id="mp-host" class="primary">Lag rom</button>
        <button type="button" id="mp-join">Bli med</button>
        <button type="button" id="mp-cancel">Avbryt</button>
      </div>
    `;
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    const err = panel.querySelector('#mp-err') as HTMLElement;
    const nameIn = panel.querySelector('#mp-name') as HTMLInputElement;
    const codeIn = panel.querySelector('#mp-code') as HTMLInputElement;
    const close = (r: MpMenuResult) => { backdrop.remove(); resolve(r); };
    panel.querySelector('#mp-cancel')!.addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
    panel.querySelector('#mp-host')!.addEventListener('click', () => {
      const ne = nameError(nameIn.value);
      if (ne) { err.textContent = ne; return; }
      close({ mode: 'host', name: nameIn.value.trim() });
    });
    panel.querySelector('#mp-join')!.addEventListener('click', () => {
      const ne = nameError(nameIn.value);
      if (ne) { err.textContent = ne; return; }
      const code = cleanCode(codeIn.value);
      if (!isValidCode(code)) { err.textContent = 'Skriv en kode på 5 tegn.'; return; }
      close({ mode: 'join', name: nameIn.value.trim(), code });
    });
    nameIn.focus();
  });
}

export function showMpToast(text: string, kind: 'ok' | 'bad' | 'info' = 'info') {
  const el = document.createElement('div');
  el.textContent = text;
  const bg = kind === 'ok' ? '#2a5' : kind === 'bad' ? '#a33' : '#333';
  el.style.cssText = `position:fixed;left:50%;top:72px;transform:translateX(-50%);background:${bg};color:#fff;padding:8px 14px;border-radius:6px;z-index:90;font-size:14px;pointer-events:none;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function ensureMpHud(): HTMLElement {
  let el = document.getElementById('mp-hud');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mp-hud';
    el.style.cssText = 'display:none;position:absolute;left:12px;top:12px;background:rgba(0,0,0,0.55);color:#fff;padding:6px 10px;border-radius:6px;z-index:35;font-size:13px;';
    document.body.appendChild(el);
  }
  return el;
}
