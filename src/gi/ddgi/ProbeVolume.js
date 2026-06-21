import * as THREE from 'three';
import { OCT_GLSL, FIB_GLSL, TILE_SAMPLE_GLSL } from './glsl.js';

// ---- Tunables (tune on GPU 6/19) -------------------------------------------
const IRR_RES = 8;        // octahedral irradiance texels per probe tile
const DIST_RES = 16;      // octahedral distance texels per probe tile
const CUBE_RES = 32;      // gather cubemap face resolution
const IRR_SAMPLES = 64;   // hemisphere samples for irradiance integration
const DIST_SAMPLES = 96;  // samples for distance integration
const DIST_SHARPNESS = 50.0;
const UPDATES_PER_FRAME = 6; // probes refreshed each frame (amortized)

/**
 * DDGI — Dynamic Diffuse Global Illumination.
 *
 * A regular 3D grid of irradiance probes. Each probe stores, in octahedral
 * maps packed into atlas textures:
 *   - irradiance  (RGB, low-res)   : cosine-weighted incoming radiance
 *   - distance    (mean, mean^2)   : for the Chebyshev visibility test that
 *                                    kills light leaking through walls
 *
 * Update (no hardware ray tracing in WebGL2): for each probe we rasterise the
 * low-poly PROXY scene into a small cubemap (radiance) + a distance cubemap,
 * then integrate those into the probe's octahedral tiles. Only a handful of
 * probes refresh per frame (amortized) so dynamic lights — the flickering
 * bulb, the captor's light under the door — propagate into the indirect
 * lighting in real time without a per-frame full-grid cost.
 */
export class ProbeVolume {
  constructor(renderer, proxyScene, { origin, spacing, counts }) {
    this.renderer = renderer;
    this.proxyScene = proxyScene;
    this.origin = new THREE.Vector3().fromArray(origin);
    this.spacing = new THREE.Vector3().fromArray(spacing);
    this.counts = new THREE.Vector3().fromArray(counts);
    this.total = counts[0] * counts[1] * counts[2];

    // Atlas layout: near-square packing of probe tiles.
    this.cols = Math.ceil(Math.sqrt(this.total));
    this.rows = Math.ceil(this.total / this.cols);

    this._cursor = 0;
    this.enabled = true;

    this._initTargets();
    this._initGather();
    this._initConvert();
    this._initUniforms();
  }

  // ---- Render targets -------------------------------------------------------
  _initTargets() {
    const rtOpts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      generateMipmaps: false,
    };
    this.irrAtlas = new THREE.WebGLRenderTarget(this.cols * IRR_RES, this.rows * IRR_RES, rtOpts);
    this.distAtlas = new THREE.WebGLRenderTarget(this.cols * DIST_RES, this.rows * DIST_RES, rtOpts);

