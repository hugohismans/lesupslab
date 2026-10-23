// Décor fixe du monde enrichi : rochers, buissons, bosquets, roseaux, champignons, cactus,
// lanternes le long des chemins, pont et moulin. Tout est déterministe (même monde pour tous)
// et le décor s'efface là où des fleurs ou des arbres ont été plantés.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, lerp, clamp01, noise2, toon } from './util.js';
import { groundY, biomeWeights, pathDist, waterDist, PATHS, BRIDGE, WINDMILL, WATER_LEVEL } from './world.js';
import { buildTreeGeometry } from './trees.js';
import { plantMaterial } from './flowers.js';

function attrs(geo, colorFn, glow = 0, smooth = false) {
  if (geo.index) { geo.computeVertexNormals(); geo = geo.toNonIndexed(); }
  else if (smooth) {
    // normales « sphériques » pour un rendu rond et doux
    geo.computeBoundingSphere(); const c0 = geo.boundingSphere.center, p0 = geo.attributes.position, nn = new Float32Array(p0.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < p0.count; i++) { v.set(p0.getX(i) - c0.x, p0.getY(i) - c0.y, p0.getZ(i) - c0.z).normalize(); nn.set([v.x, v.y, v.z], i * 3); }
    geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  } else geo.computeVertexNormals();
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  const p = geo.attributes.position, n = p.count, col = new Float32Array(n * 3), gl = new Float32Array(n), c = new THREE.Color();
  const nr = geo.attributes.normal;
  for (let i = 0; i < n; i++) { colorFn(p.getX(i), p.getY(i), p.getZ(i), nr.getY(i), c); col.set([c.r, c.g, c.b], i * 3); gl[i] = glow; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
  return geo;
}

function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    v.multiplyScalar(1 + noise2(v.x * 1.7 + seed, v.z * 1.7 + v.y) * 0.25); v.y *= 0.62;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const stone = new THREE.Color('#a3a2a8'), moss = new THREE.Color('#7da55a');
  return attrs(g, (x, y, z, ny, c) => { c.copy(stone).multiplyScalar(0.85 + 0.15 * noise2(x * 4, z * 4)); if (ny > 0.55 && seed % 2 === 0) c.lerp(moss, 0.7); });
}
function bushGeo() {
  const parts = [];
  [[0, 0.45, 0, 0.6], [0.45, 0.35, 0.1, 0.45], [-0.4, 0.33, -0.1, 0.48], [0.05, 0.3, 0.45, 0.42]].forEach(([x, y, z, r], k) => {
    const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const n = noise2(p.getX(i) * 3 + k, p.getZ(i) * 3 + p.getY(i)); p.setXYZ(i, p.getX(i) * (1 + n * 0.15) + x, p.getY(i) * 0.85 * (1 + n * 0.15) + y, p.getZ(i) * (1 + n * 0.15) + z); }
    parts.push(attrs(g, (x2, y2, z2, ny, c) => c.set('#5c9a45').lerp(new THREE.Color('#b4e07a'), clamp01(ny * 0.5 + 0.5) ** 2), 0, true));
  });
  return mergeGeometries(parts);
}
function mushroomGeo() {
  const parts = [];
  [[0, 0, 0, 1], [0.18, 0, 0.1, 0.7], [-0.12, 0, 0.16, 0.55]].forEach(([x, y, z, s]) => {
    parts.push(attrs(new THREE.CylinderGeometry(0.035 * s, 0.045 * s, 0.18 * s, 6).translate(x, 0.09 * s, z), (a, b, c2, ny, c) => c.set('#f6ecd8')));
    parts.push(attrs(new THREE.SphereGeometry(0.11 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(x, 0.17 * s, z),
      (a, b, c2, ny, c) => { c.set('#e0473a'); if (noise2(a * 60, c2 * 60) > 0.45) c.set('#fff6ea'); }, 0.3));
  });
  return mergeGeometries(parts);
}
function cactusGeo() {
  const g = '#5f9a55', parts = [];
  parts.push(attrs(new THREE.CapsuleGeometry(0.22, 1.4, 4, 10).translate(0, 0.9, 0), (x, y, z, ny, c) => c.set(g).multiplyScalar(0.85 + 0.15 * Math.cos(Math.atan2(z, x) * 8))));
  parts.push(attrs(new THREE.CapsuleGeometry(0.13, 0.5, 4, 8).rotateZ(Math.PI / 2).translate(0.35, 0.9, 0), (x, y, z, ny, c) => c.set(g)));
  parts.push(attrs(new THREE.CapsuleGeometry(0.13, 0.45, 4, 8).translate(0.55, 1.15, 0), (x, y, z, ny, c) => c.set(g)));
  parts.push(attrs(new THREE.SphereGeometry(0.08, 8, 6).translate(0, 1.85, 0), (x, y, z, ny, c) => c.set('#ff7aa8'), 0.6));
  return mergeGeometries(parts);
}
function reedsGeo() {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39, r = 0.1 + (i % 3) * 0.12, h = 0.8 + (i % 4) * 0.25;
    const blade = new THREE.ConeGeometry(0.025, h, 4).translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    blade.rotateZ((Math.cos(a) * 0.15)); parts.push(attrs(blade, (x, y, z, ny, c) => c.set('#5d8a3a').lerp(new THREE.Color('#c9d36a'), clamp01(y / 1.4))));
    if (i % 3 === 0) parts.push(attrs(new THREE.CapsuleGeometry(0.035, 0.14, 3, 6).translate(Math.cos(a) * r, h + 0.02, Math.sin(a) * r), (x, y, z, ny, c) => c.set('#6b4a32')));
  }
  return mergeGeometries(parts);
}
function lanternGeo() {
  const wood = '#6b4f3a', parts = [];
  parts.push(attrs(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6).translate(0, 0.8, 0), (x, y, z, ny, c) => c.set(wood)));
  parts.push(attrs(new THREE.BoxGeometry(0.5, 0.06, 0.06).translate(0.2, 1.55, 0), (x, y, z, ny, c) => c.set(wood)));
  parts.push(attrs(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 3).translate(0.4, 1.45, 0), (x, y, z, ny, c) => c.set('#333')));
  parts.push(attrs(new THREE.SphereGeometry(0.13, 10, 8).scale(1, 1.25, 1).translate(0.4, 1.25, 0), (x, y, z, ny, c) => c.set('#ffcf7a'), 1.4));
  parts.push(attrs(new THREE.CylinderGeometry(0.06, 0.08, 0.05, 8).translate(0.4, 1.42, 0), (x, y, z, ny, c) => c.set('#3a2a22')));
  return mergeGeometries(parts);
}

