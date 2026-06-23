#version 300 es
precision highp float;

in vec2 vTexCoord;
in float vHeight;
in vec3 vNormal; // World space normal
in vec3 vWorldPos;
in vec3 vViewPos;
in vec4 vClipPos;

uniform vec3 uCameraPos;
uniform vec3 uLightPos;    // world-space position of the light planet
uniform vec3 uWaterColor;
uniform vec3 uFoamColor;
uniform float uWaveAmp;

uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;

out vec4 fragColor;

void main() {
  vec3 N       = normalize(vNormal);
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  vec3 L       = normalize(uLightPos - vWorldPos);

  // fresnel-ish term: more reflective when viewed edge-on
  float facing  = max(dot(N, viewDir), 0.0);
  float fresnel = pow(1.0 - facing, 3.0);

  // tint peaks of the wave lighter, troughs darker
  float crestFactor = smoothstep(-uWaveAmp * 0.3, uWaveAmp, vHeight);
  vec3 baseColor = mix(uWaterColor * 0.7, uWaterColor, crestFactor);
  
  // Base water color mixed with foam
  vec3 color = mix(baseColor, uFoamColor, fresnel * 0.5);

  // ---- Sun specular highlight (Blinn-Phong from planet) ----
  vec3 H = normalize(L + viewDir);
  float spec = pow(max(dot(N, H), 0.0), 128.0) * 1.2;
  color += vec3(1.0, 0.95, 0.85) * spec;

  // A simple sky reflection fallback based on fresnel
  vec3 skyFallback = vec3(0.53, 0.81, 0.92);
  color = mix(color, skyFallback, fresnel * 0.8);

  fragColor = vec4(color, 0.85);
}