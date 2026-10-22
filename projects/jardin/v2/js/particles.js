// Particules d'ambiance par biome, entièrement sur GPU.
// Chaque système flotte autour de la caméra ; chaque particule lit le biome sous elle,
// ce qui donne des transitions naturelles quand on passe d'un biome à l'autre.
import * as THREE from 'three';
import { U } from './shared.js';
import { FIELD_GLSL } from './world.js';

// poids par biome : printemps, été, automne, hiver, désert
const SYSTEMS = [
  { name: 'petales', n: 900, box: [44, 12, 44], fall: 0.55, drift: 1.2, sway: 0.6, size: 0.16, shape: 'PETAL', w: [1, 0.15, 0, 0, 0], time: 'any', colors: ['#ffc4dc', '#ffe3ee', '#ffffff', '#f7a8c8'] },
  { name: 'pollen', n: 600, box: [30, 5, 30], fall: -0.05, drift: 0.4, sway: 0.5, size: 0.06, shape: 'SOFT', add: true, w: [0.8, 1, 0.3, 0, 0], time: 'day', colors: ['#fff6c0', '#ffe88a', '#ffffff'] },
  { name: 'lucioles', n: 520, box: [56, 3.5, 56], fall: 0, drift: 0.1, sway: 1.6, size: 0.2, shape: 'SOFT', add: true, glow: true, w: [0.6, 1, 0.6, 0, 0.1], time: 'night', colors: ['#d9ff7a', '#fff38a', '#b8ff9a'] },
  { name: 'feuilles', n: 700, box: [44, 14, 44], fall: 0.9, drift: 1.8, sway: 0.9, size: 0.22, shape: 'LEAF', w: [0, 0.08, 1, 0, 0], time: 'any', colors: ['#e2582c', '#f29a3a', '#ffc94a', '#c23a2a', '#d9772b'] },
  { name: 'neige', n: 2600, box: [52, 18, 52], fall: 1.0, drift: 0.5, sway: 0.35, size: 0.09, shape: 'SOFT', w: [0, 0, 0, 1, 0], time: 'any', colors: ['#ffffff', '#f0f6ff'] },
  { name: 'sable', n: 1300, box: [42, 2.6, 42], fall: 0, drift: 7.5, sway: 0.25, size: 0.12, shape: 'STREAK', w: [0, 0, 0, 0, 1], time: 'any', colors: ['#e9cf98', '#d8b47a', '#f3dfb4'] },
  { name: 'papillons', n: 70, box: [60, 2.2, 60], fall: 0, drift: 0.2, sway: 3.0, size: 0.32, shape: 'BUTTERFLY', w: [0.7, 1, 0.25, 0, 0], time: 'day', colors: ['#ffd35a', '#7ec8ff', '#ff9ad0', '#ffffff', '#c9a7ff'] },
];

const VS = /* glsl */`
${FIELD_GLSL}
uniform float uTime, uNight, uScale, uDensity;
uniform vec3 uCam, uBox;
uniform vec2 uWindDir;
uniform float uFall, uDrift, uSway, uSize;
uniform float uW[5];
uniform float uTimeMode;   // 0 = toujours, 1 = jour, 2 = nuit
attribute vec4 aSeed;
attribute vec3 aCol;
varying vec3 vCol;
varying float vAlpha, vRot, vFlap, vSeed;
void main(){
  float t = uTime;
  vec3 base = aSeed.xyz * uBox;
  float ph = aSeed.w * 6.2831;
  vec2 drift = uWindDir * uDrift * t + vec2(sin(t*0.7*(0.6+aSeed.w) + ph), cos(t*0.5*(0.6+aSeed.x) + ph)) * uSway;
  #ifdef BUTTERFLY
    drift += vec2(sin(t*0.25 + ph*3.0), cos(t*0.21 + ph*2.0)) * 4.0;
  #endif
  vec2 corner = uCam.xz - uBox.xz*0.5;
  vec2 xz = corner + mod(base.xz + drift - corner, uBox.xz);
  float yRel = mod(base.y - uFall*t + sin(t*1.3 + ph)*0.2, uBox.y);
  #ifdef STREAK
    yRel = 0.15 + pow(aSeed.y, 2.0)*uBox.y + sin(t*2.0 + ph)*0.1;
  #endif
  vec4 f = field(xz);
  vec3 wp = vec3(xz.x, f.r + yRel, xz.y);
  float w[5]; biomeW(f.b, f.a, w);
  float bw = 0.0; for (int i=0;i<5;i++) bw += w[i]*uW[i];
  float day = 1.0 - uNight;
  float tm = uTimeMode < 0.5 ? 1.0 : (uTimeMode < 1.5 ? smoothstep(0.3, 0.8, day) : smoothstep(0.25, 0.75, uNight));
  float present = step(aSeed.w, bw * tm * uDensity);
  float edge = 1.0 - smoothstep(0.75, 1.0, length(xz - uCam.xz) / (uBox.x*0.5));
  float yFade = smoothstep(0.0, 0.6, yRel) * (1.0 - smoothstep(uBox.y*0.85, uBox.y, yRel));
  #ifdef STREAK
    yFade = 1.0;
  #endif
  vAlpha = present * edge * yFade;
  #ifdef GLOW
    vAlpha *= smoothstep(0.2, 1.0, sin(t*(1.5+aSeed.x*2.0) + ph*5.0));
  #endif
  vCol = aCol;
  vRot = t*(0.8 + aSeed.x*2.0) + ph;
  vFlap = abs(sin(t*14.0 + ph*7.0));
  vSeed = aSeed.w;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vAlpha > 0.001 ? uSize * (0.7 + aSeed.y*0.6) * uScale / -mv.z : 0.0;
}`;

