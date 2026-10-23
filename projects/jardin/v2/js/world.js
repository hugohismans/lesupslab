// Monde : biomes (identiques à la V1), relief, rivière, chemins, terrain et eau
import * as THREE from 'three';
import { fbm, smoothstep, lerp, distToPolyline, smoothPolyline, toon } from './util.js';

export const BIOMES = { SPRING: 'printemps', SUMMER: 'ete', AUTUMN: 'automne', WINTER: 'hiver', DESERT: 'desert' };
export const BIOME_LIST = [BIOMES.SPRING, BIOMES.SUMMER, BIOMES.AUTUMN, BIOMES.WINTER, BIOMES.DESERT];
export const BIOME_LABEL = { printemps: 'Printemps', ete: 'Été', automne: 'Automne', hiver: 'Hiver', desert: 'Désert' };

// Même découpage que la V1 : c'est lui qui est stocké dans les données
export function biomeAt(x, z) {
  const r = Math.hypot(x, z), ang = Math.atan2(z, x);
  if (r < 30) return BIOMES.SPRING;
  if (r < 60) return BIOMES.SUMMER;
  if (r < 100) return BIOMES.AUTUMN;
  if (ang > Math.PI * 0.75 || ang < -Math.PI * 0.75) return BIOMES.DESERT;
  return BIOMES.WINTER;
}

export const WORLD = 400;          // côté du terrain (m)
export const HALF = WORLD / 2;
export const RES = 256;            // échantillons par côté (terrain + texture)
export const PLAY_RADIUS = 172;    // on ne marche pas dans les montagnes
export const WATER_LEVEL = -0.35;

// --- Tracés fixes du décor (rivière, étang, chemins) ---
export const RIVER = smoothPolyline([
  [34, -205], [42, -150], [70, -108], [60, -66], [47, -36], [50, -6], [58, 22], [52, 52], [36, 86], [14, 118], [-8, 150], [-18, 205]
], 8);
export const POND = { x: 60, z: 26, r: 11 };
const RIVER_HALF = 3.6;

export const PATHS = [
  [[0, 0], [4, -1], [7, 2], [7.5, 14], [7.5, 34]],                       // allée des portails (nord)
  [[4, -1], [7, -5], [7.5, -16], [7.5, -29]],                            // allée des portails (sud)
  [[0, 0], [-8, -7], [-15, -13], [-19, -16]],                              // vers le Hall of Fame
  [[0, 0], [18, -5], [36, -9], [52, -8], [72, -12], [100, -18], [130, -12]], // vers l'est (pont)
  [[0, 0], [-4, 22], [-14, 48], [-30, 78], [-40, 110]],                    // vers le sud
  [[0, 0], [4, -28], [-6, -58], [2, -96], [-6, -130]],                     // vers le nord
  [[0, 0], [-28, 4], [-66, -2], [-104, 6], [-140, 2]],                     // vers le désert
].map(p => smoothPolyline(p, 6));
export const BRIDGE = { x: 51, z: -8 }; // là où l'allée de l'est traverse la rivière

const HOF = { x: -20, z: -20, r: 9 };
const PORTALS_PAD = { x0: 4, x1: 17, z0: -29, z1: 34 };
export const WINDMILL = { x: -52, z: 42 };

// Poids de chaque biome (transitions douces pour le rendu)
export function biomeWarp(x, z) {
  const r = Math.hypot(x, z);
  const rw = r + fbm(x * 0.03 + 11, z * 0.03 - 7, 2) * 5;
  const des = r > 1 ? smoothstep(0.62, 0.78, -x / r) : 0;
  return { rw, des };
}
export function weightsFrom(rw, des) {
  const a = smoothstep(27, 33, rw), b = smoothstep(57, 63, rw), c = smoothstep(97, 103, rw);
  return [1 - a, a * (1 - b), b * (1 - c), c * (1 - des), c * des];
}

