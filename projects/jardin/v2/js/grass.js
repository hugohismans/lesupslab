// Herbe dense animée par des rafales de vent. Un « tapis » de brins suit le joueur
// et se replie à l'infini ; hauteur, densité et couleur sont lues dans la texture du monde.
import * as THREE from 'three';
import { U } from './shared.js';
import { FIELD_GLSL } from './world.js';

const VS = /* glsl */`
${FIELD_GLSL}
uniform float uTime, uRadius, uTile;
uniform vec2 uWindDir;
uniform vec3 uPlayer, uCenter;
attribute vec3 aOffset;   // x, z dans la tuile, graine
varying float vH, vShade;
varying vec3 vCol, vTip;
varying float vFog;
#include <fog_pars_vertex>
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
const vec3 BASE[5] = vec3[5](vec3(0.10,0.36,0.10), vec3(0.24,0.40,0.08), vec3(0.42,0.30,0.08), vec3(0.55,0.62,0.66), vec3(0.55,0.46,0.24));
const vec3 TIP[5]  = vec3[5](vec3(0.46,0.80,0.24), vec3(0.80,0.78,0.30), vec3(0.92,0.56,0.20), vec3(0.90,0.95,1.00), vec3(0.88,0.76,0.44));
const float DENS[5] = float[5](1.0, 0.95, 0.85, 0.12, 0.10);
const float TALL[5] = float[5](1.0, 1.25, 1.0, 0.55, 0.7);
void main(){
  // position monde : la tuile se recentre en permanence sur le joueur
  vec2 corner = uCenter.xz - uTile*0.5;
  vec2 wp = corner + mod(aOffset.xy - corner, uTile);
  float dist = length(wp - uCenter.xz);
  vec4 f = field(wp);
  float w[5]; biomeW(f.b, f.a, w);
  float dens = 0.0, tall = 0.0; vec3 base = vec3(0.0), tip = vec3(0.0);
  for (int i=0;i<5;i++){ dens += DENS[i]*w[i]; tall += TALL[i]*w[i]; base += BASE[i]*w[i]; tip += TIP[i]*w[i]; }
  float seed = aOffset.z;
  float keep = step(seed, dens * f.g) * (1.0 - smoothstep(uRadius*0.75, uRadius, dist));
  // taches : certains brins plus clairs ou plus sombres (effet peint)
  float patchN = vn(wp*0.08);
  base *= 0.85 + 0.3*patchN; tip *= 0.9 + 0.2*patchN;
  float h = (0.28 + 0.4*fract(seed*7.13)) * tall * (0.7 + 0.6*vn(wp*0.15)) * keep;
  // vent : rafales qui parcourent le champ
  float gust = vn(wp*0.06 - uWindDir*uTime*0.9);
  float sway = (0.25 + gust*0.9) + sin(uTime*2.2 + seed*30.0 + wp.x*0.3)*0.12;
  vec3 p = position;
  float t = p.y;                     // 0 à la base, 1 au sommet
  float rot = seed*31.4;
  vec2 side = vec2(cos(rot), sin(rot));
  vec3 lp = vec3(side*p.x*0.042*(1.0-t*0.8), 0.0);
  lp = vec3(lp.x, t*h, lp.y);
  vec2 bend = uWindDir * sway * t*t * h * 0.9;
  // s'écarte au passage du joueur
  vec2 away = wp - uPlayer.xz; float ad = length(away);
  bend += (ad > 0.001 ? away/ad : vec2(0.0)) * (1.0 - smoothstep(0.0, 1.3, ad)) * t * h * 0.9;
  lp.xz += bend; lp.y -= dot(bend,bend)*0.35;
  vec3 world = vec3(wp.x, f.r, wp.y) + lp;
  vH = t; vCol = base; vTip = tip;
  vShade = 0.85 + gust*0.3;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = /* glsl */`
uniform vec3 uSunCol, uAmbSky, uSunDir;
uniform float uNight;
varying float vH, vShade;
varying vec3 vCol, vTip;
#include <fog_pars_fragment>
void main(){
  vec3 c = mix(vCol*0.55, vTip, smoothstep(0.0, 1.0, vH));
  float sun = clamp(uSunDir.y*1.5, 0.0, 1.0);
  vec3 light = uAmbSky*0.55 + uSunCol*sun*0.55;
  c *= light * vShade;
  c += vTip * pow(vH, 3.0) * 0.12 * sun;   // reflets dorés au bout des brins
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Grass {
  constructor(scene, fieldTex, preset) {
    this.scene = scene;
    const segs = 4;
    const blade = new THREE.InstancedBufferGeometry();
    const pos = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      if (i < segs) { pos.push(-1, t, 0, 1, t, 0); }
      else pos.push(0, 1, 0);
    }
    for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const a = (segs - 1) * 2; idx.push(a, a + 1, a + 2);
    blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    blade.setIndex(idx);
    this.geo = blade;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uField: { value: fieldTex }, uRadius: { value: 40 }, uTile: { value: 80 }, uCenter: { value: new THREE.Vector3() },
    }]);
    Object.assign(this.uniforms, { uTime: U.uTime, uWindDir: U.uWindDir, uPlayer: U.uPlayer, uSunCol: U.uSunCol, uAmbSky: U.uAmbSky, uSunDir: U.uSunDir, uNight: U.uNight });
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide, fog: true });
    this.mesh = new THREE.Mesh(blade, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'Grass';
    scene.add(this.mesh);
    this.setPreset(preset);
  }

  setPreset(preset) {
    const N = preset.grass, R = preset.grassRadius, T = R * 2;
    const off = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { off[i * 3] = Math.random() * T; off[i * 3 + 1] = Math.random() * T; off[i * 3 + 2] = Math.random(); }
    this.geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
    this.geo.instanceCount = N;
    this.uniforms.uRadius.value = R; this.uniforms.uTile.value = T;
  }

  update(center) { this.uniforms.uCenter.value.copy(center); }
}
