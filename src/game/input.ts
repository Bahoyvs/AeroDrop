/**
 * Pointer + keyboard + touch input.
 *
 * Aiming follows the cursor (or the last touch); Jet Boost is Space, right
 * click, the on-screen button, or a double-tap on mobile - all four feed the
 * same one-shot latch that the game consumes each frame.
 */
export class Input {
  pointerX = 0;
  pointerY = 0;
  hasPointer = false;

  private boostLatch = false;
  private keys = new Set<string>();
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private target: HTMLElement | null = null;
  private enabled = false;

  private onPointerMove = (event: PointerEvent): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.hasPointer = true;
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.hasPointer = true;

    if (event.pointerType === 'mouse') {
      if (event.button === 2) this.boostLatch = true;
      return;
    }

    // Touch: a quick second tap near the first one is the boost gesture.
    const now = performance.now();
    const near = Math.hypot(event.clientX - this.lastTapX, event.clientY - this.lastTapY) < 70;
    if (now - this.lastTapTime < 300 && near) {
      this.boostLatch = true;
      this.lastTapTime = 0;
    } else {
      this.lastTapTime = now;
      this.lastTapX = event.clientX;
      this.lastTapY = event.clientY;
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    this.keys.add(event.code);
    if (event.code === 'Space') {
      event.preventDefault();
      this.boostLatch = true;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private onContextMenu = (event: MouseEvent): void => {
    // Right click is a game action, not a menu.
    event.preventDefault();
  };

  private onBlur = (): void => {
    this.keys.clear();
  };

  attach(target: HTMLElement): void {
    if (this.enabled) this.detach();
    this.target = target;
    this.enabled = true;
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    target.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    if (!this.enabled) return;
    this.enabled = false;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.target?.removeEventListener('contextmenu', this.onContextMenu);
    this.target = null;
  }

  /** UI boost button and other external triggers route through here. */
  requestBoost(): void {
    this.boostLatch = true;
  }

  consumeBoost(): boolean {
    const value = this.boostLatch;
    this.boostLatch = false;
    return value;
  }

  clear(): void {
    this.boostLatch = false;
    this.keys.clear();
  }

  /**
   * Keyboard steering, if any keys are held. Returns null when the player is
   * using the pointer, which stays the primary control.
   */
  keyboardAim(): { x: number; y: number } | null {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (x === 0 && y === 0) return null;
    const len = Math.hypot(x, y);
    return { x: x / len, y: y / len };
  }
}