// --- Relief brut (fonction analytique) ---
function rawHeight(x, z, pd, wd) {
  const r = Math.hypot(x, z);
  let h = 1.0 + fbm(x * 0.011 + 3.1, z * 0.011 - 1.7, 4) * 2.6 + fbm(x * 0.045, z * 0.045, 2) * 0.35;
  h = lerp(1.0, h, smoothstep(6, 38, r));                       // clairière centrale presque plate
  if (h < 0.35) h = 0.35 - (0.35 - h) * 0.12;                   // pas de mare « fantôme » hors de la rivière
  // colline du moulin
  const dm = Math.hypot(x - WINDMILL.x, z - WINDMILL.z);
  h += 5.5 * Math.exp(-(dm * dm) / (2 * 15 * 15));
  // dunes du désert
  const { rw, des } = biomeWarp(x, z);
  const outer = smoothstep(97, 110, rw);
  h += outer * des * (Math.sin(x * 0.11 + fbm(x * 0.02, z * 0.02) * 4) * 0.9 + 0.6);
  // montagnes en bordure
  const m = smoothstep(150, 198, r);
  h += m * m * (26 + 20 * fbm(x * 0.018 + 5, z * 0.018 + 9, 4));
  // zones aplanies : portails et Hall of Fame
  const padW = Math.min(smoothstep(PORTALS_PAD.x0 - 4, PORTALS_PAD.x0, x), 1 - smoothstep(PORTALS_PAD.x1, PORTALS_PAD.x1 + 4, x),
    smoothstep(PORTALS_PAD.z0 - 4, PORTALS_PAD.z0, z), 1 - smoothstep(PORTALS_PAD.z1, PORTALS_PAD.z1 + 4, z));
  h = lerp(h, 1.0, Math.max(0, padW));
  const dh = Math.hypot(x - HOF.x, z - HOF.z);
  h = lerp(h, 1.0, 1 - smoothstep(HOF.r, HOF.r + 6, dh));
  // chemins légèrement creusés
  h -= 0.08 * (1 - smoothstep(0.8, 1.8, pd));
  // rivière + étang
  const bed = -1.5 - 0.6 * smoothstep(0, -4, wd);
  h = lerp(h, bed, 1 - smoothstep(0, 5.5, wd));
  return h;
}

// --- Champ échantillonné (sert au maillage, au GPU et aux placements) ---
const H = new Float32Array(RES * RES);
const GRASS = new Float32Array(RES * RES);
const RW = new Float32Array(RES * RES);
const DES = new Float32Array(RES * RES);
const PATHD = new Float32Array(RES * RES);
const WATERD = new Float32Array(RES * RES);
const STEP = WORLD / (RES - 1);

export function buildField() {
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const x = -HALF + i * STEP, z = -HALF + j * STEP, k = j * RES + i;
    const { rw, des } = biomeWarp(x, z); RW[k] = rw; DES[k] = des;
    let pd = Infinity; for (const p of PATHS) pd = Math.min(pd, distToPolyline(x, z, p, 12));
    PATHD[k] = pd;
    const rd = distToPolyline(x, z, RIVER, 16) - RIVER_HALF;
    WATERD[k] = Math.min(rd, Math.hypot(x - POND.x, z - POND.z) - POND.r);
    H[k] = rawHeight(x, z, pd, WATERD[k]);
    const r = Math.hypot(x, z);
    let g = smoothstep(0.9, 1.7, pd);                         // pas d'herbe sur les chemins
    g *= smoothstep(WATER_LEVEL + 0.05, WATER_LEVEL + 0.45, H[k]);
    g *= 1 - smoothstep(150, 172, r);                         // ni dans la montagne
    GRASS[k] = g;
  }
}

function sample(arr, x, z) {
  const fx = Math.max(0, Math.min(RES - 1.001, (x + HALF) / STEP));
  const fz = Math.max(0, Math.min(RES - 1.001, (z + HALF) / STEP));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * RES + i;
  return lerp(lerp(arr[k], arr[k + 1], tx), lerp(arr[k + RES], arr[k + RES + 1], tx), tz);
}
export const groundY = (x, z) => sample(H, x, z);
export const grassAt = (x, z) => sample(GRASS, x, z);
export const pathDist = (x, z) => sample(PATHD, x, z);
export const waterDist = (x, z) => sample(WATERD, x, z);
export function biomeWeights(x, z) { return weightsFrom(sample(RW, x, z), sample(DES, x, z)); }

