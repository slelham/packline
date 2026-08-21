const GAME_CODES = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "KeyW",
  "KeyS",
  "Enter",
  "KeyR",
]);

export class Input {
  keys = new Set<string>();
  jumpBuffer = 0;
  slideBuffer = 0;
  jumpHeld = false;
  slideHeld = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onBlur: () => void;
  private onPointerDown: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;
  private padJump = false;
  private padSlide = false;
  private target: HTMLElement;

  constructor(target: HTMLElement) {
    this.target = target;
    this.onKeyDown = (e) => {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        this.jumpBuffer = 0.18;
        this.jumpHeld = true;
      }
      if (e.code === "ArrowDown" || e.code === "KeyS") {
        this.slideBuffer = 0.18;
        this.slideHeld = true;
      }
      if (e.code === "Enter" || e.code === "KeyR") this.jumpBuffer = Math.max(this.jumpBuffer, 0.08);
    };
    this.onKeyUp = (e) => {
      this.keys.delete(e.code);
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") this.jumpHeld = false;
      if (e.code === "ArrowDown" || e.code === "KeyS") this.slideHeld = false;
    };
    this.onBlur = () => {
      this.keys.clear();
      this.jumpHeld = false;
      this.slideHeld = false;
      this.pointers.clear();
    };
    this.onPointerDown = (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-ui]")) return;
      e.preventDefault();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        this.target.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.jumpBuffer = 0.18;
      this.jumpHeld = true;
    };
    this.onPointerMove = (e) => {
      const start = this.pointers.get(e.pointerId);
      if (!start) return;
      const dy = e.clientY - start.y;
      if (dy > 28) {
        this.slideBuffer = 0.14;
        this.slideHeld = true;
        this.jumpBuffer = 0;
      } else if (dy < -28) {
        this.jumpBuffer = 0.14;
        this.slideHeld = false;
      }
    };
    this.onPointerUp = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) {
        this.jumpHeld = false;
        this.slideHeld = false;
      }
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onBlur);
    target.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    target.addEventListener("pointermove", this.onPointerMove, { passive: false });
    target.addEventListener("pointerup", this.onPointerUp);
    target.addEventListener("pointercancel", this.onPointerUp);
  }

  requestSlide() {
    this.slideBuffer = 0.18;
    this.slideHeld = true;
  }

  releaseSlide() {
    this.slideHeld = false;
  }

  requestJump() {
    this.jumpBuffer = 0.18;
    this.jumpHeld = true;
  }

  releaseJump() {
    this.jumpHeld = false;
  }

  clear() {
    this.jumpBuffer = 0;
    this.slideBuffer = 0;
    this.jumpHeld = false;
    this.slideHeld = false;
    this.pointers.clear();
  }

  tick(dt: number) {
    this.pollGamepad();
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.slideBuffer = Math.max(0, this.slideBuffer - dt);
  }

  consumeJump() {
    if (this.jumpBuffer <= 0) return false;
    this.jumpBuffer = 0;
    return true;
  }

  consumeSlide() {
    if (this.slideBuffer <= 0) return false;
    this.slideBuffer = 0;
    return true;
  }

  private pollGamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    let padJump = false;
    let padSlide = false;
    for (const pad of pads) {
      if (!pad) continue;
      const a = pad.buttons[0]?.pressed;
      const b = pad.buttons[1]?.pressed;
      const down = pad.buttons[13]?.pressed || (pad.axes[1] ?? 0) > 0.55;
      const up = pad.buttons[12]?.pressed || (pad.axes[1] ?? 0) < -0.55;
      if (a || up) padJump = true;
      if (b || down) padSlide = true;
    }
    if (padJump && !this.padJump) this.jumpBuffer = 0.14;
    if (padJump) this.jumpHeld = true;
    else if (this.padJump && !this.jumpKeyDown() && this.pointers.size === 0) this.jumpHeld = false;
    if (padSlide) {
      this.slideBuffer = 0.14;
      this.slideHeld = true;
    } else if (this.padSlide && !this.keys.has("ArrowDown") && !this.keys.has("KeyS") && this.pointers.size === 0) {
      this.slideHeld = false;
    }
    this.padJump = padJump;
    this.padSlide = padSlide;
  }

  private jumpKeyDown() {
    return this.keys.has("Space") || this.keys.has("ArrowUp") || this.keys.has("KeyW");
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onBlur);
    this.target.removeEventListener("pointerdown", this.onPointerDown);
    this.target.removeEventListener("pointermove", this.onPointerMove);
    this.target.removeEventListener("pointerup", this.onPointerUp);
    this.target.removeEventListener("pointercancel", this.onPointerUp);
  }
}
