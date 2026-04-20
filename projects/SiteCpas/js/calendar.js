// ═══════════════════════════════════════════════════════════════════
// calendar.js — Vues jour / semaine / mois
// ═══════════════════════════════════════════════════════════════════

// Retourne [id, absence] si l'utilisateur courant est absent ce jour-là, sinon null.
function _myAbsenceOn(dateStr) {
  const k = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('cpas_current_agent_key') : null;
  return k && typeof DB !== 'undefined' ? DB.getAgentAbsenceOn(k, dateStr) : null;
}

const CAL = {
  view: 'day',
  date: new Date(),
  _deskFilter: null,   // null = locaux sans desk | localId = desks de ce local
  _newDayLayout: true, // feature flag : nouvelle vue jour (1 col/local + desks en sous-lanes)
  _rowHeight: 36,      // hauteur d'une ligne de slot (doit matcher .cv-cell { height })
  _defaultColW: 140,   // largeur par défaut d'une colonne locale (new layout)
  _colWidthsKey: 'cpas_day_col_widths',   // clé localStorage
  _compactKey:   'cpas_day_compact',       // clé localStorage pour vue compacte
  get _compactMode() {
    try { return localStorage.getItem(this._compactKey) === '1'; }
    catch (_) { return false; }
  },
  set _compactMode(v) {
    try { localStorage.setItem(this._compactKey, v ? '1' : '0'); }
    catch (_) {}
  },

  _getColWidths() {
    try { return JSON.parse(localStorage.getItem(this._colWidthsKey) || '{}'); }
    catch (_) { return {}; }
  },
  _setColWidth(localId, widthPx) {
    const widths = this._getColWidths();
    if (widthPx == null) delete widths[localId];
    else widths[localId] = widthPx;
    try { localStorage.setItem(this._colWidthsKey, JSON.stringify(widths)); }
    catch (_) {}
  },

  setView(v) { this.view = v; this.render(); },

  navigate(dir) {
    const d = new Date(this.date);
    if (this.view === 'day') {
      d.setDate(d.getDate() + dir);
      // Sauter les jours inactifs (week-end ou jours fermés selon config)
      let guard = 0;
      while (!DB.isDayActive(d) && guard++ < 14) {
        d.setDate(d.getDate() + (dir >= 0 ? 1 : -1));
      }
    }
    if (this.view === 'week') {
      // Sur mobile (< 768px) : vue 3 jours → avancer de 3 jours
      const isMobile = window.innerWidth < 768;
      d.setDate(d.getDate() + (isMobile ? 3 * dir : 7 * dir));
    }
    if (this.view === 'month') d.setMonth(d.getMonth() + dir);
    this.date = d;
    this.render();
  },

  goToday() {
    const d = new Date();
    // Si aujourd'hui est un jour inactif, avancer au prochain jour actif
    let guard = 0;
    while (!DB.isDayActive(d) && guard++ < 14) {
      d.setDate(d.getDate() + 1);
    }
    this.date = d;
    this.render();
  },

  render() {
    const el = document.getElementById('cal');
    if (this.view === 'day')   this._renderDay(el);
    if (this.view === 'week')  this._renderWeek(el);
    if (this.view === 'month') this._renderMonth(el);
    updateStatusBar();
  },

  // ─────────────────────────────────────────────────────────────────
  // VUE JOUR — dispatcher (ancienne table vs nouvelle canvas par local)
  // ─────────────────────────────────────────────────────────────────
  _renderDay(el) {
    if (this._newDayLayout) return this._renderDayNew(el);
    return this._renderDayOld(el);
  },

  // ─────────────────────────────────────────────────────────────────
  // VUE JOUR — ANCIENNE : table avec 1 colonne par desk, rowspan
  // (conservée derrière le feature flag pour rollback rapide)
  // ─────────────────────────────────────────────────────────────────
  _renderDayOld(el) {
    const d     = this.date;
    const { openHour, closeHour, slotMin: slotMinDay } = DB.getLieuConfig();
    const dS    = new Date(d); dS.setHours(openHour,  0, 0, 0);
    const dE    = new Date(d); dE.setHours(closeHour, 0, 0, 0);
    const occs  = DB.getInRange(dS, dE);
    const slots = getSlots();
    const total = slots.length;

    // ── Filtre desk : locaux avec desks → toggle buttons ──────────────
    const allUnits = DB.getDisplayUnits();
    // Locaux qui possèdent des desks (pour les toggles)
    const deskLocals = [];
    const seen = new Set();
    allUnits.forEach(u => {
      if (u.type === 'desk' && !seen.has(u.localId)) {
        seen.add(u.localId);
        deskLocals.push({ localId: u.localId, label: DB.getLocalLabel(u.localId) });
      }
    });
    // Si le filtre pointe vers un local qui n'a plus de desks, reset
    if (this._deskFilter && !deskLocals.some(dl => dl.localId === this._deskFilter)) this._deskFilter = null;

    // Unités visibles selon le filtre
    const displayUnits = this._deskFilter
      ? allUnits.filter(u => u.type === 'desk' && u.localId === this._deskFilter)
      : allUnits.filter(u => u.type === 'local');

    const coveredUntil = {};
    displayUnits.forEach(u => coveredUntil[u.deskId ?? u.localId] = 0);

    // ── Colonne "Mon agenda" ──────────────────────────────────────────
    const myAgentName = document.getElementById('hsGreeting')?.dataset?.agentName || '';
    const myOccs = myAgentName
      ? occs.filter(r => !r.isPermanent && (
          r.agent === myAgentName ||
          (r.agent === 'Autre' && r.agentCustom === myAgentName) ||
          (Array.isArray(r.agents) && r.agents.includes(myAgentName))
        ))
      : [];
    const myAgentColor = myAgentName ? DB.getAgentColor(myAgentName) : null;
    let coveredUntilMe = 0;

    const dateLabel = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const isToday   = sameDay(d, new Date());

    const holidayName = isBelgianHoliday(isoDate(d)) ? getHolidayName(isoDate(d)) : '';
    // ── Barre de toggles desk (conteneur fixe #deskFilterBar) ──────
    const filterBar = document.getElementById('deskFilterBar');
    if (filterBar) {
      if (deskLocals.length) {
        let fb = `<button class="cv-desk-toggle${!this._deskFilter ? ' active' : ''}" data-filter="">Locaux</button>`;
        deskLocals.forEach(dl => {
          const nDesks = allUnits.filter(u => u.type === 'desk' && u.localId === dl.localId).length;
          fb += `<button class="cv-desk-toggle${this._deskFilter === dl.localId ? ' active' : ''}" data-filter="${dl.localId}">${escapeHtml(dl.label)} <small>(${nDesks})</small></button>`;
        });
        filterBar.innerHTML = fb;
        filterBar.classList.remove('hidden');
        filterBar.querySelectorAll('.cv-desk-toggle').forEach(btn => {
          btn.addEventListener('click', () => {
            const val = btn.dataset.filter;
            this._deskFilter = val ? parseInt(val) : null;
            this.render();
          });
        });
      } else {
        filterBar.innerHTML = '';
        filterBar.classList.add('hidden');
      }
    }

    const myAbs = _myAbsenceOn(isoDate(d));
    const absBanner = myAbs ? (() => {
      const a = myAbs[1];
      const m = (DB.ABSENCE_MOTIFS && DB.ABSENCE_MOTIFS[a.motif]) || { icon: '📝', label: 'Absence' };
      return `<div class="cv-abs-banner">
        <span class="cv-abs-icon">${m.icon}</span>
        <span class="cv-abs-text">Vous êtes en ${m.label.toLowerCase()} ce jour${a.comment ? ` — ${escapeHtml(a.comment)}` : ''}</span>
      </div>`;
    })() : '';

    let h = absBanner;
    h += `<div class="cv-day-datebar${isToday ? ' is-today' : ''}${myAbs ? ' has-abs' : ''}">
      ${dateLabel}
      ${holidayName ? `<span class="cv-holiday-badge">🇧🇪 ${holidayName}</span>` : ''}
    </div>`;
    h += '<table class="cv-day-table"><thead><tr>';
    h += '<th class="tc-hd"></th>';
    if (myAgentName) h += '<th class="loc-hd my-agenda-hd">👤 Mon agenda</th>';
    displayUnits.forEach(u => h += `<th class="loc-hd">${escapeHtml(u.label)}</th>`);
    h += '</tr></thead><tbody>';

    slots.forEach((slot, i) => {
      const sS = new Date(d); sS.setHours(slot.h, slot.m, 0, 0);
      const sE = new Date(sS.getTime() + slotMinDay * 60000);

      h += `<tr class="cv-row${i % 2 ? ' alt' : ''}" data-slot="${i}">`;
      h += `<td class="tc">${slot.label}</td>`;

      // ── Colonne Mon agenda ─────────────────────────────────────────
      if (myAgentName) {
        if (coveredUntilMe <= i) {
          const myRes = myOccs.find(r => r._start < sE && r._end > sS);
          if (myRes) {
            let span = 0;
            for (let j = i; j < total; j++) {
              const jS = new Date(d); jS.setHours(slots[j].h, slots[j].m, 0, 0);
              const jE = new Date(jS.getTime() + slotMinDay * 60000);
              if (myRes._start < jE && myRes._end > jS) span++;
              else if (jS >= myRes._end) break;
            }
            span = Math.max(1, span);
            coveredUntilMe = i + span;
            const mySvc  = DB.getSvcLabel(myRes);
            const myLoc  = DB.getUnitLabel(parseInt(myRes.localId), myRes.deskId || null);
            const myStartH = myRes._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
            const myEndH   = myRes._end.toLocaleTimeString('fr-BE',   { hour: '2-digit', minute: '2-digit' });
            const myStyle  = myAgentColor ? ` style="background:${myAgentColor}20;border-left:3px solid ${myAgentColor}"` : '';
            h += `<td class="cv-cell is-booked my-agenda-cell" rowspan="${span}"
              data-id="${myRes.id}" data-occ="${myRes._occDate || ''}" data-act="detail"
              data-occ-date="${isoDate(myRes._start)}"${myStyle}>
              <span class="ct"><b>${escapeHtml(mySvc)}</b><br>
              <small>${escapeHtml(myLoc)}</small><br>
              <small class="ct-time">${myStartH} – ${myEndH}</small></span>
            </td>`;
          } else {
            h += `<td class="cv-cell my-agenda-cell my-agenda-free"></td>`;
          }
        }
      }

      displayUnits.forEach(u => {
        const unitKey = u.deskId ?? u.localId;
        // Cette cellule est couverte par un rowspan précédent → on l'ignore
        if (coveredUntil[unitKey] > i) return;

        const perm = occs.find(r => DB.unitOccupies(r, u.localId, u.deskId) && r.isPermanent);
        const res  = occs.find(r =>
          DB.unitOccupies(r, u.localId, u.deskId) && !r.isPermanent && r._start < sE && r._end > sS
        );

        if (perm) {
          // Permanent → couvre tous les créneaux restants
          const span = total - i;
          coveredUntil[unitKey] = total;
          const svc = DB.getSvcLabel(perm);
          h += `<td class="cv-cell is-perm" rowspan="${span}" data-id="${perm.id}" data-act="detail">
            <span class="ct">🔒 ${svc}</span>
          </td>`;

        } else if (res) {
          // Calculer le nombre de créneaux couverts par cette réservation
          let span = 0;
          for (let j = i; j < total; j++) {
            const jS = new Date(d); jS.setHours(slots[j].h, slots[j].m, 0, 0);
            const jE = new Date(jS.getTime() + slotMinDay * 60000);
            if (res._start < jE && res._end > jS) span++;
            else if (jS >= res._end) break;
          }
          span = Math.max(1, span);
          coveredUntil[unitKey] = i + span;

          const isRdv = res.type === 'rendez-vous';
          const myKey = sessionStorage.getItem('cpas_current_agent_key');
          const isConcernedRdv = !res.secret || (myKey && (myKey === res.requesterAgentKey || myKey === res.targetAgentKey));
          let svcs, svc;
          if (isRdv) {
            const noteDisplay = res.secret && !isConcernedRdv ? '🔒 Confidentiel' : (res.note || '');
            svcs = ['📅 Rendez-vous' + (noteDisplay ? ` · ${noteDisplay}` : '')];
            svc  = svcs[0];
          } else {
            svcs  = DB.getResSvcs(res).map(s => s === 'Autre' ? (res.serviceCustom || 'Autre') : s);
            svc   = svcs.join(' + ');
          }
          const agt   = res.agent   === 'Autre' ? res.agentCustom  : res.agent;
          // Afficher tous les participants (agents[]) sans doublon avec agent principal
          const allAgts = Array.isArray(res.agents) && res.agents.length > 1
            ? res.agents
            : (agt ? [agt] : []);
          const agtFmt = allAgts.map(n => fmtAgent(n)).join(', ');
          const recType = res.recurrence?.type;
          const isRec   = recType && recType !== 'none';
          const recLabels = { daily: 'Quotidien', weekly: 'Hebdomadaire', monthly: 'Mensuel' };
          const recLabel  = isRec ? recLabels[recType] || '' : '';
          const startH = res._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          const endH   = res._end.toLocaleTimeString('fr-BE',   { hour: '2-digit', minute: '2-digit' });
          const agentColor = isRdv ? null : DB.getAgentColor(agt);
          const colorStyle = agentColor ? ` style="background:${agentColor}20;border-left:3px solid ${agentColor}"` : '';
          const comment = res.comment ? res.comment.trim() : '';
          const isInvited = myKey && res.invitedAgents?.[myKey];
          const invitedNames = res.invitedAgents
            ? Object.keys(res.invitedAgents).map(k => DB.getAgentsWithKeys().find(a => a.key === k)?.name || k).join(', ')
            : '';
          h += `<td class="cv-cell is-booked${isRec ? ' is-rec' : ''}${isInvited ? ' is-invited' : ''}${isRdv ? ' is-rdv' : ''}" rowspan="${span}"
            data-id="${res.id}" data-occ="${res._occDate || ''}" data-act="detail" data-type="${res.type || ''}"
            data-slot="${i}" data-local="${u.localId}" data-desk="${u.deskId || ''}" data-span="${span}" data-occ-date="${isoDate(res._start)}"
            ${colorStyle}>
            <span class="ct ct-drag" draggable="true"
              data-id="${res.id}" data-slot="${i}" data-local="${u.localId}" data-desk="${u.deskId || ''}" data-span="${span}"
              data-occ-date="${isoDate(res._start)}" data-is-rec="${isRec ? '1' : '0'}">
              ${svcs.map(s => `<b>${escapeHtml(s)}</b>`).join('<br>')}
              <br><small>${agtFmt}</small><br>
              <small class="ct-time">${startH} – ${endH}${isRec ? ` ↻ ${recLabel}` : ''}</small>
              ${!isRdv && comment ? `<small class="ct-comment" title="${escapeHtml(comment)}">💬 ${escapeHtml(comment)}</small>` : ''}
              ${invitedNames ? `<small class="ct-invited" title="Agents invités : ${escapeHtml(invitedNames)}">👥 ${escapeHtml(invitedNames)}</small>` : ''}
            </span>
            <div class="ct-resize" title="Étirer la réservation"></div>
          </td>`;

        } else {
          h += `<td class="cv-cell is-free" data-local="${u.localId}" data-desk="${u.deskId || ''}" data-date="${isoDate(d)}" data-time="${slot.label}" data-slot="${i}" data-act="new"></td>`;
        }
      });

      h += '</tr>';
    });

    h += '</tbody></table>';
    el.innerHTML = h;
    this._bind(el);
    this._bindDnd(el, d);
    this._renderNowLine(el, d);

  },

  // ─────────────────────────────────────────────────────────────────
  // VUE JOUR — NOUVELLE : 1 colonne par local, résas positionnées en
  // absolu dans un <td rowspan> canvas. Desks = sous-lanes (Phase 2+).
  // ─────────────────────────────────────────────────────────────────
  _renderDayNew(el) {
    const d     = this.date;
    const { openHour, closeHour, slotMin: slotMinDay } = DB.getLieuConfig();
    const dS    = new Date(d); dS.setHours(openHour,  0, 0, 0);
    const dE    = new Date(d); dE.setHours(closeHour, 0, 0, 0);
    const occs  = DB.getInRange(dS, dE);
    const slots = getSlots();
    const total = slots.length;
    const ROW_H = this._rowHeight || 36;
    const myKey = sessionStorage.getItem('cpas_current_agent_key');
    const compactMode = this._compactMode;

    // ── Locaux à afficher (1 colonne par local) ────────────────────
    const allLocals = CONFIG.LOCALS.map(localId => ({
      localId,
      label:    DB.getLocalLabel(localId),
      deskList: DB.getLocalDesks(localId),    // [] si pas de desks
    }));
    // _deskFilter = localId → mode zoom (1 seul local affiché), voir Phase 6
    if (this._deskFilter && !allLocals.some(l => l.localId === this._deskFilter)) this._deskFilter = null;
    const displayLocals = this._deskFilter
      ? allLocals.filter(l => l.localId === this._deskFilter)
      : allLocals;

    // ── Barre de toggles desk-filter (mode zoom) ───────────────────
    const filterBar = document.getElementById('deskFilterBar');
    if (filterBar) {
      const deskLocals = allLocals.filter(l => l.deskList.length > 0);
      if (deskLocals.length) {
        let fb = `<button class="cv-desk-toggle${!this._deskFilter ? ' active' : ''}" data-filter="">Tous les locaux</button>`;
        deskLocals.forEach(dl => {
          fb += `<button class="cv-desk-toggle${this._deskFilter === dl.localId ? ' active' : ''}" data-filter="${dl.localId}">${escapeHtml(dl.label)} <small>(${dl.deskList.length})</small></button>`;
        });
        filterBar.innerHTML = fb;
        filterBar.classList.remove('hidden');
        filterBar.querySelectorAll('.cv-desk-toggle').forEach(btn => {
          btn.addEventListener('click', () => {
            const val = btn.dataset.filter;
            this._deskFilter = val ? parseInt(val) : null;
            this.render();
          });
        });
      } else {
        filterBar.innerHTML = '';
        filterBar.classList.add('hidden');
      }
    }

    // ── Colonne "Mon agenda" (inchangée : rowspan par slot) ────────
    const myAgentName = document.getElementById('hsGreeting')?.dataset?.agentName || '';
    const myOccs = myAgentName
      ? occs.filter(r => !r.isPermanent && (
          r.agent === myAgentName ||
          (r.agent === 'Autre' && r.agentCustom === myAgentName) ||
          (Array.isArray(r.agents) && r.agents.includes(myAgentName))
        ))
      : [];
    const myAgentColor = myAgentName ? DB.getAgentColor(myAgentName) : null;
    let coveredUntilMe = 0;

    // ── Date bar + absence ─────────────────────────────────────────
    const dateLabel = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const isToday   = sameDay(d, new Date());
    const holidayName = isBelgianHoliday(isoDate(d)) ? getHolidayName(isoDate(d)) : '';
    const myAbs = _myAbsenceOn(isoDate(d));
    const absBanner = myAbs ? (() => {
      const a = myAbs[1];
      const m = (DB.ABSENCE_MOTIFS && DB.ABSENCE_MOTIFS[a.motif]) || { icon: '📝', label: 'Absence' };
      return `<div class="cv-abs-banner">
        <span class="cv-abs-icon">${m.icon}</span>
        <span class="cv-abs-text">Vous êtes en ${m.label.toLowerCase()} ce jour${a.comment ? ` — ${escapeHtml(a.comment)}` : ''}</span>
      </div>`;
    })() : '';

    let h = absBanner;
    // Wrapper qui adopte la largeur du contenu (>= viewport) pour que la
    // datebar et l'entête sticky s'étendent sur toute la zone scrollable.
    h += '<div class="cv-day-wrapper">';
    h += `<div class="cv-day-datebar${isToday ? ' is-today' : ''}${myAbs ? ' has-abs' : ''}">
      ${dateLabel}
      ${holidayName ? `<span class="cv-holiday-badge">🇧🇪 ${holidayName}</span>` : ''}
      <button class="cv-compact-toggle${compactMode ? ' is-active' : ''}" id="calCompactToggle" type="button"
        title="Basculer entre vue compacte et vue complète">
        ${compactMode ? '📋 Vue complète' : '📐 Vue compacte'}
      </button>
    </div>`;

    // ── Table ──────────────────────────────────────────────────────
    // Largeurs personnalisées (localStorage) — Phase 5
    const colWidths = this._getColWidths();

    h += '<table class="cv-day-table cv-day-table-new"><thead><tr>';
    h += '<th class="tc-hd"></th>';
    if (myAgentName) h += '<th class="loc-hd my-agenda-hd">👤 Mon agenda</th>';
    // Y a-t-il au moins un local avec des desks ? Si oui, on émet une
    // sous-ligne (desks OU placeholder vide) pour que toutes les cellules
    // de thead aient la même hauteur — évite l'espace superflu visuel.
    const anyHasDesks = displayLocals.some(l => l.deskList.length >= 2);
    displayLocals.forEach(l => {
      const N = l.deskList.length;
      let subLabels = '';
      if (N >= 2) {
        subLabels = '<div class="loc-hd-desks">' +
          l.deskList.map(did => `<span class="loc-hd-desk" title="${escapeHtml(DB.getDeskLabel(did))}">${escapeHtml(DB.getDeskLabel(did))}</span>`).join('') +
          '</div>';
      } else if (anyHasDesks) {
        // Placeholder pour aligner la hauteur avec les locaux qui ont des desks
        subLabels = '<div class="loc-hd-desks loc-hd-desks-empty"></div>';
      }
      // Mode zoom : largeur = max(stockée, N × defaultColW) pour donner ~defaultColW par desk lane
      let w = colWidths[l.localId] || this._defaultColW;
      if (this._deskFilter === l.localId && N >= 1) {
        w = Math.max(w, N * this._defaultColW);
      }
      h += `<th class="loc-hd${N >= 2 ? ' has-desks' : ''}${this._deskFilter === l.localId ? ' is-zoomed' : ''}" data-local="${l.localId}" style="width:${w}px">
        <div class="loc-hd-name">${escapeHtml(l.label)}</div>
        ${subLabels}
        <span class="loc-hd-resize" data-local="${l.localId}" title="Glisser pour redimensionner — double-clic pour réinitialiser"></span>
      </th>`;
    });
    h += '</tr></thead><tbody>';

    // ── Pré-calcul des blocs HTML par local ────────────────────────
    const blocksByLocal = {};
    displayLocals.forEach(l => { blocksByLocal[l.localId] = ''; });

    displayLocals.forEach(l => {
      const localResas = occs.filter(r => parseInt(r.localId) === l.localId);
      localResas.forEach(r => {
        // Trouver le slot de début
        let startIdx = -1;
        for (let j = 0; j < slots.length; j++) {
          const jS = new Date(d); jS.setHours(slots[j].h, slots[j].m, 0, 0);
          const jE = new Date(jS.getTime() + slotMinDay * 60000);
          if (r._start < jE && r._end > jS) { startIdx = j; break; }
        }
        if (startIdx === -1) return;
        // Calculer le span
        let span = 0;
        for (let j = startIdx; j < slots.length; j++) {
          const jS = new Date(d); jS.setHours(slots[j].h, slots[j].m, 0, 0);
          const jE = new Date(jS.getTime() + slotMinDay * 60000);
          if (r._start < jE && r._end > jS) span++;
          else break;
        }
        span = Math.max(1, span);

        const top    = startIdx * ROW_H;
        const heightPx = span * ROW_H;
        // Phase 2 : positionnement dans la sous-lane du desk si applicable
        const N        = l.deskList.length;
        const deskIdx  = r.deskId ? l.deskList.indexOf(r.deskId) : -1;
        const orphan   = r.deskId && deskIdx === -1;   // desk supprimé depuis
        const fullWidth = !r.deskId || orphan || N === 0;
        const left     = fullWidth ? 0 : (deskIdx / N) * 100;
        const widthPct = fullWidth ? 100 : (100 / N);

        // Résa permanente → bloc spécial pleine hauteur
        if (r.isPermanent) {
          const svc = DB.getSvcLabel(r);
          blocksByLocal[l.localId] += `<div class="resa-block is-perm"
            style="top:0px;height:${total * ROW_H}px;left:${left}%;width:${widthPct}%"
            data-id="${r.id}" data-act="detail" data-slot="0" data-local="${l.localId}" data-desk="${r.deskId || ''}" data-span="${total}">
            <span class="ct">🔒 ${escapeHtml(svc)}</span>
          </div>`;
          return;
        }

        // Résa normale : reprise de la logique de _renderDayOld
        const isRdv = r.type === 'rendez-vous';
        const isConcernedRdv = !r.secret || (myKey && (myKey === r.requesterAgentKey || myKey === r.targetAgentKey));
        let svcs, svc;
        if (isRdv) {
          const noteDisplay = r.secret && !isConcernedRdv ? '🔒 Confidentiel' : (r.note || '');
          svcs = ['📅 Rendez-vous' + (noteDisplay ? ` · ${noteDisplay}` : '')];
          svc  = svcs[0];
        } else {
          svcs = DB.getResSvcs(r).map(s => s === 'Autre' ? (r.serviceCustom || 'Autre') : s);
          svc  = svcs.join(' + ');
        }
        const agt = r.agent === 'Autre' ? r.agentCustom : r.agent;
        const allAgts = Array.isArray(r.agents) && r.agents.length > 1 ? r.agents : (agt ? [agt] : []);
        const agtFmt = allAgts.map(n => fmtAgent(n)).join(', ');
        const recType = r.recurrence?.type;
        const isRec   = recType && recType !== 'none';
        const recLabels = { daily: 'Quotidien', weekly: 'Hebdomadaire', monthly: 'Mensuel' };
        const recLabel  = isRec ? recLabels[recType] || '' : '';
        const startH = r._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
        const endH   = r._end.toLocaleTimeString('fr-BE',   { hour: '2-digit', minute: '2-digit' });
        const agentColor = isRdv ? null : DB.getAgentColor(agt);
        const colorStyle = agentColor ? `background:${agentColor}20;border-left:3px solid ${agentColor};` : '';
        const comment = r.comment ? r.comment.trim() : '';
        const isInvited = myKey && r.invitedAgents?.[myKey];
        const invitedNames = r.invitedAgents
          ? Object.keys(r.invitedAgents).map(k => DB.getAgentsWithKeys().find(a => a.key === k)?.name || k).join(', ')
          : '';

        // Deux rendus possibles : complet (défaut) ou compact (via toggle)
        let innerHtml;
        if (compactMode) {
          // Tooltip complet sur hover en mode compact
          const tooltipParts = [
            svcs.join(' + '),
            agtFmt,
            `${startH} – ${endH}${isRec ? ` (${recLabel})` : ''}`,
            comment && !isRdv ? `💬 ${comment}` : '',
            invitedNames ? `👥 ${invitedNames}` : '',
          ].filter(Boolean);
          const tooltip = tooltipParts.join('\n');
          const metaBits = [];
          if (agtFmt) metaBits.push(`<span class="resa-agent">${escapeHtml(agtFmt)}</span>`);
          metaBits.push(`<span class="resa-time">${startH}–${endH}</span>`);
          if (isRec) metaBits.push(`<span class="resa-rec">↻ ${recLabel}</span>`);
          innerHtml = `<span class="ct ct-drag" draggable="true"
              data-id="${r.id}" data-slot="${startIdx}" data-local="${l.localId}" data-desk="${r.deskId || ''}" data-span="${span}"
              data-occ-date="${isoDate(r._start)}" data-is-rec="${isRec ? '1' : '0'}"
              title="${escapeHtml(tooltip)}">
              <div class="resa-svc">${svcs.map(s => escapeHtml(s)).join(' + ')}</div>
              <div class="resa-meta">${metaBits.join(' · ')}</div>
              ${!isRdv && comment ? `<div class="resa-extra resa-comment">💬 ${escapeHtml(comment)}</div>` : ''}
              ${invitedNames ? `<div class="resa-extra resa-invited">👥 ${escapeHtml(invitedNames)}</div>` : ''}
            </span>
            <div class="ct-resize" title="Étirer la réservation"></div>`;
        } else {
          // Rendu complet (verbose) — chaque info sur sa ligne
          innerHtml = `<span class="ct ct-drag" draggable="true"
              data-id="${r.id}" data-slot="${startIdx}" data-local="${l.localId}" data-desk="${r.deskId || ''}" data-span="${span}"
              data-occ-date="${isoDate(r._start)}" data-is-rec="${isRec ? '1' : '0'}">
              ${svcs.map(s => `<b>${escapeHtml(s)}</b>`).join('<br>')}
              <br><small>${agtFmt}</small><br>
              <small class="ct-time">${startH} – ${endH}${isRec ? ` ↻ ${recLabel}` : ''}</small>
              ${!isRdv && comment ? `<small class="ct-comment" title="${escapeHtml(comment)}">💬 ${escapeHtml(comment)}</small>` : ''}
              ${invitedNames ? `<small class="ct-invited" title="Agents invités : ${escapeHtml(invitedNames)}">👥 ${escapeHtml(invitedNames)}</small>` : ''}
            </span>
            <div class="ct-resize" title="Étirer la réservation"></div>`;
        }

        blocksByLocal[l.localId] += `<div class="resa-block is-booked${isRec ? ' is-rec' : ''}${isInvited ? ' is-invited' : ''}${isRdv ? ' is-rdv' : ''}"
          style="top:${top}px;height:${heightPx}px;left:${left}%;width:${widthPct}%;${colorStyle}"
          data-id="${r.id}" data-occ="${r._occDate || ''}" data-act="detail" data-type="${r.type || ''}"
          data-slot="${startIdx}" data-local="${l.localId}" data-desk="${r.deskId || ''}" data-span="${span}" data-occ-date="${isoDate(r._start)}">
          ${innerHtml}
        </div>`;
      });
    });

    // ── Émission des <tr> ──────────────────────────────────────────
    const canvasHeight = total * ROW_H;
    slots.forEach((slot, i) => {
      const sS = new Date(d); sS.setHours(slot.h, slot.m, 0, 0);
      const sE = new Date(sS.getTime() + slotMinDay * 60000);

      h += `<tr class="cv-row${i % 2 ? ' alt' : ''}" data-slot="${i}">`;
      h += `<td class="tc">${slot.label}</td>`;

      // Mon agenda (inchangé — rowspan par slot)
      if (myAgentName) {
        if (coveredUntilMe <= i) {
          const myRes = myOccs.find(r => r._start < sE && r._end > sS);
          if (myRes) {
            let mySpan = 0;
            for (let j = i; j < total; j++) {
              const jS = new Date(d); jS.setHours(slots[j].h, slots[j].m, 0, 0);
              const jE = new Date(jS.getTime() + slotMinDay * 60000);
              if (myRes._start < jE && myRes._end > jS) mySpan++;
              else if (jS >= myRes._end) break;
            }
            mySpan = Math.max(1, mySpan);
            coveredUntilMe = i + mySpan;
            const mySvc  = DB.getSvcLabel(myRes);
            const myLoc  = DB.getUnitLabel(parseInt(myRes.localId), myRes.deskId || null);
            const myStartH = myRes._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
            const myEndH   = myRes._end.toLocaleTimeString('fr-BE',   { hour: '2-digit', minute: '2-digit' });
            const myStyle  = myAgentColor ? ` style="background:${myAgentColor}20;border-left:3px solid ${myAgentColor}"` : '';
            h += `<td class="cv-cell is-booked my-agenda-cell" rowspan="${mySpan}"
              data-id="${myRes.id}" data-occ="${myRes._occDate || ''}" data-act="detail"
              data-occ-date="${isoDate(myRes._start)}"${myStyle}>
              <span class="ct"><b>${escapeHtml(mySvc)}</b><br>
              <small>${escapeHtml(myLoc)}</small><br>
              <small class="ct-time">${myStartH} – ${myEndH}</small></span>
            </td>`;
          } else {
            h += `<td class="cv-cell my-agenda-cell my-agenda-free"></td>`;
          }
        }
      }

      // Canvas locaux : un seul <td rowspan=total> par local, sur la première ligne
      if (i === 0) {
        displayLocals.forEach(l => {
          // Dividers verticaux entre sous-lanes desk (si N >= 2)
          let lanesHtml = '';
          const N = l.deskList.length;
          if (N >= 2) {
            for (let k = 1; k < N; k++) {
              lanesHtml += `<div class="desk-lane-divider" style="left:${(k / N) * 100}%"></div>`;
            }
          }
          h += `<td class="cv-col-canvas${N >= 2 ? ' has-desks' : ''}" rowspan="${total}" data-local="${l.localId}" style="height:${canvasHeight}px;--row-h:${ROW_H}px">
            ${lanesHtml}
            ${blocksByLocal[l.localId]}
          </td>`;
        });
      }

      h += '</tr>';
    });

    h += '</tbody></table>';
    h += '</div>'; // .cv-day-wrapper
    el.innerHTML = h;
    this._bindNew(el, d);
    this._bindDndNew(el, d);
    this._renderNowLine(el, d);
  },

  // ─────────────────────────────────────────────────────────────────
  // VUE SEMAINE
  // ─────────────────────────────────────────────────────────────────
  _renderWeek(el) {
    const fb = document.getElementById('deskFilterBar');
    if (fb) { fb.innerHTML = ''; fb.classList.add('hidden'); }
    const { openHour: wOpenHour, closeHour: wCloseHour, slotMin: slotMinWk } = DB.getLieuConfig();
    const isMobile  = window.innerWidth < 768;
    const nbDays    = isMobile ? 3 : 5;

    // Sur mobile : partir de this.date (3 jours depuis la date courante)
    // Sur desktop : partir du lundi de la semaine
    const wS = isMobile ? new Date(this.date) : weekStart(this.date);
    wS.setHours(0, 0, 0, 0);

    const wEnd = addDays(wS, isMobile ? 2 : 6);
    wEnd.setHours(wCloseHour, 0, 0, 0);
    const wSfull = new Date(wS); wSfull.setHours(wOpenHour, 0, 0, 0);
    const occs   = DB.getInRange(wSfull, wEnd);
    const slots  = getSlots();
    const today  = new Date();

    // Titre
    const wE2 = isMobile ? wEnd : addDays(wS, 4);
    const sameMonth = wS.getMonth() === wE2.getMonth();
    const weekTitle = sameMonth
      ? `${wS.getDate()} – ${wE2.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : `${wS.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })} – ${wE2.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    // Sur mobile : ajouter .mob-wk-3 pour passer à 3 colonnes via CSS
    const hdClass  = isMobile ? 'cv-week-hd mob-wk-3' : 'cv-week-hd';
    const rowClass = isMobile ? 'cv-row mob-wk-3' : 'cv-row';

    let h = '<div class="cv-week">';
    h += `<div class="cv-period-bar">${weekTitle}</div>`;

    // En-tête jours
    h += `<div class="${hdClass}"><div class="tc-hd"></div>`;
    for (let i = 0; i < nbDays; i++) {
      const day = addDays(wS, i);
      const isTd = sameDay(day, today);
      const isAbs = !!_myAbsenceOn(isoDate(day));
      h += `<div class="wkd-hd${isTd ? ' is-today' : ''}${isAbs ? ' wk-absent' : ''}" data-date="${isoDate(day)}" data-act="go-day">
        <div class="wkd-name">${dayName(day)}</div>
        <div class="wkd-num${isTd ? ' num-today' : ''}">${day.getDate()}${isAbs ? ' 🌴' : ''}</div>
      </div>`;
    }
    h += '</div>';

    // Lignes de créneaux
    slots.forEach((slot, i) => {
      h += `<div class="${rowClass}${i % 2 ? ' alt' : ''}"><div class="tc">${slot.label}</div>`;


      for (let d = 0; d < nbDays; d++) {
        const day  = addDays(wS, d);
        const sS   = new Date(day); sS.setHours(slot.h, slot.m, 0, 0);
        const sE   = new Date(sS.getTime() + slotMinWk * 60000);
        const isTd = sameDay(day, today);

        const wkUnits = DB.getDisplayUnits();
        const booked = new Set();
        wkUnits.forEach(u => {
          const unitKey = u.deskId ?? u.localId;
          occs.forEach(r => {
            if (!DB.unitOccupies(r, u.localId, u.deskId)) return;
            if (r.isPermanent) { booked.add(unitKey); return; }
            if (r._start && sameDay(r._start, day) && r._start < sE && r._end > sS) booked.add(unitKey);
          });
        });

        const total = wkUnits.length;
        const free  = total - booked.size;
        const color = availColor(free, total);

        h += `<div class="wk-cell${isTd ? ' is-today' : ''}" style="background:${color}"
          data-date="${isoDate(day)}" data-time="${slot.label}" data-act="new-week"
          title="${free}/${total} unités libres — ${slot.label}">
          <span class="wk-cnt">${free}/${total}</span>
        </div>`;
      }
      h += '</div>';
    });

    h += '</div>';
    el.innerHTML = h;
    this._bind(el);
  },

  // ─────────────────────────────────────────────────────────────────
  // VUE MOIS
  // ─────────────────────────────────────────────────────────────────
  _renderMonth(el) {
    const fb = document.getElementById('deskFilterBar');
    if (fb) { fb.innerHTML = ''; fb.classList.add('hidden'); }
    const year  = this.date.getFullYear();
    const month = this.date.getMonth();
    const mS    = new Date(year, month, 1);
    const mE    = new Date(year, month + 1, 0, 23, 59, 59);
    const occs  = DB.getInRange(mS, mE);
    const today = new Date();

    // Début de la grille : lundi de la semaine contenant le 1er du mois
    const gS  = new Date(mS);
    const dow = (mS.getDay() + 6) % 7; // Lun=0
    gS.setDate(gS.getDate() - dow);

    const monthTitle = mS.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
    let h = '<div class="cv-month">';
    h += `<div class="cv-period-bar">${monthTitle}</div>`;

    // En-tête jours (Lun-Ven seulement)
    h += '<div class="mo-hd mo-hd-5">';
    ['Lun','Mar','Mer','Jeu','Ven'].forEach(n => h += `<div class="mo-dn">${n}</div>`);
    h += '</div><div class="mo-grid mo-grid-5">';

    let cursor = new Date(gS);
    let weeks = 0;
    while (weeks < 6) {
      for (let d = 0; d < 7; d++) {
        const dow = (cursor.getDay() + 6) % 7; // Lun=0 … Dim=6
        // Sauter Sam (dow=5) et Dim (dow=6)
        if (dow >= 5) { cursor = addDays(cursor, 1); continue; }

        const inMonth = cursor.getMonth() === month && cursor.getFullYear() === year;
        const isTd    = sameDay(cursor, today);

        const moUnits = DB.getDisplayUnits();
        const moTotal = moUnits.length;
        let free = moTotal;
        if (inMonth) {
          const booked = new Set();
          moUnits.forEach(u => {
            const unitKey = u.deskId ?? u.localId;
            occs.forEach(r => {
              if (!DB.unitOccupies(r, u.localId, u.deskId)) return;
              if (r.isPermanent) { booked.add(unitKey); return; }
              if (r._start && sameDay(r._start, cursor)) booked.add(unitKey);
            });
          });
          free = Math.max(0, moTotal - booked.size);
        }

        const color = inMonth ? availColor(free, moTotal) : 'transparent';

        const isHoliday = inMonth && isBelgianHoliday(isoDate(cursor));
        const isAbs = inMonth && !!_myAbsenceOn(isoDate(cursor));
        h += `<div class="mo-cell${!inMonth ? ' other' : ''}${isTd ? ' is-today' : ''}${isHoliday ? ' is-holiday' : ''}${isAbs ? ' mo-absent' : ''}"
          data-date="${isoDate(cursor)}" data-act="go-day" ${isHoliday ? `title="${getHolidayName(isoDate(cursor))}"` : ''}>
          <div class="mo-num${isTd ? ' num-today' : ''}">${cursor.getDate()}${isHoliday ? ' 🇧🇪' : ''}${isAbs ? ' 🌴' : ''}</div>
          ${inMonth ? `<div class="mo-bar" style="background:${color}">${free}/${moTotal}</div>` : ''}
        </div>`;

        cursor = addDays(cursor, 1);
      }
      weeks++;
      if (cursor > mE && cursor.getMonth() !== month) break;
    }

    h += '</div></div>';
    el.innerHTML = h;
    this._bind(el);
  },

  // ─────────────────────────────────────────────────────────────────
  // BARRE "MAINTENANT" — vue jour seulement
  // ─────────────────────────────────────────────────────────────────
  _nowTimer: null,

  _renderNowLine(el, viewDay) {
    // Nettoyer le timer précédent
    if (this._nowTimer) { clearInterval(this._nowTimer); this._nowTimer = null; }

    const update = () => {
      const now = new Date();
      // N'afficher que si on est sur le bon jour
      if (!sameDay(now, viewDay)) return;

      const { openHour: nlOpen, closeHour: nlClose, slotMin: nlSlot } = DB.getLieuConfig();
      const totalMin    = (nlClose - nlOpen) * 60;
      const elapsed     = (now.getHours() - nlOpen) * 60 + now.getMinutes();
      if (elapsed < 0 || elapsed > totalMin) return;

      // Chercher ou créer la ligne
      let line = el.querySelector('.now-line');
      if (!line) {
        line = document.createElement('div');
        line.className = 'now-line';
        el.style.position = 'relative';
        el.appendChild(line);
      }

      // Positionner via la position réelle de la <tr> (exact même sur lignes inégales)
      const table = el.querySelector('.cv-day-table');
      if (!table) return;
      const rows = [...table.querySelectorAll('tr[data-slot]')];
      if (!rows.length) return;

      const slotIdx  = Math.floor(elapsed / nlSlot);
      const fraction = (elapsed % nlSlot) / nlSlot;
      const row      = rows[Math.min(slotIdx, rows.length - 1)];

      const containerTop = el.getBoundingClientRect().top;
      const rowRect      = row.getBoundingClientRect();
      const top          = rowRect.top - containerTop + el.scrollTop + fraction * rowRect.height;

      line.style.top = top + 'px';

      // Heure affichée
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      line.setAttribute('data-time', `${hh}:${mm}`);
    };

    update();
    this._nowTimer = setInterval(update, 60000); // mise à jour chaque minute
  },

  // ─────────────────────────────────────────────────────────────────
  // Liaison des événements sur les cellules
  // ─────────────────────────────────────────────────────────────────
  _dnd: null,
  _justDragged: false,

  _bindDnd(el, d) {
    const self  = this;
    const pad   = n => String(n).padStart(2, '0');
    const table = el.querySelector('.cv-day-table');
    if (!table) return;

    // ── dragstart — délégué sur la table ────────────────────────────
    // draggable="true" est sur le <span class="ct-drag"> (Chrome ignore draggable sur <td>)
    table.addEventListener('dragstart', e => {
      const handle = e.target.closest('.ct-drag');
      if (!handle) { e.preventDefault(); return; }
      const span  = parseInt(handle.dataset.span) || 1;
      const isRec = handle.dataset.isRec === '1';
      self._dnd = {
        resId:       handle.dataset.id,
        isRec,
        span,
        durMs:       span * DB.getLieuConfig().slotMin * 60000,
        occDate:     handle.dataset.occDate,
        origLocalId: parseInt(handle.dataset.local),
        origDeskId:  handle.dataset.desk || null,
      };
      // Marquer la cellule parente
      const card = handle.closest('.cv-cell.is-booked');
      if (card) card.classList.add('dnd-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', handle.dataset.id);
    });

    // ── helper — slot + local par position XY (fonctionne sur les rowspan) ──
    function getDndTarget(e) {
      // Ligne par position Y (traverse les cellules en rowspan)
      const rows = [...table.querySelectorAll('tr[data-slot]')];
      const row = rows.find(r => {
        const rect = r.getBoundingClientRect();
        return e.clientY >= rect.top && e.clientY < rect.bottom;
      });
      if (!row) return null;
      // Colonne via la td la plus proche (booked ou free, peu importe)
      const td = e.target.closest('td[data-local]');
      if (!td) return null;
      return { slot: parseInt(row.dataset.slot), local: td.dataset.local, desk: td.dataset.desk || null };
    }

    // ── dragover — toujours appelé sur la table entière ─────────────
    // e.preventDefault() DOIT être appelé pour autoriser le drop
    table.addEventListener('dragover', e => {
      if (!self._dnd) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      table.querySelectorAll('.dnd-over').forEach(c => c.classList.remove('dnd-over'));
      const hit = getDndTarget(e);
      if (!hit) return;

      // Surligner les slots de la durée dans la colonne cible
      for (let s = hit.slot; s < hit.slot + self._dnd.span; s++) {
        const row  = table.querySelector(`tr[data-slot="${s}"]`);
        const cell = row?.querySelector(`.cv-cell.is-free[data-local="${hit.local}"][data-desk="${hit.desk || ''}"]`);
        if (cell) cell.classList.add('dnd-over');
      }
    });

    // ── dragend — nettoyage ─────────────────────────────────────────
    table.addEventListener('dragend', e => {
      const card = e.target.closest('.cv-cell.is-booked') || e.target.closest('.ct-drag')?.closest('.cv-cell');
      if (card) card.classList.remove('dnd-dragging');
      table.querySelectorAll('.dnd-over').forEach(c => c.classList.remove('dnd-over'));
      self._justDragged = true;
      self._dnd = null;
    });

    // ── drop ────────────────────────────────────────────────────────
    table.addEventListener('drop', async e => {
      e.preventDefault();
      table.querySelectorAll('.dnd-over').forEach(c => c.classList.remove('dnd-over'));
      const dnd = self._dnd;
      if (!dnd) return;

      const hit = getDndTarget(e);
      if (!hit) return;

      const allSlots = getSlots();
      const slotInfo = allSlots[hit.slot];
      if (!slotInfo) return;

      // Vérifier que le déplacement ne dépasse pas les bornes de la journée
      if (hit.slot + dnd.span > allSlots.length) {
        showToast('⚠ Déplacement hors des horaires de la journée.');
        return;
      }

      const newLocalId  = parseInt(hit.local);
      const newDeskId   = hit.desk || null;
      const dateStr     = isoDate(d);
      const hh = slotInfo.h, mm = slotInfo.m;
      const newStart    = new Date(`${dateStr}T${pad(hh)}:${pad(mm)}:00`);
      const newEnd      = new Date(newStart.getTime() + dnd.durMs);
      const newStartISO = `${dateStr}T${pad(hh)}:${pad(mm)}`;
      const newEndISO   = `${isoDate(newEnd)}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`;

      // Vérification des conflits — même unité (local/desk)
      const conflicts = DB.getInRange(newStart, newEnd)
        .filter(r => DB.unitOccupies(r, newLocalId, newDeskId) && r.id !== dnd.resId);
      if (conflicts.length) {
        showToast('⚠ Conflit : créneau déjà occupé pour cette unité.');
        return;
      }
      // Vérification des conflits — agents (principal + invités) dans un autre local
      const _dndRes = DB.getReservationById?.(dnd.resId);
      if (_dndRes) {
        const _dndNames = DB.getResAgentNames(_dndRes);
        if (_dndNames.size) {
          const agentClash = DB.getInRange(newStart, newEnd).find(r => {
            if (r.isPermanent || r.id === dnd.resId) return false;
            const rNames = DB.getResAgentNames(r);
            for (const n of _dndNames) { if (rNames.has(n)) return true; }
            return false;
          });
          if (agentClash) {
            const overlap = [..._dndNames].find(n => DB.getResAgentNames(agentClash).has(n));
            const clashLoc = DB.getLocalLabel(parseInt(agentClash.localId));
            showToast(`⚠ Conflit agenda : ${overlap} est déjà dans "${clashLoc}" sur ce créneau.`);
            return;
          }
        }
      }

      if (dnd.isRec) {
        const fromDate = new Date(dnd.occDate + 'T00:00:00')
          .toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        showBureauConfirm({
          icon: '🔁', title: 'Réservation récurrente',
          info: `Voulez-vous déplacer seulement l'occurrence du <strong>${fromDate}</strong>, ou toute la série ?`,
          okLabel: 'Cette occurrence', okClass: 'ok-open',
          onOk: async () => {
            try { await DB.moveOccurrence(dnd.resId, dnd.occDate, newLocalId, newStartISO, newEndISO, newDeskId); showToast('Occurrence déplacée ✓'); }
            catch(err) { showToast('Erreur : ' + err.message); }
          },
          ok2Label: 'Toute la série', ok2Class: 'ok-close',
          onOk2: async () => {
            try { await DB.moveReservation(dnd.resId, newLocalId, newStartISO, newEndISO, newDeskId); showToast('Série déplacée ✓'); }
            catch(err) { showToast('Erreur : ' + err.message); }
          },
        });
      } else {
        try { await DB.moveReservation(dnd.resId, newLocalId, newStartISO, newEndISO, newDeskId); showToast('Réservation déplacée ✓'); }
        catch(err) { showToast('Erreur : ' + err.message); }
      }
    });

    // ── Resize (étirer) ──────────────────────────────────────────────
    // Nettoyage des anciens listeners document si présents
    if (self._resizeMoveFn) document.removeEventListener('mousemove', self._resizeMoveFn);
    if (self._resizeUpFn)   document.removeEventListener('mouseup',   self._resizeUpFn);

    let _rz = null; // état resize en cours

    table.addEventListener('mousedown', e => {
      const handle = e.target.closest('.ct-resize');
      if (!handle) return;
      e.preventDefault(); e.stopPropagation();
      const cell = handle.closest('.cv-cell.is-booked');
      if (!cell) return;
      const drag = cell.querySelector('.ct-drag');
      _rz = {
        resId:    cell.dataset.id,
        isRec:    drag?.dataset.isRec === '1',
        occDate:  cell.dataset.occDate || '',
        localId:  parseInt(cell.dataset.local),
        deskId:   cell.dataset.desk || null,
        startSlot: parseInt(cell.dataset.slot),
        origSpan:  parseInt(cell.dataset.span) || 1,
        curEndSlot: parseInt(cell.dataset.slot) + (parseInt(cell.dataset.span) || 1) - 1,
        cell,
        previewed: new Set(),
      };
      cell.classList.add('ct-resizing');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    });

    self._resizeMoveFn = e => {
      if (!_rz) return;
      const rows = [...table.querySelectorAll('tr[data-slot]')];
      const row  = rows.find(r => {
        const rect = r.getBoundingClientRect();
        return e.clientY >= rect.top && e.clientY < rect.bottom;
      });
      if (!row) return;
      const targetSlot  = parseInt(row.dataset.slot);
      const newEndSlot  = Math.max(_rz.startSlot, targetSlot);
      if (newEndSlot === _rz.curEndSlot) return;
      _rz.curEndSlot = newEndSlot;
      // Preview : colorer les lignes du span
      table.querySelectorAll('.cv-row.rz-preview').forEach(r => r.classList.remove('rz-preview'));
      for (let s = _rz.startSlot; s <= newEndSlot; s++) {
        table.querySelector(`tr[data-slot="${s}"]`)?.classList.add('rz-preview');
      }
    };

    self._resizeUpFn = async e => {
      if (!_rz) return;
      const rz = _rz; _rz = null;
      rz.cell.classList.remove('ct-resizing');
      table.querySelectorAll('.cv-row.rz-preview').forEach(r => r.classList.remove('rz-preview'));
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      const allSlots  = getSlots();
      const { slotMin } = DB.getLieuConfig();
      const newSpan   = rz.curEndSlot - rz.startSlot + 1;
      if (newSpan === rz.origSpan) return;

      const startInfo = allSlots[rz.startSlot];
      const endInfo   = allSlots[rz.curEndSlot];
      if (!startInfo || !endInfo) return;

      const dateStr   = isoDate(d);
      const newStart  = `${dateStr}T${pad(startInfo.h)}:${pad(startInfo.m)}`;
      const endDT     = new Date(d);
      endDT.setHours(endInfo.h, endInfo.m + slotMin, 0, 0);
      const newEnd    = `${isoDate(endDT)}T${pad(endDT.getHours())}:${pad(endDT.getMinutes())}`;

      // Vérifier conflits — même unité (local/desk)
      const _rzNewStart = new Date(`${newStart}:00`);
      const _rzNewEnd   = new Date(`${newEnd}:00`);
      const clashCheck = DB.getInRange(_rzNewStart, _rzNewEnd)
        .filter(r => DB.unitOccupies(r, rz.localId, rz.deskId) && r.id !== rz.resId);
      if (clashCheck.length) { showToast('⚠ Conflit : créneau déjà occupé dans cette unité.'); self.render(); return; }
      // Vérifier conflits — agents (principal + invités) dans un autre local
      const _rzRes = DB.getReservationById?.(rz.resId);
      if (_rzRes) {
        const _rzNames = DB.getResAgentNames(_rzRes);
        if (_rzNames.size) {
          const agentClash = DB.getInRange(_rzNewStart, _rzNewEnd).find(r => {
            if (r.isPermanent || r.id === rz.resId) return false;
            const rNames = DB.getResAgentNames(r);
            for (const n of _rzNames) { if (rNames.has(n)) return true; }
            return false;
          });
          if (agentClash) {
            const overlap = [..._rzNames].find(n => DB.getResAgentNames(agentClash).has(n));
            const clashLoc = DB.getLocalLabel(parseInt(agentClash.localId));
            showToast(`⚠ Conflit agenda : ${overlap} est déjà dans "${clashLoc}" sur ce créneau.`);
            self.render(); return;
          }
        }
      }

      if (rz.isRec) {
        const fromDate = new Date(rz.occDate + 'T00:00:00')
          .toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        showBureauConfirm({
          icon: '🔁', title: 'Réservation récurrente',
          info: `Voulez-vous modifier seulement l'occurrence du <strong>${fromDate}</strong>, ou toute la série ?`,
          okLabel: 'Cette occurrence', okClass: 'ok-open',
          onOk: async () => {
            try { await DB.moveOccurrence(rz.resId, rz.occDate, rz.localId, newStart, newEnd, rz.deskId); showToast('Occurrence redimensionnée ✓'); }
            catch(err) { showToast('Erreur : ' + err.message); }
            self.render();
          },
          ok2Label: 'Toute la série', ok2Class: 'ok-close',
          onOk2: async () => {
            try { await DB.moveReservation(rz.resId, rz.localId, newStart, newEnd, rz.deskId); showToast('Série redimensionnée ✓'); }
            catch(err) { showToast('Erreur : ' + err.message); }
            self.render();
          },
        });
      } else {
        try { await DB.moveReservation(rz.resId, rz.localId, newStart, newEnd, rz.deskId); showToast('Réservation redimensionnée ✓'); }
        catch(err) { showToast('Erreur : ' + err.message); }
        self.render();
      }
    };

    document.addEventListener('mousemove', self._resizeMoveFn);
    document.addEventListener('mouseup',   self._resizeUpFn);
  },

  // ─────────────────────────────────────────────────────────────────
  // Bindings NOUVELLE vue jour — clics canvas + drag/resize sur .resa-block
  // ─────────────────────────────────────────────────────────────────
  _bindNew(el, d) {
    // Clics "detail" sur les blocs résa (data-act="detail")
    this._bind(el);

    const self = this;
    const ROW_H = this._rowHeight || 36;
    const slots = getSlots();

    // Toggle compact / complet
    const compactBtn = el.querySelector('#calCompactToggle');
    if (compactBtn) {
      compactBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        self._compactMode = !self._compactMode;
        self.render();
      });
    }

    // Clic zone vide du canvas → nouvelle résa (desk résolu depuis X)
    el.querySelectorAll('.cv-col-canvas').forEach(canvas => {
      canvas.addEventListener('click', (e) => {
        if (self._justDragged) { self._justDragged = false; return; }
        if (e.target.closest('.resa-block')) return; // géré par _bind (data-act=detail)
        const rect    = canvas.getBoundingClientRect();
        const relY    = e.clientY - rect.top;
        const relX    = e.clientX - rect.left;
        const slotIdx = Math.max(0, Math.floor(relY / ROW_H));
        if (slotIdx >= slots.length) return;

        const localId  = parseInt(canvas.dataset.local);
        const deskList = DB.getLocalDesks(localId);
        const N = deskList.length;
        let deskId = null;
        if (N >= 1) {
          const lanePx = rect.width / N;
          const idx    = Math.max(0, Math.min(N - 1, Math.floor(relX / lanePx)));
          deskId = deskList[idx];
        }
        MODAL.openNew({
          local: localId,
          desk: deskId,
          date: isoDate(d),
          time: slots[slotIdx].label,
        });
      });
    });

    // ── Drag-resize largeur colonne (Phase 5) ─────────────────────
    const MIN_W = 80, MAX_W = 600;
    el.querySelectorAll('.loc-hd-resize').forEach(handle => {
      let _colRz = null;

      handle.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const th = handle.closest('th[data-local]');
        if (!th) return;
        _colRz = {
          th,
          localId: parseInt(handle.dataset.local),
          startX: e.clientX,
          startW: th.getBoundingClientRect().width,
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });

      const moveFn = e => {
        if (!_colRz) return;
        const newW = Math.max(MIN_W, Math.min(MAX_W, _colRz.startW + (e.clientX - _colRz.startX)));
        _colRz.th.style.width = newW + 'px';
      };
      const upFn = () => {
        if (!_colRz) return;
        const newW = parseInt(_colRz.th.style.width) || self._defaultColW;
        self._setColWidth(_colRz.localId, newW);
        _colRz = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.addEventListener('mousemove', moveFn);
      document.addEventListener('mouseup', upFn);

      // Double-clic : reset largeur par défaut
      handle.addEventListener('dblclick', e => {
        e.preventDefault(); e.stopPropagation();
        const th = handle.closest('th[data-local]');
        if (!th) return;
        th.style.width = self._defaultColW + 'px';
        self._setColWidth(parseInt(handle.dataset.local), null);
      });
    });
  },

  _bindDndNew(el, d) {
    const self  = this;
    const pad   = n => String(n).padStart(2, '0');
    const table = el.querySelector('.cv-day-table');
    if (!table) return;
    const ROW_H = this._rowHeight || 36;

    // ── dragstart ───────────────────────────────────────────────────
    table.addEventListener('dragstart', e => {
      const handle = e.target.closest('.ct-drag');
      if (!handle) { e.preventDefault(); return; }
      const span  = parseInt(handle.dataset.span) || 1;
      const isRec = handle.dataset.isRec === '1';
      self._dnd = {
        resId:       handle.dataset.id,
        isRec,
        span,
        durMs:       span * DB.getLieuConfig().slotMin * 60000,
        occDate:     handle.dataset.occDate,
        origLocalId: parseInt(handle.dataset.local),
        origDeskId:  handle.dataset.desk || null,
      };
      const block = handle.closest('.resa-block');
      if (block) block.classList.add('dnd-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', handle.dataset.id);
    });

    // ── helper : retrouve slot + local + desk à partir de XY ────────
    function getDndTarget(e) {
      // Trouver le canvas cible (le <td data-local>)
      let td = e.target.closest('td[data-local]');
      if (!td) {
        // Si on survole un .resa-block, remonter au canvas parent
        const el = document.elementFromPoint(e.clientX, e.clientY);
        td = el ? el.closest('td[data-local]') : null;
      }
      if (!td || !td.classList.contains('cv-col-canvas')) return null;

      const rect = td.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const slotIdx = Math.max(0, Math.floor(relY / ROW_H));
      if (slotIdx < 0) return null;

      // Résolution du desk depuis la coord X
      const localId  = parseInt(td.dataset.local);
      const deskList = DB.getLocalDesks(localId);
      const N = deskList.length;
      let deskId = null;
      let left = 0, widthPct = 100;
      if (N >= 1) {
        const relX   = e.clientX - rect.left;
        const lanePx = rect.width / N;
        const idx    = Math.max(0, Math.min(N - 1, Math.floor(relX / lanePx)));
        deskId = deskList[idx];
        left = (idx / N) * 100;
        widthPct = 100 / N;
      }
      return { slot: slotIdx, local: td.dataset.local, desk: deskId, td, left, widthPct };
    }

    // ── dragover ────────────────────────────────────────────────────
    table.addEventListener('dragover', e => {
      if (!self._dnd) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      // Nettoyer anciens ghosts
      table.querySelectorAll('.dnd-ghost').forEach(g => g.remove());
      const hit = getDndTarget(e);
      if (!hit) return;

      // Ghost overlay : rectangle absolu dans la sous-lane cible
      const ghost = document.createElement('div');
      ghost.className = 'dnd-ghost';
      ghost.style.top    = (hit.slot * ROW_H) + 'px';
      ghost.style.height = (self._dnd.span * ROW_H) + 'px';
      ghost.style.left   = hit.left + '%';
      ghost.style.width  = hit.widthPct + '%';
      hit.td.appendChild(ghost);
    });

    // ── dragend ─────────────────────────────────────────────────────
    table.addEventListener('dragend', e => {
      const block = e.target.closest('.resa-block') || e.target.closest('.ct-drag')?.closest('.resa-block');
      if (block) block.classList.remove('dnd-dragging');
      table.querySelectorAll('.dnd-ghost').forEach(g => g.remove());
      self._justDragged = true;
      self._dnd = null;
    });

    // ── drop ────────────────────────────────────────────────────────
    table.addEventListener('drop', async e => {
      e.preventDefault();
      table.querySelectorAll('.dnd-ghost').forEach(g => g.remove());
      const dnd = self._dnd;
      if (!dnd) return;

      const hit = getDndTarget(e);
      if (!hit) return;

      const allSlots = getSlots();
      const slotInfo = allSlots[hit.slot];
      if (!slotInfo) return;

      if (hit.slot + dnd.span > allSlots.length) {
        showToast('⚠ Déplacement hors des horaires de la journée.');
        return;
      }

      const newLocalId  = parseInt(hit.local);
      const newDeskId   = hit.desk || null;
      const dateStr     = isoDate(d);
      const hh = slotInfo.h, mm = slotInfo.m;
      const newStart    = new Date(`${dateStr}T${pad(hh)}:${pad(mm)}:00`);
      const newEnd      = new Date(newStart.getTime() + dnd.durMs);
      const newStartISO = `${dateStr}T${pad(hh)}:${pad(mm)}`;
      const newEndISO   = `${isoDate(newEnd)}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`;

      // Conflit unité
      const conflicts = DB.getInRange(newStart, newEnd)
        .filter(r => DB.unitOccupies(r, newLocalId, newDeskId) && r.id !== dnd.resId);
      if (conflicts.length) {
        showToast('⚠ Conflit : créneau déjà occupé pour cette unité.');
        return;
      }
      // Conflit agenda agents
      const _dndRes = DB.getReservationById?.(dnd.resId);
      if (_dndRes) {
        const _dndNames = DB.getResAgentNames(_dndRes);
        if (_dndNames.size) {
          const agentClash = DB.getInRange(newStart, newEnd).find(r => {
            if (r.isPermanent || r.id === dnd.resId) return false;
            const rNames = DB.getResAgentNames(r);
            for (const n of _dndNames) { if (rNames.has(n)) return true; }
            return false;
          });
          if (agentClash) {
            const overlap = [..._dndNames].find(n => DB.getResAgentNames(agentClash).has(n));
            const clashLoc = DB.getLocalLabel(parseInt(agentClash.localId));
            showToast(`⚠ Conflit agenda : ${overlap} est déjà dans "${clashLoc}" sur ce créneau.`);
            return;
          }
        }
      }

      if (dnd.isRec) {
        const fromDate = new Date(dnd.occDate + 'T00:00:00')
          .toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        showBureauConfirm({
          icon: '🔁', title: 'Réservation récurrente',
          info: `Voulez-vous déplacer seulement l'occurrence du <strong>${fromDate}</strong>, ou toute la série ?`,
          okLabel: 'Cette occurrence', okClass: 'ok-open',
          onOk: async () => {
            try { await DB.moveOccurrence(dnd.resId, dnd.occDate, newLocalId, newStartISO, newEndISO, newDeskId); showToast('Occurrence déplacée ✓'); }
            catch(err) { showToast('Erreur : ' + err.message); }
          },
          ok2Label: 'Toute la série', ok2Class: 'ok-close',
          onOk2: async () => {
            try { await DB.moveReservation(dnd.resId, newLocalId, newStartISO, newEndISO, newDeskId); showToast('Série déplacée ✓'); }
            catch(err) { showToast('Erreur : ' + err.message); }
          },
        });
      } else {
        try { await DB.moveReservation(dnd.resId, newLocalId, newStartISO, newEndISO, newDeskId); showToast('Réservation déplacée ✓'); }
        catch(err) { showToast('Erreur : ' + err.message); }
      }
    });

    // ── Resize (étirer verticalement) ──────────────────────────────
    if (self._resizeMoveFn) document.removeEventListener('mousemove', self._resizeMoveFn);
    if (self._resizeUpFn)   document.removeEventListener('mouseup',   self._resizeUpFn);

    let _rz = null;

    table.addEventListener('mousedown', e => {
      const handle = e.target.closest('.ct-resize');
      if (!handle) return;
      e.preventDefault(); e.stopPropagation();
      const block = handle.closest('.resa-block');
      if (!block) return;
      const drag = block.querySelector('.ct-drag');
      _rz = {
        resId:    block.dataset.id,
        isRec:    drag?.dataset.isRec === '1',
        occDate:  block.dataset.occDate || '',
        localId:  parseInt(block.dataset.local),
        deskId:   block.dataset.desk || null,
        startSlot: parseInt(block.dataset.slot),
        origSpan:  parseInt(block.dataset.span) || 1,
        curEndSlot: parseInt(block.dataset.slot) + (parseInt(block.dataset.span) || 1) - 1,
        block,
      };
      block.classList.add('ct-resizing');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    });

    self._resizeMoveFn = e => {
      if (!_rz) return;
      const rows = [...table.querySelectorAll('tr[data-slot]')];
      const row  = rows.find(r => {
        const rect = r.getBoundingClientRect();
        return e.clientY >= rect.top && e.clientY < rect.bottom;
      });
      if (!row) return;
      const targetSlot  = parseInt(row.dataset.slot);
      const newEndSlot  = Math.max(_rz.startSlot, targetSlot);
      if (newEndSlot === _rz.curEndSlot) return;
      _rz.curEndSlot = newEndSlot;
      // Preview : redimensionner le bloc en direct
      const newSpan = _rz.curEndSlot - _rz.startSlot + 1;
      _rz.block.style.height = (newSpan * ROW_H) + 'px';
    };

    self._resizeUpFn = async e => {
      if (!_rz) return;
      const rz = _rz; _rz = null;
      rz.block.classList.remove('ct-resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      const allSlots  = getSlots();
      const { slotMin } = DB.getLieuConfig();
      const newSpan   = rz.curEndSlot - rz.startSlot + 1;
      if (newSpan === rz.origSpan) { self.render(); return; }

      const startInfo = allSlots[rz.startSlot];
      const endInfo   = allSlots[rz.curEndSlot];
      if (!startInfo || !endInfo) return;

      const dateStr   = isoDate(d);
      const newStart  = `${dateStr}T${pad(startInfo.h)}:${pad(startInfo.m)}`;
      const endDT     = new Date(d);
      endDT.setHours(endInfo.h, endInfo.m + slotMin, 0, 0);
      const newEnd    = `${isoDate(endDT)}T${pad(endDT.getHours())}:${pad(endDT.getMinutes())}`;

      const _rzNewStart = new Date(`${newStart}:00`);
      const _rzNewEnd   = new Date(`${newEnd}:00`);
      const clashCheck = DB.getInRange(_rzNewStart, _rzNewEnd)
        .filter(r => DB.unitOccupies(r, rz.localId, rz.deskId) && r.id !== rz.resId);
      if (clashCheck.length) { showToast('⚠ Conflit : créneau déjà occupé dans cette unité.'); self.render(); return; }
      const _rzRes = DB.getReservationById?.(rz.resId);
      if (_rzRes) {
        const _rzNames = DB.getResAgentNames(_rzRes);
        if (_rzNames.size) {
          const agentClash = DB.getInRange(_rzNewStart, _rzNewEnd).find(r => {
            if (r.isPermanent || r.id === rz.resId) return false;
            const rNames = DB.getResAgentNames(r);
            for (const n of _rzNames) { if (rNames.has(n)) return true; }
            return false;
          });
          if (agentClash) {
            const overlap = [..._rzNames].find(n => DB.getResAgentNames(agentClash).has(n));
            const clashLoc = DB.getLocalLabel(parseInt(agentClash.localId));
            showToast(`⚠ Conflit agenda : ${overlap} est déjà dans "${clashLoc}" sur ce créneau.`);
            self.render(); return;
          }
        }
      }

      if (rz.isRec) {
        const fromDate = new Date(rz.occDate + 'T00:00:00')
          .toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        showBureauConfirm({
          icon: '🔁', title: 'Réservation récurrente',
          info: `Voulez-vous modifier seulement l'occurrence du <strong>${fromDate}</strong>, ou toute la série ?`,
          okLabel: 'Cette occurrence', okClass: 'ok-open',
          onOk: async () => {
            try { await DB.moveOccurrence(rz.resId, rz.occDate, rz.localId, newStart, newEnd, rz.deskId); showToast('Occurrence redimensionnée ✓'); }
            catch(err) { showToast('Erreur : ' + err.message); }
            self.render();
          },
          ok2Label: 'Toute la série', ok2Class: 'ok-close',
          onOk2: async () => {
            try { await DB.moveReservation(rz.resId, rz.localId, newStart, newEnd, rz.deskId); showToast('Série redimensionnée ✓'); }
            catch(err) { showToast('Erreur : ' + err.message); }
            self.render();
          },
        });
      } else {
        try { await DB.moveReservation(rz.resId, rz.localId, newStart, newEnd, rz.deskId); showToast('Réservation redimensionnée ✓'); }
        catch(err) { showToast('Erreur : ' + err.message); }
        self.render();
      }
    };

    document.addEventListener('mousemove', self._resizeMoveFn);
    document.addEventListener('mouseup',   self._resizeUpFn);
  },

  _bind(el) {
    el.querySelectorAll('[data-act]').forEach(cell => {
      cell.addEventListener('click', () => {
        if (this._justDragged) { this._justDragged = false; return; }
        const act = cell.dataset.act;
        if (act === 'detail') {
          MODAL.openDetail(cell.dataset.id, cell.dataset.occ || '');
        } else if (act === 'new') {
          MODAL.openNew({ local: parseInt(cell.dataset.local), desk: cell.dataset.desk || null, date: cell.dataset.date, time: cell.dataset.time });
        } else if (act === 'new-week') {
          MODAL.openNew({ date: cell.dataset.date, time: cell.dataset.time });
        } else if (act === 'go-day') {
          const [y, m, d] = cell.dataset.date.split('-').map(Number);
          CAL.date = new Date(y, m - 1, d);
          CAL.setView('day');
          document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'day'));
        }
      });
    });
  }
};

