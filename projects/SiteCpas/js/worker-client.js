// ═══════════════════════════════════════════════════════════════════
// worker-client.js — client HTTP minimal pour le Worker Cloudflare
// Centralise URL + fetch + timeout + gestion d'erreurs.
// ═══════════════════════════════════════════════════════════════════

const WORKER = {
  _base() {
    const u = (typeof CONFIG !== 'undefined' && CONFIG.WORKER_URL) || '';
    return u.replace(/\/$/, '');
  },

  // Récupère l'ID Token Firebase de l'utilisateur courant (customToken
  // signé côté client via signInWithCustomToken Phase 2). Null si non
  // authentifié. Forcé à refresh si nécessaire via forceRefresh.
  async _getIdToken(forceRefresh = false) {
    try {
      if (!window.firebase || !firebase.auth) return null;
      const u = firebase.auth().currentUser;
      if (!u) return null;
      return await u.getIdToken(forceRefresh);
    } catch (e) {
      console.warn('[worker] getIdToken failed', e?.message || e);
      return null;
    }
  },

  // Timeout 12s par défaut pour les CRUD (Firebase REST peut être lent).
  async _fetch(path, { method = 'GET', body = null, authed = false, timeoutMs = 12000, retriedAuth = false } = {}) {
    const base = this._base();
    if (!base) throw new Error('WORKER_URL not configured');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers = body ? { 'Content-Type': 'application/json' } : {};
      if (authed) {
        const tok = await this._getIdToken();
        if (!tok) {
          const err = new Error('no_auth_token');
          err.status = 401;
          throw err;
        }
        headers['Authorization'] = `Bearer ${tok}`;
      }
      const r = await fetch(base + path, {
        method,
        headers,
        body:    body ? JSON.stringify(body) : undefined,
        signal:  ctrl.signal,
      });
      const ct = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : await r.text();
      if (!r.ok) {
        // Si 401 et qu'on a déjà un token, tenter un refresh une seule fois
        if (r.status === 401 && authed && !retriedAuth) {
          await this._getIdToken(true);
          return this._fetch(path, { method, body, authed, timeoutMs, retriedAuth: true });
        }
        const err = new Error((data && data.error) || `HTTP ${r.status}`);
        err.status = r.status;
        err.body   = data;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(t);
    }
  },

  // ── Endpoints publics ──────────────────────────────────────────
  async ping() { return this._fetch('/ping'); },

  // Phase 2a : login nominatif via Worker.
  async authLogin({ orgId, agentKey, password }) {
    return this._fetch('/auth/login', {
      method: 'POST',
      body:   { orgId, agentKey, password },
    });
  },

  // Phase 3 : création du premier mdp (ou après reset admin).
  // Retourne { ok: true, wasFirstAdmin: bool } ou 403 password_already_set.
  async authSetPassword({ orgId, agentKey, password }) {
    return this._fetch('/auth/set-password', {
      method: 'POST',
      body:   { orgId, agentKey, password },
    });
  },

  // ── Endpoints authentifiés (Phase 3) ───────────────────────────

  // Écriture CRUD générique. op = 'set'|'update'|'push'|'remove'.
  // path = chemin relatif à orgs/{orgId}/ (sans préfixe).
  // Retourne le JSON Worker { ok, result? }.
  async write(op, path, value) {
    return this._fetch('/data/write', {
      method: 'POST',
      authed: true,
      body:   { op, path, value },
    });
  },

  // Déchiffrement batch d'une liste de paths.
  // Retourne { [path]: plaintext | null }.
  async decryptBatch(paths) {
    const r = await this._fetch('/data/decrypt', {
      method: 'POST',
      authed: true,
      body:   { paths },
    });
    return r?.results || {};
  },
};
