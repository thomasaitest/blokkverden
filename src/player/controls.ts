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
    lookDX: 0,
    lookDY: 0,
    touchMoveX: 0,
    touchMoveY: 0,
    touchLookActive: false,
    inventoryOpen: false,
  };
}

export function bindDesktopControls(
  canvas: HTMLElement,
  input: InputState,
  onSlot: (s: number) => void,
  onToggleInventory: () => void,
): () => void {
  const down = new Set<string>();
  let lastW = 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyE') {
      e.preventDefault();
      if (!e.repeat) onToggleInventory();
      return;
    }
    if (input.inventoryOpen) return;
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
    if (e.code === 'KeyW' || e.code === 'ArrowUp') {
      // keep sprint until release of forward? MC keeps until stop. Clear when W up.
      input.sprint = false;
    }
    sync();
  };
  const sync = () => {
    input.forward = down.has('KeyW') || down.has('ArrowUp');
    input.back = down.has('KeyS') || down.has('ArrowDown');
    input.left = down.has('KeyA') || down.has('ArrowLeft');
    input.right = down.has('KeyD') || down.has('ArrowRight');
    input.jump = down.has('Space');
    input.sneak = down.has('ShiftLeft') || down.has('ShiftRight');
    // Ctrl still works as alt sprint
    if (down.has('ControlLeft') || down.has('ControlRight')) input.sprint = true;
    if (!input.forward && !down.has('ControlLeft') && !down.has('ControlRight')) {
      // don't clear double-tap sprint while still holding W — handled on keyup W
    }
  };

  const onMouseDown = (e: MouseEvent) => {
    if (input.inventoryOpen) return;
    if (!input.pointerLocked) {
      canvas.requestPointerLock();
      return;
    }
    if (e.button === 0) input.breakHeld = true;
    if (e.button === 2) input.placePressed = true;
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) input.breakHeld = false;
  };
  const onContext = (e: Event) => e.preventDefault();
  const onMove = (e: MouseEvent) => {
    if (!input.pointerLocked || input.inventoryOpen) return;
    input.lookDX += e.movementX;
    input.lookDY += e.movementY;
  };
  const onLockChange = () => {
    input.pointerLocked = document.pointerLockElement === canvas;
  };
  const onWheel = (e: WheelEvent) => {
    if (input.inventoryOpen) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    input.hotbarSlot = (input.hotbarSlot + dir + 9) % 9;
    onSlot(input.hotbarSlot);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContext);
  window.addEventListener('mousemove', onMove);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('contextmenu', onContext);
    window.removeEventListener('mousemove', onMove);
    document.removeEventListener('pointerlockchange', onLockChange);
    canvas.removeEventListener('wheel', onWheel);
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
