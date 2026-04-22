// ═══════════════════════════════════════════════════════════════════
// audit.js — Phase 0.4 audit log minimal
// Autonome : utilise firebase.database() directement pour pouvoir
// être chargé depuis index.html (login) ou superadmin.html sans
// dépendre de DB.init().
// Schéma : /orgs/{orgId}/audit/{autoId} = { ts, action, actor, details }
// ═══════════════════════════════════════════════════════════════════

const AUDIT = {
  _db: null,
  _authReady: null,

  _getDb() {
    if (this._db) return this._db;
    if (!window.firebase || !firebase.database) return null;
    if (!firebase.apps.length) {
      if (typeof CONFIG !== 'undefined' && CONFIG.FIREBASE) firebase.initializeApp(CONFIG.FIREBASE);
      else return null;
    }
    this._db = firebase.database();
    return this._db;
  },

  _getAuthReady() {
    // Réutilise DB._authReady si DB est présent (app.html, technique.html).
    if (typeof DB !== 'undefined' && DB._authReady) return DB._authReady;
    if (this._authReady) return this._authReady;
    if (window.firebase && firebase.auth) {
      this._authReady = firebase.auth().signInAnonymously()
        .then(() => {})
        .catch(err => console.warn('[audit] anonymous auth failed', err?.message || err));
    } else {
      this._authReady = Promise.resolve();
    }
    return this._authReady;
  },

  _orgId() {
    if (typeof ORG_ID !== 'undefined' && ORG_ID) return ORG_ID;
    return 'cpas-quaregnon'; // fallback dev
  },

  _resolveActor() {
    const s = (typeof sessionStorage !== 'undefined') ? sessionStorage : null;
    if (!s) return 'anon';
    const agentKey = s.getItem('cpas_current_agent_key');
    if (agentKey) return `agent:${agentKey}`;
    if (s.getItem('sitecpas_superadmin') === '1') return 'superadmin';
    return 'anon';
  },

  // Non-bloquant. On n'attend pas la résolution pour ne pas ralentir
  // l'action qui a déclenché le log.
  log(action, details) {
    try {
      const db = this._getDb();
      if (!db) return;
      const payload = {
        ts: Date.now(),
        action: String(action || 'unknown'),
        actor: this._resolveActor(),
        details: details || null,
      };
      const ready = this._getAuthReady();
      ready.then(() => db.ref(`orgs/${this._orgId()}/audit`).push(payload))
        .catch(err => console.warn('[audit] log failed', action, err?.message || err));
    } catch (e) {
      console.warn('[audit] log threw', e);
    }
  },

  // Lecture paginée des N dernières entrées (utilisée par la vue Journal admin).
  async fetchRecent(limit = 200) {
    const db = this._getDb();
    if (!db) return [];
    await this._getAuthReady();
    const snap = await db.ref(`orgs/${this._orgId()}/audit`)
      .orderByChild('ts').limitToLast(limit).once('value');
    const val = snap.val() || {};
    return Object.entries(val)
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  },
};