// ───────────────────────────────────────────────────────────────────
// Vue LIVE — Dispatch en direct
// ───────────────────────────────────────────────────────────────────

const LIVE = {
  _timer:             null,
  _agentQuery:        '',
  _pauseTimerInterval: null,
  _lastCalled:        {},   // localId → { ticket, svc, localLabel, time }
  _lastEmittedByGrp:  {},   // grpId  → { display, label, name } (côté accueil)

  // Stocke le dernier ticket appelé pour un local (session uniquement)
  // ticketInfo peut être une string (display) ou { display, label, name }
  _storeCall(localId, ticketInfo, occ) {
    const isObj     = ticketInfo && typeof ticketInfo === 'object';
    const ticket    = isObj ? ticketInfo.display : ticketInfo;
    const ticketLabel = isObj ? ticketInfo.label  : ticketInfo;
    const ticketName  = isObj ? (ticketInfo.name || null) : null;
    const svc      = occ ? DB.getSvcLabel(occ) : '';
    const agent    = occ ? (occ.agent   === 'Autre' ? occ.agentCustom  : occ.agent)   : null;
    const pubAgent = agent ? DB.getAgentPublicName(agent) : null;
    this._lastCalled[localId] = { ticket, ticketLabel, ticketName, svc, pubAgent, localLabel: DB.getLocalLabel(localId), time: new Date() };
    try { localStorage.setItem(`cpas_lastCall_${localId}`, JSON.stringify(this._lastCalled[localId])); } catch(_) {}
  },

  // Imprime un ticket avec les données passées directement
  _doPrintTicket({ ticket, svc, localLabel }) {
    const area = document.getElementById('ticketPrintArea');
    if (!area) return;
    const orgName = document.getElementById('appOrgName')?.textContent || 'SiteCpas';
    const hm = new Date().toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
    area.innerHTML = `
      <div class="ticket-print">
        <div class="tp-org">${escapeHtml(orgName)}</div>
        <div class="tp-label">Ticket numéro</div>
        <div class="tp-num">${escapeHtml(ticket || '—')}</div>
        ${svc ? `<div class="tp-svc">${escapeHtml(svc)}</div>` : ''}
        <div class="tp-local">${escapeHtml(localLabel)}</div>
        <div class="tp-time">${hm}</div>
      </div>`;
    window.print();
  },

  // Réimprime le dernier ticket appelé pour un local (bouton côté bureau)
  _printTicket(localId) {
    const d = this._lastCalled[localId];
    if (!d) return;
    this._doPrintTicket({ ticket: d.ticket, svc: d.svc, localLabel: d.localLabel });
  },

  // ── Rôle de l'utilisateur ─────────────────────────────────────────
  getRole() {
    return localStorage.getItem('cpas_live_role') || 'accueil';
  },
  setRole(role) {
    localStorage.setItem('cpas_live_role', role);
  },

  _initRoleSelect() {
    const sel = g('liveRoleSelect');

    sel.addEventListener('change', () => {
      this.setRole(sel.value);
      this._showAllBureaux = false;
      this._applyRoleUI();
      this.render();
    });

    g('btnToggleBureaux').addEventListener('click', () => {
      this._showAllBureaux = !this._showAllBureaux;
      this._updateToggleBtn();
      this._renderLieuFilters();
      this.render();
    });

    this._renderLieuToggles();
    this._refreshRoleLocals();
    this._applyRoleUI();
  },

  // Toggles lieux (non backoffice) dans l'en-tête Direct
  _renderLieuToggles() {
    const bar = g('liveLieuToggles');
    if (!bar) return;
    const lieux = DB.getLieux();
    const entries = Object.entries(lieux).filter(([, l]) => !l.isBackoffice);
    bar.innerHTML = entries.map(([id, l]) =>
      `<button class="lv-lieu-toggle${this._filterLieuId === id ? ' active' : ''}" data-lieu="${id}">${escapeHtml(l.name)}</button>`
    ).join('');
    bar.querySelectorAll('.lv-lieu-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.lieu;
        this._filterLieuId = this._filterLieuId === id ? null : id;
        this._renderLieuToggles();
        this._refreshRoleLocals();
        this.render();
      });
    });
  },

  // Mettre à jour les locaux dans le select rôle selon le lieu sélectionné
  _refreshRoleLocals() {
    const sel = g('liveRoleSelect');
    // Supprimer les anciennes options bureau
    [...sel.options].forEach(o => { if (o.value.startsWith('bureau_')) o.remove(); });
    // Ajouter les locaux du lieu filtré (ou tous les non-backoffice)
    const lieux = DB.getLieux();
    const lieuEntries = Object.entries(lieux).filter(([id, l]) =>
      !l.isBackoffice && (!this._filterLieuId || id === this._filterLieuId)
    );
    const accueilLocalId = DB.getAccueilDeskLocalId?.() ?? null;
    lieuEntries.forEach(([, lieu]) => {
      (lieu.localIds || []).forEach(localId => {
        if (localId === accueilLocalId) return; // local accueil masqué
        const opt = document.createElement('option');
        opt.value = `bureau_${localId}`;
        opt.textContent = `🏢 Bureau — ${DB.getLocalLabel(localId)}`;
        sel.appendChild(opt);
      });
    });
    // Restaurer la valeur sauvegardée
    const saved = this.getRole();
    if ([...sel.options].some(o => o.value === saved)) sel.value = saved;
    else sel.value = 'accueil';
  },

  _showAllBureaux: false,
  _hiddenLieux: new Set(),
  _filterLieuId: null,

  _renderLieuSelector() {
    // Remplacé par _renderLieuToggles — noop pour compat
  },

  _renderLieuFilters() {
    const bar = g('liveLieuFilters');
    if (!bar) return;
    const show = this.getRole() === 'accueil' && this._showAllBureaux;
    bar.classList.toggle('hidden', !show);
    if (!show) return;

    const lieux = DB.getLieux();
    bar.innerHTML = Object.entries(lieux)
      .filter(([, lieu]) => !lieu.isBackoffice)
      .map(([id, lieu]) => {
        const active = !this._hiddenLieux.has(id);
        return `<button class="lv-lieu-chip${active ? ' active' : ''}" data-lieu="${id}">${escapeHtml(lieu.name)}</button>`;
      }).join('');

    bar.querySelectorAll('.lv-lieu-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.lieu;
        if (this._hiddenLieux.has(id)) {
          this._hiddenLieux.delete(id);
        } else {
          this._hiddenLieux.add(id);
        }
        this._renderLieuFilters();
        this.render();
      });
    });
  },

  _applyRoleUI() {
    const role = this.getRole();
    const isAccueil = role === 'accueil';
    g('btnQueueGroups').classList.toggle('hidden', !isAccueil);
    g('btnToggleBureaux').classList.toggle('hidden', !isAccueil);
    g('liveAgentSearch').closest('.live-search-wrap').classList.toggle('hidden', !isAccueil);
    // Sidebar agents → bureau : visible uniquement en mode accueil
    g('agentLocationsPanel').classList.toggle('hidden', !isAccueil);
    if (!isAccueil) {
      g('queueGroupPanel').classList.add('hidden');
      this._showAllBureaux = false;
    }
    this._updateToggleBtn();
  },

  _updateToggleBtn() {
    const btn = g('btnToggleBureaux');
    if (!btn) return;
    btn.textContent = this._showAllBureaux ? '🏢 Masquer les bureaux' : '🏢 Voir les bureaux';
    btn.classList.toggle('lv-toggle-active', this._showAllBureaux);
  },

  open() {
    g('liveOverlay').classList.remove('hidden');
    g('liveAgentSearch').value = '';
    this._agentQuery = '';
    this._renderAgentSuggestions('');
    if (!this._qgroupInited) {
      this._initQueueGroupPanel();
      this._initRoleSelect();
      this._qgroupInited = true;
    }
    this._tick();
  },

  close() {
    g('liveOverlay').classList.add('hidden');
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  _getOccs() {
    const now  = new Date();
    const dayS = new Date(now); dayS.setHours(0, 0, 0, 0);
    const dayE = new Date(now); dayE.setHours(23, 59, 59, 999);
    return { now, occs: DB.getInRange(dayS, dayE) };
  },

  render() {
    if (g('liveOverlay').classList.contains('hidden')) return;
    const { now, occs } = this._getOccs();
    const lieux  = DB.getLieux();
    const lieuId = DB.getCurrentLieuId();
    g('liveLieuName').textContent = lieux[lieuId]?.name || '';
    this._renderLieuSelector();

    // Sidebar agents (remplace l'ancienne barre du haut)
    if (this.getRole() === 'accueil') this._renderAgentLocations();

    const q = this._agentQuery.toLowerCase().trim();

    if (q) {
      const dayS7 = new Date(now); dayS7.setHours(0, 0, 0, 0);
      const dayE7 = new Date(now); dayE7.setDate(dayE7.getDate() + 7); dayE7.setHours(23, 59, 59, 999);
      const searchOccs = DB.getInRange(dayS7, dayE7);
      this._renderSearchMode(now, searchOccs, q);
    } else {
      this._renderGridMode(now, occs);
    }

  },

  _renderAgentLocations() {
    const body = g('agentLocationsBody');
    if (!body) return;
    const today = new Date().toISOString().slice(0, 10);
    const motifLabels = { maladie: 'Maladie', conge: 'Congé', mission: 'Mission', formation: 'Formation', autre: 'Absent' };

    const entries = DB.getAgentsWithKeys().map(({ key, name }) => {
      const color    = DB.getAgentRoleColor(name);
      const absEntry = DB.getAgentAbsenceOn(key, today);
      const st       = DB.getAgentStatus(key);
      const connected = DB.isConnectedToday(key);

      // Bureau ouvert ou présence backoffice : chercher où est cet agent
      const allLieux = DB.getLieux();
      const allLids  = Object.values(allLieux).flatMap(l => l.localIds || []).map(Number);
      const openLocal = allLids.find(lid =>
        (DB.isBureauOpen(lid) && DB.getBureauAgentKey(lid) === key) ||
        (DB.getBackofficePresence(lid)[key])
      );
      let localLabel = null;
      if (openLocal != null) {
        const deskId = DB.getBureauDeskId(openLocal);
        localLabel = DB.getUnitLabel(openLocal, deskId);
      }

      let icon, statusClass, statusTxt;
      if (absEntry) {
        const [, abs] = absEntry;
        icon = '❌'; statusClass = 'lv-loc-absent';
        statusTxt = motifLabels[abs.motif] || 'Absent';
        if (abs.comment) statusTxt += ` — ${abs.comment}`;
      } else if (st?.status === 'absent') {
        icon = '❌'; statusClass = 'lv-loc-absent'; statusTxt = 'Absent';
      } else if (st?.status === 'done') {
        icon = '🏁'; statusClass = 'lv-loc-done'; statusTxt = 'Parti';
      } else if (st?.status === 'late') {
        icon = '🚶'; statusClass = 'lv-loc-late';
        statusTxt = st.arrivalTime ? `En route — ${st.arrivalTime}` : 'En route';
      } else if (connected) {
        icon = '✅'; statusClass = 'lv-loc-present'; statusTxt = localLabel || 'Présent';
      } else {
        icon = '⏳'; statusClass = 'lv-loc-notyet'; statusTxt = 'Pas encore là';
      }

      return { name, icon, statusClass, statusTxt, color,
               sortOrder: connected ? 0 : (st?.status === 'late' ? 1 : (absEntry || st?.status === 'absent' ? 2 : 3)) };
    });

    // Tri : présents d'abord, puis en route, puis absents, puis pas encore là — puis alphabétique
    entries.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr'));

    body.innerHTML = entries.map(e => {
      const borderStyle = e.color ? `border-left: 3px solid ${e.color}; padding-left: .5rem;` : '';
      return `<div class="lv-loc-row ${e.statusClass}" style="${borderStyle}">
        <span class="lv-loc-icon">${e.icon}</span>
        <div class="lv-loc-info">
          <span class="lv-loc-agent">${escapeHtml(e.name)}</span>
          <span class="lv-loc-local">${escapeHtml(e.statusTxt)}</span>
        </div>
      </div>`;
    }).join('');
  },

  _renderGridMode(now, occs) {
    g('liveAgentResult').classList.add('hidden');
    g('liveGrid').classList.remove('hidden');

    const role      = this.getRole();
    const isAccueil = role === 'accueil';
    const bureauLocal = isAccueil ? null : parseInt(role.replace('bureau_', ''));

    // Restaurer _lastCalled depuis localStorage (survit aux rechargements de page)
    // Seulement si === undefined : false = sentinelle "effacé volontairement"
    for (let _i = 0; _i < localStorage.length; _i++) {
      const _k = localStorage.key(_i);
      if (_k?.startsWith('cpas_lastCall_')) {
        const _lid = parseInt(_k.replace('cpas_lastCall_', ''));
        if (this._lastCalled[_lid] === undefined) {
          try { this._lastCalled[_lid] = JSON.parse(localStorage.getItem(_k)); } catch(_) {}
        }
      }
    }

    // ── Cartes de groupe (accueil uniquement) ─────────────────────
    const groups = DB.getQueueGroups();
    const groupCards = Object.entries(groups).map(([grpId, grp]) => {
      const lids = (grp.localIds || []).map(Number);
      if (!lids.length && !isAccueil) return ''; // groupe sans locaux → masqué sauf pour accueil
      const activeLids = lids.filter(l => DB.isBureauOpen(l));
      const hasOpen    = activeLids.length > 0;
      const occupied   = activeLids.filter(l =>
        DB.getQueue(l) >= 1 || DB.isBureauBusyWithPreferred(l) || !!DB.getPreferredPending(l)
      ).length;
      const overflow   = DB.getGroupOverflowQueue(grpId);
      const total      = activeLids.length;
      const allFull    = hasOpen && occupied >= total;
      const free = total - occupied;
      const statusTxt  = !hasOpen
        ? '⚪ Aucun bureau ouvert'
        : allFull
          ? `🔴 Complet — ${overflow > 0 ? overflow + ' en attente' : 'tous occupés'}`
          : overflow > 0
            ? `🟡 ${free} bureau${free > 1 ? 'x' : ''} libre${free > 1 ? 's' : ''} — ${overflow} en attente`
            : `🟢 ${free} bureau${free > 1 ? 'x' : ''} disponible${free > 1 ? 's' : ''}`;
      const dotsHtml = hasOpen
        ? `<div class="lv-grp-locals">${activeLids.map(l => {
            const busy = DB.getQueue(l) >= 1 || DB.isBureauBusyWithPreferred(l) || !!DB.getPreferredPending(l);
            return `<span class="lv-grp-dot${busy ? ' busy' : ''}" title="${DB.getLocalLabel(l)}"></span>`;
          }).join('')}<span class="lv-grp-locals-count">${occupied}/${total} bureau${total > 1 ? 'x' : ''}</span></div>` : '';

      // Config affichage pour les cartes groupe
      const gcCfg = DB.getTicketDisplay('groupCard');

      // Chips demandes agent spécifique (preferred pending + preferred queue)
      // Itérer sur TOUS les bureaux du groupe (pas seulement activeLids) :
      // une demande spécifique reste valide même si le bureau est fermé/en pause
      const prefPeople = [];
      const prefTicketNums = new Set();
      lids.forEach(l => {
        const pend = DB.getPreferredPending(l);
        if (pend) {
          prefPeople.push({ name: pend.displayName || '?', ts: pend.ts || 0, agent: pend.agentPublicName || null, ticket: pend.ticketLabel || null });
          if (pend.ticketLabel) {
            const num = DB.getTicketCalled(grpId); // find matching ticket number
            // Extract number from label (e.g. "M04" → 4)
            const m = pend.ticketLabel.match(/(\d+)$/);
            if (m) prefTicketNums.add(parseInt(m[1], 10));
          }
        }
        DB.getPreferredQueue(l).forEach(item => {
          prefPeople.push({ name: item.displayName || '?', ts: item.ts || 0, agent: item.agentPublicName || null, ticket: item.ticketLabel || null });
          if (item.ticketLabel) {
            const mq = item.ticketLabel.match(/(\d+)$/);
            if (mq) prefTicketNums.add(parseInt(mq[1], 10));
          }
        });
      });
      prefPeople.sort((a, b) => a.ts - b.ts);
      // Les demandes spécifiques ne s'affichent PAS sur les cartes de groupe
      // (elles sont visibles dans les cartes bureau individuelles)
      const prefChipsHtml = '';

      // Chips file d'attente générale — tous les tickets sauf reçus hors-ordre (skip_)
      const issued = DB.getTicketIssued(grpId);
      const called = DB.getTicketCalled(grpId);
      const overflowNums = [];
      for (let n = called + 1; n <= issued; n++) {
        if (!DB.isTicketSkipped(grpId, n)) overflowNums.push(n);
      }
      const extraOverflow = Math.max(0, overflow - overflowNums.length);
      const overflowChipsHtml = (overflowNums.length || extraOverflow > 0)
        ? `<div class="lv-grp-queue-row">
             <span class="lv-grp-queue-label">EN ATTENTE :</span>
             ${overflowNums.map(n => {
               const num  = gcCfg.showNum  ? DB.formatTicket(grpId, n) : null;
               const name = gcCfg.showName ? DB.getTicketName(grpId, n) : null;
               const label = [num, name].filter(Boolean).join(' · ') || '•';
               return `<span class="lv-grp-chip">${escapeHtml(label)}</span>`;
             }).join('')}${extraOverflow > 0 ? `<span class="lv-grp-chip lv-grp-chip-unknown">+${extraOverflow}</span>` : ''}
           </div>`
        : '';

      const lastEmitted  = this._lastEmittedByGrp[grpId];
      const reprintBtn   = DB.getFeature('enableTicketPrint') && lastEmitted
        ? `<button class="lv-grp-reprint" data-grp="${grpId}" title="Réimprimer le dernier ticket émis">🖨 Réimprimer ${escapeHtml(lastEmitted.display)}</button>`
        : '';
      const isEmpty = !hasOpen && overflow === 0;
      // Prochaine réservation correspondant à ce groupe (si vide)
      let nextResHtml = '';
      if (isEmpty) {
        const _dayE7 = new Date(now); _dayE7.setDate(_dayE7.getDate() + 7); _dayE7.setHours(23,59,59,999);
        const _nextRes = DB.getInRange(now, _dayE7)
          .filter(r => !r.isPermanent && r._start > now)
          .sort((a, b) => a._start - b._start)
          .find(r => {
            const svcs = DB.getResSvcs(r);
            return svcs.some(s => DB.serviceMatchesGroup(s, grp));
          });
        if (_nextRes) {
          const _agt   = _nextRes.agent === 'Autre' ? (_nextRes.agentCustom || '?') : _nextRes.agent;
          const _loc   = DB.getLocalLabel(parseInt(_nextRes.localId));
          const _isToday = _nextRes._start.toISOString().slice(0,10) === now.toISOString().slice(0,10);
          const _dStr  = _isToday ? "Aujourd'hui" : _nextRes._start.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'numeric' });
          const _hStr  = _nextRes._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          const _hEnd  = _nextRes._end.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          nextResHtml  = `<div class="lv-grp-next-res">
            <span class="lv-grp-next-label">Prochain créneau</span>
            <span class="lv-grp-next-when">${_dStr} · ${_hStr} – ${_hEnd}</span>
            <span class="lv-grp-next-who">${escapeHtml(_agt)} — ${escapeHtml(_loc)}</span>
          </div>`;
        }
      }
      return `<div class="lv-card lv-grp-card${!hasOpen ? ' lv-grp-closed' : ''}${isEmpty ? ' lv-grp-empty' : ''}">
        <div class="lv-grp-title">🔗 ${grp.name}</div>
        <div class="lv-grp-status">${statusTxt}</div>
        ${dotsHtml}
        ${overflowChipsHtml}
        ${prefChipsHtml}
        <button class="lv-grp-add" data-grp="${grpId}">+ Envoyer un bénéficiaire</button>
        ${reprintBtn}
        ${nextResHtml}
      </div>`;
    }).join('');

    const currentAgentOpenLocal = DB.getOpenBureauForCurrentAgent();

    // ── Rendu d'une carte de local ────────────────────────────────
    const renderCard = (l) => {
      const perm = occs.find(r => parseInt(r.localId) === l && r.isPermanent);
      const res  = occs.find(r =>
        parseInt(r.localId) === l && !r.isPermanent && r._start <= now && r._end > now
      );
      const next = !perm && !res
        ? occs.filter(r => parseInt(r.localId) === l && !r.isPermanent && r._start > now)
               .sort((a, b) => a._start - b._start)[0]
        : null;

      const label    = DB.getLocalLabel(l);
      const pubLabel = DB.getPublicLocalLabel(l);
      const grp      = DB.getLocalGroup(l);   // premier groupe (rétro-compat)
      const grps     = DB.getLocalGroups(l);  // tous les groupes
      const myAgentKey = sessionStorage.getItem('cpas_current_agent_key');
      const amIHere    = !isAccueil && DB.getBureauAgentKey(l) === myAgentKey && !!myAgentKey;
      const labelHtml = (pubLabel !== label ? `${label}<span class="lv-pub-label">${pubLabel}</span>` : label)
        + grps.map(g => `<span class="lv-qg-badge">🔗 ${g.name}</span>`).join('');

      // ── Carte BackOffice (lieu non public, présence pure) ─────────
      if (DB.getFeature('enableBackoffice') && DB.isLocalBackoffice(l)) {
        const currentKey  = sessionStorage.getItem('cpas_current_agent_key') || null;
        const presence    = DB.getBackofficePresence(l);
        const iAmHere     = !!(currentKey && presence[currentKey]);
        const presentList = Object.keys(presence).map(key => {
          const a = DB.getAgentsWithKeys().find(a => a.key === key);
          return a?.name || key;
        });
        const agentsHtml = presentList.length
          ? presentList.map(n => `<span class="lv-bo-agent">${escapeHtml(n)}</span>`).join('')
          : '<span class="lv-bo-empty">Personne actuellement</span>';
        return `<div class="lv-card lv-backoffice${iAmHere ? ' lv-bo-me' : ''}">
          <div class="lv-num">${label}</div>
          <div class="lv-status">🏢 BackOffice</div>
          <div class="lv-bo-agents">${agentsHtml}</div>
          <button class="lv-bo-toggle" data-local="${l}" data-present="${iAmHere ? '1' : '0'}">
            ${iAmHere ? '🚪 Je pars' : '🏢 Je suis ici'}
          </button>
        </div>`;
      }

      // File individuelle de ce local
      const queue          = DB.getQueue(l);
      const pendingPref    = DB.getPreferredPending(l);
      const busyWithPref   = DB.isBureauBusyWithPreferred(l);
      // "Occupé" = file classique OU agent en cours avec un bénéficiaire preferred
      const isBusyLocal    = queue >= 1 || busyWithPref;
      const isOpen         = DB.isBureauOpen(l);
      const pause       = DB.getBureauPause(l);

      // En mode bureau : si pas encore ouvert → carte "Ouvrir le bureau"
      if (!isAccueil && !isOpen) {
        // Réservation précédente (terminée la plus récemment)
        const allForLocal = occs.filter(r => parseInt(r.localId) === l && !r.isPermanent);
        const prevRes = allForLocal
          .filter(r => r._end <= now)
          .sort((a, b) => b._end - a._end)[0] || null;
        // Réservation cible : en cours ou prochaine
        const targetRes = perm || res || allForLocal.filter(r => r._start > now).sort((a, b) => a._start - b._start)[0] || null;

        const fmtResRow = (o, highlight) => {
          const svc = DB.getSvcLabel(o);
          const agt = o.agent   === 'Autre' ? o.agentCustom  : o.agent;
          const hm  = o._start?.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) || '';
          const hme = o._end?.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) || '';
          return `<div class="lv-cl-res${highlight ? ' lv-cl-res-hl' : ''}">
            ${hm && hme ? `<div class="lv-cl-time">${hm} – ${hme}</div>` : ''}
            <div class="lv-cl-svc">${svc}</div>
            <div class="lv-cl-agt">${fmtAgent(agt)}</div>
          </div>`;
        };

        const prevHtml   = prevRes   ? `<div class="lv-cl-label">Précédent</div>${fmtResRow(prevRes, false)}` : '';
        const targetHtml = targetRes ? `<div class="lv-cl-label">${res ? 'En cours' : perm ? 'Permanent' : 'Suivant'}</div>${fmtResRow(targetRes, true)}` : '<div class="lv-svc lv-muted">Aucune réservation aujourd\'hui</div>';

        const agentInOtherBureau = currentAgentOpenLocal !== null && currentAgentOpenLocal !== l;
        const openBtn = agentInOtherBureau
          ? `<div class="lv-bm-empty lv-bureau-conflict">🔒 Vous êtes déjà dans ${escapeHtml(DB.getLocalLabel(currentAgentOpenLocal))}</div>`
          : `<button class="lv-bureau-open" data-local="${l}">🟢 Je suis là, ouvrir le bureau</button>`;
        return `<div class="lv-card lv-bureau-closed">
          <div class="lv-num">${labelHtml}</div>
          ${prevHtml}
          ${prevHtml && targetRes ? '<div class="lv-cl-sep"></div>' : ''}
          ${targetHtml}
          ${openBtn}
        </div>`;
      }

      // Boutons de file
      let queueHtml;
      // Pause/retirer/fermer bloqués dès qu'on est en permanence (queue ou busyWithPref)
      // Et seulement visibles par l'agent qui a ouvert ce bureau
      const pauseBtn  = isOpen && amIHere && !isBusyLocal
        ? `<button class="lv-pause-btn" data-local="${l}">⏸ Pause</button>`
        : '';

      const printBtnHtml = DB.getFeature('enableTicketPrint') && this._lastCalled[l]?.ticket
        ? `<button class="lv-print-btn" data-local="${l}" title="Réimprimer ticket ${this._lastCalled[l].ticket}">🖨 Réimprimer ${this._lastCalled[l].ticket}</button>`
        : '';

      if (grp) {
        // Support multi-groupes : overflow = somme de tous les groupes de ce local
        const oldestGrp   = DB.getOldestOverflowGroup(l) || grp;
        const overflow    = grps.reduce((sum, g) => sum + DB.getGroupOverflowQueue(g.id), 0);
        const optedOut    = DB.getBureauOptedOut(l);
        const callNextBtn = amIHere && queue === 0 && overflow > 0 && !busyWithPref
          ? `<button class="lv-q-next" data-local="${l}" data-grp="${oldestGrp.id}">🔔 Appeler le suivant</button>`
          : '';
        const fermerLabel = isAccueil ? '🔴 Forcer fermeture' : '🔴 Je pars, fermer le bureau';
        // Fermer bloqué si : en cours de permanence (sauf accueil) OU pas l'agent connecté
        const fermerBtn   = (!isAccueil && (isBusyLocal || !amIHere)) ? '' : `<button class="lv-bureau-close${isAccueil ? ' lv-bureau-force' : ''}" data-local="${l}">${fermerLabel}</button>`;
        const leaveBtn = '';
        // Bénéficiaire en cours (queue = 0 → dernier appelé, ou busyWithPref en cours)
        // "En cours" : seulement pendant busyWithPref (quelqu'un est physiquement dans le bureau)
        // queue >= 1 seul ne suffit pas — c'est juste "quelqu'un attend", pas "quelqu'un est là"
        // "Rappeler" : visible dès que l'agent a appelé quelqu'un (_lastCalled peuplé)
        // Disparaît uniquement quand l'agent clique "Je suis disponible" / "Bénéficiaire parti"
        // (false = sentinelle "effacé volontairement" → traiter comme null)
        // NE PAS conditionner sur isBusyLocal/overflow → comportement aléatoire lié à Firebase
        const lastCallOngoing = amIHere && busyWithPref ? (this._lastCalled[l] || null) : null;
        const lastCallAny     = amIHere ? (this._lastCalled[l] || null) : null;
        // Bouton "Bénéficiaire parti" : flux preferred uniquement (busyWithPref)
        // Le cas queue>0 sans busyWithPref est géré par "Je suis disponible"
        const dismissBtn = (!isAccueil && amIHere && busyWithPref)
          ? `<button class="lv-q-done" data-local="${l}" title="Marquer le bénéficiaire comme parti">✅ Bénéficiaire parti</button>`
          : '';
        const infoHint  = lastCallAny
          ? `<div class="lv-current-beneficiary">🟡 En cours — ${lastCallAny.ticketLabel ? `<strong>n°${escapeHtml(lastCallAny.ticketLabel)}</strong>` : 'ticket en cours'}${lastCallAny.ticketName ? ` · ${escapeHtml(lastCallAny.ticketName)}` : ''}${lastCallAny.svc ? ` · ${escapeHtml(lastCallAny.svc)}` : ''}${dismissBtn}</div>`
          : (!isAccueil && busyWithPref ? `<div class="lv-current-beneficiary">${dismissBtn}</div>` : '');
        const prefQueueLen = amIHere ? DB.getPreferredQueue(l).length : 0;
        const prefQueueHint = prefQueueLen > 0
          ? `<div class="lv-pref-queue-hint">👥 ${prefQueueLen} personne${prefQueueLen > 1 ? 's' : ''} en attente de rendez-vous spécifique</div>`
          : '';
        // pending preferred — toujours récupéré pour la liste d'attente
        const _preferredPending = amIHere ? DB.getPreferredPending(l) : null;
        // Bouton "Recevoir X" : uniquement si l'agent est libre (pas busyWithPref/permanence)
        const preferred = _preferredPending && !isBusyLocal ? _preferredPending : null;
        // Liste complète des tickets en attente — tous les groupes + preferred pending + preferred queue
        const _gcCfgL = DB.getTicketDisplay('groupCard');
        const _prefQueueItems = amIHere ? DB.getPreferredQueue(l) : [];
        const _allWaitItems = [];
        // Ajouter le preferred pending (ex: cxx) avec flag isPref — même pendant permanence
        if (amIHere && _preferredPending) {
          _allWaitItems.push({ isPref: true, ts: _preferredPending.ts || 0, prefName: _preferredPending.displayName || '?', prefTicket: _preferredPending.ticketLabel || _preferredPending.displayName || '?' });
        }
        // Ajouter les personnes en attente derrière le preferred pending
        _prefQueueItems.forEach(pq => {
          _allWaitItems.push({ isPref: true, ts: pq.ts || 0, prefName: pq.displayName || '?', prefTicket: pq.ticketLabel || pq.displayName || '?' });
        });
        // Ajouter les tickets de file d'attente groupe
        grps.forEach(g => {
          const _issued = DB.getTicketIssued(g.id);
          const _called = DB.getTicketCalled(g.id);
          for (let n = _called + 1; n <= _issued; n++) {
            if (!DB.isTicketSkipped(g.id, n)) {
              const ts = DB.getTicketIssuedAt(g.id, n) || 0;
              _allWaitItems.push({ gId: g.id, gName: g.name, n, ts });
            }
          }
        });
        // Trier par timestamp d'émission (ordre d'arrivée global)
        _allWaitItems.sort((a, b) => a.ts - b.ts);
        const totalWaiting = overflow + (_preferredPending ? 1 : 0) + _prefQueueItems.length;
        const overflowBadge = amIHere && totalWaiting > 0
          ? `<div class="lv-grp-queue-list">
               <div class="lv-grp-queue-header">
                 <span class="lv-grp-queue-arrow">↓</span>
                 <span class="lv-grp-queue-label">FILE D'ATTENTE — ${totalWaiting} personne${totalWaiting > 1 ? 's' : ''}</span>
               </div>
               ${_allWaitItems.map((item, i) => {
                 const _waitMin = item.ts ? Math.floor((Date.now() - item.ts) / 60000) : null;
                 const _waitStr = _waitMin !== null ? (_waitMin < 1 ? '&lt;1m' : `${_waitMin}m`) : '';
                 if (item.isPref) {
                   return `<div class="lv-grp-queue-item lv-grp-queue-item-pref has-call"><span class="lv-grp-queue-pos">→${i+1}</span><span class="lv-grp-queue-ticket">${escapeHtml(item.prefTicket)}</span><span class="lv-grp-queue-wait">${_waitStr}</span><span class="lv-grp-queue-name">📌 ${escapeHtml(item.prefName)}</span><span></span><span></span></div>`;
                 }
                 const _num  = _gcCfgL.showNum  ? DB.formatTicket(item.gId, item.n) : `#${i+1}`;
                 const _name = _gcCfgL.showName ? DB.getTicketName(item.gId, item.n) : null;
                 const _grpLabel = grps.length > 1 ? `<span class="lv-grp-queue-grp">${escapeHtml(item.gName)}</span>` : '<span></span>';
                 const _callBtn = amIHere
                   ? `<button class="lv-grp-queue-call" data-grp="${item.gId}" data-n="${item.n}" data-local="${l}" title="Appeler ce ticket directement">🔔</button>`
                   : '<span></span>';
                 return `<div class="lv-grp-queue-item has-call"><span class="lv-grp-queue-pos">→${i+1}</span><span class="lv-grp-queue-ticket">${escapeHtml(_num)}</span><span class="lv-grp-queue-wait">${_waitStr}</span><span class="lv-grp-queue-name">${_name ? escapeHtml(_name) : ''}</span>${_grpLabel}${_callBtn}</div>`;
               }).join('')}
             </div>`
          : '';
        const grpHint = amIHere
          ? `<div class="lv-queue-group-hint">🔗 ${escapeHtml(grp.name)}${optedOut ? ' · <em>retiré</em>' : ''}</div>${overflowBadge}${infoHint}`
          : '';
        // Rappel disponible dès qu'un ticket a été appelé, même si quelqu'un est en salle
        const recallBtn = lastCallAny
          ? `<button class="lv-q-recall" data-local="${l}" title="Relancer la notification publique pour ${lastCallAny.ticketLabel || 'le dernier ticket'}">📢 Rappeler ${lastCallAny.ticketLabel ? `n°${escapeHtml(lastCallAny.ticketLabel)}` : 'le dernier'}</button>`
          : '';
        const _prefDisplay = preferred ? (preferred.ticketLabel ? `${preferred.ticketLabel} · ${preferred.displayName || '?'}` : (preferred.displayName || '?')) : '';
        const preferredBtn = preferred
          ? `<button class="lv-pref-receive" data-local="${l}" data-req="${preferred.requestId}" data-name="${escapeHtml(preferred.displayName || '?')}">📥 Recevoir ${escapeHtml(_prefDisplay)} qui ne souhaite voir que moi</button>`
          : '';
        // Rappel preferred côté accueil (rappeler l'annonce publique)
        const pendingForAccueil = isAccueil ? DB.getPreferredPending(l) : null;
        const _prefRecallDisplay = pendingForAccueil ? (pendingForAccueil.ticketLabel ? `${pendingForAccueil.ticketLabel} · ${pendingForAccueil.displayName || '?'}` : (pendingForAccueil.displayName || '?')) : '';
        const preferredRecallBtn = pendingForAccueil
          ? `<button class="lv-pref-recall" data-local="${l}" data-name="${escapeHtml(pendingForAccueil.displayName || '?')}" data-agent="${escapeHtml(pendingForAccueil.agentPublicName || '')}">📢 Rappeler ${escapeHtml(_prefRecallDisplay)}</button>`
          : '';
        queueHtml = `<div class="lv-queue lv-queue-agent${optedOut ? ' lv-queue-opted-out' : ''}">
          ${grpHint}
          ${preferredBtn}
          ${preferredRecallBtn}
          ${amIHere && !busyWithPref && (queue > 0 || (overflow > 0 && !pendingPref)) ? `<button class="lv-q-avail" data-local="${l}" data-delta="-1">✅ Je suis disponible</button>` : ''}
          ${recallBtn}
          ${callNextBtn}
          <div class="lv-queue-actions">${leaveBtn}${printBtnHtml}${pauseBtn}${fermerBtn}</div>
        </div>`;
      } else {
        const fermerLabel = isAccueil ? '🔴 Forcer fermeture' : '🔴 Je pars, fermer le bureau';
        const fermerBtn   = (!isAccueil && (isBusyLocal || !amIHere)) ? '' : `<button class="lv-bureau-close${isAccueil ? ' lv-bureau-force' : ''}" data-local="${l}">${fermerLabel}</button>`;
        const noQueueWarn = amIHere && isOpen && l === currentAgentOpenLocal
          ? `<div class="lv-no-queue-warn">⚠️ Tu n'es pas lié à une file d'attente — Inscris-toi à une file d'attente !</div>`
          : '';
        const noGrpPreferred = amIHere ? DB.getPreferredPending(l) : null;
        const _ngPrefDisp = noGrpPreferred ? (noGrpPreferred.ticketLabel ? `${noGrpPreferred.ticketLabel} · ${noGrpPreferred.displayName || '?'}` : (noGrpPreferred.displayName || '?')) : '';
        const noGrpPrefBtn = noGrpPreferred
          ? `<button class="lv-pref-receive" data-local="${l}" data-req="${noGrpPreferred.requestId}" data-name="${escapeHtml(noGrpPreferred.displayName || '?')}">📥 Recevoir ${escapeHtml(_ngPrefDisp)} qui ne souhaite voir que moi</button>`
          : '';
        const noGrpPrefRecall = isAccueil ? DB.getPreferredPending(l) : null;
        const _ngRecallDisp = noGrpPrefRecall ? (noGrpPrefRecall.ticketLabel ? `${noGrpPrefRecall.ticketLabel} · ${noGrpPrefRecall.displayName || '?'}` : (noGrpPrefRecall.displayName || '?')) : '';
        const noGrpPrefRecallBtn = noGrpPrefRecall
          ? `<button class="lv-pref-recall" data-local="${l}" data-name="${escapeHtml(noGrpPrefRecall.displayName || '?')}" data-agent="${escapeHtml(noGrpPrefRecall.agentPublicName || '')}">📢 Rappeler ${escapeHtml(_ngRecallDisp)}</button>`
          : '';
        const noGrpDismissBtn = (amIHere && busyWithPref)
          ? `<button class="lv-q-done" data-local="${l}" title="Marquer le bénéficiaire comme parti">✅ Bénéficiaire parti</button>`
          : '';
        const noGrpLastCall = amIHere ? (this._lastCalled[l] || null) : null;
        const noGrpInfoHint = noGrpLastCall
          ? `<div class="lv-current-beneficiary">🟡 En cours — ${noGrpLastCall.ticketLabel ? `<strong>n°${escapeHtml(noGrpLastCall.ticketLabel)}</strong>` : 'ticket en cours'}${noGrpLastCall.ticketName ? ` · ${escapeHtml(noGrpLastCall.ticketName)}` : ''}${noGrpLastCall.svc ? ` · ${escapeHtml(noGrpLastCall.svc)}` : ''}${noGrpDismissBtn}</div>`
          : (!isAccueil && busyWithPref ? `<div class="lv-current-beneficiary">${noGrpDismissBtn}</div>` : '');
        const noGrpPrefQueueLen = amIHere ? DB.getPreferredQueue(l).length : 0;
        const noGrpPrefQueueHint = noGrpPrefQueueLen > 0
          ? `<div class="lv-pref-queue-hint">👥 ${noGrpPrefQueueLen} personne${noGrpPrefQueueLen > 1 ? 's' : ''} en attente de rendez-vous spécifique</div>`
          : '';
        queueHtml = `<div class="lv-queue lv-queue-agent">
          ${noQueueWarn}
          ${noGrpInfoHint}
          ${noGrpPrefQueueHint}
          ${noGrpPrefBtn}
          ${noGrpPrefRecallBtn}
          ${amIHere && queue > 0 && !noGrpPreferred && !noGrpPrefRecall ? `<button class="lv-q-avail" data-local="${l}" data-delta="-1">✅ Je suis disponible</button>` : ''}
          <div class="lv-queue-actions">${printBtnHtml}${pauseBtn}${fermerBtn}</div>
        </div>`;
      }

      // Carte pause (bureau ouvert, agent temporairement absent)
      if (isOpen && pause) {
        const remaining  = _pauseRemaining(pause);
        const timerHtml  = remaining !== null
          ? `<div class="lv-pause-timer" data-started="${pause.startedAt}" data-dur="${pause.estimatedMin}">${_fmtRemaining(remaining)}</div>`
          : '';
        const commentHtml = pause.comment
          ? `<div class="lv-pause-comment">${escapeHtml(pause.comment)}</div>`
          : '';
        return `<div class="lv-card lv-pause">
          <div class="lv-num">${labelHtml}</div>
          <div class="lv-status">⏸ En pause</div>
          ${timerHtml}
          ${commentHtml}
          <div class="lv-queue">
            <button class="lv-pause-end" data-local="${l}">✅ Reprendre</button>
          </div>
        </div>`;
      }

      // Groupes de file d'attente pour ce local (vue publique)
      const _localQGrps = DB.getLocalGroups(l);
      const grpSvcHtml = isAccueil && _localQGrps.length
        ? `<div class="lv-grp-badges">${_localQGrps.map(g => `<span class="lv-grp-badge-pub">${escapeHtml(g.name)}</span>`).join('')}</div>`
        : null;

      if (perm) {
        const svc           = DB.getSvcLabel(perm);
        const agt           = perm.agent   === 'Autre' ? perm.agentCustom  : perm.agent;
        const agtRoleColor  = DB.getAgentRoleColor(agt);
        const permCls       = isOpen ? 'lv-perm' : 'lv-closed';
        const permStatus    = isOpen ? '🔒 Permanent' : '⚫ Fermé';
        return `<div class="lv-card ${permCls}">
          <div class="lv-num">${labelHtml}</div>
          <div class="lv-status">${permStatus}</div>
          ${grpSvcHtml ?? `<div class="lv-svc">${svc}</div>`}
          <div class="lv-agt" style="${agtRoleColor ? `color:${agtRoleColor}` : ''}">${fmtAgent(agt)}</div>
          ${queueHtml}
        </div>`;
      }
      if (res) {
        const svc           = DB.getSvcLabel(res);
        const resAgt        = res.agent === 'Autre' ? res.agentCustom : res.agent;
        const endH          = res._end.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
        // Si le bureau est ouvert par quelqu'un d'autre que l'agent de la réservation, afficher l'ouvreur
        const openerDisp    = isOpen ? DB.getBureauAgentDisplayName(l) : null;
        const agt           = (openerDisp && openerDisp !== resAgt) ? openerDisp : resAgt;
        const agentCardColor = DB.getAgentColor(resAgt);    // couleur de carte basée sur la réservation
        const agtRoleColor   = DB.getAgentRoleColor(agt);   // couleur du pseudo de l'agent présent
        if (!isOpen) {
          return `<div class="lv-card lv-closed" style="${agentCardColor ? `border-top:6px solid ${agentCardColor}` : ''}">
            <div class="lv-num">${labelHtml}</div>
            <div class="lv-status">⚫ Fermé</div>
            ${grpSvcHtml ?? `<div class="lv-svc">${svc}</div>`}
            <div class="lv-agt" style="${agtRoleColor ? `color:${agtRoleColor}` : ''}">${fmtAgent(resAgt)}</div>
            <div class="lv-until">Jusqu'à ${endH}</div>
            ${queueHtml}
          </div>`;
        }
        const cardCls   = isBusyLocal ? 'lv-busy' : 'lv-free';
        const statusTxt = isBusyLocal ? '🔴 Occupé' : '🟢 Disponible';
        return `<div class="lv-card ${cardCls}" style="${agentCardColor ? `border-top:6px solid ${agentCardColor}` : ''}">
          <div class="lv-num">${labelHtml}</div>
          <div class="lv-status">${statusTxt}</div>
          ${grpSvcHtml ?? `<div class="lv-svc">${svc}</div>`}
          <div class="lv-agt" style="${agtRoleColor ? `color:${agtRoleColor}` : ''}">${fmtAgent(agt)}</div>
          <div class="lv-until">Jusqu'à ${endH}</div>
          ${queueHtml}
        </div>`;
      }
      const nextStr = next
        ? `Prochain : ${next._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`
        : '';
      if (!isBusyLocal) {
        // Bureau ouvert sans réservation active → afficher service déclaré + bouton
        if (isOpen) {
          const declSvc    = DB.getBureauDeclaredService(l);
          const agentDisp  = DB.getBureauAgentDisplayName(l);
          return `<div class="lv-card lv-free">
            <div class="lv-num">${labelHtml}</div>
            <div class="lv-status">🟢 Disponible</div>
            ${agentDisp ? `<div class="lv-agt">${escapeHtml(agentDisp)}</div>` : ''}
            ${isAccueil
              ? (grpSvcHtml ?? (declSvc ? `<div class="lv-svc">${escapeHtml(declSvc)}</div>` : ''))
              : (declSvc ? `<div class="lv-svc">${escapeHtml(declSvc)}</div>` : '<div class="lv-svc lv-muted lv-no-svc">Aucun service déclaré</div>')}
            ${queueHtml}
          </div>`;
        }
        return `<div class="lv-card lv-closed">
          <div class="lv-num">${labelHtml}</div>
          <div class="lv-status">⚫ Fermé</div>
          ${nextStr ? `<div class="lv-next">${nextStr}</div>` : ''}
          ${queueHtml}
        </div>`;
      }
      return `<div class="lv-card lv-walkin">
        <div class="lv-num">${labelHtml}</div>
        <div class="lv-status">🟡 Permanence en cours</div>
        ${nextStr ? `<div class="lv-next">${nextStr}</div>` : ''}
        ${queueHtml}
      </div>`;
    }; // fin renderCard

    // ── Construire le HTML de la grille ──────────────────────────
    const allLieux = DB.getLieux();
    const lieuGroupsHtml = Object.entries(allLieux)
      .filter(([lieuId, lieu]) =>
        !lieu.isBackoffice &&
        !this._hiddenLieux.has(lieuId) &&
        (!this._filterLieuId || lieuId === this._filterLieuId)
      )
      .map(([lieuId, lieu]) => {
        const locals = lieu.localIds || [];
        if (!locals.length) return '';
        return `<div class="lv-lieu-group" data-lieu="${lieuId}">
          <div class="lv-lieu-header">${escapeHtml(lieu.name)}</div>
          <div class="lv-lieu-cards">${locals.map(renderCard).join('')}</div>
        </div>`;
      }).join('');

    if (isAccueil) {
      const bureauHtml = this._showAllBureaux ? lieuGroupsHtml : '';

      // Liste des demandes SP actives (preferredPending par local)
      const _allPending = Object.entries(DB._preferredPending || {})
        .map(([lid, pend]) => ({ localId: parseInt(lid), pend }))
        .filter(x => x.pend)
        .sort((a, b) => (a.pend.ts || 0) - (b.pend.ts || 0));

      const _pendingHtml = _allPending.length
        ? `<div class="lv-pref-section-title">🎫 Demandes en cours</div>
           <div class="lv-pref-list">${_allPending.map(({ localId, pend }) => {
             const _ticket = pend.ticketLabel || 'SP';
             const _name   = pend.displayName || '?';
             const _agent  = pend.agentPublicName || '';
             const _loc    = DB.getLocalLabel(localId);
             return `<div class="lv-pref-item">
               <span class="lv-pref-ticket">${escapeHtml(_ticket)}</span>
               <span class="lv-pref-name">${escapeHtml(_name)}</span>
               <span class="lv-pref-arrow">→</span>
               <span class="lv-pref-agent">${escapeHtml(_agent)}</span>
               <span class="lv-pref-local">${escapeHtml(_loc)}</span>
             </div>`;
           }).join('')}</div>`
        : '';

      // Liste des demandes SP en attente d'ouverture de bureau
      const _awaitingMap = DB.getAllAwaitingPreferred();
      const _awaitingList = Object.entries(_awaitingMap)
        .map(([agentKey, data]) => ({ agentKey, data }))
        .sort((a, b) => (a.data?.ts || 0) - (b.data?.ts || 0));
      const _awaitingHtml = _awaitingList.length
        ? `<div class="lv-pref-section-title lv-pref-section-title-await">💺 En attente d'ouverture</div>
           <div class="lv-pref-list">${_awaitingList.map(({ agentKey, data }) => {
             const _info = DB.getAgentsWithKeys().find(a => a.key === agentKey);
             const _agentName = _info?.name || agentKey;
             const _name  = data.displayName || '?';
             const _place = data.publicPlaceName || '';
             return `<div class="lv-pref-item lv-pref-item-await">
               <span class="lv-pref-ticket">⏳</span>
               <span class="lv-pref-name">${escapeHtml(_name)}</span>
               <span class="lv-pref-arrow">→</span>
               <span class="lv-pref-agent">${escapeHtml(_agentName)}</span>
               <span class="lv-pref-local">${_place ? `📍 ${escapeHtml(_place)}` : 'bureau non ouvert'}</span>
               <button class="lv-pref-cancel" data-agent-key="${escapeHtml(agentKey)}" title="Annuler l'attente">✕</button>
             </div>`;
           }).join('')}</div>`
        : '';

      const preferredCard = `<div class="lv-card lv-preferred-standalone">
        <div class="lv-preferred-standalone-title">👤 Demande agent spécifique</div>
        <div class="lv-preferred-standalone-desc">Un bénéficiaire souhaite être reçu par un agent en particulier.</div>
        <button class="lv-grp-preferred" id="lvPreferredBtn">Ne veut voir qu'un agent</button>
        ${_pendingHtml}
        ${_awaitingHtml}
      </div>`;
      g('liveGrid').innerHTML = groupCards + preferredCard + bureauHtml;
    } else {
      // Mode bureau : toutes les files visibles, inscrit ou non
      const _allGrps = Object.entries(DB.getQueueGroups()).map(([id, g]) => ({ id, ...g }));
      const _gcCfg = DB.getTicketDisplay('groupCard');
      const _myPerm = occs.find(r => parseInt(r.localId) === bureauLocal && r.isPermanent);
      const _myRes  = occs.find(r => parseInt(r.localId) === bureauLocal && !r.isPermanent && r._start <= now && r._end > now);

      const grpCardsHtml = _allGrps.map(_bureauGrp => {
        const _grpLids    = (_bureauGrp.localIds || []).map(Number);
        const isEnrolled  = bureauLocal !== null && _grpLids.includes(bureauLocal);
        const _grpOpen    = _grpLids.filter(l => DB.isBureauOpen(l));
        const _grpOcc     = _grpOpen.filter(l => DB.getQueue(l) >= 1 || DB.isBureauBusyWithPreferred(l) || !!DB.getPreferredPending(l)).length;
        const _grpFree    = _grpOpen.length - _grpOcc;
        const _grpOvf     = DB.getGroupOverflowQueue(_bureauGrp.id);
        const _grpStatusTxt = _grpOpen.length === 0
          ? '⚪ Aucun bureau ouvert'
          : _grpOcc >= _grpOpen.length
            ? `🔴 Complet — ${_grpOvf > 0 ? _grpOvf + ' en attente' : 'tous occupés'}`
            : _grpOvf > 0
              ? `🟡 ${_grpFree} bureau${_grpFree > 1 ? 'x' : ''} libre${_grpFree > 1 ? 's' : ''} — ${_grpOvf} en attente`
              : `🟢 ${_grpFree} bureau${_grpFree > 1 ? 'x' : ''} disponible${_grpFree > 1 ? 's' : ''}`;
        const _grpDotsHtml = _grpOpen.map(l => {
          const busy = DB.getQueue(l) >= 1 || DB.isBureauBusyWithPreferred(l) || !!DB.getPreferredPending(l);
          const isMe = l === bureauLocal;
          return `<span class="lv-grp-dot${busy ? ' busy' : ''}${isMe ? ' lv-grp-dot-me' : ''}" title="${DB.getLocalLabel(l)}"></span>`;
        }).join('');
        const _issued  = DB.getTicketIssued(_bureauGrp.id);
        const _called  = DB.getTicketCalled(_bureauGrp.id);
        const _ovfNums = [];
        for (let n = _called + 1; n <= _issued; n++) { if (!DB.isTicketSkipped(_bureauGrp.id, n)) _ovfNums.push(n); }
        const _extraOvf = Math.max(0, _grpOvf - _ovfNums.length);
        // Intégrer les preferred (pour moi) dans la file d'attente si inscrit
        const _bPrefItems = (isEnrolled && bureauLocal !== null) ? (() => {
          const list = [];
          const pend = DB.getPreferredPending(bureauLocal);
          if (pend) list.push({ isPref: true, ts: pend.ts || 0, prefTicket: pend.ticketLabel || pend.displayName || '?', prefName: pend.displayName || '?' });
          DB.getPreferredQueue(bureauLocal).forEach(item => {
            list.push({ isPref: true, ts: item.ts || 0, prefTicket: item.ticketLabel || item.displayName || '?', prefName: item.displayName || '?' });
          });
          return list;
        })() : [];
        // Liste combinée triée par timestamp
        const _combinedItems = [
          ..._ovfNums.map(n => ({ isGroup: true, n, ts: DB.getTicketIssuedAt(_bureauGrp.id, n) || 0 })),
          ..._bPrefItems,
        ].sort((a, b) => a.ts - b.ts);
        const _totalWait = _grpOvf + _bPrefItems.length;
        const _ovfChips = (_combinedItems.length || _extraOvf > 0)
          ? `<div class="lv-grp-queue-list">
               <div class="lv-grp-queue-header">
                 <span class="lv-grp-queue-arrow">↓</span>
                 <span class="lv-grp-queue-label">FILE D'ATTENTE — ${_totalWait} personne${_totalWait > 1 ? 's' : ''}</span>
               </div>
               ${_combinedItems.map((item, i) => {
                 const _waitMin = item.ts ? Math.floor((Date.now() - item.ts) / 60000) : null;
                 const _waitStr = _waitMin !== null ? (_waitMin < 1 ? '&lt;1m' : `${_waitMin}m`) : '';
                 if (item.isPref) {
                   return `<div class="lv-grp-queue-item lv-grp-queue-item-pref"><span class="lv-grp-queue-pos">→${i+1}</span><span class="lv-grp-queue-ticket">${escapeHtml(item.prefTicket)}</span><span class="lv-grp-queue-wait">${_waitStr}</span><span class="lv-grp-queue-name">📌 ${escapeHtml(item.prefName)}</span></div>`;
                 }
                 const num  = _gcCfg.showNum  ? DB.formatTicket(_bureauGrp.id, item.n) : `#${i+1}`;
                 const name = _gcCfg.showName ? DB.getTicketName(_bureauGrp.id, item.n) : null;
                 return `<div class="lv-grp-queue-item"><span class="lv-grp-queue-pos">→${i+1}</span><span class="lv-grp-queue-ticket">${escapeHtml(num)}</span><span class="lv-grp-queue-wait">${_waitStr}</span>${name ? `<span class="lv-grp-queue-name">${escapeHtml(name)}</span>` : '<span></span>'}</div>`;
               }).join('')}
               ${_extraOvf > 0 ? `<div class="lv-grp-queue-item lv-grp-queue-item-unknown">→ … +${_extraOvf} autre${_extraOvf > 1 ? 's' : ''}</div>` : ''}
             </div>`
          : '';
        const _prefChip = '';
        const actionBtn = bureauLocal !== null
          ? isEnrolled
            ? `<button class="lv-grp-leave" data-grp="${_bureauGrp.id}" data-local="${bureauLocal}">🔕 Se désinscrire</button>`
            : `<button class="lv-grp-join"  data-grp="${_bureauGrp.id}" data-local="${bureauLocal}">➕ Je m'inscris</button>`
          : '';
        return `<div class="lv-card lv-grp-card lv-grp-card-bureau${isEnrolled ? ' lv-grp-enrolled' : ' lv-grp-unrolled'}">
          <div class="lv-grp-title">🔗 ${escapeHtml(_bureauGrp.name)}</div>
          <div class="lv-grp-status">${_grpStatusTxt}</div>
          ${_grpDotsHtml ? `<div class="lv-grp-locals">${_grpDotsHtml}</div>` : ''}
          ${_ovfChips}
          ${_prefChip}
          ${actionBtn}
        </div>`;
      }).join('');

      g('liveGrid').innerHTML = grpCardsHtml + renderCard(bureauLocal);
    }

    this._renderLieuFilters();

    // Binder les boutons des cartes de groupe (dispatcher)
    g('liveGrid').querySelectorAll('.lv-grp-add').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const grpId = btn.dataset.grp;
        // Tickets nominatifs : saisie du nom du bénéficiaire
        let benefName = null;
        if (DB.getFeature('enableNamedTickets')) {
          const raw = window.prompt('Nom du bénéficiaire (optionnel — Entrée pour ignorer) :');
          if (raw === null) return; // Annuler → ne rien faire
          benefName = raw.trim() || null;
        }
        const { label: ticket, resolvedName } = await DB.issueTicket(grpId, benefName);
        // Mémoriser le dernier ticket émis pour ce groupe (bouton reprint accueil)
        LIVE._lastEmittedByGrp[grpId] = { display: resolvedName || ticket, label: ticket, name: resolvedName || null };
        // Impression du ticket côté accueil au moment de l'envoi
        if (DB.getFeature('enableTicketPrint')) {
          const _grpPrint = DB.getQueueGroups()[grpId];
          LIVE._doPrintTicket({ ticket: resolvedName || ticket, svc: _grpPrint?.name || '', localLabel: _grpPrint?.name || '' });
        }
        // Informer l'agent si le prénom a été désambiguïsé (homonyme dans la même file)
        if (resolvedName && benefName && resolvedName !== benefName) {
          showToast(`Homonyme détecté — ce bénéficiaire sera appelé « ${resolvedName} » 👥`);
        }
        // Le ticket va TOUJOURS en file d'attente — l'agent appelle manuellement le suivant
        await DB.incrementGroupOverflow(grpId);
        const overflow = DB.getGroupOverflowQueue(grpId);
        showWaitBanner(overflow, ticket, resolvedName || benefName || null);
      });
    });

    // Bouton Rappeler dernier appel (accueil, carte groupe)
    g('liveGrid').querySelectorAll('.lv-grp-recall').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const ticket = btn.dataset.ticket;
        const svc    = btn.dataset.svc;
        const label  = btn.dataset.label;
        if (!ticket) return;
        // Ré-annoncer sur l'écran public en réécrivant lastCall
        await DB.writeLastCall(0, null, svc || null, ticket, ticket, null);
        showAgentCallNotif(ticket, null);
        showToast(`📢 Rappel envoyé — ${ticket}`);
      });
    });

    // Bouton réimprimer dernier ticket (accueil)
    g('liveGrid').querySelectorAll('.lv-grp-reprint').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const grpId = btn.dataset.grp;
        const last  = LIVE._lastEmittedByGrp[grpId];
        if (!last) return;
        const grpObj = DB.getQueueGroups()[grpId];
        LIVE._doPrintTicket({ ticket: last.display, svc: grpObj?.name || '', localLabel: grpObj?.name || '' });
      });
    });


    // Boutons inscription/désinscription dynamique depuis la vue bureau
    g('liveGrid').querySelectorAll('.lv-grp-join').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const local = parseInt(btn.dataset.local);
        if (!DB.isBureauOpen(local)) {
          showToast('⚠ Ouvrez le bureau avant de vous inscrire à une liste d\'attente');
          return;
        }
        await DB.joinQueueGroup(btn.dataset.grp, local);
        this.render();
      });
    });
    g('liveGrid').querySelectorAll('.lv-grp-leave').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await DB.leaveQueueGroup(btn.dataset.grp, parseInt(btn.dataset.local));
        this.render();
      });
    });

    // Cloche : appeler un ticket spécifique depuis la file de la carte groupe (vue bureau)
    g('liveGrid').querySelectorAll('.lv-grp-queue-call').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId = parseInt(btn.dataset.local);
        const grpId   = btn.dataset.grp;
        const ticketN = parseInt(btn.dataset.n);

        if (!DB.isBureauOpen(localId)) {
          showToast('⚠ Ouvrez le bureau avant d\'appeler un ticket');
          return;
        }
        if (DB.getQueue(localId) >= 1 || DB.isBureauBusyWithPreferred(localId)) {
          showToast('⚠ Bureau déjà occupé — terminez la consultation en cours');
          return;
        }

        const _now  = new Date();
        const _dayS = new Date(_now); _dayS.setHours(0,0,0,0);
        const _dayE = new Date(_now); _dayE.setHours(23,59,59,999);
        const _occ  = DB.getInRange(_dayS, _dayE).find(o =>
          Number(o.localId) === localId && o._start <= _now && (o._end === null || o._end >= _now)
        );
        const _pubAgent = _occ?.agent ? DB.getAgentPublicName(_occ.agent) : null;
        const _grp = DB.getQueueGroups()[grpId];

        const _ticket = await DB.callSpecificTicket(grpId, ticketN);
        if (!_ticket) { showToast('Ticket déjà traité ou indisponible'); return; }

        LIVE._storeCall(localId, _ticket, _occ);
        await DB.setQueue(localId, 1);

        // Si ce ticket correspond à une demande spécifique, fermer proprement
        const _prefMatch = DB.findPreferredPendingByTicket(_ticket.label);
        if (_prefMatch) {
          await DB._ref(`appState/preferredRequests/${_prefMatch.pend.requestId}`).update({ status: 'done', benefName: null });
          await DB._ref(`appState/preferredPending/${_prefMatch.localId}`).remove();
          await DB.shiftPreferredQueue(_prefMatch.localId);
        }
        showAgentCallNotif(_ticket.label, _ticket.name);
        await DB.writeLastCall(localId, _pubAgent, _grp?.name || null, _ticket.display, _ticket.label, _ticket.name);
        this.render();
      });
    });

    // Annuler une demande spécifique en attente d'ouverture (accueil)
    g('liveGrid').querySelectorAll('.lv-pref-cancel').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const agentKey = btn.dataset.agentKey;
        if (!agentKey) return;
        if (!confirm('Annuler cette demande en attente ?')) return;
        const aw = DB.getAwaitingPreferred(agentKey);
        if (aw?.requestId) {
          await DB._ref(`appState/preferredRequests/${aw.requestId}`).update({ status: 'cancelled', benefName: null });
        }
        await DB.removeAwaitingPreferred(agentKey);
        showToast('Demande annulée');
      });
    });

    // Bouton "Ne veut voir qu'un agent" (accueil uniquement)
    g('liveGrid').querySelectorAll('.lv-grp-preferred').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const overlay  = document.getElementById('preferredRequestOverlay');
        const agentSel = document.getElementById('prefAgentSelect');
        const placeSel = document.getElementById('prefPublicPlaceSelect');
        const benefIn  = document.getElementById('prefBenefName');
        if (!overlay) return;

        // Peupler agents connectés aujourd'hui (hors moi)
        const myKey  = sessionStorage.getItem('cpas_current_agent_key');
        const agents = DB.getConnectedTodayAgents().filter(k => k !== myKey);
        if (agentSel) {
          agentSel.innerHTML = '<option value="">— Choisir un agent —</option>' +
            agents.map(k => {
              const info = DB.getAgentsWithKeys().find(a => a.key === k);
              return `<option value="${escapeHtml(k)}">${escapeHtml(info?.name || k)}</option>`;
            }).join('');
        }

        // Peupler lieux publics
        const places = DB.getPublicPlaces();
        if (placeSel) {
          placeSel.innerHTML = '<option value="">— Aucun lieu précis —</option>' +
            places.map(p =>
              `<option value="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">${escapeHtml(p.name)}${p.description ? ' — ' + p.description : ''}</option>`
            ).join('');
        }

        if (benefIn) benefIn.value = '';
        const awaitsCb = document.getElementById('prefAwaitsBureau');
        if (awaitsCb) awaitsCb.checked = false;
        overlay.classList.remove('hidden');
        setTimeout(() => benefIn?.focus(), 80);
      });
    });

    // Bouton "Recevoir X qui ne souhaite voir que moi" (agent)
    g('liveGrid').querySelectorAll('.lv-pref-receive').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId  = parseInt(btn.dataset.local);
        const reqId    = btn.dataset.req;
        const dispName = btn.dataset.name || '?';
        const grp      = DB.getLocalGroup(localId);
        const queue    = grp ? DB.getGroupOverflowQueue(grp.id) : DB.getQueue(localId);
        const doReceive = async () => {
          const now2  = new Date();
          const dayS2 = new Date(now2); dayS2.setHours(0,0,0,0);
          const dayE2 = new Date(now2); dayE2.setHours(23,59,59,999);
          const occ2  = DB.getInRange(dayS2, dayE2).find(o =>
            Number(o.localId) === localId && o._start <= now2 && (o._end === null || o._end >= now2)
          );
          const pubAgent = DB.getBureauAgentDisplayName(localId);
          // _storeCall en mémoire AVANT les awaits : la render Firebase qui suit
          // closePreferredRequest verra _lastCalled déjà peuplé → bouton immédiat
          LIVE._storeCall(localId, dispName, occ2);
          showToast(`✅ ${dispName} reçu.`);
          await DB.closePreferredRequest(reqId, localId);
          await DB.setBureauBusyWithPreferred(localId, true);
          await DB.writeLastCall(localId, pubAgent, grp?.name || null, dispName);
        };
        // Bypass seulement si des gens en overflow sont arrivés AVANT la demande preferred
        const prefTs        = DB.getPreferredPending(localId)?.ts || 0;
        const overflowSince = grp ? DB.getGroupOverflowSince(grp.id) : null;
        const overflowFirst = queue > 0 && overflowSince && overflowSince < prefTs;
        if (overflowFirst) {
          window._openPreferredBypassModal?.(reqId, localId, dispName, doReceive, {
            prefTs,
            overflowSince,
            nextTicket: grp ? DB.getNextQueueTicketDisplay(grp.id) : null,
          });
        } else {
          await doReceive();
        }
      });
    });

    // Binder les boutons file d'attente
    g('liveGrid').querySelectorAll('.lv-q-btn, .lv-q-avail').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId = parseInt(btn.dataset.local);
        const delta   = parseInt(btn.dataset.delta);
        const grp     = DB.getLocalGroup(localId);

        if (delta === -1) {
          // Agent libère son bureau — le bénéficiaire est parti, bureau redevient disponible
          // L'agent appelle le suivant manuellement via "🔔 Appeler le suivant"
          const newQ = grp ? 0 : Math.max(0, DB.getQueue(localId) - 1);
          await DB.setQueue(localId, newQ);
          if (newQ === 0) {
            this._lastCalled[localId] = false;
            try { localStorage.removeItem(`cpas_lastCall_${localId}`); } catch(_) {}
            await DB.clearLastCallForLocal(localId);
          }
        } else {
          await DB.setQueue(localId, Math.max(0, DB.getQueue(localId) + delta));
        }
      });
    });
    g('liveGrid').querySelectorAll('.lv-q-clear').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId = parseInt(btn.dataset.local);
        await DB.setQueue(localId, 0);
      });
    });

    g('liveGrid').querySelectorAll('.lv-q-next').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId  = parseInt(btn.dataset.local);
        const grpId    = btn.dataset.grp;
        const isAccueilBtn = btn.classList.contains('lv-q-next-accueil');
        const doCall = async () => {
          const _now  = new Date();
          const _dayS = new Date(_now); _dayS.setHours(0,0,0,0);
          const _dayE = new Date(_now); _dayE.setHours(23,59,59,999);
          const _occ  = DB.getInRange(_dayS, _dayE).find(o =>
            Number(o.localId) === localId && o._start <= _now && (o._end === null || o._end >= _now)
          );
          const _pubAgent = _occ?.agent ? DB.getAgentPublicName(_occ.agent) : null;

          // Vérifier si le premier de la file globale est un preferred (plus ancien que le prochain ticket groupe)
          const _pendPref = DB.getPreferredPending(localId);
          const _prefQueue = DB.getPreferredQueue(localId);
          const _oldestPref = _pendPref || (_prefQueue.length ? _prefQueue[0] : null);
          const _grp = DB.getQueueGroups()[grpId];

          if (_oldestPref) {
            // Comparer l'ancienneté : preferred vs PROCHAIN ticket NON-SKIPPÉ du groupe
            // (les tickets skippés — déjà traités hors ordre via la cloche — ne doivent pas
            // fausser la comparaison avec leur ancien timestamp)
            let _nextN = DB.getTicketCalled(grpId) + 1;
            const _issued = DB.getTicketIssued(grpId);
            while (_nextN <= _issued && DB.isTicketSkipped(grpId, _nextN)) _nextN++;
            const _nextTicketTs = _nextN <= _issued
              ? (DB.getTicketIssuedAt(grpId, _nextN) || Infinity)
              : Infinity;
            const _prefTs = _oldestPref.ts || 0;
            if (_prefTs <= _nextTicketTs) {
              // Le preferred est plus ancien → le recevoir en priorité
              const _prefTicket = { display: _oldestPref.displayName || '?', label: _oldestPref.ticketLabel || 'SP', name: _oldestPref.displayName || null };
              LIVE._storeCall(localId, _prefTicket, _occ);
              await DB.setBureauBusyWithPreferred(localId, true);
              if (_pendPref) {
                await DB._ref(`appState/preferredRequests/${_pendPref.requestId}`).update({ status: 'done', benefName: null });
                await DB._ref(`appState/preferredPending/${localId}`).remove();
                await DB.shiftPreferredQueue(localId);
              }
              showAgentCallNotif(_prefTicket.label, _prefTicket.name);
              await DB.writeLastCall(localId, _pubAgent, _grp?.name || null, _prefTicket.display, _prefTicket.label, _prefTicket.name);
              LIVE.render();
              return;
            }
          }

          // Sinon : appeler le prochain ticket du groupe normalement
          const _ticket   = await DB.callNextTicket(grpId);
          LIVE._storeCall(localId, _ticket, _occ);
          await DB.setQueue(localId, 1);
          await DB.absorbGroupOverflow(grpId);
          // Si ce ticket correspond à une demande spécifique, fermer proprement
          const _prefMatch = DB.findPreferredPendingByTicket(_ticket.label);
          if (_prefMatch) {
            await DB._ref(`appState/preferredRequests/${_prefMatch.pend.requestId}`).update({ status: 'done', benefName: null });
            await DB._ref(`appState/preferredPending/${_prefMatch.localId}`).remove();
            await DB.shiftPreferredQueue(_prefMatch.localId);
          }
          showAgentCallNotif(_ticket.label, _ticket.name);
          await DB.writeLastCall(localId, _pubAgent, _grp?.name || null, _ticket.display, _ticket.label, _ticket.name);
          LIVE.render();
        };
        if (isAccueilBtn) {
          showBureauConfirm({
            icon: '⚠️',
            title: 'Appeler le ticket suivant',
            info: '<div class="lv-bm-empty" style="color:#fbbf24">À n\'utiliser qu\'en cas de ticket coincé.<br>Cette action appellera manuellement le prochain numéro de la file.</div>',
            okLabel: 'Confirmer', okClass: 'ok-open',
            onOk: doCall
          });
        } else {
          await doCall();
        }
      });
    });

    g('liveGrid').querySelectorAll('.lv-bureau-open').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId = parseInt(btn.dataset.local);
        // Bloquer si l'agent a déjà un bureau ouvert
        const alreadyOpen = DB.getOpenBureauForCurrentAgent();
        if (alreadyOpen !== null && alreadyOpen !== localId) {
          showBureauConfirm({
            icon: '⚠️', title: 'Bureau déjà ouvert',
            info: `<div class="lv-bm-empty" style="color:#fbbf24">Vous avez déjà ouvert <strong>${escapeHtml(DB.getLocalLabel(alreadyOpen))}</strong>.<br>Fermez ce bureau avant d'en ouvrir un autre.</div>`,
            okLabel: null
          });
          return;
        }
        // Si l'agent est présent dans un backoffice → proposer de changer
        if (DB.getFeature('enableBackoffice')) {
          const boLocal = DB.getAgentCurrentPresenceLocal();
          if (boLocal !== null) {
            const boLabel  = DB.getLocalLabel(boLocal);
            const boLieu   = DB.getLocalLieuName(boLocal);
            showBureauConfirm({
              icon: '🔄', title: 'Changer de local',
              info: `<div class="lv-bm-empty">Vous êtes indiqué(e) présent(e) à <strong>${escapeHtml(boLabel)}</strong>${boLieu ? ` (${escapeHtml(boLieu)})` : ''}.<br>Voulez-vous changer de local ?</div>`,
              okLabel: 'Oui, changer', okClass: 'ok-open',
              onOk: async () => {
                await DB.setAgentPresence(boLocal, false);
                // Continuer l'ouverture du bureau normalement
                await DB.openBureau(localId);
                if (DB.getFeature('enableNotif')) {
                  const _lieuName  = DB.getLocalLieuName(localId);
                  const _localName = DB.getLocalLabel(localId);
                  const _grp       = DB.getLocalGroup(localId);
                  let _msg = `🟢 ${_localName}${_lieuName ? ` (${_lieuName})` : ''} vient d'ouvrir.`;
                  if (!_grp) _msg += ` ⚠️ Pas de file partagée.`;
                  await Promise.all(DB.getAccueilAgentKeys().map(k => DB.sendNotif(_msg, 'info', k)));
                }
              }
            });
            return;
          }
        }
        const label   = DB.getLocalLabel(localId);
        const now2    = new Date();
        const dayS2   = new Date(now2); dayS2.setHours(0,0,0,0);
        const dayE2   = new Date(now2); dayE2.setHours(23,59,59,999);
        const curRes  = DB.getInRange(dayS2, dayE2).find(o =>
          parseInt(o.localId) === localId && !o.isPermanent && o._start <= now2 && o._end > now2
        );
        const nextRes = !curRes && DB.getInRange(now2, dayE2).find(o =>
          parseInt(o.localId) === localId && !o.isPermanent && o._start > now2
        );
        const res = curRes || nextRes;
        let infoHtml = '';
        if (res) {
          const svc = DB.getSvcLabel(res);
          const agt = res.agent   === 'Autre' ? res.agentCustom  : res.agent;
          const hm  = res._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          const hme = res._end.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          infoHtml  = `<div class="lv-bm-res">
            <div class="lv-bm-svc">${svc}</div>
            <div class="lv-bm-agt">${fmtAgent(agt)}</div>
            <div class="lv-bm-time">${curRes ? 'En cours' : 'Prévu'} · ${hm} – ${hme}</div>
          </div>`;
          // ⚠ Vérifier si le service correspond au groupe de queue du local
          const grpCheck = DB.getLocalGroup(localId);
          if (grpCheck && !DB.serviceMatchesGroup(svc, grpCheck)) {
            infoHtml += `<div class="lv-bm-service-warn">
              ⚠️ Service <strong>"${escapeHtml(svc)}"</strong> différent du groupe
              <strong>"${escapeHtml(grpCheck.name)}"</strong> — vérifiez que vous êtes au bon bureau.
            </div>`;
          }
        } else {
          infoHtml = '<div class="lv-bm-empty">Aucune réservation prévue aujourd\'hui</div>';
        }
        showBureauConfirm({
          icon: '🟢', title: `Ouvrir ${label}`,
          info: infoHtml,
          okLabel: 'Ouvrir le bureau', okClass: 'ok-open',
          onOk: async () => {
            await DB.openBureau(localId);
            // ── Notification accueil : bureau ouvert ────────────────
            if (DB.getFeature('enableNotif')) {
              const _lieuName  = DB.getLocalLieuName(localId);
              const _localName = DB.getLocalLabel(localId);
              const _grpCheck  = DB.getLocalGroup(localId);
              let _notifMsg = `🟢 ${_localName}${_lieuName ? ` (${_lieuName})` : ''} vient d'ouvrir.`;
              if (!_grpCheck) {
                _notifMsg += ` ⚠️ Ce bureau n'est dans aucune file partagée.`;
              } else if (res) {
                const _svcsOpen = DB.getResSvcs(res).map(s => s === 'Autre' ? (res.serviceCustom || 'Autre') : s);
                const _anyMatch = _svcsOpen.some(s => DB.serviceMatchesGroup(s, _grpCheck));
                if (!_anyMatch) {
                  _notifMsg += ` ⚠️ Service(s) "${_svcsOpen.join(', ')}" ne correspondent pas au groupe "${_grpCheck.name}".`;
                }
              }
              const _accueilKeys = DB.getAccueilAgentKeys();
              if (_accueilKeys.length > 0) {
                await Promise.all(_accueilKeys.map(k => DB.sendNotif(_notifMsg, 'info', k)));
              }
            }
            const grp = DB.getLocalGroup(localId);
            if (grp && DB.getGroupOverflowQueue(grp.id) > 0) {
              await DB.setQueue(localId, 1);
              await DB.absorbGroupOverflow(grp.id);
              const _now = new Date();
              const _dayS = new Date(_now); _dayS.setHours(0,0,0,0);
              const _dayE = new Date(_now); _dayE.setHours(23,59,59,999);
              const _occ  = DB.getInRange(_dayS, _dayE).find(o =>
                Number(o.localId) === localId && o._start <= _now && (o._end === null || o._end >= _now)
              );
              const _pubAgent = DB.getBureauAgentDisplayName(localId);
              const _ticket   = await DB.callNextTicket(grp.id);
              const _prefMatch2 = DB.findPreferredPendingByTicket(_ticket.label);
              if (_prefMatch2) {
                await DB._ref(`appState/preferredRequests/${_prefMatch2.pend.requestId}`).update({ status: 'done', benefName: null });
                await DB._ref(`appState/preferredPending/${_prefMatch2.localId}`).remove();
                await DB.shiftPreferredQueue(_prefMatch2.localId);
              }
              showAgentCallNotif(_ticket.label, _ticket.name);
              await DB.writeLastCall(localId, _pubAgent, grp.name || null, _ticket.display, _ticket.label, _ticket.name);
              LIVE._storeCall(localId, _ticket, _occ);
            }
          }
        });
      });
    });

    // Bouton imprimer ticket (Phase 5.5)
    g('liveGrid').querySelectorAll('.lv-print-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        LIVE._printTicket(parseInt(btn.dataset.local));
      });
    });

    // Bouton "Rappeler le dernier bénéficiaire"
    g('liveGrid').querySelectorAll('.lv-q-recall').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId = parseInt(btn.dataset.local);
        const d = this._lastCalled[localId];
        if (!d) return;
        // Ré-annoncer sur l'écran public (préserver label + nom nominatif)
        const grp = DB.getLocalGroup(localId);
        await DB.writeLastCall(localId, d.pubAgent ?? null, grp?.name ?? null, d.ticket, d.ticketLabel ?? null, d.ticketName ?? null);
        // Notif visuelle locale
        showAgentCallNotif(d.ticketLabel || d.ticket, d.ticketName || null);
        showToast(`📢 Rappel envoyé — ticket ${d.ticket || ''}`);
      });
    });

    // Bouton "Rappeler preferred" (accueil) — ré-annonce sur l'écran public
    g('liveGrid').querySelectorAll('.lv-pref-recall').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId   = parseInt(btn.dataset.local);
        const dispName  = btn.dataset.name || '?';
        const agentName = btn.dataset.agent || null;
        const grp = DB.getLocalGroup(localId);
        await DB.writeLastCall(localId, agentName, grp?.name || null, dispName, dispName, null);
        showToast(`📢 Rappel envoyé pour ${dispName}`);
      });
    });

    // Bouton "Bénéficiaire parti" — efface le dernier ticket + libère le flag busyWithPreferred
    g('liveGrid').querySelectorAll('.lv-q-done').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId = parseInt(btn.dataset.local);
        // Sentinelle false : empêche les fallbacks Firebase/localStorage de restaurer l'ancien ticket
        this._lastCalled[localId] = false;
        try { localStorage.removeItem(`cpas_lastCall_${localId}`); } catch(_) {}
        await Promise.all([
          DB.setBureauBusyWithPreferred(localId, false),
          DB.clearLastCallForLocal(localId),
          DB.getQueue(localId) > 0 ? DB.setQueue(localId, 0) : Promise.resolve(),
        ]);
        // Promouvoir la personne suivante en file preferred (si présente)
        await DB.shiftPreferredQueue(localId);
      });
    });

    // Bouton "Se retirer / Rejoindre" la file partagée
    g('liveGrid').querySelectorAll('.lv-q-leave').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId  = parseInt(btn.dataset.local);
        const optedOut = btn.dataset.opted === '1';
        await DB.setBureauOptedOut(localId, !optedOut);
        showToast(!optedOut ? 'Retiré de la file partagée.' : 'De retour dans la file partagée.');
      });
    });

    // Bouton "Déclarer pour un service" (bureau ouvert sans réservation)
    g('liveGrid').querySelectorAll('.lv-declare-svc').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const localId  = parseInt(btn.dataset.local);
        const services = DB.getServices().filter(s => s !== 'Autre');
        const current  = DB.getBureauDeclaredService(localId) || '';
        const optsHtml = services.map(s =>
          `<option value="${escapeHtml(s)}"${s === current ? ' selected' : ''}>${escapeHtml(s)}</option>`
        ).join('');
        showBureauConfirm({
          icon: '📢',
          title: `Déclarer le service — ${escapeHtml(DB.getLocalLabel(localId))}`,
          info: `<div style="padding:.25rem 0">
            <label style="font-size:.85rem;color:#94a3b8;display:block;margin-bottom:.4rem">Service proposé au public :</label>
            <select id="declareSvcSelect" style="width:100%;padding:.5rem;border-radius:8px;border:1.5px solid #334155;background:#1e293b;color:#e2e8f0;font-size:.95rem">
              ${optsHtml}
            </select>
          </div>`,
          okLabel: 'Confirmer', okClass: 'ok-open',
          onOk: async () => {
            const svc = document.getElementById('declareSvcSelect')?.value;
            if (svc) await DB.setBureauDeclaredService(localId, svc);
          }
        });
      });
    });

    // Bouton présence BackOffice
    g('liveGrid').querySelectorAll('.lv-bo-toggle').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId   = parseInt(btn.dataset.local);
        const isPresent = btn.dataset.present === '1';
        if (!isPresent) {
          // Déjà dans un autre backoffice ?
          const prevLocal = DB.getAgentCurrentPresenceLocal();
          if (prevLocal !== null && prevLocal !== localId) {
            const prevLabel = DB.getLocalLabel(prevLocal);
            const prevLieu  = DB.getLocalLieuName(prevLocal);
            showBureauConfirm({
              icon: '🔄', title: 'Changer de local',
              info:  `Vous êtes indiqué(e) présent(e) à <strong>${escapeHtml(prevLabel)}</strong>${prevLieu ? ` (${escapeHtml(prevLieu)})` : ''}.<br>Voulez-vous changer de local ?`,
              okLabel: 'Oui, changer', okClass: 'ok-open',
              onOk: async () => {
                await DB.setAgentPresence(prevLocal, false);
                await DB.setAgentPresence(localId, true);
              },
            });
            return;
          }
          // Bureau normal ouvert ?
          const openBureau = DB.getOpenBureauForCurrentAgent();
          if (openBureau !== null) {
            const openLabel = DB.getLocalLabel(openBureau);
            const openLieu  = DB.getLocalLieuName(openBureau);
            showBureauConfirm({
              icon: '🔄', title: 'Changer de local',
              info: `Vous êtes indiqué(e) présent(e) à <strong>${escapeHtml(openLabel)}</strong>${openLieu ? ` (${escapeHtml(openLieu)})` : ''}.<br>Voulez-vous changer de local ?`,
              okLabel: 'Oui, changer', okClass: 'ok-open',
              onOk: async () => {
                await DB.closeBureau(openBureau);
                await DB.setAgentPresence(localId, true);
              },
            });
            return;
          }
        }
        await DB.setAgentPresence(localId, !isPresent);
      });
    });

    g('liveGrid').querySelectorAll('.lv-bureau-close').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId = parseInt(btn.dataset.local);
        const label   = DB.getLocalLabel(localId);
        const now2    = new Date();
        const dayE2   = new Date(now2); dayE2.setHours(23,59,59,999);
        const next    = DB.getInRange(now2, dayE2).find(o =>
          parseInt(o.localId) === localId && !o.isPermanent && o._start > now2
        );
        let infoHtml = '';
        if (next) {
          const agt = next.agent   === 'Autre' ? next.agentCustom  : next.agent;
          const svc = DB.getSvcLabel(next);
          const hm  = next._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          const hme = next._end.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          infoHtml  = `<div class="lv-bm-res">
            <div class="lv-bm-label">Prochain agent</div>
            <div class="lv-bm-svc">${svc}</div>
            <div class="lv-bm-agt">${fmtAgent(agt)}</div>
            <div class="lv-bm-time">${hm} – ${hme}</div>
          </div>`;
        }
        showBureauConfirm({
          icon: '🔴', title: `Fermer ${label}`,
          info: infoHtml || '<div class="lv-bm-empty">Aucune suite prévue aujourd\'hui</div>',
          okLabel: 'Je pars, fermer le bureau', okClass: 'ok-close',
          onOk: async () => {
            await DB.clearBureauPause(localId); // nettoyer la pause si elle était active
            // Si un bénéficiaire préférentiel attendait ce bureau, annuler + notifier accueil
            const pref = DB.getPreferredPending(localId);
            if (pref?.requestId) {
              await DB.cancelPreferredRequest(pref.requestId, localId);
              window._notifyPreferredCancelledOnClose?.(pref, label);
            }
            await DB.closeBureau(localId);
          }
        });
      });
    });

    // ── Bouton Pause ──────────────────────────────────────────────
    g('liveGrid').querySelectorAll('.lv-pause-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const localId = parseInt(btn.dataset.local);
        openPauseModal(localId);
      });
    });

    // ── Bouton Reprendre (fin de pause) ───────────────────────────
    g('liveGrid').querySelectorAll('.lv-pause-end').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId = parseInt(btn.dataset.local);
        await DB.clearBureauPause(localId);
      });
    });

    // ── Chrono des pauses (mise à jour locale toutes les 30s) ─────
    if (this._pauseTimerInterval) clearInterval(this._pauseTimerInterval);
    const hasPause = g('liveGrid').querySelector('.lv-pause-timer');
    if (hasPause) {
      this._pauseTimerInterval = setInterval(() => {
        g('liveGrid').querySelectorAll('.lv-pause-timer').forEach(el => {
          const started = parseInt(el.dataset.started);
          const dur     = parseInt(el.dataset.dur);
          const rem     = Math.max(0, Math.round(dur - (Date.now() - started) / 60000));
          el.textContent = _fmtRemaining(rem);
        });
      }, 30000);
    }
  },

  _renderSearchMode(now, occs, q) {
    g('liveGrid').classList.add('hidden');
    g('liveAgentResult').classList.remove('hidden');

    // Tous les locaux de TOUS les lieux (y compris backoffice)
    const ql = q.toLowerCase();

    const getAgt = r => (r.agent   === 'Autre' ? r.agentCustom   : r.agent)   || '';
    const getSvc = r => DB.getSvcLabel(r) || '';

    const matchesAgent   = r => {
      const name = getAgt(r);
      const pub  = DB.getAgentPublicName(name);
      return name.toLowerCase().includes(ql) || (pub && pub !== name && pub.toLowerCase().includes(ql));
    };
    const matchesService = r => getSvc(r).toLowerCase().includes(ql);
    const match = r => matchesAgent(r) || matchesService(r);

    const now_occs    = occs.filter(r => match(r) && !r.isPermanent && r._start <= now && r._end > now);
    const future_occs = occs.filter(r => match(r) && !r.isPermanent && r._start > now)
                            .sort((a, b) => a._start - b._start);
    const perm_occs   = occs.filter(r => match(r) && r.isPermanent);
    const all = [...now_occs, ...perm_occs, ...future_occs];

    const isAgentSearch = DB.getAgentsWithKeys().some(a => {
      const pub = DB.getAgentPublicName(a.name);
      return a.name.toLowerCase().includes(ql) || (pub && pub.toLowerCase().includes(ql));
    });

    const fmt = r => {
      const agt  = getAgt(r);
      const svc  = getSvc(r);
      const loc  = DB.getLocalLabel(parseInt(r.localId));
      const roleColor = DB.getAgentRoleColor(agt);
      const cardColor = DB.getAgentColor(agt);
      if (r.isPermanent) {
        return `<div class="lv-agent-row lv-ar-perm">
          <div class="lv-ar-dot">🔒</div>
          <div class="lv-ar-info">
            <div class="lv-ar-loc">${escapeHtml(loc)}</div>
            <div class="lv-ar-svc">${escapeHtml(svc)}</div>
            <div class="lv-ar-agt" style="${roleColor ? `color:${roleColor}` : ''}">${fmtAgent(agt)}</div>
            <div class="lv-ar-time">Permanent</div>
          </div>
        </div>`;
      }
      const startH = r._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
      const endH   = r._end.toLocaleTimeString('fr-BE',   { hour: '2-digit', minute: '2-digit' });
      const isCurrent = r._start <= now && r._end > now;
      const timeLabel = isCurrent ? `<span class="lv-ar-encours">En cours</span> jusqu'à ${endH}` : `${startH} – ${endH}`;
      return `<div class="lv-agent-row ${isCurrent ? 'lv-ar-now' : 'lv-ar-future'}" style="${cardColor ? `border-left:4px solid ${cardColor}` : ''}">
        <div class="lv-ar-dot">${isCurrent ? '🟢' : '🕐'}</div>
        <div class="lv-ar-info">
          <div class="lv-ar-loc">${escapeHtml(loc)}</div>
          <div class="lv-ar-svc">${escapeHtml(svc)}</div>
          <div class="lv-ar-agt" style="${roleColor ? `color:${roleColor}` : ''}">${fmtAgent(agt)}</div>
          <div class="lv-ar-time">${timeLabel}</div>
        </div>
      </div>`;
    };

    // ── Localisation temps-réel (bureau ouvert) ────────────────────
    const today = new Date().toISOString().slice(0, 10);
    let locationHtml = '';
    if (isAgentSearch) {
      const matchedAgent = DB.getAgentsWithKeys().find(a => {
        const pub = DB.getAgentPublicName(a.name);
        return a.name.toLowerCase().includes(ql) || (pub && pub.toLowerCase().includes(ql));
      });
      if (matchedAgent) {
        // Bureau ouvert (tous les locaux)
        const _allLids = Object.values(DB.getLieux()).flatMap(l => (l.localIds || []).map(Number));
        const openLocal = _allLids.find(lid => DB.getBureauAgentKey(lid) === matchedAgent.key && DB.isBureauOpen(lid));
        if (openLocal != null) {
          const loc   = DB.getLocalLabel(openLocal);
          const svc   = DB.getBureauDeclaredService(openLocal);
          const queue = DB.getQueue(openLocal);
          const qInfo = queue > 0 ? ` — <span class="lv-ar-queue">🔴 ${queue} en attente</span>` : ' — 🟢 Disponible';
          locationHtml = `<div class="lv-agent-row lv-ar-open">
            <div class="lv-ar-dot">📍</div>
            <div class="lv-ar-info">
              <div class="lv-ar-loc">${escapeHtml(loc)}${qInfo}</div>
              ${svc ? `<div class="lv-ar-svc">${escapeHtml(svc)}</div>` : ''}
              <div class="lv-ar-time">Bureau ouvert maintenant</div>
            </div>
          </div>`;
        }
        // Présence backoffice
        if (!openLocal) {
          const allLieux2 = DB.getLieux();
          const boLocal = Object.values(allLieux2)
            .filter(l => l.isBackoffice)
            .flatMap(l => l.localIds || [])
            .find(lid => DB.getBackofficePresence(lid)[matchedAgent.key]);
          if (boLocal != null) {
            locationHtml = `<div class="lv-agent-row lv-ar-open">
              <div class="lv-ar-dot">🏢</div>
              <div class="lv-ar-info">
                <div class="lv-ar-loc">${escapeHtml(DB.getLocalLabel(boLocal))}</div>
                <div class="lv-ar-time">Présent en back-office</div>
              </div>
            </div>`;
          }
        }
        // Absence planifiée (priorité)
        const absEntry = DB.getAgentAbsenceOn(matchedAgent.key, today);
        if (absEntry) {
          const [, abs] = absEntry;
          const motifLabels = { maladie: '🤒 Maladie', conge: "🏖️ Congé", mission: '🚗 Mission extérieure', formation: '📚 Formation', autre: '📝 Absent' };
          const motifTxt = motifLabels[abs.motif] || 'Absent';
          const comment  = abs.comment ? ` — ${abs.comment}` : '';
          const endTxt   = abs.endDate !== today ? ` (jusqu'au ${abs.endDate.split('-').reverse().join('/')})` : '';
          locationHtml = `<div class="lv-agent-row lv-ar-status">
            <div class="lv-ar-dot">❌</div>
            <div class="lv-ar-info"><div class="lv-ar-loc">${motifTxt}${comment}${endTxt}</div></div>
          </div>` + locationHtml;
        } else {
          // Statut intra-journalier
          const st = DB.getAgentStatus(matchedAgent.key);
          if (st) {
            const stTxt = st.status === 'absent'
              ? "❌ Absent aujourd'hui"
              : `🚶 En route${st.arrivalTime ? ` — arrivée prévue ${st.arrivalTime}` : ''}`;
            locationHtml = `<div class="lv-agent-row lv-ar-status">
              <div class="lv-ar-dot">ℹ️</div>
              <div class="lv-ar-info"><div class="lv-ar-loc">${stTxt}</div></div>
            </div>` + locationHtml;
          }
        }
      }
    }

    if (!all.length && !locationHtml) {
      g('liveAgentResult').innerHTML = `
        <div class="lv-agent-empty">
          <div class="lv-ae-icon">🔍</div>
          <div class="lv-ae-msg">Rien trouvé pour <strong>"${escapeHtml(q)}"</strong> cette semaine.</div>
        </div>`;
      return;
    }

    const isPresent = now_occs.length > 0 || perm_occs.length > 0 || locationHtml.includes('Bureau ouvert') || locationHtml.includes('back-office');
    const statusBadge = isPresent
      ? `<span class="lv-badge lv-badge-present">✅ Présent</span>`
      : all.length
        ? `<span class="lv-badge lv-badge-later">🕐 Plus tard cette semaine</span>`
        : '';

    let titleHtml;
    const firstItem = all[0];
    if (isAgentSearch) {
      const firstAgt = firstItem ? getAgt(firstItem) : DB.getAgentsWithKeys().find(a => a.name.toLowerCase().includes(ql))?.name || q;
      const color    = DB.getAgentRoleColor(firstAgt);
      titleHtml = `<div class="lv-agent-name" style="${color ? `color:${color}` : ''}">${fmtAgent(firstAgt)}</div>`;
    } else {
      const firstSvc = firstItem ? getSvc(firstItem) : q;
      titleHtml = `<div class="lv-agent-name lv-svc-title">🗂 ${escapeHtml(firstSvc)}</div>`;
    }

    // Grouper les résultats futurs par jour avec des séparateurs
    const _dayNamesLong = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const todayItems = [...now_occs, ...perm_occs];
    const _groupedByDay = {};
    future_occs.forEach(r => {
      const ds = r._start.toISOString().slice(0, 10);
      if (!_groupedByDay[ds]) _groupedByDay[ds] = [];
      _groupedByDay[ds].push(r);
    });
    const hasFuture = Object.keys(_groupedByDay).length > 0;
    let rowsHtml = '';
    if (todayItems.length) {
      if (hasFuture) rowsHtml += `<div class="lv-day-sep">Aujourd'hui</div>`;
      rowsHtml += todayItems.map(fmt).join('');
    }
    const _todayStr = now.toISOString().slice(0, 10);
    Object.entries(_groupedByDay).forEach(([ds, items]) => {
      const _d = new Date(ds + 'T12:00:00');
      const _dayLabel = ds === _todayStr
        ? "Aujourd'hui"
        : `${_dayNamesLong[_d.getDay()]} ${_d.getDate()}/${_d.getMonth() + 1}`;
      rowsHtml += `<div class="lv-day-sep">${_dayLabel}</div>`;
      rowsHtml += items.map(fmt).join('');
    });

    g('liveAgentResult').innerHTML = `
      <div class="lv-agent-header">
        ${titleHtml}
        ${statusBadge}
      </div>
      ${locationHtml}
      <div class="lv-agent-rows">${rowsHtml}</div>`;
  },

  _renderAgentSuggestions(q) {
    const box = g('liveAgentSuggestions');
    if (!q) { box.innerHTML = ''; return; }
    const ql = q.toLowerCase();

    const agentMatches = DB.getAgentsWithKeys()
      .filter(a => {
        const pub = DB.getAgentPublicName(a.name);
        return a.name.toLowerCase().includes(ql) || (pub && pub.toLowerCase().includes(ql));
      })
      .slice(0, 4)
      .map(a => {
        const color = DB.getAgentRoleColor(a.name);
        const pub   = DB.getAgentPublicName(a.name);
        const label = pub && pub !== a.name ? `${fmtAgent(a.name)} <span class="lv-sug-pub">(${escapeHtml(pub)})</span>` : fmtAgent(a.name);
        return `<button class="lv-suggestion" data-val="${a.name}">
          <span class="lv-sug-tag lv-sug-agent">Agent</span>
          <span style="${color ? `color:${color}` : ''}">${label}</span>
        </button>`;
      });

    const svcMatches = DB.getServices()
      .filter(s => s !== 'Autre' && s.toLowerCase().includes(ql))
      .slice(0, 4)
      .map(s => `<button class="lv-suggestion" data-val="${s}">
        <span class="lv-sug-tag lv-sug-service">Service</span>
        <span>${s}</span>
      </button>`);

    box.innerHTML = [...agentMatches, ...svcMatches].slice(0, 6).join('');
    box.querySelectorAll('.lv-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        g('liveAgentSearch').value = val;
        this._agentQuery = val;
        box.innerHTML = '';
        this.render();
      });
    });
  },

  // ── Panneau files partagées ─────────────────────────────────────
  _editingGroupId: null,

  _renderQueueGroupPanel() {
    const groups    = DB.getQueueGroups();
    const allLocals = CONFIG.LOCALS;

    // Liste des groupes existants
    const listEl = g('queueGroupList');
    if (!Object.keys(groups).length) {
      listEl.innerHTML = '<div class="lv-qg-empty">Aucun groupe configuré.</div>';
    } else {
      listEl.innerHTML = Object.entries(groups).map(([id, grp]) => {
        const locNames = (grp.localIds || []).map(l => DB.getLocalLabel(l)).join(', ');
        const issued   = DB.getTicketIssued(id);
        const called   = DB.getTicketCalled(id);
        const overflow = DB.getGroupOverflowQueue(id);
        // Tickets en attente = called+1 jusqu'à issued, hors skip_
        const waitingNums = [];
        for (let n = called + 1; n <= issued; n++) {
          if (!DB.isTicketSkipped(id, n)) waitingNums.push(n);
        }
        const ticketsHtml = waitingNums.length
          ? `<div class="lv-qg-ticket-row">
               ${waitingNums.map(n => {
                 const _num  = DB.formatTicket(id, n);
                 const _name = DB.getTicketName(id, n);
                 const _lbl  = _name ? `${_num} · ${_name}` : _num;
                 return `<button class="lv-qg-ticket-badge" data-grpid="${id}" data-num="${n}" title="Retirer ce ticket">${escapeHtml(_lbl)} <span class="lv-qg-ticket-x">✕</span></button>`;
               }).join('')}
             </div>`
          : '';
        const isEditing = this._editingGroupId === id;
        return `<div class="lv-qg-item${isEditing ? ' lv-qg-item-editing' : ''}">
          <div class="lv-qg-info">
            <strong>${grp.name}</strong>
            <span class="lv-qg-locals">${locNames}</span>
          </div>
          <div class="lv-qg-actions">
            <button class="lv-qg-edit" data-id="${id}" title="Modifier">✏️</button>
            ${issued > 0 ? `<button class="lv-qg-clear" data-id="${id}" data-name="${grp.name}" title="Vider tous les tickets">🗑</button>` : ''}
            <button class="lv-qg-del" data-id="${id}" title="Supprimer">✕</button>
          </div>
          ${ticketsHtml}
        </div>`;
      }).join('');

      listEl.querySelectorAll('.lv-qg-ticket-badge').forEach(btn => {
        btn.addEventListener('click', () => {
          const grpId = btn.dataset.grpid;
          const num   = parseInt(btn.dataset.num);
          const label = DB.formatTicket(grpId, num);
          const name  = DB.getTicketName(grpId, num);
          const info  = `<div class="lv-bm-empty">Le ticket <strong>${label}</strong>${name ? ` (${escapeHtml(name)})` : ''} sera retiré de la file d'attente.</div>`;
          showBureauConfirm({
            icon: '🎫',
            title: `Retirer ${label}`,
            info,
            okLabel: 'Retirer', okClass: 'ok-close',
            onOk: async () => {
              await DB.dismissTicket(grpId, num);
              this._renderQueueGroupPanel();
            }
          });
        });
      });

      listEl.querySelectorAll('.lv-qg-clear').forEach(btn => {
        btn.addEventListener('click', () => {
          showBureauConfirm({
            icon: '🗑',
            title: `Vider la file "${btn.dataset.name}"`,
            info: '<div class="lv-bm-empty" style="color:#fbbf24">Tous les numéros de ticket seront remis à zéro.<br>À utiliser uniquement en cas de blocage.</div>',
            okLabel: 'Vider les tickets', okClass: 'ok-close',
            onOk: async () => {
              await DB.clearGroupTickets(btn.dataset.id);
              this._renderQueueGroupPanel();
            }
          });
        });
      });
      listEl.querySelectorAll('.lv-qg-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (this._editingGroupId === btn.dataset.id) this._cancelEdit();
          await DB.deleteQueueGroup(btn.dataset.id);
          this._renderQueueGroupPanel();
        });
      });

      listEl.querySelectorAll('.lv-qg-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const id  = btn.dataset.id;
          const grp = DB.getQueueGroups()[id];
          if (!grp) return;
          if (this._editingGroupId === id) { this._cancelEdit(); return; }
          this._editingGroupId = id;
          // Populate name select
          const sel = g('qgroupNameSelect');
          const customInput = g('qgroupNameCustom');
          const knownServices = DB.getServices().filter(s => s !== 'Autre');
          if (knownServices.includes(grp.name)) {
            sel.value = grp.name;
            customInput.classList.add('hidden');
          } else {
            sel.value = '__autre__';
            customInput.value = grp.name;
            customInput.classList.remove('hidden');
          }
          // Préfixe ticket
          g('qgroupPrefix').value = grp.ticketPrefix || '';
          g('qgroupPrefixPreview').textContent = grp.ticketPrefix ? `→ ${grp.ticketPrefix}01` : '';
          // Toggle local buttons
          g('qgroupLocals').querySelectorAll('.lv-qg-local-btn').forEach(b => {
            b.classList.toggle('active', (grp.localIds || []).map(Number).includes(parseInt(b.dataset.local)));
          });
          // Update form title + button
          g('qgroupFormTitle').textContent = `Modifier : ${grp.name}`;
          g('btnQgroupAdd').textContent = '💾 Enregistrer';
          g('btnQgroupCancel').classList.remove('hidden');
          this._renderQueueGroupPanel(); // refresh list to highlight editing row
        });
      });
    }

    // Boutons toggle pour sélectionner les locaux
    const localsEl = g('qgroupLocals');
    const editingGrpLocalIds = this._editingGroupId
      ? ((DB.getQueueGroups()[this._editingGroupId] || {}).localIds || []).map(Number)
      : [];
    localsEl.innerHTML = allLocals.map(l => {
      const isActive = editingGrpLocalIds.includes(Number(l));
      return `<button class="lv-qg-local-btn${isActive ? ' active' : ''}" data-local="${l}">${DB.getLocalLabel(l)}</button>`;
    }).join('');
    localsEl.querySelectorAll('.lv-qg-local-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });

    // Menu déroulant des services
    const sel = g('qgroupNameSelect');
    const services = DB.getServices().filter(s => s !== 'Autre');
    sel.innerHTML = services.map(s => `<option value="${s}">${s}</option>`).join('')
      + `<option value="__autre__">Autre…</option>`;
    // Afficher/cacher le champ custom
    const customInput = g('qgroupNameCustom');
    sel.onchange = () => {
      customInput.classList.toggle('hidden', sel.value !== '__autre__');
    };
    if (!this._editingGroupId) {
      customInput.classList.add('hidden');
      g('qgroupFormTitle').textContent = 'Nouveau groupe';
      g('btnQgroupAdd').textContent = '+ Créer';
      g('btnQgroupCancel').classList.add('hidden');
    }
  },

  _cancelEdit() {
    this._editingGroupId = null;
    g('qgroupFormTitle').textContent = 'Nouveau groupe';
    g('btnQgroupAdd').textContent = '+ Créer';
    g('btnQgroupCancel').classList.add('hidden');
    g('qgroupNameCustom').value = '';
    g('qgroupPrefix').value = '';
    g('qgroupPrefixPreview').textContent = '';
    g('qgroupLocals').querySelectorAll('.lv-qg-local-btn').forEach(b => b.classList.remove('active'));
    this._renderQueueGroupPanel();
  },

  _initQueueGroupPanel() {
    g('btnQueueGroups').addEventListener('click', () => {
      const panel = g('queueGroupPanel');
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) this._renderQueueGroupPanel();
    });

    g('btnResetAllQueues').addEventListener('click', () => {
      showBureauConfirm({
        icon: '⚠️',
        title: 'Vider tout les tickets',
        info: '<div class="lv-bm-empty" style="color:#fbbf24">Toutes les files d\'attente, tous les tickets et toutes les demandes agent spécifique en cours seront remis à zéro.<br><strong>À utiliser uniquement en cas de blocage.</strong></div>',
        okLabel: 'Tout vider', okClass: 'ok-close',
        onOk: async () => {
          await DB.resetAllQueues();
          this._renderQueueGroupPanel();
          showToast('✅ Toutes les files ont été vidées.');
        }
      });
    });

    g('btnQgroupAdd').addEventListener('click', async () => {
      const sel  = g('qgroupNameSelect');
      const name = sel.value === '__autre__'
        ? g('qgroupNameCustom').value.trim()
        : sel.value;
      if (!name) return;
      const selected = [...g('qgroupLocals').querySelectorAll('.lv-qg-local-btn.active')].map(b => parseInt(b.dataset.local));
      const prefix = g('qgroupPrefix').value.trim() || null;

      const id = this._editingGroupId || ('qg_' + Date.now());
      await DB.saveQueueGroup(id, name, selected, [], prefix);
      this._editingGroupId = null;
      g('qgroupNameCustom').value = '';
      g('qgroupPrefix').value = '';
      this._renderQueueGroupPanel();
    });

    // Preview du préfixe
    g('qgroupPrefix').addEventListener('input', () => {
      const val = g('qgroupPrefix').value.trim();
      g('qgroupPrefixPreview').textContent = val ? `→ ${val}01` : '';
    });

    g('btnQgroupCancel').addEventListener('click', () => this._cancelEdit());
  },

  _shownAlerts: new Set(),

  _checkUpcomingAlerts(occs, now) {
    const in5 = new Date(now.getTime() + 5 * 60 * 1000);
    occs.filter(o => !o.isPermanent && o._start > now && o._start <= in5).forEach(o => {
      const key = `${o.id || o._start.toISOString()}_${String(o.localId)}`;
      if (this._shownAlerts.has(key)) return;
      this._shownAlerts.add(key);
      const label   = DB.getLocalLabel(Number(o.localId));
      const agt     = o.agent   === 'Autre' ? o.agentCustom   : o.agent;
      const svc     = DB.getSvcLabel(o);
      const minLeft = Math.max(1, Math.round((o._start - now) / 60000));
      showUpcomingAlert(label, agt, svc, minLeft);
    });
  },

  _tick() {
    if (this._timer) clearInterval(this._timer);
    const update = () => {
      if (g('liveOverlay').classList.contains('hidden')) {
        clearInterval(this._timer); this._timer = null; return;
      }
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const el = g('liveClock');
      if (el) el.textContent = `${hh}:${mm}`;
      const { occs } = this._getOccs();
      this._checkUpcomingAlerts(occs, now);
      this.render();
    };
    update();
    this._timer = setInterval(update, 60000);
  }
};

