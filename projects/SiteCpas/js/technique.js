// ═══════════════════════════════════════════════════════════════════
// technique.js — Dashboard Espace Responsable technique
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Helpers HTML escape (locaux, db.js en a aussi mais pas exposé globalement sûrement)
  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

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
    _tab: 'dashboard',     // 'dashboard' | 'requests'
    _reqStatusFilter: 'open',
    _reqTypeFilter:   'all',
    _reqUrgFilter:    'all',

    init() {
      // Initialiser Firebase database + DB._db avant d'attaquer les listeners
      DB.init();
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
        if (_guardDone && bodyEl.style.display !== 'none') {
          if (this._tab === 'requests') this._renderRequestsPane();
          else this.render();
        }
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
      this._bindTabs();
      this._bindRequestsPaneFilters();
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
        this._renderSuggestions(searchEl.value);
      });
      searchEl?.addEventListener('focus', () => this._renderSuggestions(searchEl.value));
      searchEl?.addEventListener('blur', () => {
        // petite latence pour permettre le clic sur l'item
        setTimeout(() => document.getElementById('tqSuggest')?.classList.add('hidden'), 150);
      });
      searchEl?.addEventListener('keydown', e => this._handleSearchKeydown(e));
      document.getElementById('tqExportBtn')?.addEventListener('click', () => this.exportCSV());
    },

    _suggestHighlight: -1,

    _renderSuggestions(query) {
      const box = document.getElementById('tqSuggest');
      if (!box) return;
      const q = (query || '').toLowerCase().trim();
      this._suggestHighlight = -1;

      const reqs = Object.values(this._allRequests || {});

      // Collecter les candidats uniques et leur count (occurrences dans les requêtes)
      const countBy = (getter) => {
        const m = {};
        reqs.forEach(r => {
          const v = getter(r);
          if (v) m[v] = (m[v] || 0) + 1;
        });
        return m;
      };
      const locaux = countBy(r => r.local);
      const themes = countBy(r => r.themeId ? DB.getTechThemeLabel(r.themeId) : null);
      const agents = {};
      reqs.forEach(r => {
        if (r.fromAgentName)     agents[r.fromAgentName]     = (agents[r.fromAgentName]     || 0) + 1;
        if (r.assignedToName)    agents[r.assignedToName]    = (agents[r.assignedToName]    || 0) + 1;
      });

      // Mots-clés rapides
      const keywords = [
        { label: 'urgent',      matcher: r => r.urgent,                  icon: '🚨' },
        { label: 'récurrente',  matcher: r => r.recurrence,              icon: '↻' },
        { label: 'non catégorisé', matcher: r => !r.themeId,             icon: '🏷️' },
      ];

      const match = (label) => !q || label.toLowerCase().includes(q);

      const groups = [];
      const mkGroup = (title, entries, icon) => {
        if (!entries.length) return;
        groups.push({ title, entries: entries.slice(0, 8).map(([label, count]) => ({ label, count, icon })) });
      };

      // Lieux : comptage en agrégeant les requêtes dont le local appartient au lieu
      const lieuxObj = DB.getLieux?.() || {};
      const lieuCounts = [];
      Object.values(lieuxObj).forEach(lieu => {
        if (!lieu.name) return;
        const labels = (lieu.localIds || []).map(id => (DB.getLocalLabel(id) || '').toLowerCase());
        const count = reqs.filter(r => {
          if (!r.local) return false;
          const rl = r.local.toLowerCase();
          return labels.some(l => rl === l || rl.includes(l));
        }).length;
        if (count > 0 || match(lieu.name)) {
          lieuCounts.push([lieu.name, count]);
        }
      });

      mkGroup('Lieux',
        lieuCounts.filter(([l]) => match(l)).sort((a, b) => b[1] - a[1]),
        '🏢');
      mkGroup('Locaux',
        Object.entries(locaux).filter(([l]) => match(l)).sort((a, b) => b[1] - a[1]),
        '📍');
      mkGroup('Thèmes',
        Object.entries(themes).filter(([l]) => match(l)).sort((a, b) => b[1] - a[1]),
        '🏷️');
      mkGroup('Agents',
        Object.entries(agents).filter(([l]) => match(l)).sort((a, b) => b[1] - a[1]),
        '👤');

      // Mots-clés
      const keywordItems = keywords
        .filter(k => match(k.label))
        .map(k => ({ label: k.label, icon: k.icon, count: reqs.filter(k.matcher).length }))
        .filter(k => k.count > 0);
      if (keywordItems.length) groups.push({ title: 'Filtres rapides', entries: keywordItems });

      if (!groups.length) {
        box.innerHTML = `<div class="tq-suggest-empty">Tape un local, un thème, un agent ou un mot-clé…</div>`;
      } else {
        box.innerHTML = groups.map(g => `
          <div class="tq-suggest-group">${g.title}</div>
          ${g.entries.map(e => `
            <div class="tq-suggest-item" data-val="${e.label.replace(/"/g, '&quot;')}">
              <span class="tq-suggest-ico">${e.icon}</span>
              <span>${escapeHtml(e.label)}</span>
              <span class="tq-suggest-count">${e.count}</span>
            </div>`).join('')}
        `).join('');
      }
      box.classList.remove('hidden');
      box.querySelectorAll('.tq-suggest-item').forEach(it => {
        it.addEventListener('mousedown', ev => {
          ev.preventDefault();
          this._applySuggestion(it.dataset.val);
        });
      });
    },

    _applySuggestion(value) {
      const input = document.getElementById('tqSearch');
      if (input) input.value = value;
      this._search = value.toLowerCase();
      document.getElementById('tqSuggest')?.classList.add('hidden');
      this.render();
    },

    _handleSearchKeydown(e) {
      const box = document.getElementById('tqSuggest');
      const items = box?.querySelectorAll('.tq-suggest-item');
      if (!items?.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._suggestHighlight = Math.min(this._suggestHighlight + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('active', i === this._suggestHighlight));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._suggestHighlight = Math.max(this._suggestHighlight - 1, 0);
        items.forEach((el, i) => el.classList.toggle('active', i === this._suggestHighlight));
      } else if (e.key === 'Enter' && this._suggestHighlight >= 0) {
        e.preventDefault();
        this._applySuggestion(items[this._suggestHighlight].dataset.val);
      } else if (e.key === 'Escape') {
        box?.classList.add('hidden');
      }
    },

    // Filtre de base : période + statut + recherche textuelle (inclut lieux)
    _filtered() {
      const now = Date.now();
      const periodMs = this._period === 'all' ? Infinity : this._period * 24 * 3600 * 1000;
      const cutoff = this._period === 'all' ? 0 : now - periodMs;
      const q = this._search;
      const reqs = this._allRequests || {};

      // Si q matche un nom de lieu → on étend la recherche aux locaux de ce lieu.
      const lieuLocalLabels = [];
      if (q) {
        const lieux = DB.getLieux?.() || {};
        Object.values(lieux).forEach(lieu => {
          if (lieu.name && lieu.name.toLowerCase().includes(q)) {
            (lieu.localIds || []).forEach(id => {
              const lbl = DB.getLocalLabel(id);
              if (lbl) lieuLocalLabels.push(lbl.toLowerCase());
            });
          }
        });
      }

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
          if (hay.includes(q)) return true;
          // Match via lieu : si le local de la requête correspond à un local du lieu matché
          if (lieuLocalLabels.length && r.local) {
            const rLocal = r.local.toLowerCase();
            if (lieuLocalLabels.some(l => rLocal === l || rLocal.includes(l))) return true;
          }
          return false;
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },

    // ── Rendu ─────────────────────────────────────────────────────
    render() {
      if (!gridEl) return;
      const reqs = this._filtered();
      const total = reqs.length;
      const openCount       = reqs.filter(r => r.status === 'open').length;
      const inProgressCount = reqs.filter(r => r.status === 'in_progress').length;
      const doneCount       = reqs.filter(r => r.status === 'done').length;
      const postponedCount  = reqs.filter(r => r.status === 'postponed').length;

      // Temps moyen de résolution : approx via la diff entre createdAt et le dernier commentaire
      // (pas de doneAt stocké actuellement). Fallback "—" si pas de données.
      const resolutions = reqs
        .filter(r => r.status === 'done')
        .map(r => {
          const comments = r.comments ? Object.values(r.comments) : [];
          const lastTs = comments.length
            ? Math.max(...comments.map(c => c.createdAt || 0))
            : 0;
          return lastTs > r.createdAt ? lastTs - r.createdAt : 0;
        })
        .filter(ms => ms > 0);
      const avgMs = resolutions.length
        ? resolutions.reduce((a, b) => a + b, 0) / resolutions.length
        : 0;
      const avgResolution = avgMs > 0 ? this._formatDuration(avgMs) : '—';

      // ── Comptages utilitaires ─────────────────────────────────
      const themeCounts = {};
      reqs.forEach(r => {
        const k = r.themeId || '__none__';
        themeCounts[k] = (themeCounts[k] || 0) + 1;
      });
      const topThemeEntry = Object.entries(themeCounts).sort((a, b) => b[1] - a[1])[0];
      const topThemeLabel = topThemeEntry
        ? DB.getTechThemeLabel(topThemeEntry[0] === '__none__' ? null : topThemeEntry[0])
        : '—';

      const localCounts = {};
      reqs.forEach(r => {
        if (!r.local) return;
        localCounts[r.local] = (localCounts[r.local] || 0) + 1;
      });
      const topLocals = Object.entries(localCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

      const agentCounts = {};
      reqs.forEach(r => {
        if (!r.assignedToName) return;
        agentCounts[r.assignedToName] = (agentCounts[r.assignedToName] || 0) + 1;
      });
      const topAgents = Object.entries(agentCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

      // Récurrences actives : templates dont until n'est pas passé
      const now = Date.now();
      const activeSeries = reqs.filter(r =>
        r.recurrence && r.recurrence.templateId === r.id &&
        (!r.recurrence.until || r.recurrence.until > now)
      );
      // Plus les templates HORS période filtrée (sinon on rate les templates anciens qui continuent à générer)
      Object.values(this._allRequests || {}).forEach(r => {
        if (r.recurrence && r.recurrence.templateId && !activeSeries.find(a => a.id === r.id)) {
          // skip — occurrence, pas template
        }
      });

      // Requêtes en retard : ouvertes/en cours > 7 jours
      const lateCutoff = now - 7 * 24 * 3600 * 1000;
      const lateReqs = reqs.filter(r =>
        (r.status === 'open' || r.status === 'in_progress') && r.createdAt < lateCutoff
      ).sort((a, b) => a.createdAt - b.createdAt);

      const uncategorized = reqs.filter(r => !r.themeId).length;

      // ── Graphe temporel (barres par jour) ─────────────────────
      const dayBuckets = this._buildDayBuckets(reqs);

      // ── Rendu HTML ────────────────────────────────────────────
      const kpi = (icon, value, label, color) => `
        <div class="tq-widget">
          <div class="tq-widget-title">${icon} ${label}</div>
          <div class="tq-kpi-value"${color ? ` style="color:${color}"` : ''}>${value}</div>
          <div class="tq-kpi-label">${label}</div>
        </div>`;

      // Barres horizontales pour rankings
      const hBars = (entries, maxLabel = 24, onClick = null) => {
        if (!entries.length) return '<p class="tq-placeholder">Aucune donnée.</p>';
        const max = entries[0][1] || 1;
        return `<div class="tq-hbars">${entries.map(([label, count]) => {
          const pct = (count / max) * 100;
          const lbl = label.length > maxLabel ? label.slice(0, maxLabel - 1) + '…' : label;
          const clickable = onClick ? ` data-hbar-click="${escapeAttr(label)}" style="cursor:pointer"` : '';
          return `<div class="tq-hbar-row"${clickable}>
            <span class="tq-hbar-label" title="${escapeAttr(label)}">${escapeHtml(lbl)}</span>
            <div class="tq-hbar-track"><div class="tq-hbar-fill" style="width:${pct}%"></div></div>
            <span class="tq-hbar-count">${count}</span>
          </div>`;
        }).join('')}</div>`;
      };

      // Barres verticales (graphe temporel)
      const vBars = buckets => {
        const max = Math.max(1, ...buckets.map(b => b.count));
        return `<div class="tq-vbars">${buckets.map(b => {
          const h = (b.count / max) * 100;
          return `<div class="tq-vbar-col" title="${b.label} : ${b.count} requête(s)">
            <div class="tq-vbar-track">
              <div class="tq-vbar-fill" style="height:${h}%"></div>
            </div>
            <div class="tq-vbar-label">${b.shortLabel}</div>
          </div>`;
        }).join('')}</div>`;
      };

      // Status distribution (barre 100% stack)
      const statusStack = () => {
        if (!total) return '<p class="tq-placeholder">Aucune donnée.</p>';
        const segments = [
          { key: 'open',        label: 'Ouvertes',    count: openCount,       color: '#fbbf24' },
          { key: 'in_progress', label: 'En cours',    count: inProgressCount, color: '#3b82f6' },
          { key: 'postponed',   label: 'Reportées',   count: postponedCount,  color: '#94a3b8' },
          { key: 'done',        label: 'Terminées',   count: doneCount,       color: '#10b981' },
        ];
        const bar = `<div class="tq-status-bar">${segments.filter(s => s.count > 0).map(s => {
          const pct = (s.count / total) * 100;
          return `<div class="tq-status-seg" style="flex:${s.count};background:${s.color}" title="${s.label} : ${s.count} (${pct.toFixed(0)}%)"></div>`;
        }).join('')}</div>`;
        const legend = `<div class="tq-status-legend">${segments.map(s => `
          <span class="tq-status-item"><span class="tq-status-dot" style="background:${s.color}"></span>${s.label} <b>${s.count}</b></span>
        `).join('')}</div>`;
        return bar + legend;
      };

      // Timeline dernières requêtes
      const timelineRows = reqs.slice(0, 15).map(r => {
        const dt = new Date(r.createdAt).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const theme = DB.getTechThemeLabel(r.themeId);
        const statusIcon = { open: '🟡', in_progress: '🔵', postponed: '⏸', done: '✅' }[r.status] || '?';
        return `<tr>
          <td class="tq-tl-date">${dt}</td>
          <td>${statusIcon}</td>
          <td class="tq-tl-theme">${escapeHtml(theme)}</td>
          <td class="tq-tl-local">${escapeHtml(r.local || '—')}</td>
          <td class="tq-tl-desc" title="${escapeAttr(r.description || '')}">${escapeHtml((r.description || '').slice(0, 80))}</td>
        </tr>`;
      }).join('');

      // Récurrences actives
      const unitLabels = { days: 'jour(s)', weeks: 'sem.', months: 'mois' };
      const activeRecHtml = activeSeries.length
        ? activeSeries.map(t => {
            const rec = t.recurrence;
            const nextDate = rec.nextAt && (!rec.until || rec.nextAt <= rec.until)
              ? new Date(rec.nextAt).toLocaleDateString('fr-BE', { day: '2-digit', month: 'short', year: 'numeric' })
              : 'terminée';
            return `<div class="tq-rec-row">
              <div class="tq-rec-desc" title="${escapeAttr(t.description || '')}">${escapeHtml((t.description || '').slice(0, 60))}</div>
              <div class="tq-rec-meta">
                <span class="tq-rec-freq">↻ tous les ${rec.interval} ${unitLabels[rec.unit] || rec.unit}</span>
                <span class="tq-rec-theme">🏷️ ${escapeHtml(DB.getTechThemeLabel(t.themeId))}</span>
                ${t.local ? `<span class="tq-rec-local">📍 ${escapeHtml(t.local)}</span>` : ''}
                <span class="tq-rec-next">Prochaine : <b>${nextDate}</b></span>
              </div>
            </div>`;
          }).join('')
        : '<p class="tq-placeholder">Aucune série récurrente active.</p>';

      // Requêtes en retard
      const lateHtml = lateReqs.length
        ? `<div class="tq-late-list">${lateReqs.slice(0, 10).map(r => {
            const days = Math.floor((now - r.createdAt) / (24 * 3600 * 1000));
            return `<div class="tq-late-row">
              <span class="tq-late-days">${days}j</span>
              <span class="tq-late-theme">${escapeHtml(DB.getTechThemeLabel(r.themeId))}</span>
              <span class="tq-late-local">${escapeHtml(r.local || '—')}</span>
              <span class="tq-late-desc" title="${escapeAttr(r.description || '')}">${escapeHtml((r.description || '').slice(0, 50))}</span>
            </div>`;
          }).join('')}</div>${lateReqs.length > 10 ? `<p class="tq-widget-sub">… et ${lateReqs.length - 10} de plus</p>` : ''}`
        : '<p class="tq-placeholder">Aucune requête en retard 🎉</p>';

      // ── Assemble ──────────────────────────────────────────────
      gridEl.innerHTML = `
        ${kpi('🎫', total, 'Total requêtes')}
        ${kpi('🟠', openCount, 'Ouvertes', '#f59e0b')}
        ${kpi('⏱️', `<span style="font-size:1.5rem">${avgResolution}</span>`, 'Résolution moy.', '#0ea5e9')}
        ${kpi('🔥', `<span style="font-size:1rem;line-height:1.2;display:inline-block;margin-top:.3rem">${escapeHtml(topThemeLabel)}</span>`, 'Top thème')}

        <div class="tq-widget w-large">
          <div class="tq-widget-title">📈 Requêtes créées (période)</div>
          ${vBars(dayBuckets)}
        </div>

        <div class="tq-widget w-medium">
          <div class="tq-widget-title">🏷️ Répartition par thème</div>
          ${hBars(Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).map(([k, c]) => [
            k === '__none__' ? 'Non catégorisé' : DB.getTechThemeLabel(k),
            c,
          ]))}
        </div>

        <div class="tq-widget w-medium">
          <div class="tq-widget-title">📍 Top 10 locaux</div>
          ${hBars(topLocals, 28)}
        </div>

        <div class="tq-widget w-medium">
          <div class="tq-widget-title">👷 Charge par agent (assignations)</div>
          ${hBars(topAgents, 28)}
        </div>

        <div class="tq-widget w-medium">
          <div class="tq-widget-title">🥧 Répartition par statut</div>
          ${statusStack()}
        </div>

        <div class="tq-widget w-medium">
          <div class="tq-widget-title">⚠️ Requêtes en retard <span class="tq-widget-sub">(> 7 jours ouvertes)</span></div>
          ${lateHtml}
        </div>

        <div class="tq-widget w-medium">
          <div class="tq-widget-title">↻ Séries récurrentes actives</div>
          ${activeRecHtml}
        </div>

        ${uncategorized > 0 ? `
        <div class="tq-widget w-large" style="background:#fffbeb;border:1.5px solid #fde68a">
          <div class="tq-widget-title">🏷️ Requêtes non catégorisées</div>
          <p style="font-size:.88rem;color:#92400e">
            <b>${uncategorized}</b> requête(s) dans la période n'ont pas de thème.
            Elles sont exclues des stats "par thème" ci-dessus.
            Catégorise-les via le panneau Interventions pour améliorer les statistiques.
          </p>
        </div>` : ''}

        <div class="tq-widget w-large">
          <div class="tq-widget-title">📜 Timeline récente <span class="tq-widget-sub">(15 dernières)</span></div>
          ${total === 0
            ? '<p class="tq-placeholder">Aucune requête pour cette période / filtre.</p>'
            : `<div class="tq-tl-wrap">
                <table class="tq-timeline">
                  <thead><tr><th>Date</th><th></th><th>Thème</th><th>Local</th><th>Description</th></tr></thead>
                  <tbody>${timelineRows}</tbody>
                </table>
              </div>`
          }
        </div>
      `;

      // Clic sur un local → filtrer
      gridEl.querySelectorAll('[data-hbar-click]').forEach(row => {
        row.addEventListener('click', () => {
          const val = row.dataset.hbarClick;
          const searchEl = document.getElementById('tqSearch');
          if (searchEl) { searchEl.value = val; this._search = val.toLowerCase(); this.render(); }
        });
      });
    },

    _formatDuration(ms) {
      const hours = ms / (1000 * 3600);
      if (hours < 1)  return `${Math.round(ms / 60000)} min`;
      if (hours < 24) return `${hours.toFixed(1)} h`;
      const days = hours / 24;
      return `${days.toFixed(1)} j`;
    },

    _buildDayBuckets(reqs) {
      const now = Date.now();
      const days = this._period === 'all' ? 30 : Math.min(this._period, 90);
      const buckets = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now - i * 24 * 3600 * 1000);
        const key = d.toISOString().slice(0, 10);
        const short = d.toLocaleDateString('fr-BE', { day: '2-digit' });
        buckets.push({ key, label: d.toLocaleDateString('fr-BE'), shortLabel: short, count: 0 });
      }
      reqs.forEach(r => {
        const k = new Date(r.createdAt).toISOString().slice(0, 10);
        const b = buckets.find(x => x.key === k);
        if (b) b.count++;
      });
      return buckets;
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

    // ─── Onglets Dashboard / Requêtes ─────────────────────────────────
    _bindTabs() {
      document.querySelectorAll('.tq-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tq-tab').forEach(b => b.classList.remove('tq-tab-active'));
          btn.classList.add('tq-tab-active');
          this._tab = btn.dataset.tab;
          document.getElementById('tqPaneDashboard').style.display = (this._tab === 'dashboard') ? '' : 'none';
          document.getElementById('tqPaneRequests').style.display  = (this._tab === 'requests')  ? '' : 'none';
          if (this._tab === 'requests') this._renderRequestsPane();
        });
      });
    },

    // Construit et imprime la liste des requêtes filtrées, groupée par ouvrier.
    // Utilisé par le responsable technique pour distribuer la liste du matin.
    _printRequestsList() {
      const area = document.getElementById('tqPrintArea');
      if (!area) return;
      const reqs = this._allRequests || {};
      const TYPE_ICONS = { technique: '🔧', entretien: '🧹', autre: '📋' };
      const urg = (r) => {
        const l = parseInt(r?.urgencyLevel);
        if (l >= 1 && l <= 5) return l;
        return r?.urgent ? 5 : 3;
      };
      const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      // Appliquer les mêmes filtres que le pane actuel.
      const entries = Object.entries(reqs)
        .filter(([, r]) => r.status === this._reqStatusFilter)
        .filter(([, r]) => this._reqTypeFilter === 'all' || r.type === this._reqTypeFilter)
        .filter(([, r]) => this._reqUrgFilter !== 'high' || urg(r) >= 4);

      if (!entries.length) {
        alert('Aucune requête à imprimer avec les filtres actuels.');
        return;
      }

      // Grouper par ouvrier (workerId > assignedTo legacy > "Non assignée")
      const groups = new Map(); // key = worker identifier string, value = { label, badge, list: [] }
      const UNASSIGNED_KEY = '__unassigned__';
      for (const [id, r] of entries) {
        let key = UNASSIGNED_KEY;
        let label = 'Non assignée';
        let badge = '';
        if (r.workerId) {
          key   = `w:${r.workerId}`;
          label = r.workerName || 'Ouvrier';
          badge = r.workerBadge || '';
        } else if (r.assignedTo) {
          key   = `a:${r.assignedTo}`;
          label = r.assignedToName || r.assignedTo;
          badge = '';
        }
        if (!groups.has(key)) groups.set(key, { label, badge, list: [] });
        groups.get(key).list.push({ id, r });
      }

      // Tri à l'intérieur de chaque groupe : urgence desc, puis createdAt desc
      groups.forEach(g => {
        g.list.sort((x, y) => (urg(y.r) - urg(x.r)) || (y.r.createdAt - x.r.createdAt));
      });

      // Tri des groupes : non-assignée en dernier, le reste par label
      const groupEntries = Array.from(groups.entries()).sort(([ka, va], [kb, vb]) => {
        if (ka === UNASSIGNED_KEY) return 1;
        if (kb === UNASSIGNED_KEY) return -1;
        return va.label.localeCompare(vb.label, 'fr');
      });

      // Titre selon filtre statut
      const statusLabels = {
        open: 'Requêtes ouvertes',
        in_progress: 'Requêtes en cours',
        postponed: 'Requêtes reportées',
        done: 'Requêtes terminées',
      };
      const statusTitle = statusLabels[this._reqStatusFilter] || 'Requêtes';
      const typeLabels = { technique: 'techniques', entretien: 'entretien', autre: 'autres', all: '(tous types)' };
      const typeTitle = typeLabels[this._reqTypeFilter] || '';
      const dateStr = new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      // Rendu
      let html = `<div class="tq-print-title">${esc(statusTitle)} ${esc(typeTitle)}</div>`;
      html += `<div class="tq-print-sub">Imprimé le ${esc(dateStr)} · ${entries.length} requête(s) au total</div>`;

      for (const [, g] of groupEntries) {
        html += `<div class="tq-print-worker-block">
          <div class="tq-print-worker-hd">
            ${g.badge ? `<span class="tq-print-worker-badge">${esc(g.badge)}</span>` : ''}
            <span>${esc(g.label)}</span>
            <span class="tq-print-worker-count">${g.list.length} requête${g.list.length > 1 ? 's' : ''}</span>
          </div>`;
        for (const { id, r } of g.list) {
          const u = urg(r);
          const icon = TYPE_ICONS[r.type] || '📋';
          const themeLabel = DB.getThemeLabelForRequestType?.(r.type, r.themeId) || '';
          const themeTxt = r.themeId ? ` · ${themeLabel}` : '';
          const localTxt = r.local ? ` · 📍 ${esc(r.local)}` : '';
          const reopenTxt = (r.status === 'postponed' && r.reopenAt)
            ? ` · ⏰ rouvre ${new Date(r.reopenAt).toLocaleDateString('fr-BE', { day:'2-digit', month:'2-digit' })}` : '';
          const from = r.fromAgentName ? `<small>— par ${esc(r.fromAgentName)}</small>` : '';
          html += `<div class="tq-print-req">
            <span class="tq-print-req-urg tq-print-req-urg-${u}">${u}</span>
            <span class="tq-print-req-type">${icon} ${esc(r.type || 'autre')}</span>
            <span class="tq-print-req-desc">${esc(r.description || '')} ${from}</span>
            <span class="tq-print-req-meta">${esc(themeTxt)}${esc(localTxt)}${esc(reopenTxt)}</span>
          </div>`;
        }
        html += `</div>`;
      }

      area.innerHTML = html;
      // Le CSS @media print affiche #tqPrintArea et cache tout le reste.
      setTimeout(() => window.print(), 50);
    },

    _bindRequestsPaneFilters() {
      document.querySelectorAll('#tqReqTabs .req-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#tqReqTabs .req-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._reqStatusFilter = btn.dataset.status;
          if (this._tab === 'requests') this._renderRequestsPane();
        });
      });
      document.querySelectorAll('#tqReqTypeFilter .tq-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#tqReqTypeFilter .tq-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._reqTypeFilter = btn.dataset.reqType;
          if (this._tab === 'requests') this._renderRequestsPane();
        });
      });
      document.querySelectorAll('#tqReqUrgencyFilter .tq-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#tqReqUrgencyFilter .tq-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._reqUrgFilter = btn.dataset.urg;
          if (this._tab === 'requests') this._renderRequestsPane();
        });
      });
      document.getElementById('tqReqPrintBtn')?.addEventListener('click', () => this._printRequestsList());
    },

    _renderRequestsPane() {
      const listEl = document.getElementById('tqReqList');
      if (!listEl) return;
      const reqs = this._allRequests || {};
      const isAdmin = DB.hasPermission?.('editSettings');
      const agents  = DB.getAgentsWithKeys?.() || [];
      const TYPE_ICONS = { technique: '🔧', entretien: '🧹', autre: '📋' };
      const STATUS_LABELS = {
        open:        '🟡 Ouverte',
        in_progress: '🔵 En cours',
        postponed:   '⏸ Reportée',
        done:        '✅ Terminée',
      };

      const urg = (r) => {
        const l = parseInt(r?.urgencyLevel);
        if (l >= 1 && l <= 5) return l;
        return r?.urgent ? 5 : 3;
      };

      const entries = Object.entries(reqs)
        .filter(([, r]) => r.status === this._reqStatusFilter)
        .filter(([, r]) => this._reqTypeFilter === 'all' || r.type === this._reqTypeFilter)
        .filter(([, r]) => this._reqUrgFilter !== 'high' || urg(r) >= 4)
        // Tri : urgence desc en priorité, puis createdAt desc
        .sort(([, a], [, b]) => (urg(b) - urg(a)) || (b.createdAt - a.createdAt));

      if (!entries.length) {
        listEl.innerHTML = '<div class="tq-loading">Aucune requête ne correspond aux filtres.</div>';
        return;
      }

      // On délègue le rendu carte à REQUESTS._renderCard si disponible
      // (même module qui sert sur app.html, donc rendu identique).
      listEl.innerHTML = entries.map(([id, r]) =>
        (typeof REQUESTS !== 'undefined' && REQUESTS._renderCard)
          ? REQUESTS._renderCard(id, r, isAdmin, agents, TYPE_ICONS, STATUS_LABELS)
          : ''
      ).join('');

      // Brancher les handlers d'action (claim/done/postponed/open/delete/assign worker)
      // en déléguant à REQUESTS._handleAction (nécessite un état minimal).
      if (typeof REQUESTS !== 'undefined') {
        // Assurer que REQUESTS connaît l'agent courant (il s'init sur requests
        // listener, mais sans init complet on l'alimente ici).
        if (!REQUESTS._agentKey) REQUESTS._agentKey = sessionStorage.getItem('cpas_current_agent_key');
        if (!REQUESTS._agentName) {
          REQUESTS._agentName = DB.getAgentsWithKeys().find(a => a.key === REQUESTS._agentKey)?.name || null;
        }
        listEl.querySelectorAll('[data-req-action]').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { reqAction: action, reqId: id } = btn.dataset;
            await REQUESTS._handleAction?.(action, id, null, agents);
          });
        });
        listEl.querySelectorAll('.req-assign-worker-select').forEach(sel => {
          sel.addEventListener('change', async (e) => {
            e.stopPropagation();
            const id = sel.dataset.reqId;
            try { await DB.assignRequestWorker(id, sel.value || null); } catch (err) { console.warn(err); }
          });
        });
        listEl.querySelectorAll('.req-comment-toggle').forEach(btn => {
          btn.addEventListener('click', () => REQUESTS._openCommentBox?.(btn.dataset.reqId));
        });
        listEl.querySelectorAll('.req-tag-btn').forEach(btn => {
          btn.addEventListener('click', () => REQUESTS._openThemePicker?.(btn.dataset.reqId));
        });
        listEl.querySelectorAll('.req-view-series').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            REQUESTS._openSeriesView?.(btn.dataset.reqId);
          });
        });
        listEl.querySelectorAll('.req-stop-series').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Arrêter la série ? Aucune nouvelle occurrence ne sera générée. Les occurrences existantes sont conservées.')) return;
            try { await DB.stopRequestSeries(btn.dataset.reqId); } catch (err) { console.warn(err); }
          });
        });
      }
    },
  };

  // Expose globalement pour debug console
  window.TECH = TECH;

  // Bootstrap
  document.addEventListener('DOMContentLoaded', () => TECH.init());
})();
