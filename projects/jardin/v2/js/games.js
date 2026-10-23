// Mini-jeux du jardin :
//  - Esprits cachés : 15 petits esprits à trouver dans le monde (progression gardée sur l'appareil)
//  - Bouquet du jour : un défi commun calculé à partir des fleurs plantées aujourd'hui (aucune donnée en plus)
//  - Cache-cache : partie entre joueurs connectés, coordonnée par un champ « hs » dans /presence
import * as THREE from 'three';
import { groundY, biomeAt, WATER_LEVEL, WINDMILL, POND, BRIDGE } from './world.js';
import { hashStr, glowTexture, toon } from './util.js';

const LS = {
  get(k, d = null) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------- Esprits cachés ----------
export const SPIRITS = [
  { id: 'depart', x: -6, z: -2, hint: 'Tout près du départ, là où tout commence' },
  { id: 'pont', x: BRIDGE.x - 9, z: BRIDGE.z + 2.5, hint: 'Là où le chemin enjambe l\'eau' },
  { id: 'moulin', x: WINDMILL.x + 3.5, z: WINDMILL.z + 3, hint: 'Au pied des grandes ailes qui tournent' },
  { id: 'hof', x: -24.5, z: -24.5, hint: 'Derrière les souvenirs du Hall of Fame' },
  { id: 'etoiles', x: 16.5, z: 2.5, hint: 'Derrière la grande porte vers les étoiles' },
  { id: 'etang', x: POND.x + 2, z: POND.z - 1, hint: 'Au milieu de l\'étang' },
  { id: 'ete', x: 34, z: 42, hint: 'Dans les hautes herbes dorées de l\'été, au sud-est' },
  { id: 'automne', x: -78, z: -46, hint: 'Dans la forêt d\'automne, au nord-ouest' },
  { id: 'source', x: 41, z: -150, hint: 'Là où naît la rivière, dans le froid' },
  { id: 'sapins', x: 62, z: -122, hint: 'Parmi les sapins enneigés du nord-est' },
  { id: 'est', x: 112, z: 88, hint: 'Là où l\'hiver touche l\'est' },
  { id: 'nord', x: 2, z: -164, hint: 'Au bout du chemin du nord, face aux montagnes' },
  { id: 'sud', x: -44, z: 118, hint: 'Au bout du chemin du sud' },
  { id: 'dunes', x: -128, z: 46, hint: 'Entre deux dunes, loin au sud-ouest' },
  { id: 'desert', x: -160, z: 2, hint: 'Au bout du chemin du désert' },
];

function spiritMesh() {
  const g = new THREE.Group();
  const white = toon('#f6f2e8', { emissive: new THREE.Color('#fff6dc'), emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.14, 4, 10), white); body.position.y = 0.16;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), white); head.position.y = 0.42; head.scale.set(1.05, 0.9, 1);
  const ink = new THREE.MeshBasicMaterial({ color: 0x1b1622 });
  for (const [x, y] of [[-0.05, 0.44], [0.055, 0.45], [0.005, 0.37]]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), ink); e.position.set(x, y, 0.135); e.scale.z = 0.4; g.add(e); }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff1c4, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(1.3); halo.position.y = 0.3;
  g.add(body, head, halo); g.userData.halo = halo;
  return g;
}

