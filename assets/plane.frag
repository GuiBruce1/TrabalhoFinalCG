#version 300 es
precision highp float;

uniform float uHeightMul;
uniform float uWaterLevel;
uniform float uWaterHeight;  // shoreline threshold (slightly above water)
uniform vec3  uLightPos;     // world-space position of the light source

// Terrain gradient colors (controllable from UI)
uniform vec3 uSandDark;
uniform vec3 uSand;
uniform vec3 uValley;
uniform vec3 uHill;
uniform vec3 uRock;
uniform vec3 uSnow;

in vec3  vPos;

out vec4 fragColor;

void main() {
  // Light direction from the light source (single source of truth)
  vec3 L = normalize(uLightPos - vPos);

  // ---- Smooth Surface Normal ----
  vec3 dx = dFdx(vPos);
  vec3 dy = dFdy(vPos);
  vec3 N  = normalize(cross(dx, dy));

  // ---- Blinn-Phong lighting ----
  vec3 V = normalize(vec3(0.0, 1.0, 0.5));
  vec3 H = normalize(L + V);

  float specPower     = 1.0;
  float specIntensity = 0.1;

  float ambient  = 0.75;
  float diffuse  = max(dot(N, L), 0.0);
  float specular = pow(max(dot(N, H), 0.0), specPower) * specIntensity;

  // ---- 3-Layer Altitude-based terrain coloring ----
  float h = vPos.y;

  float shoreTop = uWaterHeight;
  float midTop   = mix(uWaterHeight, uHeightMul, 0.6);

  vec3 color;

  if (h < shoreTop) {
    float range = max(shoreTop - uWaterLevel, 0.01);
    float t = clamp((h - uWaterLevel) / range, 0.0, 1.0);
    color = mix(uSandDark, uSand, t);
  } else if (h < midTop) {
    float range = max(midTop - shoreTop, 0.01);
    float t = clamp((h - shoreTop) / range, 0.0, 1.0);
    float sandBlend = smoothstep(0.0, 0.15, t);
    vec3 zoneBottom = mix(uSand, uValley, sandBlend);
    color = mix(zoneBottom, uHill, t);
  } else {
    float range = max(uHeightMul - midTop, 0.01);
    float t = clamp((h - midTop) / range, 0.0, 1.0);
    float rockBlend = smoothstep(0.0, 0.2, t);
    vec3 zoneBottom = mix(uHill, uRock, rockBlend);
    color = mix(zoneBottom, uSnow, t);
  }

  vec3 finalColor = color * (ambient + diffuse) + vec3(1.0) * specular;
  fragColor = vec4(finalColor, 1.0);
}