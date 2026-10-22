// Les 4 personnages jouables, construits en volumes simples « jouet peint », teintés de la couleur du joueur.
// Tous regardent vers +Z ; animate() reçoit la vitesse (0..1) pour la marche.
import * as THREE from 'three';
import { toon } from './util.js';

export const CHARACTERS = [
  { id: 'fee', label: 'Petite fée', emoji: '🧚' },
  { id: 'esprit', label: 'Esprit de la forêt', emoji: '👻' },
  { id: 'renard', label: 'Renard', emoji: '🦊' },
  { id: 'champi', label: 'Champignon', emoji: '🍄' },
];
export const DEFAULT_CHARACTER = 'fee';
export const isCharacter = (id) => CHARACTERS.some(c => c.id === id);

const SKIN = '#ffe0cc', INK = '#2a2233';

function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; }
function shades(hex) {
  const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);
  return {
    main: new THREE.Color().setHSL(hsl.h, Math.max(0.45, hsl.s), Math.min(0.62, Math.max(0.45, hsl.l))),
    dark: new THREE.Color().setHSL(hsl.h, Math.max(0.4, hsl.s), 0.3),
    light: new THREE.Color().setHSL(hsl.h, Math.max(0.3, hsl.s * 0.8), 0.82),
  };
}
function eyes(group, y, z, spread, size = 0.03) {
  const m = toon(INK);
  const l = mesh(new THREE.SphereGeometry(size, 10, 8), m, -spread, y, z), r = mesh(new THREE.SphereGeometry(size, 10, 8), m, spread, y, z);
  l.scale.set(1, 1.3, 0.6); r.scale.set(1, 1.3, 0.6);
  const hi = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const hl = mesh(new THREE.SphereGeometry(size * 0.35, 6, 5), hi, -spread + size * 0.3, y + size * 0.45, z + size * 0.5);
  const hr = mesh(new THREE.SphereGeometry(size * 0.35, 6, 5), hi, spread + size * 0.3, y + size * 0.45, z + size * 0.5);
  group.add(l, r, hl, hr);
  return [l, r];
}
function blush(group, y, z, spread) {
  const m = new THREE.MeshBasicMaterial({ color: 0xff9aa8, transparent: true, opacity: 0.55 });
  [-spread, spread].forEach(x => { const b = mesh(new THREE.CircleGeometry(0.03, 12), m, x, y, z); b.castShadow = false; group.add(b); });
}

