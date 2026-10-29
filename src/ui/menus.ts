import type { GameSettings } from '../settings';
import { loadSettings, saveSettings } from '../settings';
import { listWorlds, deleteWorldNamed } from '../storage/save';

export interface MenuCallbacks {
  onPlay: (worldName: string, seed?: number, fresh?: boolean, creative?: boolean) => void;
  onSettingsChange: (s: GameSettings) => void;
}

export function createTitleMenu(root: HTMLElement, cb: MenuCallbacks): {
  show: () => Promise<void>;
  hide: () => void;
  el: HTMLElement;
} {
  const el = document.createElement('div');
  el.id = 'title-screen';
  el.innerHTML = `
    <div class="title-panel">
      <h1 class="title-logo">Blokkverden</h1>
      <p class="title-sub">En original voxel-sandkasse</p>
      <div class="title-btns">
        <button type="button" id="btn-single">Spill</button>
        <button type="button" id="btn-settings-title">Innstillinger</button>
      </div>
      <div id="world-list" class="world-list" style="display:none"></div>
      <div id="settings-panel" class="settings-panel" style="display:none"></div>
    </div>
  `;
  root.appendChild(el);

  const worldList = el.querySelector('#world-list') as HTMLElement;
  const settingsPanel = el.querySelector('#settings-panel') as HTMLElement;

  const renderSettings = () => {
    const s = loadSettings();
    settingsPanel.innerHTML = `
      <h2>Innstillinger</h2>
      <label>Renderavstand <input type="range" id="s-rd" min="3" max="10" value="${s.renderDistance}"/> <span id="s-rd-v">${s.renderDistance}</span></label>
      <label>FOV <input type="range" id="s-fov" min="50" max="100" value="${s.fov}"/> <span id="s-fov-v">${s.fov}</span></label>
      <label>Musefølsomhet <input type="range" id="s-sens" min="20" max="200" value="${(s.sensitivity * 100) | 0}"/> <span id="s-sens-v">${s.sensitivity.toFixed(2)}</span></label>
      <label>Volum <input type="range" id="s-vol" min="0" max="100" value="${(s.volume * 100) | 0}"/> <span id="s-vol-v">${(s.volume * 100) | 0}%</span></label>
      <label><input type="checkbox" id="s-hints" ${s.showHints ? 'checked' : ''}/> Vis hint-banner</label>
      <label><input type="checkbox" id="s-music" ${s.music ? 'checked' : ''}/> Musikk</label>
      <button type="button" id="s-back">Tilbake</button>
    `;
    const bind = (id: string, fn: (v: number) => void) => {
      settingsPanel.querySelector(id)!.addEventListener('input', (e) => {
        fn(Number((e.target as HTMLInputElement).value));
        const next = loadSettings();
        saveSettings(next);
        cb.onSettingsChange(next);
      });
    };
    bind('#s-rd', (v) => { const s = loadSettings(); s.renderDistance = v; saveSettings(s); (settingsPanel.querySelector('#s-rd-v') as HTMLElement).textContent = String(v); cb.onSettingsChange(s); });
    bind('#s-fov', (v) => { const s = loadSettings(); s.fov = v; saveSettings(s); (settingsPanel.querySelector('#s-fov-v') as HTMLElement).textContent = String(v); cb.onSettingsChange(s); });
    bind('#s-sens', (v) => { const s = loadSettings(); s.sensitivity = v / 100; saveSettings(s); (settingsPanel.querySelector('#s-sens-v') as HTMLElement).textContent = (v / 100).toFixed(2); cb.onSettingsChange(s); });
    bind('#s-vol', (v) => { const s = loadSettings(); s.volume = v / 100; saveSettings(s); (settingsPanel.querySelector('#s-vol-v') as HTMLElement).textContent = `${v}%`; cb.onSettingsChange(s); });
    settingsPanel.querySelector('#s-hints')!.addEventListener('change', (e) => {
      const s = loadSettings(); s.showHints = (e.target as HTMLInputElement).checked; saveSettings(s); cb.onSettingsChange(s);
    });
    settingsPanel.querySelector('#s-music')!.addEventListener('change', (e) => {
      const s = loadSettings(); s.music = (e.target as HTMLInputElement).checked; saveSettings(s); cb.onSettingsChange(s);
    });
    settingsPanel.querySelector('#s-back')!.addEventListener('click', () => {
      settingsPanel.style.display = 'none';
      el.querySelector('.title-btns')!.setAttribute('style', '');
    });
  };

  const renderWorlds = async () => {
    const worlds = await listWorlds();
    worldList.style.display = 'block';
    worldList.innerHTML = `<h2>Verdener</h2>
      <button type="button" id="btn-new-world" class="primary">Ny verden</button>
      <div class="world-rows"></div>
      <button type="button" id="btn-world-back">Tilbake</button>`;
    const rows = worldList.querySelector('.world-rows') as HTMLElement;
    for (const w of worlds) {
      const row = document.createElement('div');
      row.className = 'world-row';
      row.innerHTML = `<span>${w.name}</span><span class="muted">${new Date(w.savedAt).toLocaleString('nb-NO')}</span>
        <button type="button" data-play="${w.name}">Åpne</button>
        <button type="button" data-del="${w.name}" class="danger">Slett</button>`;
      rows.appendChild(row);
    }
    worldList.querySelector('#btn-new-world')!.addEventListener('click', () => {
      const name = prompt('Navn på verden', `Verden ${worlds.length + 1}`);
      if (!name) return;
      const creative = confirm('Kreativ modus? (fly, uendelige blokker)\nOK = kreativ, Avbryt = overlevelse');
      const seed = (Math.random() * 1e9) | 0;
      cb.onPlay(name, seed, true, creative);
    });
    worldList.querySelector('#btn-world-back')!.addEventListener('click', () => {
      worldList.style.display = 'none';
      (el.querySelector('.title-btns') as HTMLElement).style.display = 'flex';
    });
    worldList.querySelectorAll('[data-play]').forEach((b) => {
      b.addEventListener('click', () => cb.onPlay((b as HTMLElement).dataset.play!, undefined, false));
    });
    worldList.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        const n = (b as HTMLElement).dataset.del!;
        if (confirm(`Slette ${n}?`)) { await deleteWorldNamed(n); await renderWorlds(); }
      });
    });
  };

  el.querySelector('#btn-single')!.addEventListener('click', async () => {
    (el.querySelector('.title-btns') as HTMLElement).style.display = 'none';
    await renderWorlds();
  });
  el.querySelector('#btn-settings-title')!.addEventListener('click', () => {
    (el.querySelector('.title-btns') as HTMLElement).style.display = 'none';
    settingsPanel.style.display = 'block';
    renderSettings();
  });

  return {
    el,
    show: async () => { el.style.display = 'flex'; },
    hide: () => { el.style.display = 'none'; },
  };
}

