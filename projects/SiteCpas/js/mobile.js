// ═══════════════════════════════════════════════════════════════════
// mobile.js — Vue mobile pour agent terrain
// Affiche les requêtes pertinentes (mes tâches, ouvertes, toutes) avec
// gros boutons tap-friendly. Réutilise REQUESTS._handleAction et NOTIF.
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE);

  const loadingEl = document.getElementById('mbLoading');
  const refusedEl = document.getElementById('mbRefused');
  const headerEl  = document.getElementById('mbHeader');
  const bodyEl    = document.getElementById('mbBody');
  const listEl    = document.getElementById('mbList');
  const toastEl   = document.getElementById('mbToast');
  const nameEl    = document.getElementById('mbAgentName');

  function showToast(msg, err = false) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!err);
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  const MOBILE = {
    _filter: 'mine',           // 'mine' | 'open' | 'all'
    _allRequests: {},
    _agentKey: null,
    _agentName: null,
    _guardDone: false,

    init() {
      DB.init();
      DB.initConfig();
      DB.listenRequests();

      DB.onConfigChange(() => {
        if (!this._guardDone) { this._guard(); this._guardDone = true; }
        this._render();
      });
      DB.onRequestChange((reqs) => {
        this._allRequests = reqs || {};
        if (this._guardDone) this._render();
      });

      this._bindTabs();
    },

    _guard() {
      const agentKey = sessionStorage.getItem('cpas_current_agent_key');
      loadingEl.style.display = 'none';
      if (!agentKey) {
        refusedEl.style.display = 'block';
        return;
      }
      this._agentKey  = agentKey;
      this._agentName = DB.getAgentsWithKeys().find(a => a.key === agentKey)?.name || 'Agent';
      headerEl.style.display = 'flex';
      bodyEl.style.display   = 'block';
      if (nameEl) nameEl.textContent = this._agentName;

      // NOTIF (cloche) — réutilise les ids notifBell/notifBadge/notifPanel
      if (typeof NOTIF !== 'undefined' && NOTIF.init) {
        try { NOTIF.init(); } catch (e) { console.warn('[MOBILE] NOTIF init failed', e); }
      }
    },

    _bindTabs() {
      document.querySelectorAll('.mb-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.mb-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._filter = btn.dataset.filter;
          this._render();
        });
      });
    },

    _filtered() {
      const reqs = this._allRequests || {};
      const myKey = this._agentKey;
      const now = Date.now();
      const entries = Object.entries(reqs)
        .map(([id, r]) => ({ id, ...r }))
        .filter(r => r.createdAt <= now)         // exclut templates programmés
        .filter(r => r.status !== 'done')        // par défaut, on cache les terminées
        .filter(r => {
          if (this._filter === 'mine') return r.assignedTo === myKey;
          if (this._filter === 'open') return r.status === 'open';
          return true; // 'all'
        });
      const urg = (r) => {
        const l = parseInt(r?.urgencyLevel);
        if (l >= 1 && l <= 5) return l;
        return r?.urgent ? 5 : 3;
      };
      // Tri : urgence desc, puis createdAt desc
      entries.sort((a, b) => (urg(b) - urg(a)) || ((b.createdAt || 0) - (a.createdAt || 0)));
      return entries;
    },

    _render() {
      if (!listEl) return;
      const reqs = this._filtered();
      if (!reqs.length) {
        const msg = this._filter === 'mine'
          ? 'Aucune tâche assignée pour le moment 🎉'
          : 'Aucune requête ne correspond à ce filtre.';
        listEl.innerHTML = `<div class="mb-empty">${msg}</div>`;
        return;
      }

      const TYPE_ICONS  = { technique: '🔧', entretien: '🧹', autre: '📋' };
      const STATUS_TXT  = { open: '🟡 Ouverte', in_progress: '🔵 En cours', postponed: '⏸ Reportée', done: '✅ Terminée' };

      const urg = (r) => {
        const l = parseInt(r?.urgencyLevel);
        if (l >= 1 && l <= 5) return l;
        return r?.urgent ? 5 : 3;
      };

      listEl.innerHTML = reqs.map(r => {
        const u = urg(r);
        const icon = TYPE_ICONS[r.type] || '📋';
        const localTxt = r.local ? `📍 <b>${escapeHtml(r.local)}</b>` : '';
        const fromTxt  = r.fromAgentName ? `par <b>${escapeHtml(r.fromAgentName)}</b>` : '';
        const dt = new Date(r.createdAt).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' });

        // Boutons selon statut + qui je suis
        let actionsHtml = '';
        let cls = 'one';
        const mine = r.assignedTo === this._agentKey;
        if (r.status === 'open') {
          actionsHtml = `<button class="mb-btn mb-btn-claim" data-action="claim" data-id="${escapeHtml(r.id)}">🙋 Prends en charge</button>`;
        } else if (r.status === 'in_progress' && mine) {
          cls = 'two';
          actionsHtml = `
            <button class="mb-btn mb-btn-done" data-action="done" data-id="${escapeHtml(r.id)}">✓ Terminé</button>
            <button class="mb-btn mb-btn-postpone" data-action="postponed" data-id="${escapeHtml(r.id)}">⏸ Reporter</button>
          `;
        } else if (r.status === 'in_progress' && !mine) {
          // Pas mien — info seule
          actionsHtml = `<div style="text-align:center;color:#94a3b8;font-size:.82rem;font-style:italic">Pris par ${escapeHtml(r.assignedToName || '?')}</div>`;
        } else if (r.status === 'postponed') {
          actionsHtml = `<button class="mb-btn mb-btn-reopen" data-action="open" data-id="${escapeHtml(r.id)}">🔄 Rouvrir</button>`;
        }

        return `<div class="mb-card" data-id="${escapeHtml(r.id)}">
          <div class="mb-card-hd">
            <span class="mb-urg-badge mb-urg-${u}">${u}</span>
            <span class="mb-card-type">${icon} ${escapeHtml(r.type || 'autre')}</span>
            <span class="mb-card-status" data-st="${r.status}">${STATUS_TXT[r.status] || ''}</span>
          </div>
          <div class="mb-card-desc">${escapeHtml(r.description || '')}</div>
          <div class="mb-card-meta">
            ${localTxt ? `<span>${localTxt}</span>` : ''}
            ${fromTxt  ? `<span>${fromTxt}</span>` : ''}
            <span>📅 ${dt}</span>
          </div>
          <div class="mb-card-actions ${cls}">${actionsHtml}</div>
        </div>`;
      }).join('');

      // Wire les boutons via REQUESTS._handleAction
      if (typeof REQUESTS !== 'undefined') {
        if (!REQUESTS._agentKey)  REQUESTS._agentKey  = this._agentKey;
        if (!REQUESTS._agentName) REQUESTS._agentName = this._agentName;
      }
      const agents = DB.getAgentsWithKeys?.() || [];
      listEl.querySelectorAll('.mb-btn[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const { action, id } = btn.dataset;
          btn.disabled = true;
          try {
            await REQUESTS._handleAction?.(action, id, null, agents);
            const labels = { claim: 'Pris en charge', done: 'Terminé', postponed: 'Reporté', open: 'Rouverte' };
            showToast('✓ ' + (labels[action] || 'OK'));
          } catch (err) {
            console.warn('[MOBILE] action failed', err);
            showToast('Erreur : ' + (err?.message || err), true);
          }
          btn.disabled = false;
        });
      });
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MOBILE.init());
  } else {
    MOBILE.init();
  }

  window.MOBILE = MOBILE;
})();
