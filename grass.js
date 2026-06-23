// ============================================================
//  grass.js — Star-shaped grass tuft geometry
// ============================================================

/**
 * Create a cardboard-star grass tuft: n quads sharing a vertical center axis,
 * each rotated around Y by (i/n)*180°.
 *
 * @param {number} n              — number of quads per tuft
 * @param {number} halfW          — half-width of each quad
 * @param {number} h              — height of each quad
 * @returns {{ vertices: Float32Array, indices: Uint32Array }}
 */
export function createGrassGeometry(n, halfW, h) {
  const VERTS_PER_QUAD  = 4;
  const IDX_PER_QUAD    = 6;
  const FLOATS_PER_VERT = 5; // x y z u v

  const vertices = new Float32Array(n * VERTS_PER_QUAD * FLOATS_PER_VERT);
  const indices  = new Uint32Array(n * IDX_PER_QUAD);

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI;
    const ca    = Math.cos(angle);
    const sa    = Math.sin(angle);

    const localVerts = [
      [-halfW, 0, 0,  0, 0],
      [ halfW, 0, 0,  1, 0],
      [ halfW, h, 0,  1, 1],
      [-halfW, h, 0,  0, 1],
    ];

    const baseVert  = i * VERTS_PER_QUAD;
    const baseFloat = baseVert * FLOATS_PER_VERT;

    for (let v = 0; v < 4; v++) {
      const [lx, ly, lz, u, tv] = localVerts[v];
      const rx = lx * ca - lz * sa;
      const rz = lx * sa + lz * ca;
      const off = baseFloat + v * FLOATS_PER_VERT;
      vertices[off]     = rx;
      vertices[off + 1] = ly;
      vertices[off + 2] = rz;
      vertices[off + 3] = u;
      vertices[off + 4] = tv;
    }

    const bi = i * IDX_PER_QUAD;
    indices[bi]     = baseVert;
    indices[bi + 1] = baseVert + 1;
    indices[bi + 2] = baseVert + 2;
    indices[bi + 3] = baseVert;
    indices[bi + 4] = baseVert + 2;
    indices[bi + 5] = baseVert + 3;
  }

  return { vertices, indices };
}