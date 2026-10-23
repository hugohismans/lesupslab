// Jardin Féerique V2 — assemblage : rendu, joueur, caméra 3e personne, réseau, interface
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { U, QUALITY, IS_MOBILE, setQualityPref } from './shared.js';
import { toHexColor, sanitizeName, makeLabel, disposeLabel, hashStr, lerp, clamp01 } from './util.js';
import { buildField, fieldTexture, buildTerrain, buildWater, groundY, biomeAt, biomeWeights, BIOME_LABEL, PLAY_RADIUS, WATER_LEVEL } from './world.js';
import { Sky } from './sky.js';
import { Grass } from './grass.js';
import { BiomeParticles } from './particles.js';
import { Flowers } from './flowers.js';
import { Trees } from './trees.js';
import { Decor } from './decor.js';
import { CHARACTERS, DEFAULT_CHARACTER, isCharacter, makeCharacter } from './characters.js';
import { FX } from './fx.js';
import { Creatures } from './creatures.js';
import { Portals, HallOfFame } from './landmarks.js';
import { Ambience } from './audio.js';
import { Games } from './games.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const LS = {
  get(k, d = null) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// ---------- Rendu ----------
let preset = QUALITY.preset;
const renderer = new THREE.WebGLRenderer({ antialias: !preset.post, powerPreference: 'high-performance' });
renderer.setPixelRatio(preset.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = preset.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);

buildField();
const fieldTex = fieldTexture();
const terrain = buildTerrain(preset); scene.add(terrain);
const water = buildWater(fieldTex); scene.add(water);
const sky = new Sky(scene, preset);
const grass = new Grass(scene, fieldTex, preset);
const particles = new BiomeParticles(scene, fieldTex, preset);
const decor = new Decor(scene, preset);
const flowers = new Flowers(scene);
const trees = new Trees(scene);
const fx = new FX(scene);
const creatures = new Creatures(scene, flowers, fx);
const portals = new Portals(scene);
const hof = new HallOfFame(scene);
const audio = new Ambience();
portals.load(); hof.load();

