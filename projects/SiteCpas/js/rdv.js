// ═══════════════════════════════════════════════════════════════════
// rdv.js — Page Disponibilité pour rendez-vous
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────
  let _agentKey      = null;
  let _agentName     = null;
  let _mySlots       = [];
  let _targetSlots   = [];
  let _allRequests   = [];
  let _selectedSlot  = null;  // { id, startDateTime, endDateTime, selectedStart, selectedEnd }
  let _pendingAccept = null;  // { requestId, localId } en attente si local picker

  // ── Init ─────────────────────────────────────────────────────────
  function init() {
    _agentKey  = sessionStorage.getItem('cpas_current_agent_key');
    // auth.js handles session check & redirect

    DB.init();
    DB.initConfig();

    // Attendre la config pour avoir les noms d'agents
    DB.onConfigChange(() => {
      const found = DB.getAgentsWithKeys().find(a => a.key === _agentKey);
      _agentName = found?.name || null;

      _updateHeaderBadge();
      _populateAgentDropdowns();
      _populateFavLieuSelect();
      _loadMySettings();
    });

    // Démarrer l'écoute des slots (onglet 1)
    if (_agentKey) {
      DB.listenAvailabilitySlots(_agentKey, slots => {
        _mySlots = slots;
        _renderMySlots();
      });
      // Écouter toutes les demandes liées à cet agent
      DB.listenAppointmentRequests(_agentKey, requests => {
        _allRequests = requests;
        _renderMyRequests();
        _renderIncomingRequests();
      });
    }

    // Masquer l'écran de chargement
    const ls = document.getElementById('appLoadingScreen');
    if (ls) {
      ls.style.opacity = '0';
      setTimeout(() => ls.remove(), 400);
    }

    _bindEvents();
  }

  // ── Header badge agent ───────────────────────────────────────────
  function _updateHeaderBadge() {
    const badge = document.getElementById('hdAgentBadge');
    if (!badge || !_agentName) return;
    badge.textContent = _agentName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    badge.title = _agentName;
  }

  // ── Dropdown agents ──────────────────────────────────────────────
  function _populateAgentDropdowns() {
    const agents = DB.getAgentsWithKeys().filter(a => a.key);

    // Dropdown "agent cible" (onglet 2)
    const selTarget = document.getElementById('rdvTargetAgent');
    if (selTarget) {
      const cur = selTarget.value;
      selTarget.innerHTML = '<option value="">— Choisir un agent —</option>' +
        agents.map(a => `<option value="${a.key}"${a.key === cur ? ' selected' : ''}>${escHtml(a.name)}</option>`).join('');
    }

    // Dropdown "avec qui → agent" (onglet 2)
    const selWith = document.getElementById('rdvWithAgent');
    if (selWith) {
      const cur = selWith.value;
      selWith.innerHTML = '<option value="">— Choisir un agent —</option>' +
        agents.map(a => `<option value="${a.key}"${a.key === cur ? ' selected' : ''}>${escHtml(a.name)}</option>`).join('');
    }
  }

  // ── Picker local favori : lieu dropdown + boutons toggle ──────────
  function _getFrontofficeLocaux() {
    return Object.entries(DB._lieux || {})
      .filter(([, l]) => !l.isBackoffice)
      .sort(([, a], [, b]) => (a.order || 999) - (b.order || 999));
  }

  function _populateFavLieuSelect() {
    const sel = document.getElementById('rdvFavLieu');
    if (!sel) return;
    const lieux = _getFrontofficeLocaux();
    sel.innerHTML = '<option value="">— Aucun lieu —</option>';
    lieux.forEach(([id, lieu]) => {
      sel.innerHTML += `<option value="${id}">${escHtml(lieu.name)}</option>`;
    });
  }

  function _renderFavLocals(lieuId) {
    const wrap = document.getElementById('rdvFavLocals');
    const hidden = document.getElementById('rdvFavoriteLocal');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!lieuId) { if (hidden) hidden.value = ''; return; }

    const lieu = (DB._lieux || {})[lieuId];
    if (!lieu) return;
    const curVal = hidden ? hidden.value : '';

    lieu.localIds.forEach(lid => {
      if (DB.isLocalHidden(lid) || DB.isLocalBackoffice(lid)) return;
      const label = DB.getLocalLabel(lid);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rdv-fav-local-btn' + (String(lid) === String(curVal) ? ' active' : '');
      btn.textContent = label;
      btn.dataset.lid = lid;
      btn.addEventListener('click', () => {
        const isActive = btn.classList.contains('active');
        wrap.querySelectorAll('.rdv-fav-local-btn').forEach(b => b.classList.remove('active'));
        if (!isActive) {
          btn.classList.add('active');
          if (hidden) hidden.value = lid;
        } else {
          if (hidden) hidden.value = '';
        }
        _saveSettings();
      });
      wrap.appendChild(btn);
    });
  }

  // ── Chargement des paramètres (auto-accept, local favori) ─────────
  async function _loadMySettings() {
    if (!_agentKey) return;
    const settings = await DB.getAvailabilitySettings(_agentKey);
    const chk    = document.getElementById('rdvAutoAcceptGlobal');
    const row    = document.getElementById('rdvFavoriteRow');
    const hidden = document.getElementById('rdvFavoriteLocal');
    if (chk) chk.checked = !!settings.autoAccept;
    if (row) row.classList.toggle('hidden', !settings.autoAccept);

    // Pré-sélectionner lieu + local si un favori est sauvegardé
    if (settings.favoriteLocalId) {
      const favId = String(settings.favoriteLocalId);
      if (hidden) hidden.value = favId;
      // Trouver le lieuId correspondant
      const lieuEntry = Object.entries(DB._lieux || {}).find(([, l]) =>
        !l.isBackoffice && l.localIds.includes(Number(favId))
      );
      if (lieuEntry) {
        const lieuSel = document.getElementById('rdvFavLieu');
        if (lieuSel) lieuSel.value = lieuEntry[0];
        _renderFavLocals(lieuEntry[0]);
      }
    }
  }

  // ── Expansion des slots récurrents ───────────────────────────────
  function _expandSlots(slots) {
    const expanded = [];
    const nowDate  = new Date();
    const horizon  = new Date(nowDate);
    horizon.setDate(horizon.getDate() + 60); // afficher 60 jours dans le futur

    slots.forEach(slot => {
      const rec = slot.recurrence;
      if (!rec || rec.type === 'none') {
        expanded.push({ ...slot, _occDate: slot.startDateTime.slice(0, 10), _isOccurrence: false });
        return;
      }

      // Générer les occurrences
      const origStart = new Date(slot.startDateTime);
      const origEnd   = new Date(slot.endDateTime);
      const duration  = origEnd - origStart;
      const endDate   = rec.endDate ? new Date(rec.endDate + 'T23:59') : horizon;
      const exceptions = slot.exceptions || {};

      let cursor = new Date(origStart);
      // Avancer jusqu'à aujourd'hui si le début est dans le passé
      if (cursor < nowDate) {
        while (cursor < nowDate) {
          if (rec.type === 'daily')  cursor.setDate(cursor.getDate() + 1);
          else if (rec.type === 'weekly') cursor.setDate(cursor.getDate() + 7);
          else break;
        }
      }

      let safetyCount = 0;
      while (cursor <= endDate && cursor <= horizon && safetyCount++ < 200) {
        const occDate = cursor.toISOString().slice(0, 10);
        if (!exceptions[occDate]) {
          const occStart = new Date(cursor);
          const occEnd   = new Date(cursor.getTime() + duration);
          expanded.push({
            ...slot,
            startDateTime: occStart.toISOString().slice(0, 16),
            endDateTime:   occEnd.toISOString().slice(0, 16),
            _occDate:      occDate,
            _isOccurrence: true,
            _seriesSlotId: slot.id,
          });
        }
        if (rec.type === 'daily')        cursor.setDate(cursor.getDate() + 1);
        else if (rec.type === 'weekly')  cursor.setDate(cursor.getDate() + 7);
        else break;
      }
    });

    expanded.sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
    return expanded;
  }

  // ── Rendu — Liste mes créneaux (onglet 1) ─────────────────────────
  function _renderMySlots() {
    const el = document.getElementById('rdvSlotsList');
    if (!el) return;

    if (!_mySlots.length) {
      el.innerHTML = '<div class="rdv-empty">Aucune plage définie pour le moment.</div>';
      return;
    }

    const now      = new Date().toISOString().slice(0, 16);
    const expanded = _expandSlots(_mySlots);

    if (!expanded.length) {
      el.innerHTML = '<div class="rdv-empty">Aucune plage à venir.</div>';
      return;
    }

    // Grouper par série (pour les récurrentes, on affiche le header de série en premier)
    const seriesHeaders = new Set();
    let html = '';

    expanded.forEach(slot => {
      const isPast   = slot.endDateTime < now;
      const takenReq = _allRequests.find(r => r.slotId === (slot._seriesSlotId || slot.id) && r.status === 'accepted'
        && r.startDateTime === slot.startDateTime);
      const start    = _fmtDT(slot.startDateTime);
      const end      = _fmtTime(slot.endDateTime);
      const label    = slot.label ? `<span class="rdv-slot-label">${escHtml(slot.label)}</span>` : '';
      const autoIcon = slot.autoAccept ? '<span class="rdv-auto-badge" title="Auto-acceptation">⚡</span>' : '';
      const recIcon  = slot.recurrence && slot.recurrence.type !== 'none'
        ? `<span class="rdv-rec-badge" title="${slot.recurrence.type === 'daily' ? 'Quotidien' : 'Hebdomadaire'}">🔁</span>` : '';
      const takenBadge = takenReq
        ? `<span class="rdv-taken-badge">✅ Confirmé</span>`
        : (isPast ? `<span class="rdv-past-badge">Passé</span>` : '');

      const slotId    = slot._seriesSlotId || slot.id;
      const isRecurr  = slot._isOccurrence;
      const occDate   = slot._occDate;

      html += `
        <div class="rdv-slot-item${isPast ? ' rdv-slot-past' : ''}${takenReq ? ' rdv-slot-taken' : ''}">
          <div class="rdv-slot-main">
            <span class="rdv-slot-time">${start} – ${end}</span>
            ${label}
            ${autoIcon}${recIcon}
            ${takenBadge}
          </div>
          ${!takenReq ? `<button class="rdv-slot-delete"
            data-slot-id="${slotId}"
            data-is-rec="${isRecurr}"
            data-occ-date="${occDate}"
            title="Supprimer ce créneau">🗑</button>` : ''}
        </div>`;
    });

    el.innerHTML = html;

    el.querySelectorAll('.rdv-slot-delete').forEach(btn => {
      btn.addEventListener('click', () => _deleteSlotClick(
        btn.dataset.slotId,
        btn.dataset.isRec === 'true',
        btn.dataset.occDate
      ));
    });
  }

  // ── Suppression créneau (avec modale si récurrent) ────────────────
  let _pendingDelete = null;

  function _deleteSlotClick(slotId, isRecurring, occDate) {
    if (!isRecurring) {
      _deleteSlot(slotId);
      return;
    }
    // Modale choix : cette occurrence vs toute la série
    _pendingDelete = { slotId, occDate };
    document.getElementById('rdvDelRecOverlay')?.classList.remove('hidden');
  }

  // ── Rendu — Mes demandes envoyées (onglet 2) ──────────────────────
  function _renderMyRequests() {
    const el = document.getElementById('rdvMyRequests');
    if (!el) return;

    const mine = _allRequests.filter(r => r.requesterAgentKey === _agentKey);
    if (!mine.length) {
      el.innerHTML = '<div class="rdv-empty">Aucune demande envoyée.</div>';
      return;
    }

    el.innerHTML = mine.map(r => {
      const targetName = DB.getAgentDisplayNameByKey(r.targetAgentKey);
      const withStr    = r.withPerson?.type === 'agent'
        ? `Avec ${escHtml(r.withPerson.name)}`
        : `Avec ${escHtml(r.withPerson?.name || '?')} (externe)`;
      const statusIcon = { pending: '⏳', accepted: '✅', refused: '❌' }[r.status] || '❓';
      const statusLabel = { pending: 'En attente', accepted: 'Accepté', refused: 'Refusé' }[r.status] || r.status;
      const localStr = r.localId ? ` — ${escHtml(DB.getLocalName(r.localId))}` : '';

      return `
        <div class="rdv-req-item rdv-req-${r.status}">
          <div class="rdv-req-header">
            <span class="rdv-req-status">${statusIcon} ${statusLabel}</span>
            <span class="rdv-req-who">→ ${escHtml(targetName)}</span>
          </div>
          <div class="rdv-req-details">
            ${withStr}${localStr}
            ${r.message ? `<br><em>${escHtml(r.message)}</em>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  // ── Rendu — Demandes reçues (onglet 2) ────────────────────────────
  function _renderIncomingRequests() {
    const el = document.getElementById('rdvIncomingRequests');
    if (!el) return;

    const incoming = _allRequests.filter(r => r.targetAgentKey === _agentKey);
    if (!incoming.length) {
      el.innerHTML = '<div class="rdv-empty">Aucune demande reçue.</div>';
      return;
    }

    el.innerHTML = incoming.map(r => {
      const requesterName = escHtml(r.requesterName || DB.getAgentDisplayNameByKey(r.requesterAgentKey));
      const withStr = r.withPerson?.type === 'agent'
        ? `Avec ${escHtml(r.withPerson.name)}`
        : `Avec ${escHtml(r.withPerson?.name || '?')} (externe)`;
      const statusIcon = { pending: '⏳', accepted: '✅', refused: '❌' }[r.status] || '❓';
      const statusLabel = { pending: 'En attente', accepted: 'Accepté', refused: 'Refusé' }[r.status] || r.status;
      const localStr = r.localId ? ` — ${escHtml(DB.getLocalName(r.localId))}` : '';
      const slotStr = _findSlotTime(r);

      return `
        <div class="rdv-req-item rdv-req-${r.status}">
          <div class="rdv-req-header">
            <span class="rdv-req-status">${statusIcon} ${statusLabel}</span>
            <span class="rdv-req-who">De ${requesterName}</span>
          </div>
          <div class="rdv-req-details">
            ${slotStr ? `<strong>${slotStr}</strong> · ` : ''}${withStr}${localStr}
            ${r.message ? `<br><em>${escHtml(r.message)}</em>` : ''}
          </div>
          ${r.status === 'pending' ? `
          <div class="rdv-req-actions">
            <button class="rdv-btn-accept" data-req-id="${r.id}">✅ Accepter</button>
            <button class="rdv-btn-refuse" data-req-id="${r.id}">❌ Refuser</button>
          </div>` : ''}
        </div>`;
    }).join('');

    el.querySelectorAll('.rdv-btn-accept').forEach(btn => {
      btn.addEventListener('click', () => _startAccept(btn.dataset.reqId));
    });
    el.querySelectorAll('.rdv-btn-refuse').forEach(btn => {
      btn.addEventListener('click', () => _doRefuse(btn.dataset.reqId));
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────
  function _findSlotTime(req) {
    // Chercher dans les slots de l'agent cible
    // (les slots ne sont pas en mémoire pour les autres agents, mais on peut afficher depuis la demande)
    if (!req.startDateTime) return '';
    return `${_fmtDT(req.startDateTime)} – ${_fmtTime(req.endDateTime)}`;
  }

  function _fmtDT(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const days = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const day  = days[d.getDay()];
    const date = `${d.getDate()}/${d.getMonth()+1}`;
    const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return `${day} ${date} ${time}`;
  }

  function _fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _showToast(msg, type = 'ok') {
    const t = document.getElementById('rdvToast');
    if (!t) return;
    t.textContent = msg;
    t.className = `rdv-toast rdv-toast-${type}`;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
  }

  function _showError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function _hideError(elId) {
    const el = document.getElementById(elId);
    if (el) el.classList.add('hidden');
  }

  // ── Onglet 1 : Ajouter un créneau ────────────────────────────────
  async function _addSlot() {
    if (!_agentKey) return;
    _hideError('rdvSlotError');

    const date  = document.getElementById('rdvSlotDate')?.value;
    const start = document.getElementById('rdvSlotStart')?.value;
    const end   = document.getElementById('rdvSlotEnd')?.value;
    const label = document.getElementById('rdvSlotLabel')?.value.trim();

    if (!date || !start || !end) {
      _showError('rdvSlotError', 'Veuillez renseigner la date, l\'heure de début et l\'heure de fin.');
      return;
    }
    if (start >= end) {
      _showError('rdvSlotError', 'L\'heure de fin doit être après l\'heure de début.');
      return;
    }

    const startDT = `${date}T${start}`;
    const endDT   = `${date}T${end}`;

    // Paramètres globaux auto-accept / local favori
    const autoAccept      = !!document.getElementById('rdvAutoAcceptGlobal')?.checked;
    const favoriteLocalId = document.getElementById('rdvFavoriteLocal')?.value || null;

    // Récurrence
    const recType = document.getElementById('rdvSlotRecurrence')?.value || 'none';
    const recEnd  = document.getElementById('rdvSlotRecEnd')?.value || null;
    const recurrence = recType !== 'none' ? { type: recType, endDate: recEnd || null } : null;

    const btn = document.getElementById('rdvAddSlot');
    if (btn) btn.disabled = true;

    try {
      await DB.addAvailabilitySlot(_agentKey, startDT, endDT, label, autoAccept, favoriteLocalId, recurrence);
      // Réinitialiser le formulaire
      document.getElementById('rdvSlotLabel').value = '';
      _showToast('Créneau ajouté ✓');
    } catch (e) {
      _showError('rdvSlotError', 'Erreur lors de l\'ajout : ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function _deleteSlot(slotId) {
    if (!_agentKey || !slotId) return;
    // Vérifier qu'il n'y a pas de demande acceptée sur ce slot
    const taken = await DB.isSlotTaken(_agentKey, slotId);
    if (taken) {
      _showToast('Ce créneau a déjà un RDV confirmé — impossible de le supprimer.', 'warn');
      return;
    }
    await DB.deleteAvailabilitySlot(_agentKey, slotId);
    _showToast('Créneau supprimé.');
  }

  async function _deleteSlotOccurrence(slotId, occDate) {
    if (!_agentKey || !slotId || !occDate) return;
    await DB.deleteAvailabilitySlotOccurrence(_agentKey, slotId, occDate);
    _showToast('Occurrence supprimée.');
  }

  // ── Onglet 1 : Sauvegarder les paramètres ────────────────────────
  async function _saveSettings() {
    if (!_agentKey) return;
    const autoAccept      = !!document.getElementById('rdvAutoAcceptGlobal')?.checked;
    const favoriteLocalId = document.getElementById('rdvFavoriteLocal')?.value || null;
    await DB.setAvailabilitySettings(_agentKey, { autoAccept, favoriteLocalId: favoriteLocalId || null });
    _showToast('Paramètres enregistrés ✓');
  }

  // ── Onglet 2 : Charger les créneaux de l'agent cible ─────────────
  let _targetListener = null;

  async function _loadTargetSlots(targetAgentKey) {
    const el = document.getElementById('rdvSlotPicker');
    if (!el) return;
    _selectedSlot = null;
    document.getElementById('rdvTimePicker')?.classList.add('hidden');

    if (_targetListener) {
      DB._ref(`appState/availabilitySlots/${_targetListener}`).off();
      _targetListener = null;
    }

    if (!targetAgentKey) {
      el.innerHTML = '<div class="rdv-empty rdv-empty-sm">Sélectionnez un agent pour voir ses créneaux.</div>';
      _targetSlots = [];
      return;
    }

    el.innerHTML = '<div class="rdv-empty rdv-empty-sm">Chargement…</div>';
    _targetListener = targetAgentKey;

    DB.listenAvailabilitySlots(targetAgentKey, slots => {
      _targetSlots = slots;
      const expanded = _expandSlots(slots);
      _renderTargetSlots(expanded, targetAgentKey);
    });
  }

  function _renderTargetSlots(slots, targetAgentKey) {
    const el = document.getElementById('rdvSlotPicker');
    if (!el) return;

    const now = new Date().toISOString().slice(0, 16);
    const future = slots.filter(s => s.endDateTime > now);

    if (!future.length) {
      el.innerHTML = '<div class="rdv-empty rdv-empty-sm">Aucun créneau disponible pour cet agent.</div>';
      return;
    }

    el.innerHTML = future.map(slot => {
      const origId   = slot._seriesSlotId || slot.id;
      const start    = _fmtDT(slot.startDateTime);
      const end      = _fmtTime(slot.endDateTime);
      const label    = slot.label ? ` · ${slot.label}` : '';
      const autoIcon = slot.autoAccept ? ' ⚡' : '';

      return `
        <label class="rdv-slot-pick">
          <input type="radio" name="rdvSlotChoice" value="${origId}"
            data-start="${slot.startDateTime}" data-end="${slot.endDateTime}"
            data-target="${targetAgentKey}">
          <span class="rdv-slot-pick-label">
            ${start} – ${end}${label}${autoIcon}
          </span>
        </label>`;
    }).join('');

    el.querySelectorAll('input[name="rdvSlotChoice"]').forEach(radio => {
      radio.addEventListener('change', () => {
        _selectedSlot = {
          id:            radio.value,
          startDateTime: radio.dataset.start,
          endDateTime:   radio.dataset.end,
          selectedStart: null,
          selectedEnd:   null,
        };
        _showTimePicker(radio.dataset.start, radio.dataset.end, radio.dataset.target);
      });
    });
  }

  // ── Sous-sélection horaire : créneaux fixes de 30 min ───────────
  function _showTimePicker(slotStart, slotEnd, targetAgentKey) {
    const tp      = document.getElementById('rdvTimePicker');
    const slotsEl = document.getElementById('rdvTpSlots');
    if (!tp || !slotsEl) return;
    tp.classList.remove('hidden');
    slotsEl.innerHTML = '';
    if (_selectedSlot) { _selectedSlot.selectedStart = null; _selectedSlot.selectedEnd = null; }

    // Réservations existantes de l'agent cible sur cette plage (agenda global)
    const agentName   = DB.getAgentDisplayNameByKey(targetAgentKey) || '';
    const existingRes = DB.getInRange(slotStart, slotEnd).filter(r => {
      const a = r.agent === 'Autre' ? (r.agentCustom || '') : (r.agent || '');
      return a === agentName;
    });

    const endLim = new Date(slotEnd);
    const cursor = new Date(slotStart);

    while (cursor.getTime() + 30 * 60000 <= endLim.getTime()) {
      const hh  = String(cursor.getHours()).padStart(2, '0');
      const mm  = String(cursor.getMinutes()).padStart(2, '0');
      const dateStr  = cursor.toISOString().slice(0, 10);
      const startDT  = `${dateStr}T${hh}:${mm}`;
      const btnStart = cursor.getTime();
      const endObj   = new Date(btnStart + 30 * 60000);
      const eh  = String(endObj.getHours()).padStart(2, '0');
      const em  = String(endObj.getMinutes()).padStart(2, '0');
      const endDT    = `${endObj.toISOString().slice(0, 10)}T${eh}:${em}`;
      const btnEnd   = endObj.getTime();

      // Vérifier si ce créneau chevauche une réservation existante
      const busy = existingRes.some(r => {
        const rStart = r._start ? r._start.getTime() : new Date(r.startDateTime).getTime();
        const rEnd   = r._end   ? r._end.getTime()   : new Date(r.endDateTime).getTime();
        return btnStart < rEnd && btnEnd > rStart;
      });

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rdv-tp-slot-btn' + (busy ? ' busy' : '');
      btn.textContent = `${hh}:${mm} – ${eh}:${em}`;
      if (busy) {
        btn.disabled = true;
        btn.title = 'Déjà réservé dans l\'agenda';
      } else {
        btn.addEventListener('click', () => {
          slotsEl.querySelectorAll('.rdv-tp-slot-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (_selectedSlot) { _selectedSlot.selectedStart = startDT; _selectedSlot.selectedEnd = endDT; }
        });
      }
      slotsEl.appendChild(btn);
      cursor.setMinutes(cursor.getMinutes() + 30);
    }
  }

  // ── Onglet 2 : Envoyer la demande ────────────────────────────────
  async function _sendRequest() {
    _hideError('rdvRequestError');

    const targetAgentKey = document.getElementById('rdvTargetAgent')?.value;
    if (!targetAgentKey) {
      _showError('rdvRequestError', 'Veuillez sélectionner un agent.');
      return;
    }
    if (!_selectedSlot) {
      _showError('rdvRequestError', 'Veuillez sélectionner un créneau.');
      return;
    }
    if (!_selectedSlot.selectedStart || !_selectedSlot.selectedEnd) {
      _showError('rdvRequestError', 'Veuillez choisir une durée et une heure de début.');
      return;
    }

    const withType = document.querySelector('input[name="rdvWithType"]:checked')?.value || 'agent';
    let withPerson;
    if (withType === 'agent') {
      const wKey  = document.getElementById('rdvWithAgent')?.value;
      const wName = DB.getAgentDisplayNameByKey(wKey);
      if (!wKey) { _showError('rdvRequestError', 'Veuillez choisir l\'agent de la rencontre.'); return; }
      withPerson = { type: 'agent', name: wName, agentKey: wKey };
    } else {
      const wName = document.getElementById('rdvWithOtherName')?.value.trim();
      if (!wName) { _showError('rdvRequestError', 'Veuillez saisir le nom de la personne externe.'); return; }
      withPerson = { type: 'other', name: wName };
    }

    const message = document.getElementById('rdvMessage')?.value.trim() || '';
    const secret  = !!document.getElementById('rdvSecret')?.checked;

    const btn = document.getElementById('rdvSendRequest');
    if (btn) btn.disabled = true;

    try {
      await _processRequest({
        targetAgentKey,
        slotId:            _selectedSlot.id,
        startDateTime:     _selectedSlot.selectedStart,
        endDateTime:       _selectedSlot.selectedEnd,
        withPerson,
        message,
        secret,
      });
    } catch (e) {
      _showError('rdvRequestError', 'Erreur : ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function _processRequest({ targetAgentKey, slotId, startDateTime, endDateTime, withPerson, message, secret }) {
    // Vérifier via l'agenda global si le créneau 30min est déjà pris
    const agentName = DB.getAgentDisplayNameByKey(targetAgentKey) || '';
    const conflicts = DB.getInRange(startDateTime, endDateTime).filter(r => {
      const a = r.agent === 'Autre' ? (r.agentCustom || '') : (r.agent || '');
      return a === agentName;
    });
    if (conflicts.length) {
      _showError('rdvRequestError', 'Ce créneau est déjà réservé dans l\'agenda.');
      return;
    }

    // Lire les paramètres de l'agent cible pour savoir si auto-accept
    const settings = await DB.getAvailabilitySettings(targetAgentKey);
    const isAuto   = !!settings.autoAccept;

    const requesterName = _agentName || _agentKey;
    const withStr = withPerson.type === 'agent' ? withPerson.name : `(ext.) ${withPerson.name}`;

    if (!isAuto) {
      // Mode normal : créer la demande, envoyer notif à la cible
      const requestId = await DB.createAppointmentRequest({
        slotId,
        targetAgentKey,
        requesterAgentKey: _agentKey,
        requesterName,
        withPerson,
        message,
        secret: secret || null,
      });

      // Stocker startDateTime/endDateTime dans la demande pour affichage ultérieur
      await DB._ref(`appState/appointmentRequests/${requestId}`).update({
        startDateTime,
        endDateTime,
      });

      const targetName = DB.getAgentDisplayNameByKey(targetAgentKey);
      await DB.sendNotif(
        `📨 Demande de RDV de ${requesterName} — avec ${withStr}`,
        'rdv_request',
        targetAgentKey,
        { requestId, startDateTime, endDateTime, requesterAgentKey: _agentKey,
          withPersonName: withStr, rdvComment: message || null }
      );

      _showToast(`Demande envoyée à ${targetName} ✓`);
      _resetRequestForm();

    } else {
      // Mode auto-accept : vérifier le local favori
      const favLocalId = settings.favoriteLocalId ? String(settings.favoriteLocalId) : null;
      let localAvailable = false;

      if (favLocalId) {
        // Vérifier disponibilité du local sur ce créneau
        const conflicts = DB.getInRange(startDateTime, endDateTime)
          .filter(r => String(r.localId) === favLocalId && !DB.isLocalBackoffice(r.localId));
        localAvailable = conflicts.length === 0;
      }

      if (favLocalId && localAvailable) {
        // Auto-accept avec local favori dispo
        const requestId = await DB.createAppointmentRequest({
          slotId, targetAgentKey,
          requesterAgentKey: _agentKey, requesterName, withPerson, message, secret: secret || null,
        });
        await DB._ref(`appState/appointmentRequests/${requestId}`).update({
          startDateTime, endDateTime,
        });
        await _finalizeAccept(requestId, favLocalId, targetAgentKey, startDateTime, endDateTime, withPerson, message, true);
        _resetRequestForm();
      } else {
        // Auto-accept mais le demandeur doit choisir le local
        const requestId = await DB.createAppointmentRequest({
          slotId, targetAgentKey,
          requesterAgentKey: _agentKey, requesterName, withPerson, message, secret: secret || null,
        });
        await DB._ref(`appState/appointmentRequests/${requestId}`).update({
          startDateTime, endDateTime,
        });

        _showLocalPicker(requestId, startDateTime, endDateTime, targetAgentKey, withPerson, message, true, favLocalId ? 'Local favori non disponible — choisissez un autre local frontoffice.' : 'Choisissez le local pour ce rendez-vous.');
      }
    }
  }

  // ── Local picker ──────────────────────────────────────────────────
  function _showLocalPicker(requestId, startDT, endDT, targetAgentKey, withPerson, message, isAutoRequester, hintMsg) {
    _pendingAccept = { requestId, startDT, endDT, targetAgentKey, withPerson, message, isAutoRequester };

    const overlay  = document.getElementById('rdvLocalOverlay');
    const listEl   = document.getElementById('rdvLocalList');
    const hintEl   = document.getElementById('rdvLocalHint');
    if (!overlay || !listEl) return;

    if (hintEl) hintEl.textContent = hintMsg || 'Sélectionnez un local frontoffice pour ce rendez-vous.';

    // Construire la liste des locaux frontoffice avec état disponibilité
    const conflicts = DB.getInRange(startDT, endDT);
    const takenLocals = new Set(conflicts.map(r => String(r.localId)));

    const lieux = Object.entries(DB._lieux || {})
      .filter(([, l]) => !l.isBackoffice)
      .sort(([, a], [, b]) => (a.order || 999) - (b.order || 999));

    let html = '';
    lieux.forEach(([, lieu]) => {
      const visibleLocals = lieu.localIds.filter(lid => !DB.isLocalHidden(lid));
      if (!visibleLocals.length) return;
      html += `<div class="rdv-local-lieu"><strong>${escHtml(lieu.name)}</strong></div>`;
      visibleLocals.forEach(lid => {
        const label   = DB.getLocalLabel(lid);
        const isFree  = !takenLocals.has(String(lid));
        html += `
          <button class="rdv-local-btn${isFree ? '' : ' rdv-local-busy'}"
            data-lid="${lid}" ${isFree ? '' : 'disabled'}
            title="${isFree ? 'Disponible' : 'Déjà réservé sur ce créneau'}">
            <span class="rdv-local-icon">${isFree ? '🟢' : '🔴'}</span>
            <span>${escHtml(label)}</span>
            ${isFree ? '' : '<span class="rdv-local-busy-label">Occupé</span>'}
          </button>`;
      });
    });

    listEl.innerHTML = html || '<div class="rdv-empty">Aucun local frontoffice disponible.</div>';
    listEl.querySelectorAll('.rdv-local-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => _confirmLocalPick(String(btn.dataset.lid)));
    });

    overlay.classList.remove('hidden');
  }

  async function _confirmLocalPick(localId) {
    const overlay = document.getElementById('rdvLocalOverlay');
    overlay?.classList.add('hidden');

    if (!_pendingAccept) return;
    const { requestId, startDT, endDT, targetAgentKey, withPerson, message, isAutoRequester } = _pendingAccept;
    _pendingAccept = null;

    try {
      await _finalizeAccept(requestId, localId, targetAgentKey, startDT, endDT, withPerson, message, isAutoRequester);
    } catch (e) {
      _showToast('Erreur lors de la confirmation : ' + e.message, 'warn');
    }
  }

  // ── Finaliser l'acceptation (split backoffice + créer RDV) ────────
  async function _finalizeAccept(requestId, localId, targetAgentKey, startDT, endDT, withPerson, message, isAutoRequester) {
    const agentDisplayName = DB.getAgentDisplayNameByKey(targetAgentKey);
    const localName        = DB.getLocalName(localId);
    const withStr          = withPerson.type === 'agent' ? withPerson.name : `(ext.) ${withPerson.name}`;
    const rdvNote          = `RDV avec ${withStr}${message ? ' — ' + message : ''}`;

    // 1. Vérifier conflit RDV (même agent, type rendez-vous)
    const conflicts = DB.getInRange(startDT, endDT);
    const rdvConflict = conflicts.find(r =>
      r.agent === agentDisplayName && r.type === 'rendez-vous'
    );
    if (rdvConflict) {
      await DB.refuseAppointmentRequest(requestId);
      const req = await DB.getAppointmentRequest(requestId);
      if (req?.requesterAgentKey) {
        await DB.sendNotif(
          `❌ RDV refusé automatiquement — ${agentDisplayName} a déjà un rendez-vous sur ce créneau.`,
          'rdv_refused',
          req.requesterAgentKey,
          { requestId }
        );
      }
      _showToast('RDV refusé : conflit de rendez-vous pour cet agent.', 'warn');
      return;
    }

    // 2. Découper les réservations backoffice qui chevauchent
    const boRes = conflicts.filter(r =>
      r.agent === agentDisplayName &&
      DB.isLocalBackoffice(r.localId) &&
      r.startDateTime < endDT &&
      r.endDateTime > startDT
    );

    for (const bo of boRes) {
      // Supprimer l'occurrence BO originale (si récurrente, on utilise moveOccurrence logic)
      if (bo.recurrenceOriginId) {
        // C'est une occurrence développée — marquer comme exception sur la récurrence
        await DB.addException(bo.recurrenceOriginId, bo.startDateTime.slice(0, 10));
        // Recréer les tronçons comme réservations ponctuelles
        if (bo.startDateTime < startDT) {
          await DB._ref('reservations').push({
            localId:       String(bo.localId),
            agent:         bo.agent,
            services:      bo.services || [],
            startDateTime: bo.startDateTime,
            endDateTime:   startDT,
            recurrence:    { type: 'none' },
            createdAt:     Date.now(),
          });
        }
        if (bo.endDateTime > endDT) {
          await DB._ref('reservations').push({
            localId:       String(bo.localId),
            agent:         bo.agent,
            services:      bo.services || [],
            startDateTime: endDT,
            endDateTime:   bo.endDateTime,
            recurrence:    { type: 'none' },
            createdAt:     Date.now(),
          });
        }
      } else {
        // Réservation simple : la modifier/split
        await DB.remove(bo.id);
        if (bo.startDateTime < startDT) {
          await DB._ref('reservations').push({
            localId:       String(bo.localId),
            agent:         bo.agent,
            services:      bo.services || [],
            startDateTime: bo.startDateTime,
            endDateTime:   startDT,
            recurrence:    { type: 'none' },
            createdAt:     Date.now(),
          });
        }
        if (bo.endDateTime > endDT) {
          await DB._ref('reservations').push({
            localId:       String(bo.localId),
            agent:         bo.agent,
            services:      bo.services || [],
            startDateTime: endDT,
            endDateTime:   bo.endDateTime,
            recurrence:    { type: 'none' },
            createdAt:     Date.now(),
          });
        }
      }
    }

    // 3. Créer la réservation RDV
    const req0 = await DB.getAppointmentRequest(requestId);
    await DB._ref('reservations').push({
      localId:            String(localId),
      agent:              agentDisplayName,
      services:           [],
      type:               'rendez-vous',
      startDateTime:      startDT,
      endDateTime:        endDT,
      note:               rdvNote,
      secret:             req0?.secret ? true : null,
      requesterAgentKey:  req0?.requesterAgentKey || null,
      targetAgentKey:     targetAgentKey,
      recurrence:         { type: 'none' },
      createdAt:          Date.now(),
    });

    // 4. Mettre à jour le statut de la demande
    await DB.acceptAppointmentRequest(requestId, localId);

    // 5. Notifications
    const req = await DB.getAppointmentRequest(requestId);
    if (isAutoRequester) {
      // Le demandeur était en mode auto : notif informative à la cible
      await DB.sendNotif(
        `📅 RDV auto-accepté avec ${escHtml(req?.requesterName || '')} — ${_fmtDT(startDT)} au ${localName}`,
        'rdv_info',
        targetAgentKey,
        { requestId }
      );
      // Confirmation au demandeur
      _showToast(`✅ RDV confirmé au ${localName} — ${_fmtDT(startDT)}`);
    } else {
      // Mode manuel : notif retour au demandeur
      if (req?.requesterAgentKey) {
        await DB.sendNotif(
          `✅ RDV accepté par ${agentDisplayName} — ${_fmtDT(startDT)} au ${localName}`,
          'rdv_accepted',
          req.requesterAgentKey,
          { requestId, localId }
        );
      }
      _showToast(`RDV accepté et réservation créée au ${localName} ✓`);
    }
  }

  // ── Accepter une demande reçue (côté agent cible, manuel) ────────
  async function _startAccept(requestId) {
    const req = await DB.getAppointmentRequest(requestId);
    if (!req) { _showToast('Demande introuvable.', 'warn'); return; }

    _showLocalPicker(
      requestId,
      req.startDateTime,
      req.endDateTime,
      _agentKey,
      req.withPerson,
      req.message,
      false,
      'Choisissez le local frontoffice pour ce rendez-vous.'
    );
  }

  // ── Refuser une demande reçue ─────────────────────────────────────
  async function _doRefuse(requestId) {
    const req = await DB.getAppointmentRequest(requestId);
    if (!req) return;

    await DB.refuseAppointmentRequest(requestId);

    if (req.requesterAgentKey) {
      await DB.sendNotif(
        `❌ RDV refusé par ${_agentName || _agentKey}`,
        'rdv_refused',
        req.requesterAgentKey,
        { requestId }
      );
    }
    _showToast('Demande refusée.');
  }

  // ── Reset formulaire demande ──────────────────────────────────────
  function _resetRequestForm() {
    const sel = document.getElementById('rdvTargetAgent');
    if (sel) sel.value = '';
    _selectedSlot = null;
    _targetSlots  = [];
    document.getElementById('rdvTimePicker')?.classList.add('hidden');
    document.getElementById('rdvMessage').value = '';
    document.getElementById('rdvSlotPicker').innerHTML =
      '<div class="rdv-empty rdv-empty-sm">Sélectionnez un agent pour voir ses créneaux.</div>';
    document.getElementById('rdvWithAgent').value = '';
    document.getElementById('rdvWithOtherName').value = '';
    document.getElementById('rdvWithTypeAgent').checked = true;
    document.getElementById('rdvWithAgentWrap').classList.remove('hidden');
    document.getElementById('rdvWithOtherWrap').classList.add('hidden');
    _hideError('rdvRequestError');
  }

  // ── Bind des événements ───────────────────────────────────────────
  function _bindEvents() {
    // Onglets
    document.querySelectorAll('.rdv-tab[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rdv-tab').forEach(b => b.classList.remove('rdv-tab-active'));
        document.querySelectorAll('.rdv-panel').forEach(p => p.classList.add('hidden'));
        btn.classList.add('rdv-tab-active');
        const panel = document.getElementById(`rdvPanel${btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)}`);
        panel?.classList.remove('hidden');
      });
    });

    // Onglet 1 — Ajouter créneau
    document.getElementById('rdvAddSlot')?.addEventListener('click', _addSlot);

    // Onglet 1 — Récurrence toggle
    document.getElementById('rdvSlotRecurrence')?.addEventListener('change', e => {
      const wrap = document.getElementById('rdvRecEndWrap');
      wrap?.classList.toggle('hidden', e.target.value === 'none');
    });

    // Onglet 1 — Auto-accept toggle → sauvegarder + afficher/masquer local favori
    document.getElementById('rdvAutoAcceptGlobal')?.addEventListener('change', async (e) => {
      const row = document.getElementById('rdvFavoriteRow');
      row?.classList.toggle('hidden', !e.target.checked);
      await _saveSettings();
    });

    // Onglet 1 — Lieu favori change → rendre les boutons locaux
    document.getElementById('rdvFavLieu')?.addEventListener('change', e => {
      const hidden = document.getElementById('rdvFavoriteLocal');
      if (hidden) hidden.value = '';
      _renderFavLocals(e.target.value);
      _saveSettings();
    });

    // Onglet 2 — Sélection agent cible
    document.getElementById('rdvTargetAgent')?.addEventListener('change', e => {
      _loadTargetSlots(e.target.value);
    });

    // Onglet 2 — Type "avec qui"
    document.querySelectorAll('input[name="rdvWithType"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const isAgent = document.getElementById('rdvWithTypeAgent').checked;
        document.getElementById('rdvWithAgentWrap').classList.toggle('hidden', !isAgent);
        document.getElementById('rdvWithOtherWrap').classList.toggle('hidden', isAgent);
      });
    });

    // Onglet 2 — Envoyer
    document.getElementById('rdvSendRequest')?.addEventListener('click', _sendRequest);

    // Modale suppression récurrence
    document.getElementById('rdvDelOccBtn')?.addEventListener('click', async () => {
      document.getElementById('rdvDelRecOverlay')?.classList.add('hidden');
      if (_pendingDelete) {
        await _deleteSlotOccurrence(_pendingDelete.slotId, _pendingDelete.occDate);
        _pendingDelete = null;
      }
    });
    document.getElementById('rdvDelSeriesBtn')?.addEventListener('click', async () => {
      document.getElementById('rdvDelRecOverlay')?.classList.add('hidden');
      if (_pendingDelete) {
        await _deleteSlot(_pendingDelete.slotId);
        _pendingDelete = null;
      }
    });
    document.getElementById('rdvDelCancelBtn')?.addEventListener('click', () => {
      document.getElementById('rdvDelRecOverlay')?.classList.add('hidden');
      _pendingDelete = null;
    });

    // Local picker — fermeture
    document.getElementById('rdvLocalClose')?.addEventListener('click', () => {
      document.getElementById('rdvLocalOverlay')?.classList.add('hidden');
      _pendingAccept = null;
    });
    document.getElementById('rdvLocalCancel')?.addEventListener('click', () => {
      document.getElementById('rdvLocalOverlay')?.classList.add('hidden');
      _pendingAccept = null;
    });
    document.getElementById('rdvLocalOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'rdvLocalOverlay') {
        document.getElementById('rdvLocalOverlay').classList.add('hidden');
        _pendingAccept = null;
      }
    });

    // Initialiser la date du formulaire à aujourd'hui
    const dateInput = document.getElementById('rdvSlotDate');
    if (dateInput) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
  }

  // ── Démarrage ─────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
