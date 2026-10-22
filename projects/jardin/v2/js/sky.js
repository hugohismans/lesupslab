// Ciel peint : dégradé, gros nuages cotonneux, soleil, lune, étoiles, montagnes lointaines,
// lumière et brouillard qui suivent l'heure réelle de Paris (comme la V1)
import * as THREE from 'three';
import { U } from './shared.js';
import { smoothstep, lerp, fbm } from './util.js';

const C = (h) => new THREE.Color(h);
// Ambiances clés selon la hauteur du soleil (sinus de l'élévation)
const KEYS = [
  { e: -0.35, top: C('#121c45'), hor: C('#2f4180'), fog: C('#27366a'), sun: C('#a9bfff'), sunI: 0.85, hs: C('#7086d4'), hg: C('#2a3152'), hI: 1.15 },
  { e: -0.08, top: C('#34407e'), hor: C('#e8907a'), fog: C('#b98a92'), sun: C('#ffb08a'), sunI: 0.5, hs: C('#8a86c0'), hg: C('#3a3040'), hI: 0.8 },
  { e: 0.08, top: C('#5d8fd6'), hor: C('#ffd29a'), fog: C('#f2d2a8'), sun: C('#ffc98a'), sunI: 1.6, hs: C('#c7d9ff'), hg: C('#7a6a48'), hI: 0.8 },
  { e: 0.3, top: C('#4f9be8'), hor: C('#cdeaff'), fog: C('#cfe5f2'), sun: C('#fff3dc'), sunI: 2.4, hs: C('#cfe6ff'), hg: C('#7d9450'), hI: 0.9 },
];
function sampleKeys(e) {
  let a = KEYS[0], b = KEYS[0], t = 0;
  if (e <= KEYS[0].e) { a = b = KEYS[0]; }
  else if (e >= KEYS[KEYS.length - 1].e) { a = b = KEYS[KEYS.length - 1]; }
  else for (let i = 0; i < KEYS.length - 1; i++) if (e >= KEYS[i].e && e <= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; t = (e - a.e) / (b.e - a.e); break; }
  t = t * t * (3 - 2 * t);
  const out = {};
  for (const k of Object.keys(a)) out[k] = (a[k].isColor) ? a[k].clone().lerp(b[k], t) : lerp(a[k], b[k], t);
  return out;
}

export function parisHour() {
  const forced = new URLSearchParams(location.search).get('hour');
  if (forced !== null && !isNaN(+forced)) return ((+forced % 24) + 24) % 24;
  if (typeof window.TEST_TIME === 'number') return ((window.TEST_TIME % 24) + 24) % 24;
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: 'Europe/Paris' }).formatToParts(now);
    const h = +parts.find(p => p.type === 'hour').value, m = +parts.find(p => p.type === 'minute').value;
    return h + m / 60 + now.getSeconds() / 3600;
  } catch { return (now.getUTCHours() + 1 + now.getUTCMinutes() / 60) % 24; }
}

