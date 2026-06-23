// ============================================================
//  main.js — Entry point (pure WebGL 2, no p5.js)
//  Terrain with displacement + Grass star with instancing
// ============================================================

import { mat3, mat4, vec3 } from 'https://unpkg.com/gl-matrix@3.4.3/esm/index.js';
import { cGeom, DRAW_MODE } from './cGeom.js';
import { createGrassGeometry } from './grass.js';
import { createPlaneGeometry } from './plane.js';

// ======================== CONFIG ========================
// Change these to adjust terrain resolution / size.
const PLANE_SIZE     = 2048;   // world units (width & depth)
const PLANE_SEGMENTS = 256;   // subdivisions per axis (256x256)

// Grass tuft configuration
const GRASS_SUBDIVISIONS   = 1;
const GRASS_STRIDE         = 1;     // sample every Nth terrain vertex for placement
const GRASS_QUADS          = 2;     // quads per tuft (cardboard star)

const CELLSIZE = (PLANE_SIZE / PLANE_SEGMENTS) * GRASS_STRIDE;

const GRASS_HALF_W         = CELLSIZE;   // half-width of each quad
const GRASS_HEIGHT         = CELLSIZE;   // height of each quad

const SEED = Math.floor(Math.random() * 1000) + 1;

// ====================== GLOBALS =========================
let /** @type {WebGL2RenderingContext} */ gl;
let /** @type {HTMLCanvasElement} */      canvas;

// Programs
let planeProgram, grassProgram, waterProgram, postProgram;
let skyboxProgram;

// Geometry
let planeGeom, grassGeom, waterGeom;
let skyboxVao;

// Textures
let grassSpriteTex;
let skyboxTex;

// Uniform locations (plane)
let pLoc = {};
// Uniform locations (grass)
let gLoc = {};
// Uniform locations (water)
let wLoc = {};
// Uniform locations (post-processing)
let ppLoc = {};
// Uniform locations (skybox)
let sLoc = {};

// Post-processing FBOs
let fboPost, fboPostColorTex, fboPostDepthRbo;
let postVao;

// Camera (spherical coords)
let camR = 800, camTheta = 1.0, camPhi = 0.6;
let dragging = false, prevMX = 0, prevMY = 0;

// State
let grass = true;
let heightMul = 250;
let frequency = 5;
let waterLevel = 0;
let waterHeight = 5;  // slightly above waterLevel — controls coastal zone ceiling
let grassBColor = [0.0, 0.56, 0.0];
let grassTColor = [1.0, 1.0, 0.0];

// Light
let lightPos = [-250.0, 230.0, 170.0];

// Terrain gradient colors (default values)
let terrainSandDark = [0.60, 0.53, 0.36];
let terrainSand     = [0.76, 0.70, 0.50];
let terrainValley   = [0.12, 0.35, 0.08];
let terrainHill     = [0.30, 0.52, 0.18];
let terrainRock     = [0.55, 0.48, 0.38];
let terrainSnow     = [0.75, 0.72, 0.65];

// Water
let waveAmp   = 6.5;
let waveFreq  = 0.014;
let waveSpeed = 1.0;
let waterColor = [0.1, 0.3, 0.7];
let foamColor  = [0.9, 0.95, 1.0];

// FPS
let fpsFrames = 0, fpsLast = 0, fpsDisplay = 0;

// ================== SHADER UTILITIES ====================

async function loadShaderSource(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load shader: ${url}`);
  let source = await res.text();

  const includeRegex = /^[ \t]*#[ \t]*include[ \t]+["<]([^">]+)[">].*$/gm;
  
  let match;
  let replacements = [];
  
  while ((match = includeRegex.exec(source)) !== null) {
    const fullMatch = match[0];
    const includePath = match[1];
    
    const urlObj = new URL(url, window.location.href);
    const resolvedUrl = new URL(includePath, urlObj).href;
    
    const includedContent = await loadShaderSource(resolvedUrl);
    
    replacements.push({
      target: fullMatch,
      content: includedContent
    });
  }
  
  for (const rep of replacements) {
    source = source.replace(rep.target, rep.content);
  }
  
  return source;
}

function compileShader(type, src, label) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(`Shader compile error [${label}]:`, gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function linkProgram(vs, fs, label) {
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(`Program link error [${label}]:`, gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

async function buildProgram(vertUrl, fragUrl, label) {
  const [vSrc, fSrc] = await Promise.all([
    loadShaderSource(vertUrl),
    loadShaderSource(fragUrl),
  ]);
  const vs = compileShader(gl.VERTEX_SHADER, vSrc, label + '.vert');
  const fs = compileShader(gl.FRAGMENT_SHADER, fSrc, label + '.frag');
  if (!vs || !fs) return null;
  return linkProgram(vs, fs, label);
}

// ============== IMAGE TEXTURE LOADER ====================

function loadImageTexture(url) {
  return new Promise((resolve, reject) => {
    const tex = gl.createTexture();
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      resolve(tex);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

async function loadCubemap(urls) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);

  const targets = [
    gl.TEXTURE_CUBE_MAP_POSITIVE_X,
    gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
    gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
    gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
    gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
    gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
  ];

  const loadFace = (url, target) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
        gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to load cubemap face: ${url}`));
      img.src = url;
    });
  };

  await Promise.all(urls.map((url, i) => loadFace(url, targets[i])));

  gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  return tex;
}

