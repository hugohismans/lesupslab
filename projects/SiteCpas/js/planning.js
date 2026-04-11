// ═══════════════════════════════════════════════════════════════════
// planning.js — Planning agents entretien / technicien
// ═══════════════════════════════════════════════════════════════════

const PLANNING = {

  // ── État interne ─────────────────────────────────────────────────
  _weekDate:       null,   // Date de référence (n'importe quel jour de la semaine)
  _filterAgentKey: null,   // Agent affiché (null = agent connecté)
  _editId:         null,   // ID de la tâche en cours d'édition
  _editOccDate:    null,   // Date d'occurrence pour les tâches récurrentes

  // ── Initialisation ───────────────────────────────────────────────
  init() {
    this._weekDate = new Date();
    this._bindHeader();
    this._bindAddButton();
    this._bindModal();
  },

  // ── Aides date ───────────────────────────────────────────────────
  _isoDate(d) { return d.toISOString().slice(0, 10); },

  _weekStart(d) {
    const dt = new Date(d);
    const day = dt.getDay(); // 0=dim
    const diff = day === 0 ? -6 : 1 - day;
    dt.setDate(dt.getDate() + diff);
    dt.setHours(0, 0, 0, 0);
    return dt;
  },

  _addDays(d, n) {
    const dt = new Date(d);
    dt.setDate(dt.getDate() + n);
    return dt;
  },

  // ── Expansion des récurrences ────────────────────────────────────
  // Retourne un tableau d'occurrences {id, _start, _end, _occDate, checkinAt, doneAt, status, ...task}
  expandTask(id, task, rangeStart, rangeEnd) {
    if (!task.dateStart || !task.dateEnd) return [];
    const tStart = new Date(task.dateStart);
    const tEnd   = new Date(task.dateEnd);
    const recType = task.recurrence?.type || 'none';

    if (recType === 'none') {
      if (tStart > rangeEnd || tEnd < rangeStart) return [];
      const occDate = this._isoDate(tStart);
      const occData = task.occurrences?.[occDate] || {};
      return [{
        id, ...task,
        _start: tStart, _end: tEnd, _occDate: null,
        checkinAt: task.checkinAt || null,
        doneAt:    task.doneAt    || null,
        _status:   task.status    || 'planned',
      }];
    }

    const results = [];
    const recEnd = task.recurrence?.endDate ? new Date(task.recurrence.endDate + 'T23:59:59') : null;
    let cur = new Date(tStart);
    let guard = 0;

    while (cur <= rangeEnd && guard < 700) {
      guard++;
      if (recEnd && cur > recEnd) break;

      const occDate = this._isoDate(cur);

      // Sauter les exceptions
      if (!task.exceptions?.[occDate]) {
        if (cur >= rangeStart) {
          const occEnd = new Date(cur);
          occEnd.setHours(tEnd.getHours(), tEnd.getMinutes(), 0, 0);
          const occData = task.occurrences?.[occDate] || {};
          results.push({
            id, ...task,
            _start: new Date(cur), _end: occEnd, _occDate: occDate,
            checkinAt: occData.checkinAt || null,
            doneAt:    occData.doneAt    || null,
            _status:   occData.status    || task.status || 'planned',
          });
        }
      }

      // Avance selon la récurrence
      if (recType === 'daily') {
        cur = this._addDays(cur, 1);
      } else if (recType === 'weekly') {
        cur = this._addDays(cur, 7);
      } else if (recType === 'workdays') {
        cur = this._addDays(cur, 1);
        while (cur.getDay() === 0 || cur.getDay() === 6) {
          cur = this._addDays(cur, 1);
        }
      } else {
        break;
      }
    }

    return results;
  },

  // ── Statut calculé côté client ───────────────────────────────────
  computeStatus(occ) {
    if (occ.doneAt || occ._status === 'done') return 'done';
    if (occ.checkinAt || occ._status === 'inprogress') return 'inprogress';
    const now = Date.now();
    if (occ._end && occ._end.getTime() < now && !occ.checkinAt) return 'missed';
    return 'planned';
  },

  // ── Tâches pour une semaine donnée ───────────────────────────────
  getForWeek(agentKey, weekDate) {
    const ws = this._weekStart(weekDate);
    const we = this._addDays(ws, 6);
    we.setHours(23, 59, 59, 999);

    const tasks = DB.getPlanningTasks();
    const occs  = [];

    Object.entries(tasks).forEach(([id, task]) => {
      if (agentKey && task.agentKey !== agentKey) return;
      const expanded = this.expandTask(id, task, ws, we);
      occs.push(...expanded);
    });

    return occs;
  },

  // ── Navigation / rendu ───────────────────────────────────────────
  render() {
    const panel = document.getElementById('planningPanel');
    if (!panel || panel.classList.contains('hidden')) return;

    const myKey     = sessionStorage.getItem('cpas_current_agent_key');
    const canViewAll = DB.hasPermission('viewAllPlanning');
    const viewKey   = (canViewAll && this._filterAgentKey) ? this._filterAgentKey
                    : canViewAll ? null  // null = tous si manager
                    : myKey;

    this._renderWeekLabel();
    this._renderAgentPicker();
    this._renderWeekGrid(viewKey);
  },

  _renderWeekLabel() {
    const ws = this._weekStart(this._weekDate);
    const we = this._addDays(ws, 4);
    const fmtD = d => d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' });
    const el = document.getElementById('plWeekLabel');
    if (el) el.textContent = `${fmtD(ws)} – ${fmtD(we)} ${we.getFullYear()}`;
  },

  _renderAgentPicker() {
    const wrap = document.getElementById('plAgentPicker');
    if (!wrap) return;
    if (!DB.hasPermission('viewAllPlanning')) { wrap.innerHTML = ''; return; }

    // Agents entretien ou technicien uniquement
    const eligible = DB.getAgentsWithKeys().filter(a => {
      const r = DB.getAgentPermRole?.(a.key);
      return r === '__entretien__' || r === '__technicien__';
    });

    if (!eligible.length) { wrap.innerHTML = ''; return; }

    const opts = `<option value="">Tous</option>` +
      eligible.map(a => {
        const color = DB.getAgentColorByKey?.(a.key) || '#6b7280';
        return `<option value="${a.key}" ${this._filterAgentKey === a.key ? 'selected' : ''}>${a.name}</option>`;
      }).join('');

    wrap.innerHTML = `<select class="pl-agent-select" id="plAgentSelect">${opts}</select>`;
    wrap.querySelector('#plAgentSelect')?.addEventListener('change', e => {
      this._filterAgentKey = e.target.value || null;
      this.render();
    });
  },

  _renderWeekGrid(agentKey) {
    const grid = document.getElementById('plGrid');
    if (!grid) return;

    const ws  = this._weekStart(this._weekDate);
    const today = this._isoDate(new Date());
    const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

    // Récupérer toutes les occurrences de la semaine
    const myKey = sessionStorage.getItem('cpas_current_agent_key');
    const allOccs = this.getForWeek(agentKey, this._weekDate);

    // Regrouper par jour (lun=0 … ven=4)
    const byDay = [[], [], [], [], []];
    allOccs.forEach(occ => {
      const d = new Date(occ._start);
      d.setHours(0,0,0,0);
      const ws2 = this._weekStart(this._weekDate);
      const dayIdx = Math.round((d - ws2) / 86400000);
      if (dayIdx >= 0 && dayIdx <= 4) byDay[dayIdx].push(occ);
    });

    // Trier chaque jour par heure de début
    byDay.forEach(arr => arr.sort((a, b) => a._start - b._start));

    const canManage = DB.hasPermission('managePlanning');

    let html = '';
    for (let i = 0; i < 5; i++) {
      const dayDate = this._addDays(ws, i);
      const iso     = this._isoDate(dayDate);
      const isToday = iso === today;
      const label   = `${DAY_NAMES[i]} ${dayDate.getDate()}`;

      let cardsHtml = '';
      if (byDay[i].length === 0) {
        cardsHtml = `<div class="pl-day-empty">Aucune tâche</div>`;
      } else {
        byDay[i].forEach(occ => {
          cardsHtml += this._renderTaskCard(occ, myKey, canManage);
        });
      }

      if (canManage) {
        cardsHtml += `<button class="pl-day-add" data-date="${iso}" title="Ajouter une tâche ce jour">+ Ajouter</button>`;
      }

      html += `
        <div class="pl-day-col${isToday ? ' pl-day-today' : ''}">
          <div class="pl-day-hd">${label}</div>
          <div class="pl-day-body">${cardsHtml}</div>
        </div>`;
    }

    grid.innerHTML = html;

    // Binder les boutons
    grid.querySelectorAll('.pl-btn-checkin').forEach(btn => {
      btn.addEventListener('click', () => this._checkin(btn.dataset.task, btn.dataset.occ || null));
    });
    grid.querySelectorAll('.pl-btn-done').forEach(btn => {
      btn.addEventListener('click', () => this._markDone(btn.dataset.task, btn.dataset.occ || null));
    });
    grid.querySelectorAll('.pl-btn-edit').forEach(btn => {
      btn.addEventListener('click', () => this.openModal({ taskId: btn.dataset.task, occDate: btn.dataset.occ || null }));
    });
    grid.querySelectorAll('.pl-day-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const agSel = this._filterAgentKey || (DB.getAgentPermRole?.(sessionStorage.getItem('cpas_current_agent_key')) === '__entretien__' || DB.getAgentPermRole?.(sessionStorage.getItem('cpas_current_agent_key')) === '__technicien__' ? sessionStorage.getItem('cpas_current_agent_key') : null);
        this.openModal({ date: btn.dataset.date, agentKey: agSel });
      });
    });
  },

  _renderTaskCard(occ, myKey, canManage) {
    const status = this.computeStatus(occ);

    // Label de localisation
    let locLabel = '';
    if (occ.locationMode === 'lieu' && occ.lieuId) {
      const l = DB.getLieux?.()[occ.lieuId];
      locLabel = l ? l.name : occ.lieuId;
    } else if (occ.locationMode === 'locaux' && occ.localIds) {
      locLabel = Object.keys(occ.localIds).map(id => DB.getLocalLabel?.(id) || id).join(', ');
    }

    const fmtH = d => d ? d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '';
    const timeStr = `${fmtH(occ._start)}${occ._end ? ` – ${fmtH(occ._end)}` : ''}`;

    const recIcon = occ.recurrence?.type && occ.recurrence.type !== 'none' ? ' ↻' : '';

    const STATUS_LABEL = { planned: '📅 Planifié', inprogress: '🔄 En cours', done: '✅ Terminé', missed: '⚠️ Manqué' };

    const isOwner = occ.agentKey === myKey;

    // Nom de l'agent (pour la vue "tous les agents")
    const agentObj = DB.getAgentsWithKeys?.().find(a => a.key === occ.agentKey);
    const agentName = agentObj?.name || '';
    const agentColor = DB.getAgentColorByKey?.(occ.agentKey) || '#6b7280';

    let actions = '';
    if (isOwner) {
      if (status === 'planned' || status === 'missed') {
        actions += `<button class="pl-btn-checkin" data-task="${occ.id}" data-occ="${occ._occDate || ''}">✓ Je suis là</button>`;
      }
      if (status === 'inprogress') {
        actions += `<button class="pl-btn-done" data-task="${occ.id}" data-occ="${occ._occDate || ''}">✓ Terminé</button>`;
      }
    }
    const editBtn = canManage
      ? `<button class="pl-btn-edit" data-task="${occ.id}" data-occ="${occ._occDate || ''}" title="Modifier">✏️</button>`
      : '';

    return `
      <div class="pl-task-card pl-task-${status}">
        <div class="pl-task-hd">
          <span class="pl-task-time">${timeStr}${recIcon}</span>
          ${editBtn}
        </div>
        <div class="pl-task-title">${escapeHtml(occ.title || '')}</div>
        ${occ.description ? `<div class="pl-task-desc">${escapeHtml(occ.description)}</div>` : ''}
        ${locLabel ? `<div class="pl-task-loc">📍 ${escapeHtml(locLabel)}</div>` : ''}
        ${!occ.agentKey || occ.agentKey !== myKey ? `<div class="pl-task-agent" style="color:${agentColor}">👤 ${escapeHtml(agentName)}</div>` : ''}
        <div class="pl-task-status-badge pl-badge-${status}">${STATUS_LABEL[status] || ''}</div>
        ${actions ? `<div class="pl-task-actions">${actions}</div>` : ''}
      </div>`;
  },

  // ── Actions agent ────────────────────────────────────────────────
  async _checkin(taskId, occDate) {
    const task  = DB.getPlanningTasks()[taskId];
    const myKey = sessionStorage.getItem('cpas_current_agent_key');
    if (!task || task.agentKey !== myKey) return;
    await DB.checkinPlanningTask(taskId, occDate || null);
    showToast('Présence confirmée ✓');
  },

  async _markDone(taskId, occDate) {
    const task  = DB.getPlanningTasks()[taskId];
    const myKey = sessionStorage.getItem('cpas_current_agent_key');
    if (!task || task.agentKey !== myKey) return;
    await DB.donePlanningTask(taskId, occDate || null);
    showToast('Tâche terminée ✓');
  },

  // ── Navigation semaine ───────────────────────────────────────────
  _bindHeader() {
    document.getElementById('plBtnPrev')?.addEventListener('click', () => {
      this._weekDate = this._addDays(this._weekDate, -7);
      this.render();
    });
    document.getElementById('plBtnNext')?.addEventListener('click', () => {
      this._weekDate = this._addDays(this._weekDate, 7);
      this.render();
    });
    document.getElementById('plBtnToday')?.addEventListener('click', () => {
      this._weekDate = new Date();
      this.render();
    });
  },

  _bindAddButton() {
    document.getElementById('plBtnAdd')?.addEventListener('click', () => {
      const agSel = this._filterAgentKey || null;
      this.openModal({ agentKey: agSel });
    });
  },

  // ── Modal création / édition ─────────────────────────────────────
  openModal({ taskId = null, agentKey = null, date = null, occDate = null } = {}) {
    this._editId      = taskId;
    this._editOccDate = occDate;

    const modal = document.getElementById('planningModal');
    if (!modal) return;

    const isEdit = !!taskId;
    document.getElementById('plModalTitle').textContent = isEdit ? 'Modifier la tâche' : 'Nouvelle tâche';
    document.getElementById('plModalDelete').classList.toggle('hidden', !isEdit);

    // Peupler le select agents (entretien + technicien uniquement)
    const agentSel = document.getElementById('plModalAgent');
    if (agentSel) {
      const eligible = DB.getAgentsWithKeys?.().filter(a => {
        const r = DB.getAgentPermRole?.(a.key);
        return r === '__entretien__' || r === '__technicien__';
      }) || [];
      agentSel.innerHTML = `<option value="">— Sélectionner —</option>` +
        eligible.map(a => `<option value="${a.key}">${escapeHtml(a.name)}</option>`).join('');
    }

    // Peupler les lieux + locaux
    this._renderLocationPicker();

    // Mode édition : pré-remplir les champs
    if (isEdit) {
      const task = DB.getPlanningTasks()[taskId];
      if (task) {
        _v('plTitle',      task.title || '');
        _v('plDescription', task.description || '');
        if (agentSel) agentSel.value = task.agentKey || '';
        const startDt = task.dateStart ? task.dateStart.slice(0, 10) : '';
        const startT  = task.dateStart ? task.dateStart.slice(11, 16) : '';
        const endT    = task.dateEnd   ? task.dateEnd.slice(11, 16)   : '';
        _v('plDate',      startDt);
        _v('plTimeStart', startT);
        _v('plTimeEnd',   endT);
        _v('plRecType',   task.recurrence?.type || 'none');
        _v('plRecEndDate', task.recurrence?.endDate || '');

        // Mode localisation
        const mode = task.locationMode || 'lieu';
        document.querySelectorAll('input[name="plLocMode"]').forEach(r => {
          r.checked = r.value === mode;
        });
        this._handleLocModeChange();

        if (mode === 'lieu') _v('plLieuSelect', task.lieuId || '');
        if (mode === 'locaux' && task.localIds) {
          document.querySelectorAll('input[name="plLocal"]').forEach(cb => {
            cb.checked = !!task.localIds[cb.value];
          });
        }
      }
    } else {
      // Réinitialiser
      _v('plTitle', ''); _v('plDescription', ''); _v('plDate', date || '');
      _v('plTimeStart', '08:00'); _v('plTimeEnd', '10:00');
      _v('plRecType', 'none'); _v('plRecEndDate', '');
      if (agentSel && agentKey) agentSel.value = agentKey;
      document.querySelectorAll('input[name="plLocMode"]').forEach((r, i) => r.checked = i === 0);
      this._handleLocModeChange();
    }

    // Récurrence end date
    this._toggleRecEndDate();

    modal.classList.remove('hidden');
    document.getElementById('plTitle')?.focus();
  },

  _renderLocationPicker() {
    const lieux = DB.getLieux?.() || {};

    // Sélecteur lieu entier
    const lieuSel = document.getElementById('plLieuSelect');
    if (lieuSel) {
      lieuSel.innerHTML = `<option value="">— Sélectionner —</option>` +
        Object.entries(lieux).map(([id, l]) =>
          `<option value="${id}">${escapeHtml(l.name)}</option>`
        ).join('');
    }

    // Checkboxes de locaux
    const container = document.getElementById('plLocauxCheckboxes');
    if (container) {
      let html = '';
      Object.entries(lieux).forEach(([lieuId, lieu]) => {
        if (!lieu.localIds?.length) return;
        html += `<p class="pl-loc-group-label">${escapeHtml(lieu.name)}</p>`;
        lieu.localIds.forEach(lid => {
          const label = DB.getLocalLabel?.(lid) || lid;
          html += `<label class="pl-local-cb">
            <input type="checkbox" name="plLocal" value="${lid}">
            <span>${escapeHtml(label)}</span>
          </label>`;
        });
      });
      container.innerHTML = html || '<p style="color:#94a3b8;font-size:.82rem">Aucun local configuré</p>';
    }
  },

  _handleLocModeChange() {
    const mode = document.querySelector('input[name="plLocMode"]:checked')?.value || 'lieu';
    document.getElementById('plLieuWrap')?.classList.toggle('hidden', mode !== 'lieu');
    document.getElementById('plLocauxWrap')?.classList.toggle('hidden', mode !== 'locaux');
  },

  _toggleRecEndDate() {
    const type = document.getElementById('plRecType')?.value;
    document.getElementById('plRecEndWrap')?.classList.toggle('hidden', !type || type === 'none');
  },

  _bindModal() {
    // Fermeture
    document.getElementById('plModalCancel')?.addEventListener('click', () => {
      document.getElementById('planningModal')?.classList.add('hidden');
    });
    document.querySelector('#planningModal .modal-x')?.addEventListener('click', () => {
      document.getElementById('planningModal')?.classList.add('hidden');
    });

    // Récurrence
    document.getElementById('plRecType')?.addEventListener('change', () => this._toggleRecEndDate());

    // Mode localisation
    document.querySelectorAll('input[name="plLocMode"]').forEach(r => {
      r.addEventListener('change', () => this._handleLocModeChange());
    });

    // Sauvegarde
    document.getElementById('plModalSave')?.addEventListener('click', () => this._saveModal());

    // Suppression
    document.getElementById('plModalDelete')?.addEventListener('click', () => this._deleteModal());
  },

  async _saveModal() {
    const title     = (document.getElementById('plTitle')?.value || '').trim();
    const agentKey  = document.getElementById('plModalAgent')?.value;
    const date      = document.getElementById('plDate')?.value;
    const tStart    = document.getElementById('plTimeStart')?.value;
    const tEnd      = document.getElementById('plTimeEnd')?.value;
    const recType   = document.getElementById('plRecType')?.value || 'none';
    const recEnd    = document.getElementById('plRecEndDate')?.value || null;
    const desc      = (document.getElementById('plDescription')?.value || '').trim();

    if (!title || !agentKey || !date || !tStart || !tEnd) {
      showToast('Veuillez remplir tous les champs obligatoires.', 'warn');
      return;
    }

    const mode = document.querySelector('input[name="plLocMode"]:checked')?.value || 'lieu';
    const lieuId = mode === 'lieu' ? (document.getElementById('plLieuSelect')?.value || null) : null;
    const localIds = mode === 'locaux'
      ? Object.fromEntries([...document.querySelectorAll('input[name="plLocal"]:checked')].map(cb => [cb.value, true]))
      : null;

    if (mode === 'lieu' && !lieuId) { showToast('Sélectionnez un lieu.', 'warn'); return; }
    if (mode === 'locaux' && (!localIds || Object.keys(localIds).length === 0)) {
      showToast('Sélectionnez au moins un local.', 'warn'); return;
    }

    const data = {
      title, agentKey,
      description:  desc || null,
      dateStart:    `${date}T${tStart}`,
      dateEnd:      `${date}T${tEnd}`,
      locationMode: mode,
      lieuId:       lieuId  || null,
      localIds:     localIds || null,
      recurrence:   { type: recType, endDate: recEnd || null },
      status: 'planned',
    };

    const btn = document.getElementById('plModalSave');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

    try {
      if (this._editId) {
        await DB.updatePlanningTask(this._editId, data);
        showToast('Tâche modifiée ✓');
      } else {
        await DB.addPlanningTask(data);
        showToast('Tâche ajoutée ✓');
      }
      document.getElementById('planningModal')?.classList.add('hidden');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; }
    }
  },

  async _deleteModal() {
    if (!this._editId) return;
    const task = DB.getPlanningTasks()[this._editId];
    const isRec = task?.recurrence?.type && task.recurrence.type !== 'none';

    if (isRec && this._editOccDate) {
      const choice = confirm(
        `Cette tâche est récurrente.\n\nOK → Supprimer seulement l'occurrence du ${this._editOccDate}\nAnnuler → Supprimer toute la série`
      );
      if (choice) {
        await DB.addPlanningException(this._editId, this._editOccDate);
        showToast('Occurrence supprimée ✓');
      } else {
        if (!confirm('Supprimer toute la série ?')) return;
        await DB.deletePlanningTask(this._editId);
        showToast('Série supprimée ✓');
      }
    } else {
      if (!confirm('Supprimer cette tâche ?')) return;
      await DB.deletePlanningTask(this._editId);
      showToast('Tâche supprimée ✓');
    }

    document.getElementById('planningModal')?.classList.add('hidden');
  },

  // ── Ouvrir / fermer le panel ─────────────────────────────────────
  open() {
    document.getElementById('planningPanel')?.classList.remove('hidden');
    this.render();
  },
  close() {
    document.getElementById('planningPanel')?.classList.add('hidden');
  },
};

// Helper local (évite dépendance à une fonction globale _v potentiellement absente)
function _v(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
