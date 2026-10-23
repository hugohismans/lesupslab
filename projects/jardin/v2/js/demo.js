// Mode démo (hors ligne) : ?demo=1 — pour tester sans toucher à la vraie base
import { biomeAt as biomeOf } from './world.js';

export class Net {
  constructor() { this.uid = 'demo-me'; this.extraOk = true; this._p = {}; this._pcb = null; this._chat = null; this._spell = null; this._g = null; this._t = null; }
  async init() { return this.uid; }
  async serverNow() { return Date.now(); }
  async enter({ name, color, avatar }) { this._p[this.uid] = { name, color, avatar, x: 0, z: 0, ry: 0, last: Date.now() }; this._emit(); }
  pose(x, z, ry) { Object.assign(this._p[this.uid] || {}, { x, z, ry, last: Date.now() }); }
  profile(f) { Object.assign(this._p[this.uid] || {}, f); this._emit(); }
  // cache-cache en démo : les personnages de démo rejoignent la partie et se cachent
  setGame(hs) {
    const me = this._p[this.uid]; if (me) { if (hs) me.hs = hs; else delete me.hs; }
    for (let i = 0; i < 4; i++) {
      const b = this._p['bot' + i]; if (!b) continue;
      if (hs && hs.role === 'seek' && !b.hs) {
        const a = i * 1.7 + 0.5, r = 12 + i * 6;
        setTimeout(() => { b.hs = { role: 'hide', host: this.uid, t0: hs.t0 }; b.hideAt = [hs.zx + Math.cos(a) * r, hs.zz + Math.sin(a) * r]; this._emit(); }, 800 + i * 400);
      } else if (!hs) { delete b.hs; delete b.hideAt; }
    }
    this._emit();
  }
  onPresence(cb) {
    this._pcb = cb;
    const bots = [['Hormun', '#ffb347', 'renard'], ['Alexis', '#7ad7ff', 'esprit'], ['Alain', '#c38bff', 'champi'], ['Maria', '#ff7eb6', 'fee']];
    bots.forEach(([n, c, a], i) => { this._p['bot' + i] = { name: n, color: c, avatar: a, x: 6 + i * 3, z: 8 - i * 4, ry: 0, last: Date.now() }; });
    setInterval(() => {
      const t = Date.now() / 1000;
      bots.forEach((_, i) => { const b = this._p['bot' + i]; if (b.hideAt) { b.x += (b.hideAt[0] - b.x) * 0.3; b.z += (b.hideAt[1] - b.z) * 0.3; b.last = Date.now(); return; } b.x = Math.cos(t * 0.15 + i * 1.6) * (8 + i * 4); b.z = Math.sin(t * 0.15 + i * 1.6) * (8 + i * 4); b.ry = -(t * 0.15 + i * 1.6); b.last = Date.now(); });
      this._emit();
    }, 300);
    this._emit();
  }
  _emit() { this._pcb?.({ ...this._p }); }
  onGarden({ added }) {
    this._g = added;
    const names = ['Hormun', 'Alexis', 'Maria', 'Alain', 'Lou', 'Noé'], cols = ['#ff6fa5', '#ffd35a', '#7ad7ff', '#c38bff', '#ff8a5a', '#9dff8a', '#ffffff', '#ff4d6d'];
    let s = 7;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const spots = [[0, 0, 26, 160], [45, 10, 8, 30], [-40, -35, 10, 25], [80, 40, 10, 20], [-130, 5, 12, 20], [10, 125, 12, 20], [56, 26, 9, 8]];
    let k = 0;
    for (const [cx, cz, rad, n] of spots) for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const msg = r() < 0.2 ? ['Coucou !', 'Pour toi ✨', 'Le jardin est magnifique', 'Première fleur !'][Math.floor(r() * 4)] : undefined;
      added('demo' + (k++), { uid: 'x', name: names[Math.floor(r() * names.length)], x, z, color: cols[Math.floor(r() * cols.length)], ts: Date.now() - r() * 3e9, seed: Math.floor(r() * 1e9), biome: biomeOf(x, z), msg });
    }
  }
  onTrees({ added }) {
    this._t = added;
    const spots = [[-12, 14], [18, -22], [-24, 6], [40, 30], [-55, -30], [70, -50], [85, 60], [-80, 70], [120, 40], [-130, -10], [-140, 30], [0, 130], [20, -140]];
    spots.forEach(([x, z], i) => added('tree' + i, { uid: 'x', name: ['Alexis', 'Hormun', 'Maria'][i % 3], x, z, color: ['#ff8fc4', '#ffd35a', '#7ad7ff', '#c38bff'][i % 4], ts: Date.now() - (i === 1 ? 2e7 : i === 2 ? 9e7 : 3e8), seed: 1000 + i * 77, biome: biomeOf(x, z) }));
  }
  async plantFlower(p) { this._g?.('mine' + Date.now(), { ...p, uid: this.uid, ts: Date.now(), seed: Math.floor(Math.random() * 1e9) }); }
  async treeWait() { return { remain: 0, now: Date.now() }; }
  async plantTree(p) { this._t?.('minetree' + Date.now(), { ...p, uid: this.uid, ts: Date.now() - 1e8, seed: Math.floor(Math.random() * 1e9), biome: biomeOf(p.x, p.z) }); return { ok: true }; }
  onChat(cb) { this._chat = cb; cb({ name: 'Maria', text: 'Bienvenue dans la V2 du jardin ! 🌸', ts: Date.now() }); }
  sendChat(name, text) { this._chat?.({ name, text, ts: Date.now() }); }
  onSpells(cb) { this._spell = cb; }
  castSpell(x, z, color) { this._spell?.({ uid: this.uid, x, z, color, ts: Date.now() }); }
  onCreatures(cb) { cb('c1', { type: 'butterfly', color: '#ffd35a', x0: 4, y0: 2, z0: 4, seed: 12, ts: Date.now() - 5000 }); cb('c2', { type: 'spirit', color: '#7ad7ff', x0: -4, y0: 2, z0: 2, seed: 99, ts: Date.now() - 9000 }); }
}
