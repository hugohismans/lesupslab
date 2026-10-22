// Arbres V2 : troncs ramifiés et feuillages en grosses touffes « peintes ».
// Le style dépend du biome ; la couleur du joueur donne des fruits lumineux / des fleurs.
// La croissance sur 2 jours de la V1 est conservée.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hashStr, lerp, clamp01, smoothstep, makeLabel, disposeLabel, noise2 } from './util.js';
import { groundY, biomeAt, WATER_LEVEL } from './world.js';
import { plantMaterial } from './flowers.js';

export const TREE_GROW_MS = 2 * 24 * 60 * 60 * 1000;

function withAttrs(geo, colorFn, glow = 0, keepNormals = false) {
  if (geo.index) { geo.computeVertexNormals(); geo = geo.toNonIndexed(); keepNormals = true; }
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  const p = geo.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), gl = new Float32Array(n), c = new THREE.Color();
  for (let i = 0; i < n; i++) { colorFn(p.getX(i), p.getY(i), p.getZ(i), c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; gl[i] = glow; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
  if (!keepNormals) geo.computeVertexNormals();
  return geo;
}

// Branche : tube conique le long d'une courbe
function branch(from, dir, len, r0, r1, bark, r) {
  const bend = new THREE.Vector3((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4);
  const mid = from.clone().addScaledVector(dir, len * 0.5).add(bend.multiplyScalar(len * 0.3));
  const end = from.clone().addScaledVector(dir, len);
  const curve = new THREE.QuadraticBezierCurve3(from, mid, end);
  const g = new THREE.TubeGeometry(curve, 5, 1, 6, false);
  // effilement : on ajuste le rayon le long du tube
  const p = g.attributes.position, segs = 5, radial = 6;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t), rad = lerp(r0, r1, t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      const v = new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k)).sub(c).multiplyScalar(rad);
      p.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  const dark = new THREE.Color(bark).multiplyScalar(0.85), light = new THREE.Color(bark).multiplyScalar(1.15);
  return { geo: withAttrs(g, (x, y, z, c) => c.copy(dark).lerp(light, clamp01(noise2(x * 3, y * 3) * 0.5 + 0.5))), end, curve };
}

// Touffe de feuillage : sphères bosselées, plus claires en haut
function puff(center, radius, cBase, cTop, r, flatten = 1) {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const n = noise2(v.x * 2.1 + r() * 0.001 + center.x, v.z * 2.1 + v.y * 1.3 + center.z);
    v.multiplyScalar(1 + n * 0.16); v.y *= flatten;
    p.setXYZ(i, v.x + center.x, v.y + center.y, v.z + center.z);
  }
  const nrm = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i) - center.x, (p.getY(i) - center.y) / flatten, p.getZ(i) - center.z).normalize(); nrm.set([v.x, v.y, v.z], i * 3); }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const a = new THREE.Color(cBase), b = new THREE.Color(cTop);
  return withAttrs(g, (x, y, z, c) => {
    const t = clamp01((y - center.y) / (radius * 1.2) * 0.5 + 0.5);
    c.copy(a).lerp(b, t * t);
  }, 0, true);
}

function fruit(pos, color, size) {
  return withAttrs(new THREE.SphereGeometry(size, 6, 5).translate(pos.x, pos.y, pos.z), (x, y, z, c) => c.set(color), 1);
}

const STYLES = {
  printemps: (r, accent) => r() < 0.5
    ? { kind: 'broad', bark: '#8a6450', leaves: [['#e58fb0', '#ffe0ec'], ['#f2a7c3', '#fff1f6']], accent: null, blossom: accent }
    : { kind: 'broad', bark: '#8a6a4f', leaves: [['#4f9a3c', '#a8e06a'], ['#5aa845', '#b9ea7c']], accent, blossom: accent },
  ete: (r, accent) => ({ kind: 'broad', bark: '#7d5c47', leaves: [['#2f7a35', '#7cc25a'], ['#3b8a3a', '#8fd06a'], ['#2c6e3a', '#6fb85a']], accent }),
  automne: (r, accent) => ({ kind: 'broad', bark: '#7a5644', leaves: [['#c4532a', '#f5a04a'], ['#d9822b', '#ffd06a'], ['#b8392e', '#f07a4a'], ['#c9a03a', '#ffe08a']], accent }),
  hiver: (r, accent) => ({ kind: 'pine', bark: '#7a5a46', leaves: [['#2f6b5a', '#5fa184']], accent }),
  desert: (r, accent) => ({ kind: r() < 0.6 ? 'acacia' : 'palm', bark: '#7a5a3e', leaves: [['#6f8a3a', '#b4c46a']], accent }),
};