// =============== FBO SETUP ==============================

function setupFBO() {
  const w = canvas.width;
  const h = canvas.height;

  // ==== fboPost ====
  fboPostColorTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fboPostColorTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  fboPostDepthRbo = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, fboPostDepthRbo);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

  fboPost = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboPost);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboPostColorTex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fboPostDepthRbo);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// ==================== INIT ==============================

async function init() {
  canvas = document.getElementById('glCanvas');
  gl = canvas.getContext('webgl2', { antialias: true });
  if (!gl) { alert('WebGL 2 not supported'); return; }

  resize();
  window.addEventListener('resize', resize);

  // ---- Compile shader programs ----
  [planeProgram, grassProgram, waterProgram, postProgram, skyboxProgram] = await Promise.all([
    buildProgram('assets/plane.vert', 'assets/plane.frag', 'plane'),
    buildProgram('assets/grass.vert', 'assets/grass.frag', 'grass'),
    buildProgram('assets/water.vert', 'assets/water.frag', 'water'),
    buildProgram('assets/post.vert',  'assets/post.frag',  'post'),
    buildProgram('assets/skybox.vert', 'assets/skybox.frag', 'skybox'),
  ]);

  if (!planeProgram || !waterProgram || !grassProgram || !postProgram || !skyboxProgram) {
    console.error('Shader compilation failed — aborting.');
    return;
  }

  // ---- Plane uniform locations ----
  pLoc.proj        = gl.getUniformLocation(planeProgram, 'uProjectionMatrix');
  pLoc.mv          = gl.getUniformLocation(planeProgram, 'uModelViewMatrix');
  pLoc.heightMul   = gl.getUniformLocation(planeProgram, 'uHeightMul');
  pLoc.frequency   = gl.getUniformLocation(planeProgram, 'uFrequency');
  pLoc.waterLevel  = gl.getUniformLocation(planeProgram, 'uWaterLevel');
  pLoc.waterHeight = gl.getUniformLocation(planeProgram, 'uWaterHeight');
  pLoc.lightPos    = gl.getUniformLocation(planeProgram, 'uLightPos');
  pLoc.seed        = gl.getUniformLocation(planeProgram, 'uSeed');
  pLoc.sandDark    = gl.getUniformLocation(planeProgram, 'uSandDark');
  pLoc.sand        = gl.getUniformLocation(planeProgram, 'uSand');
  pLoc.valley      = gl.getUniformLocation(planeProgram, 'uValley');
  pLoc.hill        = gl.getUniformLocation(planeProgram, 'uHill');
  pLoc.rock        = gl.getUniformLocation(planeProgram, 'uRock');
  pLoc.snow        = gl.getUniformLocation(planeProgram, 'uSnow');

  // ---- Grass uniform locations ----
  gLoc.proj          = gl.getUniformLocation(grassProgram, 'uProjectionMatrix');
  gLoc.mv            = gl.getUniformLocation(grassProgram, 'uModelViewMatrix');
  gLoc.heightMul     = gl.getUniformLocation(grassProgram, 'uHeightMul');
  gLoc.frequency     = gl.getUniformLocation(grassProgram, 'uFrequency');
  gLoc.waterHeight   = gl.getUniformLocation(grassProgram, 'uWaterHeight');
  gLoc.planeSegments = gl.getUniformLocation(grassProgram, 'uSegments');
  gLoc.time          = gl.getUniformLocation(grassProgram, 'uTime');
  gLoc.seed          = gl.getUniformLocation(grassProgram, 'uSeed');
  gLoc.planeSize     = gl.getUniformLocation(grassProgram, 'uPlaneSize');
  gLoc.grassSprite   = gl.getUniformLocation(grassProgram, 'uGrassSprite');
  gLoc.grassBColor   = gl.getUniformLocation(grassProgram, 'uGrassBaseColor');
  gLoc.grassTColor   = gl.getUniformLocation(grassProgram, 'uGrassTipColor');
  gLoc.subdivisions  = gl.getUniformLocation(grassProgram, 'uSubdivisions');
  gLoc.stride        = gl.getUniformLocation(grassProgram, 'uStride');

  // ---- Water uniform locations ----
  wLoc.proj         = gl.getUniformLocation(waterProgram, 'uProjectionMatrix');
  wLoc.mv           = gl.getUniformLocation(waterProgram, 'uModelViewMatrix');
  wLoc.time         = gl.getUniformLocation(waterProgram, 'uTime');
  wLoc.planeSize    = gl.getUniformLocation(waterProgram, 'uPlaneSize');
  wLoc.segments     = gl.getUniformLocation(waterProgram, 'uSegments');
  wLoc.waveAmp      = gl.getUniformLocation(waterProgram, 'uWaveAmp');
  wLoc.waveFreq     = gl.getUniformLocation(waterProgram, 'uWaveFreq');
  wLoc.waveSpeed    = gl.getUniformLocation(waterProgram, 'uWaveSpeed');
  wLoc.waterLevel   = gl.getUniformLocation(waterProgram, 'uWaterLevel');
  wLoc.cameraPos    = gl.getUniformLocation(waterProgram, 'uCameraPos');
  wLoc.lightPos     = gl.getUniformLocation(waterProgram, 'uLightPos');
  wLoc.waterColor   = gl.getUniformLocation(waterProgram, 'uWaterColor');
  wLoc.foamColor    = gl.getUniformLocation(waterProgram, 'uFoamColor');

  // ---- Skybox uniform locations ----
  sLoc.invVP        = gl.getUniformLocation(skyboxProgram, 'uInvVP');
  sLoc.skybox       = gl.getUniformLocation(skyboxProgram, 'uSkybox');

  // ---- Terrain plane geometry ----
  const plane = createPlaneGeometry(PLANE_SIZE, PLANE_SIZE, PLANE_SEGMENTS, PLANE_SEGMENTS, true);

  planeGeom = new cGeom(gl, planeProgram, [
    { name: 'aPosition', size: 3 },
    { name: 'aTexCoord', size: 2 },
  ]);
  planeGeom.vertices = plane.vertices;
  planeGeom.indices  = plane.indices;
  planeGeom.setup();

  // ---- Grass sprite texture ----
  grassSpriteTex = await loadImageTexture('assets/sprite.png');

  // ---- Grass tuft geometry ----
  const grass = createGrassGeometry(GRASS_QUADS, GRASS_HALF_W, GRASS_HEIGHT);

  grassGeom = new cGeom(gl, grassProgram, [
    { name: 'aPosition', size: 3 },
    { name: 'aTexCoord', size: 2 },
  ]);
  grassGeom.vertices = grass.vertices;
  grassGeom.indices  = grass.indices;
  grassGeom.setup();

  // store total instance count so draw() knows how many
  const cellsPerAxis = Math.ceil(PLANE_SEGMENTS / GRASS_STRIDE);
  grassGeom.instanceCount = cellsPerAxis * cellsPerAxis * GRASS_SUBDIVISIONS * GRASS_SUBDIVISIONS;
  console.log(grassGeom.instanceCount);

  // ---- Grass tuft geometry ----
  const water = createPlaneGeometry(1, 1, 1, 1);

  waterGeom = new cGeom(gl, waterProgram, [
    { name: 'aPosition', size: 3 },
    { name: 'aTexCoord', size: 2 },
  ]);
  waterGeom.vertices = water.vertices;
  waterGeom.indices  = water.indices;
  waterGeom.setup();

  // store total instance count so draw() knows how many
  waterGeom.instanceCount = PLANE_SEGMENTS * PLANE_SEGMENTS;
  console.log(waterGeom.instanceCount);

  // ---- Skybox textures ----
  skyboxVao = gl.createVertexArray(); // Empty VAO for full-screen triangle

  skyboxTex = await loadCubemap([
    'assets/skybox/px.png',
    'assets/skybox/nx.png',
    'assets/skybox/py.png',
    'assets/skybox/ny.png',
    'assets/skybox/pz.png',
    'assets/skybox/nz.png',
  ]);

  // ---- Post-processing setup ----
  ppLoc.sceneTex   = gl.getUniformLocation(postProgram, 'uSceneTexture');
  ppLoc.resolution = gl.getUniformLocation(postProgram, 'uResolution');

  // Empty VAO — post.vert generates vertices via gl_VertexID
  postVao = gl.createVertexArray();

  // Create the offscreen framebuffer
  setupFBO();

  // ---- Events ----
  setupCameraEvents();
  setupControls();

  // ---- GO ----
  fpsLast = performance.now();
  requestAnimationFrame(render);
}