// Post-traitement « peint » : halo doux + légère retouche couleur + vignette
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uNight: U.uNight },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uNight; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.12);
      c.rgb += vec3(0.014,0.006,0.024) * (1.0 - clamp(l,0.0,1.0));
      float v = smoothstep(1.2, 0.3, length((vUv-0.5)*vec2(1.25,1.0))*1.5);
      c.rgb *= mix(0.8, 1.0, v);
      gl_FragColor = c;
    }`,
};
let composer = null, bloom = null;
function setupComposer() {
  if (!preset.post) { composer = null; return; }
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(GradeShader));
  composer.addPass(new OutputPass());
}
setupComposer();

// ---------- Joueur ----------
const self = {
  name: sanitizeName(LS.get('jf_name', '')),
  color: toHexColor(LS.get('jf_color', '#ff7aa8')),
  avatar: isCharacter(LS.get('jf2_avatar')) ? LS.get('jf2_avatar') : DEFAULT_CHARACTER,
  entered: false,
};
if (!LS.get('jf_name')) self.name = '';
const player = { x: 0, z: 4, y: 0, ry: Math.PI, vx: 0, vz: 0, speed: 0 };
try { const p = JSON.parse(LS.get('jf2_pos', 'null')); if (p && Number.isFinite(p.x) && Math.hypot(p.x, p.z) < PLAY_RADIUS) { player.x = p.x; player.z = p.z; } } catch { /* ignore */ }
let myChar = null;
function setMyCharacter() {
  if (myChar) { scene.remove(myChar.root); myChar.dispose(); }
  myChar = makeCharacter(self.avatar, self.color);
  scene.add(myChar.root);
}
setMyCharacter();

const cam = { yaw: 0.6, pitch: 0.32, dist: 7.5, tx: 0, ty: 0, tz: 0 };
const others = new Map();           // autres joueurs : uid → personnage
let myBubble = null, myBubbleT = 0; // bulle de chat au-dessus de soi

// ---------- Réseau ----------
const { Net } = DEMO ? await import('./demo.js') : await import('./net.js');
const net = new Net();
const netReady = net.init().catch(e => { console.error('[firebase]', e); toast('Connexion au jardin impossible'); });
const games = new Games({ scene, fx, audio, toast, net, flowers, player, self });
games.bindUI();

// ---------- Interface d'entrée ----------
const SWATCHES = ['#ff7aa8', '#ffb36b', '#ffd35a', '#9be15d', '#5ed6c0', '#6cb8ff', '#a98bff', '#ff6b6b', '#ffffff'];
function buildIntro() {
  $('pseudo').value = self.name;
  const sw = $('swatches'); sw.innerHTML = '';
  for (const c of SWATCHES) {
    const b = document.createElement('button'); b.className = 'swatch'; b.style.background = c; b.dataset.c = c; b.type = 'button';
    b.onclick = () => pickColor(c); sw.appendChild(b);
  }
  const custom = document.createElement('label'); custom.className = 'swatch custom'; custom.title = 'Autre couleur';
  const inp = document.createElement('input'); inp.type = 'color'; inp.value = self.color; inp.oninput = () => pickColor(inp.value);
  custom.appendChild(inp); sw.appendChild(custom);
  const ch = $('chars'); ch.innerHTML = '';
  for (const c of CHARACTERS) {
    const b = document.createElement('button'); b.className = 'char'; b.type = 'button'; b.dataset.id = c.id;
    b.innerHTML = `<span>${c.emoji}</span>${c.label}`;
    b.onclick = () => { self.avatar = c.id; refreshIntro(); setMyCharacter(); };
    ch.appendChild(b);
  }
  refreshIntro();
}
function pickColor(c) { self.color = toHexColor(c); refreshIntro(); setMyCharacter(); }
function refreshIntro() {
  document.querySelectorAll('.swatch[data-c]').forEach(b => b.classList.toggle('sel', b.dataset.c.toLowerCase() === self.color.toLowerCase()));
  document.querySelectorAll('.char').forEach(b => b.classList.toggle('sel', b.dataset.id === self.avatar));
}
async function enter() {
  self.name = sanitizeName($('pseudo').value);
  LS.set('jf_name', self.name); LS.set('jf_color', self.color); LS.set('jf2_avatar', self.avatar);
  $('overlay').classList.add('hidden'); $('hud').classList.remove('hidden');
  const first = !self.entered;
  self.entered = true;
  if (first) {
    await netReady;
    await net.enter({ name: self.name, color: self.color, avatar: self.avatar }).catch(e => console.warn(e));
    if (!net.extraOk) console.info('[V2] Les règles Firebase refusent avatar/ry : les autres verront un personnage par défaut.');
  } else net.profile({ name: self.name, color: self.color, avatar: self.avatar });
}
$('startBtn').onclick = enter;
$('pseudo').addEventListener('keydown', e => { if (e.key === 'Enter') enter(); });
$('changeChar').onclick = () => { $('menu').classList.add('hidden'); $('overlay').classList.remove('hidden'); $('hud').classList.add('hidden'); buildIntro(); };
buildIntro();

// ---------- HUD ----------
function toast(text) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; $('toasts').appendChild(t); setTimeout(() => t.remove(), 3300); }
$('menuBtn').onclick = () => $('menu').classList.toggle('hidden');
$('audioToggle').onclick = () => { const on = audio.toggle(); $('audioToggle').textContent = on ? 'Activé' : 'Coupé'; $('audioToggle').classList.toggle('on', on); if (on) audio.chime('chat'); };
$('audioVol').oninput = (e) => audio.setVolume(+e.target.value);
function refreshQualityButtons() { document.querySelectorAll('#qualitySeg button').forEach(b => b.classList.toggle('sel', b.dataset.q === QUALITY.pref)); }
document.querySelectorAll('#qualitySeg button').forEach(b => b.onclick = () => {
  QUALITY.pref = b.dataset.q; setQualityPref(b.dataset.q); refreshQualityButtons();
  applyTier(b.dataset.q === 'auto' ? (IS_MOBILE ? 'low' : 'high') : b.dataset.q);
});
refreshQualityButtons();
// portée d'affichage des messages des fleurs (réglage mémorisé)
flowers.range = ['petit', 'grand', 'infini'].includes(LS.get('jf2_range')) ? LS.get('jf2_range') : 'grand';
function refreshRangeButtons() { document.querySelectorAll('#rangeSeg button').forEach(b => b.classList.toggle('sel', b.dataset.r === flowers.range)); }
document.querySelectorAll('#rangeSeg button').forEach(b => b.onclick = () => { flowers.range = b.dataset.r; LS.set('jf2_range', b.dataset.r); refreshRangeButtons(); });
refreshRangeButtons();
// taille du texte des étiquettes de fleurs (réglage mémorisé)
const FONT_SCALES = { petite: 0.7, moyenne: 1, grande: 1.5 };
let fontPref = FONT_SCALES[LS.get('jf2_font')] ? LS.get('jf2_font') : 'moyenne';
function applyFont() { flowers.fontScale = FONT_SCALES[fontPref]; document.querySelectorAll('#fontSeg button').forEach(b => b.classList.toggle('sel', b.dataset.f === fontPref)); }
document.querySelectorAll('#fontSeg button').forEach(b => b.onclick = () => { fontPref = b.dataset.f; LS.set('jf2_font', fontPref); applyFont(); });
applyFont();
const chatEl = $('chat');
if (IS_MOBILE) chatEl.classList.add('collapsed');
$('chatToggle').onclick = () => { chatEl.classList.remove('collapsed'); };
$('chatClose').onclick = () => { chatEl.classList.add('collapsed'); $('msg').blur(); };
function isTyping() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); }

function applyTier(tier) {
  if (QUALITY.tier === tier) return;
  QUALITY.tier = tier; preset = QUALITY.preset;
  renderer.setPixelRatio(preset.pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  if (renderer.shadowMap.enabled !== preset.shadows) {
    renderer.shadowMap.enabled = preset.shadows; sky.sun.castShadow = preset.shadows;
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  }
  grass.setPreset(preset);
  particles.systems.forEach(s => { s.mat.uniforms.uDensity.value = tier === 'low' ? 0.5 : 1; });
  setupComposer(); onResize();
}

// ---------- Entrées clavier / souris ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  if (isTyping()) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  if (!self.entered) return;
  keys.add(e.code);
  if (e.code === 'Enter') { e.preventDefault(); chatEl.classList.remove('collapsed'); $('msg').focus(); }
  if (e.code === 'KeyE') doAction('spell');
  if (e.code === 'KeyF') doAction('flower');
  if (e.code === 'KeyT') doAction('tree');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const cv = renderer.domElement;
let drag = null;
cv.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && IS_MOBILE) return; drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    cam.yaw -= dx * 0.006; cam.pitch = Math.max(-0.05, Math.min(1.25, cam.pitch + dy * 0.005));
  } else hover(e);
});
cv.addEventListener('pointerup', (e) => { if (drag && drag.moved < 6) clickAt(e.clientX, e.clientY); drag = null; });
cv.addEventListener('wheel', (e) => { cam.dist = Math.max(3, Math.min(18, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: true });

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setRay(x, y) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); }
function hover(e) {
  setRay(e.clientX, e.clientY);
  const p = portals.pick(ray);
  portals.items.forEach(i => { i.hover = i === p; });
  cv.style.cursor = p ? 'pointer' : 'grab';
}
function clickAt(x, y) {
  setRay(x, y);
  const p = portals.pick(ray);
  if (p) { portals.go(p); return; }
  const f = flowers.pick(ray);
  flowers.pinned = f && flowers.pinned !== f ? f : null;
}

// Joysticks (mobile)
const stick = { mx: 0, my: 0, lx: 0, ly: 0 };
function bindStick(el, onMove) {
  const knob = el.querySelector('.knob'); let id = null;
  const R = 50;
  const set = (e) => {
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`; onMove(dx / R, dy / R);
  };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); set(e); e.preventDefault(); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; onMove(0, 0); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
