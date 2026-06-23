#version 300 es
precision highp float;

out vec2 vTexCoord;

void main() {
  // Fullscreen triangle trick — 3 vertices, no VBO needed
  // Vertex 0: (-1, -1)  Vertex 1: (3, -1)  Vertex 2: (-1, 3)
  // When clipped by the GPU, this single oversized triangle
  // perfectly covers the entire screen.
  vec2 positions[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
  );

  vec2 pos = positions[gl_VertexID];
  vTexCoord = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
