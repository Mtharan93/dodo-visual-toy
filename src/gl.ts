/**
 * gl.ts
 * WebGL2 context initialization, shader compilation, texture upload, and uniform management.
 */

export interface GLContext {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uniforms: Record<string, WebGLUniformLocation>;
  textures: {
    maskPrev: WebGLTexture;
    maskNext: WebGLTexture;
    atlas: WebGLTexture;
  };
  updateTextureFromCanvas: (texture: WebGLTexture, canvas: HTMLCanvasElement) => void;
}

/**
 * Compiles a shader from source.
 */
function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create WebGL shader.');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation error: ${info}`);
  }

  return shader;
}

/**
 * Creates and links a WebGL program from vertex and fragment sources.
 */
function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string
): WebGLProgram {
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);

  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to create WebGL program.');
  }

  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }

  // Clean up shaders after linking
  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);

  return program;
}

/**
 * Creates an empty 2D texture with linear filtering and clamp to edge.
 */
function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error('Failed to create WebGL texture.');
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return texture;
}

/**
 * Initializes the full WebGL2 rendering pipeline.
 */
export function initGL(
  canvas: HTMLCanvasElement,
  vertSrc: string,
  fragSrc: string
): GLContext | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });

  if (!gl) {
    return null;
  }

  const glCtx: WebGL2RenderingContext = gl;
  const program = createProgram(glCtx, vertSrc, fragSrc);
  glCtx.useProgram(program);

  // Fullscreen triangle VAO
  const vao = glCtx.createVertexArray();
  if (!vao) {
    return null;
  }
  glCtx.bindVertexArray(vao);

  // Discover and cache all active uniform locations
  const uniforms: Record<string, WebGLUniformLocation> = {};
  const uniformNames = [
    'uResolution',
    'uDPR',
    'uCellSize',
    'uMaskPrev',
    'uMaskNext',
    'uMix',
    'uAtlas',
    'uLensPos',
    'uLensRadius',
    'uLensAngle',
    'uLensAlpha',
    'uShockOrigin',
    'uShockTime',
    'uColorPaper',
    'uColorInk',
    'uColorAccent',
    'uColorLensPaper',
    'uTime',
    'uReducedMotion',
  ];

  for (const name of uniformNames) {
    const loc = glCtx.getUniformLocation(program, name);
    if (loc !== null) {
      uniforms[name] = loc;
    }
  }

  // Create textures for text masks and glyph atlas
  const maskPrev = createTexture(glCtx);
  const maskNext = createTexture(glCtx);
  const atlas = createTexture(glCtx);

  // Bind texture units: 0 = maskPrev, 1 = maskNext, 2 = atlas
  glCtx.uniform1i(uniforms['uMaskPrev'], 0);
  glCtx.uniform1i(uniforms['uMaskNext'], 1);
  glCtx.uniform1i(uniforms['uAtlas'], 2);

  function updateTextureFromCanvas(texture: WebGLTexture, sourceCanvas: HTMLCanvasElement) {
    glCtx.bindTexture(glCtx.TEXTURE_2D, texture);
    glCtx.texImage2D(
      glCtx.TEXTURE_2D,
      0,
      glCtx.RGBA,
      sourceCanvas.width,
      sourceCanvas.height,
      0,
      glCtx.RGBA,
      glCtx.UNSIGNED_BYTE,
      sourceCanvas
    );
  }

  return {
    gl: glCtx,
    program,
    vao,
    uniforms,
    textures: {
      maskPrev,
      maskNext,
      atlas,
    },
    updateTextureFromCanvas,
  };
}
