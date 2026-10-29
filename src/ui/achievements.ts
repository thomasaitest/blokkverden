export type AchieveId =
  | 'first_block' | 'first_craft' | 'first_kill' | 'boat_ride' | 'enter_helvete'
  | 'farm_wheat' | 'enchant' | 'trade' | 'fish' | 'fly';

const DEFS: Record<AchieveId, { title: string; desc: string }> = {
  first_block: { title: 'Første slag', desc: 'Brøt en blokk' },
  first_craft: { title: 'Håndverk', desc: 'Lagde noe på arbeidsbenken' },
  first_kill: { title: 'Jeger', desc: 'Beseiret en mob' },
  boat_ride: { title: 'Sjøbein', desc: 'Rodde en båt' },
  enter_helvete: { title: 'Helvete', desc: 'Gikk gjennom portalen' },
  farm_wheat: { title: 'Bonde', desc: 'Høstet hvete' },
  enchant: { title: 'Magiker', desc: 'Fortryllet en gjenstand' },
  trade: { title: 'Kjøpmann', desc: 'Byttet med Byttebonde' },
  fish: { title: 'Fisker', desc: 'Fikk fisk på stangen' },
  fly: { title: 'Icarus', desc: 'Fløy i kreativ modus' },
};

export class AchievementBus {
  unlocked = new Set<string>();
  private queue: AchieveId[] = [];
  private el: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'achieve-toast';
    this.el.style.cssText = 'position:absolute;top:72px;right:16px;z-index:50;display:flex;flex-direction:column;gap:8px;pointer-events:none';
    root.appendChild(this.el);
    try {
      const raw = localStorage.getItem('bv-achieve');
      if (raw) for (const id of JSON.parse(raw) as string[]) this.unlocked.add(id);
    } catch { /* */ }
  }

  grant(id: AchieveId): void {
    if (this.unlocked.has(id)) return;
    this.unlocked.add(id);
    localStorage.setItem('bv-achieve', JSON.stringify([...this.unlocked]));
    this.queue.push(id);
    this.pump();
  }

  private pump(): void {
    if (!this.queue.length) return;
    const id = this.queue.shift()!;
    const def = DEFS[id];
    const toast = document.createElement('div');
    toast.style.cssText = 'background:rgba(20,20,20,0.92);border:2px solid #d4a017;color:#eee;padding:10px 14px;min-width:200px;animation:fadeIn 0.3s';
    toast.innerHTML = `<div style="color:#d4a017;font-weight:700">Fremskritt</div><div>${def.title}</div><div style="opacity:0.7;font-size:12px">${def.desc}</div>`;
    this.el.appendChild(toast);
    setTimeout(() => { toast.remove(); this.pump(); }, 3500);
  }
}
