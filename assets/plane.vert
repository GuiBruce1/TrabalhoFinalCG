#version 300 es
precision highp float;

#include "gnoise.glsl"

in vec3 aPosition;
in vec2 aTexCoord;

uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;
uniform sampler2D uNoiseTex;
uniform float uHeightMul;
uniform float uFrequency;
uniform float uWaterLevel;
uniform float uWaterHeight;

out vec3 vPos;

void main() {
  vec3 pos = aPosition;

  // Detect skirt vertices: aTexCoord.x >= 2.0 flags a side/skirt vertex
  float isSide = step(2.0, aTexCoord.x);

  if (isSide < 0.5) {
    // Regular terrain vertex — apply noise displacement
    vec2 st = aTexCoord * uFrequency;
    float h = gnoise(st);
    float terrainY = h * uHeightMul;

    pos.y = terrainY;
  }

  vPos = pos;

  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(pos, 1.0);
}