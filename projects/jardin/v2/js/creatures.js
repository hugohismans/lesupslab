// Créatures partagées (/creatures) : papillons et esprits lumineux qui vont de fleur en fleur.
// Même trajet déterministe que la V1 : tout le monde les voit au même endroit.
import * as THREE from 'three';
import { groundY } from './world.js';

const CYCLE_MS = 8000;
function pickFlowerKey(keys, creatureId, seed, step) {
  if (!keys.length) return null;
  let s = (seed ^ (step * 2654435761) ^ (creatureId.length * 97531)) >>> 0;
  s = (s * 1664525 + 1013904223) >>> 0;
  return keys[Math.floor((s / 4294967296) * keys.length)];
}

function butterfly(color) {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  const wm = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.bezierCurveTo(0.08, 0.16, 0.24, 0.16, 0.2, 0.0); shape.bezierCurveTo(0.24, -0.12, 0.08, -0.14, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 8); geo.rotateX(-Math.PI / 2);
  const wL = new THREE.Mesh(geo, wm), wR = new THREE.Mesh(geo, wm); wR.scale.x = -1;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.12, 3, 6), new THREE.MeshBasicMaterial({ color: 0x2a2233 })); body.rotation.x = Math.PI / 2;
  g.add(wL, wR, body); g.userData = { wL, wR };
  return g;
}
function spirit(color) {
  const g = new THREE.Group(), c = new THREE.Color(color);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.6) })));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(halo); return g;
}

export class Creatures {
  constructor(scene, flowers, fx) { this.scene = scene; this.flowers = flowers; this.fx = fx; this.items = new Map(); }
  add(id, d) {
    if (this.items.has(id)) return;
    const mesh = d.type === 'butterfly' ? butterfly(d.color || '#88e5ff') : spirit(d.color || '#88e5ff');
    mesh.position.set(d.x0 || 0, d.y0 || 1.2, d.z0 || 0);
    this.scene.add(mesh);
    this.items.set(id, { mesh, type: d.type || 'spirit', seed: d.seed || 1, ts: d.ts || Date.now(), color: d.color || '#88e5ff', x0: d.x0 || 0, z0: d.z0 || 0 });
  }
  update(dt) {
    const data = this.flowers.data, keys = [...data.keys()], now = Date.now();
    const pos = (k) => { const d = k && data.get(k); return d ? { x: +d.x || 0, z: +d.z || 0 } : null; };
    for (const [id, c] of this.items) {
      const step = Math.floor((now - c.ts) / CYCLE_MS), t01 = ((now - c.ts) % CYCLE_MS) / CYCLE_MS;
      const fa = pos(pickFlowerKey(keys, id, c.seed, Math.max(0, step - 1)));
      const fb = pos(pickFlowerKey(keys, id, c.seed, step));
      const ax = fa ? fa.x : c.x0, az = fa ? fa.z : c.z0;
      const bx = fb ? fb.x : ax, bz = fb ? fb.z : az;
      const tt = t01 * t01 * (3 - 2 * t01);
      const x = ax + (bx - ax) * tt, z = az + (bz - az) * tt;
      const y = groundY(x, z) + 1.0 + Math.sin((t01 + id.length) * Math.PI * 2) * 0.12 + Math.sin(tt * Math.PI) * 1.2;
      const m = c.mesh;
      m.lookAt(x, y, z); m.position.set(x, y, z);
      if (c.type === 'butterfly') { const f = Math.sin(now / 70) * 0.9; m.userData.wL.rotation.z = f; m.userData.wR.rotation.z = -f; }
      else if (Math.random() < dt * 20) this.fx.emit(x, y, z, (Math.random() - 0.5) * 0.2, -0.1, (Math.random() - 0.5) * 0.2, c.color, 0.8, 0.1);
    }
  }
}
