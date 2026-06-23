#version 300 es
precision highp float;

uniform sampler2D uSceneTexture;
uniform vec2      uResolution;

in vec2 vTexCoord;
out vec4 fragColor;

void main() {
  vec4 color = texture(uSceneTexture, vTexCoord);
  fragColor = color;
}
