// Fleurs V2 : plusieurs familles générées à partir de la graine de chaque fleur.
// Chaque fleur est fusionnée en un seul maillage (couleurs par sommet) pour rester légère.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { U } from './shared.js';
import { rng, hashStr, lerp, clamp01, makeLabel, disposeLabel, softRamp } from './util.js';
import { groundY, WATER_LEVEL } from './world.js';

export const FAMILIES = ['marguerite', 'tulipe', 'clochette', 'coquelicot', 'cosmos', 'lupin', 'pompon'];

// Matériau commun : ombrage doux + balancement au vent + lueur la nuit
export function plantMaterial({ glowAmount = 0.9, windAmp = 1 } = {}) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: softRamp(), side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uNight = U.uNight; sh.uniforms.uWindDir = U.uWindDir;
    sh.uniforms.uGlowAmt = { value: glowAmount }; sh.uniforms.uWindAmp = { value: windAmp };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWindAmp; uniform vec2 uWindDir; attribute float glow; varying float vGlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGlow = glow;
        { vec3 o = vec3(modelMatrix[3][0], 0.0, modelMatrix[3][2]);
          #ifdef USE_INSTANCING
            o += vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          #endif
          float ph = o.x*0.37 + o.z*0.21;
          float gust = 0.5 + 0.5*sin(uTime*0.9 - dot(o.xz, uWindDir)*0.08);
          float k = position.y*position.y * uWindAmp;
          transformed.x += (sin(uTime*2.1 + ph)*0.05 + uWindDir.x*0.09*gust) * k;
          transformed.z += (cos(uTime*1.7 + ph)*0.04 + uWindDir.y*0.09*gust) * k; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight, uGlowAmt; varying float vGlow;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vColor.rgb * vGlow * (0.12 + uNight * uGlowAmt);`);
  };
  return mat;
}

// --- Briques géométriques ---
function finish(geo, colorFn, glow) {
  const pos = geo.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3), gl = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) { colorFn(i, c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; gl[i] = glow; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
  if (geo.index) { geo.computeVertexNormals(); geo = geo.toNonIndexed(); }
  else geo.computeVertexNormals();
  geo.deleteAttribute('uv');
  return geo;
}

// Pétale : grille u (largeur) × v (longueur), forme + creusement + courbure
export function petalGeo({ len = 0.2, wid = 0.08, shape = 'round', cup = 0.3, curl = 0.2, su = 3, sv = 5, base, tip, glow = 1, notch = 0 }) {
  const pos = [], idx = [], vv = [];
  for (let j = 0; j <= sv; j++) {
    const v = j / sv;
    let w;
    if (shape === 'round') w = Math.sin(Math.PI * Math.pow(v, 0.75)) * (1 - 0.15 * v);
    else if (shape === 'point') w = Math.sin(Math.PI * v) * (1 - 0.55 * v * v);
    else if (shape === 'heart') w = Math.sin(Math.PI * Math.pow(v, 0.6));
    else w = Math.pow(Math.sin(Math.PI * v), 0.6); // 'long'
    for (let i = 0; i <= su; i++) {
      const u = (i / su) * 2 - 1;
      let y = v * len;
      if (notch && v === 1) y -= notch * len * (1 - Math.abs(u));
      const x = u * w * wid;
      const z = cup * wid * u * u + curl * len * v * v;
      pos.push(x, y, z); vv.push(v);
    }
  }
  for (let j = 0; j < sv; j++) for (let i = 0; i < su; i++) {
    const a = j * (su + 1) + i, b = a + su + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const cb = new THREE.Color(base), ct = new THREE.Color(tip);
  const g = finish(geo, () => {}, glow);
  // couleur selon la position le long du pétale (recalculée après toNonIndexed)
  const p = g.attributes.position, col = g.attributes.color;
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const v = clamp01(p.getY(i) / len); c.copy(cb).lerp(ct, Math.pow(v, 0.8)); col.setXYZ(i, c.r, c.g, c.b); }
  return g;
}

function colored(geo, color, glow = 0, shade = 0) {
  const c0 = new THREE.Color(color);
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox, h = Math.max(1e-4, max.y - min.y);
  return finish(geo, (i, c) => { const k = 1 + shade * ((geo.attributes.position.getY(i) - min.y) / h - 0.5); c.copy(c0).multiplyScalar(k); }, glow);
}

function stemGeo(height, lean, leanDir, radius, color, segs = 6) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(Math.cos(leanDir) * lean * 0.2, height * 0.55, Math.sin(leanDir) * lean * 0.2),
    new THREE.Vector3(Math.cos(leanDir) * lean, height, Math.sin(leanDir) * lean));
  const g = new THREE.TubeGeometry(curve, segs, radius, 5, false);
  return { geo: colored(g, color, 0, 0.5), curve };
}

function leafGeo(len, wid, color, light) {
  return petalGeo({ len, wid, shape: 'point', cup: 0.6, curl: 0.35, su: 2, sv: 4, base: color, tip: light, glow: 0 });
}

// Place une géométrie : rotation (ouverture / azimut) puis translation
function place(geo, { rx = 0, ry = 0, rz = 0, x = 0, y = 0, z = 0, s = 1 }) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s));
  geo.applyMatrix4(m); return geo;
}

function harmonize(hex, r) {
  const base = new THREE.Color(hex), hsl = {}; base.getHSL(hsl);
  const s = clamp01(Math.max(0.45, hsl.s) * 0.95 + 0.05);
  const petal = new THREE.Color().setHSL(hsl.h + (r() - 0.5) * 0.04, s, clamp01(lerp(0.52, 0.66, r())));
  const deep = new THREE.Color().setHSL(hsl.h + (r() - 0.5) * 0.06, clamp01(s + 0.1), clamp01(lerp(0.3, 0.42, r())));
  const light = new THREE.Color().setHSL(hsl.h, clamp01(s * 0.7), clamp01(lerp(0.78, 0.9, r())));
  return { petal, deep, light };
}
const GREENS = { printemps: ['#3f8f3a', '#79c25a'], ete: ['#4c8a2c', '#9cc955'], automne: ['#5f7a2a', '#a8a043'], hiver: ['#3e6b55', '#7fa894'], desert: ['#6f8a3a', '#a8b45a'] };

export function buildFlowerGeometry(data, key) {
  const seed = ((data.seed ?? data.ts ?? 1) ^ hashStr(key || '')) >>> 0;
  const r = rng(seed);
  const fam = Math.floor(r() * FAMILIES.length);
  const col = harmonize(data.color || '#ff88cc', r);
  const [g0, g1] = GREENS[data.biome] || GREENS.printemps;
  const parts = [];
  const H = lerp(0.5, 0.85, r()) * (fam === 5 ? 1.25 : 1), lean = lerp(0, 0.12, r()), leanDir = r() * Math.PI * 2;
  const { geo: stem, curve } = stemGeo(H, lean, leanDir, 0.014, g0);
  parts.push(stem);
  // feuilles à la base
  const nl = 2 + Math.floor(r() * 2);
  for (let i = 0; i < nl; i++) {
    const t = 0.05 + r() * 0.3, p = curve.getPoint(t);
    parts.push(place(leafGeo(lerp(0.16, 0.26, r()), 0.05, g0, g1), { rx: lerp(0.7, 1.1, r()), ry: (i / nl) * Math.PI * 2 + r(), x: p.x, y: p.y, z: p.z }));
  }
  const top = curve.getPoint(1);
  const tan = curve.getTangent(1);
  const head = [];
  const center = (rad, c, h = 0.5) => colored(new THREE.SphereGeometry(rad, 8, 6).scale(1, h, 1), c, 0.6, 0.3);

  switch (FAMILIES[fam]) {
    case 'marguerite': {
      const n = 13 + Math.floor(r() * 6), len = lerp(0.1, 0.14, r());
      for (let i = 0; i < n; i++) head.push(place(petalGeo({ len, wid: 0.022, shape: 'long', cup: 0.2, curl: -0.15, su: 2, sv: 3, base: col.light, tip: '#ffffff', notch: 0.08 }), { rx: Math.PI / 2 - 0.15, ry: (i / n) * Math.PI * 2 }));
      head.push(place(center(0.035, '#f6c23e'), { y: 0.005 }));
      break;
    }
    case 'tulipe': {
      for (let i = 0; i < 6; i++) head.push(place(petalGeo({ len: 0.13, wid: 0.06, shape: 'round', cup: 0.8, curl: -0.25, base: col.deep, tip: col.petal }), { rx: 0.28 + (i % 2) * 0.12, ry: (i / 6) * Math.PI * 2 + (i % 2) * 0.5, y: -0.01 }));
      break;
    }
    case 'clochette': {
      // tête penchée : clochettes qui pendent
      const nb = 2 + Math.floor(r() * 2);
      for (let b = 0; b < nb; b++) {
        const t = 0.72 + b * 0.1, p = curve.getPoint(Math.min(1, t));
        for (let i = 0; i < 5; i++) parts.push(place(petalGeo({ len: 0.075, wid: 0.035, shape: 'round', cup: 0.9, curl: 0.35, su: 2, sv: 4, base: col.deep, tip: col.light }), { rx: Math.PI - 0.35, ry: (i / 5) * Math.PI * 2, x: p.x + 0.04 * Math.cos(b * 2.4), y: p.y + 0.02, z: p.z + 0.04 * Math.sin(b * 2.4) }));
      }
      break;
    }
    case 'coquelicot': {
      for (let i = 0; i < 4; i++) head.push(place(petalGeo({ len: 0.11, wid: 0.09, shape: 'heart', cup: 0.6, curl: -0.1, base: col.deep, tip: col.petal }), { rx: 0.9, ry: (i / 4) * Math.PI * 2 + 0.3 }));
      head.push(place(center(0.03, '#2b2233', 0.8), { y: 0.02 }));
      for (let i = 0; i < 8; i++) head.push(place(colored(new THREE.SphereGeometry(0.008, 4, 3), '#ffe28a', 1), { x: Math.cos(i) * 0.035, y: 0.03, z: Math.sin(i) * 0.035 }));
      break;
    }
    case 'cosmos': {
      const n = 8;
      for (let i = 0; i < n; i++) head.push(place(petalGeo({ len: 0.13, wid: 0.045, shape: 'heart', cup: 0.35, curl: -0.1, base: col.deep, tip: col.light, notch: 0.12 }), { rx: Math.PI / 2 - 0.25, ry: (i / n) * Math.PI * 2 }));
      head.push(place(center(0.025, '#ffd34d', 0.9), { y: 0.01 }));
      break;
    }
    case 'lupin': {
      // épi de petites fleurs le long du haut de la tige
      const rows = 9;
      for (let k = 0; k < rows; k++) {
        const t = 0.62 + (k / rows) * 0.38, p = curve.getPoint(t), s = lerp(1, 0.45, k / rows);
        for (let i = 0; i < 4; i++) parts.push(place(petalGeo({ len: 0.05 * s, wid: 0.03 * s, shape: 'round', cup: 0.7, curl: 0.2, su: 2, sv: 2, base: col.deep, tip: k > rows - 3 ? col.light : col.petal }), { rx: 1.2, ry: (i / 4) * Math.PI * 2 + k * 0.7, x: p.x, y: p.y, z: p.z }));
      }
      break;
    }
    default: { // pompon (dahlia boule)
      const rings = 6;
      for (let k = 0; k < rings; k++) {
        const n = 6 + k * 2, el = (k / rings) * Math.PI * 0.95;
        for (let i = 0; i < n; i++) head.push(place(petalGeo({ len: 0.05, wid: 0.03, shape: 'round', cup: 0.9, curl: 0.3, su: 2, sv: 2, base: col.deep, tip: k < 2 ? col.light : col.petal }), { rx: el, ry: (i / n) * Math.PI * 2 + k, y: 0.04 }));
      }
    }
  }
  // oriente la tête selon la tige et la place au sommet
  if (head.length) {
    const h = mergeGeometries(head);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.clone().lerp(new THREE.Vector3(0, 1, 0), 0.4).normalize());
    h.applyQuaternion(q); h.translate(top.x, top.y, top.z);
    parts.push(h);
  }
  const geo = mergeGeometries(parts);
  return { geo, family: FAMILIES[fam], height: H, petal: col.petal };
}

// Petit îlot si la fleur a été plantée là où coule maintenant la rivière
function isletGeo() {
  const top = colored(new THREE.CylinderGeometry(0.55, 0.75, 0.25, 12), '#6fae4a', 0);
  const rim = colored(new THREE.CylinderGeometry(0.78, 0.9, 0.12, 12).translate(0, -0.12, 0), '#cdb98a', 0);
  return mergeGeometries([top, rim]);
}

export class Flowers {
  constructor(scene) {
    this.scene = scene;
    this.mat = plantMaterial();
    this.nodes = new Map();      // fleurs construites : clé → maillage
    this.data = new Map();       // toutes les fleurs connues, dans l'ordre d'arrivée
    this.pending = new Map();    // en attente de construction (on étale le travail)
    this.labelOn = null;
    this.group = new THREE.Group(); this.group.name = 'Flowers';
    scene.add(this.group);
    this._islet = null;
  }

  add(key, d, { fresh = false } = {}) {
    if (this.data.has(key)) return;
    this.data.set(key, d);
    if (fresh) this.build(key, d, true); else this.pending.set(key, d);
  }

  // Construit en priorité les fleurs proches, sans dépasser `budgetMs` par image
  process(player, budgetMs) {
    if (!this.pending.size) return;
    const t0 = performance.now();
    const list = [...this.pending].map(([k, d]) => [k, d, ((+d.x || 0) - player.x) ** 2 + ((+d.z || 0) - player.z) ** 2]).sort((a, b) => a[2] - b[2]);
    for (const [k, d] of list) {
      this.pending.delete(k); this.build(k, d, false);
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  build(key, d, fresh) {
    const x = +d.x || 0, z = +d.z || 0;
    const { geo, family, height, petal } = buildFlowerGeometry(d, key);
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.castShadow = true;
    let y = groundY(x, z);
    if (y < WATER_LEVEL + 0.05) {
      this._islet = this._islet || isletGeo();
      const islet = new THREE.Mesh(this._islet, this.mat);
      islet.position.set(x, WATER_LEVEL, z); islet.receiveShadow = true;
      this.group.add(islet); mesh.userData.islet = islet;
      y = WATER_LEVEL + 0.12;
    }
    mesh.position.set(x, y, z);
    mesh.rotation.y = (hashStr(key) % 628) / 100;
    mesh.userData = { ...mesh.userData, key, data: d, family, height, petal, born: fresh ? performance.now() : 0 };
    if (fresh) mesh.scale.setScalar(0.001);
    this.group.add(mesh);
    this.nodes.set(key, mesh);
  }

  change(key, d) {
    if (this.data.has(key)) this.data.set(key, d);
    if (this.pending.has(key)) this.pending.set(key, d);
    const m = this.nodes.get(key); if (!m) return;
    m.userData.data = d;
    if (this.labelOn === m) { this.hideLabel(); }
  }

  remove(key) {
    this.data.delete(key); this.pending.delete(key);
    const m = this.nodes.get(key); if (!m) return;
    if (this.labelOn === m) this.hideLabel();
    if (m.userData.islet) this.group.remove(m.userData.islet);
    m.geometry.dispose(); this.group.remove(m); this.nodes.delete(key);
  }

  labelText(d) {
    const t = typeof d.ts === 'number' ? d.ts : Date.now();
    const dt = new Date(t);
    const date = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    let s = `${d.name || 'Fée#' + String(d.uid || '').slice(0, 4)} • ${date}`;
    if (d.msg && String(d.msg).trim()) s += ' — « ' + String(d.msg).trim().slice(0, 140) + ' »';
    return s;
  }
  showLabel(m) {
    if (this.labelOn === m) return;
    this.hideLabel();
    const lbl = makeLabel(this.labelText(m.userData.data), '#' + m.userData.petal.getHexString(), { fontSize: 26, maxWidth: 380, worldHeight: 0.36 });
    lbl.position.set(m.position.x, m.position.y + m.userData.height + 0.25, m.position.z);
    this.scene.add(lbl);
    this.labelOn = m; this.label = lbl;
  }
  hideLabel() { if (this.label) disposeLabel(this.label); this.label = null; this.labelOn = null; }

  // Visibilité par distance + éclosion des fleurs fraîches + étiquette de la plus proche
  tick(player, now) {
    let best = null, bestD = 2.6;
    const maxD2 = 95 * 95;
    for (const m of this.nodes.values()) {
      const dx = m.position.x - player.x, dz = m.position.z - player.z, d2 = dx * dx + dz * dz;
      m.visible = d2 < maxD2;
      if (m.userData.islet) m.userData.islet.visible = m.visible;
      if (m.userData.born) {
        const t = clamp01((now - m.userData.born) / 1600);
        const e = 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.12;
        m.scale.setScalar(Math.max(0.001, e));
        if (t >= 1) { m.userData.born = 0; m.scale.setScalar(1); }
      }
      const d = Math.sqrt(d2);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (this.pinned && this.nodes.has(this.pinned.userData.key)) best = this.pinned;
    if (best) this.showLabel(best); else this.hideLabel();
  }

  pick(raycaster) {
    const vis = [...this.nodes.values()].filter(m => m.visible);
    const hit = raycaster.intersectObjects(vis, false)[0];
    return hit ? hit.object : null;
  }

  positions() { return [...this.nodes.values()].map(m => [m.position.x, m.position.z]); }
}
