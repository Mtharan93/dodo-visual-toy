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
 * Compiles a shader from source with detailed info logging.
 */
function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  shaderName: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    const errorMsg = `[Halftone Lens] gl.createShader failed for ${shaderName}.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  const infoLog = gl.getShaderInfoLog(shader);

  if (!compiled) {
    gl.deleteShader(shader);
    const errorMsg = `[Halftone Lens] ${shaderName} compilation failed:\n${infoLog || 'No info log'}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  } else if (infoLog && infoLog.trim().length > 0) {
    console.warn(`[Halftone Lens] ${shaderName} compilation warning:\n${infoLog}`);
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
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertSrc, 'Vertex Shader');
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc, 'Fragment Shader');

  const program = gl.createProgram();
  if (!program) {
    const errorMsg = '[Halftone Lens] gl.createProgram failed.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
  const infoLog = gl.getProgramInfoLog(program);

  if (!linked) {
    gl.deleteProgram(program);
    const errorMsg = `[Halftone Lens] Program link failed:\n${infoLog || 'No info log'}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  } else if (infoLog && infoLog.trim().length > 0) {
    console.warn(`[Halftone Lens] Program link warning:\n${infoLog}`);
  }

  // Shaders can be safely detached & deleted after successful link
  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);

  return program;
}

/**
 * Creates an empty 2D texture with linear filtering and clamp to edge.
 */
function createTexture(gl: WebGL2RenderingContext, textureName: string): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    const errorMsg = `[Halftone Lens] gl.createTexture failed for ${textureName}.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return texture;
}

/**
 * Initializes the WebGL2 rendering context and pipeline.
 * Returns null ONLY if canvas.getContext('webgl2') returns null.
 * Any pipeline error (shader compilation, linking, texture allocation) throws an Error.
 */
export function initGL(
  canvas: HTMLCanvasElement,
  vertSrc: string,
  fragSrc: string
): GLContext | null {
  // Capture any context creation error message
  let contextCreationErrorMsg = '';
  const handleCreationError = (e: Event) => {
    const errEvent = e as WebGLContextEvent;
    contextCreationErrorMsg = errEvent.statusMessage || 'Unknown context creation error';
  };
  canvas.addEventListener('webglcontextcreationerror', handleCreationError, { once: true });

  // Use strictly the specified context attributes
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });

  canvas.removeEventListener('webglcontextcreationerror', handleCreationError);

  if (!gl) {
    console.error(
      `[Halftone Lens] getContext('webgl2') returned null. Status message: ${
        contextCreationErrorMsg || 'none'
      }`
    );
    return null;
  }

  const glCtx: WebGL2RenderingContext = gl;

  // Compile program and log errors if any
  const program = createProgram(glCtx, vertSrc, fragSrc);
  glCtx.useProgram(program);

  // Setup Fullscreen triangle VAO & VBO for maximum driver compatibility
  const vao = glCtx.createVertexArray();
  if (!vao) {
    const errorMsg = '[Halftone Lens] gl.createVertexArray failed.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  glCtx.bindVertexArray(vao);

  const vbo = glCtx.createBuffer();
  if (!vbo) {
    const errorMsg = '[Halftone Lens] gl.createBuffer failed.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, vbo);

  // Fullscreen triangle covering clipspace [-1, 1]
  const vertices = new Float32Array([
    -1.0, -1.0,
     3.0, -1.0,
    -1.0,  3.0,
  ]);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, vertices, glCtx.STATIC_DRAW);

  const posLoc = glCtx.getAttribLocation(program, 'aPosition');
  if (posLoc !== -1) {
    glCtx.enableVertexAttribArray(posLoc);
    glCtx.vertexAttribPointer(posLoc, 2, glCtx.FLOAT, false, 0, 0);
  }

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
  const maskPrev = createTexture(glCtx, 'uMaskPrev');
  const maskNext = createTexture(glCtx, 'uMaskNext');
  const atlas = createTexture(glCtx, 'uAtlas');

  // Bind texture units: 0 = maskPrev, 1 = maskNext, 2 = atlas
  if (uniforms['uMaskPrev']) glCtx.uniform1i(uniforms['uMaskPrev'], 0);
  if (uniforms['uMaskNext']) glCtx.uniform1i(uniforms['uMaskNext'], 1);
  if (uniforms['uAtlas']) glCtx.uniform1i(uniforms['uAtlas'], 2);

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