// Grille de hachage pour retrouver vite les éléments proches d'un point
class Spatial {
  constructor(cell = 8) { this.cell = cell; this.map = new Map(); }
  key(x, z) { return Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell); }
  add(item) { const k = this.key(item.x, item.z); (this.map.get(k) || this.map.set(k, []).get(k)).push(item); }
  near(x, z, r) {
    const out = [], c = this.cell, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) for (const it of this.map.get(i + ',' + j) || []) if (Math.hypot(it.x - x, it.z - z) < r + it.r) out.push(it);
    return out;
  }
}

export class Decor {
  constructor(scene, preset) {
    this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'Decor';
    scene.add(this.group);
    this.mat = plantMaterial({ glowAmount: 1.2, windAmp: 0.02 });
    this.stiff = plantMaterial({ glowAmount: 1.2, windAmp: 0 });
    this.space = new Spatial(8);
    this.meshes = [];
    const types = {
      rock0: { geo: rockGeo(1), mat: this.stiff }, rock1: { geo: rockGeo(2), mat: this.stiff },
      bush: { geo: bushGeo(), mat: this.mat }, mush: { geo: mushroomGeo(), mat: this.stiff },
      cactus: { geo: cactusGeo(), mat: this.stiff }, reeds: { geo: reedsGeo(), mat: this.mat }, lantern: { geo: lanternGeo(), mat: this.stiff },
    };
    // bosquets : arbres « de décor » générés avec le même générateur que ceux des joueurs
    const forest = { ete: 4, automne: 5, hiver: 4, desert: 3, printemps: 3 };
    for (const [biome, n] of Object.entries(forest)) for (let v = 0; v < n; v++) {
      const { geo } = buildTreeGeometry({ seed: 9001 + v * 131 + biome.length * 7, biome, color: biome === 'hiver' ? '#ff6a5a' : '#ffd36a', x: 0, z: 0 }, 'decor' + biome + v);
      types[`tree_${biome}_${v}`] = { geo, mat: this.mat, shadow: true };
    }
    const inst = Object.fromEntries(Object.keys(types).map(k => [k, []]));
    const r = rng(424242);
    const density = preset.decor;
    const CELL = 5.5;
    for (let gx = -165; gx < 165; gx += CELL) for (let gz = -165; gz < 165; gz += CELL) {
      const x = gx + r() * CELL, z = gz + r() * CELL, rr = Math.hypot(x, z);
      const roll = r(), roll2 = r(), s = r();
      if (rr > 168 || r() > density) continue;
      const pd = pathDist(x, z), wd = waterDist(x, z);
      if (wd < -0.5) continue;
      if (rr < 10) continue;                                        // clairière centrale libre
      if (x > 0 && x < 21 && z > -33 && z < 38) continue;            // allée des portails
      if (Math.hypot(x + 20, z + 20) < 13) continue;                // Hall of Fame
      if (Math.hypot(x - WINDMILL.x, z - WINDMILL.z) < 7) continue; // moulin
      if (Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < 9) continue;
      const w = biomeWeights(x, z);
      const b = w.indexOf(Math.max(...w));
      const biome = ['printemps', 'ete', 'automne', 'hiver', 'desert'][b];
      const rot = r() * Math.PI * 2;
      if (wd < 2.2 && wd > -0.5 && b < 3) { if (roll < 0.55) inst.reeds.push({ x, z, s: lerp(0.8, 1.3, s), rot }); continue; }
      if (pd < 2.4) continue;
      // forêt plus dense loin du centre
      const forestChance = [0.03, 0.08, 0.2, 0.22, 0.05][b] * (0.4 + clamp01((rr - 25) / 80)) * (0.6 + 0.8 * (noise2(x * 0.03, z * 0.03) * 0.5 + 0.5));
      if (roll < forestChance) {
        const v = Math.floor(roll2 * forest[biome]);
        inst[`tree_${biome}_${v}`].push({ x, z, s: lerp(0.8, 1.3, s), rot, r: 2.5 });
      } else if (roll < forestChance + [0.05, 0.04, 0.04, 0.05, 0.05][b]) {
        inst[roll2 < 0.5 ? 'rock0' : 'rock1'].push({ x, z, s: lerp(0.4, 1.5, s * s), rot, r: 1.2, tint: b === 4 ? '#e2b98a' : b === 3 ? '#dfe8f2' : null });
      } else if (b < 3 && roll < forestChance + 0.16) {
        inst.bush.push({ x, z, s: lerp(0.6, 1.2, s), rot, r: 1, tint: b === 2 ? ['#ffb36a', '#ff8a5a', '#ffd27a'][Math.floor(roll2 * 3)] : b === 1 ? '#e8ffb0' : null });
      } else if ((b === 0 || b === 2) && roll < forestChance + 0.2) {
        inst.mush.push({ x, z, s: lerp(0.8, 1.6, s), rot, r: 0.4 });
      } else if (b === 4 && roll < forestChance + 0.12) {
        inst.cactus.push({ x, z, s: lerp(0.7, 1.4, s), rot, r: 0.8 });
      }
    }
    // lanternes le long des chemins (jusqu'à l'automne)
    for (const path of PATHS) {
      let acc = 0, side = 1;
      for (let i = 1; i < path.length; i++) {
        const [ax, az] = path[i - 1], [bx, bz] = path[i];
        const L = Math.hypot(bx - ax, bz - az); acc += L;
        if (acc < 11) continue; acc = 0; side = -side;
        const nx = -(bz - az) / L, nz = (bx - ax) / L;
        const x = bx + nx * 1.7 * side, z = bz + nz * 1.7 * side;
        if (Math.hypot(x, z) < 6 || Math.hypot(x, z) > 110 || waterDist(x, z) < 1) continue;
        inst.lantern.push({ x, z, s: 1, rot: Math.atan2(-nx * side, -nz * side) + Math.PI / 2, r: 0.5 });
      }
    }
    // création des InstancedMesh
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const [k, list] of Object.entries(inst)) {
      if (!list.length) continue;
      const T = types[k];
      const im = new THREE.InstancedMesh(T.geo, T.mat, list.length);
      im.name = k;
      im.castShadow = preset.shadows && (T.shadow || k.startsWith('rock') || k === 'bush' || k === 'lantern');
      im.receiveShadow = true;
      list.forEach((it, i) => {
        const y = Math.max(groundY(it.x, it.z), k === 'reeds' ? WATER_LEVEL - 0.3 : -99) - (k.startsWith('rock') ? 0.15 * it.s : 0.03);
        q.setFromAxisAngle(up, it.rot);
        m4.compose(new THREE.Vector3(it.x, y, it.z), q, new THREE.Vector3(it.s, it.s, it.s));
        im.setMatrixAt(i, m4);
        if (it.tint) im.setColorAt(i, new THREE.Color(it.tint)); else if (im.instanceColor || list.some(o => o.tint)) im.setColorAt(i, new THREE.Color(1, 1, 1));
        Object.assign(it, { mesh: im, i, y, r: it.r || 0.6 });
        this.space.add(it);
      });
      im.computeBoundingSphere();
      this.group.add(im); this.meshes.push(im);
    }
    this.buildBridge();
    this.buildWindmill();
  }

  // Le décor s'efface autour d'une plante (fleur ou arbre)
  clearAround(x, z, radius) {
    const m4 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const it of this.space.near(x, z, radius)) {
      if (it.hidden) continue; it.hidden = true;
      it.mesh.setMatrixAt(it.i, m4); it.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  buildBridge() {
    const wood = '#8a6448', dark = '#5e4433', parts = [];
    const L = 15, W = 2.4, arch = 1.2;
    const by = Math.max(groundY(BRIDGE.x - L / 2, BRIDGE.z), groundY(BRIDGE.x + L / 2, BRIDGE.z));
    for (let i = 0; i < 22; i++) {
      const t = i / 21, x = (t - 0.5) * L, y = Math.sin(t * Math.PI) * arch;
      parts.push(attrs(new THREE.BoxGeometry(L / 22 * 0.92, 0.12, W).translate(x, y, 0), (a, b, c2, ny, c) => c.set(i % 2 ? wood : '#957055')));
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 6; i++) {
        const t = i / 6, x = (t - 0.5) * L, y = Math.sin(t * Math.PI) * arch;
        parts.push(attrs(new THREE.CylinderGeometry(0.07, 0.08, 1.0, 6).translate(x, y + 0.45, side * W / 2), (a, b, c2, ny, c) => c.set(dark)));
      }
      const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3((t - 0.5) * L, Math.sin(t * Math.PI) * arch + 0.95, side * W / 2)); }
      parts.push(attrs(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.05, 5), (a, b, c2, ny, c) => c.set(wood)));
    }
    const g = new THREE.Mesh(mergeGeometries(parts), this.stiff);
    g.position.set(BRIDGE.x, by - 0.05, BRIDGE.z); g.castShadow = g.receiveShadow = true;
    this.group.add(g);
    this.bridge = { x: BRIDGE.x, z: BRIDGE.z, L, W, arch, y: by - 0.05 };
  }

  // Hauteur du tablier du pont (pour que les personnages marchent dessus)
  bridgeY(x, z) {
    const b = this.bridge; if (!b) return null;
    const lx = x - b.x, lz = z - b.z;
    if (Math.abs(lx) > b.L / 2 || Math.abs(lz) > b.W / 2) return null;
    return b.y + Math.sin((lx / b.L + 0.5) * Math.PI) * b.arch + 0.06;
  }

  buildWindmill() {
    const x = WINDMILL.x, z = WINDMILL.z, y = groundY(x, z);
    const parts = [];
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(lerp(2.0, 1.3, t), t * 6)); }
    parts.push(attrs(new THREE.LatheGeometry(pts, 16), (a, b, c2, ny, c) => c.set('#f3ead8').multiplyScalar(0.92 + 0.08 * noise2(a * 3, b * 3))));
    parts.push(attrs(new THREE.ConeGeometry(1.75, 2.2, 16).translate(0, 7.1, 0), (a, b, c2, ny, c) => c.set('#c8553d')));
    parts.push(attrs(new THREE.BoxGeometry(0.9, 1.5, 0.1).translate(0, 0.75, 1.98), (a, b, c2, ny, c) => c.set('#6b4a35')));
    parts.push(attrs(new THREE.BoxGeometry(0.6, 0.6, 0.1).translate(0, 3.6, 1.66), (a, b, c2, ny, c) => c.set('#ffd98a'), 1.2));
    const tower = new THREE.Mesh(mergeGeometries(parts), this.stiff);
    tower.position.set(x, y - 0.1, z); tower.castShadow = tower.receiveShadow = true;
    tower.rotation.y = Math.atan2(-x, -z);
    const blades = new THREE.Group();
    const bp = [];
    for (let i = 0; i < 4; i++) {
      const g = mergeGeometries([
        attrs(new THREE.BoxGeometry(0.14, 4.2, 0.1).translate(0, 2.2, 0), (a, b, c2, ny, c) => c.set('#6b4a35')),
        attrs(new THREE.BoxGeometry(0.9, 3.2, 0.04).translate(0.5, 2.6, 0), (a, b, c2, ny, c) => c.set('#fbf3e2')),
      ]);
      g.rotateZ(i * Math.PI / 2); bp.push(g);
    }
    const bm = new THREE.Mesh(mergeGeometries(bp), this.stiff); bm.castShadow = true;
    blades.add(bm); blades.position.set(0, 6.0, 2.0);
    tower.add(blades);
    this.group.add(tower);
    this.windmill = blades;
  }

  tick(dt) { if (this.windmill) this.windmill.rotation.z -= dt * 0.6; }
}