export function buildTreeGeometry(d, key) {
  const seed = ((d.seed ?? d.ts ?? 1) ^ hashStr(key || '')) >>> 0;
  const r = rng(seed);
  const biome = d.biome || biomeAt(+d.x || 0, +d.z || 0);
  const accent = d.color || '#ffd36a';
  const st = (STYLES[biome] || STYLES.printemps)(r, accent);
  const parts = [], fruits = [];
  let height = 5;
  const up = new THREE.Vector3(0, 1, 0);

  if (st.kind === 'pine') {
    const H = lerp(5, 7.5, r()); height = H;
    parts.push(branch(new THREE.Vector3(), up, H * 0.35, 0.22, 0.14, st.bark, r).geo);
    const layers = 5;
    for (let i = 0; i < layers; i++) {
      const t = i / layers, y = H * (0.22 + t * 0.68), rad = lerp(2.0, 0.55, t), h = lerp(2.0, 1.3, t);
      const cone = new THREE.ConeGeometry(rad, h, 10, 2).translate(0, y + h / 2, 0);
      const pp = cone.attributes.position;
      for (let k = 0; k < pp.count; k++) { const n = noise2(pp.getX(k) * 2 + i, pp.getZ(k) * 2); pp.setX(k, pp.getX(k) * (1 + n * 0.12)); pp.setZ(k, pp.getZ(k) * (1 + n * 0.12)); }
      const [a, b] = st.leaves[0];
      parts.push(withAttrs(cone, (x, yy, z, c) => {
        // neige sur le dessus de chaque étage
        const top = clamp01((yy - y) / h);
        c.set(a).lerp(new THREE.Color(b), top);
        if (top > 0.42 && noise2(x * 3, z * 3) > -0.35) c.set('#f4f8ff');
      }));
      if (i % 2 === 0) for (let f = 0; f < 3; f++) { const a2 = r() * 6.28; fruits.push(fruit(new THREE.Vector3(Math.cos(a2) * rad * 0.8, y + 0.15, Math.sin(a2) * rad * 0.8), accent, 0.09)); }
    }
  } else if (st.kind === 'palm') {
    const H = lerp(4.5, 6.5, r()); height = H;
    const lean = new THREE.Vector3((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5).normalize();
    const tr = branch(new THREE.Vector3(), lean, H, 0.2, 0.13, st.bark, r);
    parts.push(tr.geo);
    const top = tr.end;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r() * 0.3;
      const leaf = new THREE.PlaneGeometry(0.7, 2.6, 1, 6);
      const lp = leaf.attributes.position;
      for (let k = 0; k < lp.count; k++) { const y = lp.getY(k) + 1.3; lp.setXYZ(k, lp.getX(k) * Math.sin(Math.PI * y / 2.6) , y, -0.35 * y * y / 2.6); }
      leaf.rotateX(-1.0); leaf.rotateY(a); leaf.translate(top.x, top.y, top.z);
      const [c0, c1] = st.leaves[0];
      parts.push(withAttrs(leaf, (x, y, z, c) => c.set(c0).lerp(new THREE.Color(c1), clamp01((y - top.y + 1) / 2))));
    }
    for (let f = 0; f < 4; f++) fruits.push(fruit(top.clone().add(new THREE.Vector3(Math.cos(f * 1.6) * 0.25, -0.2, Math.sin(f * 1.6) * 0.25)), accent, 0.12));
  } else {
    // feuillus (et acacia : couronne plate et large)
    const acacia = st.kind === 'acacia';
    const H = acacia ? lerp(3.2, 4.2, r()) : lerp(3.0, 4.4, r());
    const trunk = branch(new THREE.Vector3(), new THREE.Vector3((r() - 0.5) * 0.2, 1, (r() - 0.5) * 0.2).normalize(), H, 0.32, 0.18, st.bark, r);
    parts.push(trunk.geo);
    const tips = [];
    const nb = acacia ? 4 : 3 + Math.floor(r() * 2);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + r() * 0.6;
      const dir = new THREE.Vector3(Math.cos(a) * (acacia ? 0.9 : 0.55), acacia ? 0.6 : 0.85, Math.sin(a) * (acacia ? 0.9 : 0.55)).normalize();
      const start = trunk.curve.getPoint(lerp(0.7, 0.95, r()));
      const b = branch(start, dir, lerp(1.4, 2.2, r()), 0.15, 0.07, st.bark, r);
      parts.push(b.geo); tips.push(b.end);
      if (!acacia) { const b2 = branch(b.end, dir.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize(), lerp(0.6, 1.1, r()), 0.07, 0.035, st.bark, r); parts.push(b2.geo); tips.push(b2.end); }
    }
    tips.push(trunk.end.clone().add(new THREE.Vector3(0, 0.6, 0)));
    let maxY = 0;
    for (const t of tips) {
      const nPuff = acacia ? 2 : 3;
      const [c0, c1] = st.leaves[Math.floor(r() * st.leaves.length)];
      for (let k = 0; k < nPuff; k++) {
        const rad = acacia ? lerp(1.0, 1.4, r()) : lerp(0.9, 1.35, r());
        const c = t.clone().add(new THREE.Vector3((r() - 0.5) * 1.1, (r() - 0.2) * 0.8, (r() - 0.5) * 1.1));
        parts.push(puff(c, rad, c0, c1, r, acacia ? 0.45 : 0.9));
        maxY = Math.max(maxY, c.y + rad);
        // petites touches de couleur du joueur
        if ((st.accent || st.blossom) && r() < 0.8) {
          for (let f = 0; f < 3; f++) {
            const a = r() * Math.PI * 2, e = r() * 1.2 - 0.3;
            const p = c.clone().add(new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(rad * 0.98));
            fruits.push(fruit(p, st.blossom || st.accent, st.blossom ? 0.11 : 0.09));
          }
        }
      }
    }
    height = maxY;
  }
  const geo = mergeGeometries([...parts, ...fruits]);
  // pousse : deux feuilles et un bourgeon couleur joueur
  const sprout = mergeGeometries([
    withAttrs(new THREE.CylinderGeometry(0.02, 0.03, 0.35, 5).translate(0, 0.175, 0), (x, y, z, c) => c.set('#5d8a3a')),
    withAttrs(new THREE.SphereGeometry(0.12, 6, 4).scale(1.6, 0.35, 0.8).translate(0.14, 0.33, 0), (x, y, z, c) => c.set('#7cc25a')),
    withAttrs(new THREE.SphereGeometry(0.12, 6, 4).scale(1.6, 0.35, 0.8).translate(-0.14, 0.3, 0), (x, y, z, c) => c.set('#6fb850')),
    withAttrs(new THREE.SphereGeometry(0.05, 6, 4).translate(0, 0.38, 0), (x, y, z, c) => c.set(accent), 1),
  ]);
  return { geo, sprout, height, biome };
}