bindStick($('stickL'), (x, y) => { stick.mx = x; stick.my = y; });
bindStick($('stickR'), (x, y) => { stick.lx = x; stick.ly = y; });
// sur mobile, un tap dans la scène sert à cliquer (portails, fleurs)
cv.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch' && IS_MOBILE) clickAt(e.clientX, e.clientY); });

// ---------- Actions ----------
document.querySelectorAll('.act').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); doAction(b.dataset.act); }));
let busy = false;
function frontOf(dist) { return { x: player.x + Math.sin(player.ry) * dist, z: player.z + Math.cos(player.ry) * dist }; }
async function doAction(kind) {
  if (!self.entered || busy) return;
  if (kind === 'spell') { net.castSpell(player.x, player.z, self.color); audio.chime('spell'); return; }
  busy = true;
  try {
    if (kind === 'flower') {
      const { proceed, msg } = await askFlowerMessage();
      if (!proceed) return;
      const p = frontOf(1.2);
      await net.plantFlower({ name: self.name, color: self.color, x: p.x, z: p.z, biome: biomeAt(p.x, p.z), msg });
      audio.chime('flower');
    } else if (kind === 'tree') {
      const p = frontOf(2.2);
      const res = await net.plantTree({ name: self.name, color: self.color, x: p.x, z: p.z });
      if (!res.ok) { const h = Math.floor(res.remain / 3600000), m = Math.floor((res.remain % 3600000) / 60000); toast(`Prochain arbre dans ${h}h ${m}min`); }
      else { toast('🌱 Ton arbre va pousser pendant 2 jours'); audio.chime('tree'); }
    }
  } catch (e) { console.error(e); toast("Oups, ça n'a pas marché"); }
  finally { busy = false; }
}
function askFlowerMessage() {
  return new Promise((resolve) => {
    const modal = $('flowerModal'), ta = $('flowerMsg');
    const done = (r) => { modal.classList.add('hidden'); $('fmNoMsg').onclick = $('fmWithMsg').onclick = $('fmCancel').onclick = null; keys.clear(); resolve(r); };
    modal.classList.remove('hidden'); ta.value = ''; ta.focus();
    $('fmCancel').onclick = () => done({ proceed: false, msg: null });
    $('fmNoMsg').onclick = () => done({ proceed: true, msg: null });
    $('fmWithMsg').onclick = () => done({ proceed: true, msg: (ta.value || '').trim().slice(0, 140) || null });
  });
}

