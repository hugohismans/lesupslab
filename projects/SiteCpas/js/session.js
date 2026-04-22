// ═══════════════════════════════════════════════════════════════════
// session.js — Phase 0.5 validateSession() côté client
//
// Re-vérifie périodiquement que la session agent reste légitime :
//  1. L'agent existe toujours dans appConfig/agents/{key}
//  2. L'agent a toujours un mot de passe défini dans appConfig/agentPasswords/{key}
//  3. Le tempAdminGrant n'est pas expiré (sinon auto-révocation Firebase)
//
// Si invalide : clear sessionStorage + AUDIT log + redirect index.html.
//
// Checks déclenchés :
//   - setInterval toutes les VALIDATE_INTERVAL_MS (60 s)
//   - visibilitychange → check immédiat quand l'onglet reprend le focus
//
// Ne protège pas contre un attaquant qui a déjà détourné sessionStorage
// (il peut désactiver l'interval). Le vrai gardien reste les Rules
// Firebase (Phase 0.3). But ici : couper une session légitime quand
// l'admin change les droits côté config.
// ═══════════════════════════════════════════════════════════════════

const SESSION = {
  VALIDATE_INTERVAL_MS: 60 * 1000,
  _timer: null,
  _inflight: false,

  init() {
    // Pas de validation si pas connecté
    if (!this._agentKey()) return;

    // Check initial rapide (après que DB soit prête)
    if (typeof DB !== 'undefined' && DB._authReady) {
      DB._authReady.finally(() => this.validate());
    } else {
      setTimeout(() => this.validate(), 2000);
    }

    // Interval régulier
    this._timer = setInterval(() => this.validate(), this.VALIDATE_INTERVAL_MS);

    // Re-check quand l'onglet reprend le focus (l'utilisateur revient après un moment)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.validate();
    });
  },

  _agentKey() {
    try { return sessionStorage.getItem('cpas_current_agent_key') || null; }
    catch (e) { return null; }
  },

  // Révoque le grant Firebase s'il est expiré. Non-bloquant, idempotent.
  // Chaque onglet le tente — seul le premier gagne (race OK, result identique).
  async checkGrantExpiration() {
    try {
      if (typeof DB === 'undefined') return;
      if (!DB.isTempAdminGrantExpired?.()) return;
      console.log('[session] grant temporaire admin expiré → révocation Firebase');
      await DB.revokeTempAdminGrant();
      if (typeof AUDIT !== 'undefined') AUDIT.log('admin.grant.autoRevoke', { reason: 'endOfDay' });
    } catch (e) {
      console.warn('[session] grant revoke failed', e?.message || e);
    }
  },

  async validate() {
    if (this._inflight) return;
    this._inflight = true;
    try {
      const key = this._agentKey();
      if (!key) return; // logged out entre-temps

      // 1. Auto-révocation du grant expiré (indépendant de la session)
      await this.checkGrantExpiration();

      // 2. Vérifs de session agent
      if (typeof DB === 'undefined' || !DB._db) return;
      if (DB._authReady) await DB._authReady;

      const [agentSnap, pwdSnap] = await Promise.all([
        DB._ref(`appConfig/agents/${key}`).once('value'),
        DB._ref(`appConfig/agentPasswords/${key}`).once('value'),
      ]);

      const agentExists = agentSnap.exists() && !!agentSnap.val();
      const pwdExists   = pwdSnap.exists();

      if (!agentExists) return this._invalidate('agent_deleted');
      if (!pwdExists)   return this._invalidate('pwd_reset');
    } catch (e) {
      // Erreur réseau / Firebase — ne pas invalider par erreur, on réessaiera
      console.warn('[session] validate failed (ignoré)', e?.message || e);
    } finally {
      this._inflight = false;
    }
  },

  _invalidate(reason) {
    const key = this._agentKey();
    console.warn('[session] session invalidée', reason, 'agentKey=', key);
    if (typeof AUDIT !== 'undefined') {
      AUDIT.log('agent.session.invalidated', { agentKey: key, reason });
    }
    try {
      sessionStorage.removeItem('cpas_current_agent_key');
      sessionStorage.removeItem('cpas_auth_v1');
    } catch (e) { /* ignore */ }
    if (this._timer) { clearInterval(this._timer); this._timer = null; }

    // Redirect vers la page de login en conservant l'org (query ?org=)
    const url = new URL('index.html', location.href);
    const orgParam = new URLSearchParams(location.search).get('org');
    if (orgParam) url.searchParams.set('org', orgParam);
    url.searchParams.set('reason', reason);
    location.replace(url.toString());
  },
};

// Auto-init quand le DOM est prêt
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SESSION.init());
} else {
  SESSION.init();
}