const SKY_VS = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position,1.0)).xyz, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */`
uniform vec3 uTop, uHor, uGround, uSunDir, uMoonDir, uSunCol;
uniform float uNight, uTime, uCover, uDusk;
varying vec3 vDir;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.02+vec2(1.7,9.2); a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHor, uTop, pow(clamp(y,0.0,1.0), 0.55));
  col = mix(col, uGround, smoothstep(0.0, -0.25, y));
  // halo du soleil (plus large au coucher)
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 6.0)*0.22*(1.0+uDusk) + pow(sd, 60.0)*0.35) * (1.0-uNight);
  // étoiles
  if (uNight > 0.01 && y > 0.0){
    vec3 cell = floor(d*170.0);
    float st = h31(cell);
    float tw = 0.6 + 0.4*sin(uTime*2.0 + st*40.0);
    float star = step(0.9965, st) * smoothstep(0.35, 0.0, length(fract(d*170.0)-0.5)) * tw;
    col += vec3(1.0,0.96,0.88) * star * uNight * smoothstep(0.0,0.2,y);
  }
  // nuages cotonneux
  if (y > 0.0){
    vec2 uv = d.xz/(y+0.18) * 0.9 + vec2(uTime*0.006, uTime*0.0025);
    float n = fbm(uv*1.3);
    float dens = smoothstep(0.62-uCover, 0.86-uCover, n);
    float n2 = fbm(uv*1.3 + uSunDir.xz*0.12);
    float lit = clamp(0.55 + (n - n2)*4.0, 0.0, 1.0);
    vec3 shade = mix(uTop, uHor, 0.5) * mix(0.85, 0.55, uNight) + vec3(0.06,0.04,0.1);
    vec3 light = mix(vec3(1.0,0.99,0.97), uSunCol*1.1, 0.35+uDusk*0.5) * mix(1.0, 0.35, uNight);
    vec3 cc = mix(shade, light, lit);
    col = mix(col, cc, dens * smoothstep(0.0, 0.12, y) * 0.95);
  }
  // soleil
  float sun = smoothstep(0.9994, 0.9997, sd);
  col = mix(col, vec3(1.0,0.97,0.88)*1.6, sun*(1.0-uNight*0.9));
  // lune
  float md = dot(d, uMoonDir);
  float moon = smoothstep(0.99935, 0.99965, md);
  col += vec3(0.95,0.97,1.0) * (moon*1.2 + pow(max(md,0.0), 200.0)*0.25) * uNight;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    this.uniforms = {
      uTop: { value: C('#4f9be8') }, uHor: { value: C('#cdeaff') }, uGround: { value: C('#cfe5f2') },
      uSunDir: U.uSunDir, uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uSunCol: U.uSunCol,
      uNight: U.uNight, uTime: U.uTime, uCover: { value: 0.08 }, uDusk: { value: 0 },
    };
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.dome = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
    }));
    this.dome.scale.setScalar(900); this.dome.frustumCulled = false; this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.mountains = this.makeMountains();
    scene.add(this.mountains);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    const s = this.sun.shadow.camera; s.left = -45; s.right = 45; s.top = 45; s.bottom = -45; s.near = 1; s.far = 260;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04; this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x7d9450, 0.9);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xcfe5f2, 0.0055);
    this.state = null;
    this.biomeTint = new THREE.Color(1, 1, 1);
    this.biomeFogMul = 1;
  }

  // Deux rangées de montagnes « silhouette » très lointaines (perspective atmosphérique)
  makeMountains() {
    const g = new THREE.Group();
    this.mtnMats = [];
    [[560, 120, 0.25, 7], [760, 190, 0.55, 3]].forEach(([R, H, haze, seed]) => {
      const seg = 220, pos = [], idx = [], hz = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
        const n = fbm(x * 2.2 + seed, z * 2.2 - seed, 5) * 0.5 + 0.5;
        const top = H * (0.25 + n * n * 1.1);
        pos.push(x * R, -40, z * R, x * R, top, z * R); hz.push(0, 1);
        if (i > 0) { const b = (i - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('h', new THREE.Float32BufferAttribute(hz, 1));
      geo.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTop: this.uniforms.uTop, uHor: this.uniforms.uHor, uNight: U.uNight, uHaze: { value: haze } },
        vertexShader: `attribute float h; varying float vH; void main(){ vH = h; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uTop,uHor; uniform float uNight,uHaze; varying float vH;
          void main(){ vec3 base = mix(uTop, uHor, 0.55) * vec3(0.78,0.84,0.95);
            vec3 c = mix(base*mix(0.92,1.08,vH), uHor, uHaze);
            gl_FragColor = vec4(c,1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        side: THREE.DoubleSide, depthWrite: false, fog: false,
      });
      const m = new THREE.Mesh(geo, mat); m.renderOrder = -9; m.frustumCulled = false; g.add(m);
    });
    return g;
  }

  setBiome(weights) {
    // le brouillard prend la teinte du biome (hiver plus bleu, désert plus chaud)
    const tints = [C('#ffffff'), C('#fff8ea'), C('#ffeedd'), C('#eef5ff'), C('#fff0d6')];
    const t = new THREE.Color(0, 0, 0);
    weights.forEach((w, i) => { t.r += tints[i].r * w; t.g += tints[i].g * w; t.b += tints[i].b * w; });
    this.biomeTint.lerp(t, 0.05);
    this.biomeFogMul = lerp(this.biomeFogMul, 1 + weights[3] * 0.5 + weights[4] * 0.3, 0.05);
  }

  update(camera, focus) {
    const hour = parisHour();
    const theta = ((hour - 6.5) / 24) * Math.PI * 2;      // soleil levé de ~6h30 à ~18h30
    const elev = Math.sin(theta);
    const sunDir = new THREE.Vector3(Math.cos(theta) * 0.85, elev, 0.45).normalize();
    const moonDir = new THREE.Vector3(-sunDir.x, -sunDir.y, -0.3).normalize();
    if (moonDir.y < 0.25) moonDir.y = Math.max(moonDir.y, 0.25 * smoothstep(0, -0.2, elev)), moonDir.normalize();
    const st = sampleKeys(elev);
    const night = smoothstep(0.0, -0.22, elev);
    const dusk = Math.max(0, 1 - Math.abs(elev - 0.02) / 0.18);
    U.uNight.value = night;
    U.uSunDir.value.copy(sunDir);
    this.uniforms.uMoonDir.value.copy(moonDir);
    this.uniforms.uDusk.value = dusk;
    this.uniforms.uTop.value.copy(st.top);
    this.uniforms.uHor.value.copy(st.hor).multiply(this.biomeTint);
    this.uniforms.uGround.value.copy(st.fog).multiply(this.biomeTint);
    U.uSunCol.value.copy(st.sun);

    // lumière principale : le soleil le jour, la lune la nuit
    const keyDir = elev > -0.06 ? sunDir : moonDir;
    this.sun.color.copy(st.sun);
    this.sun.intensity = st.sunI * (elev > -0.06 ? smoothstep(-0.06, 0.06, elev) : smoothstep(-0.06, -0.2, elev)) + 0.05;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(keyDir, 120);
    this.hemi.color.copy(st.hs); this.hemi.groundColor.copy(st.hg); this.hemi.intensity = st.hI;
    U.uAmbSky.value.copy(st.hs).multiplyScalar(st.hI);
    U.uAmbGround.value.copy(st.hg).multiplyScalar(st.hI);
    this.scene.fog.color.copy(st.fog).multiply(this.biomeTint);
    this.scene.fog.density = 0.0055 * this.biomeFogMul * (1 + night * 0.4);

    this.dome.position.copy(camera.position);
    this.mountains.position.set(camera.position.x, 0, camera.position.z);
    this.state = { hour, elev, night, dusk };
    return this.state;
  }
}
