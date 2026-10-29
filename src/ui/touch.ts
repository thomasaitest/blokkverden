import type { InputState } from '../player/controls';

/** On-screen joystick + look + break/place/jump for iPad/iPhone. */
export function setupTouchControls(root: HTMLElement, input: InputState, hooks?: { onInventory?: () => void; onPause?: () => void }): () => void {
  const overlay = document.createElement('div');
  overlay.id = 'touch-controls';
  overlay.innerHTML = `
    <div class="joystick" id="joy">
      <div class="joy-knob" id="joy-knob"></div>
    </div>
    <div class="touch-btns">
      <button type="button" id="btn-jump" class="tbtn">Hoppe</button>
      <button type="button" id="btn-place" class="tbtn">Plasser</button>
      <button type="button" id="btn-break" class="tbtn danger">Knus</button>
      <button type="button" id="btn-sneak" class="tbtn">Smyg</button>
    </div>
    <button type="button" id="btn-inv" class="tbtn">E</button>
    <button type="button" id="btn-pause-touch" class="tbtn">❚❚</button>
    <div class="look-zone" id="look-zone"></div>
  `;
  root.appendChild(overlay);

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  overlay.style.display = isTouch ? 'block' : 'none';

  // Joystick
  const joy = overlay.querySelector('#joy') as HTMLElement;
  const knob = overlay.querySelector('#joy-knob') as HTMLElement;
  let joyId: number | null = null;
  const joyCenter = { x: 0, y: 0 };
  const maxR = 48;

  const onJoyStart = (e: PointerEvent) => {
    if (joyId !== null) return;
    joyId = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    const r = joy.getBoundingClientRect();
    joyCenter.x = r.left + r.width / 2;
    joyCenter.y = r.top + r.height / 2;
    moveJoy(e.clientX, e.clientY);
  };
  const onJoyMove = (e: PointerEvent) => {
    if (e.pointerId !== joyId) return;
    moveJoy(e.clientX, e.clientY);
  };
  const onJoyEnd = (e: PointerEvent) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    input.touchMoveX = 0;
    input.touchMoveY = 0;
    input.forward = input.back = input.left = input.right = false;
    knob.style.transform = 'translate(-50%,-50%)';
  };
  const moveJoy = (cx: number, cy: number) => {
    let dx = cx - joyCenter.x;
    let dy = cy - joyCenter.y;
    const len = Math.hypot(dx, dy) || 1;
    if (len > maxR) {
      dx = (dx / len) * maxR;
      dy = (dy / len) * maxR;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const nx = dx / maxR;
    const ny = dy / maxR;
    input.touchMoveX = nx;
    input.touchMoveY = ny;
    input.forward = ny < -0.25;
    input.back = ny > 0.25;
    input.left = nx < -0.25;
    input.right = nx > 0.25;
    input.sprint = Math.hypot(nx, ny) > 0.85;
  };
  joy.addEventListener('pointerdown', onJoyStart);
  joy.addEventListener('pointermove', onJoyMove);
  joy.addEventListener('pointerup', onJoyEnd);
  joy.addEventListener('pointercancel', onJoyEnd);

  // Look zone (right half)
  const look = overlay.querySelector('#look-zone') as HTMLElement;
  let lookId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  look.addEventListener('pointerdown', (e) => {
    if (lookId !== null) return;
    lookId = e.pointerId;
    look.setPointerCapture(e.pointerId);
    lastX = e.clientX;
    lastY = e.clientY;
    input.touchLookActive = true;
  });
  look.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    input.lookDX += (e.clientX - lastX) * 1.4;
    input.lookDY += (e.clientY - lastY) * 1.4;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const endLook = (e: PointerEvent) => {
    if (e.pointerId !== lookId) return;
    lookId = null;
    input.touchLookActive = false;
  };
  look.addEventListener('pointerup', endLook);
  look.addEventListener('pointercancel', endLook);

  // Buttons
  const btnJump = overlay.querySelector('#btn-jump') as HTMLButtonElement;
  const btnPlace = overlay.querySelector('#btn-place') as HTMLButtonElement;
  const btnBreak = overlay.querySelector('#btn-break') as HTMLButtonElement;

  const hold = (el: HTMLElement, on: () => void, off: () => void) => {
    const start = (e: Event) => {
      e.preventDefault();
      on();
    };
    const end = (e: Event) => {
      e.preventDefault();
      off();
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
  };

  hold(
    btnJump,
    () => {
      input.jump = true;
    },
    () => {
      input.jump = false;
    },
  );
  hold(
    btnBreak,
    () => {
      input.breakHeld = true;
    },
    () => {
      input.breakHeld = false;
    },
  );
  btnPlace.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.placePressed = true;
  });

  const btnSneak = overlay.querySelector('#btn-sneak') as HTMLElement | null;
  if (btnSneak) {
    hold(btnSneak, () => { input.sneak = true; }, () => { input.sneak = false; });
  }
  const btnInv = overlay.querySelector('#btn-inv') as HTMLElement | null;
  if (btnInv) btnInv.addEventListener('pointerdown', (e) => { e.preventDefault(); hooks?.onInventory?.(); });
  const btnPause = overlay.querySelector('#btn-pause-touch') as HTMLElement | null;
  if (btnPause) btnPause.addEventListener('pointerdown', (e) => { e.preventDefault(); hooks?.onPause?.(); });

  return () => overlay.remove();
}