// --- Petite fée ---
function makeFee(color) {
  const s = shades(color), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const dressPts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; dressPts.push(new THREE.Vector2(0.06 + Math.pow(1 - t, 1.6) * 0.26, t * 0.48)); }
  const dress = mesh(new THREE.LatheGeometry(dressPts, 18), toon(s.main), 0, 0.2, 0);
  const hem = mesh(new THREE.TorusGeometry(0.31, 0.03, 6, 22), toon(s.light), 0, 0.21, 0); hem.rotation.x = Math.PI / 2;
  const head = new THREE.Group(); head.position.y = 0.86;
  head.add(mesh(new THREE.SphereGeometry(0.19, 20, 16), toon(SKIN)));
  const hair = mesh(new THREE.SphereGeometry(0.205, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), toon(s.dark), 0, 0.02, -0.01);
  hair.rotation.x = -0.35;
  const bun = mesh(new THREE.SphereGeometry(0.09, 12, 10), toon(s.dark), 0, 0.2, -0.08);
  head.add(hair, bun);
  eyes(head, 0.0, 0.165, 0.065, 0.028); blush(head, -0.05, 0.178, 0.1);
  const armM = toon(SKIN);
  const armL = mesh(new THREE.CapsuleGeometry(0.03, 0.18, 4, 8), armM, -0.12, 0.58, 0), armR = mesh(new THREE.CapsuleGeometry(0.03, 0.18, 4, 8), armM, 0.12, 0.58, 0);
  armL.rotation.z = 0.5; armR.rotation.z = -0.5;
  const legM = toon(s.dark);
  const legL = mesh(new THREE.CapsuleGeometry(0.03, 0.14, 4, 8), legM, -0.06, 0.12, 0), legR = mesh(new THREE.CapsuleGeometry(0.03, 0.14, 4, 8), legM, 0.06, 0.12, 0);
  // ailes translucides irisées
  const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.15, 0.25, 0.42, 0.32, 0.4, 0.12); wingShape.bezierCurveTo(0.38, 0.0, 0.15, -0.02, 0, 0);
  const lowShape = new THREE.Shape(); lowShape.moveTo(0, 0); lowShape.bezierCurveTo(0.12, -0.05, 0.3, -0.18, 0.24, -0.25); lowShape.bezierCurveTo(0.12, -0.28, 0.04, -0.12, 0, 0);
  const wm = new THREE.MeshBasicMaterial({ color: s.light, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const wings = [];
  for (const side of [-1, 1]) for (const shp of [wingShape, lowShape]) {
    const pivot = new THREE.Group(); pivot.position.set(0, 0.66, -0.08);
    const w = new THREE.Mesh(new THREE.ShapeGeometry(shp, 10), wm); w.scale.x = side; pivot.add(w);
    pivot.userData.side = side; wings.push(pivot); body.add(pivot);
  }
  body.add(dress, hem, head, armL, armR, legL, legR);
  return {
    root, height: 1.25, hover: 0.25, sparkle: true,
    animate(t, speed) {
      body.position.y = 0.25 + Math.sin(t * 3) * 0.06;
      body.rotation.x = speed * 0.25;
      const f = Math.sin(t * (18 + speed * 10));
      for (const w of wings) w.rotation.y = w.userData.side * (0.35 + f * 0.55);
      armL.rotation.z = 0.5 + Math.sin(t * 3) * 0.1; armR.rotation.z = -0.5 - Math.sin(t * 3) * 0.1;
      legL.rotation.x = Math.sin(t * 3) * 0.2 + speed * 0.4; legR.rotation.x = -Math.sin(t * 3) * 0.2 + speed * 0.4;
      head.rotation.z = Math.sin(t * 1.3) * 0.06;
    },
  };
}

// --- Esprit de la forêt ---
function makeEsprit(color) {
  const s = shades(color), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const white = toon(new THREE.Color('#f4f1e8').lerp(s.light, 0.12));
  const torso = mesh(new THREE.CapsuleGeometry(0.17, 0.3, 6, 14), white, 0, 0.35, 0);
  const head = new THREE.Group(); head.position.y = 0.88;
  const skull = mesh(new THREE.SphereGeometry(0.33, 24, 18), white); skull.scale.set(1.05, 0.88, 0.95);
  head.add(skull);
  const hole = toon('#1b1622');
  const eL = mesh(new THREE.SphereGeometry(0.055, 12, 10), hole, -0.11, 0.04, 0.29), eR = mesh(new THREE.SphereGeometry(0.05, 12, 10), hole, 0.12, 0.06, 0.29);
  const mouth = mesh(new THREE.SphereGeometry(0.04, 12, 10), hole, 0.02, -0.12, 0.29);
  [eL, eR, mouth].forEach(m => m.scale.set(1, 1.2, 0.4));
  head.add(eL, eR, mouth);
  // petite feuille couleur joueur sur la tête
  const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.12, 0.1, 0, 0.28); leafShape.quadraticCurveTo(-0.12, 0.1, 0, 0);
  const leaf = new THREE.Mesh(new THREE.ShapeGeometry(leafShape, 8), toon(s.main, { side: THREE.DoubleSide }));
  leaf.position.set(0.05, 0.27, 0); leaf.rotation.z = -0.4; leaf.castShadow = true;
  const stalk = mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.08, 5), toon('#5d8a3a'), 0.02, 0.29, 0);
  head.add(leaf, stalk);
  const armL = mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 8), white, -0.2, 0.42, 0), armR = mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 8), white, 0.2, 0.42, 0);
  armL.rotation.z = 0.35; armR.rotation.z = -0.35;
  const legL = mesh(new THREE.CapsuleGeometry(0.05, 0.1, 4, 8), white, -0.08, 0.08, 0), legR = mesh(new THREE.CapsuleGeometry(0.05, 0.1, 4, 8), white, 0.08, 0.08, 0);
  body.add(torso, head, armL, armR, legL, legR);
  return {
    root, height: 1.3, hover: 0,
    animate(t, speed) {
      const w = t * 9;
      body.position.y = Math.abs(Math.sin(w)) * 0.05 * speed;
      legL.position.z = Math.sin(w) * 0.08 * speed; legR.position.z = -Math.sin(w) * 0.08 * speed;
      armL.rotation.x = Math.sin(w) * 0.6 * speed; armR.rotation.x = -Math.sin(w) * 0.6 * speed;
      // la tête cliquette (comme les kodamas)
      head.rotation.z = Math.sin(t * (speed > 0.1 ? 22 : 1.2)) * (speed > 0.1 ? 0.12 : 0.05) + Math.sin(t * 0.5) * 0.04;
      head.rotation.y = Math.sin(t * 0.7) * 0.15;
    },
  };
}

