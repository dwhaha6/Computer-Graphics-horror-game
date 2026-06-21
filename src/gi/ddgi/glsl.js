// Shared GLSL chunks for the DDGI implementation. Kept in one place so the
// gather/convert passes and the shading-time sampler agree byte-for-byte on
// octahedral mapping and atlas addressing.

// Octahedral encode/decode of a unit direction <-> [-1,1]^2.
// Standard mapping (Cigolle et al. 2014), used by RTXGI / DDGI.
export const OCT_GLSL = /* glsl */ `
vec2 signNotZero(vec2 v){
  return vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);
}
vec2 octEncode(vec3 v){
  v /= (abs(v.x) + abs(v.y) + abs(v.z));
  vec2 oct = (v.z < 0.0) ? ((1.0 - abs(v.yx)) * signNotZero(v.xy)) : v.xy;
  return oct; // [-1,1]
}
vec3 octDecode(vec2 o){
  vec3 v = vec3(o.x, o.y, 1.0 - abs(o.x) - abs(o.y));
  if (v.z < 0.0) v.xy = (1.0 - abs(v.yx)) * signNotZero(o.xy);
  return normalize(v);
}
`;

// Fibonacci-sphere sample directions — deterministic, so the cosine-weighted
// integration is stable frame to frame (no Monte-Carlo noise → no temporal
// accumulation needed, unlike ray-traced DDGI).
export const FIB_GLSL = /* glsl */ `
const float PI_F = 3.14159265359;
vec3 fibDir(int i, int n){
  float k = float(i) + 0.5;
  float cosTheta = 1.0 - 2.0 * k / float(n);
  float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  float phi = PI_F * (1.0 + sqrt(5.0)) * k; // golden-angle azimuth
  return vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
}
`;

// Atlas tile sampling: manual bilinear inside the tile interior, with the
// in-tile texel coords clamped to [0.5, res-0.5] so a hardware-bilinear tap
// never bleeds into a neighbouring probe's tile (tiles are packed with no
// gutter). Returns rgb (distance map packs mean in r, mean^2 in g).
export const TILE_SAMPLE_GLSL = /* glsl */ `
vec3 sampleOctTile(sampler2D atlas, vec2 atlasSize, int index, float res, float cols, vec3 dir){
  vec2 oct = octEncode(normalize(dir)) * 0.5 + 0.5; // [0,1]
  vec2 t = clamp(oct * res, vec2(0.5), vec2(res - 0.5));
  vec2 tile = vec2(float(index) - cols * floor(float(index) / cols), floor(float(index) / cols));
  vec2 base = tile * res;
  vec2 uv = (base + t) / atlasSize;
  return texture2D(atlas, uv).rgb;
}
`;