// ───────────────────────────────────────────────────────────────────
// Status bar — vérificateur de disponibilité (date + heure)
// ───────────────────────────────────────────────────────────────────

function updateStatusBar() {
  const dateVal = document.getElementById('checkDate')?.value;
  const timeVal = document.getElementById('checkTime')?.value;
  const pills   = document.getElementById('localPills');
  if (!pills) return;
  if (!dateVal || !timeVal) { pills.innerHTML = '<span class="sb-hint">Choisissez une date et une heure.</span>'; return; }

  const dt   = new Date(`${dateVal}T${timeVal}`);
  const dayS = new Date(`${dateVal}T00:00:00`);
  const dayE = new Date(`${dateVal}T23:59:59`);
  const occs = DB.getInRange(dayS, dayE);

  pills.innerHTML = CONFIG.LOCALS.map(l => {
    const hasDesks = DB.localHasDesks(l);
    const desks    = hasDesks ? DB.getLocalDesks(l) : [];

    // ── Local SANS desk ──
    if (!hasDesks) {
      const perm = occs.find(r => parseInt(r.localId) === l && r.isPermanent);
      const res  = occs.find(r =>
        parseInt(r.localId) === l && !r.isPermanent && r._start <= dt && r._end > dt
      );
      const cls  = perm ? 'is-perm' : res ? 'is-booked' : 'is-free';
      const stat = perm ? '🔒 Permanent' : res ? '🔴 Réservé' : '🟢 Libre';
      return `<div class="lpill ${cls}" data-sb-nodesk="1" style="cursor:pointer">
        <div class="lp-num">${DB.getLocalLabel(l)}</div>
        <div class="lp-status">${stat}</div>
      </div>`;
    }

    // ── Local AVEC desks — carte compacte + sous-cartes desk ──
    const deskStates = desks.map((dId, idx) => {
      const perm = occs.find(r => DB.unitOccupies(r, l, dId) && r.isPermanent);
      const res  = occs.find(r => DB.unitOccupies(r, l, dId) && !r.isPermanent && r._start <= dt && r._end > dt);
      const cls  = perm ? 'lp-desk-perm' : res ? 'lp-desk-booked' : 'lp-desk-free';
      return `<span class="lp-desk ${cls}" data-sb-local="${l}" title="${DB.getDeskLabel(dId)}">${idx + 1}</span>`;
    });
    const nFree = desks.filter(dId =>
      !occs.some(r => DB.unitOccupies(r, l, dId) && (r.isPermanent || (r._start <= dt && r._end > dt)))
    ).length;
    const pillClass = nFree === 0 ? 'is-booked' : nFree === desks.length ? 'is-free' : 'is-partial';
    const statusTxt = nFree === 0 ? '🔴 Complet' : nFree === desks.length ? '🟢 Libre' : `🟠 ${nFree}/${desks.length}`;
    return `<div class="lpill-wrap">
      <div class="lpill ${pillClass}" data-sb-local="${l}">
        <div class="lp-num">${DB.getLocalLabel(l)}</div>
        <div class="lp-status">${statusTxt}</div>
      </div>
      <div class="lp-desks">${deskStates.join('')}</div>
    </div>`;
  }).join('');

  // ── Clic sur une carte desk-local → basculer le filtre desk dans le calendrier ──
  pills.querySelectorAll('[data-sb-local]').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const localId = parseInt(el.dataset.sbLocal);
      CAL._deskFilter = localId;
      CAL.setView('day');
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'day'));
    });
  });
  // ── Clic sur un local sans desk → revenir à la vue locaux ──
  pills.querySelectorAll('[data-sb-nodesk]').forEach(el => {
    el.addEventListener('click', () => {
      CAL._deskFilter = null;
      CAL.setView('day');
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'day'));
    });
  });
}

