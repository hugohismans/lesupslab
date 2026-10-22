// État partagé entre modules : uniforms globaux (temps, nuit, vent) et réglages de qualité
import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uNight: { value: 0 },                       // 0 = plein jour, 1 = nuit
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uPlayer: { value: new THREE.Vector3() },    // position du joueur (l'herbe s'écarte)
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  uAmbSky: { value: new THREE.Color(0.7, 0.8, 1) },
  uAmbGround: { value: new THREE.Color(0.4, 0.5, 0.3) },
};

const IS_MOBILE = matchMedia('(hover:none) and (pointer:coarse)').matches;
export { IS_MOBILE };

const PRESETS = {
  high: { name: 'high', pixelRatio: Math.min(devicePixelRatio || 1, 2), shadows: true, shadowMap: 2048, post: true, grass: 110000, grassRadius: 46, particles: 1.0, decor: 1.0 },
  low:  { name: 'low',  pixelRatio: Math.min(devicePixelRatio || 1, 1.25), shadows: false, shadowMap: 1024, post: false, grass: 26000, grassRadius: 26, particles: 0.45, decor: 0.6 },
};

// Choix auto : mobile / petit GPU → basse qualité ; sinon haute (et on redescend si ça rame)
function guessTier() {
  if (IS_MOBILE) return 'low';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
    if (/swiftshader|llvmpipe|software|mali-4|adreno \(tm\) 3/i.test(name)) return 'low';
    if ((navigator.hardwareConcurrency || 8) <= 2) return 'low';
  } catch { /* ignore */ }
  return 'high';
}

let pref = 'auto';
try { pref = localStorage.getItem('jf2_quality') || 'auto'; } catch { /* stockage indisponible */ }
const q = new URLSearchParams(location.search).get('quality');
if (q === 'high' || q === 'low') pref = q;

export const QUALITY = {
  pref,                                     // 'auto' | 'high' | 'low'
  tier: pref === 'auto' ? guessTier() : pref,
  get preset() { return PRESETS[this.tier]; },
};
export function setQualityPref(p) {
  try { localStorage.setItem('jf2_quality', p); } catch { /* ignore */ }
}
