// ============================================================
//  terrain.js —  Tesselated plane geometry with closed skirt
// ============================================================

/**
 * Create a subdivided plane in the XZ plane, centered at origin.
 * Optionally generates solid side walls (skirt) so the mesh isn't
 * hollow from below.
 *
 * Skirt bottom vertices use aTexCoord.x >= 2.0 as a flag so the
 * vertex shader can distinguish them from regular terrain vertices
 * and skip noise displacement (their Y is pre-set on the JS side).
 *
 * @param {number}  w       — total width  (world units)
 * @param {number}  d       — total depth  (world units)
 * @param {number}  segW    — subdivisions along X
 * @param {number}  segD    — subdivisions along Z
 * @param {boolean} [skirt] — whether to generate side walls (default: false)
 */
export function createPlaneGeometry(w, d, segW, segD, skirt = false) {
  // ===========================================================
  //  1. Regular terrain surface
  // ===========================================================
  const surfVertCount = (segW + 1) * (segD + 1);
  const surfIdxCount  = segW * segD * 6;

  if (!skirt) {
    // ---- Simple path: no skirt ----
    const vertices = new Float32Array(surfVertCount * 5);
    let vi = 0;

    for (let iz = 0; iz <= segD; iz++) {
      for (let ix = 0; ix <= segW; ix++) {
        const u = ix / segW;
        const v = iz / segD;
        vertices[vi++] = (u - 0.5) * w;
        vertices[vi++] = 0;
        vertices[vi++] = (v - 0.5) * d;
        vertices[vi++] = u;
        vertices[vi++] = v;
      }
    }

    const indices = new Uint32Array(surfIdxCount);
    let ii = 0;

    for (let iz = 0; iz < segD; iz++) {
      for (let ix = 0; ix < segW; ix++) {
        const i = iz * (segW + 1) + ix;
        indices[ii++] = i;
        indices[ii++] = i + segW + 1;
        indices[ii++] = i + 1;
        indices[ii++] = i + 1;
        indices[ii++] = i + segW + 1;
        indices[ii++] = i + segW + 2;
      }
    }

    return { vertices, indices };
  }

  // ===========================================================
  //  2. Full path: surface + skirt walls
  // ===========================================================

  // Skirt adds only bottom vertices; top verts reuse the surface edge.
  // Per quad we call addBottomVert twice, so:
  //   Front/back edges:  segW quads × 2 = 2*segW  bottom verts each
  //   Left/right edges:  segD quads × 2 = 2*segD  bottom verts each
  const skirtBottomVerts = 4 * segW + 4 * segD;
  const skirtIdxCount    = (2 * segW + 2 * segD) * 6; // 2 tris per quad

  const totalVerts = surfVertCount + skirtBottomVerts;
  const totalIdx   = surfIdxCount + skirtIdxCount;

  const vertices = new Float32Array(totalVerts * 5);
  const indices  = new Uint32Array(totalIdx);

  let vi = 0;
  let ii = 0;

  // ---- Surface vertices ----
  for (let iz = 0; iz <= segD; iz++) {
    for (let ix = 0; ix <= segW; ix++) {
      const u = ix / segW;
      const v = iz / segD;
      vertices[vi++] = (u - 0.5) * w;
      vertices[vi++] = 0;
      vertices[vi++] = (v - 0.5) * d;
      vertices[vi++] = u;
      vertices[vi++] = v;
    }
  }

  // ---- Surface indices ----
  for (let iz = 0; iz < segD; iz++) {
    for (let ix = 0; ix < segW; ix++) {
      const i = iz * (segW + 1) + ix;
      indices[ii++] = i;
      indices[ii++] = i + segW + 1;
      indices[ii++] = i + 1;
      indices[ii++] = i + 1;
      indices[ii++] = i + segW + 1;
      indices[ii++] = i + segW + 2;
    }
  }

  // ===========================================================
  //  3. Skirt geometry — solid walls on each edge
  // ===========================================================
  const skirtBase = -100; // well below any terrain displacement
  let sv = surfVertCount;  // vertex index cursor for new bottom verts

  // Helper: add a bottom skirt vertex at (x, skirtBase, z) and return its index
  function addBottomVert(x, z) {
    const idx = sv++;
    const off = idx * 5;
    vertices[off]     = x;
    vertices[off + 1] = skirtBase;
    vertices[off + 2] = z;
    vertices[off + 3] = 2.0;  // flag: skirt vertex (texcoord.x >= 2.0)
    vertices[off + 4] = 1.0;  // bottom indicator
    return idx;
  }

  // Surface vertex index by grid coordinate
  function surfIdx(ix, iz) {
    return iz * (segW + 1) + ix;
  }

  // ---- Edge 1: Front (iz=0) — normal faces -Z ----
  for (let ix = 0; ix < segW; ix++) {
    const topL = surfIdx(ix, 0);
    const topR = surfIdx(ix + 1, 0);
    const botL = addBottomVert((ix / segW - 0.5) * w, -0.5 * d);
    const botR = addBottomVert(((ix + 1) / segW - 0.5) * w, -0.5 * d);

    indices[ii++] = topL;
    indices[ii++] = botL;
    indices[ii++] = topR;
    indices[ii++] = topR;
    indices[ii++] = botL;
    indices[ii++] = botR;
  }

  // ---- Edge 2: Back (iz=segD) — normal faces +Z ----
  for (let ix = 0; ix < segW; ix++) {
    const topL = surfIdx(ix, segD);
    const topR = surfIdx(ix + 1, segD);
    const botL = addBottomVert((ix / segW - 0.5) * w, 0.5 * d);
    const botR = addBottomVert(((ix + 1) / segW - 0.5) * w, 0.5 * d);

    indices[ii++] = topL;
    indices[ii++] = topR;
    indices[ii++] = botL;
    indices[ii++] = topR;
    indices[ii++] = botR;
    indices[ii++] = botL;
  }

  // ---- Edge 3: Left (ix=0) — normal faces -X ----
  for (let iz = 0; iz < segD; iz++) {
    const topT = surfIdx(0, iz);
    const topB = surfIdx(0, iz + 1);
    const botT = addBottomVert(-0.5 * w, (iz / segD - 0.5) * d);
    const botB = addBottomVert(-0.5 * w, ((iz + 1) / segD - 0.5) * d);

    indices[ii++] = topT;
    indices[ii++] = topB;
    indices[ii++] = botT;
    indices[ii++] = topB;
    indices[ii++] = botB;
    indices[ii++] = botT;
  }

  // ---- Edge 4: Right (ix=segW) — normal faces +X ----
  for (let iz = 0; iz < segD; iz++) {
    const topT = surfIdx(segW, iz);
    const topB = surfIdx(segW, iz + 1);
    const botT = addBottomVert(0.5 * w, (iz / segD - 0.5) * d);
    const botB = addBottomVert(0.5 * w, ((iz + 1) / segD - 0.5) * d);

    indices[ii++] = topT;
    indices[ii++] = botT;
    indices[ii++] = topB;
    indices[ii++] = topB;
    indices[ii++] = botT;
    indices[ii++] = botB;
  }

  return { vertices, indices };
}