// ---------- Données partagées ----------
const freshTs = (ts) => typeof ts === 'number' && Math.abs(Date.now() - ts) < 15000;
// État de la connexion dans le menu (pour comprendre un éventuel souci)
let troubleShown = false;
function renderNetStatus() {
  const el = $('netStatus'), st = net.status;
  if (!st) { el.textContent = '🧪 Mode démo'; return; }
  let t, bad = true;
  if (st.appCheck && st.appCheck !== 'ok') t = `⚠️ Vérification anti-robot refusée (${st.appCheck})`;
  else if (st.auth && st.auth !== 'ok') t = `⚠️ Connexion refusée (${st.auth})`;
  else if (st.read && !st.data) t = `⚠️ Lecture refusée (${st.read})`;
  else if (st.data) { t = '✅ Connecté'; bad = false; }
  else if (st.connected) { t = '⏳ Connecté, chargement…'; bad = false; }
  else { t = '⏳ Connexion…'; bad = false; }
  el.textContent = t; el.classList.toggle('bad', bad);
  if (bad && !troubleShown) { troubleShown = true; toast('Souci de connexion au jardin : détails dans le menu ☰'); }
}
net.onStatus = renderNetStatus;
net.onTrouble = () => renderNetStatus();
const gotData = () => { if (net.status && !net.status.data) net.setStatus({ data: true }); };
renderNetStatus();
net.onGarden({
  added: (key, d) => {
    gotData();
    flowers.add(key, d, { fresh: freshTs(d.ts) });
    games.onFlower();
    decor.clearAround(+d.x || 0, +d.z || 0, 0.9);
    if (freshTs(d.ts)) { const m = flowers.nodes.get(key); if (m) fx.plantPuff(m.position.x, m.position.y, m.position.z, d.color || '#ffffff'); }
  },
  changed: (key, d) => flowers.change(key, d),
  removed: (key) => flowers.remove(key),
});
net.onTrees({
  added: (key, d) => { trees.add(key, d, { now: freshTs(d.ts) }); decor.clearAround(+d.x || 0, +d.z || 0, 2.2); if (freshTs(d.ts)) fx.plantPuff(+d.x, groundY(+d.x, +d.z), +d.z, d.color || '#9be15d'); },
  removed: (key) => trees.remove(key),
});
// (après une reconnexion, Firebase renvoie les éléments déjà reçus : on les ignore)
const seenKeys = new Set();
const once = (key) => { if (key && seenKeys.has(key)) return false; if (key) seenKeys.add(key); return true; };
net.onSpells((ev, key) => { if (!once(key) || Date.now() - (ev.ts || 0) > 15000) return; fx.aurora(+ev.x || 0, +ev.z || 0, ev.color || '#88e5ff'); });
net.onCreatures((id, d) => creatures.add(id, d));
net.onChat((m, key) => {
  gotData();
  if (!once(key)) return;
  const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = m.name || 'Fée';
  li.append(b, ' ' + (m.text || '')); $('messages').appendChild(li); $('messages').scrollTop = 1e9;
  if (Date.now() - (m.ts || 0) < 20000) bubbleFor(m.name, m.text);
});
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault(); const text = ($('msg').value || '').trim(); if (!text) return;
  net.sendChat(self.name || 'Fée', text.slice(0, 200)); $('msg').value = ''; $('msg').blur();
  if (IS_MOBILE) chatEl.classList.add('collapsed');
});

