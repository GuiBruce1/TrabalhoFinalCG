#version 300 es
precision highp float;

uniform sampler2D uGrassSprite;
uniform vec3 uGrassBaseColor;
uniform vec3 uGrassTipColor;

in vec2  vTexCoord;
in float vHeight; // 0 at base, 1 at tip

out vec4 fragColor;

void main() {
  vec4 texel = texture(uGrassSprite, vec2(vTexCoord.s, 1.0 - vTexCoord.t));
  
  // This shouldnt be the best solution, but is good enough for the scope of the project
  if (texel.a < 0.135) discard;

  // Subtle gradient
  vec3 color = mix(uGrassBaseColor, uGrassTipColor, vHeight);
  vec3 finalColor = texel.rgb * color;

  fragColor = vec4(finalColor, texel.a);
}