// ---------- Bouquet du jour ----------
function colorFamily(hex) {
  const c = new THREE.Color(hex || '#ffffff'), hsl = {}; c.getHSL(hsl);
  if (hsl.s < 0.18) return hsl.l > 0.6 ? 'blanc' : 'gris';
  const h = hsl.h * 360;
  if (h < 15 || h >= 345) return 'rouge';
  if (h < 45) return 'orange';
  if (h < 70) return 'jaune';
  if (h < 160) return 'vert';
  if (h < 250) return 'bleu';
  if (h < 290) return 'violet';
  return 'rose';
}
const near = (d, x, z, r) => Math.hypot((+d.x || 0) - x, (+d.z || 0) - z) < r;
const biomeOf = (d) => d.biome || biomeAt(+d.x || 0, +d.z || 0);
const CHALLENGES = [
  { text: 'Plantez 5 fleurs dans le désert', n: 5, test: d => biomeOf(d) === 'desert' },
  { text: 'Plantez 5 fleurs en hiver', n: 5, test: d => biomeOf(d) === 'hiver' },
  { text: 'Plantez 5 fleurs en automne', n: 5, test: d => biomeOf(d) === 'automne' },
  { text: 'Plantez 6 fleurs avec un message', n: 6, test: d => !!(d.msg && String(d.msg).trim()) },
  { text: 'Plantez 6 fleurs bleues', n: 6, test: d => colorFamily(d.color) === 'bleu' },
  { text: 'Plantez 6 fleurs rouges', n: 6, test: d => colorFamily(d.color) === 'rouge' },
  { text: 'Plantez 6 fleurs jaunes', n: 6, test: d => colorFamily(d.color) === 'jaune' },
  { text: 'Plantez 6 fleurs violettes', n: 6, test: d => colorFamily(d.color) === 'violet' },
  { text: 'Plantez 4 fleurs au pied du moulin', n: 4, test: d => near(d, WINDMILL.x, WINDMILL.z, 16) },
  { text: 'Plantez 4 fleurs au bord de l\'étang', n: 4, test: d => near(d, POND.x, POND.z, POND.r + 8) },
  { text: 'Plantez 5 fleurs dans l\'allée des portails', n: 5, test: d => (+d.x >= 4 && +d.x <= 17 && +d.z >= -29 && +d.z <= 34) },
  { text: '3 jardiniers différents plantent une fleur aujourd\'hui', n: 3, distinct: true, test: () => true },
];
function parisDay(ts) {
  try { return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)); }
  catch { return new Date(ts).toISOString().slice(0, 10); }
}

