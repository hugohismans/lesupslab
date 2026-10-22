// Utilitaires partagés : hasard déterministe, bruit, couleurs, étiquettes
import * as THREE from 'three';

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// Générateur pseudo-aléatoire (mulberry32) : même graine → même résultat sur toutes les machines
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// --- Bruit de valeur 2D lissé + fbm ---
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1; // -1..1
}
export function fbm(x, z, oct = 4) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * noise2(x * f, z * f); norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}

// Distance d'un point à une polyligne [[x,z],...]. Au-delà de `cap` mètres le résultat
// n'est qu'une borne inférieure (les segments lointains sont ignorés : beaucoup plus rapide).
export function distToPolyline(x, z, pts, cap = Infinity) {
  let best = cap;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    if (Math.min(ax, bx) - x > best || x - Math.max(ax, bx) > best || Math.min(az, bz) - z > best || z - Math.max(az, bz) > best) continue;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

// Lissage d'une polyligne (Catmull-Rom) pour des courbes naturelles
export function smoothPolyline(pts, steps = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function toHexColor(input, fallback = '#88e5ff') {
  try { return '#' + new THREE.Color(input || fallback).getHexString(); } catch { return fallback; }
}
export function sanitizeName(s) { return (s || '').toString().trim().slice(0, 16) || 'Fée'; }

// Rampe de lumière douce façon « peint » pour MeshToonMaterial
let _ramp = null;
export function softRamp() {
  if (_ramp) return _ramp;
  const data = new Uint8Array([70, 110, 160, 205, 235, 255]);
  _ramp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  _ramp.minFilter = _ramp.magFilter = THREE.LinearFilter;
  _ramp.needsUpdate = true;
  return _ramp;
}
export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: softRamp(), ...extra });
}

// Peint une couleur sur tous les sommets d'une géométrie (pour fusion multi-couleurs)
export function paint(geo, color, shadeTop = 0) {
  const c = new THREE.Color(color);
  const pos = geo.attributes.position, n = pos.count;
  const cols = new Float32Array(n * 3);
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox; const h = Math.max(1e-4, max.y - min.y);
  for (let i = 0; i < n; i++) {
    const k = shadeTop ? 1 + shadeTop * ((pos.getY(i) - min.y) / h - 0.5) : 1;
    cols[i * 3] = c.r * k; cols[i * 3 + 1] = c.g * k; cols[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

// --- Étiquettes (sprites texte) ---
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/), lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
export function makeLabel(text, color = '#ffffff', { fontSize = 30, maxWidth = 420, worldHeight = 0.32, bubble = false } = {}) {
  const pad = 14, dpr = 2;
  const cvs = document.createElement('canvas'); const ctx = cvs.getContext('2d');
  const font = `600 ${fontSize}px "Nunito", system-ui, sans-serif`;
  ctx.font = font;
  const lines = wrapLines(ctx, text, maxWidth);
  const w = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width))) + pad * 2 + (bubble ? 0 : 18);
  const lh = fontSize * 1.25, h = lines.length * lh + pad * 1.4 + (bubble ? 14 : 0);
  cvs.width = Math.ceil(w * dpr); cvs.height = Math.ceil(h * dpr);
  ctx.scale(dpr, dpr); ctx.font = font;
  const bh = h - (bubble ? 14 : 0);
  ctx.fillStyle = bubble ? 'rgba(255,252,240,0.94)' : 'rgba(28,24,40,0.62)';
  roundRect(ctx, 1, 1, w - 2, bh - 2, 16); ctx.fill();
  if (bubble) { ctx.beginPath(); ctx.moveTo(w / 2 - 10, bh - 2); ctx.lineTo(w / 2, h - 1); ctx.lineTo(w / 2 + 10, bh - 2); ctx.fill(); }
  else {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(pad + 5, bh / 2, 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = bubble ? '#3a3046' : '#fffaf0'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, pad + (bubble ? 0 : 18), pad * 0.7 + lh * (i + 0.5)));
  const tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(worldHeight * (w / h), worldHeight, 1);
  spr.center.set(0.5, 0);
  spr.renderOrder = 10;
  return spr;
}
export function disposeLabel(spr) { if (!spr) return; spr.material.map?.dispose(); spr.material.dispose(); spr.parent?.remove(spr); }

export function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}
