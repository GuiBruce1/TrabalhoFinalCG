// ============================================================
//  cGeom — Custom geometry class (pure WebGL 2, no p5.js)
// ============================================================

export const DRAW_MODE = {
  VERTICES:  'vertices',
  INDICES:   'indices',
  INSTANCED: 'instanced',
};

export class cGeom {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {WebGLProgram} program
   * @param {Array<{name:string, size:number}>} vertexFormat
   */
  constructor(gl, program, vertexFormat) {
    this.gl = gl;
    this.program = program;

    // Resolve attribute locations from the linked program
    this.format = vertexFormat.map(attr => ({
      name:     attr.name,
      size:     attr.size,
      location: gl.getAttribLocation(program, attr.name),
    }));

    this.vertices = null; // Float32Array
    this.indices  = null; // Uint32Array

    this.vao = null;
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();

    this.instanceCount  = 0;
  }

  // ---- internal helpers ----

  _stride(fmt) {
    return fmt.reduce((sum, a) => sum + a.size, 0) * 4; // bytes
  }

  _bindAttribPointers(fmt) {
    const gl     = this.gl;
    const stride = this._stride(fmt);
    let offset   = 0;

    for (const a of fmt) {
      if (a.location >= 0) {
        gl.enableVertexAttribArray(a.location);
        gl.vertexAttribPointer(a.location, a.size, gl.FLOAT, false, stride, offset);
      }
      offset += a.size * 4;
    }
  }

  // ---- public API ----

  /** Upload vertex + index data and configure the VAO. */
  setup() {
    const gl = this.gl;

    if (!(this.vertices instanceof Float32Array))
      throw new Error('cGeom.setup: vertices must be a Float32Array');
    if (!(this.indices instanceof Uint32Array))
      throw new Error('cGeom.setup: indices must be a Uint32Array');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Vertex buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STATIC_DRAW);
    this._bindAttribPointers(this.format);

    // Index buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  /** Draw the geometry. */
  draw(mode = DRAW_MODE.INDICES) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    switch (mode) {
      case DRAW_MODE.VERTICES: {
        const vertSize = this.format.reduce((s, a) => s + a.size, 0);
        gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / vertSize);
        break;
      }
      case DRAW_MODE.INDICES:
        gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_INT, 0);
        break;
        
      case DRAW_MODE.INSTANCED:
        gl.drawElementsInstanced(
          gl.TRIANGLES, this.indices.length, gl.UNSIGNED_INT, 0, this.instanceCount
        );
        break;

      default:
        console.warn(`cGeom.draw: unknown mode "${mode}"`);
    }

    gl.bindVertexArray(null);
  }
}
