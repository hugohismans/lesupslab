// Portails vers les autres projets et Hall of Fame : mêmes fichiers JSON que la V1, nouveau style.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { U } from './shared.js';
import { groundY } from './world.js';
import { toon, makeLabel, noise2, rng } from './util.js';

const V1 = '../v1/';
const loader = new THREE.TextureLoader();
function tex(url) { const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace; return t; }

// Résolution d'URL identique à la V1 (site servi sous /lesupslab/)
function detectBase() {
  const segs = location.pathname.split('/').filter(Boolean);
  const i = segs.indexOf('projects');
  if (i > 0) return '/' + segs.slice(0, i).join('/') + '/';
  if (i === 0) return '/';
  return '/lesupslab/';
}
export function resolveUrl(url) {
  if (!url) return location.href;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return location.origin + url;
  return location.origin + detectBase() + url.replace(/^\/+/, '');
}

const PORTAL_FS = /* glsl */`
uniform sampler2D uMap; uniform float uTime, uHover; uniform vec3 uTint;
varying vec2 vUv;
void main(){
  vec2 p = vUv*2.0-1.0; float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  vec2 uv = vUv + vec2(sin(a*3.0 + uTime*1.5), cos(a*2.0 - uTime))*0.006*(1.0-r);
  vec3 img = texture2D(uMap, (uv-0.5)*0.92+0.5).rgb;
  float swirl = 0.5+0.5*sin(a*5.0 - uTime*2.0 + r*12.0);
  float rim = smoothstep(0.7, 1.0, r);
  vec3 col = mix(img, uTint*1.3 + swirl*0.25, rim*0.85);
  col += uTint * uHover * 0.25;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Portals {
  constructor(scene) { this.scene = scene; this.items = []; this.group = new THREE.Group(); scene.add(this.group); }

  async load() {
    let list = [];
    try { list = await (await fetch(V1 + 'portals.json', { cache: 'no-cache' })).json(); } catch (e) { console.warn('[portails] JSON introuvable', e); }
    const stoneGeo = this.archGeo();
    for (const p of list) {
      const [x, , z] = p.position || [0, 0, 0];
      const y = groundY(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z);
      g.rotation.y = -Math.PI / 2; // face à l'allée
      const arch = new THREE.Mesh(stoneGeo, toon(0xffffff, { vertexColors: true })); arch.castShadow = arch.receiveShadow = true;
      const tint = new THREE.Color(p.particleColor || '#66ccff');
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), new THREE.ShaderMaterial({
        uniforms: { uMap: { value: tex(V1 + p.image) }, uTime: U.uTime, uHover: { value: 0 }, uTint: { value: tint } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: PORTAL_FS, side: THREE.DoubleSide,
      }));
      disc.position.y = 1.75;
      // particules en orbite
      const n = 90, pos = new Float32Array(n * 3), ang = new Float32Array(n);
      for (let i = 0; i < n; i++) ang[i] = Math.random() * Math.PI * 2;
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: tint, size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      pts.position.y = 1.75;
      const title = (p.title || p.id || '').replace(/^Clique pour acc[ée]der à\s*:\s*/i, '');
      const label = makeLabel(title, '#' + tint.getHexString(), { fontSize: 30, worldHeight: 0.5 });
      label.position.y = 3.55;
      g.add(arch, disc, pts, label);
      this.group.add(g);
      this.items.push({ g, disc, pts, ang, n, url: p.url, title, desc: p.description || '', x, z });
    }
  }

  archGeo() {
    const parts = [], r = rng(77);
    const stones = 15;
    for (let i = 0; i < stones; i++) {
      const a = Math.PI * 1.15 * (i / (stones - 1)) - Math.PI * 0.075;
      const g = new THREE.BoxGeometry(0.5, 0.42, 0.55, 2, 2, 2);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const n = noise2(p.getX(k) * 5 + i, p.getY(k) * 5 + p.getZ(k) * 3); p.setXYZ(k, p.getX(k) * (1 + n * 0.08), p.getY(k) * (1 + n * 0.08), p.getZ(k)); }
      g.rotateZ(a - Math.PI / 2);
      g.translate(Math.cos(a) * 1.45, 1.75 + Math.sin(a) * 1.45, 0);
      const ng = g.toNonIndexed(); ng.deleteAttribute('uv');
      const c = new THREE.Color('#b9b2a6').multiplyScalar(0.85 + r() * 0.2);
      const col = new Float32Array(ng.attributes.position.count * 3);
      for (let k = 0; k < col.length; k += 3) { col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
      ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(ng);
    }
    // piliers jusqu'au sol + mousse
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.55, 1.8, 0.6).translate(side * 1.52, 0.9, 0).toNonIndexed(); g.deleteAttribute('uv');
      const col = new Float32Array(g.attributes.position.count * 3); const c = new THREE.Color('#a9a294');
      for (let k = 0; k < col.length; k += 3) { const y = g.attributes.position.getY(k / 3); const m = y > 1.5 ? new THREE.Color('#7da55a') : c; col[k] = m.r; col[k + 1] = m.g; col[k + 2] = m.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
    }
    const geo = mergeGeometries(parts); geo.computeVertexNormals(); return geo;
  }

  update(dt, player) {
    let near = null, nd = 3.2;
    for (const it of this.items) {
      for (let i = 0; i < it.n; i++) {
        it.ang[i] += dt * (0.4 + (i % 5) * 0.12);
        const rad = 1.3 + Math.sin(i * 1.7 + U.uTime.value) * 0.12;
        it.pts.geometry.attributes.position.setXYZ(i, Math.cos(it.ang[i]) * rad, Math.sin(it.ang[i]) * rad, Math.sin(it.ang[i] * 3 + i) * 0.15);
      }
      it.pts.geometry.attributes.position.needsUpdate = true;
      const d = Math.hypot(player.x - it.x, player.z - it.z);
      if (d < nd) { nd = d; near = it; }
      it.disc.material.uniforms.uHover.value += ((it.hover ? 1 : 0) - it.disc.material.uniforms.uHover.value) * 0.15;
    }
    return near;
  }

  pick(raycaster) {
    const hit = raycaster.intersectObjects(this.items.map(i => i.disc), false)[0];
    return hit ? this.items.find(i => i.disc === hit.object) : null;
  }
  go(item) { window.location.href = resolveUrl(item.url); }
}

// --- Hall of Fame : petite galerie en bois sous un toit ---
export class HallOfFame {
  constructor(scene) { this.scene = scene; this.frames = []; }

  async load() {
    let list = [];
    try { list = await (await fetch(V1 + 'hof.json', { cache: 'no-cache' })).json(); } catch (e) { console.warn('[HOF] JSON introuvable', e); }
    const x = -20, z = -20, y = groundY(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.PI / 4;
    const wood = toon('#8a6448'), dark = toon('#5e4433'), roofM = toon('#3f6d8a');
    const W = Math.max(7, list.length * 2.4 + 1.6);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(W, 3.2, 0.2), wood); wall.position.set(0, 1.9, -0.3); wall.castShadow = wall.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.18, 2.2), roofM); roof.position.set(0, 3.7, 0.4); roof.rotation.x = 0.28; roof.castShadow = true;
    const posts = [-W / 2, W / 2].map(px => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 8), dark); m.position.set(px, 1.8, 1.2); m.castShadow = true; return m; });
    const titleTex = this.signTexture('Hall of Fame');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshBasicMaterial({ map: titleTex, transparent: true }));
    sign.position.set(0, 3.2, -0.18);
    g.add(wall, roof, ...posts, sign);
    list.forEach((it, i) => {
      const fx = (i - (list.length - 1) / 2) * 2.4;
      const size = it.size || 1.4;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(size + 0.24, size + 0.24, 0.08), toon('#d9b26a'));
      frame.position.set(fx, 1.95, -0.16); frame.castShadow = true;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex(V1 + it.image) }));
      pic.position.set(fx, 1.95, -0.11);
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.62), new THREE.MeshBasicMaterial({ map: this.plaqueTexture(it.titre || '', it.description || ''), transparent: true }));
      plaque.position.set(fx, 0.75, -0.18);
      g.add(frame, pic, plaque);
      this.frames.push({ pic, it });
    });
    this.scene.add(g);
    this.group = g;
  }

  signTexture(text) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 224; const x = c.getContext('2d');
    x.fillStyle = '#f6e7c8'; x.beginPath(); x.roundRect?.(8, 8, 1008, 208, 40); x.fill();
    x.strokeStyle = '#8a6448'; x.lineWidth = 10; x.stroke();
    x.fillStyle = '#5e4433'; x.font = '700 120px "Nunito", system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('✦ ' + text + ' ✦', 512, 118);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  plaqueTexture(title, desc) {
    const c = document.createElement('canvas'); c.width = 840; c.height = 248; const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,248,232,0.95)'; x.beginPath(); x.roundRect?.(4, 4, 832, 240, 24); x.fill();
    x.fillStyle = '#4a3a2e'; x.textAlign = 'center';
    x.font = '700 54px "Nunito", system-ui'; x.fillText(title, 420, 100);
    x.font = '500 42px "Nunito", system-ui'; x.fillStyle = '#7a6250'; x.fillText(desc, 420, 178);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
}
