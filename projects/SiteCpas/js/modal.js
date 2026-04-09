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

    if (!g('settingsOverlay').classList.contains('hidden')) {
      this._renderSettingsList();
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

    // Listes agents / services
    const makeList = (items, type, containerId) => {
      g(containerId).innerHTML = items.length
        ? items.map(name => `
            <div class="st-item">
              <span class="st-name">${name}</span>
              <button class="st-del" data-type="${type}" data-name="${escapeHtml(name)}" title="Supprimer">✕</button>
            </div>`).join('')
        : '<p class="st-empty">Aucun élément.</p>';
    };
    makeList(agents,   'agent',   'stAgentList');
    makeList(services, 'service', 'stSvcList');

    // Liste locaux avec libellés éditables
    g('stLocalList').innerHTML = CONFIG.LOCALS.map(id => `
      <div class="st-local-row">
        <span class="st-local-num">Local ${id}</span>
        <input class="st-local-input" type="text" data-localid="${id}"
               value="${escapeHtml(DB.getLocalLabel(id))}" placeholder="Local ${id}">
        <button class="st-local-save" data-localid="${id}" title="Sauvegarder">✓</button>
      </div>`).join('');

    // Bind suppression agents/services
    g('settingsOverlay').querySelectorAll('.st-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { type, name } = btn.dataset;
        if (!confirm(`Supprimer "${name}" ?`)) return;
        btn.disabled = true;
        if (type === 'agent') await DB.removeAgent(name);
        else                  await DB.removeService(name);
      });
    });

    // Bind sauvegarde libellés locaux
    g('settingsOverlay').querySelectorAll('.st-local-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id    = parseInt(btn.dataset.localid);
        const input = g('settingsOverlay').querySelector(`.st-local-input[data-localid="${id}"]`);
        btn.disabled = true;
        await DB.setLocalLabel(id, input.value);
        btn.disabled = false;
        showToast('Libellé enregistré ✓');
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

    // Mise à jour de l'indice de disponibilité quand les dates changent
    ['fDateStart','fTimeStart','fDateEnd','fTimeEnd','fLocal'].forEach(id => {
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

    if (!localId || !service || !agent) {
      return alert('Veuillez remplir les champs obligatoires : Local, Service, Agent.');
    }
    if (service === 'Autre' && !g('fServiceCustom').value.trim()) {
      return alert('Veuillez préciser le service.');
    }
    if (agent === 'Autre' && !g('fAgentCustom').value.trim()) {
      return alert("Veuillez préciser l'agent.");
    }

    let startDT = null, endDT = null;

    if (!isPerm) {
      const ds = g('fDateStart').value;
      const ts = g('fTimeStart').value;
      const de = g('fDateEnd').value;
      const te = g('fTimeEnd').value;
      if (!ds || !ts || !de || !te) return alert('Veuillez remplir les dates et heures.');
      startDT = `${ds}T${ts}`;
      endDT   = `${de}T${te}`;
      if (new Date(startDT) >= new Date(endDT)) return alert('La fin doit être après le début.');

      // Vérification de conflit
      const s = new Date(startDT), e = new Date(endDT);
      const conflict = DB.getInRange(s, e).find(r =>
        r.localId === localId && r.id !== this._editId && !r.isPermanent
        && r._start < e && r._end > s
      );
      if (conflict) {
        const allBooked = new Set(DB.getInRange(s, e).map(r => r.localId));
        const free      = CONFIG.LOCALS.filter(l => !allBooked.has(l));
        const msg = free.length
          ? `${DB.getLocalLabel(localId)} est déjà réservé sur cette plage.\n\nLocaux disponibles : ${free.map(l => DB.getLocalLabel(l)).join(', ')}\n\nForcer l'enregistrement quand même ?`
          : `${DB.getLocalLabel(localId)} est déjà réservé et aucun autre local n'est disponible sur cette plage.`;
        if (!free.length || !confirm(msg)) return;
      }
    } else {
      const ds = g('fDateStart').value || isoDate(new Date());
      startDT = `${ds}T${String(CONFIG.HOURS_START).padStart(2,'0')}:00`;
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

    try {
      if (this._editId) await DB.update(this._editId, data);
      else              await DB.add(data);
      g('resOverlay').classList.add('hidden');
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
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
    const res  = DB.getAll()[this._editId];
    const type = document.querySelector('input[name=delType]:checked')?.value || 'single';
    try {
      if (type === 'series' && res?.recurrence?.seriesId) {
        await DB.removeSeries(res.recurrence.seriesId);
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
    const ds = g('fDateStart').value;
    const ts = g('fTimeStart').value;
    const de = g('fDateEnd').value;
    const te = g('fTimeEnd').value;
    const hint = g('localHint');
    if (!ds || !ts || !de || !te) { hint.textContent = ''; return; }

    const s = new Date(`${ds}T${ts}`);
    const e = new Date(`${de}T${te}`);
    if (s >= e) { hint.textContent = ''; return; }

    const booked = new Set(DB.getInRange(s, e).map(r => r.localId));
    const free   = CONFIG.LOCALS.filter(l => !booked.has(l));
    hint.textContent  = free.length
      ? `✅ Libres sur cette plage : ${free.map(l => DB.getLocalLabel(l)).join(', ')}`
      : '❌ Aucun local disponible sur cette plage';
    hint.style.color = free.length ? '#16a34a' : '#dc2626';
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
