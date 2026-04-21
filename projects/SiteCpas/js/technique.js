// ═══════════════════════════════════════════════════════════════════
// technique.js — Dashboard Espace Responsable technique
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Firebase déjà init par js/config.js ? Non — on init ici comme superadmin.html
  if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE);

  // Guard session : si pas authentifié, auth.js a déjà redirigé vers index.html.
  // Ici on assume qu'on est connecté. On attend juste que DB ait chargé la config
  // avant de vérifier la permission.

  const loadingEl  = document.getElementById('tqLoading');
  const refusedEl  = document.getElementById('tqRefused');
  const headerEl   = document.getElementById('tqHeader');
  const bodyEl     = document.getElementById('tqBody');
  const gridEl     = document.getElementById('tqGrid');
  const agentBadge = document.getElementById('tqAgentBadge');
  const orgNameEl  = document.getElementById('tqOrgName');

  const TECH = {
    _period: 30,
    _status: 'all',
    _search: '',
    _allRequests: {},  // snapshot reçu de DB
    _allThemes:   [],  // snapshot thèmes

    init() {
      // Charger la config Firebase (agents, thèmes, lieux, rôles, perms…)
      DB.initConfig();
      DB.listenRequests();

      let _guardDone = false;
      DB.onConfigChange(() => {
        if (_guardDone) {
          this._refreshThemes();
          this.render();
          return;
        }
        this._guard();
        _guardDone = true;
      });
      DB.onRequestChange(reqs => {
        this._allRequests = reqs;
        if (_guardDone && bodyEl.style.display !== 'none') this.render();
      });
    },

    _guard() {
      const agentKey = sessionStorage.getItem('cpas_current_agent_key');
      loadingEl.style.display = 'none';
      if (!agentKey) {
        refusedEl.style.display = 'block';
        return;
      }
      const hasPerm = DB.hasPermission?.('viewTechAnalytics');
      if (!hasPerm) {
        refusedEl.style.display = 'block';
        return;
      }
      // OK : afficher l'app
      headerEl.style.display = 'flex';
      bodyEl.style.display   = 'flex';
      const agentName = DB.getAgentsWithKeys().find(a => a.key === agentKey)?.name || 'Agent';
      agentBadge.textContent = '👤 ' + agentName;
      orgNameEl.textContent  = ORG_ID || '—';
      this._refreshThemes();
      this._bindFilters();
      // Lancer le scheduler aussi depuis ici (throttle 5min garantit pas de doublon avec app.html)
      DB.runRecurringRequestsScheduler?.().catch(e => console.warn('[recurring scheduler]', e));
      this.render();
    },

    _refreshThemes() {
      this._allThemes = DB.getTechThemes?.() || [];
    },

    _bindFilters() {
      document.getElementById('tqPeriodFilter')?.querySelectorAll('.tq-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#tqPeriodFilter .tq-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._period = btn.dataset.period === 'all' ? 'all' : parseInt(btn.dataset.period, 10);
          this.render();
        });
      });
      document.getElementById('tqStatusFilter')?.querySelectorAll('.tq-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#tqStatusFilter .tq-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._status = btn.dataset.status;
          this.render();
        });
      });
      const searchEl = document.getElementById('tqSearch');
      let searchT;
      searchEl?.addEventListener('input', () => {
        clearTimeout(searchT);
        searchT = setTimeout(() => {
          this._search = searchEl.value.trim().toLowerCase();
          this.render();
        }, 250);
      });
      document.getElementById('tqExportBtn')?.addEventListener('click', () => this.exportCSV());
    },

    // Filtre de base : période + statut + recherche textuelle
    _filtered() {
      const now = Date.now();
      const periodMs = this._period === 'all' ? Infinity : this._period * 24 * 3600 * 1000;
      const cutoff = this._period === 'all' ? 0 : now - periodMs;
      const q = this._search;
      const reqs = this._allRequests || {};
      return Object.entries(reqs)
        .map(([id, r]) => ({ id, ...r }))
        .filter(r => {
          if (r.createdAt < cutoff) return false;
          if (this._status !== 'all' && r.status !== this._status) return false;
          if (!q) return true;
          const hay = [
            r.description || '',
            r.local || '',
            r.fromAgentName || '',
            r.assignedToName || '',
            DB.getTechThemeLabel?.(r.themeId) || '',
          ].join(' ').toLowerCase();
          return hay.includes(q);
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },

    // ── Rendu ─────────────────────────────────────────────────────
    render() {
      if (!gridEl) return;
      const reqs = this._filtered();
      const total = reqs.length;
      const openCount = reqs.filter(r => r.status === 'open').length;
      const doneReqs  = reqs.filter(r => r.status === 'done' && r.createdAt);
      // Temps moyen de résolution : pas de doneAt actuellement → approximation
      // via diff entre createdAt et dernier comment ou fallback indisponible.
      // Pour Phase F : "—" en attendant meilleure source.
      const avgResolution = '—';

      // Top thème
      const themeCounts = {};
      reqs.forEach(r => {
        const k = r.themeId || '__none__';
        themeCounts[k] = (themeCounts[k] || 0) + 1;
      });
      const topThemeEntry = Object.entries(themeCounts).sort((a, b) => b[1] - a[1])[0];
      const topThemeLabel = topThemeEntry
        ? (DB.getTechThemeLabel(topThemeEntry[0] === '__none__' ? null : topThemeEntry[0]))
        : '—';

      // Widget helpers
      const kpi = (icon, value, label) => `
        <div class="tq-widget">
          <div class="tq-widget-title">${icon} ${label}</div>
          <div class="tq-kpi-value">${value}</div>
          <div class="tq-kpi-label">${label}</div>
        </div>`;

      gridEl.innerHTML = `
        ${kpi('🎫', total, 'Total requêtes')}
        ${kpi('🟠', openCount, 'Ouvertes')}
        ${kpi('⏱️', avgResolution, 'Résolution moyenne')}
        ${kpi('🔥', `<span style="font-size:1rem">${topThemeLabel}</span>`, 'Top thème')}

        <div class="tq-widget w-large">
          <div class="tq-widget-title">📊 Plus de widgets arrivent…</div>
          <div class="tq-widget-body">
            <p class="tq-placeholder">Les widgets suivants seront implémentés dans la prochaine phase :
              graphe temporel, répartition par thème, top locaux, charge par agent, requêtes en retard,
              heatmap thème × local, timeline récente, requêtes récurrentes actives.
            </p>
            <p style="font-size:.8rem;color:#64748b;margin-top:.75rem">
              Filtre actuel : <b>${this._period === 'all' ? 'toutes périodes' : `${this._period} derniers jours`}</b>,
              statut <b>${this._status}</b>${this._search ? `, recherche "${this._search}"` : ''}.
              <br>${total} requête(s) correspondent.
            </p>
          </div>
        </div>
      `;
    },

    // ── Export CSV ────────────────────────────────────────────────
    exportCSV() {
      const reqs = this._filtered();
      if (!reqs.length) { alert('Aucune requête à exporter avec ces filtres.'); return; }
      const rows = [['id', 'createdAt', 'theme', 'type', 'status', 'local', 'description', 'agent_requester', 'agent_assigned', 'urgent', 'recurrence']];
      reqs.forEach(r => {
        const rec = r.recurrence;
        const recStr = rec
          ? (rec.templateId === r.id ? `template ${rec.interval}/${rec.unit}` : 'occurrence')
          : '';
        rows.push([
          r.id,
          new Date(r.createdAt).toISOString(),
          DB.getTechThemeLabel(r.themeId) || '',
          r.type || '',
          r.status || '',
          r.local || '',
          (r.description || '').replace(/\n/g, ' '),
          r.fromAgentName || '',
          r.assignedToName || '',
          r.urgent ? 'oui' : '',
          recStr,
        ]);
      });
      const csv = '\ufeff' + rows.map(row => row.map(cell => {
        const s = String(cell);
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(';')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `requetes_techniques_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  };

  // Expose globalement pour debug console
  window.TECH = TECH;

  // Bootstrap
  document.addEventListener('DOMContentLoaded', () => TECH.init());
})();