// ==================== RENDER LOOP =======================

function render(now) {
  requestAnimationFrame(render);

  // ---- FPS ----
  fpsFrames++;
  if (now - fpsLast >= 1000) {
    fpsDisplay = fpsFrames;
    fpsFrames  = 0;
    fpsLast    = now;
    document.getElementById('fps').textContent = `FPS: ${fpsDisplay}`;
  }

  const time = now / 1000;

  // ======== PASS 1: Render dry scene into fboScene ========
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboPost);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.53, 0.81, 0.92, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  // ---- Camera matrices (gl-matrix) ----
  const proj = mat4.create();
  mat4.perspective(proj, Math.PI / 3, canvas.width / canvas.height, 1, 5000);

  // Spherical coordinates
  const eye = vec3.fromValues(
    camR * Math.sin(camTheta) * Math.cos(camPhi),
    camR * Math.cos(camTheta),
    camR * Math.sin(camTheta) * Math.sin(camPhi),
  );
  const center = vec3.fromValues(0, 0, 0);
  const up     = vec3.fromValues(0, 1, 0);

  const view = mat4.create();
  mat4.lookAt(view, eye, center, up);

  // ---- 0. Draw Skybox ----
  // Draw skybox
  gl.useProgram(skyboxProgram);
  
  // Create an inverse View-Projection matrix with NO TRANSLATION for the skybox
  const viewRotOnly = mat4.clone(view);
  viewRotOnly[12] = 0; viewRotOnly[13] = 0; viewRotOnly[14] = 0;
  
  const vpRotOnly = mat4.create();
  mat4.multiply(vpRotOnly, proj, viewRotOnly);
  const invVP = mat4.create();
  mat4.invert(invVP, vpRotOnly);
  
  gl.uniformMatrix4fv(sLoc.invVP, false, invVP);
  
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTex);
  gl.uniform1i(sLoc.skybox, 0);
  
  gl.depthMask(false); // don't write to depth buffer
  gl.disable(gl.DEPTH_TEST);
  
  gl.bindVertexArray(skyboxVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);

  // ---- 1. Draw Terrain ----
  gl.useProgram(planeProgram);
  gl.disable(gl.CULL_FACE);  // skirt faces may be back-facing from some angles
  gl.uniformMatrix4fv(pLoc.proj, false, proj);
  gl.uniformMatrix4fv(pLoc.mv, false, view);
  gl.uniform1f(pLoc.heightMul, heightMul);
  gl.uniform1f(pLoc.frequency, frequency);
  gl.uniform1f(pLoc.waterLevel, waterLevel);
  gl.uniform1f(pLoc.waterHeight, waterLevel + waterHeight);
  gl.uniform3fv(pLoc.lightPos, lightPos);
  gl.uniform1i(pLoc.seed, SEED);
  gl.uniform3fv(pLoc.sandDark, terrainSandDark);
  gl.uniform3fv(pLoc.sand, terrainSand);
  gl.uniform3fv(pLoc.valley, terrainValley);
  gl.uniform3fv(pLoc.hill, terrainHill);
  gl.uniform3fv(pLoc.rock, terrainRock);
  gl.uniform3fv(pLoc.snow, terrainSnow);

  planeGeom.draw(DRAW_MODE.INDICES);
  gl.enable(gl.CULL_FACE);
  
  // ---- 2. Draw Grass ----
  gl.useProgram(grassProgram);
  gl.disable(gl.CULL_FACE);             // both sides of quads visible

  gl.uniformMatrix4fv(gLoc.proj, false, proj);
  gl.uniformMatrix4fv(gLoc.mv, false, view);
  gl.uniform1f(gLoc.heightMul, heightMul);
  gl.uniform1f(gLoc.frequency, frequency);
  gl.uniform1f(gLoc.waterLevel, waterLevel);
  gl.uniform1f(gLoc.waterHeight, waterLevel + waterHeight);
  gl.uniform1i(gLoc.planeSegments, PLANE_SEGMENTS);
  gl.uniform1i(gLoc.seed, SEED);
  gl.uniform1f(gLoc.time, time);

  gl.uniform1f(gLoc.planeSize, PLANE_SIZE);
  gl.uniform3fv(gLoc.grassBColor, grassBColor);
  gl.uniform3fv(gLoc.grassTColor, grassTColor);
  gl.uniform1i(gLoc.subdivisions, GRASS_SUBDIVISIONS);
  gl.uniform1i(gLoc.stride, GRASS_STRIDE);

  // Sprite texture on unit 0
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, grassSpriteTex);
  gl.uniform1i(gLoc.grassSprite, 0);

  if (grass) grassGeom.draw(DRAW_MODE.INSTANCED);

  // Restore state for next frame
  gl.enable(gl.CULL_FACE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fboPost);
  
  // ---- 3. Draw Water ----
  gl.useProgram(waterProgram);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false); // don't write depth, just read
  
  gl.uniformMatrix4fv(wLoc.proj, false, proj);
  gl.uniformMatrix4fv(wLoc.mv,   false, view);

  gl.uniform1f(wLoc.time,      time);
  gl.uniform1f(wLoc.planeSize, PLANE_SIZE);
  gl.uniform1i(wLoc.segments,  PLANE_SEGMENTS);
  gl.uniform1f(wLoc.waterLevel, waterLevel);
  gl.uniform1f(wLoc.waveAmp,   waveAmp);
  gl.uniform1f(wLoc.waveFreq,  waveFreq);
  gl.uniform1f(wLoc.waveSpeed, waveSpeed);
  gl.uniform3fv(wLoc.cameraPos,  eye);
  gl.uniform3fv(wLoc.lightPos,   lightPos);
  gl.uniform3fv(wLoc.waterColor, waterColor);
  gl.uniform3fv(wLoc.foamColor,  foamColor);

  waterGeom.draw(DRAW_MODE.INSTANCED);
  
  gl.depthMask(true);
  gl.disable(gl.BLEND);

  // ======== PASS 3: Post-processing (fboPost → Screen) ========
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);      // draw to screen
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);                     // fullscreen quad, no depth needed

  gl.useProgram(postProgram);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fboPostColorTex);    // texture with water included
  gl.uniform1i(ppLoc.sceneTex, 0);
  gl.uniform1f(ppLoc.time, time);
  gl.uniform2f(ppLoc.resolution, canvas.width, canvas.height);

  gl.bindVertexArray(postVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);             // fullscreen triangle
  gl.bindVertexArray(null);

  gl.enable(gl.DEPTH_TEST);                      // restore for next frame
}

