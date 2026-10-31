export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Space was pressed since the last physics step (a tap shorter than one frame still jumps). */
  jumpTap?: boolean;
  sneak: boolean;
  sprint: boolean;
  breakHeld: boolean;
  placePressed: boolean;
  /** Right mouse / place button currently held (MC hold-to-eat). */
  useHeld: boolean;
  interactPressed: boolean;
  inventoryPressed: boolean;
  hotbarSlot: number;
  pointerLocked: boolean;
  /** True when pointer lock failed / unavailable — drag-to-look is active. */
  dragLookFallback: boolean;
  lookDX: number;
  lookDY: number;
  touchMoveX: number;
  touchMoveY: number;
  touchLookActive: boolean;
  inventoryOpen: boolean;
}

/** Clear held WASD only when the tab is hidden (Cmd+Tab). In-tab lock loss (Esc) keeps them. */
export function shouldClearKeysOnLockLoss(visibilityState: string): boolean {
  return visibilityState === 'hidden';
}

export function createInput(): InputState {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    sneak: false,
    sprint: false,
    breakHeld: false,
    placePressed: false,
    useHeld: false,
    interactPressed: false,
    inventoryPressed: false,
    hotbarSlot: 0,
    pointerLocked: false,
    dragLookFallback: false,
    lookDX: 0,
    lookDY: 0,
    touchMoveX: 0,
    touchMoveY: 0,
    touchLookActive: false,
    inventoryOpen: false,
  };
}

/**
 * Pointer-lock look delta filter. Chrome on macOS coalesces mousemove to one event per
 * frame, so a fast real flick easily gives 150–300 px per event — clamping that (old ±40)
 * made fast turns feel capped. Only drop absurd one-event spikes (OS cursor warps).
 */
export const LOOK_SPIKE_PX = 600;
export function filterLookDelta(m: number): number {
  if (!Number.isFinite(m) || Math.abs(m) > LOOK_SPIKE_PX) return 0;
  return m;
}

/**
 * Hotbar scroll like MC: one notch = one slot. Mac trackpads (and momentum) fire dozens of
 * tiny wheel events per swipe — stepping on each spun the hotbar uncontrollably.
 * Chrome reports trackpad (precise) scrolling with wheelDeltaY === -3·deltaY; those deltas
 * are accumulated. Mouse wheels (Mac: deltaY≈4 but wheelDeltaY=±120) step once per event.
 */
export const WHEEL_PX_PER_SLOT = 50;
export interface WheelAcc { acc: number; lastT: number }
export function wheelSteps(st: WheelAcc, deltaY: number, deltaMode: number, wheelDeltaY: number | undefined, t: number): number {
  if (!deltaY) return 0;
  const precise = deltaMode === 0 && (typeof wheelDeltaY === 'number' && wheelDeltaY !== 0
    ? Math.abs(wheelDeltaY + 3 * deltaY) < 0.5
    : true);
  if (!precise) { st.acc = 0; st.lastT = t; return deltaY > 0 ? 1 : -1; }
  if (t - st.lastT > 250 || Math.sign(st.acc) !== Math.sign(deltaY)) st.acc = 0;
  st.lastT = t;
  st.acc += deltaY;
  const n = Math.trunc(st.acc / WHEEL_PX_PER_SLOT);
  st.acc -= n * WHEEL_PX_PER_SLOT;
  return Math.max(-1, Math.min(1, n)); // never skip slots in one event
}