// Texture GPU : R = hauteur, G = densité d'herbe, B = rayon biome, A = part désert
export function fieldTexture() {
  const data = new Uint16Array(RES * RES * 4);
  const h = THREE.DataUtils.toHalfFloat;
  for (let k = 0; k < RES * RES; k++) {
    data[k * 4] = h(H[k]); data[k * 4 + 1] = h(GRASS[k]); data[k * 4 + 2] = h(RW[k]); data[k * 4 + 3] = h(DES[k]);
  }
  const tex = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// Code GLSL commun : lecture du champ + poids des biomes (mêmes formules qu'en JS)
export const FIELD_GLSL = /* glsl */`
uniform sampler2D uField;
vec4 field(vec2 xz){
  vec2 uv = (xz + ${HALF.toFixed(1)}) / ${WORLD.toFixed(1)};
  uv = uv * ${((RES - 1) / RES).toFixed(6)} + ${(0.5 / RES).toFixed(6)};
  return texture2D(uField, uv);
}
float sstep(float a, float b, float x){ float t = clamp((x-a)/(b-a), 0.0, 1.0); return t*t*(3.0-2.0*t); }
void biomeW(float rw, float des, out float w[5]){
  float a = sstep(27.0,33.0,rw), b = sstep(57.0,63.0,rw), c = sstep(97.0,103.0,rw);
  w[0] = 1.0-a; w[1] = a*(1.0-b); w[2] = b*(1.0-c); w[3] = c*(1.0-des); w[4] = c*des;
}
`;

// --- Couleurs du sol (palette « conte peint ») ---
const GROUND = [
  [new THREE.Color('#79c25a'), new THREE.Color('#a3d86a')], // printemps
  [new THREE.Color('#9dbb4a'), new THREE.Color('#cfd36a')], // été
  [new THREE.Color('#a8913f'), new THREE.Color('#c97b3b')], // automne
  [new THREE.Color('#e9f1f8'), new THREE.Color('#cfdcec')], // hiver
  [new THREE.Color('#e6c58a'), new THREE.Color('#d9a96a')], // désert
];
const PATH_COL = new THREE.Color('#c9a774');
const SAND_COL = new THREE.Color('#d8c49a');
const ROCK_COL = new THREE.Color('#8d8f9a');
const SNOWCAP = new THREE.Color('#f4f8ff');

export function buildTerrain(quality) {
  const seg = RES - 1;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), tmp = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), z = pos.getZ(v);
    const i = Math.round((x + HALF) / STEP), j = Math.round((z + HALF) / STEP), k = j * RES + i;
    pos.setY(v, H[k]);
    const w = weightsFrom(RW[k], DES[k]);
    const patch = fbm(x * 0.06, z * 0.06, 3) * 0.5 + 0.5;       // taches de couleur « peintes »
    c.setRGB(0, 0, 0);
    for (let b = 0; b < 5; b++) { tmp.copy(GROUND[b][0]).lerp(GROUND[b][1], patch); c.r += tmp.r * w[b]; c.g += tmp.g * w[b]; c.b += tmp.b * w[b]; }
    const fine = 0.94 + 0.1 * fbm(x * 0.35, z * 0.35, 2);
    c.multiplyScalar(fine);
    c.lerp(PATH_COL, 1 - smoothstep(0.7, 1.6, PATHD[k]));
    c.lerp(SAND_COL, 1 - smoothstep(0.2, 2.6, WATERD[k] + 2.5));
    const r = Math.hypot(x, z);
    const mnt = smoothstep(152, 178, r);
    c.lerp(ROCK_COL, mnt * 0.85);
    c.lerp(SNOWCAP, mnt * smoothstep(14, 26, H[k]));
    cols[v * 3] = c.r; cols[v * 3 + 1] = c.g; cols[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const mat = toon(0xffffff, { vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = quality.shadows;
  mesh.name = 'Terrain';
  return mesh;
}

// --- Eau stylisée (ruban le long de la rivière + étang) ---
export function buildWater(fieldTex) {
  const width = RIVER_HALF + 5;
  const verts = [], idx = [];
  for (let i = 0; i < RIVER.length; i++) {
    const [x, z] = RIVER[i];
    const [nx, nz] = RIVER[Math.min(RIVER.length - 1, i + 1)], [px, pz] = RIVER[Math.max(0, i - 1)];
    let dx = nx - px, dz = nz - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    verts.push(x - dz * width, WATER_LEVEL, z + dx * width, x + dz * width, WATER_LEVEL, z - dx * width);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const base = verts.length / 3, segs = 48;
  verts.push(POND.x, WATER_LEVEL, POND.z);
  for (let s = 0; s <= segs; s++) {
    const a = (s / segs) * Math.PI * 2; verts.push(POND.x + Math.cos(a) * (POND.r + 5), WATER_LEVEL, POND.z + Math.sin(a) * (POND.r + 5));
    if (s > 0) idx.push(base, base + s + 1, base + s);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uField: { value: fieldTex }, uTime: { value: 0 }, uDay: { value: 1 },
      uSky: { value: new THREE.Color('#9fd3ff') }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    }]),
    vertexShader: /* glsl */`
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      ${FIELD_GLSL}
      uniform float uTime, uDay; uniform vec3 uSky, uSunDir;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float depth = ${WATER_LEVEL.toFixed(2)} - field(vW.xz).r;
        if (depth < -0.02) discard;
        vec3 shallow = vec3(0.30,0.78,0.78), deep = vec3(0.06,0.30,0.55);
        vec3 col = mix(shallow, deep, smoothstep(0.0, 1.1, depth));
        float n = vn(vW.xz*0.9 + vec2(uTime*0.35, uTime*0.2)) * vn(vW.xz*1.7 - vec2(uTime*0.25, -uTime*0.3));
        col = mix(col, uSky, 0.12 + 0.18*n);
        float foam = 1.0 - smoothstep(0.0, 0.18 + 0.08*sin(uTime*1.5 + vW.x*0.7), depth);
        col = mix(col, vec3(1.0), foam*0.85);
        float spark = smoothstep(0.82, 0.95, n) * uDay;
        col += vec3(1.0,0.97,0.85) * spark * 0.8;
        col *= mix(0.35, 1.0, uDay);
        gl_FragColor = vec4(col, mix(0.55, 0.92, smoothstep(0.0,0.8,depth)) + foam*0.1);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2; mesh.name = 'Water';
  return mesh;
}