// --- Renard ---
function makeRenard(color) {
  const s = shades(color), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const fur = toon(s.main), cream = toon('#fff4e6'), dark = toon(INK);
  const torso = mesh(new THREE.SphereGeometry(0.3, 18, 14), fur, 0, 0.42, 0); torso.scale.set(0.85, 0.8, 1.25);
  const belly = mesh(new THREE.SphereGeometry(0.22, 14, 10), cream, 0, 0.36, 0.08); belly.scale.set(0.8, 0.8, 1.2);
  const head = new THREE.Group(); head.position.set(0, 0.72, 0.3);
  head.add(mesh(new THREE.SphereGeometry(0.2, 18, 14), fur));
  const cheek = mesh(new THREE.SphereGeometry(0.15, 14, 10), cream, 0, -0.06, 0.07); cheek.scale.set(1.2, 0.7, 1);
  const snout = mesh(new THREE.ConeGeometry(0.08, 0.2, 12), cream, 0, -0.05, 0.22); snout.rotation.x = Math.PI / 2;
  const nose = mesh(new THREE.SphereGeometry(0.03, 8, 6), dark, 0, -0.04, 0.32);
  head.add(cheek, snout, nose);
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.075, 0.2, 10), fur, side * 0.11, 0.2, -0.02); ear.rotation.z = -side * 0.25;
    const tip = mesh(new THREE.ConeGeometry(0.035, 0.07, 8), dark, side * 0.135, 0.29, -0.02); tip.rotation.z = -side * 0.25;
    head.add(ear, tip);
  }
  eyes(head, 0.04, 0.17, 0.08, 0.026);
  const legs = [];
  for (const [x, z] of [[-0.13, 0.22], [0.13, 0.22], [-0.13, -0.2], [0.13, -0.2]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.3, z);
    pivot.add(mesh(new THREE.CapsuleGeometry(0.05, 0.16, 4, 8), fur, 0, -0.14, 0));
    pivot.add(mesh(new THREE.SphereGeometry(0.055, 8, 6), dark, 0, -0.27, 0.01));
    legs.push(pivot); body.add(pivot);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.5, -0.35);
  const tailParts = [];
  for (let i = 0; i < 5; i++) {
    const r = 0.1 + Math.sin((i / 4) * Math.PI) * 0.07;
    const m = mesh(new THREE.SphereGeometry(r, 12, 10), i === 4 ? cream : fur, 0, i * 0.07, -i * 0.09);
    tailParts.push(m); tail.add(m);
  }
  body.add(torso, belly, head, tail);
  return {
    root, height: 1.05, hover: 0,
    animate(t, speed) {
      const w = t * 12;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(w + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 * speed; });
      body.position.y = Math.abs(Math.sin(w)) * 0.04 * speed;
      tail.rotation.y = Math.sin(t * (3 + speed * 6)) * 0.35;
      tail.rotation.x = -0.3 + speed * 0.4;
      head.rotation.x = Math.sin(w * 0.5) * 0.05 * speed;
      head.rotation.z = Math.sin(t * 0.8) * 0.06 * (1 - speed);
    },
  };
}

// --- Champignon ---
function makeChampi(color) {
  const s = shades(color), root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const stemM = toon('#f6ead2');
  const stem = mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.5, 18), stemM, 0, 0.32, 0);
  const cap = mesh(new THREE.SphereGeometry(0.42, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), toon(s.main), 0, 0.55, 0);
  cap.scale.y = 0.75;
  const under = mesh(new THREE.CircleGeometry(0.42, 26), toon('#e8d6b4', { side: THREE.DoubleSide }), 0, 0.55, 0); under.rotation.x = Math.PI / 2;
  const spotM = toon('#fffaf0');
  const spots = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, e = 0.35 + (i % 3) * 0.3;
    const p = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e) * 0.75, Math.sin(a) * Math.cos(e)).multiplyScalar(0.41);
    const sp = mesh(new THREE.SphereGeometry(0.06 + (i % 2) * 0.02, 10, 6), spotM, p.x, 0.55 + p.y, p.z); sp.scale.y = 0.4;
    sp.lookAt(0, 0.55, 0); spots.add(sp);
  }
  const face = new THREE.Group(); face.position.set(0, 0.36, 0.17);
  eyes(face, 0.03, 0.02, 0.06, 0.03); blush(face, -0.03, 0.03, 0.1);
  const feet = [-1, 1].map(side => mesh(new THREE.SphereGeometry(0.08, 10, 8), toon(s.dark), side * 0.1, 0.05, 0.04));
  feet.forEach(f => f.scale.set(1, 0.6, 1.3));
  const top = new THREE.Group(); top.add(stem, cap, under, spots, face);
  body.add(top, ...feet);
  return {
    root, height: 1.0, hover: 0,
    animate(t, speed) {
      const w = t * 8;
      const hop = Math.abs(Math.sin(w)) * speed;
      top.position.y = hop * 0.16;
      const squash = 1 - (1 - Math.abs(Math.sin(w))) * 0.08 * speed;
      top.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      feet[0].position.z = 0.04 + Math.sin(w) * 0.06 * speed; feet[1].position.z = 0.04 - Math.sin(w) * 0.06 * speed;
      cap.rotation.z = Math.sin(t * 1.1) * 0.05; spots.rotation.z = cap.rotation.z;
    },
  };
}

const FACTORIES = { fee: makeFee, esprit: makeEsprit, renard: makeRenard, champi: makeChampi };
export function makeCharacter(id, color) {
  const f = FACTORIES[id] || FACTORIES[DEFAULT_CHARACTER];
  const c = f(color || '#ff66ff');
  c.id = FACTORIES[id] ? id : DEFAULT_CHARACTER;
  c.dispose = () => c.root.traverse(o => { o.geometry?.dispose(); if (o.material && !o.material._shared) o.material.dispose?.(); });
  return c;
}
