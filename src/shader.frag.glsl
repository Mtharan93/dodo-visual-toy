#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUV;
out vec4 fragColor;

// Uniforms
uniform vec2 uResolution;
uniform float uDPR;
uniform float uCellSize;

uniform sampler2D uMaskPrev;
uniform sampler2D uMaskNext;
uniform float uMix;

uniform sampler2D uAtlas;

uniform vec2 uLensPos;
uniform vec2 uLensRadius;
uniform float uLensAngle;
uniform float uLensAlpha;

uniform vec2 uShockOrigin;
uniform float uShockTime;

uniform vec3 uColorPaper;
uniform vec3 uColorInk;
uniform vec3 uColorAccent;
uniform vec3 uColorLensPaper;

uniform float uTime;
uniform float uReducedMotion;

// Pseudo-random hash function for staggering and grain
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    // Pixel coordinate with (0,0) at top-left matching canvas 2D
    vec2 p = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);

    // 15 degree grid rotation (0.261799388 rad) applied strictly to dot lattice
    const float cosA = 0.965925826;
    const float sinA = 0.258819045;
    vec2 pRot = vec2(p.x * cosA - p.y * sinA, p.x * sinA + p.y * cosA);

    float cellSize = uCellSize * uDPR;
    vec2 cellIdx = floor(pRot / cellSize);
    vec2 cellCenterRot = (cellIdx + 0.5) * cellSize;
    
    // Cell center converted back to unrotated horizontal screen space
    vec2 cellCenter = vec2(cellCenterRot.x * cosA + cellCenterRot.y * sinA, -cellCenterRot.x * sinA + cellCenterRot.y * cosA);

    // Upright local cell coordinates for glyph sampling (unrotated)
    vec2 uCell = (p - cellCenter) / cellSize + 0.5;

    // Lens ellipse coordinate transform
    vec2 lensRad = max(uLensRadius * uDPR, vec2(1.0));
    float cosL = cos(-uLensAngle);
    float sinL = sin(-uLensAngle);

    // Vector from lens center to current pixel
    vec2 vPixel = p - uLensPos;
    vec2 vPixelRot = vec2(vPixel.x * cosL - vPixel.y * sinL, vPixel.x * sinL + vPixel.y * cosL);
    float eDistPixel = length(vPixelRot / lensRad);

    // Vector from lens center to cell center
    vec2 vCell = cellCenter - uLensPos;
    vec2 vCellRot = vec2(vCell.x * cosL - vCell.y * sinL, vCell.x * sinL + vCell.y * cosL);
    float eDistCell = length(vCellRot / lensRad);

    // Physical Outward Push near lens (within 1.6x radius)
    vec2 displacedCenter = cellCenter;
    float pressScale = 1.0;
    if (eDistCell < 1.6 && eDistCell > 0.001) {
        float pushFalloff = smoothstep(1.6, 1.0, eDistCell) * uLensAlpha * (1.0 - 0.7 * uReducedMotion);
        vec2 pushDir = normalize(vCell);
        displacedCenter += pushDir * (0.35 * cellSize * pushFalloff);
        pressScale += 0.25 * pushFalloff;
    }

    // Shockwave ring expansion & radial displacement
    float shockScale = 1.0;
    if (uShockTime >= 0.0 && uShockTime < 1.3) {
        float waveSpeed = 900.0 * uDPR;
        float waveRadius = waveSpeed * uShockTime;
        float dShock = length(cellCenter - uShockOrigin);
        float ringWidth = (80.0 + uShockTime * 40.0) * uDPR;
        float distToWave = abs(dShock - waveRadius);
        float pulseFactor = distToWave / max(ringWidth * 0.5, 1.0);
        float pulse = exp(-(pulseFactor * pulseFactor));
        float decay = exp(-uShockTime * 2.8) * (1.0 - 0.7 * uReducedMotion);
        vec2 shockDir = normalize(cellCenter - uShockOrigin + vec2(0.001, 0.0));
        displacedCenter += shockDir * (0.6 * cellSize * pulse * decay);
        shockScale += 0.4 * pulse * decay;
    }

    // Staggered text morph using cell ID hash (per-cell transition)
    float cellH = hash21(cellIdx);
    float localMix = clamp((uMix - cellH * 0.35) / 0.65, 0.0, 1.0);
    localMix = smoothstep(0.0, 1.0, localMix);

    // 1. Density for outside halftone dots (sampled at unrotated cellCenter for horizontal text)
    vec2 uvOutside = clamp(cellCenter / uResolution, 0.0, 1.0);
    float dPrev = texture(uMaskPrev, uvOutside).r;
    float dNext = texture(uMaskNext, uvOutside).r;
    float densityOutside = mix(dPrev, dNext, localMix);

    // Halftone dot calculation
    float dotRadius = cellSize * 0.62 * sqrt(densityOutside) * pressScale * shockScale;
    float distFromCenter = length(p - displacedCenter);
    float fw = fwidth(distFromCenter);
    float dotAlpha = 1.0 - smoothstep(dotRadius - fw * 0.75, dotRadius + fw * 0.75, distFromCenter);
    vec3 outsideColor = mix(uColorPaper, uColorInk, dotAlpha);

    // 2. Inside lens: Upright ASCII glyph sampling with magnification distortion
    vec2 cellToLens = cellCenter - uLensPos;
    float lensWeight = 1.0 - smoothstep(0.0, 1.0, eDistCell);
    vec2 samplePosLens = cellCenter - cellToLens * (0.12 * lensWeight);
    vec2 uvLens = clamp(samplePosLens / uResolution, 0.0, 1.0);
    float dLensPrev = texture(uMaskPrev, uvLens).r;
    float dLensNext = texture(uMaskNext, uvLens).r;
    float densityLens = mix(dLensPrev, dLensNext, localMix);

    int glyphIdx = clamp(int(floor(densityLens * 9.999)), 0, 9);
    vec2 atlasUV = vec2((float(glyphIdx) + clamp(uCell.x, 0.0, 1.0)) / 10.0, clamp(uCell.y, 0.0, 1.0));
    float glyphAlpha = texture(uAtlas, atlasUV).r;
    vec3 insideColor = mix(uColorLensPaper, uColorAccent, glyphAlpha);

    // 3. Lens boundary & soft edge transition
    float minLensRad = min(lensRad.x, lensRad.y);
    float pixelDistToEdge = (eDistPixel - 1.0) * minLensRad;
    float insideMask = (1.0 - smoothstep(-1.5, 1.5, pixelDistToEdge)) * uLensAlpha;

    // Thin 1px ink ring boundary outline
    float ringDist = abs(pixelDistToEdge);
    float ringAlpha = (1.0 - smoothstep(0.0, 1.5, ringDist)) * uLensAlpha * 0.85;

    // Blend outside & inside
    vec3 color = mix(outsideColor, insideColor, insideMask);
    color = mix(color, uColorInk, ringAlpha);

    // Paper grain: cheap hash noise at ~3%
    float grain = (hash21(p + vec2(uTime * 0.0001, uTime * 0.0002)) - 0.5) * 0.03;
    color += grain;

    fragColor = vec4(color, 1.0);
}