// =============== CAMERA (ORBITAL) =======================

function setupCameraEvents() {
  // ---- Mouse ----
  canvas.addEventListener('mousedown', e => {
    dragging = true;
    prevMX = e.clientX;
    prevMY = e.clientY;
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - prevMX;
    const dy = e.clientY - prevMY;
    camPhi   -= dx * 0.005;
    camTheta -= dy * 0.005;
    camTheta  = Math.max(0.1, Math.min(Math.PI / 2 - 0.01, camTheta));
    prevMX = e.clientX;
    prevMY = e.clientY;
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    camR += e.deltaY * 0.5;
    camR  = Math.max(50, Math.min(3000, camR));
  }, { passive: false });

  // ---- Touch ----
  let touchDist = 0;
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) {
      dragging = true;
      prevMX = e.touches[0].clientX;
      prevMY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchDist = Math.hypot(dx, dy);
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && dragging) {
      const dx = e.touches[0].clientX - prevMX;
      const dy = e.touches[0].clientY - prevMY;
      camPhi   -= dx * 0.005;
      camTheta -= dy * 0.005;
      camTheta  = Math.max(0.1, Math.min(Math.PI / 2 - 0.01, camTheta));
      prevMX = e.touches[0].clientX;
      prevMY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      camR -= (dist - touchDist) * 2;
      camR  = Math.max(50, Math.min(3000, camR));
      touchDist = dist;
    }
  }, { passive: false });
  canvas.addEventListener('touchend', () => { dragging = false; });
}