    const cubeOpts = { type: THREE.HalfFloatType, generateMipmaps: false };
    this.colorCubeRT = new THREE.WebGLCubeRenderTarget(CUBE_RES, cubeOpts);
    this.distCubeRT = new THREE.WebGLCubeRenderTarget(CUBE_RES, cubeOpts);
    this.colorCubeCam = new THREE.CubeCamera(0.05, 60, this.colorCubeRT);
    this.distCubeCam = new THREE.CubeCamera(0.05, 60, this.distCubeRT);
  }

  // ---- Gather: distance override material (radiance reuses proxy materials) -
  _initGather() {
    this.distGatherMat = new THREE.ShaderMaterial({
      uniforms: { uProbePos: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `
        varying vec3 vWPos;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vWPos;
        uniform vec3 uProbePos;
        void main(){
          float d = length(vWPos - uProbePos);
          gl_FragColor = vec4(d, d * d, 0.0, 1.0);
        }`,
      side: THREE.DoubleSide,
    });
  }

  // ---- Convert: cubemap -> octahedral tiles ---------------------------------
  _initConvert() {
    this._fsScene = new THREE.Scene();
    this._fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.PlaneGeometry(2, 2);

    const common = OCT_GLSL + FIB_GLSL + /* glsl */ `
      varying vec2 vUv;
      uniform vec2 uTileBase; // atlas texel origin of the tile being written
      uniform float uRes;
      vec3 dirForFragment(){
        vec2 local = gl_FragCoord.xy - uTileBase; // 0..res
        vec2 oct = (local / uRes) * 2.0 - 1.0;
        return octDecode(oct);
      }
    `;
    const vert = /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

    this.irrConvMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uColorCube: { value: null },
        uTileBase: { value: new THREE.Vector2() },
        uRes: { value: IRR_RES },
      },
      vertexShader: vert,
      fragmentShader: /* glsl */ `
        precision highp float;
        ${common}
        uniform samplerCube uColorCube;
        void main(){
          vec3 N = dirForFragment();
          vec3 sum = vec3(0.0);
          for (int i = 0; i < ${IRR_SAMPLES}; i++){
            vec3 s = fibDir(i, ${IRR_SAMPLES});
            float c = max(dot(N, s), 0.0);
            if (c <= 0.0) continue;
            sum += textureCube(uColorCube, s).rgb * c;
          }
          // Monte-Carlo irradiance estimate over the full sphere (pdf 1/4pi).
          vec3 irr = sum * (4.0 * PI_F / float(${IRR_SAMPLES}));
          gl_FragColor = vec4(irr, 1.0);
        }`,
    });

    this.distConvMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uDistCube: { value: null },
        uTileBase: { value: new THREE.Vector2() },
        uRes: { value: DIST_RES },
      },
      vertexShader: vert,
      fragmentShader: /* glsl */ `
        precision highp float;
        ${common}
        uniform samplerCube uDistCube;
        void main(){
          vec3 N = dirForFragment();
          vec2 acc = vec2(0.0); float wsum = 0.0;
          for (int i = 0; i < ${DIST_SAMPLES}; i++){
            vec3 s = fibDir(i, ${DIST_SAMPLES});
            float c = max(dot(N, s), 0.0);
            if (c <= 0.0) continue;
            float w = pow(c, ${DIST_SHARPNESS.toFixed(1)});
            acc += textureCube(uDistCube, s).rg * w;
            wsum += w;
          }
          acc /= max(wsum, 1e-5);
          gl_FragColor = vec4(acc, 0.0, 1.0);
        }`,
    });

    this._irrQuad = new THREE.Mesh(quad, this.irrConvMat);
    this._distQuad = new THREE.Mesh(quad.clone(), this.distConvMat);
    this._irrQuad.frustumCulled = false;
    this._distQuad.frustumCulled = false;
  }

  // ---- Shared uniforms for material patching --------------------------------
  _initUniforms() {
    this.uniforms = {
      uDDGIIrradiance: { value: this.irrAtlas.texture },
      uDDGIDistance: { value: this.distAtlas.texture },
      uDDGIIrrAtlasSize: { value: new THREE.Vector2(this.cols * IRR_RES, this.rows * IRR_RES) },
      uDDGIDistAtlasSize: { value: new THREE.Vector2(this.cols * DIST_RES, this.rows * DIST_RES) },
      uDDGIOrigin: { value: this.origin.clone() },
      uDDGISpacing: { value: this.spacing.clone() },
      uDDGICounts: { value: this.counts.clone() },
      uDDGIIrrRes: { value: IRR_RES },
      uDDGIDistRes: { value: DIST_RES },
      uDDGICols: { value: this.cols },
      uDDGIIntensity: { value: 1.0 },
      uDDGINormalBias: { value: 0.25 },
    };
  }

  probePosition(ix, iy, iz, out = new THREE.Vector3()) {
    return out.set(
      this.origin.x + this.spacing.x * ix,
      this.origin.y + this.spacing.y * iy,
      this.origin.z + this.spacing.z * iz,
    );
  }

  _indexToGrid(index) {
    const cx = this.counts.x, cy = this.counts.y;
    const ix = index % cx;
    const iy = Math.floor(index / cx) % cy;
    const iz = Math.floor(index / (cx * cy));
    return [ix, iy, iz];
  }

  // ---- Per-probe refresh ----------------------------------------------------
  _refreshProbe(index) {
    const [ix, iy, iz] = this._indexToGrid(index);
    const pos = this.probePosition(ix, iy, iz, _v0);

    const r = this.renderer;
    const prevAutoClear = r.autoClear;

    // 1) radiance cube (proxy materials + proxy lights)
    this.colorCubeCam.position.copy(pos);
    this.colorCubeCam.update(r, this.proxyScene);

    // 2) distance cube (override material)
    this.distGatherMat.uniforms.uProbePos.value.copy(pos);
    this.proxyScene.overrideMaterial = this.distGatherMat;
    this.distCubeCam.position.copy(pos);
    this.distCubeCam.update(r, this.proxyScene);
    this.proxyScene.overrideMaterial = null;

    // 3) convert -> atlas tiles (scissor to the probe's tile)
    const tileX = index % this.cols;
    const tileY = Math.floor(index / this.cols);
    r.autoClear = false;

    this.irrConvMat.uniforms.uColorCube.value = this.colorCubeRT.texture;
    this.irrConvMat.uniforms.uTileBase.value.set(tileX * IRR_RES, tileY * IRR_RES);
    this._renderTile(this.irrAtlas, this._fsSceneWith(this._irrQuad), tileX * IRR_RES, tileY * IRR_RES, IRR_RES);

    this.distConvMat.uniforms.uDistCube.value = this.distCubeRT.texture;
    this.distConvMat.uniforms.uTileBase.value.set(tileX * DIST_RES, tileY * DIST_RES);
    this._renderTile(this.distAtlas, this._fsSceneWith(this._distQuad), tileX * DIST_RES, tileY * DIST_RES, DIST_RES);

    r.autoClear = prevAutoClear;
  }

  _fsSceneWith(quad) {
    this._fsScene.clear();
    this._fsScene.add(quad);
    return this._fsScene;
  }

  _renderTile(target, scene, x, y, res) {
    const r = this.renderer;
    r.setRenderTarget(target);
    r.setViewport(x, y, res, res);
    r.setScissor(x, y, res, res);
    r.setScissorTest(true);
    r.render(scene, this._fsCam);
    r.setScissorTest(false);
    r.setRenderTarget(null);
    r.setViewport(0, 0, r.domElement.width, r.domElement.height);
  }

  /** Zero both atlases so unwritten/half-float-garbage texels never leak in. */
  _clearAtlases() {
    const r = this.renderer;
    const prev = r.getClearColor(new THREE.Color());
    const prevA = r.getClearAlpha();
    r.setClearColor(0x000000, 0.0);
    for (const t of [this.irrAtlas, this.distAtlas]) {
      r.setRenderTarget(t);
      r.clear(true, false, false);
    }
    r.setRenderTarget(null);
    r.setClearColor(prev, prevA);
  }

  /** Refresh the whole grid once (call after load to avoid a black start). */
  refreshAll() {
    this._clearAtlases();
    for (let i = 0; i < this.total; i++) this._refreshProbe(i);
  }

  /** Amortized per-frame refresh of UPDATES_PER_FRAME probes (round-robin). */
  update() {
    if (!this.enabled) return;
    for (let n = 0; n < UPDATES_PER_FRAME; n++) {
      this._refreshProbe(this._cursor);
      this._cursor = (this._cursor + 1) % this.total;
    }
  }

  // ---- Material patching: inject DDGI into indirect diffuse -----------------
  patchMaterial(material) {
    const u = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);

      shader.vertexShader = 'varying vec3 vDDGIWorldPos;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vDDGIWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );

      const frHeader = /* glsl */ `
        varying vec3 vDDGIWorldPos;
        uniform sampler2D uDDGIIrradiance;
        uniform sampler2D uDDGIDistance;
        uniform vec2 uDDGIIrrAtlasSize;
        uniform vec2 uDDGIDistAtlasSize;
        uniform vec3 uDDGIOrigin;
        uniform vec3 uDDGISpacing;
        uniform vec3 uDDGICounts;
        uniform float uDDGIIrrRes;
        uniform float uDDGIDistRes;
        uniform float uDDGICols;
        uniform float uDDGIIntensity;
        uniform float uDDGINormalBias;
        ${OCT_GLSL}
        ${TILE_SAMPLE_GLSL}
        vec3 ddgiIrradiance(vec3 P, vec3 N){
          vec3 rel = (P - uDDGIOrigin) / uDDGISpacing;
          vec3 baseF = floor(rel);
          vec3 frac = clamp(rel - baseF, 0.0, 1.0);
          vec3 counts = uDDGICounts;
          vec3 sumIrr = vec3(0.0); float sumW = 0.0;
          for (int i = 0; i < 8; i++){
            vec3 off = vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1));
            vec3 c = clamp(baseF + off, vec3(0.0), counts - 1.0);
            vec3 tri = mix(1.0 - frac, frac, off);
            float w = tri.x * tri.y * tri.z;
            vec3 probePos = uDDGIOrigin + uDDGISpacing * c;
            vec3 toProbe = normalize(probePos - P);
            float wrap = dot(toProbe, N) * 0.5 + 0.5;
            w *= wrap * wrap + 0.05;
            int index = int(c.x + c.y * counts.x + c.z * counts.x * counts.y);
            // Chebyshev visibility test
            vec3 biasedP = P + N * uDDGINormalBias;
            vec3 dir = biasedP - probePos;
            float dist = length(dir);
            vec2 m = sampleOctTile(uDDGIDistance, uDDGIDistAtlasSize, index, uDDGIDistRes, uDDGICols, normalize(dir)).rg;
            if (dist > m.x){
              float variance = abs(m.y - m.x * m.x);
              float d = dist - m.x;
              float cheb = variance / (variance + d * d);
              w *= max(cheb * cheb * cheb, 0.0);
            }
            if (w < 1e-4) continue;
            vec3 irr = sampleOctTile(uDDGIIrradiance, uDDGIIrrAtlasSize, index, uDDGIIrrRes, uDDGICols, N);
            sumIrr += max(irr, vec3(0.0)) * w;
            sumW += w;
          }
          if (sumW <= 1e-4) return vec3(0.0);
          return (sumIrr / sumW) * uDDGIIntensity;
        }
      `;
      shader.fragmentShader = frHeader + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_maps>',
        'irradiance += ddgiIrradiance(vDDGIWorldPos, inverseTransformDirection(normal, viewMatrix));\n#include <lights_fragment_maps>'
      );
    };
    material.needsUpdate = true;
    return material;
  }

  setIntensity(v) { this.uniforms.uDDGIIntensity.value = v; }
}

const _v0 = new THREE.Vector3();
