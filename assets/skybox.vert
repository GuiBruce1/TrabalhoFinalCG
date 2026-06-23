#version 300 es
precision highp float;

uniform mat4 uInvVP;  // inverse(proj * viewRotationOnly)

out vec3 vDir;

void main() {
  // Fullscreen triangle — same trick as post.vert
  vec2 positions[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
  );

  vec2 pos = positions[gl_VertexID];

  // Unproject clip-space → world-space direction (rotation only, no translation)
  vec4 worldDir = uInvVP * vec4(pos, 1.0, 1.0);
  vDir = worldDir.xyz / worldDir.w;

  // z = w puts the skybox at the far plane (depth = 1.0)
  gl_Position = vec4(pos, 1.0, 1.0);
}