/** Prefer KeyboardEvent.code so Norwegian/Mac layouts keep WASD on physical keys. */
export function bindDesktopControls(
  canvas: HTMLElement,
  input: InputState,
  onSlot: (s: number) => void,
  onToggleInventory: () => void,
): () => void {
  const down = new Set<string>();
  let lastW = 0;
  let draggingLook = false;
  let lastDragX = 0;
  let lastDragY = 0;
  let wantBreak = false;
  const wheel: WheelAcc = { acc: 0, lastT: -1e9 };

  const sync = () => {
    input.forward = down.has('KeyW') || down.has('ArrowUp');
    input.back = down.has('KeyS') || down.has('ArrowDown');
    input.left = down.has('KeyA') || down.has('ArrowLeft');
    input.right = down.has('KeyD') || down.has('ArrowRight');
    input.jump = down.has('Space');
    input.sneak = down.has('ShiftLeft') || down.has('ShiftRight');
    if (down.has('ControlLeft') || down.has('ControlRight')) input.sprint = true;
  };

  const clearMovement = () => {
    down.clear();
    input.forward = input.back = input.left = input.right = false;
    input.jump = false;
    input.sneak = false;
    input.sprint = false;
    input.breakHeld = false;
    input.useHeld = false;
  };

  const shouldCaptureKeys = () => !input.inventoryOpen;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyE') {
      e.preventDefault();
      if (!e.repeat) onToggleInventory();
      return;
    }
    if (!shouldCaptureKeys()) return;
    if (e.code === 'Space' && !e.repeat) input.jumpTap = true;

    // Stop Space/arrows from scrolling the page or activating a focused button.
    if (
      e.code === 'Space' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault();
    }

    if (e.repeat) {
      down.add(e.code);
      sync();
      return;
    }
    down.add(e.code);
    if (e.code === 'KeyW' || e.code === 'ArrowUp') {
      const now = performance.now();
      if (now - lastW < 300) input.sprint = true;
      lastW = now;
    }
    sync();
    if (e.code >= 'Digit1' && e.code <= 'Digit9') {
      const s = Number(e.code.slice(5)) - 1;
      input.hotbarSlot = s;
      onSlot(s);
    }
    if (e.code === 'KeyF3') e.preventDefault();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    down.delete(e.code);
    if (e.code === 'KeyW' || e.code === 'ArrowUp') input.sprint = false;
    sync();
  };

  const tryLock = () => {
    // Plain request — options like unadjustedMovement reject on some Chrome builds
    // and surface as an unhandled promise rejection that breaks the session.
    try {
      const ret = (canvas as HTMLElement).requestPointerLock() as unknown;
      if (ret && typeof (ret as Promise<void>).then === 'function') {
        (ret as Promise<void>).catch(() => { input.dragLookFallback = true; });
      }
    } catch {
      input.dragLookFallback = true;
    }
  };

  const onMouseDown = (e: MouseEvent) => {
    if (input.inventoryOpen) return;
    // Always focus canvas so keys aren't swallowed by a leftover button focus.
    try {
      (canvas as HTMLElement).focus({ preventScroll: true });
    } catch {
      (canvas as HTMLElement).focus();
    }

    if (!input.pointerLocked) {
      tryLock();
      // Drag-to-look while waiting for lock, or when lock is denied.
      draggingLook = true;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      // MC: the click that (re)captures the mouse is swallowed — it must not mine or
      // place a block (right-click-to-refocus used to drop a block in your face).
      // Only when lock is denied/unavailable do clicks act directly (drag-look mode).
      if (!input.dragLookFallback) return;
      if (e.button === 0) {
        wantBreak = true;
        input.breakHeld = true;
      }
      if (e.button === 2) { input.placePressed = true; input.useHeld = true; }
      return;
    }
    if (e.button === 0) input.breakHeld = true;
    if (e.button === 2) { input.placePressed = true; input.useHeld = true; }
  };

  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 2) input.useHeld = false;
    if (e.button === 0) {
      input.breakHeld = false;
      draggingLook = false;
      wantBreak = false;
    }
  };

  const onContext = (e: Event) => e.preventDefault();

  const onMove = (e: MouseEvent) => {
    if (input.inventoryOpen) return;
    if (input.pointerLocked) {
      // Drop one-frame warp spikes only; keep real fast flicks (Mac coalesced events).
      const mx = filterLookDelta(e.movementX);
      const my = filterLookDelta(e.movementY);
      input.lookDX += mx;
      input.lookDY += my;
      return;
    }
    // Drag-to-look fallback (pointer lock denied / unavailable / not yet acquired).
    if (draggingLook || input.dragLookFallback) {
      if (e.buttons & 1) {
        input.lookDX += e.clientX - lastDragX;
        input.lookDY += e.clientY - lastDragY;
        lastDragX = e.clientX;
        lastDragY = e.clientY;
      }
    }
  };

  const onLockChange = () => {
    input.pointerLocked = document.pointerLockElement === canvas;
    if (input.pointerLocked) {
      input.dragLookFallback = false;
      draggingLook = false;
      if (wantBreak) {
        input.breakHeld = true;
        wantBreak = false;
      }
    } else {
      // Lock lost. Mac Chrome never sends keyup for keys released in another app, so we
      // must drop held keys when the tab is actually hidden (Cmd+Tab). But Esc/pause and
      // other in-tab lock losses keep the key set: clearing here while WASD are still
      // physically held left movement dead after resume until every key was released and
      // pressed again ("suddenly stuck").
      if (shouldClearKeysOnLockLoss(document.visibilityState)) clearMovement();
      else {
        // Still drop mouse buttons — a click-to-pause must not keep mining after resume.
        input.breakHeld = false;
        input.useHeld = false;
      }
      wantBreak = false;
      draggingLook = false;
    }
  };

  const onLockError = () => {
    // Common when the browser denies lock — keep the game playable via drag-look.
    input.dragLookFallback = true;
  };

  const onWheel = (e: WheelEvent) => {
    if (input.inventoryOpen) return;
    e.preventDefault();
    const dir = wheelSteps(wheel, e.deltaY, e.deltaMode, (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY, performance.now());
    if (!dir) return;
    input.hotbarSlot = (input.hotbarSlot + dir + 9) % 9;
    onSlot(input.hotbarSlot);
  };

  // Only clear stuck keys when the tab is actually hidden. window "blur" fires
  // during pointer-lock focus transitions on Chrome/Mac and was wiping WASD.
  const onVisibility = () => {
    if (shouldClearKeysOnLockLoss(document.visibilityState)) clearMovement();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContext);
  window.addEventListener('mousemove', onMove);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('contextmenu', onContext);
    window.removeEventListener('mousemove', onMove);
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('pointerlockerror', onLockError);
    canvas.removeEventListener('wheel', onWheel);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export function consumeLook(input: InputState): { dx: number; dy: number } {
  const dx = input.lookDX;
  const dy = input.lookDY;
  input.lookDX = 0;
  input.lookDY = 0;
  return { dx, dy };
}

export function consumePlace(input: InputState): boolean {
  if (input.placePressed) {
    input.placePressed = false;
    return true;
  }
  return false;
}
