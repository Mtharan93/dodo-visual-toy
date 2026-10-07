/**
 * text.ts
 * Offscreen text rasterizer for density masks and ASCII glyph atlas generator.
 */

export interface TextMaskRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  updateText: (text: string, width: number, height: number, dpr: number) => void;
  getCanvas: () => HTMLCanvasElement;
}

export interface AtlasRenderer {
  canvas: HTMLCanvasElement;
  createAtlas: () => HTMLCanvasElement;
}

/**
 * ASCII ramp string from sparse to dense (10 glyphs)
 */
export const ASCII_RAMP = " .:-=+*#%@";

/**
 * Creates an offscreen canvas for rendering the word mask with smooth density gradients.
 */
export function createTextMaskRenderer(): TextMaskRenderer {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;

  function updateText(text: string, width: number, height: number, dpr: number) {
    const pixelWidth = Math.max(64, Math.floor(width * dpr));
    const pixelHeight = Math.max(64, Math.floor(height * dpr));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    // Fill background with black (zero density)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);

    // Normalize text: max 14 chars, max 2 lines
    const sanitized = sanitizeText(text);
    const lines = sanitized.split('\n').slice(0, 2);

    if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
      return;
    }

    // Auto-fit font size to ~80% of width and ~60% of height
    const targetWidth = pixelWidth * 0.8;
    const targetHeight = pixelHeight * 0.6;

    let low = 12 * dpr;
    let high = 400 * dpr;
    let bestSize = low;

    // Binary search for optimal font size
    for (let iter = 0; iter < 8; iter++) {
      const mid = (low + high) / 2;
      ctx.font = `700 ${mid}px "Space Grotesk", sans-serif`;

      let maxLineWidth = 0;
      for (const line of lines) {
        const metrics = ctx.measureText(line);
        if (metrics.width > maxLineWidth) {
          maxLineWidth = metrics.width;
        }
      }

      const totalHeight = mid * (lines.length === 1 ? 1.0 : 2.1);

      if (maxLineWidth <= targetWidth && totalHeight <= targetHeight) {
        bestSize = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    // Set font and draw styles
    ctx.font = `700 ${bestSize}px "Space Grotesk", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Apply small canvas blur (~2.5px at 1x) for smooth density gradients
    const blurRadius = Math.max(2, Math.round(2.5 * dpr));
    ctx.filter = `blur(${blurRadius}px)`;

    const lineHeight = bestSize * 1.08;
    const totalBlockHeight = (lines.length - 1) * lineHeight;
    const startY = pixelHeight / 2 - totalBlockHeight / 2;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineY = startY + i * lineHeight;
      ctx.fillText(line, pixelWidth / 2, lineY);
    }

    // Reset filter
    ctx.filter = 'none';
  }

  return {
    canvas,
    ctx,
    updateText,
    getCanvas: () => canvas,
  };
}

/**
 * Sanitizes input text: enforces max 14 characters total, max 2 lines
 */
export function sanitizeText(input: string): string {
  // Replace multiple newlines or CRLF with single newline
  let cleaned = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n');

  if (lines.length > 2) {
    cleaned = lines.slice(0, 2).join('\n');
  }

  if (cleaned.length > 14) {
    cleaned = cleaned.slice(0, 14);
  }

  return cleaned.trim() === '' ? 'DODO' : cleaned;
}

/**
 * Creates the 10x1 glyph atlas texture for ASCII ramp in JetBrains Mono.
 * Total dimensions: 640x64 (each glyph cell 64x64).
 */
export function createGlyphAtlas(): HTMLCanvasElement {
  const cellSize = 64;
  const numGlyphs = ASCII_RAMP.length; // 10
  const canvas = document.createElement('canvas');
  canvas.width = cellSize * numGlyphs;
  canvas.height = cellSize;

  const ctx = canvas.getContext('2d')!;

  // Background: black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Text setup: JetBrains Mono 400
  const fontSize = Math.floor(cellSize * 0.72);
  ctx.font = `400 ${fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < numGlyphs; i++) {
    const char = ASCII_RAMP[i];
    const centerX = i * cellSize + cellSize / 2;
    const centerY = cellSize / 2 + 1; // minor optical offset

    if (char !== ' ') {
      ctx.fillText(char, centerX, centerY);
    }
  }

  return canvas;
}
