#version 300 es
precision highp float;

in vec3 aPosition;
in vec2 aTexCoord;

uniform mat4  uProjectionMatrix;
uniform mat4  uModelViewMatrix;
uniform float uTime;
uniform float uPlaneSize;
uniform int   uSegments;
uniform float uWaterLevel;
uniform float uWaveAmp;
uniform float uWaveFreq;
uniform float uWaveSpeed;

out vec2 vTexCoord;
out float vHeight;
out vec3 vNormal;
out vec3 vWorldPos;
out vec3 vViewPos;
out vec4 vClipPos;

void main() {
  // --- subdivide the single quad into a grid, same pattern as the grass shader ---
  int cellsPerAxis = uSegments;
  int cellIndex = gl_InstanceID;
  int cellX = cellIndex % cellsPerAxis;
  int cellZ = cellIndex / cellsPerAxis;

  float cellStep = uPlaneSize / float(cellsPerAxis);

  // place this instance's quad at its grid cell, anchored at the cell's corner
  vec2 worldXZ = vec2(
    -uPlaneSize * 0.5 + float(cellX) * cellStep,
    -uPlaneSize * 0.5 + float(cellZ) * cellStep
  );

  // aPosition is the unit quad's local vertex (e.g. -0.5..0.5); scale it to cell size
  vec3 localPos = aPosition * vec3(cellStep, 1.0, cellStep);
  vec2 vertexXZ = worldXZ + localPos.xz + vec2(cellStep * 0.5); // recenter so quad fills the cell

  // --- 4 overlapping waves with irrational offsets to break repetition ---
  float t = uTime * uWaveSpeed;
  
  // Directions (normalized) and scaled frequencies
  vec2 d1 = vec2(0.8, 0.6);   float f1 = uWaveFreq;
  vec2 d2 = vec2(-0.7, 0.7);  float f2 = uWaveFreq * 1.31;
  vec2 d3 = vec2(0.3, -0.9);  float f3 = uWaveFreq * 2.17;
  vec2 d4 = vec2(0.9, 0.4);   float f4 = uWaveFreq * 3.43;

  float phase1 = dot(vertexXZ, d1) * f1 + t;
  float phase2 = dot(vertexXZ, d2) * f2 + t * 1.1;
  float phase3 = dot(vertexXZ, d3) * f3 + t * 1.3;
  float phase4 = dot(vertexXZ, d4) * f4 + t * 1.5;

  float w1 = sin(phase1);
  float w2 = sin(phase2);
  float w3 = sin(phase3);
  float w4 = sin(phase4);

  // Blend weights sum up to roughly 1.0 (so max amplitude is controlled solely by uWaveAmp)
  float waveHeight = (w1 * 0.45 + w2 * 0.3 + w3 * 0.15 + w4 * 0.1) * uWaveAmp;

  vec3 worldPos = vec3(vertexXZ.x, uWaterLevel + waveHeight, vertexXZ.y);

  // --- analytic normal ---
  float dw1 = cos(phase1) * f1 * 0.45 * uWaveAmp;
  float dw2 = cos(phase2) * f2 * 0.30 * uWaveAmp;
  float dw3 = cos(phase3) * f3 * 0.15 * uWaveAmp;
  float dw4 = cos(phase4) * f4 * 0.10 * uWaveAmp;

  float dHdx = dw1 * d1.x + dw2 * d2.x + dw3 * d3.x + dw4 * d4.x;
  float dHdz = dw1 * d1.y + dw2 * d2.y + dw3 * d3.y + dw4 * d4.y;

  vec3 tangentX = normalize(vec3(1.0, dHdx, 0.0));
  vec3 tangentZ = normalize(vec3(0.0, dHdz, 1.0));
  vec3 normal   = normalize(cross(tangentZ, tangentX));

  vTexCoord = vertexXZ * 0.05;
  vHeight   = waveHeight;
  vNormal   = normal;
  vWorldPos = worldPos;

  vec4 viewPos = uModelViewMatrix * vec4(worldPos, 1.0);
  vViewPos = viewPos.xyz;
  
  vClipPos = uProjectionMatrix * viewPos;
  gl_Position = vClipPos;
}