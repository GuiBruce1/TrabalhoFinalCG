#version 300 es
precision highp float;

#include "gnoise.glsl"

in vec3 aPosition;
in vec2 aTexCoord;

uniform mat4  uProjectionMatrix;
uniform mat4  uModelViewMatrix;
uniform float uTime;
uniform float uHeightMul;
uniform float uFrequency;
uniform float uWaterHeight;
uniform float uPlaneSize;

uniform int   uSubdivisions;
uniform int   uSegments;
uniform int   uStride;

out vec2  vTexCoord;
out float vHeight;

void main() {
  // subdivision
  int cellsPerAxis = int(uSegments) / uStride;
  int totalSubs    = uSubdivisions * uSubdivisions;

  int cellIndex = gl_InstanceID / totalSubs;
  int subIndex  = gl_InstanceID % totalSubs;

  int cellX = cellIndex % cellsPerAxis;
  int cellZ = cellIndex / cellsPerAxis;
  int sx    = subIndex  % uSubdivisions;
  int sz    = subIndex  / uSubdivisions;

  float cellStep = uPlaneSize / float(cellsPerAxis);
  float subStep  = cellStep   / float(uSubdivisions);

  // place blade at CENTER of each cell, not at corner
  vec2 worldXZ = vec2(
    -uPlaneSize * 0.5 + (float(cellX) + 0.5) * cellStep + float(sx) * subStep,
    -uPlaneSize * 0.5 + (float(cellZ) + 0.5) * cellStep + float(sz) * subStep  
  );

  // random() returns beetween -1 and 1
  vec2 jitter = random(worldXZ) * subStep * 0.25;
  worldXZ += jitter;

  vec2 terrainUV = worldXZ / uPlaneSize + 0.5;
  vec2 st = terrainUV * uFrequency;
  float h = gnoise(st);
  float terrainY = h * uHeightMul;

  if (terrainY <= uWaterHeight * 2.575) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vTexCoord   = vec2(0.0);
    vHeight     = 0.0;
    return;
  }

  float tipFactor = aTexCoord.t;
  float windPhase = worldXZ.x * 0.08 + worldXZ.y * 0.06;
  float windX     = sin(uTime * 2.5 + windPhase) * tipFactor * 1.2;
  float windZ     = cos(uTime * 1.3 + windPhase * 1.3) * tipFactor * 0.4;

  vec2 r = random(st);
  float t = max(0.485, (r.s + r.t) * 0.5);

  vec3 bladePos = aPosition;
  // Scalling random variation
  bladePos.y   *= t * 6.0;
  bladePos.x   += worldXZ.x + windX;
  bladePos.z   += worldXZ.y + windZ;
  bladePos.y   += terrainY;
  
  vTexCoord = aTexCoord;
  vHeight   = tipFactor * max(0.485, t);

  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(bladePos, 1.0);
}