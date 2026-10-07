/**
 * main.ts
 * Main entry point: bootstrap, render loop, event coordination, and texture lifecycle.
 */

import './style.css';
import vertSrc from './shader.vert.glsl?raw';
import fragSrc from './shader.frag.glsl?raw';
import { initGL, type GLContext } from './gl';
import { createTextMaskRenderer, createGlyphAtlas } from './text';
import { LensController } from './physics';
import { UIController } from './ui';

class HalftoneLensApp {
  private canvas: HTMLCanvasElement;
  private glCtx: GLContext | null = null;
  private textRenderer = createTextMaskRenderer();
  private atlasCanvas = createGlyphAtlas();
  private physics = new LensController(130);
  private ui!: UIController;

  private width = window.innerWidth;
  private height = window.innerHeight;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Texture transition state (prev & next mask textures)
  private currentMaskIndex = 0; // 0: prev is maskPrev, next is maskNext; 1: inverted
  private mixProgress = 1.0;
  private mixDuration = 0.6; // 600ms transition
  private resizeDebounceTimer = 0;

  // Frame timing
  private lastTime = 0;
  private totalTime = 0;
  private isRunning = false;
  private rafId = 0;

  // Dev metrics
  private frameCount = 0;
  private frameTimeSum = 0;

  constructor() {
    this.canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error('Canvas element #gl-canvas not found.');
    }
  }

  public async start() {
    // 1. Initialize WebGL2
    try {
      this.glCtx = initGL(this.canvas, vertSrc, fragSrc);
    } catch (err) {
      console.error('[Halftone Lens] Pipeline initialization error:', err);
      return;
    }

    // Show unsupported fallback ONLY when getContext('webgl2') returned null
    if (!this.glCtx) {
      this.showFallback();
      return;
    }

    try {
      // 2. Initialize UI controller
      this.ui = new UIController({
        onTextChange: (newWord) => this.handleTextChange(newWord),
        onCellSizeChange: (cellSize) => this.handleCellSizeChange(cellSize),
        onLensRadiusChange: (radius) => this.physics.setBaseRadius(radius),
        onSavePNG: () => this.savePNG(),
      });
      this.ui.init();

      // 3. Upload Atlas Texture
      const { textures, updateTextureFromCanvas } = this.glCtx;
      updateTextureFromCanvas(textures.atlas, this.atlasCanvas);

      // 4. Wait for web fonts to load
      try {
        await document.fonts.ready;
      } catch (fontErr) {
        console.warn('[Halftone Lens] Font loading error (proceeding with fallback font):', fontErr);
      }

      // 5. Initial setup & resize
      this.updateDimensions();
      this.setupEventListeners();

      // 6. Initial text render to both mask textures
      this.renderTextMask(this.ui.state.currentWord, false);

      // 7. Initial draw call
      this.drawFrame();

      // 8. Reveal UI and Canvas when fully rendered (after double rAF to guarantee buffer presentation)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.documentElement.classList.add('ready');
          document.body.classList.add('ready');
        });
      });

      // 9. Start continuous render loop
      this.lastTime = performance.now();
      this.isRunning = true;
      this.rafId = requestAnimationFrame((t) => this.frame(t));
    } catch (startupErr) {
      console.error('[Halftone Lens] Error during application startup:', startupErr);
    }
  }

  private showFallback() {
    const fallbackEl = document.getElementById('no-webgl');
    if (fallbackEl) {
      fallbackEl.removeAttribute('hidden');
      fallbackEl.classList.add('active');
    }
    // Also reveal document so fallback content is visible
    document.documentElement.classList.add('ready');
    document.body.classList.add('ready');
  }

  private updateDimensions() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    const pixelWidth = Math.floor(this.width * this.dpr);
    const pixelHeight = Math.floor(this.height * this.dpr);

    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    this.physics.setDimensions(this.width, this.height, this.dpr);

    if (this.glCtx) {
      this.glCtx.gl.viewport(0, 0, pixelWidth, pixelHeight);
    }
  }

  private handleResize() {
    this.updateDimensions();

    // Debounce text re-rasterization (120ms)
    window.clearTimeout(this.resizeDebounceTimer);
    this.resizeDebounceTimer = window.setTimeout(() => {
      this.renderTextMask(this.ui.state.currentWord, false);
    }, 120);
  }

  private handleTextChange(newWord: string) {
    this.renderTextMask(newWord, true);
  }

  private handleCellSizeChange(_cellSize: number) {
    // Cell size is picked up directly in uniform updates
  }

  private renderTextMask(text: string, isTransition: boolean) {
    if (!this.glCtx) return;

    const { textures, updateTextureFromCanvas } = this.glCtx;

    // Rasterize word onto offscreen canvas
    this.textRenderer.updateText(text, this.width, this.height, this.dpr);
    const maskCanvas = this.textRenderer.getCanvas();

    if (isTransition) {
      // Swap mask textures for smooth staggered morph
      if (this.currentMaskIndex === 0) {
        updateTextureFromCanvas(textures.maskNext, maskCanvas);
        this.currentMaskIndex = 1;
      } else {
        updateTextureFromCanvas(textures.maskPrev, maskCanvas);
        this.currentMaskIndex = 0;
      }
      this.mixProgress = 0.0;
      this.mixDuration = this.physics.checkReducedMotion() ? 0.25 : 0.6;
    } else {
      // Direct render (e.g. resize or initial load)
      updateTextureFromCanvas(textures.maskPrev, maskCanvas);
      updateTextureFromCanvas(textures.maskNext, maskCanvas);
      this.mixProgress = 1.0;
    }
  }

  private setupEventListeners() {
    // Resize Observer / Window Resize
    window.addEventListener('resize', () => this.handleResize(), { passive: true });

    // Pointer Events (Unified Mouse, Touch, Pen)
    const onPointerMove = (e: PointerEvent) => {
      this.physics.onPointerMove(e.clientX, e.clientY);
    };

    const onPointerDown = (e: PointerEvent) => {
      // Only process canvas interactions if not clicking inside the dock
      const target = e.target as HTMLElement;
      if (target && (target.closest('.dock-pill') || target.closest('.hint'))) {
        return;
      }
      this.physics.onPointerDown(e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      this.physics.onPointerUp(e.clientX, e.clientY);
    };

    const onPointerLeave = () => {
      this.physics.onPointerLeave();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerLeave, { passive: true });
    document.addEventListener('mouseleave', onPointerLeave, { passive: true });

    // Reduced Motion changes
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', () => {
      this.physics.checkReducedMotion();
    });

    // Visibility change (pause rAF when backgrounded)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.isRunning = false;
        cancelAnimationFrame(this.rafId);
      } else {
        this.lastTime = performance.now();
        this.isRunning = true;
        this.rafId = requestAnimationFrame((t) => this.frame(t));
      }
    });

    // WebGL Context Lost / Restored
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.isRunning = false;
      cancelAnimationFrame(this.rafId);
    });

    this.canvas.addEventListener('webglcontextrestored', async () => {
      await this.start();
    });
  }

  private savePNG() {
    if (!this.glCtx) return;

    // Draw one fresh frame to guarantee active buffer state
    this.drawFrame();

    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const sanitizedWord = this.ui.state.currentWord.replace(/[\n\r\s]+/g, '-').toLowerCase() || 'dodo';
      const filename = `halftone-lens-${sanitizedWord}.png`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  private frame(time: number) {
    if (!this.isRunning) return;

    const dtSeconds = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    this.totalTime += dtSeconds;

    // Update state
    this.physics.update(dtSeconds);
    this.ui.update(dtSeconds);

    // Text mix progress
    if (this.mixProgress < 1.0) {
      this.mixProgress += dtSeconds / this.mixDuration;
      if (this.mixProgress > 1.0) {
        this.mixProgress = 1.0;
      }
    }

    // Render frame
    this.drawFrame();

    // Dev frame performance logging (stripped in production)
    if (import.meta.env.DEV) {
      this.frameCount++;
      this.frameTimeSum += dtSeconds;
      if (this.frameCount >= 180) {
        const avgMs = (this.frameTimeSum / this.frameCount) * 1000;
        console.debug(`[Halftone Lens] Avg Frame Time: ${avgMs.toFixed(2)}ms (${(1000 / avgMs).toFixed(0)} FPS)`);
        this.frameCount = 0;
        this.frameTimeSum = 0;
      }
    }

    this.rafId = requestAnimationFrame((t) => this.frame(t));
  }

  private drawFrame() {
    if (!this.glCtx) return;

    const { gl, program, vao, uniforms, textures } = this.glCtx;
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    // Check cell count limits on small screens to keep under ~120k cells
    let effectiveCellSize = this.ui.state.cellSize;
    const pixelWidth = this.canvas.width;
    const pixelHeight = this.canvas.height;
    const rawCellPixel = effectiveCellSize * this.dpr;
    const totalCells = (pixelWidth * pixelHeight) / (rawCellPixel * rawCellPixel);

    if (totalCells > 120000) {
      // Dynamically compute minimum safe cell size
      const minSafePixelSize = Math.sqrt((pixelWidth * pixelHeight) / 120000);
      effectiveCellSize = Math.max(effectiveCellSize, Math.ceil(minSafePixelSize / this.dpr));
    }

    // Bind textures to active texture units
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(
      gl.TEXTURE_2D,
      this.currentMaskIndex === 0 ? textures.maskPrev : textures.maskNext
    );

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(
      gl.TEXTURE_2D,
      this.currentMaskIndex === 0 ? textures.maskNext : textures.maskPrev
    );

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textures.atlas);

    // Pass uniforms
    gl.uniform2f(uniforms['uResolution'], pixelWidth, pixelHeight);
    gl.uniform1f(uniforms['uDPR'], this.dpr);
    gl.uniform1f(uniforms['uCellSize'], effectiveCellSize);

    // Mix uniform: 0.0 -> 1.0
    gl.uniform1f(uniforms['uMix'], this.mixProgress);

    // Lens uniforms
    const physState = this.physics.state;
    gl.uniform2f(uniforms['uLensPos'], physState.x * this.dpr, physState.y * this.dpr);
    gl.uniform2f(uniforms['uLensRadius'], physState.radiusX, physState.radiusY);
    gl.uniform1f(uniforms['uLensAngle'], physState.angle);
    gl.uniform1f(uniforms['uLensAlpha'], physState.alpha);

    // Shockwave uniforms
    gl.uniform2f(uniforms['uShockOrigin'], physState.shockOrigin[0], physState.shockOrigin[1]);
    gl.uniform1f(uniforms['uShockTime'], physState.shockTime);

    // Theme color uniforms
    const colors = this.ui.state.colors;
    gl.uniform3fv(uniforms['uColorPaper'], colors.paper);
    gl.uniform3fv(uniforms['uColorInk'], colors.ink);
    gl.uniform3fv(uniforms['uColorAccent'], colors.accent);
    gl.uniform3fv(uniforms['uColorLensPaper'], colors.lensPaper);

    // Time & Reduced Motion
    gl.uniform1f(uniforms['uTime'], this.totalTime);
    gl.uniform1f(uniforms['uReducedMotion'], this.physics.checkReducedMotion() ? 1.0 : 0.0);

    // Draw single fullscreen triangle (3 vertices via VBO aPosition)
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

// Failsafe: reveal page if ready class was not added within 2500ms
setTimeout(() => {
  document.documentElement.classList.add('ready');
  document.body.classList.add('ready');
}, 2500);

// Bootstrap application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new HalftoneLensApp();
  app.start().catch((err) => {
    console.error('Failed to start Halftone Lens:', err);
  });
});
