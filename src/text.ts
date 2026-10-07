/**
 * text.ts
 * Offscreen text rasterizer for density masks and ASCII glyph atlas generator.
 * Supports up to 40 characters, word-wrapping into up to 4 lines, long-word character breaking,
 * and binary-search auto-fitting within ~84% width and ~70% height.
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
 * Wraps text into lines that do not exceed maxWidth at the current context font.
 * Wraps at word boundaries where possible, or character boundaries for words longer than maxWidth.
 * Respects explicit newlines.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const resultLines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      resultLines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      if (word.length === 0) {
        // Space preservation
        currentLine += (currentLine ? ' ' : '');
        continue;
      }

      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        // The word doesn't fit on currentLine
        if (currentLine) {
          resultLines.push(currentLine);
          currentLine = '';
        }

        // Check if word alone fits in maxWidth
        const wordWidth = ctx.measureText(word).width;
        if (wordWidth <= maxWidth) {
          currentLine = word;
        } else {
          // Word alone is wider than maxWidth -> break word by character
          for (let c = 0; c < word.length; c++) {
            const char = word[c];
            const charTestLine = currentLine + char;
            if (ctx.measureText(charTestLine).width <= maxWidth) {
              currentLine = charTestLine;
            } else {
              if (currentLine) {
                resultLines.push(currentLine);
              }
              currentLine = char;
            }
          }
        }
      }
    }

    if (currentLine) {
      resultLines.push(currentLine);
    }
  }

  return resultLines;
}

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

    // Normalize text: max 40 chars total, max 4 lines
    const sanitized = sanitizeText(text);
    if (!sanitized || sanitized.length === 0) {
      // Empty text renders a clean black mask (no dots)
      return;
    }

    // Target bounding box: ~84% of viewport width and ~70% of viewport height
    const targetWidth = pixelWidth * 0.84;
    const targetHeight = pixelHeight * 0.70;

    let low = 12 * dpr;
    let high = 450 * dpr;
    let bestSize = low;
    let bestLines: string[] = [sanitized];

    // Binary search for largest font size where wrapped lines <= 4 and fit target bounding box
    for (let iter = 0; iter < 16; iter++) {
      const mid = (low + high) / 2;
      ctx.font = `700 ${mid}px "Space Grotesk", sans-serif`;

      const wrapped = wrapText(ctx, sanitized, targetWidth);
      const lineCount = wrapped.length;

      // Tight line height: 0.90 * fontSize
      const lineHeight = mid * 0.90;
      const totalHeight = lineCount === 1 ? mid * 0.85 : (lineCount - 1) * lineHeight + mid * 0.85;

      if (lineCount <= 4 && totalHeight <= targetHeight) {
        bestSize = mid;
        bestLines = wrapped;
        low = mid; // Try larger font
      } else {
        high = mid; // Try smaller font
      }
    }

    // Failsafe clamp to 4 lines
    if (bestLines.length > 4) {
      bestLines = bestLines.slice(0, 4);
    }

    // Set font and draw styles
    ctx.font = `700 ${bestSize}px "Space Grotesk", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Apply small canvas blur (~2.5px at 1x) for smooth density gradients
    const blurRadius = Math.max(2, Math.round(2.5 * dpr));
    ctx.filter = `blur(${blurRadius}px)`;

    const lineHeight = bestSize * 0.90;
    const totalBlockHeight = (bestLines.length - 1) * lineHeight;
    const startY = pixelHeight / 2 - totalBlockHeight / 2;

    for (let i = 0; i < bestLines.length; i++) {
      const line = bestLines[i];
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
 * Sanitizes input text: enforces max 40 characters total, max 4 lines.
 * Returns empty string if text is empty (does not force DODO fallback).
 */
export function sanitizeText(input: string): string {
  if (!input) return '';
  let cleaned = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n');

  if (lines.length > 4) {
    cleaned = lines.slice(0, 4).join('\n');
  }

  if (cleaned.length > 40) {
    cleaned = cleaned.slice(0, 40);
  }

  return cleaned;
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

