// ═══════════════════════════════════════════════════════════════════
// worker-client.js — client HTTP minimal pour le Worker Cloudflare
// Centralise URL + fetch + timeout + gestion d'erreurs.
// ═══════════════════════════════════════════════════════════════════

const WORKER = {
  _base() {
    const u = (typeof CONFIG !== 'undefined' && CONFIG.WORKER_URL) || '';
    return u.replace(/\/$/, '');
  },

  // Timeout 8s par défaut. Retourne la réponse parsée (JSON) ou throw.
  async _fetch(path, { method = 'GET', body = null, timeoutMs = 8000 } = {}) {
    const base = this._base();
    if (!base) throw new Error('WORKER_URL not configured');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(base + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body:    body ? JSON.stringify(body) : undefined,
        signal:  ctrl.signal,
      });
      const ct = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : await r.text();
      if (!r.ok) {
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

  // ── Endpoints ──────────────────────────────────────────────────
  async ping() { return this._fetch('/ping'); },

  // Phase 2a : login nominatif via Worker.
  // Retourne { customToken, agentKey, orgId, role }.
  async authLogin({ orgId, agentKey, password }) {
    return this._fetch('/auth/login', {
      method: 'POST',
      body:   { orgId, agentKey, password },
    });
  },
};