// Arc-en-ciel affiché quand le bouquet du jour est réussi
function rainbow() {
  const geo = new THREE.RingGeometry(170, 200, 96, 1, 0, Math.PI);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform float uA; varying vec3 vP;
      vec3 hsv(float h){ vec3 k = clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0); return k; }
      void main(){ float t = (length(vP.xy)-170.0)/30.0; float edge = smoothstep(0.0,0.15,t)*smoothstep(1.0,0.85,t);
        gl_FragColor = vec4(hsv(0.8*t), 0.38*edge*uA); }`,
  });
  const m = new THREE.Mesh(geo, mat); m.position.set(0, -40, -260); m.renderOrder = -5; m.frustumCulled = false;
  return m;
}

// ---------- Cache-cache ----------
const HIDE_MS = 30000, SEEK_MS = 180000, RESULT_MS = 12000, ZONE_R = 40, FOUND_R = 2.2;

export class Games {
  constructor({ scene, fx, audio, toast, net, flowers, player, self }) {
    Object.assign(this, { scene, fx, audio, toast, net, flowers, player, self });
    this.el = { panel: document.getElementById('games'), body: document.getElementById('gamesBody'), pill: document.getElementById('gamePill'), blind: document.getElementById('blind') };
    // esprits
    this.found = new Set(JSON.parse(LS.get('jf2_spirits', '[]') || '[]'));
    this.spirits = [];
    for (const s of SPIRITS) {
      if (this.found.has(s.id)) continue;
      const m = spiritMesh(); m.scale.setScalar(1.35);   // la tête dépasse des herbes
      const y = Math.max(groundY(s.x, s.z), WATER_LEVEL + 0.05) + 0.1;
      m.position.set(s.x, y, s.z); m.rotation.y = (hashStr(s.id) % 628) / 100;
      scene.add(m); this.spirits.push({ ...s, mesh: m, y, whispered: false });
    }
    // bouquet
    this.day = ''; this.challenge = null; this.progress = 0; this.done = false; this.dirty = true;
    this.rainbow = rainbow(); scene.add(this.rainbow);
    // cache-cache
    this.presence = {};
    this.hs = null;            // mon état de partie (ce que j'écris dans /presence)
    this.invite = null;        // partie à rejoindre
    this.announced = new Set();
    this.zoneRing = null;
    this.lastPanel = 0;
  }

  now() { return Date.now() + (this.net.serverOffset || 0); }

  // ===== Esprits =====
  updateSpirits(dt) {
    const t = performance.now() / 1000;
    let closest = Infinity;
    for (let i = this.spirits.length - 1; i >= 0; i--) {
      const s = this.spirits[i];
      s.mesh.position.y = s.y + Math.sin(t * 2 + i) * 0.05;
      s.mesh.rotation.y += dt * 0.4;
      s.mesh.userData.halo.material.opacity = 0.35 + 0.25 * Math.sin(t * 3 + i);
      const d = Math.hypot(this.player.x - s.x, this.player.z - s.z);
      closest = Math.min(closest, d);
      if (d < 14 && !s.whispered) { s.whispered = true; this.toast('✨ Un esprit est caché tout près…'); this.audio.tone(1568, 0.8, 'sine', 0.05); }
      if (d < 1.6) this.catchSpirit(s, i);
    }
    this.spiritNear = closest;
  }
  catchSpirit(s, i) {
    this.spirits.splice(i, 1);
    this.found.add(s.id); LS.set('jf2_spirits', JSON.stringify([...this.found]));
    this.fx.burst(s.x, s.y + 0.4, s.z, '#fff1c4', 70, 2, 1.6);
    this.scene.remove(s.mesh);
    this.audio.chime('spell');
    const n = this.found.size;
    if (n >= SPIRITS.length) this.toast('🎉 Tu as trouvé les 15 esprits du jardin ! Ils te suivront désormais.');
    else this.toast(`👻 Esprit trouvé ! (${n}/${SPIRITS.length})`);
    this.renderPanel();
  }
  get allSpirits() { return this.found.size >= SPIRITS.length; }

  // ===== Bouquet du jour =====
  updateBouquet() {
    const today = parisDay(this.now());
    if (today !== this.day) { this.day = today; this.challenge = CHALLENGES[hashStr(today) % CHALLENGES.length]; this.dirty = true; this.done = false; }
    if (!this.dirty) return;
    this.dirty = false;
    const c = this.challenge, uids = new Set();
    let n = 0;
    for (const d of this.flowers.data.values()) {
      if (typeof d.ts !== 'number' || parisDay(d.ts) !== today || !c.test(d)) continue;
      n++; uids.add(d.uid || d.name);
    }
    const prog = Math.min(c.n, c.distinct ? uids.size : n);
    const was = this.progress, wasDone = this.done;
    this.progress = prog; this.done = prog >= c.n;
    if (this.ready && prog > was && !this.done) this.toast(`💐 Bouquet du jour : ${prog}/${c.n}`);
    if (this.ready && this.done && !wasDone) {
      this.toast('🌈 Bouquet du jour réussi ! Merci à tous les jardiniers');
      this.audio.chime('tree');
      for (let k = 0; k < 6; k++) this.fx.burst(this.player.x + (Math.random() - 0.5) * 8, groundY(this.player.x, this.player.z) + 2, this.player.z + (Math.random() - 0.5) * 8, ['#ff9ad0', '#ffd35a', '#7ec8ff', '#c9a7ff'][k % 4], 40, 2.2, 2);
    }
    this.ready = true;
    this.renderPill(); this.renderPanel();
  }
  onFlower() { this.dirty = true; }

  // ===== Cache-cache =====
  onPresence(all) {
    this.presence = all || {};
    const me = this.net.uid, now = this.now();
    // invitations : un autre joueur cherche et la phase « cachez-vous » n'est pas finie
    this.invite = null;
    for (const [uid, d] of Object.entries(this.presence)) {
      const hs = d?.hs;
      if (uid === me || !hs || hs.role !== 'seek' || hs.end) continue;
      if (now - (d.last || 0) > 10000) continue;
      if (now < hs.t0 + HIDE_MS) {
        this.invite = { uid, name: d.name || 'Quelqu\'un', t0: hs.t0 };
        if (!this.hs && !this.announced.has(uid + hs.t0)) { this.announced.add(uid + hs.t0); this.toast(`🙈 ${d.name || 'Quelqu\'un'} lance un cache-cache ! Rejoins-le avec 🎮`); }
      }
    }
  }
  setHs(hs) { this.hs = hs; this.net.setGame?.(hs); this.renderPanel(); this.renderPill(); }

  startSeek() {
    if (!this.net.extraOk) { this.toast('Cache-cache indisponible : la base refuse les champs de la V2'); return; }
    this.setHs({ role: 'seek', t0: this.now(), zx: +this.player.x.toFixed(1), zz: +this.player.z.toFixed(1), found: [] });
    this.toast('🙈 Tu cherches ! Les autres ont 30 s pour se cacher');
  }
  join() {
    if (!this.invite) return;
    const host = this.presence[this.invite.uid];
    this.setHs({ role: 'hide', host: this.invite.uid, t0: this.invite.t0 });
    this.toast(`🌿 Cache-toi vite, ${host?.name || 'le chercheur'} compte jusqu'à 30 !`);
  }
  leave() { this.setHs(null); this.removeZone(); this.el.blind.classList.add('hidden'); }

  // participants d'une partie : chercheur + cachés qui l'ont rejoint
  game() {
    if (!this.hs) return null;
    const me = this.net.uid;
    const hostUid = this.hs.role === 'seek' ? me : this.hs.host;
    const host = hostUid === me ? { name: this.self.name, hs: this.hs, x: this.player.x, z: this.player.z } : this.presence[hostUid];
    if (!host?.hs || host.hs.role !== 'seek' || host.hs.t0 !== this.hs.t0) return { cancelled: true };
    const hiders = [];
    for (const [uid, d] of Object.entries(this.presence)) if (d?.hs?.role === 'hide' && d.hs.host === hostUid && d.hs.t0 === this.hs.t0) hiders.push({ uid, ...d });
    if (this.hs.role === 'hide' && !hiders.some(h => h.uid === me)) hiders.push({ uid: me, name: this.self.name, x: this.player.x, z: this.player.z, hs: this.hs });
    return { hostUid, host, hiders, t0: this.hs.t0, found: new Set(host.hs.found || []), end: host.hs.end, zx: host.hs.zx, zz: host.hs.zz };
  }
  // les noms des joueurs cachés ne s'affichent pas pendant la partie
  hideLabelOf(uid) {
    const d = this.presence[uid]; const hs = d?.hs; if (!hs || hs.role !== 'hide') return false;
    const host = this.presence[hs.host] || (hs.host === this.net.uid ? { hs: this.hs } : null);
    if (!host?.hs || host.hs.t0 !== hs.t0 || host.hs.end) return false;
    return !(host.hs.found || []).includes(uid) && this.now() < hs.t0 + HIDE_MS + SEEK_MS;
  }
  get frozen() { return this.hs?.role === 'seek' && this.now() < this.hs.t0 + HIDE_MS; }

  updateHide() {
    const g = this.game();
    if (!g) { this.el.blind.classList.add('hidden'); return; }
    if (g.cancelled) { if (!this.hs.over) this.toast('La partie de cache-cache est annulée'); this.leave(); return; }
    const now = this.now(), tSeek = g.t0 + HIDE_MS, tEnd = tSeek + SEEK_MS;
    this.ensureZone(g.zx, g.zz);
    const me = this.net.uid;
    if (this.hs.role === 'seek') {
      // aveuglé pendant que les autres se cachent
      const blind = now < tSeek;
      this.el.blind.classList.toggle('hidden', !blind);
      if (blind) this.el.blind.querySelector('b').textContent = Math.ceil((tSeek - now) / 1000);
      if (!blind && !g.end) {
        const found = new Set(this.hs.found);
        let changed = false;
        for (const h of g.hiders) {
          if (found.has(h.uid)) continue;
          const out = Math.hypot((+h.x || 0) - g.zx, (+h.z || 0) - g.zz) > ZONE_R + 2;
          if (Math.hypot((+h.x || 0) - this.player.x, (+h.z || 0) - this.player.z) < FOUND_R || out) {
            found.add(h.uid); changed = true;
            this.toast(out ? `${h.name || 'Un joueur'} est sorti du cercle : trouvé !` : `🔎 Tu as trouvé ${h.name || 'un joueur'} !`);
            this.audio.chime('flower'); this.fx.burst(+h.x || 0, groundY(+h.x || 0, +h.z || 0) + 1, +h.z || 0, '#ffd35a', 40, 1.5, 1.2);
          }
        }
        const allFound = g.hiders.length > 0 && found.size >= g.hiders.length;
        if (changed || allFound || now > tEnd) this.setHs({ ...this.hs, found: [...found], ...(allFound || now > tEnd ? { end: now } : {}) });
      }
    } else {
      this.el.blind.classList.add('hidden');
      if (g.found.has(me) && !this.hs.caught) { this.hs.caught = true; this.toast(`😅 ${g.host.name || 'Le chercheur'} t'a trouvé !`); this.audio.chime('chat'); }
      if (now < tSeek && Math.hypot(this.player.x - g.zx, this.player.z - g.zz) > ZONE_R) this.warn('Reste dans le cercle lumineux !');
    }
    // fin de partie
    const endAt = g.end || (now > tEnd ? tEnd : 0);
    if (endAt && !this.hs.over) {
      this.hs.over = true;
      const nf = g.hiders.filter(h => g.found.has(h.uid) || (this.hs.role === 'seek' && (this.hs.found || []).includes(h.uid))).length;
      const total = g.hiders.length;
      const msg = total === 0 ? 'Personne ne s\'est caché cette fois…'
        : nf >= total ? `🏆 ${g.host.name || 'Le chercheur'} a trouvé tout le monde !`
          : `🌿 Les cachés gagnent : ${total - nf} sur ${total} n'ont pas été trouvés`;
      this.toast(msg); this.audio.chime('tree');
      setTimeout(() => { if (this.hs?.t0 === g.t0) this.leave(); }, RESULT_MS);
    }
  }
  warn(t) { const n = performance.now(); if (n - (this._warnT || 0) > 4000) { this._warnT = n; this.toast(t); } }
  ensureZone(x, z) {
    if (this.zoneRing && this.zoneRing.userData.k === x + ',' + z) return;
    this.removeZone();
    const seg = 128, pos = [];
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, px = x + Math.cos(a) * ZONE_R, pz = z + Math.sin(a) * ZONE_R; pos.push(px, Math.max(groundY(px, pz), WATER_LEVEL) + 0.15, pz); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffe08a, size: 0.35, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.userData.k = x + ',' + z; this.zoneRing = pts; this.scene.add(pts);
  }
  removeZone() { if (this.zoneRing) { this.scene.remove(this.zoneRing); this.zoneRing.geometry.dispose(); this.zoneRing = null; } }

  // ===== Boucle + interface =====
  update(dt) {
    this.updateSpirits(dt);
    this.updateBouquet();
    if (this.hs) this.updateHide();
    this.rainbow.material.uniforms.uA.value += ((this.done ? 1 : 0) - this.rainbow.material.uniforms.uA.value) * Math.min(1, dt);
    // les 15 esprits trouvés : une traînée dorée suit le joueur
    if (this.allSpirits && this.self.entered && Math.random() < dt * 12) this.fx.emit(this.player.x + (Math.random() - 0.5) * 0.6, this.player.y + 0.4 + Math.random(), this.player.z + (Math.random() - 0.5) * 0.6, 0, 0.3, 0, '#ffe08a', 1.2, 0.12);
    const t = performance.now();
    if (t - this.lastPanel > 500) { this.lastPanel = t; this.renderPill(); this.renderPanel(); }
  }

  renderPill() {
    const pill = this.el.pill; if (!pill || !this.challenge) return;
    const g = this.hs && this.game();
    let txt = `💐 ${this.progress}/${this.challenge.n}${this.done ? ' 🌈' : ''}`;
    if (g && !g.cancelled) {
      const now = this.now(), tSeek = g.t0 + HIDE_MS;
      txt = now < tSeek ? `🙈 Cachez-vous ! ${mmss(tSeek - now)}` : `🔎 ${(g.found.size)}/${g.hiders.length} trouvés · ${mmss(tSeek + SEEK_MS - now)}`;
    } else if (this.invite) txt = `🙈 ${this.invite.name} cherche ! Rejoindre`;
    pill.textContent = txt;
  }

  renderPanel() {
    const p = this.el.panel; if (!p || p.classList.contains('hidden')) return;
    const c = this.challenge;
    const pct = c ? Math.round((this.progress / c.n) * 100) : 0;
    const g = this.hs && this.game();
    let hide = '';
    if (g && !g.cancelled) {
      const now = this.now(), tSeek = g.t0 + HIDE_MS;
      const phase = now < tSeek ? `Phase cachette : ${mmss(tSeek - now)}` : `Recherche : ${mmss(tSeek + SEEK_MS - now)} restantes`;
      const role = this.hs.role === 'seek' ? 'Tu cherches.' : `Tu te caches de ${esc(g.host.name)}.`;
      hide = `<p>${role} ${phase}</p><p>${g.hiders.length} caché(s), ${g.found.size} trouvé(s).</p><button class="pill" data-g="leave">Quitter la partie</button>`;
    } else if (this.invite) {
      hide = `<p><b>${esc(this.invite.name)}</b> lance une partie ! Tu as ${mmss(this.invite.t0 + HIDE_MS - this.now())} pour le rejoindre et te cacher.</p><button class="primary small" data-g="join">Rejoindre et me cacher</button>`;
    } else {
      hide = `<p>Tu cherches, les autres se cachent dans un cercle de ${ZONE_R} m autour de toi. 30 s pour se cacher, 3 min pour chercher.</p><button class="primary small" data-g="seek">Lancer une partie (je cherche)</button>`;
    }
    const list = SPIRITS.map(s => this.found.has(s.id) ? `<li class="ok">✓ ${esc(s.hint)}</li>` : `<li>${esc(s.hint)}</li>`).join('');
    const html = `
      <section><h4>💐 Bouquet du jour</h4>
        <p>${c ? esc(c.text) : ''}${this.done ? ' — <b>réussi ! 🌈</b>' : ''}</p>
        <div class="bar"><span style="width:${pct}%"></span></div><small>${this.progress}/${c ? c.n : 0} · défi commun à tous les joueurs, renouvelé chaque jour</small>
      </section>
      <section><h4>👻 Esprits cachés <span class="badge">${this.found.size}/${SPIRITS.length}</span></h4>
        <details ${this.hintsOpen ? 'open' : ''}><summary>Voir les indices</summary><ul class="hints">${list}</ul></details>
      </section>
      <section><h4>🙈 Cache-cache</h4>${hide}</section>`;
    if (html !== this.lastHtml) { this.lastHtml = html; this.el.body.innerHTML = html; }
  }

  bindUI() {
    const open = () => { this.el.panel.classList.toggle('hidden'); document.getElementById('menu').classList.add('hidden'); this.renderPanel(); };
    document.getElementById('menuBtn').addEventListener('click', () => this.el.panel.classList.add('hidden'));
    document.getElementById('gamesBtn').onclick = open;
    this.el.pill.onclick = () => { this.el.panel.classList.remove('hidden'); document.getElementById('menu').classList.add('hidden'); this.renderPanel(); };
    this.el.body.addEventListener('toggle', (e) => { if (e.target.tagName === 'DETAILS') this.hintsOpen = e.target.open; }, true);
    this.el.body.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-g]'); if (!b) return;
      if (b.dataset.g === 'seek') this.startSeek();
      if (b.dataset.g === 'join') this.join();
      if (b.dataset.g === 'leave') this.leave();
    });
  }
}
