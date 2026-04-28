// ═══════════════════════════════════════════════════════════════════
// requests.js — Vue Interventions (tickets technique / entretien)
// ═══════════════════════════════════════════════════════════════════

const REQUESTS = {
  _panel:       null,
  _panelOpen:   false,
  _agentKey:    null,
  _agentName:   null,
  _agentRole:   null,
  _filter:      'open',       // 'open' | 'in_progress' | 'postponed' | 'done'
  _typeFilter:  'technique',  // 'technique' | 'entretien' — contexte du panneau ouvert

  // Rôles qui voient le panneau interventions
  _TECH_ROLES: new Set(['__technicien__', '__entretien__', '__admin__', '__chef_service__', '__direction__', '__responsable_technique__']),

  init() {
    this._agentKey  = sessionStorage.getItem('cpas_current_agent_key');
    this._panel     = document.getElementById('interventionsPanel');

    // Résolution immédiate du rôle (config déjà chargée à ce stade)
    const _resolveRole = () => {
      const found = DB.getAgentsWithKeys().find(a => a.key === this._agentKey);
      this._agentName = found?.name || null;
      this._agentRole = DB.getAgentPermRole?.(this._agentKey) || null;
      this._updateHeaderBtn();
      this._updateBadge();
    };
    _resolveRole();

    DB.onConfigChange(() => { _resolveRole(); });

    DB.listenRequests();
    let _schedulerRan = false;
    DB.onRequestChange(() => {
      this._updateBadge();
      if (this._panelOpen) this._render();
      // Scheduler des récurrences : une seule fois après le 1er snapshot
      // (DB.runRecurringRequestsScheduler a son propre throttle 5min).
      if (!_schedulerRan) {
        _schedulerRan = true;
        DB.runRecurringRequestsScheduler?.().catch(e => console.warn('[recurring scheduler]', e));
      }
    });

    // Boutons header séparés (technique / entretien)
    document.getElementById('btnInterventionsTech')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel('technique');
    });
    document.getElementById('btnInterventionsCleaning')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel('entretien');
    });

    // Fermer en cliquant ailleurs
    document.addEventListener('click', (e) => {
      if (this._panelOpen &&
          this._panel && !this._panel.contains(e.target) &&
          !document.getElementById('btnInterventionsTech')?.contains(e.target) &&
          !document.getElementById('btnInterventionsCleaning')?.contains(e.target)) {
        this._closePanel();
      }
    });
  },

  _canSee() {
    return this._TECH_ROLES.has(this._agentRole);
  },

  // Retourne true si ce rôle peut voir ce type de requête.
  // technicien → seulement technique, entretien → seulement entretien,
  // admin/direction/chef/responsable → les deux.
  _canSeeType(type) {
    if (!this._agentRole) return false;
    if (this._agentRole === '__technicien__') return type === 'technique';
    if (this._agentRole === '__entretien__')  return type === 'entretien';
    return true;
  },

  _filterByRole(req) {
    // Un requête de type "autre" est visible par tous les rôles tech.
    if (req.type === 'autre') return this._canSee();
    return this._canSeeType(req.type);
  },

  _updateHeaderBtn() {
    const featureOn = DB._config.features?.['enableInterventions'] !== false;
    const btnTech     = document.getElementById('btnInterventionsTech');
    const btnCleaning = document.getElementById('btnInterventionsCleaning');
    if (btnTech)     btnTech.style.display     = (featureOn && this._canSeeType('technique')) ? '' : 'none';
    if (btnCleaning) btnCleaning.style.display = (featureOn && this._canSeeType('entretien')) ? '' : 'none';
  },

  _updateBadge() {
    const now = Date.now();
    const reqs = Object.values(DB.getRequests());
    const countForType = (type) =>
      reqs.filter(r => r.status === 'open' && r.createdAt <= now &&
        (r.type === type || (type === 'technique' && r.type === 'autre' && this._canSeeType('technique')))
      ).length;

    const setBadge = (id, n) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = n > 9 ? '9+' : (n || '');
      el.classList.toggle('hidden', !n);
    };
    setBadge('interventionsBadgeTech',     countForType('technique'));
    setBadge('interventionsBadgeCleaning', countForType('entretien'));
  },

  // Ouvre le panneau pour un type donné ('technique' | 'entretien').
  // Si le panneau est déjà ouvert sur le même type → fermeture.
  // Si ouvert sur l'autre type → on bascule au nouveau type sans fermer.
  togglePanel(type = 'technique') {
    if (this._panelOpen && this._typeFilter === type) {
      this._closePanel();
      return;
    }
    this._typeFilter = type;
    this._openPanel();
  },

  _openPanel() {
    this._panelOpen = true;
    this._panel?.classList.remove('hidden');
    this._render();
  },

  _closePanel() {
    this._panelOpen = false;
    this._panel?.classList.add('hidden');
    // Fermer aussi le modal de commentaire s'il est ouvert
    document.getElementById('reqCommentBox')?.classList.add('hidden');
  },

  _render() {
    if (!this._panel) return;
    const reqs    = DB.getRequests();
    const isAdmin = DB.hasPermission('editSettings');
    const agents  = DB.getAgentsWithKeys();

    const TYPE_ICONS = { technique: '🔧', entretien: '🧹', autre: '📋' };
    const STATUS_LABELS = {
      open:        '🟡 Ouverte',
      in_progress: '🔵 En cours',
      postponed:   '⏸ Reportée',
      done:        '✅ Terminée',
    };

    // Filtre par type courant (bouton cliqué) : les requêtes "autre"
    // suivent le panneau technique par défaut (hérité du legacy).
    const typeFilterFn = (r) => {
      if (this._typeFilter === 'entretien') return r.type === 'entretien';
      // 'technique' — inclut 'autre' pour ne pas perdre les requêtes legacy
      return r.type === 'technique' || r.type === 'autre';
    };

    // Compter par statut (filtré par rôle, type courant, et exclu les requêtes
    // futures = templates récurrents avec startDate > now).
    const now = Date.now();
    const isVisible = r => r.createdAt <= now;
    const counts = { open: 0, in_progress: 0, postponed: 0, done: 0 };
    Object.values(reqs).forEach(r => {
      if (counts[r.status] !== undefined && isVisible(r) && this._filterByRole(r) && typeFilterFn(r)) counts[r.status]++;
    });

    const filtered = Object.entries(reqs)
      .filter(([, r]) => r.status === this._filter && isVisible(r) && this._filterByRole(r) && typeFilterFn(r))
      .sort(([, a], [, b]) => b.createdAt - a.createdAt);

    const tabBtn = (status, label) => {
      const active = this._filter === status;
      const cnt = counts[status];
      return `<button class="req-tab${active ? ' active' : ''}" data-status="${status}">
        ${label}${cnt ? ` <span class="req-tab-count">${cnt}</span>` : ''}
      </button>`;
    };

    const panelTitle = this._typeFilter === 'entretien'
      ? '🧹 Interventions entretien'
      : '🔧 Interventions techniques';

    this._panel.innerHTML = `
      <div class="req-panel-hd">
        <span>${panelTitle}</span>
        <button class="req-close-btn" id="reqCloseBtn">✕</button>
      </div>
      <div class="req-tabs">
        ${tabBtn('open', 'Ouvertes')}
        ${tabBtn('in_progress', 'En cours')}
        ${tabBtn('postponed', 'Reportées')}
        ${tabBtn('done', 'Terminées')}
      </div>
      <div class="req-list">
        ${filtered.length === 0
          ? `<div class="req-empty">Aucune intervention ${STATUS_LABELS[this._filter]?.toLowerCase() || ''}</div>`
          : filtered.map(([id, r]) => this._renderCard(id, r, isAdmin, agents, TYPE_ICONS, STATUS_LABELS)).join('')
        }
      </div>`;

    // Tabs
    this._panel.querySelectorAll('.req-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._filter = btn.dataset.status;
        this._render();
      });
    });

    document.getElementById('reqCloseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._closePanel();
    });

    // Actions
    this._panel.querySelectorAll('[data-req-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const { reqAction: action, reqId: id, reqAgent: agentKey } = btn.dataset;
        await this._handleAction(action, id, agentKey, agents);
      });
    });

    // Assign select (ouvrier sans compte : technicien ou cleaner selon type)
    this._panel.querySelectorAll('.req-assign-worker-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        e.stopPropagation();
        const id = sel.dataset.reqId;
        const workerId = sel.value || null;
        try {
          await DB.assignRequestWorker(id, workerId);
          if (workerId) {
            const type = sel.dataset.reqType || 'technique';
            const worker = DB.getWorkerById(type, workerId);
            const label = worker ? `${worker.badge} — ${worker.name}` : workerId;
            showToast(`👷 Assigné à ${label}`);
          }
        } catch (err) {
          console.warn('[requests] assign worker failed', err);
          showToast('Erreur lors de l\'assignation', 'error');
        }
      });
    });

    // Commentaire toggle
    this._panel.querySelectorAll('.req-comment-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openCommentBox(btn.dataset.reqId);
      });
    });

    // Catégoriser (assigner un thème)
    this._panel.querySelectorAll('.req-tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openThemePicker(btn.dataset.reqId);
      });
    });

    // Arrêter la série
    this._panel.querySelectorAll('.req-stop-series').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Arrêter la série ? Aucune nouvelle occurrence ne sera générée. Les occurrences existantes sont conservées.')) return;
        await DB.stopRequestSeries(btn.dataset.reqId);
        showToast('Série arrêtée ✓');
      });
    });

    // Voir la série
    this._panel.querySelectorAll('.req-view-series').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openSeriesView(btn.dataset.reqId);
      });
    });

    // Changer l'urgence
    this._panel.querySelectorAll('.req-urg-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openUrgencyPicker(btn.dataset.reqId);
      });
    });
  },

  _openUrgencyPicker(reqId) {
    const req = DB.getRequests()[reqId];
    if (!req) return;
    const current = this._urgencyLevel(req);
    let box = document.getElementById('reqUrgBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'reqUrgBox';
      box.className = 'req-comment-box';
      document.body.appendChild(box);
    }
    const btnFor = (lvl, label) =>
      `<button type="button" class="ti-urg-btn ti-urg-${lvl}${lvl === current ? ' active' : ''}" data-level="${lvl}" title="${escapeHtml(label)}">${lvl}</button>`;
    box.style.background = '#fff';
    box.style.border = '1px solid #e2e8f0';
    box.style.color = '#1e293b';
    box.innerHTML = `
      <div class="req-comment-box-inner" style="max-width:380px;color:#1e293b">
        <h3 style="margin:0 0 .4rem;font-size:1rem;color:#1a3a5c">⚡ Niveau d'urgence</h3>
        <p style="font-size:.8rem;color:#64748b;margin:0 0 .7rem">Niveau actuel : <b>${current}/5</b>. Choisis le nouveau niveau.</p>
        <div class="ti-urgency-row" id="reqUrgRow">
          ${btnFor(1, '1 — Faible')}
          ${btnFor(2, '2 — Modéré')}
          ${btnFor(3, '3 — Moyen')}
          ${btnFor(4, '4 — Élevé')}
          ${btnFor(5, '5 — Critique')}
        </div>
        <div class="req-comment-box-actions" style="margin-top:.75rem">
          <button class="btn-secondary" id="reqUrgCancel">Annuler</button>
        </div>
      </div>`;
    box.classList.remove('hidden');

    const cleanup = () => {
      box.classList.add('hidden');
      box.style.background = '';
      box.style.border = '';
      box.style.color = '';
    };
    document.getElementById('reqUrgCancel').onclick = cleanup;
    box.querySelectorAll('.ti-urg-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lvl = parseInt(btn.dataset.level);
        if (!lvl || lvl === current) { cleanup(); return; }
        try {
          await DB.setRequestUrgencyLevel(reqId, lvl);
          showToast(`⚡ Urgence mise à ${lvl}/5`);
        } catch (e) { console.warn('[requests] set urgency failed', e); }
        cleanup();
      });
    });
  },

  _openThemePicker(reqId) {
    const req = DB.getRequests()[reqId];
    if (!req) return;
    const themes = DB.getThemesForRequestType?.(req.type) || DB.getTechThemes();
    let box = document.getElementById('reqThemePickerBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'reqThemePickerBox';
      box.className = 'req-comment-box';
      document.body.appendChild(box);
    }
    const current = req.themeId || '';
    box.innerHTML = `
      <div class="req-comment-box-inner">
        <h3 style="margin:0 0 .6rem;font-size:1rem;color:#1a3a5c">🏷️ Catégoriser la requête</h3>
        <select id="reqThemePickerSel" style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:.5rem .65rem;font-size:.9rem;font-family:inherit">
          <option value="">— Non catégorisé —</option>
          ${themes.map(t => `<option value="${t.id}"${t.id === current ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}
        </select>
        <div class="req-comment-box-actions">
          <button class="btn-secondary" id="reqThemePickerCancel">Annuler</button>
          <button class="btn-primary" id="reqThemePickerSave">Enregistrer</button>
        </div>
      </div>`;
    box.classList.remove('hidden');
    document.getElementById('reqThemePickerCancel').onclick = () => box.classList.add('hidden');
    document.getElementById('reqThemePickerSave').onclick = async () => {
      const themeId = document.getElementById('reqThemePickerSel').value || null;
      await DB.setRequestTheme(reqId, themeId);
      box.classList.add('hidden');
      showToast('Thème enregistré ✓');
    };
  },

  // Modal d'édition d'une série récurrente : description, local, thème,
  // récurrence (unit/interval/until/nextAt). Affecte le template seul.
  _openSeriesEditor(templateId) {
    const tpl = DB.getRequests()[templateId];
    if (!tpl || !tpl.recurrence) return;
    const themes = DB.getThemesForRequestType?.(tpl.type) || DB.getTechThemes() || [];
    let box = document.getElementById('reqSeriesEditBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'reqSeriesEditBox';
      box.className = 'req-comment-box';
      document.body.appendChild(box);
    }
    const rec = tpl.recurrence;
    const toDateInput = (ts) => {
      if (!ts) return '';
      const d = new Date(ts);
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const fromDateInput = (s) => {
      if (!s) return null;
      const d = new Date(s);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    box.innerHTML = `
      <div class="req-comment-box-inner" style="max-width:480px">
        <h3 style="margin:0 0 .8rem;font-size:1.05rem;color:#1a3a5c">↻ Modifier la série récurrente</h3>

        <label style="display:block;font-size:.78rem;font-weight:700;color:#475569;margin-bottom:.2rem">Description</label>
        <textarea id="rseDesc" rows="2" style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:.45rem .6rem;font-size:.9rem;font-family:inherit;resize:vertical;margin-bottom:.65rem">${escapeHtml(tpl.description || '')}</textarea>

        <label style="display:block;font-size:.78rem;font-weight:700;color:#475569;margin-bottom:.2rem">Local concerné</label>
        <input type="text" id="rseLocal" value="${escapeHtml(tpl.local || '')}" placeholder="(optionnel)" style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:.45rem .6rem;font-size:.9rem;font-family:inherit;margin-bottom:.65rem">

        <label style="display:block;font-size:.78rem;font-weight:700;color:#475569;margin-bottom:.2rem">Thème</label>
        <select id="rseTheme" style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:.45rem .6rem;font-size:.9rem;font-family:inherit;margin-bottom:.65rem">
          <option value="">— Non catégorisé —</option>
          ${themes.map(t => `<option value="${t.id}"${t.id === tpl.themeId ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}
        </select>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:.65rem">
          <div>
            <label style="display:block;font-size:.78rem;font-weight:700;color:#475569;margin-bottom:.2rem">Tous les</label>
            <input type="number" id="rseInterval" min="1" max="365" value="${rec.interval || 1}" style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:.45rem .6rem;font-size:.9rem;font-family:inherit">
          </div>
          <div>
            <label style="display:block;font-size:.78rem;font-weight:700;color:#475569;margin-bottom:.2rem">Unité</label>
            <select id="rseUnit" style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:.45rem .6rem;font-size:.9rem;font-family:inherit">
              <option value="days"${rec.unit === 'days' ? ' selected' : ''}>jour(s)</option>
              <option value="weeks"${rec.unit === 'weeks' ? ' selected' : ''}>semaine(s)</option>
              <option value="months"${rec.unit === 'months' ? ' selected' : ''}>mois</option>
            </select>
          </div>
        </div>

        <label style="display:block;font-size:.78rem;font-weight:700;color:#475569;margin-bottom:.2rem">Prochaine occurrence</label>
        <input type="date" id="rseNextAt" value="${toDateInput(rec.nextAt)}" style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:.45rem .6rem;font-size:.9rem;font-family:inherit;margin-bottom:.65rem">

        <label style="display:block;font-size:.78rem;font-weight:700;color:#475569;margin-bottom:.2rem">Jusqu'au (optionnel)</label>
        <input type="date" id="rseUntil" value="${toDateInput(rec.until)}" style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:.45rem .6rem;font-size:.9rem;font-family:inherit;margin-bottom:.5rem">

        <div class="req-comment-box-actions">
          <button class="btn-secondary" id="rseCancel">Annuler</button>
          <button class="btn-primary"   id="rseSave">💾 Enregistrer</button>
        </div>
      </div>`;
    box.classList.remove('hidden');
    document.getElementById('rseCancel').onclick = () => box.classList.add('hidden');
    document.getElementById('rseSave').onclick   = async () => {
      const description = document.getElementById('rseDesc').value.trim();
      const local       = document.getElementById('rseLocal').value.trim() || null;
      const themeId     = document.getElementById('rseTheme').value || null;
      const interval    = parseInt(document.getElementById('rseInterval').value, 10) || 1;
      const unit        = document.getElementById('rseUnit').value || 'months';
      const nextAt      = fromDateInput(document.getElementById('rseNextAt').value);
      const until       = fromDateInput(document.getElementById('rseUntil').value);
      if (!description) {
        alert('La description ne peut pas être vide.');
        return;
      }
      try {
        await DB.updateRequestTemplate(templateId, {
          description, local, themeId,
          recurrence: { unit, interval, until, nextAt },
        });
        box.classList.add('hidden');
        if (typeof showToast === 'function') showToast('Série mise à jour ✓');
      } catch (e) {
        console.warn('[REQUESTS] updateSeries failed', e);
        alert('Erreur : ' + (e?.message || e));
      }
    };
  },

  _openSeriesView(templateId) {
    const series = DB.getRequestsInSeries(templateId);
    let box = document.getElementById('reqSeriesBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'reqSeriesBox';
      box.className = 'req-comment-box';
      document.body.appendChild(box);
    }
    const rows = series.map(r => {
      const dt = new Date(r.createdAt).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const status = { open: '🟡', in_progress: '🔵', postponed: '⏸', done: '✅' }[r.status] || '?';
      const isTpl = r.recurrence?.templateId === r.id;
      return `<tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:.4rem .6rem;color:#1e293b">${dt}</td>
        <td style="padding:.4rem .6rem;color:#1e293b">${status} ${r.status}</td>
        <td style="padding:.4rem .6rem;color:#1e293b">${isTpl ? '<b>Template</b>' : 'Occurrence'}</td>
      </tr>`;
    }).join('');
    const tpl = DB.getRequests()[templateId];
    const rec = tpl?.recurrence || {};
    const nextAt = rec.nextAt && (!rec.until || rec.nextAt <= rec.until)
      ? new Date(rec.nextAt).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'série terminée';
    // Force un thème clair sur cette modal (la classe parent req-comment-box
    // a un fond sombre destiné au textarea de commentaire — pas adapté ici).
    box.style.background = '#fff';
    box.style.border = '1px solid #e2e8f0';
    box.style.color = '#1e293b';
    box.innerHTML = `
      <div class="req-comment-box-inner" style="max-width:560px;color:#1e293b">
        <h3 style="margin:0 0 .4rem;font-size:1rem;color:#1a3a5c">📜 Série récurrente</h3>
        <p style="font-size:.85rem;color:#64748b;margin:0 0 .6rem">
          ${series.length} occurrence(s) — prochaine : <b style="color:#1a3a5c">${nextAt}</b>
        </p>
        <div style="max-height:320px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;background:#fff">
          <table style="width:100%;border-collapse:collapse;font-size:.83rem;background:#fff">
            <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
              <th style="text-align:left;padding:.4rem .6rem;color:#1a3a5c">Date</th>
              <th style="text-align:left;padding:.4rem .6rem;color:#1a3a5c">Statut</th>
              <th style="text-align:left;padding:.4rem .6rem;color:#1a3a5c">Type</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="req-comment-box-actions">
          <button class="btn-primary" id="reqSeriesClose">Fermer</button>
        </div>
      </div>`;
    box.classList.remove('hidden');
    document.getElementById('reqSeriesClose').onclick = () => {
      box.classList.add('hidden');
      // Restaurer le style par défaut pour ne pas contaminer les autres usages
      // de req-comment-box (comment/theme picker).
      box.style.background = '';
      box.style.border = '';
      box.style.color = '';
    };
  },

  // Niveau d'urgence effectif (rétrocompat : urgent=true → niveau 5 si level absent)
  _urgencyLevel(r) {
    const l = parseInt(r?.urgencyLevel);
    if (l >= 1 && l <= 5) return l;
    return r?.urgent ? 5 : 3;
  },

  _renderCard(id, r, isAdmin, agents, TYPE_ICONS, STATUS_LABELS) {
    const icon    = TYPE_ICONS[r.type] || '📋';
    const d       = new Date(r.createdAt);
    const dateStr = d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const timeStr = d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
    const uLevel  = this._urgencyLevel(r);
    const urgBadge = `<span class="req-urg-badge req-urg-${uLevel}" title="Niveau d'urgence : ${uLevel}/5">⚡ ${uLevel}/5</span>`;
    const localTxt = r.local ? `<span class="req-local">📍 ${escapeHtml(r.local)}</span>` : '';
    // Assignation : ouvrier sans compte prioritaire sur assignedTo legacy.
    let assignedTxt = '';
    if (r.workerId && (r.workerBadge || r.workerName)) {
      assignedTxt = `<span class="req-assigned">👷 ${escapeHtml(r.workerBadge || '')}${r.workerName ? ' · ' + escapeHtml(r.workerName) : ''}</span>`;
    } else if (r.assignedTo) {
      assignedTxt = `<span class="req-assigned">👷 ${escapeHtml(r.assignedToName || r.assignedTo)}</span>`;
    }
    // Indicateur "reportée jusqu'au…"
    const reopenTxt = (r.status === 'postponed' && r.reopenAt)
      ? `<span class="req-reopen">⏰ Rouvre le ${new Date(r.reopenAt).toLocaleDateString('fr-BE', { day:'2-digit', month:'2-digit', year:'numeric' })}</span>` : '';

    // Badge thème (liste dépend du type de requête)
    const themeLabel = DB.getThemeLabelForRequestType?.(r.type, r.themeId)
      || DB.getTechThemeLabel?.(r.themeId)
      || 'Non catégorisé';
    const themeBadge = r.themeId
      ? `<span class="req-theme-badge">🏷️ ${escapeHtml(themeLabel)}</span>`
      : `<span class="req-theme-badge req-theme-none">🏷️ Non catégorisé</span>`;

    // Badge récurrence
    const rec = r.recurrence;
    const isTemplate   = !!(rec && rec.templateId === id);
    const isOccurrence = !!(rec && rec.templateId && rec.templateId !== id);
    let recurBadge = '';
    if (isTemplate) {
      const unitLabels = { days: 'jour(s)', weeks: 'semaine(s)', months: 'mois' };
      const label = `tous les ${rec.interval} ${unitLabels[rec.unit] || rec.unit}`;
      const future = r.createdAt > Date.now();
      const startTxt = future
        ? ` — démarre ${new Date(r.createdAt).toLocaleDateString('fr-BE', { day:'2-digit', month:'long', year:'numeric' })}`
        : '';
      recurBadge = `<span class="req-recur-badge" title="Template récurrent — ${escapeHtml(label)}${escapeHtml(startTxt)}">↻ Série ${escapeHtml(label)}${escapeHtml(startTxt)}</span>`;
    } else if (isOccurrence) {
      recurBadge = `<span class="req-recur-badge req-recur-occ" title="Occurrence d'une série récurrente">↻ Occurrence</span>`;
    }

    const isMyTask = r.assignedTo === this._agentKey;

    // Boutons selon statut
    let actions = '';
    // Assignation ouvrier (admin) : disponible sur open ET in_progress pour
    // permettre une réassignation en cas d'erreur.
    const canAssign = isAdmin && (r.status === 'open' || r.status === 'in_progress');
    const workerSelect = canAssign ? (() => {
      const workers = DB.getWorkersForRequestType?.(r.type) || [];
      const currentWid = r.workerId || '';
      const workerOptions = workers.map(w =>
        `<option value="${w.id}"${w.id === currentWid ? ' selected' : ''}>${escapeHtml(w.badge)} — ${escapeHtml(w.name)}</option>`
      ).join('');
      const label = r.status === 'in_progress' ? 'Réassigner à…' : 'Assigner à un ouvrier…';
      return `<select class="req-assign-worker-select" data-req-id="${id}" data-req-type="${escapeHtml(r.type)}">
        <option value="">${label}</option>${workerOptions}
      </select>`;
    })() : '';

    if (r.status === 'open') {
      actions += `<button class="req-btn req-btn-claim" data-req-action="claim" data-req-id="${id}">🙋 Je prends</button>`;
      actions += workerSelect;
    } else if (r.status === 'in_progress') {
      actions += `<button class="req-btn req-btn-done" data-req-action="done" data-req-id="${id}">✓ Terminée</button>`;
      actions += `<button class="req-btn req-btn-postpone" data-req-action="postponed" data-req-id="${id}">⏸ Reporter</button>`;
      actions += workerSelect;
    } else if (r.status === 'postponed') {
      actions += `<button class="req-btn req-btn-reopen" data-req-action="open" data-req-id="${id}">🔄 Rouvrir</button>`;
    }

    // Commentaire toujours dispo sauf done sans permission
    if (r.status !== 'done' || isAdmin) {
      actions += `<button class="req-comment-toggle req-btn req-btn-comment" data-req-id="${id}">💬 Commenter</button>`;
    }

    // Catégoriser : sur toutes les requêtes, accessible à ceux qui peuvent gérer
    const canManageReq = isAdmin || DB.hasPermission('manageTechRequests');
    if (canManageReq) {
      actions += `<button class="req-tag-btn req-btn req-btn-tag" data-req-id="${id}">🏷️ Catégoriser</button>`;
      // Redéfinir le niveau d'urgence (visible sauf sur les requêtes terminées)
      if (r.status !== 'done') {
        actions += `<button class="req-urg-edit-btn req-btn req-btn-urg-edit" data-req-id="${id}" title="Changer le niveau d'urgence">⚡ Urgence</button>`;
      }
    }

    // Actions série (template uniquement)
    if (isTemplate && canManageReq) {
      const isStopped = rec.until && rec.until <= Date.now();
      if (!isStopped) {
        actions += `<button class="req-stop-series req-btn req-btn-stop-series" data-req-id="${id}">⏹ Arrêter la série</button>`;
      }
      actions += `<button class="req-view-series req-btn req-btn-view-series" data-req-id="${id}">📜 Voir la série</button>`;
    }

    // Commentaires existants
    const comments = r.comments ? Object.entries(r.comments)
      .sort(([, a], [, b]) => a.createdAt - b.createdAt)
      .map(([, c]) => {
        const cd = new Date(c.createdAt);
        const ct = cd.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' }) + ' ' +
                   cd.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
        return `<div class="req-comment"><span class="req-comment-author">${escapeHtml(c.agentName || '?')}</span> <span class="req-comment-time">${ct}</span><p class="req-comment-text">${escapeHtml(c.text)}</p></div>`;
      }).join('') : '';

    // Supprimer (admin)
    const delBtn = isAdmin
      ? `<button class="req-del-btn" data-req-action="delete" data-req-id="${id}" title="Supprimer">✕</button>`
      : '';

    return `
      <div class="req-card req-status-${r.status} req-urg-card-${uLevel}${uLevel >= 5 ? ' req-urgent' : ''}">
        <div class="req-card-hd">
          <span class="req-type-icon">${icon}</span>
          <span class="req-from">${escapeHtml(r.fromAgentName || '?')}</span>
          ${urgBadge}
          ${recurBadge}
          <span class="req-date">${dateStr} ${timeStr}</span>
          ${delBtn}
        </div>
        <div class="req-card-body">
          <p class="req-desc">${escapeHtml(r.description)}</p>
          <div class="req-meta">${themeBadge}${localTxt}${assignedTxt}${reopenTxt}</div>
        </div>
        ${comments ? `<div class="req-comments">${comments}</div>` : ''}
        <div class="req-actions">${actions}</div>
      </div>`;
  },

  async _handleAction(action, id, agentKey, agents) {
    // Lire la requête AVANT modification pour avoir fromAgentKey intact
    const req  = DB.getRequests()[id];
    const tech = this._agentName || 'Un technicien';
    const desc = req?.description?.slice(0, 60) || '';

    const _notifyRequester = async (msg, type = 'info') => {
      if (req?.fromAgentKey) await DB.sendNotif(msg, type, req.fromAgentKey, {
        fromAgentKey:  this._agentKey,
        fromAgentName: tech,
      });
    };

    if (action === 'claim') {
      await DB.claimRequest(id);
      await _notifyRequester(`🙋 ${tech} a pris en charge votre demande : « ${desc} »`);

    } else if (action === 'done') {
      await DB.setRequestStatus(id, 'done');
      await _notifyRequester(`✅ ${tech} a résolu votre demande : « ${desc} »`);

    } else if (action === 'postponed') {
      // Dialog : proposer une date de réouverture optionnelle. Si vide →
      // report sans échéance (comportement legacy).
      const reopenAt = await this._askReopenDate();
      if (reopenAt === 'cancel') return;
      await DB.postponeRequest(id, reopenAt);
      const suffix = reopenAt
        ? `, réouverture prévue le ${new Date(reopenAt).toLocaleDateString('fr-BE', { day:'2-digit', month:'2-digit', year:'numeric' })}`
        : '';
      await _notifyRequester(`⏸ ${tech} a reporté votre demande : « ${desc} »${suffix}`, 'warn');

    } else if (action === 'open') {
      await DB._ref(`requests/${id}`).update({ status: 'open', reopenAt: null });
      await _notifyRequester(`🔄 ${tech} a rouvert votre demande : « ${desc} »`);

    } else if (action === 'assign' && agentKey) {
      await DB.assignRequest(id, agentKey);
      const assignedName = agents.find(a => a.key === agentKey)?.name || agentKey;
      await _notifyRequester(`👤 Votre demande « ${desc} » a été assignée à ${assignedName}`);

    } else if (action === 'delete') {
      if (confirm('Supprimer cette intervention ?')) await DB.deleteRequest(id);
    }
  },

  // Dialog "Reporter" : demande une date optionnelle de réouverture.
  // Retourne le timestamp choisi, null (pas de date), ou 'cancel' si annulé.
  _askReopenDate() {
    return new Promise(resolve => {
      let box = document.getElementById('reqReopenBox');
      if (!box) {
        box = document.createElement('div');
        box.id = 'reqReopenBox';
        box.className = 'req-comment-box';
        document.body.appendChild(box);
      }
      // Date par défaut : demain
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dIso = tomorrow.toISOString().slice(0, 10);
      box.innerHTML = `
        <div class="req-comment-box-inner">
          <h3 style="margin:0 0 .4rem;font-size:1rem;color:#1a3a5c">⏸ Reporter cette requête</h3>
          <p style="font-size:.82rem;color:#64748b;margin:0 0 .7rem">Choisis une date de réouverture automatique (optionnel).</p>
          <input type="date" id="reqReopenInput" value="${dIso}" min="${new Date().toISOString().slice(0, 10)}"
                 style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:.5rem .65rem;font-size:.9rem;font-family:inherit">
          <div class="req-comment-box-actions" style="justify-content:space-between;margin-top:.75rem">
            <button class="btn-secondary" id="reqReopenClear">Sans date</button>
            <div style="display:flex;gap:.5rem">
              <button class="btn-secondary" id="reqReopenCancel">Annuler</button>
              <button class="btn-primary" id="reqReopenOk">Reporter</button>
            </div>
          </div>
        </div>`;
      box.classList.remove('hidden');

      const close = (val) => { box.classList.add('hidden'); resolve(val); };
      document.getElementById('reqReopenCancel').onclick = () => close('cancel');
      document.getElementById('reqReopenClear').onclick  = () => close(null);
      document.getElementById('reqReopenOk').onclick = () => {
        const v = document.getElementById('reqReopenInput')?.value;
        if (!v) { close(null); return; }
        // Ouverture à 00:00 locale du jour choisi
        const d = new Date(v);
        d.setHours(0, 0, 0, 0);
        close(d.getTime());
      };
    });
  },

  _openCommentBox(reqId) {
    const req = DB.getRequests()[reqId];
    let box = document.getElementById('reqCommentBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'reqCommentBox';
      box.className = 'req-comment-box';
      document.body.appendChild(box);
    }
    box.innerHTML = `
      <div class="req-comment-box-inner">
        <textarea id="reqCommentText" rows="3" placeholder="Ajouter un commentaire…"></textarea>
        <div class="req-comment-box-actions">
          <button class="btn-secondary" id="reqCommentCancel">Annuler</button>
          <button class="btn-primary" id="reqCommentSend">Envoyer</button>
        </div>
      </div>`;
    box.classList.remove('hidden');
    document.getElementById('reqCommentText')?.focus();

    document.getElementById('reqCommentCancel')?.addEventListener('click', () => box.classList.add('hidden'));
    document.getElementById('reqCommentSend')?.addEventListener('click', async () => {
      const text = document.getElementById('reqCommentText')?.value.trim();
      if (!text) return;
      await DB.addRequestComment(reqId, text);
      // Notifier le demandeur
      if (req?.fromAgentKey) {
        const tech = this._agentName || 'Un technicien';
        const desc = req?.description?.slice(0, 50) || '';
        await DB.sendNotif(
          `💬 ${tech} a commenté votre demande « ${desc} » : ${text.slice(0, 80)}`,
          'info', req.fromAgentKey,
          { fromAgentKey: this._agentKey, fromAgentName: tech }
        );
      }
      box.classList.add('hidden');
      if (typeof showToast === 'function') showToast('Commentaire ajouté ✓');
    });
  },

  // Appelé depuis _initTechIssueModal après avoir créé la requête
  async notifyTech(requestId, req, targetAgentKeys) {
    const typeLabels = { technique: '🔧 Problème technique', entretien: '🧹 Entretien', autre: '📋 Requête' };
    const label   = typeLabels[req.type] || '📋 Requête';
    const local   = req.local ? ` — ${req.local}` : '';
    const urgent  = req.urgent ? ' 🚨' : '';
    const message = `${label}${local}${urgent}\n${req.description}`;
    for (const key of targetAgentKeys) {
      await DB.sendNotif(message, req.urgent ? 'alert' : 'warn', key, {
        fromAgentKey:  req.fromAgentKey,
        fromAgentName: req.fromAgentName,
        local:         req.local,
        description:   req.description,
        replyable:     true,
        techRequestId: requestId,
      });
    }
  },
};