export function createPauseMenu(root: HTMLElement, cb: {
  onResume: () => void;
  onSettingsChange: (s: GameSettings) => void;
  onQuit: () => void;
}): { show: () => void; hide: () => void; el: HTMLElement; isOpen: () => boolean } {
  const el = document.createElement('div');
  el.id = 'pause-menu';
  el.style.display = 'none';
  el.innerHTML = `
    <div class="pause-panel">
      <h2>Pause</h2>
      <button type="button" id="p-resume">Fortsett</button>
      <div id="p-settings"></div>
      <button type="button" id="p-quit">Til tittel</button>
    </div>`;
  root.appendChild(el);
  const box = el.querySelector('#p-settings') as HTMLElement;
  const refresh = () => {
    const s = loadSettings();
    box.innerHTML = `
      <label>Renderavstand <input type="range" id="p-rd" min="3" max="10" value="${s.renderDistance}"/> <span>${s.renderDistance}</span></label>
      <label>FOV <input type="range" id="p-fov" min="50" max="100" value="${s.fov}"/> <span>${s.fov}</span></label>
      <label>Følsomhet <input type="range" id="p-sens" min="20" max="200" value="${(s.sensitivity*100)|0}"/> <span>${s.sensitivity.toFixed(2)}</span></label>
      <label>Volum <input type="range" id="p-vol" min="0" max="100" value="${(s.volume*100)|0}"/> <span>${(s.volume*100)|0}%</span></label>
      <label><input type="checkbox" id="p-hints" ${s.showHints?'checked':''}/> Vis hint-banner</label>
      <label><input type="checkbox" id="p-music" ${s.music?'checked':''}/> Musikk</label>`;
    const wire = (id: string, apply: (v: number, s: GameSettings) => void) => {
      box.querySelector(id)!.addEventListener('input', (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        const cur = loadSettings();
        apply(v, cur);
        saveSettings(cur);
        cb.onSettingsChange(cur);
        refresh();
      });
    };
    wire('#p-rd', (v, s) => { s.renderDistance = v; });
    wire('#p-fov', (v, s) => { s.fov = v; });
    wire('#p-sens', (v, s) => { s.sensitivity = v / 100; });
    wire('#p-vol', (v, s) => { s.volume = v / 100; });
    box.querySelector('#p-hints')!.addEventListener('change', (e) => {
      const cur = loadSettings(); cur.showHints = (e.target as HTMLInputElement).checked; saveSettings(cur); cb.onSettingsChange(cur);
    });
    box.querySelector('#p-music')!.addEventListener('change', (e) => {
      const cur = loadSettings(); cur.music = (e.target as HTMLInputElement).checked; saveSettings(cur); cb.onSettingsChange(cur);
    });
  };
  el.querySelector('#p-resume')!.addEventListener('click', () => cb.onResume());
  el.querySelector('#p-quit')!.addEventListener('click', () => cb.onQuit());
  return {
    el,
    show: () => { refresh(); el.style.display = 'flex'; },
    hide: () => { el.style.display = 'none'; },
    isOpen: () => el.style.display !== 'none',
  };
}