// ================ CONTROLS ==============================

function setupControls() {
  // Grass toggle
  window.addEventListener('keydown', e => {
    if (e.key === 'g' || e.key === 'G') {
      grass = !grass;
      document.getElementById('grassLabel').textContent =
        `Grama aparente: ${grass ? 'SIM' : 'NÃO'}`;
    }
  });

  // Sliders
  const hSlider  = document.getElementById('heightSlider');
  const fSlider  = document.getElementById('frequencySlider');
  const wSlider  = document.getElementById('waterSlider');
  const whSlider = document.getElementById('waterHeightSlider');
  const hLabel   = document.getElementById('heightLabel');
  const fLabel   = document.getElementById('frequencyLabel');
  const wLabel   = document.getElementById('waterLabel');
  const whLabel  = document.getElementById('waterHeightLabel');
  const bColorPicker = document.getElementById('grassBaseColorPicker');
  const tColorPicker = document.getElementById('grassTipColorPicker');

  hSlider.addEventListener('input', () => {
    heightMul = Number(hSlider.value);
    hLabel.textContent = `Altura: ${heightMul}`;
  });

  fSlider.addEventListener('input', () => {
    frequency = Number(fSlider.value);
    fLabel.textContent = `Frequência: ${frequency}`;
  });

  wSlider.addEventListener('input', () => {
    waterLevel = Number(wSlider.value);
    wLabel.textContent = `Nível da Água: ${waterLevel}`;
  });

  whSlider.addEventListener('input', () => {
    waterHeight = Number(whSlider.value);
    whLabel.textContent = `Zona do Litoral: ${waterHeight}`;
  });

  bColorPicker.addEventListener('input', (e) => {
    const hex = e.target.value; // Pega o valor tipo "#RRGGBB"
    
    // Converte Hex para RGB de 0.0 a 1.0
    const r = parseInt(hex.substring(1, 3), 16) / 255.0;
    const g = parseInt(hex.substring(3, 5), 16) / 255.0;
    const b = parseInt(hex.substring(5, 7), 16) / 255.0;
    
    grassBColor = [r, g, b];
  });

  tColorPicker.addEventListener('input', (e) => {
    const hex = e.target.value;
    const r = parseInt(hex.substring(1, 3), 16) / 255.0;
    const g = parseInt(hex.substring(3, 5), 16) / 255.0;
    const b = parseInt(hex.substring(5, 7), 16) / 255.0;
    grassTColor = [r, g, b];
  });

  // ---- Terrain gradient color pickers ----
  const terrainToggle = document.getElementById('terrainColorToggle');
  const terrainPanel  = document.getElementById('terrainColorPanel');
  terrainToggle.addEventListener('click', () => {
    const open = terrainPanel.style.display !== 'none';
    terrainPanel.style.display = open ? 'none' : 'flex';
    terrainToggle.textContent  = open ? '\u25B6 Cores do Terreno' : '\u25BC Cores do Terreno';
  });

  function hexToRgb(hex) {
    return [
      parseInt(hex.substring(1, 3), 16) / 255.0,
      parseInt(hex.substring(3, 5), 16) / 255.0,
      parseInt(hex.substring(5, 7), 16) / 255.0,
    ];
  }

  document.getElementById('tSandDark').addEventListener('input', e => { terrainSandDark = hexToRgb(e.target.value); });
  document.getElementById('tSand').addEventListener('input',     e => { terrainSand     = hexToRgb(e.target.value); });
  document.getElementById('tValley').addEventListener('input',   e => { terrainValley   = hexToRgb(e.target.value); });
  document.getElementById('tHill').addEventListener('input',     e => { terrainHill     = hexToRgb(e.target.value); });
  document.getElementById('tRock').addEventListener('input',     e => { terrainRock     = hexToRgb(e.target.value); });
  document.getElementById('tSnow').addEventListener('input',     e => { terrainSnow     = hexToRgb(e.target.value); });

  // Set initial values
  hSlider.value  = heightMul;
  fSlider.value  = frequency;
  wSlider.value  = waterLevel;
  whSlider.value = waterHeight;
  hLabel.textContent  = `Altura: ${heightMul}`;
  fLabel.textContent  = `Frequência: ${frequency}`;
  wLabel.textContent  = `Nível da Água: ${waterLevel}`;
  whLabel.textContent = `Zona do Litoral: ${waterHeight}`;
}

// ================ RESIZE ================================

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  // Recreate FBO textures to match the new resolution
  if (gl) setupFBO();
}

// ================ START =================================
init();
