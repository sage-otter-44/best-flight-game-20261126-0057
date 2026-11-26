// Ridge Runner — Alpine Courier: keyboard and mouse input.
// Arrows / WASD pitch and bank the plane, Shift/Ctrl work the throttle,
// the mouse steers gently toward the pointer, B brakes on the runway.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { x: 0.5, y: 0.5, active: false };
    this.onFirstGesture = null;
    this.onPause = null;
    this.onRestart = null;
    this.onStart = null;
    this.onClick = null;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.key.toLowerCase());
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') this.onPause?.();
      if (e.key === 'r' || e.key === 'R') this.onRestart?.();
      if (e.key === 'Enter') this.onStart?.();
      if (e.key === 'm' || e.key === 'M') this.onMute?.();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) / rect.width;
      this.mouse.y = (e.clientY - rect.top) / rect.height;
      this.mouse.active = true;
    });
    canvas.addEventListener('pointerdown', (e) => {
      this.onFirstGesture?.();
      this.onClick?.();
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) / rect.width;
      this.mouse.y = (e.clientY - rect.top) / rect.height;
      this.mouse.active = true;
    });
    canvas.addEventListener('pointerleave', () => {
      this.mouse.active = false;
    });
  }

  get down() {
    return this.keys.has('arrowdown') || this.keys.has('s');
  }

  get up() {
    return this.keys.has('arrowup') || this.keys.has('w');
  }

  /** Pitch/roll/throttle for one step. Mouse adds a gentle steer. */
  read(throttle) {
    let pitch = 0;
    let roll = 0;
    if (this.up) pitch += 1;
    if (this.down) pitch -= 1;
    if (this.keys.has('arrowleft') || this.keys.has('a')) roll -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) roll += 1;
    if (this.mouse.active) {
      roll += (this.mouse.x - 0.5) * 1.1;
      pitch += (0.5 - this.mouse.y) * 0.9;
    }
    let nextThrottle = throttle;
    if (this.keys.has('shift')) nextThrottle = Math.min(1, throttle + 0.9 * (1 / 60));
    if (this.keys.has('control')) nextThrottle = Math.max(0, throttle - 0.9 * (1 / 60));
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      throttle: nextThrottle,
      brake: this.keys.has('b'),
    };
  }
}
