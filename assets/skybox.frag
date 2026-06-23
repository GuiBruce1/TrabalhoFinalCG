#version 300 es
precision highp float;

uniform samplerCube uSkybox;

in vec3 vDir;

out vec4 fragColor;

void main() {
  vec3 dir = normalize(vDir);
  fragColor = texture(uSkybox, dir);
}
