// ═══════════════════════════════════════════════════════════════════
// requests.js — Vue Interventions (tickets technique / entretien)
// ═══════════════════════════════════════════════════════════════════

const REQUESTS = {
  _panel:       null,
  _badge:       null,
  _panelOpen:   false,
  _agentKey:    null,
  _agentName:   null,
  _agentRole:   null,
  _filter:      'open', // 'open' | 'in_progress' | 'postponed' | 'done'

  // Rôles qui voient le panneau interventions
  _TECH_ROLES: new Set(['__technicien__', '__entretien__', '__admin__', '__chef_service__', '__direction__', '__responsable_technique__']),

  init() {
    this._agentKey  = sessionStorage.getItem('cpas_current_agent_key');
    this._panel     = document.getElementById('interventionsPanel');
    this._badge     = document.getElementById('interventionsBadge');

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

    // Bouton header
    document.getElementById('btnInterventions')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel();
    });

    // Fermer en cliquant ailleurs
    document.addEventListener('click', (e) => {
      if (this._panelOpen &&
          this._panel && !this._panel.contains(e.target) &&
          !document.getElementById('btnInterventions')?.contains(e.target)) {
        this._closePanel();
      }
    });
  },

  _canSee() {
    return this._TECH_ROLES.has(this._agentRole);
  },

  // Types de requêtes visibles selon le rôle
  _visibleTypes() {
    if (!this._agentRole) return new Set(); // rôle inconnu → rien
    if (this._agentRole === '__technicien__') return new Set(['technique']);
    if (this._agentRole === '__entretien__')  return new Set(['entretien']);
    return null; // admin/direction/chef → voit tout (null = pas de filtre)
  },

  _filterByRole(req) {
    const types = this._visibleTypes();
    return !types || types.has(req.type);
  },

  _updateHeaderBtn() {
    const btn = document.getElementById('btnInterventions');
    if (!btn) return;
    const featureOn = DB._config.features?.['enableInterventions'] !== false;
    btn.style.display = (featureOn && this._canSee()) ? '' : 'none';
  },

  _updateBadge() {
    if (!this._badge) return;
    const reqs = DB.getRequests();
    const open = Object.values(reqs).filter(r => r.status === 'open' && this._filterByRole(r)).length;
    this._badge.textContent = open > 9 ? '9+' : (open || '');
    this._badge.classList.toggle('hidden', !open);
  },

  togglePanel() {
    if (this._panelOpen) this._closePanel();
    else this._openPanel();
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

    // Compter par statut (filtré par rôle)
    const counts = { open: 0, in_progress: 0, postponed: 0, done: 0 };
    Object.values(reqs).forEach(r => {
      if (counts[r.status] !== undefined && this._filterByRole(r)) counts[r.status]++;
    });

    const filtered = Object.entries(reqs)
      .filter(([, r]) => r.status === this._filter && this._filterByRole(r))
      .sort(([, a], [, b]) => b.createdAt - a.createdAt);

    const tabBtn = (status, label) => {
      const active = this._filter === status;
      const cnt = counts[status];
      return `<button class="req-tab${active ? ' active' : ''}" data-status="${status}">
        ${label}${cnt ? ` <span class="req-tab-count">${cnt}</span>` : ''}
      </button>`;
    };

    this._panel.innerHTML = `
      <div class="req-panel-hd">
        <span>🛠️ Interventions</span>
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

    // Assign select
    this._panel.querySelectorAll('.req-assign-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        e.stopPropagation();
        const id = sel.dataset.reqId;
        if (sel.value) await DB.assignRequest(id, sel.value);
        sel.value = '';
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
  },

  _openThemePicker(reqId) {
    const req = DB.getRequests()[reqId];
    if (!req) return;
    const themes = DB.getTechThemes();
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
      return `<tr>
        <td>${dt}</td>
        <td>${status} ${r.status}</td>
        <td>${isTpl ? '<b>Template</b>' : 'Occurrence'}</td>
      </tr>`;
    }).join('');
    const tpl = DB.getRequests()[templateId];
    const rec = tpl?.recurrence || {};
    const nextAt = rec.nextAt && (!rec.until || rec.nextAt <= rec.until)
      ? new Date(rec.nextAt).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'série terminée';
    box.innerHTML = `
      <div class="req-comment-box-inner" style="max-width:560px">
        <h3 style="margin:0 0 .4rem;font-size:1rem;color:#1a3a5c">📜 Série récurrente</h3>
        <p style="font-size:.85rem;color:#64748b;margin:0 0 .6rem">
          ${series.length} occurrence(s) — prochaine : <b>${nextAt}</b>
        </p>
        <div style="max-height:320px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px">
          <table style="width:100%;border-collapse:collapse;font-size:.83rem">
            <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0"><th style="text-align:left;padding:.4rem .6rem">Date</th><th style="text-align:left;padding:.4rem .6rem">Statut</th><th style="text-align:left;padding:.4rem .6rem">Type</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="req-comment-box-actions">
          <button class="btn-primary" id="reqSeriesClose">Fermer</button>
        </div>
      </div>`;
    box.classList.remove('hidden');
    document.getElementById('reqSeriesClose').onclick = () => box.classList.add('hidden');
  },

  _renderCard(id, r, isAdmin, agents, TYPE_ICONS, STATUS_LABELS) {
    const icon    = TYPE_ICONS[r.type] || '📋';
    const d       = new Date(r.createdAt);
    const dateStr = d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' });
    const timeStr = d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
    const urgBadge = r.urgent ? `<span class="req-badge-urgent">🚨 Urgent</span>` : '';
    const localTxt = r.local ? `<span class="req-local">📍 ${escapeHtml(r.local)}</span>` : '';
    const assignedTxt = r.assignedTo
      ? `<span class="req-assigned">👷 ${escapeHtml(r.assignedToName || r.assignedTo)}</span>` : '';

    // Badge thème
    const themeLabel = DB.getTechThemeLabel?.(r.themeId) || 'Non catégorisé';
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
      recurBadge = `<span class="req-recur-badge" title="Template récurrent — ${escapeHtml(label)}">↻ Série ${escapeHtml(label)}</span>`;
    } else if (isOccurrence) {
      recurBadge = `<span class="req-recur-badge req-recur-occ" title="Occurrence d'une série récurrente">↻ Occurrence</span>`;
    }

    const isMyTask = r.assignedTo === this._agentKey;

    // Boutons selon statut
    let actions = '';
    if (r.status === 'open') {
      actions += `<button class="req-btn req-btn-claim" data-req-action="claim" data-req-id="${id}">🙋 Je prends</button>`;
      if (isAdmin) {
        const options = agents.map(a =>
          `<option value="${a.key}">${escapeHtml(a.name)}</option>`
        ).join('');
        actions += `<select class="req-assign-select" data-req-id="${id}">
          <option value="">Assigner à…</option>${options}
        </select>`;
      }
    } else if (r.status === 'in_progress') {
      actions += `<button class="req-btn req-btn-done" data-req-action="done" data-req-id="${id}">✓ Terminée</button>`;
      actions += `<button class="req-btn req-btn-postpone" data-req-action="postponed" data-req-id="${id}">⏸ Reporter</button>`;
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
      <div class="req-card req-status-${r.status}${r.urgent ? ' req-urgent' : ''}">
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
          <div class="req-meta">${themeBadge}${localTxt}${assignedTxt}</div>
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
      await DB.setRequestStatus(id, 'postponed');
      await _notifyRequester(`⏸ ${tech} a reporté votre demande : « ${desc} »`, 'warn');

    } else if (action === 'open') {
      await DB.setRequestStatus(id, 'open');
      await _notifyRequester(`🔄 ${tech} a rouvert votre demande : « ${desc} »`);

    } else if (action === 'assign' && agentKey) {
      await DB.assignRequest(id, agentKey);
      const assignedName = agents.find(a => a.key === agentKey)?.name || agentKey;
      await _notifyRequester(`👤 Votre demande « ${desc} » a été assignée à ${assignedName}`);

    } else if (action === 'delete') {
      if (confirm('Supprimer cette intervention ?')) await DB.deleteRequest(id);
    }
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
