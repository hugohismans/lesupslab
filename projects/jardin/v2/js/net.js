// Connexion Firebase : MÊME base et MÊMES chemins/format que la V1
// (/presence, /garden, /trees, /chat/global, /events/spells, /creatures, /meta/lastTree).
// La V2 ajoute seulement deux champs facultatifs à /presence : avatar et ry (orientation).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider, onTokenChanged } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app-check.js';
import { getAuth, onAuthStateChanged, signInAnonymously, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import {
  getDatabase, ref, set, update, onValue, onDisconnect, push, query, limitToLast,
  onChildAdded, onChildChanged, onChildRemoved, serverTimestamp, get,
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBUiGGKBssQ_wTrz5uYBkHRKeMk0GNWeFI',
  authDomain: 'jardin-feerique.firebaseapp.com',
  databaseURL: 'https://jardin-feerique-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'jardin-feerique',
  storageBucket: 'jardin-feerique.firebasestorage.app',
  messagingSenderId: '240867851823',
  appId: '1:240867851823:web:43529ae5008fe9dcd910da',
  measurementId: 'G-YCZ4XC9PQ1',
};
export const TREE_COOLDOWN_MS = 172800000; // 2 jours, comme la V1

export class Net {
  constructor() {
    this.app = initializeApp(firebaseConfig);
    this.appCheck = initializeAppCheck(this.app, { provider: new ReCaptchaV3Provider('6LcI9LMrAAAAAF6biBHZG20s55PAE24lsPyAwSwZ'), isTokenAutoRefreshEnabled: true });
    this.auth = getAuth(this.app);
    this.db = getDatabase(this.app);
    this.uid = null; this.meRef = null;
    this.extraOk = true;   // false si les règles refusent avatar/ry
    this.ready = new Promise((res) => { this._ready = res; });
    // État de la connexion, affiché dans le menu pour diagnostiquer un souci
    this.status = { connected: false, appCheck: null, auth: null, read: null, data: false };
    this.onStatus = null;
    onTokenChanged(this.appCheck, () => this.setStatus({ appCheck: 'ok' }), (e) => this.setStatus({ appCheck: e?.code || 'erreur' }));
    onValue(ref(this.db, '.info/connected'), (s) => this.setStatus({ connected: !!s.val() }));
    this.serverOffset = 0;   // décalage d'horloge avec le serveur (pour synchroniser le cache-cache)
    onValue(ref(this.db, '.info/serverTimeOffset'), (s) => { this.serverOffset = s.val() || 0; });
  }
  setStatus(p) { Object.assign(this.status, p); this.onStatus?.(this.status); }

  async init() {
    try { await setPersistence(this.auth, browserLocalPersistence); } catch { await setPersistence(this.auth, browserSessionPersistence); }
    onAuthStateChanged(this.auth, (u) => { if (u) { this.uid = u.uid; this.setStatus({ auth: 'ok' }); this._ready(u.uid); } });
    // on attend que la session enregistrée soit relue avant d'en créer une nouvelle
    try { await this.auth.authStateReady(); } catch { /* ignore */ }
    if (!this.auth.currentUser) {
      try { await signInAnonymously(this.auth); } catch (e) { this.setStatus({ auth: e?.code || 'erreur' }); throw e; }
    }
    return this.ready;
  }

  async serverNow() {
    try { const s = await get(ref(this.db, '.info/serverTimeOffset')); return Date.now() + (s.val() || 0); } catch { return Date.now(); }
  }

  // --- Présence ---
  async enter({ name, color, avatar }) {
    await this.ready;
    this.meRef = ref(this.db, `/presence/${this.uid}`);
    const base = { name, color, x: 0, z: 0, last: Date.now() };
    try { await set(this.meRef, { ...base, avatar, ry: 0 }); }
    catch (e) {
      console.warn('[presence] champs V2 refusés, repli sur le format V1', e?.code);
      this.extraOk = false; await set(this.meRef, base);
    }
    onDisconnect(this.meRef).remove();
  }
  pose(x, z, ry) {
    if (!this.meRef) return;
    const p = { x: +x.toFixed(2), z: +z.toFixed(2), last: Date.now() };
    if (this.extraOk) p.ry = +ry.toFixed(2);
    update(this.meRef, p).catch(() => {});
  }
  profile(fields) {
    if (!this.meRef) return;
    const f = { ...fields }; if (!this.extraOk) delete f.avatar;
    update(this.meRef, f).catch(() => {});
  }
  // Abonnement robuste : on attend la connexion (sinon les règles refusent la lecture
  // et Firebase coupe l'écoute sans rien dire), puis on se réabonne si la base refuse.
  listen(attach) {
    const go = async (attempt) => {
      // on attend la connexion, mais pas plus de 5 s (si la lecture est publique, ça suffit)
      await Promise.race([this.ready, new Promise(r => setTimeout(r, 5000))]);
      let unsub = null;
      unsub = attach((err) => {
        console.warn('[firebase] lecture refusée', err?.code || err);
        this.setStatus({ read: err?.code || String(err) });
        unsub?.();
        this.onTrouble?.(err);
        setTimeout(() => go(attempt + 1), Math.min(30000, 2000 * (attempt + 1)));
      });
    };
    go(0);
  }

  // état de partie de cache-cache, rangé dans sa propre présence (null = aucune partie)
  setGame(hs) {
    if (!this.meRef || !this.extraOk) return;
    update(this.meRef, { hs: hs || null }).catch((e) => console.warn('[cache-cache]', e?.code));
  }

  onPresence(cb) { this.listen((fail) => onValue(ref(this.db, '/presence'), (s) => cb(s.val() || {}), fail)); }

  // --- Jardin ---
  onGarden({ added, changed, removed }) {
    const r = ref(this.db, '/garden');
    this.listen((fail) => onChildAdded(query(r, limitToLast(2000)), (s) => s.val() && added(s.key, s.val()), fail));
    this.listen((fail) => onChildChanged(r, (s) => s.val() && changed(s.key, s.val()), fail));
    this.listen((fail) => onChildRemoved(r, (s) => removed(s.key), fail));
  }
  onTrees({ added, removed }) {
    const r = ref(this.db, '/trees');
    this.listen((fail) => onChildAdded(query(r, limitToLast(1000)), (s) => s.val() && added(s.key, s.val()), fail));
    this.listen((fail) => onChildRemoved(r, (s) => removed(s.key), fail));
  }
  async plantFlower({ name, color, x, z, biome, msg }) {
    const payload = { uid: this.uid, name, x: +x.toFixed(2), z: +z.toFixed(2), color, ts: serverTimestamp(), seed: Math.floor(Math.random() * 1e9), biome };
    if (msg && msg.trim()) payload.msg = msg.trim().slice(0, 140);
    await push(ref(this.db, '/garden'), payload);
  }
  async treeWait() {
    const now = await this.serverNow();
    const last = (await get(ref(this.db, `/meta/lastTree/${this.uid}`))).val() || 0;
    return { remain: TREE_COOLDOWN_MS - (now - last), now };
  }
  async plantTree({ name, color, x, z }) {
    const { remain, now } = await this.treeWait();
    if (remain > 0) return { ok: false, remain };
    const id = push(ref(this.db, '/trees')).key;
    const tree = { uid: this.uid, name, x: +x.toFixed(2), z: +z.toFixed(2), color, ts: now, seed: Math.floor(Math.random() * 1e9) };
    await update(ref(this.db), { [`/trees/${id}`]: tree, [`/meta/lastTree/${this.uid}`]: now });
    return { ok: true };
  }

  // --- Chat / sorts / créatures ---
  onChat(cb) { this.listen((fail) => onChildAdded(query(ref(this.db, '/chat/global'), limitToLast(50)), (s) => s.val() && cb(s.val(), s.key), fail)); }
  sendChat(name, text) { return push(ref(this.db, '/chat/global'), { name, text, ts: Date.now() }); }
  onSpells(cb) { this.listen((fail) => onChildAdded(query(ref(this.db, '/events/spells'), limitToLast(40)), (s) => s.val() && cb(s.val(), s.key), fail)); }
  castSpell(x, z, color) { return push(ref(this.db, '/events/spells'), { uid: this.uid, x: +x.toFixed(2), z: +z.toFixed(2), color, ts: Date.now() }); }
  onCreatures(cb) { this.listen((fail) => onChildAdded(query(ref(this.db, '/creatures'), limitToLast(200)), (s) => s.val() && cb(s.key, s.val()), fail)); }
}
