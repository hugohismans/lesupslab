// ═══════════════════════════════════════════════════════════════════
// modal.js — Modals : réservation / détail / confirmation suppression
// ═══════════════════════════════════════════════════════════════════

const MODAL = {
  _editId: null,

  // Recharge les listes locaux/agents/services depuis Firebase
  refreshSelects() {
    const curLocal   = g('fLocal').value;
    const curService = g('fService').value;
    const curAgent   = g('fAgent').value;

    g('fLocal').innerHTML = '<option value="">— Sélectionner —</option>' +
      CONFIG.LOCALS.map(l => `<option value="${l}">${DB.getLocalLabel(l)}</option>`).join('');
    g('fService').innerHTML = '<option value="">— Sélectionner —</option>' +
      DB.getServices().map(s => `<option value="${s}">${s}</option>`).join('');
    g('fAgent').innerHTML = '<option value="">— Sélectionner —</option>' +
      DB.getAgents().map(a => `<option value="${a}">${a}</option>`).join('');

    if (curLocal)   g('fLocal').value   = curLocal;
    if (curService) g('fService').value = curService;
    if (curAgent)   g('fAgent').value   = curAgent;

    // Re-rendre la liste paramètres uniquement si aucun input n'est en cours d'édition
    const overlay = g('settingsOverlay');
    if (!overlay.classList.contains('hidden')) {
      const focused = overlay.querySelector('input:focus');
      if (!focused) this._renderSettingsList();
    }
  },

  // Ouvrir le panneau paramètres
  openSettings() {
    this._renderSettingsList();
    g('settingsOverlay').classList.remove('hidden');
  },

  _renderSettingsList() {
    const agents   = DB.getAgents().filter(a => a !== 'Autre');
    const services = DB.getServices().filter(s => s !== 'Autre');

    // Listes agents / services — on stocke la clé Firebase dans data-key
    const makeList = (items, type, containerId) => {
      g(containerId).innerHTML = items.length
        ? items.map(({key, name}) => `
            <div class="st-item">
              <span class="st-name">${name}</span>
              <button class="st-del" data-type="${type}" data-key="${key || ''}" data-name="${escapeHtml(name)}" title="Supprimer">✕</button>
            </div>`).join('')
        : '<p class="st-empty">Aucun élément.</p>';
    };
    makeList(DB.getAgentsWithKeys(),   'agent',   'stAgentList');
    makeList(DB.getServicesWithKeys(), 'service', 'stSvcList');

    // Liste locaux avec libellés éditables
    g('stLocalList').innerHTML = CONFIG.LOCALS.map(id => `
      <div class="st-local-row">
        <span class="st-local-num">Local ${id}</span>
        <input class="st-local-input" type="text" data-localid="${id}"
               value="${escapeHtml(DB.getLocalLabel(id))}" placeholder="Local ${id}">
        <button class="st-local-save" data-localid="${id}" title="Sauvegarder">✓</button>
      </div>`).join('');

    // Bind suppression agents/services — suppression directe par clé Firebase
    g('settingsOverlay').querySelectorAll('.st-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { type, key, name } = btn.dataset;
        if (!key) return alert('Clé Firebase manquante, rechargez la page.');
        if (!confirm(`Supprimer "${name}" ?`)) return;
        btn.disabled = true;
        if (type === 'agent') await DB.removeAgentByKey(key);
        else                  await DB.removeServiceByKey(key);
        this.refreshSelects();
        showToast('Supprimé ✓');
      });
    });

    // Bind sauvegarde libellés locaux
    g('settingsOverlay').querySelectorAll('.st-local-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id    = btn.dataset.localid;
        const row   = btn.closest('.st-local-row');
        const input = row ? row.querySelector('input') : null;
        if (!input) return;
        const val = input.value;  // capturer avant tout await
        btn.disabled = true;
        try {
          await DB.setLocalLabel(id, val);
          showToast('Libellé enregistré ✓');
          this.refreshSelects();  // mise à jour immédiate sans attendre Firebase
        } catch (e) {
          alert('Erreur : ' + e.message);
          btn.disabled = false;
        }
      });
    });
    g('settingsOverlay').querySelectorAll('.st-local-input').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const id  = input.dataset.localid;
          const btn = g('settingsOverlay').querySelector(`.st-local-save[data-localid="${id}"]`);
          btn?.click();
        }
      });
    });
  },

  init() {
    // Peupler les selects d'heure (créneaux de 30 min)
    const timeOpts = [];
    for (let h = CONFIG.HOURS_START; h <= CONFIG.HOURS_END; h++) {
      for (let m = 0; m < 60; m += CONFIG.SLOT_MIN) {
        if (h === CONFIG.HOURS_END && m > 0) break;
        const label = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        timeOpts.push(`<option value="${label}">${label}</option>`);
      }
    }
    g('fTimeStart').innerHTML = timeOpts.join('');
    g('fTimeEnd').innerHTML   = timeOpts.join('');

    // Locaux, agents et services : chargés dynamiquement via refreshSelects()
    // (appelé par DB.onConfigChange dans app.js au démarrage)

    // Champs conditionnels
    g('fService').addEventListener('change', function() {
      cls('fServiceCustomWrap', this.value !== 'Autre');
    });
    g('fAgent').addEventListener('change', function() {
      cls('fAgentCustomWrap', this.value !== 'Autre');
    });
    g('fPermanent').addEventListener('change', function() {
      g('fDatesWrap').style.display = this.checked ? 'none' : '';
    });
    g('fRecType').addEventListener('change', function() {
      cls('fRecOptions', this.value === 'none');
      const units = { daily: 'jour(s)', weekly: 'semaine(s)', monthly: 'mois' };
      g('fIntervalUnit').textContent = units[this.value] || '';
    });
    g('fRecEnd').addEventListener('change', function() {
      cls('fRecEndDateWrap', this.value !== 'date');
    });

    // Mise à jour de l'indice de disponibilité quand les dates/récurrence changent
    ['fDateStart','fTimeStart','fDateEnd','fTimeEnd','fLocal','fRecType','fInterval','fRecEnd','fRecEndDate'].forEach(id => {
      g(id)?.addEventListener('change', () => this._updateHint());
    });

    // Boutons de fermeture génériques (data-close)
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => g(btn.dataset.close).classList.add('hidden'));
    });

    // Fermer sur clic sur l'overlay
    ['resOverlay','detOverlay','confOverlay','settingsOverlay'].forEach(id => {
      g(id).addEventListener('click', e => { if (e.target.id === id) g(id).classList.add('hidden'); });
    });

    // Paramètres — ajouter agent
    g('stAgentAdd').addEventListener('click', async () => {
      const name = g('stAgentInput').value.trim();
      if (!name) return;
      if (DB.getAgents().includes(name)) return alert('Cet agent existe déjà.');
      g('stAgentAdd').disabled = true;
      await DB.addAgent(name);
      g('stAgentInput').value = '';
      g('stAgentAdd').disabled = false;
      this.refreshSelects();
      showToast('Agent ajouté ✓');
    });
    g('stAgentInput').addEventListener('keydown', e => { if (e.key === 'Enter') g('stAgentAdd').click(); });

    // Paramètres — ajouter service
    g('stSvcAdd').addEventListener('click', async () => {
      const name = g('stSvcInput').value.trim();
      if (!name) return;
      if (DB.getServices().includes(name)) return alert('Ce service existe déjà.');
      g('stSvcAdd').disabled = true;
      await DB.addService(name);
      g('stSvcInput').value = '';
      g('stSvcAdd').disabled = false;
      this.refreshSelects();
      showToast('Service ajouté ✓');
    });
    g('stSvcInput').addEventListener('keydown', e => { if (e.key === 'Enter') g('stSvcAdd').click(); });

    // Bouton paramètres dans le header
    g('btnSettings').addEventListener('click', () => this.openSettings());

    // Enregistrer
    g('resSave').addEventListener('click', () => this.save());

    // Détail → Supprimer / Modifier
    g('detDelete').addEventListener('click', () => this._confirmDelete());
    g('detEdit').addEventListener('click',   () => this._editFromDetail());

    // Confirmation suppression
    g('confConfirm').addEventListener('click', () => this._doDelete());
  },

  // ─── Ouvrir modal nouvelle réservation ─────────────────────────
  openNew(opts = {}) {
    this._editId = null;
    this._reset();
    g('resTitle').textContent = 'Nouvelle réservation';

    if (opts.local) g('fLocal').value = opts.local;

    const today = isoDate(new Date());
    g('fDateStart').value = opts.date || today;
    g('fDateEnd').value   = opts.date || today;

    if (opts.time) {
      g('fTimeStart').value = opts.time;
      const [h, m] = opts.time.split(':').map(Number);
      const eh = (h + 1 < CONFIG.HOURS_END) ? h + 1 : CONFIG.HOURS_END - 1;
      g('fTimeEnd').value = `${String(eh).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }

    this._updateHint();
    g('resOverlay').classList.remove('hidden');
  },

  // ─── Ouvrir modal détail ────────────────────────────────────────
  openDetail(id, occDate) {
    this._editId  = id;
    this._occDate = occDate;
    const res = DB.getAll()[id];
    if (!res) return;

    const svc  = res.service === 'Autre' ? res.serviceCustom : res.service;
    const agt  = res.agent   === 'Autre' ? res.agentCustom  : res.agent;
    const isRec = res.recurrence?.type && res.recurrence.type !== 'none';
    const recL  = { daily: 'Quotidienne', weekly: 'Hebdomadaire', monthly: 'Mensuelle' };

    let html = `
      <div class="det-row"><span class="det-l">Local</span>   <span class="det-v">${DB.getLocalLabel(res.localId)}</span></div>
      <div class="det-row"><span class="det-l">Service</span> <span class="det-v">${svc}</span></div>
      <div class="det-row"><span class="det-l">Agent</span>   <span class="det-v">${agt}</span></div>`;

    if (res.isPermanent) {
      html += `<div class="det-row"><span class="det-l">Type</span>
        <span class="det-v"><span class="badge badge-perm">🔒 Réservation permanente</span></span></div>`;
    } else {
      const s = new Date(res.startDateTime);
      const e = new Date(res.endDateTime);
      html += `
        <div class="det-row"><span class="det-l">Début</span><span class="det-v">${fmtDT(s)}</span></div>
        <div class="det-row"><span class="det-l">Fin</span>  <span class="det-v">${fmtDT(e)}</span></div>`;
    }

    if (isRec) {
      html += `<div class="det-row"><span class="det-l">Récurrence</span>
        <span class="det-v"><span class="badge badge-rec">↻ ${recL[res.recurrence.type]}</span>
        — tous les ${res.recurrence.interval || 1}</span></div>
        <div class="det-row"><span class="det-l">Fin série</span>
        <span class="det-v">${res.recurrence.endDate || '♾ Pour toujours'}</span></div>`;
    }

    if (res.comment) {
      html += `<div class="det-row"><span class="det-l">Note</span><span class="det-v">${res.comment}</span></div>`;
    }

    g('detBody').innerHTML = html;
    g('detOverlay').classList.remove('hidden');
  },

  // ─── Enregistrer (créer ou modifier) ───────────────────────────
  async save() {
    const localId = parseInt(g('fLocal').value);
    const service = g('fService').value;
    const agent   = g('fAgent').value;
    const isPerm  = g('fPermanent').checked;

    if (!localId || !service || !agent)
      return alert('Veuillez remplir les champs obligatoires : Local, Service, Agent.');
    if (service === 'Autre' && !g('fServiceCustom').value.trim())
      return alert('Veuillez préciser le service.');
    if (agent === 'Autre' && !g('fAgentCustom').value.trim())
      return alert("Veuillez préciser l'agent.");

    let startDT = null, endDT = null;
    let exceptionDates = {}; // dates à exclure si l'utilisateur choisit "avec exceptions"

    if (!isPerm) {
      const ds = g('fDateStart').value, ts = g('fTimeStart').value;
      const de = g('fDateEnd').value,   te = g('fTimeEnd').value;
      if (!ds || !ts || !de || !te) return alert('Veuillez remplir les dates et heures.');
      startDT = `${ds}T${ts}`;
      endDT   = `${de}T${te}`;
      if (new Date(startDT) >= new Date(endDT)) return alert('La fin doit être après le début.');

      const recType2  = g('fRecType').value;
      const recEnd2   = g('fRecEnd').value === 'date' ? g('fRecEndDate').value : null;
      const interval2 = parseInt(g('fInterval').value) || 1;
      const isRec     = recType2 !== 'none';

      // Simuler toutes les occurrences de la série
      const tempRes = {
        localId, isPermanent: false,
        startDateTime: startDT, endDateTime: endDT,
        recurrence: { type: recType2, interval: interval2, endDate: recEnd2, seriesId: null }
      };
      const checkEnd = recEnd2
        ? new Date(recEnd2 + 'T23:59:59')
        : advDate(new Date(startDT), isRec ? recType2 : 'daily', isRec ? 365 : 0);

      const myOccs = expandReservation('__temp__', tempRes, new Date(startDT), checkEnd);

      // Trouver TOUS les conflits
      const conflicts = [];
      myOccs.forEach(occ => {
        const clash = DB.getInRange(occ._start, occ._end).filter(r =>
          parseInt(r.localId) === localId && r.id !== this._editId
          && (r.isPermanent || (r._start < occ._end && r._end > occ._start))
        );
        if (clash.length) conflicts.push({ occ, clash });
      });

      if (conflicts.length) {
        // Grouper par série source pour éviter de lister 700 occurrences
        const byId = {};
        conflicts.forEach(({ occ, clash }) => {
          clash.forEach(r => {
            if (!byId[r.id]) {
              const src = DB.getAll()[r.id];
              const srcIsRec = src?.recurrence?.type && src.recurrence.type !== 'none';
              byId[r.id] = { firstOcc: occ, count: 0, res: src, _isRec: srcIsRec, _isPerm: src?.isPermanent };
            }
            byId[r.id].count++;
          });
        });
        const groupedConflicts = Object.entries(byId).map(([id, { firstOcc, count, res, _isRec, _isPerm }]) => {
          const interval = parseInt(res?.recurrence?.interval) || 1;
          const recLbls  = {
            daily:   interval > 1 ? `tous les ${interval} jours`     : 'tous les jours',
            weekly:  interval > 1 ? `toutes les ${interval} semaines` : 'toutes les semaines',
            monthly: interval > 1 ? `tous les ${interval} mois`       : 'tous les mois',
          };
          return {
            occ: { ...firstOcc,
              _isRec, _isPerm,
              _recLabel: _isRec ? recLbls[res.recurrence.type] : null,
              _seriesCount: count
            },
            clash: [{ id, ...res }]
          };
        });

        const choice = await this._showConflictModal(groupedConflicts, localId, isRec);
        if (choice === 'cancel') return;
        if (choice === 'exceptions') {
          conflicts.forEach(c => { exceptionDates[c.occ._occDate] = true; });
        }
        if (choice === 'replace') {
          const toDelete = new Set();
          conflicts.forEach(c => c.clash.forEach(r => toDelete.add(r.id)));
          for (const id of toDelete) await DB.remove(id);
        }
      }
    } else {
      // Réservation permanente — vérifier les réservations existantes sur ce local
      const ds = g('fDateStart').value || isoDate(new Date());
      startDT = `${ds}T${String(CONFIG.HOURS_START).padStart(2,'0')}:00`;

      // Utiliser getInRange sur 5 ans pour avoir TOUTES les occurrences expandées
      const permStart = new Date(startDT);
      const permEnd   = new Date(permStart); permEnd.setFullYear(permEnd.getFullYear() + 5);
      const allOccs   = DB.getInRange(permStart, permEnd).filter(r =>
        parseInt(r.localId) === localId && r.id !== this._editId
      );

      if (allOccs.length) {
        // Grouper par série source (id) — 1 ligne par réservation/série, pas par occurrence
        const byId = {};
        allOccs.forEach(r => {
          if (!byId[r.id]) byId[r.id] = { res: DB.getAll()[r.id], firstOcc: r, count: 0 };
          byId[r.id].count++;
        });

        const conflictGroups = Object.entries(byId).map(([id, { res, firstOcc, count }]) => {
          const isRec = res?.recurrence?.type && res.recurrence.type !== 'none';
          // Construire une pseudo-occurrence descriptive
          const interval = parseInt(res.recurrence.interval) || 1;
          const recLabels = {
            daily:   interval > 1 ? `Tous les ${interval} jours`     : 'Tous les jours',
            weekly:  interval > 1 ? `Toutes les ${interval} semaines` : 'Toutes les semaines',
            monthly: interval > 1 ? `Tous les ${interval} mois`       : 'Tous les mois',
          };
          const label = isRec
            ? { _start: firstOcc._start, _end: firstOcc._end, _occDate: firstOcc._occDate,
                _isRec: true, _recLabel: recLabels[res.recurrence.type] || 'Récurrent',
                _interval: interval }
            : { _start: firstOcc._start, _end: firstOcc._end, _occDate: firstOcc._occDate,
                _isPerm: res?.isPermanent };
          return { occ: label, clash: [{ id, ...res }] };
        });

        const choice = await this._showConflictModal(conflictGroups, localId, false);
        if (choice === 'cancel') return;
        if (choice === 'replace') {
          const toDelete = new Set(allOccs.map(r => r.id));
          for (const id of toDelete) await DB.remove(id);
        }
      }
    }

    const recType = g('fRecType').value;
    const data = {
      localId,
      service,    serviceCustom: g('fServiceCustom').value.trim(),
      agent,      agentCustom:   g('fAgentCustom').value.trim(),
      comment:    g('fComment').value.trim(),
      isPermanent: isPerm,
      startDateTime: startDT,
      endDateTime:   isPerm ? null : endDT,
      recurrence: {
        type:     isPerm ? 'none' : recType,
        interval: parseInt(g('fInterval').value) || 1,
        endDate:  g('fRecEnd').value === 'date' ? g('fRecEndDate').value : null,
        seriesId: this._editId ? (DB.getAll()[this._editId]?.recurrence?.seriesId || null) : null
      }
    };
    if (Object.keys(exceptionDates).length) data.exceptions = exceptionDates;

    try {
      if (this._editId) await DB.update(this._editId, data);
      else              await DB.add(data);
      g('resOverlay').classList.add('hidden');
      // Avertissements récurrence
      if (!isPerm && recType !== 'none' && startDT) {
        // Mensuelle sur jour 29+
        if (recType === 'monthly' && new Date(startDT).getDate() >= 29)
          showToast('⚠️ Récurrence mensuelle : les mois plus courts décaleront l\'occurrence au mois suivant.');
        // Vérifier si des occurrences brutes tombent un week-end (avant filtrage)
        let wkCur = new Date(startDT);
        const intv = data.recurrence.interval;
        const chkEnd = advDate(wkCur, recType, intv * 52);
        let hasWeekendOcc = false;
        let wkGuard = 0;
        while (wkCur <= chkEnd && wkGuard++ < 700) {
          const d = wkCur.getDay();
          if (d === 0 || d === 6) { hasWeekendOcc = true; break; }
          wkCur = advDate(wkCur, recType, intv);
        }
        if (hasWeekendOcc)
          showToast('⚠️ Certaines occurrences tombent un week-end et seront automatiquement ignorées.');
      }
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
  },

  // ─── Modal de résolution de conflits ───────────────────────────
  _showConflictModal(conflicts, localId, isRec) {
    return new Promise(resolve => {
      const label = DB.getLocalLabel(localId);
      const n = conflicts.length;

      const isPerm = g('fPermanent').checked;
      g('conflictSummary').innerHTML = isPerm
        ? `⚠️ Réservation permanente sur <b>${label}</b> — ${n} réservation${n > 1 ? 's' : ''} existante${n > 1 ? 's' : ''} seront écrasées :`
        : `<b>${label}</b> est déjà réservé sur <b>${n} créneau${n > 1 ? 'x' : ''}</b> :`;

      g('conflictList').innerHTML = conflicts.map(({occ}) => {
        if (occ._isPerm) {
          return `<li>🔒 Réservation permanente (local bloqué définitivement)</li>`;
        }
        const dateStr = occ._start.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const tS = occ._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
        const tE = occ._end ? occ._end.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '';
        const timeStr = tE ? `${tS}–${tE}` : tS;
        if (occ._isRec) {
          const firstDate = occ._start.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
          return `<li>${timeStr} <em>(${occ._recLabel} à partir du ${firstDate})</em></li>`;
        }
        return `<li>${dateStr} · ${timeStr}</li>`;
      }).join('');

      // Masquer "exceptions" si pas récurrent OU si un conflit est une permanente
      const hasPerm = conflicts.some(({occ}) => occ._isPerm);
      cls('conflictBtnExceptions', !isRec || hasPerm);

      g('conflictOverlay').classList.remove('hidden');

      const done = choice => {
        g('conflictOverlay').classList.add('hidden');
        ['conflictBtnCancel','conflictBtnExceptions','conflictBtnReplace'].forEach(id => {
          const el = g(id);
          el.removeEventListener('click', el._conflictHandler);
        });
        resolve(choice);
      };

      [
        { id: 'conflictBtnCancel',     choice: 'cancel'     },
        { id: 'conflictBtnExceptions', choice: 'exceptions' },
        { id: 'conflictBtnReplace',    choice: 'replace'    },
      ].forEach(({ id, choice }) => {
        const el = g(id);
        el._conflictHandler = () => done(choice);
        el.addEventListener('click', el._conflictHandler);
      });
    });
  },

  // ─── Suppression ───────────────────────────────────────────────
  _confirmDelete() {
    const res   = DB.getAll()[this._editId];
    const isRec = res?.recurrence?.type && res.recurrence.type !== 'none';
    g('confText').textContent = isRec
      ? 'Cette réservation fait partie d\'une série récurrente.'
      : 'Confirmer la suppression de cette réservation ?';
    cls('confSeriesOpts', !isRec);
    if (isRec) g('confOverlay').querySelectorAll('input[name=delType]')[0].checked = true;
    g('confOverlay').classList.remove('hidden');
  },

  async _doDelete() {
    const res    = DB.getAll()[this._editId];
    const type   = document.querySelector('input[name=delType]:checked')?.value || 'single';
    const isRec  = res?.recurrence?.type && res.recurrence.type !== 'none';
    try {
      if (type === 'series' && res?.recurrence?.seriesId) {
        await DB.removeSeries(res.recurrence.seriesId);
      } else if (type === 'single' && isRec && this._occDate) {
        // Ajouter une exception pour cette date uniquement
        await DB.addException(this._editId, this._occDate);
      } else {
        await DB.remove(this._editId);
      }
      g('confOverlay').classList.add('hidden');
      g('detOverlay').classList.add('hidden');
    } catch (err) {
      alert('Erreur suppression : ' + err.message);
    }
  },

  _editFromDetail() {
    const res = DB.getAll()[this._editId];
    if (!res) return;
    g('detOverlay').classList.add('hidden');
    this._loadForm(this._editId, res);
  },

  // ─── Charger les données dans le formulaire (édition) ──────────
  _loadForm(id, res) {
    this._editId = id;
    this._reset();
    g('resTitle').textContent = 'Modifier la réservation';

    g('fLocal').value    = res.localId;
    g('fService').value  = res.service;
    g('fAgent').value    = res.agent;
    g('fComment').value  = res.comment || '';
    g('fPermanent').checked = res.isPermanent;

    if (res.service === 'Autre') { cls('fServiceCustomWrap', false); g('fServiceCustom').value = res.serviceCustom || ''; }
    if (res.agent   === 'Autre') { cls('fAgentCustomWrap',   false); g('fAgentCustom').value   = res.agentCustom   || ''; }

    if (res.isPermanent) {
      g('fDatesWrap').style.display = 'none';
    } else {
      if (res.startDateTime) {
        const [sd, st] = res.startDateTime.split('T');
        g('fDateStart').value = sd;
        g('fTimeStart').value = st?.slice(0, 5) || '';
      }
      if (res.endDateTime) {
        const [ed, et] = res.endDateTime.split('T');
        g('fDateEnd').value = ed;
        g('fTimeEnd').value = et?.slice(0, 5) || '';
      }
      const rec = res.recurrence;
      if (rec?.type && rec.type !== 'none') {
        g('fRecType').value = rec.type;
        cls('fRecOptions', false);
        g('fInterval').value = rec.interval || 1;
        const units = { daily: 'jour(s)', weekly: 'semaine(s)', monthly: 'mois' };
        g('fIntervalUnit').textContent = units[rec.type] || '';
        if (rec.endDate) {
          g('fRecEnd').value = 'date';
          cls('fRecEndDateWrap', false);
          g('fRecEndDate').value = rec.endDate;
        }
      }
    }
    g('resOverlay').classList.remove('hidden');
    this._updateHint();
  },

  // ─── Helpers ───────────────────────────────────────────────────
  _reset() {
    ['fLocal','fService','fAgent','fServiceCustom','fAgentCustom','fComment',
     'fDateStart','fTimeStart','fDateEnd','fTimeEnd','fRecEndDate'].forEach(id => {
      const e = g(id); if (e) e.value = '';
    });
    g('fPermanent').checked = false;
    g('fDatesWrap').style.display = '';
    g('fRecType').value  = 'none';
    g('fRecEnd').value   = 'forever';
    g('fInterval').value = '1';
    cls('fServiceCustomWrap', true);
    cls('fAgentCustomWrap',   true);
    cls('fRecOptions',        true);
    cls('fRecEndDateWrap',    true);
    g('localHint').textContent = '';
  },

  _updateHint() {
    const ds      = g('fDateStart').value;
    const ts      = g('fTimeStart').value;
    const de      = g('fDateEnd').value;
    const te      = g('fTimeEnd').value;
    const localId = parseInt(g('fLocal').value);
    const hint    = g('localHint');

    if (!ds || !ts || !de || !te) { hint.innerHTML = ''; hint.className = 'hint'; return; }

    const s = new Date(`${ds}T${ts}`);
    const e = new Date(`${de}T${te}`);
    if (s >= e) { hint.innerHTML = ''; hint.className = 'hint'; return; }

    const recType2  = g('fRecType').value;
    const recEnd2   = g('fRecEnd').value === 'date' ? g('fRecEndDate').value : null;
    const interval2 = parseInt(g('fInterval').value) || 1;
    const isRec     = recType2 !== 'none';

    // Simuler toutes les occurrences pour trouver les conflits
    const tempRes = {
      localId: localId || 0, isPermanent: false,
      startDateTime: `${ds}T${ts}`, endDateTime: `${de}T${te}`,
      recurrence: { type: recType2, interval: interval2, endDate: recEnd2, seriesId: null }
    };
    const checkEnd = recEnd2
      ? new Date(recEnd2 + 'T23:59:59')
      : advDate(s, isRec ? recType2 : 'daily', isRec ? 365 : 0);
    const myOccs = expandReservation('__hint__', tempRes, s, checkEnd);

    // Locaux occupés sur au moins une occurrence
    const bookedOnAny = new Set();
    myOccs.forEach(occ => {
      DB.getInRange(occ._start, occ._end)
        .filter(r => r.id !== this._editId)
        .forEach(r => bookedOnAny.add(parseInt(r.localId)));
    });

    // Locaux occupés uniquement sur la 1ère occurrence (pour la liste "libres")
    const bookedFirst = new Set(
      DB.getInRange(s, e).filter(r => r.id !== this._editId).map(r => parseInt(r.localId))
    );
    const free = CONFIG.LOCALS.filter(l => !bookedFirst.has(l));

    // Compter les conflits si un local est sélectionné
    if (localId) {
      const conflictOccs = myOccs.filter(occ =>
        DB.getInRange(occ._start, occ._end).some(r =>
          parseInt(r.localId) === localId && r.id !== this._editId
          && (r.isPermanent || (r._start < occ._end && r._end > occ._start))
        )
      );
      if (conflictOccs.length) {
        const label = DB.getLocalLabel(localId);
        const freeList = free.length
          ? '<ul class="hint-list">' + free.map(l => `<li>${DB.getLocalLabel(l)}</li>`).join('') + '</ul>'
          : '<em>Aucun local disponible</em>';

        // Vérifier si le conflit est dû à une réservation permanente
        const permConflict = DB.getInRange(conflictOccs[0]._start, conflictOccs[0]._end).find(r =>
          parseInt(r.localId) === localId && r.id !== this._editId && r.isPermanent
        );

        let suffix;
        if (permConflict) {
          suffix = ` est <b>bloqué définitivement</b> par une réservation permanente`;
        } else if (!isRec || conflictOccs.length === 1) {
          const dateStr = conflictOccs[0]._start.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' });
          suffix = ` le <b>${dateStr}</b>`;
        } else {
          const firstDate = conflictOccs[0]._start.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' });
          const recLbls = {
            daily:   interval2 > 1 ? `tous les ${interval2} jours`     : 'tous les jours',
            weekly:  interval2 > 1 ? `toutes les ${interval2} semaines` : 'toutes les semaines',
            monthly: interval2 > 1 ? `tous les ${interval2} mois`       : 'tous les mois',
          };
          suffix = ` à partir du <b>${firstDate}</b> (${recLbls[recType2] || 'récurrent'} · ${conflictOccs.length} occurrence${conflictOccs.length > 1 ? 's' : ''})`;
        }

        const freeTitle = permConflict ? 'Locaux libres :' : 'Locaux libres (1ère date conflictuelle) :';
        hint.innerHTML = `⚠️ <b>${label}</b>${permConflict ? '' : ' est déjà réservé'}${suffix}.<br>${freeTitle}${freeList}`;
        hint.className = 'hint hint-warn';
        return;
      }
    }

    if (!free.length) {
      hint.innerHTML = '❌ Aucun local disponible sur cette plage.';
      hint.className = 'hint hint-err';
      return;
    }

    // Avertir si des conflits de série existent même si le local sélectionné est libre
    const seriesWarn = isRec && localId && bookedOnAny.has(localId) ? '' : '';

    const freeList = '<ul class="hint-list">' + free.map(l => `<li>${DB.getLocalLabel(l)}</li>`).join('') + '</ul>';
    hint.innerHTML = '✅ Locaux libres sur cette plage :' + freeList;
    hint.className = 'hint hint-ok';
  }
};

// ───────────────────────────────────────────────────────────────────
// Mini-helpers
// ───────────────────────────────────────────────────────────────────

function g(id) { return document.getElementById(id); }
function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showToast(msg = 'Modification enregistrée') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-in'));
  setTimeout(() => {
    t.classList.remove('toast-in');
    t.addEventListener('transitionend', () => t.remove());
  }, 2200);
}

// cls(id, hidden) — cache ou affiche via la classe CSS 'hidden'
function cls(id, hidden) {
  const e = g(id);
  if (e) e.classList.toggle('hidden', hidden);
}

function fmtDT(d) {
  return d.toLocaleDateString('fr-BE', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