// ───────────────────────────────────────────────────────────────────
// Helpers calendrier
// ───────────────────────────────────────────────────────────────────

function getSlots() {
  const { openHour, closeHour, slotMin } = DB.getLieuConfig();
  const slots = [];
  for (let h = openHour; h < closeHour; h++) {
    for (let m = 0; m < 60; m += slotMin) {
      slots.push({ h, m, label: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` });
    }
  }
  return slots;
}

function weekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

function dayName(d) {
  return d.toLocaleDateString('fr-BE', { weekday: 'short' });
}

// ── Helpers pause ─────────────────────────────────────────────────
// Retourne les minutes restantes (null si pas de durée définie)
function _pauseRemaining(pause) {
  if (!pause || !pause.estimatedMin) return null;
  const elapsed = (Date.now() - pause.startedAt) / 60000;
  return Math.max(0, Math.round(pause.estimatedMin - elapsed));
}
function _fmtRemaining(min) {
  if (min === 0) return 'Retour imminent';
  return `Retour dans ${min} min`;
}

function availColor(free, total) {
  if (free >= total)                   return '#bbf7d0';
  if (free >= Math.ceil(total * 0.7))  return '#86efac';
  if (free >= Math.ceil(total * 0.4))  return '#fde68a';
  if (free > 0)                        return '#fdba74';
  return '#fca5a5';
}