// ---------- Les autres joueurs ----------
const FRESH_MS = 10000;
function avatarFor(uid, data) {
  return isCharacter(data.avatar) ? data.avatar : CHARACTERS[hashStr(uid) % CHARACTERS.length].id;
}
function spawnOther(uid, data) {
  const id = avatarFor(uid, data), color = toHexColor(data.color, '#ff7aa8'), name = data.name || 'Fée#' + uid.slice(0, 4);
  const ch = makeCharacter(id, color);
  const label = makeLabel(name, color, { fontSize: 28, worldHeight: 0.3 }); label.position.y = ch.height + 0.25;
  ch.root.add(label);
  ch.root.position.set(+data.x || 0, groundY(+data.x || 0, +data.z || 0), +data.z || 0);
  scene.add(ch.root);
  const o = { ch, id, color, name, label, tx: +data.x || 0, tz: +data.z || 0, ry: +data.ry || 0, speed: 0, bubble: null, bubbleT: 0 };
  others.set(uid, o); return o;
}
function despawnOther(uid) { const o = others.get(uid); if (!o) return; disposeLabel(o.label); disposeLabel(o.bubble); scene.remove(o.ch.root); o.ch.dispose(); others.delete(uid); }
net.onPresence((all) => {
  games.onPresence(all);
  const now = Date.now(), list = [];
  const seen = new Set();
  for (const [uid, d] of Object.entries(all)) {
    const last = typeof d?.last === 'number' ? d.last : 0;
    if (!last || now - last > FRESH_MS) continue;
    if (uid === net.uid) { list.unshift({ uid, name: self.name || 'Moi', color: self.color, avatar: self.avatar, me: true }); continue; }
    seen.add(uid);
    let o = others.get(uid);
    const id = avatarFor(uid, d), color = toHexColor(d.color, '#ff7aa8'), name = d.name || 'Fée#' + uid.slice(0, 4);
    if (o && (o.id !== id || o.color !== color || o.name !== name)) { despawnOther(uid); o = null; }
    if (!o) o = spawnOther(uid, d);
    if (Number.isFinite(+d.x)) o.tx = +d.x;
    if (Number.isFinite(+d.z)) o.tz = +d.z;
    if (Number.isFinite(d.ry)) o.ry = d.ry; else o.autoFace = true;
    list.push({ uid, name, color, avatar: id });
  }
  for (const uid of [...others.keys()]) if (!seen.has(uid)) despawnOther(uid);
  $('onlineCount').textContent = String(Math.max(1, list.length));
  const who = $('who'); who.innerHTML = '';
  for (const u of list) {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = u.color;
    const nm = document.createElement('span'); nm.textContent = u.name + (u.me ? ' (moi)' : '');
    const av = document.createElement('span'); av.className = 'av'; av.textContent = (CHARACTERS.find(c => c.id === u.avatar) || CHARACTERS[0]).emoji;
    li.append(dot, nm, av); who.appendChild(li);
  }
});
function bubbleFor(name, text) {
  if (!text) return;
  const make = () => makeLabel(String(text).slice(0, 120), '#fff', { fontSize: 28, maxWidth: 360, worldHeight: 0.34, bubble: true });
  if (name === self.name && self.entered) {
    disposeLabel(myBubble); myBubble = make(); myBubble.position.y = myChar.height + 0.35; myChar.root.add(myBubble); myBubbleT = 6; return;
  }
  for (const o of others.values()) if (o.name === name) {
    disposeLabel(o.bubble); o.bubble = make(); o.bubble.position.y = o.ch.height + 0.7; o.ch.root.add(o.bubble); o.bubbleT = 6;
  }
}