const FS = /* glsl */`
uniform float uNight;
uniform vec3 uAmb;
varying vec3 vCol;
varying float vAlpha, vRot, vFlap, vSeed;
void main(){
  vec2 p = gl_PointCoord*2.0 - 1.0;
  float a = 0.0;
  #if defined(SOFT)
    float d = length(p); a = smoothstep(1.0, 0.0, d); a *= a;
  #elif defined(PETAL) || defined(LEAF)
    float c = cos(vRot), s = sin(vRot);
    vec2 q = mat2(c,-s,s,c) * p;
    q.y *= 1.0 + 0.6*sin(vRot*0.7);          // effet de rotation 3D
    #ifdef LEAF
      float d = length(vec2(q.x*2.1, q.y)) + abs(q.y)*0.35;
      a = smoothstep(1.0, 0.8, d);
      a *= 1.0 - 0.35*smoothstep(0.06, 0.0, abs(q.x))*step(abs(q.y), 0.8);
    #else
      float d = length(vec2(q.x*1.7, q.y + 0.15*q.x*q.x));
      a = smoothstep(0.95, 0.75, d);
    #endif
  #elif defined(STREAK)
    float d = length(vec2(p.x*0.35, p.y*2.2)); a = smoothstep(1.0, 0.2, d) * 0.6;
  #elif defined(BUTTERFLY)
    vec2 q = p; q.x /= max(0.2, vFlap);
    float wing = min(length(q - vec2(-0.45, 0.2)) - 0.5, length(q - vec2(0.45, 0.2)) - 0.5);
    float wing2 = min(length(q - vec2(-0.35, -0.4)) - 0.32, length(q - vec2(0.35, -0.4)) - 0.32);
    a = smoothstep(0.05, -0.02, min(wing, wing2));
    float body = smoothstep(0.12, 0.05, abs(p.x)) * step(abs(p.y), 0.7);
    a = max(a, body);
  #endif
  a *= vAlpha;
  if (a < 0.02) discard;
  vec3 col = vCol;
  #ifdef BUTTERFLY
    col = mix(col, vec3(0.15,0.1,0.2), smoothstep(0.12, 0.05, abs(p.x)));
  #endif
  #ifndef GLOW
    col *= mix(vec3(1.0), uAmb*1.1 + 0.15, uNight*0.85);
  #else
    col *= 1.6;
  #endif
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class BiomeParticles {
  constructor(scene, fieldTex, preset) {
    this.systems = [];
    for (const S of SYSTEMS) {
      const n = Math.max(20, Math.floor(S.n * preset.particles));
      const geo = new THREE.BufferGeometry();
      const seed = new Float32Array(n * 4), col = new Float32Array(n * 3);
      const pal = S.colors.map(c => new THREE.Color(c));
      for (let i = 0; i < n; i++) {
        seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
        const c = pal[Math.floor(Math.random() * pal.length)]; col.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
      geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const defines = { [S.shape]: '' }; if (S.glow) defines.GLOW = '';
      const mat = new THREE.ShaderMaterial({
        defines, transparent: true, depthWrite: false,
        blending: S.add ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: {
          uField: { value: fieldTex }, uTime: U.uTime, uNight: U.uNight, uWindDir: U.uWindDir,
          uScale: { value: 400 }, uDensity: { value: 1 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...S.box) },
          uFall: { value: S.fall }, uDrift: { value: S.drift }, uSway: { value: S.sway }, uSize: { value: S.size },
          uW: { value: S.w }, uTimeMode: { value: S.time === 'any' ? 0 : S.time === 'day' ? 1 : 2 }, uAmb: U.uAmbSky,
        },
        vertexShader: VS, fragmentShader: FS,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false; pts.name = 'Particles_' + S.name; pts.renderOrder = 3;
      scene.add(pts);
      this.systems.push({ S, pts, mat });
    }
  }

  // N'affiche que les systèmes utiles autour du joueur (économise le GPU).
  // weights = poids max des biomes dans les environs (pas seulement sous le joueur)
  update(camPos, weights, night, viewportH, pixelRatio) {
    for (const { S, pts, mat } of this.systems) {
      let w = 0; for (let i = 0; i < 5; i++) w += weights[i] * S.w[i];
      if (S.time === 'day') w *= 1 - night; else if (S.time === 'night') w *= night;
      pts.visible = w > 0.01;
      mat.uniforms.uCam.value.copy(camPos);
      mat.uniforms.uScale.value = viewportH * pixelRatio * 0.5;
    }
  }
}
