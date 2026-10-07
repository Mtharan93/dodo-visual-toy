/**
 * physics.ts
 * Spring physics for lens movement, squash & stretch deformation,
 * hold-growth, shockwave lifecycle, and idle drift.
 */

export interface LensPhysicsState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  baseRadius: number;
  radiusX: number;
  radiusY: number;
  angle: number;
  alpha: number; // 0..1 for entering/exiting
  isPointerActive: boolean;
  isPointerDown: boolean;
  holdProgress: number; // 0..1 (grows to 1.6x radius on hold)
  shockOrigin: [number, number];
  shockTime: number; // -1 if inactive, >= 0 when active (seconds)
}

export class LensController {
  public state: LensPhysicsState;
  private width: number = window.innerWidth;
  private height: number = window.innerHeight;
  private dpr: number = Math.min(window.devicePixelRatio || 1, 2);

  // Spring constants
  private stiffness: number = 120.0;
  private damping: number = 16.0;

  // Timers & state
  private idleTime: number = 0;
  private userHasInteracted: boolean = false;
  private reducedMotion: boolean = false;

  constructor(baseRadius: number = 130) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    this.state = {
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
      targetX: centerX,
      targetY: centerY,
      baseRadius,
      radiusX: baseRadius,
      radiusY: baseRadius,
      angle: 0,
      alpha: 1.0,
      isPointerActive: false,
      isPointerDown: false,
      holdProgress: 0,
      shockOrigin: [centerX, centerY],
      shockTime: -1.0,
    };

    this.checkReducedMotion();
  }

  public setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
  }

  public checkReducedMotion(): boolean {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = media.matches;
    return this.reducedMotion;
  }

  public setDimensions(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  public setBaseRadius(radius: number) {
    this.state.baseRadius = radius;
  }

  public onPointerMove(x: number, y: number) {
    this.userHasInteracted = true;
    this.state.isPointerActive = true;
    this.state.targetX = x;
    this.state.targetY = y;
  }

  public onPointerDown(x: number, y: number) {
    this.userHasInteracted = true;
    this.state.isPointerActive = true;
    this.state.isPointerDown = true;
    this.state.targetX = x;
    this.state.targetY = y;
  }

  public onPointerUp(x: number, y: number) {
    this.state.isPointerDown = false;
    // Trigger shockwave at release position
    this.triggerShockwave(x, y);
  }

  public onPointerLeave() {
    this.state.isPointerActive = false;
    this.state.isPointerDown = false;
  }

  public triggerShockwave(x?: number, y?: number) {
    const originX = (x ?? this.state.x) * this.dpr;
    const originY = (y ?? this.state.y) * this.dpr;
    this.state.shockOrigin = [originX, originY];
    this.state.shockTime = 0.0;
  }

  public update(dtSeconds: number) {
    // Clamp delta time to max 33ms to avoid large physics steps
    const dt = Math.min(dtSeconds, 0.033);

    // 1. Idle drift (Lissajous path) on initial load before pointer interaction
    if (!this.userHasInteracted && !this.reducedMotion) {
      this.idleTime += dt;
      const centerX = this.width / 2;
      const centerY = this.height / 2;

      if (this.idleTime < 3.2) {
        const t = this.idleTime * 1.8;
        const driftX = Math.sin(t) * (this.width * 0.28);
        const driftY = Math.sin(t * 1.5) * (this.height * 0.22);
        this.state.targetX = centerX + driftX;
        this.state.targetY = centerY + driftY;
      } else {
        // Settle smoothly to center
        this.state.targetX = centerX;
        this.state.targetY = centerY;
      }
    }

    // 2. Spring physics for position (critically-damped spring)
    const ax = this.stiffness * (this.state.targetX - this.state.x) - this.damping * this.state.vx;
    const ay = this.stiffness * (this.state.targetY - this.state.y) - this.damping * this.state.vy;

    this.state.vx += ax * dt;
    this.state.vy += ay * dt;

    this.state.x += this.state.vx * dt;
    this.state.y += this.state.vy * dt;

    // 3. Velocity tracking for squash and stretch
    const speed = Math.hypot(this.state.vx, this.state.vy);
    const targetAngle = speed > 10 ? Math.atan2(this.state.vy, this.state.vx) : this.state.angle;

    // Smooth angle transition
    this.state.angle += (targetAngle - this.state.angle) * Math.min(1.0, dt * 15.0);

    // Compute stretch factors (up to 1.35x length, 0.85x width)
    const motionScale = this.reducedMotion ? 0.3 : 1.0;
    const maxSpeed = 1600.0;
    const normalizedSpeed = Math.min(speed / maxSpeed, 1.0) * motionScale;

    const targetStretchX = 1.0 + normalizedSpeed * 0.35;
    const targetStretchY = 1.0 - normalizedSpeed * 0.15;

    // 4. Hold-to-expand factor (up to 1.6x base radius)
    const targetHold = this.state.isPointerDown ? 1.0 : 0.0;
    const holdSpeed = this.state.isPointerDown ? 3.0 : 6.0;
    this.state.holdProgress += (targetHold - this.state.holdProgress) * Math.min(1.0, dt * holdSpeed);

    const holdMultiplier = 1.0 + this.state.holdProgress * 0.6; // 1.0 -> 1.6x

    // Final radius values in CSS pixels
    const effectiveBase = this.state.baseRadius * holdMultiplier;
    this.state.radiusX = effectiveBase * targetStretchX;
    this.state.radiusY = effectiveBase * targetStretchY;

    // 5. Alpha / Visibility easing
    if (this.userHasInteracted) {
      const targetAlpha = this.state.isPointerActive ? 1.0 : 0.0;
      // 500ms fade out when pointer leaves
      const fadeSpeed = this.state.isPointerActive ? 8.0 : 2.0;
      this.state.alpha += (targetAlpha - this.state.alpha) * Math.min(1.0, dt * fadeSpeed);
    } else {
      this.state.alpha = 1.0;
    }

    // 6. Shockwave progress
    if (this.state.shockTime >= 0.0) {
      this.state.shockTime += dt;
      if (this.state.shockTime > 1.3) {
        this.state.shockTime = -1.0; // Complete
      }
    }
  }
}