// ---------- Boucle ----------
const clock = new THREE.Clock();
let poseT = 0, lastSent = { x: NaN, z: NaN, ry: NaN }, heartbeat = 0;
let biomeCur = null, biomeCand = null, biomeSince = 0;
let fpsAcc = 0, fpsN = 0, fpsTime = 0, started = performance.now();
const tmpV = new THREE.Vector3();

function updatePlayer(dt) {
  let ix = 0, iz = 0;
  if (self.entered && !isTyping()) {
    if (keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp')) iz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
    if (keys.has('KeyA') || keys.has('KeyQ') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    ix += stick.mx; iz -= stick.my;
  }
  if (games.frozen) { ix = 0; iz = 0; }   // cache-cache : le chercheur compte
  const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1.7 : 1;
  const inWater = groundY(player.x, player.z) < WATER_LEVEL - 0.15 && decor.bridgeY(player.x, player.z) === null && self.avatar !== 'fee';
  const maxSpeed = 5.5 * run * (inWater ? 0.55 : 1);
  const fx_ = -Math.sin(cam.yaw), fz_ = -Math.cos(cam.yaw);
  const wantX = (fx_ * iz + -fz_ * ix) * maxSpeed, wantZ = (fz_ * iz + fx_ * ix) * maxSpeed;
  const k = 1 - Math.exp(-dt * 10);
  player.vx += (wantX - player.vx) * k; player.vz += (wantZ - player.vz) * k;
  player.x += player.vx * dt; player.z += player.vz * dt;
  const r = Math.hypot(player.x, player.z);
  if (r > PLAY_RADIUS) { player.x *= PLAY_RADIUS / r; player.z *= PLAY_RADIUS / r; }
  player.speed = Math.hypot(player.vx, player.vz);
  if (player.speed > 0.3) {
    const target = Math.atan2(player.vx, player.vz);
    let d = target - player.ry; d = Math.atan2(Math.sin(d), Math.cos(d));
    player.ry += d * Math.min(1, dt * 10);
  }
  // mobile : joystick droit = caméra
  cam.yaw -= stick.lx * dt * 2.4; cam.pitch = Math.max(-0.05, Math.min(1.25, cam.pitch + stick.ly * dt * 1.6));
  // hauteur : sol, pont, ou eau (on avance en barbotant)
  const g = groundY(player.x, player.z), b = decor.bridgeY(player.x, player.z);
  let y = b !== null ? Math.max(g, b) : g;
  if (b === null && g < WATER_LEVEL - 0.45) y = WATER_LEVEL - 0.45;
  player.y = y;
  myChar.root.position.set(player.x, player.y, player.z);
  myChar.root.rotation.y = player.ry;
  const s01 = clamp01(player.speed / 5.5);
  myChar.animate(U.uTime.value, s01);
  if (myChar.sparkle && player.speed > 0.5 && Math.random() < dt * 30) fx.emit(player.x - player.vx * 0.05, player.y + 0.85, player.z - player.vz * 0.05, (Math.random() - 0.5) * 0.3, -0.2, (Math.random() - 0.5) * 0.3, self.color, 1.0, 0.12);
  if (inWater && player.speed > 0.5 && Math.random() < dt * 25) fx.emit(player.x, WATER_LEVEL + 0.05, player.z, (Math.random() - 0.5), 1.2, (Math.random() - 0.5), '#e8fbff', 0.5, 0.1, -4);
  U.uPlayer.value.set(player.x, player.y, player.z);
}

function updateCamera(dt) {
  if (!self.entered) cam.yaw += dt * 0.12;          // écran d'accueil : la caméra tourne doucement
  const k = 1 - Math.exp(-dt * 8);
  cam.tx += (player.x - cam.tx) * k; cam.ty += (player.y + 1.0 - cam.ty) * k; cam.tz += (player.z - cam.tz) * k;
  const d = self.entered ? cam.dist : 6.2, p = self.entered ? cam.pitch : 0.22;
  // la caméra se rapproche si un arbre la cache
  if (self.entered && (camBlockT -= dt) <= 0) { camBlockT = 0.12; camBlock = occluderDist(d, p); }
  camEff += (Math.min(d, camBlock) - camEff) * (1 - Math.exp(-dt * (camBlock < camEff ? 14 : 3)));
  const dd = self.entered ? camEff : d;
  let cx = cam.tx + Math.sin(cam.yaw) * Math.cos(p) * dd, cz = cam.tz + Math.cos(cam.yaw) * Math.cos(p) * dd;
  let cy = cam.ty + Math.sin(p) * dd;
  cy = Math.max(cy, Math.max(groundY(cx, cz), WATER_LEVEL) + 0.5);
  camera.position.set(cx, cy, cz);
  // sur l'écran d'accueil, le personnage est décalé à droite pour laisser place au panneau
  const lookOff = !self.entered && innerWidth > 800 ? tmpV.set(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw)).multiplyScalar(1.8) : tmpV.set(0, 0, 0);
  camera.lookAt(cam.tx + lookOff.x, cam.ty, cam.tz + lookOff.z);
}

let camEff = 7.5, camBlock = 99, camBlockT = 0;
const camRay = new THREE.Raycaster(), camDir = new THREE.Vector3(), camOrigin = new THREE.Vector3();
function occluderDist(d, p) {
  camOrigin.set(cam.tx, cam.ty, cam.tz);
  camDir.set(Math.sin(cam.yaw) * Math.cos(p), Math.sin(p), Math.cos(cam.yaw) * Math.cos(p)).normalize();
  camRay.set(camOrigin, camDir); camRay.far = d;
  const near = [];
  for (const g of trees.nodes.values()) if (Math.hypot(g.position.x - cam.tx, g.position.z - cam.tz) < d + 8) near.push(g);
  for (const m of decor.meshes) if (m.name.startsWith('tree')) near.push(m);
  const hit = camRay.intersectObjects(near, true)[0];
  return hit ? Math.max(1.6, hit.distance - 0.4) : 99;
}

function updateOthers(dt) {
  const t = U.uTime.value;
  for (const [uid, o] of others) {
    o.label.visible = !games.hideLabelOf(uid);   // cache-cache : pas de nom au-dessus des cachés
    const p = o.ch.root.position;
    const ox = p.x, oz = p.z, k = 1 - Math.exp(-dt * 6);
    p.x += (o.tx - p.x) * k; p.z += (o.tz - p.z) * k;
    const g = groundY(p.x, p.z), b = decor.bridgeY(p.x, p.z);
    p.y = b !== null ? Math.max(g, b) : Math.max(g, WATER_LEVEL - 0.45);
    const sp = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 1e-3);
    o.speed += (clamp01(sp / 5.5) - o.speed) * 0.2;
    let ry = o.ry;
    if (o.autoFace && sp > 0.3) ry = Math.atan2(p.x - ox, p.z - oz);
    if (o.autoFace && sp <= 0.3) ry = o.ch.root.rotation.y;
    let dr = ry - o.ch.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    o.ch.root.rotation.y += dr * Math.min(1, dt * 8);
    o.ch.animate(t + (hashStr(o.name) % 100), o.speed);
    if (o.ch.sparkle && o.speed > 0.15 && Math.random() < dt * 20) fx.emit(p.x, p.y + 0.85, p.z, (Math.random() - 0.5) * 0.3, -0.2, (Math.random() - 0.5) * 0.3, o.color, 1.0, 0.12);
    if (o.bubble && (o.bubbleT -= dt) <= 0) { disposeLabel(o.bubble); o.bubble = null; }
  }
  if (myBubble && (myBubbleT -= dt) <= 0) { disposeLabel(myBubble); myBubble = null; }
}

