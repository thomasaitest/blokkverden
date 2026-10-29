export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
  breakHeld: boolean;
  placePressed: boolean;
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
  };

  const shouldCaptureKeys = () => !input.inventoryOpen;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyE') {
      e.preventDefault();
      if (!e.repeat) onToggleInventory();
      return;
    }
    if (!shouldCaptureKeys()) return;

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
      return;
    }
    if (e.button === 0) input.breakHeld = true;
    if (e.button === 2) input.placePressed = true;
  };

  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      input.breakHeld = false;
      draggingLook = false;
    }
  };

  const onContext = (e: Event) => e.preventDefault();

  const onMove = (e: MouseEvent) => {
    if (input.inventoryOpen) return;
    if (input.pointerLocked) {
      input.lookDX += e.movementX;
      input.lookDY += e.movementY;
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
    }
  };

  const onLockError = () => {
    // Common when the browser denies lock — keep the game playable via drag-look.
    input.dragLookFallback = true;
  };

  const onWheel = (e: WheelEvent) => {
    if (input.inventoryOpen) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    input.hotbarSlot = (input.hotbarSlot + dir + 9) % 9;
    onSlot(input.hotbarSlot);
  };

  const onBlur = () => clearMovement();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContext);
  window.addEventListener('mousemove', onMove);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('blur', onBlur);

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
    window.removeEventListener('blur', onBlur);
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