export class Trees {
  constructor(scene) {
    this.scene = scene;
    this.mat = plantMaterial({ glowAmount: 0.9, windAmp: 0.01 });
    this.nodes = new Map();
    this.pending = new Map();
    this.group = new THREE.Group(); this.group.name = 'Trees';
    scene.add(this.group);
    this.label = null; this.labelOn = null;
  }

  add(key, d, { now = false } = {}) {
    if (this.nodes.has(key) || this.pending.has(key)) return;
    if (now) this.build(key, d); else this.pending.set(key, d);
  }

  process(player, budgetMs) {
    if (!this.pending.size) return;
    const t0 = performance.now();
    const list = [...this.pending].map(([k, d]) => [k, d, ((+d.x || 0) - player.x) ** 2 + ((+d.z || 0) - player.z) ** 2]).sort((a, b) => a[2] - b[2]);
    for (const [k, d] of list) {
      this.pending.delete(k); this.build(k, d);
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  build(key, d) {
    const x = +d.x || 0, z = +d.z || 0;
    const { geo, sprout, height } = buildTreeGeometry(d, key);
    const g = new THREE.Group();
    let y = groundY(x, z);
    if (y < WATER_LEVEL) y = WATER_LEVEL + 0.05; // racines dans l'eau : on le garde au-dessus
    g.position.set(x, y - 0.05, z);
    g.rotation.y = (hashStr(key) % 628) / 100;
    const tree = new THREE.Mesh(geo, this.mat); tree.castShadow = true; tree.receiveShadow = true;
    const sp = new THREE.Mesh(sprout, this.mat); sp.castShadow = true;
    g.add(tree, sp);
    g.userData = { key, data: d, tree, sprout: sp, height, ts: typeof d.ts === 'number' ? d.ts : Date.now(), pct: -1 };
    this.group.add(g);
    this.nodes.set(key, g);
    this.grow(g, Date.now());
  }

  remove(key) {
    this.pending.delete(key);
    const g = this.nodes.get(key); if (!g) return;
    if (this.labelOn === g) this.hideLabel();
    g.userData.tree.geometry.dispose(); g.userData.sprout.geometry.dispose();
    this.group.remove(g); this.nodes.delete(key);
  }

  grow(g, now) {
    const u = g.userData;
    const t = clamp01(((now - u.ts) * (window.GROW_DEBUG_MULT || 1)) / TREE_GROW_MS);
    const SPROUT = 0.2;
    const k = smoothstep(0, 1, (t - SPROUT * 0.5) / (1 - SPROUT * 0.5));
    const s = lerp(0.12, 1, k);
    u.tree.visible = t > SPROUT * 0.5;
    u.tree.scale.setScalar(s);
    const sp = clamp01(1 - (t - SPROUT) / 0.15);
    u.sprout.visible = sp > 0.01;
    u.sprout.scale.setScalar(lerp(0.6, 1.4, clamp01(t / SPROUT)) * sp);
    u.grownH = u.tree.visible ? u.height * s : 0.5;
    u.t = t;
    return t;
  }

  showLabel(g) {
    const pct = Math.round(g.userData.t * 100);
    if (this.labelOn === g && g.userData.pct === pct) return;
    this.hideLabel();
    const d = g.userData.data;
    const txt = pct >= 100 ? `Arbre de ${d.name || 'Fée'}` : `Arbre de ${d.name || 'Fée'} — ${pct}%`;
    this.label = makeLabel(txt, d.color || '#88e5ff', { fontSize: 26, worldHeight: 0.32 });
    this.label.position.set(g.position.x, g.position.y + g.userData.grownH + 0.4, g.position.z);
    this.scene.add(this.label);
    this.labelOn = g; g.userData.pct = pct;
  }
  hideLabel() { if (this.label) disposeLabel(this.label); this.label = null; this.labelOn = null; }

  tick(player, now) {
    let best = null, bestD = 7;
    for (const g of this.nodes.values()) {
      const dx = g.position.x - player.x, dz = g.position.z - player.z, d = Math.hypot(dx, dz);
      g.visible = d < 170;
      if (g.userData.t < 1 || g.userData._lastGrow === undefined || now - g.userData._lastGrow > 5000) {
        if (now - (g.userData._lastGrow || 0) > 1000) { this.grow(g, now); g.userData._lastGrow = now; }
      }
      if (d < bestD) { bestD = d; best = g; }
    }
    if (best) this.showLabel(best); else this.hideLabel();
  }

  positions() { return [...this.nodes.values()].map(g => [g.position.x, g.position.z]); }
}