function nearbyWeights(x, z) {
  // poids max des biomes autour du joueur (pour activer les particules à temps)
  const w = biomeWeights(x, z);
  for (const [dx, dz] of [[22, 0], [-22, 0], [0, 22], [0, -22]]) biomeWeights(x + dx, z + dz).forEach((v, i) => { w[i] = Math.max(w[i], v * 0.999); });
  return w;
}

function updateHUD(now, st) {
  const b = biomeAt(player.x, player.z);
  if (b !== biomeCand) { biomeCand = b; biomeSince = now; }
  if (b !== biomeCur && now - biomeSince > 300) { biomeCur = b; $('biomeName').textContent = BIOME_LABEL[b]; }
  const h = Math.floor(st.hour), m = Math.floor((st.hour - h) * 60);
  $('clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${st.night > 0.5 ? '🌙' : '☀️'}`;
}

function autoQuality(dt) {
  if (QUALITY.pref !== 'auto' || QUALITY.tier === 'low') return;
  if (performance.now() - started < 8000 || document.hidden) return;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 4) {
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (fps < 34) { applyTier('low'); toast('Qualité réduite automatiquement pour rester fluide'); }
  }
}

let firstFrame = true;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  U.uTime.value += dt;
  const now = performance.now();
  updatePlayer(dt);
  updateCamera(dt);
  const st = sky.update(camera, tmpV.set(player.x, player.y, player.z));
  const w = nearbyWeights(player.x, player.z);
  sky.setBiome(biomeWeights(player.x, player.z));
  grass.update(tmpV.set(player.x, 0, player.z));
  particles.update(camera.position, w, st.night, innerHeight, renderer.getPixelRatio());
  water.material.uniforms.uTime.value = U.uTime.value;
  water.material.uniforms.uDay.value = 1 - st.night * 0.8;
  water.material.uniforms.uSky.value.copy(sky.uniforms.uHor.value);
  flowers.process(player, 5); trees.process(player, 5);
  flowers.tick(player, now);
  trees.tick(player, Date.now(), flowers.range, flowers.fontScale);
  decor.tick(dt);
  creatures.update(dt);
  fx.update(dt, innerHeight, renderer.getPixelRatio());
  updateOthers(dt);
  const near = portals.update(dt, player);
  const pb = $('portalBtn');
  if (near && self.entered) {
    if (pb.dataset.url !== near.url) {
      pb.dataset.url = near.url; pb.textContent = `✦ Visiter : ${near.title}`;
      if (near.desc) { const sm = document.createElement('small'); sm.textContent = near.desc; pb.appendChild(sm); }
      pb.onclick = () => portals.go(near);
    }
    pb.classList.remove('hidden');
  } else { pb.classList.add('hidden'); pb.dataset.url = ''; }
  if (self.entered) {
    updateHUD(now, st);
    audio.tick(dt, st.night, w);
    // présence : envoi quand on bouge, sinon battement toutes les 3 s (les autres filtrent à 10 s)
    poseT += dt; heartbeat += dt;
    const moved = Math.hypot(player.x - lastSent.x, player.z - lastSent.z) > 0.05 || Math.abs(player.ry - lastSent.ry) > 0.1;
    if ((moved && poseT > 0.1) || heartbeat > 3) {
      net.pose(player.x, player.z, player.ry); lastSent = { x: player.x, z: player.z, ry: player.ry }; poseT = 0; heartbeat = 0;
    }
    if (Math.random() < dt) LS.set('jf2_pos', JSON.stringify({ x: +player.x.toFixed(1), z: +player.z.toFixed(1) }));
  }
  if (self.entered) games.update(dt);
  autoQuality(dt);
  if (composer) composer.render(dt); else renderer.render(scene, camera);
  if (firstFrame) { firstFrame = false; $('loading').classList.add('fade'); $('overlay').classList.remove('hidden'); setTimeout(() => $('loading').remove(), 700); }
  requestAnimationFrame(frame);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);
window.JARDIN = { games, scene, camera, renderer, player, cam, flowers, trees, net, QUALITY, applyTier };
requestAnimationFrame(frame);
