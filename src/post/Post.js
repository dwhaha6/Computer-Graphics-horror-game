import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Vignette + film grain + chromatic aberration + slight desaturation. Cheap
// and carries most of the "dread" once the lighting is in place.
const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.15 },
    uGrain: { value: 0.03 },
    uAberration: { value: 0.0010 },
    uDesat: { value: 0.25 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uDesat;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      // chromatic aberration grows toward the edges
      float r = texture2D(tDiffuse, uv + d * uAberration).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - d * uAberration).b;
      vec3 col = vec3(r, g, b);

      // desaturate toward grim monochrome
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), uDesat);

      // vignette
      float vig = smoothstep(0.9, 0.2, length(d) * uVignette);
      col *= mix(0.35, 1.0, vig);

      // animated film grain
      float n = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 100.0);
      col += (n - 0.5) * uGrain;

      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    const size = renderer.getSize(new THREE.Vector2());
    this.bloom = new UnrealBloomPass(size, 0.55, 0.6, 0.85); // strength, radius, threshold
    this.composer.addPass(this.bloom);

    this.horror = new ShaderPass(HorrorShader);
    this.composer.addPass(this.horror);

    this.composer.addPass(new OutputPass());
  }

  setSize(w, h) { this.composer.setSize(w, h); }

  render(dt) {
    this.horror.uniforms.uTime.value += dt;
    this.composer.render();
  }
}
