// ═══════════════════════════════════════════════════════════════════
// calendar.js — Vues jour / semaine / mois
// ═══════════════════════════════════════════════════════════════════

const CAL = {
  view: 'day',
  date: new Date(),

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
  // VUE JOUR — table avec fusion des créneaux identiques (rowspan)
  // ─────────────────────────────────────────────────────────────────
  _renderDay(el) {
    const d     = this.date;
    const { openHour, closeHour, slotMin: slotMinDay } = DB.getLieuConfig();
    const dS    = new Date(d); dS.setHours(openHour,  0, 0, 0);
    const dE    = new Date(d); dE.setHours(closeHour, 0, 0, 0);
    const occs  = DB.getInRange(dS, dE);
    const slots = getSlots();
    const total = slots.length;

    // coveredUntil[l] = index du premier slot NON couvert pour le local l
    const coveredUntil = {};
    CONFIG.LOCALS.forEach(l => coveredUntil[l] = 0);

    const dateLabel = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const isToday   = sameDay(d, new Date());

    const holidayName = isBelgianHoliday(isoDate(d)) ? getHolidayName(isoDate(d)) : '';
    let h = `<div class="cv-day-datebar${isToday ? ' is-today' : ''}">
      ${dateLabel}
      ${holidayName ? `<span class="cv-holiday-badge">🇧🇪 ${holidayName}</span>` : ''}
    </div>`;
    h += '<table class="cv-day-table"><thead><tr>';
    h += '<th class="tc-hd"></th>';
    CONFIG.LOCALS.forEach(l => h += `<th class="loc-hd">${DB.getLocalLabel(l)}</th>`);
    h += '</tr></thead><tbody>';

    slots.forEach((slot, i) => {
      const sS = new Date(d); sS.setHours(slot.h, slot.m, 0, 0);
      const sE = new Date(sS.getTime() + slotMinDay * 60000);

      h += `<tr class="cv-row${i % 2 ? ' alt' : ''}" data-slot="${i}">`;
      h += `<td class="tc">${slot.label}</td>`;

      CONFIG.LOCALS.forEach(l => {
        // Cette cellule est couverte par un rowspan précédent → on l'ignore
        if (coveredUntil[l] > i) return;

        const perm = occs.find(r => parseInt(r.localId) === l && r.isPermanent);
        const res  = occs.find(r =>
          parseInt(r.localId) === l && !r.isPermanent && r._start < sE && r._end > sS
        );

        if (perm) {
          // Permanent → couvre tous les créneaux restants
          const span = total - i;
          coveredUntil[l] = total;
          const svc = perm.service === 'Autre' ? perm.serviceCustom : perm.service;
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
          coveredUntil[l] = i + span;

          const svc   = res.service === 'Autre' ? res.serviceCustom : res.service;
          const agt   = res.agent   === 'Autre' ? res.agentCustom  : res.agent;
          const agtFmt = fmtAgent(agt);
          const recType = res.recurrence?.type;
          const isRec   = recType && recType !== 'none';
          const recLabels = { daily: 'Quotidien', weekly: 'Hebdomadaire', monthly: 'Mensuel' };
          const recLabel  = isRec ? recLabels[recType] || '' : '';
          const startH = res._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          const endH   = res._end.toLocaleTimeString('fr-BE',   { hour: '2-digit', minute: '2-digit' });
          const agentColor = DB.getAgentColor(agt);
          const colorStyle = agentColor ? ` style="background:${agentColor}20;border-left:3px solid ${agentColor}"` : '';
          const comment = res.comment ? res.comment.trim() : '';
          const myKey   = sessionStorage.getItem('cpas_current_agent_key');
          const isInvited = myKey && res.invitedAgents?.[myKey];
          const invitedNames = res.invitedAgents
            ? Object.keys(res.invitedAgents).map(k => DB.getAgentsWithKeys().find(a => a.key === k)?.name || k).join(', ')
            : '';
          h += `<td class="cv-cell is-booked${isRec ? ' is-rec' : ''}${isInvited ? ' is-invited' : ''}" rowspan="${span}"
            data-id="${res.id}" data-occ="${res._occDate || ''}" data-act="detail"
            data-slot="${i}" data-local="${l}" data-span="${span}" data-occ-date="${isoDate(res._start)}"
            ${colorStyle}>
            <span class="ct ct-drag" draggable="true"
              data-id="${res.id}" data-slot="${i}" data-local="${l}" data-span="${span}"
              data-occ-date="${isoDate(res._start)}" data-is-rec="${isRec ? '1' : '0'}">
              <b>${svc}</b><br>
              <small>${agtFmt}</small><br>
              <small class="ct-time">${startH} – ${endH}${isRec ? ` ↻ ${recLabel}` : ''}</small>
              ${comment ? `<small class="ct-comment" title="${escapeHtml(comment)}">💬 ${escapeHtml(comment)}</small>` : ''}
              ${invitedNames ? `<small class="ct-invited" title="Agents invités : ${escapeHtml(invitedNames)}">👥 ${escapeHtml(invitedNames)}</small>` : ''}
            </span>
          </td>`;

        } else {
          h += `<td class="cv-cell is-free" data-local="${l}" data-date="${isoDate(d)}" data-time="${slot.label}" data-slot="${i}" data-act="new"></td>`;
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
  // VUE SEMAINE
  // ─────────────────────────────────────────────────────────────────
  _renderWeek(el) {
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
      h += `<div class="wkd-hd${isTd ? ' is-today' : ''}" data-date="${isoDate(day)}" data-act="go-day">
        <div class="wkd-name">${dayName(day)}</div>
        <div class="wkd-num${isTd ? ' num-today' : ''}">${day.getDate()}</div>
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

        const localsSet = new Set(CONFIG.LOCALS.map(Number));
        const booked = new Set();
        occs.forEach(r => {
          if (!localsSet.has(parseInt(r.localId))) return;
          if (r.isPermanent) { booked.add(r.localId); return; }
          if (r._start && sameDay(r._start, day) && r._start < sE && r._end > sS) booked.add(r.localId);
        });

        const total = CONFIG.LOCALS.length;
        const free  = total - booked.size;
        const color = availColor(free, total);

        h += `<div class="wk-cell${isTd ? ' is-today' : ''}" style="background:${color}"
          data-date="${isoDate(day)}" data-time="${slot.label}" data-act="new-week"
          title="${free}/${total} locaux libres — ${slot.label}">
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

        let free = CONFIG.LOCALS.length;
        if (inMonth) {
          const localsSet = new Set(CONFIG.LOCALS.map(Number));
          const booked = new Set();
          occs.forEach(r => {
            const lid = parseInt(r.localId);
            if (!localsSet.has(lid)) return;
            if (r.isPermanent) { booked.add(lid); return; }
            if (r._start && sameDay(r._start, cursor)) booked.add(lid);
          });
          free = Math.max(0, CONFIG.LOCALS.length - booked.size);
        }

        const color = inMonth ? availColor(free, CONFIG.LOCALS.length) : 'transparent';

        const isHoliday = inMonth && isBelgianHoliday(isoDate(cursor));
        h += `<div class="mo-cell${!inMonth ? ' other' : ''}${isTd ? ' is-today' : ''}${isHoliday ? ' is-holiday' : ''}"
          data-date="${isoDate(cursor)}" data-act="go-day" ${isHoliday ? `title="${getHolidayName(isoDate(cursor))}"` : ''}>
          <div class="mo-num${isTd ? ' num-today' : ''}">${cursor.getDate()}${isHoliday ? ' 🇧🇪' : ''}</div>
          ${inMonth ? `<div class="mo-bar" style="background:${color}">${free}/${CONFIG.LOCALS.length}</div>` : ''}
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
      return { slot: parseInt(row.dataset.slot), local: td.dataset.local };
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
        const cell = row?.querySelector(`.cv-cell.is-free[data-local="${hit.local}"]`);
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
      const dateStr     = isoDate(d);
      const hh = slotInfo.h, mm = slotInfo.m;
      const newStart    = new Date(`${dateStr}T${pad(hh)}:${pad(mm)}:00`);
      const newEnd      = new Date(newStart.getTime() + dnd.durMs);
      const newStartISO = `${dateStr}T${pad(hh)}:${pad(mm)}`;
      const newEndISO   = `${isoDate(newEnd)}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`;

      // Vérification des conflits
      const conflicts = DB.getInRange(newStart, newEnd)
        .filter(r => parseInt(r.localId) === newLocalId && r.id !== dnd.resId);
      if (conflicts.length) {
        showToast('⚠ Conflit : créneau déjà occupé pour ce local.');
        return;
      }

      try {
        if (dnd.isRec) {
          const fromDate = new Date(dnd.occDate + 'T00:00:00')
            .toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const ok = confirm(
            `Réservation récurrente.\n\nOK = déplacer seulement l'occurrence du ${fromDate}\nAnnuler = ne rien faire`
          );
          if (!ok) return;
          await DB.moveOccurrence(dnd.resId, dnd.occDate, newLocalId, newStartISO, newEndISO);
        } else {
          await DB.moveReservation(dnd.resId, newLocalId, newStartISO, newEndISO);
        }
        showToast('Réservation déplacée ✓');
      } catch (err) {
        showToast('Erreur : ' + err.message);
      }
    });
  },

  _bind(el) {
    el.querySelectorAll('[data-act]').forEach(cell => {
      cell.addEventListener('click', () => {
        if (this._justDragged) { this._justDragged = false; return; }
        const act = cell.dataset.act;
        if (act === 'detail') {
          MODAL.openDetail(cell.dataset.id, cell.dataset.occ || '');
        } else if (act === 'new') {
          MODAL.openNew({ local: parseInt(cell.dataset.local), date: cell.dataset.date, time: cell.dataset.time });
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
    const svc      = occ ? (occ.service === 'Autre' ? occ.serviceCustom : occ.service) : '';
    const agent    = occ ? (occ.agent   === 'Autre' ? occ.agentCustom  : occ.agent)   : null;
    const pubAgent = agent ? DB.getAgentPublicName(agent) : null;
    this._lastCalled[localId] = { ticket, ticketLabel, ticketName, svc, pubAgent, localLabel: DB.getLocalLabel(localId), time: new Date() };
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
    // Peupler avec les locaux du lieu courant
    CONFIG.LOCALS.forEach(l => {
      const opt = document.createElement('option');
      opt.value = `bureau_${l}`;
      opt.textContent = `🏢 Bureau — ${DB.getLocalLabel(l)}`;
      sel.appendChild(opt);
    });
    // Restaurer la valeur sauvegardée
    const saved = this.getRole();
    if ([...sel.options].some(o => o.value === saved)) sel.value = saved;
    else sel.value = 'accueil';

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

    this._applyRoleUI();
  },

  _showAllBureaux: false,
  _hiddenLieux: new Set(),

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

    // Barre de présence — absences du jour + statuts intra-journaliers
    const today   = new Date().toISOString().slice(0, 10);
    const badges  = [];
    DB.getAgentsWithKeys().forEach(({ key, name }) => {
      const color = DB.getAgentRoleColor(name);
      const style = color ? `border-color:${color}` : '';
      // Absence planifiée (priorité sur statut journalier)
      const absEntry = DB.getAgentAbsenceOn(key, today);
      if (absEntry) {
        const [, abs] = absEntry;
        const motifLabels = { maladie: 'Maladie', conge: 'Congé', mission: 'Mission', formation: 'Formation', autre: 'Absent' };
        const motifTxt = motifLabels[abs.motif] || 'Absent';
        const comment  = abs.comment ? ` — ${abs.comment}` : '';
        badges.push(`<span class="lv-pres-badge lv-pres-absent" style="${style}" title="${abs.motif}">❌ ${fmtAgent(name)} — ${motifTxt}${comment}</span>`);
        return;
      }
      const st = DB.getAgentStatus(key);
      const connected = DB.isConnectedToday(key);
      // Statut intra-journalier (retard, absent ponctuel)
      if (st?.status === 'absent') {
        badges.push(`<span class="lv-pres-badge lv-pres-absent" style="${style}">❌ ${fmtAgent(name)} — Absent</span>`);
      } else if (st?.status === 'done') {
        badges.push(`<span class="lv-pres-badge lv-pres-done" style="${style}">🏁 ${fmtAgent(name)} — Parti</span>`);
      } else if (st?.status === 'late') {
        badges.push(`<span class="lv-pres-badge lv-pres-late" style="${style}">🚶 ${fmtAgent(name)}${st.arrivalTime ? ` — arrivée ${st.arrivalTime}` : " — J'arrive !"}</span>`);
      } else if (connected) {
        badges.push(`<span class="lv-pres-badge lv-pres-present" style="${style}">✅ ${fmtAgent(name)}</span>`);
      } else {
        badges.push(`<span class="lv-pres-badge lv-pres-notyet" style="${style}">⏳ ${fmtAgent(name)}</span>`);
      }
    });
    const presBar = g('livePresenceBar');
    if (badges.length) {
      presBar.innerHTML = badges.join('');
      presBar.style.display = '';
    } else {
      presBar.innerHTML = '';
      presBar.style.display = 'none';
    }

    const q = this._agentQuery.toLowerCase().trim();

    if (q) {
      this._renderSearchMode(now, occs, q);
    } else {
      this._renderGridMode(now, occs);
    }
  },

  _renderGridMode(now, occs) {
    g('liveAgentResult').classList.add('hidden');
    g('liveGrid').classList.remove('hidden');

    const role      = this.getRole();
    const isAccueil = role === 'accueil';
    const bureauLocal = isAccueil ? null : parseInt(role.replace('bureau_', ''));

    // ── Cartes de groupe (accueil uniquement) ─────────────────────
    const groups = DB.getQueueGroups();
    const groupCards = Object.entries(groups).map(([grpId, grp]) => {
      const lids = (grp.localIds || []).map(Number);
      if (!lids.length) return ''; // groupe sans locaux → masqué
      const activeLids = lids.filter(l => DB.isBureauOpen(l));
      const hasOpen    = activeLids.length > 0;
      const occupied   = activeLids.filter(l => DB.getQueue(l) >= 1).length;
      const overflow   = DB.getGroupOverflowQueue(grpId);
      const total      = activeLids.length;
      const allFull    = hasOpen && occupied >= total;
      const statusTxt  = !hasOpen
        ? '⚪ Aucun bureau ouvert'
        : occupied === 0
          ? '🟢 Disponible'
          : allFull
            ? `🔴 Complet (${occupied}/${total})`
            : `🟡 En cours (${occupied}/${total})`;
      const overflowTxt = overflow > 0
        ? `<div class="lv-grp-overflow">⏳ ${overflow} en attente</div>` : '';
      const dotsHtml = hasOpen
        ? `<div class="lv-grp-locals">${activeLids.map(l => {
            const busy = DB.getQueue(l) >= 1;
            return `<span class="lv-grp-dot${busy ? ' busy' : ''}" title="${DB.getLocalLabel(l)}"></span>`;
          }).join('')}</div>` : '';
      const lastEmitted  = this._lastEmittedByGrp[grpId];
      const reprintBtn   = DB.getFeature('enableTicketPrint') && lastEmitted
        ? `<button class="lv-grp-reprint" data-grp="${grpId}" title="Réimprimer le dernier ticket émis">🖨 Réimprimer ${escapeHtml(lastEmitted.display)}</button>`
        : '';
      return `<div class="lv-card lv-grp-card${!hasOpen ? ' lv-grp-closed' : ''}">
        <div class="lv-grp-title">🔗 ${grp.name}</div>
        <div class="lv-grp-status">${statusTxt}</div>
        ${overflowTxt}
        ${dotsHtml}
        <button class="lv-grp-add" data-grp="${grpId}"${!hasOpen ? ' disabled title="Aucun bureau ouvert dans ce groupe"' : ''}>+ Envoyer un bénéficiaire</button>
        ${reprintBtn}
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
      const grp      = DB.getLocalGroup(l);
      const labelHtml = (pubLabel !== label ? `${label}<span class="lv-pub-label">${pubLabel}</span>` : label)
        + (grp ? `<span class="lv-qg-badge">🔗 ${grp.name}</span>` : '');

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
      const queue       = DB.getQueue(l);
      const isBusyLocal = queue >= 1;
      const isOpen      = DB.isBureauOpen(l);
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
          const svc = o.service === 'Autre' ? o.serviceCustom : o.service;
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
      const pauseBtn  = isOpen && !isAccueil
        ? `<button class="lv-pause-btn" data-local="${l}">⏸ Pause</button>`
        : '';

      const printBtnHtml = DB.getFeature('enableTicketPrint') && this._lastCalled[l]?.ticket
        ? `<button class="lv-print-btn" data-local="${l}" title="Réimprimer ticket ${this._lastCalled[l].ticket}">🖨 Réimprimer ${this._lastCalled[l].ticket}</button>`
        : '';

      if (grp) {
        const overflow    = DB.getGroupOverflowQueue(grp.id);
        const optedOut    = DB.getBureauOptedOut(l);
        const callNextBtn = queue === 0 && overflow > 0
          ? `<button class="lv-q-next${isAccueil ? ' lv-q-next-accueil' : ''}" data-local="${l}" data-grp="${grp.id}">${isAccueil ? '⚠️ Ticket coincé ?' : '🔔 Appeler le suivant'}</button>`
          : '';
        const fermerLabel = isAccueil ? '🔴 Forcer fermeture' : '🔴 Je pars, fermer le bureau';
        const fermerBtn   = `<button class="lv-bureau-close${isAccueil ? ' lv-bureau-force' : ''}" data-local="${l}">${fermerLabel}</button>`;
        // Bouton "Se retirer / Rejoindre" : visible uniquement pour les agents bureau (pas accueil)
        const leaveBtn = !isAccueil
          ? `<button class="lv-q-leave${optedOut ? ' lv-q-rejoindre' : ''}" data-local="${l}" data-opted="${optedOut ? '1' : '0'}" title="${optedOut ? 'Rejoindre la file partagée' : 'Ne plus recevoir de tickets de la file partagée'}">
               ${optedOut ? '🔄 Rejoindre' : '🚪 Se retirer'}
             </button>`
          : '';
        // Bénéficiaire en cours (queue = 0 → dernier appelé)
        const lastCallOngoing = !isAccueil && queue === 0 ? this._lastCalled[l] : null;
        const lastCallAny     = !isAccueil ? this._lastCalled[l] : null;
        const dismissBtn = lastCallOngoing
          ? `<button class="lv-q-done" data-local="${l}" title="Marquer le bénéficiaire comme parti">✅ Bénéficiaire parti</button>`
          : '';
        const infoHint  = lastCallOngoing
          ? `<div class="lv-current-beneficiary">🟡 En cours — ${lastCallOngoing.ticket ? `<strong>n°${escapeHtml(lastCallOngoing.ticket)}</strong>` : 'ticket en cours'}${lastCallOngoing.svc ? ` · ${escapeHtml(lastCallOngoing.svc)}` : ''}${dismissBtn}</div>`
          : '';
        const grpHint = !isAccueil
          ? `<div class="lv-queue-group-hint">🔗 ${escapeHtml(grp.name)}${optedOut ? ' · <em>retiré</em>' : ''}</div>${infoHint}`
          : '';
        // Rappel disponible dès qu'un ticket a été appelé, même si quelqu'un est en salle
        const recallBtn = lastCallAny
          ? `<button class="lv-q-recall" data-local="${l}" title="Relancer la notification publique pour ${lastCallAny.ticket || 'le dernier ticket'}">📢 Rappeler ${lastCallAny.ticket ? `n°${escapeHtml(lastCallAny.ticket)}` : 'le dernier'}</button>`
          : '';
        // Bouton "Recevoir X" si une personne attend spécifiquement cet agent (côté agent)
        const preferred = !isAccueil ? DB.getPreferredPending(l) : null;
        const preferredBtn = preferred
          ? `<button class="lv-pref-receive" data-local="${l}" data-req="${preferred.requestId}" data-name="${escapeHtml(preferred.displayName || '?')}">📥 Recevoir ${escapeHtml(preferred.displayName || '?')} qui ne souhaite voir que moi</button>`
          : '';
        // Rappel preferred côté accueil (rappeler l'annonce publique)
        const pendingForAccueil = isAccueil ? DB.getPreferredPending(l) : null;
        const preferredRecallBtn = pendingForAccueil
          ? `<button class="lv-pref-recall" data-local="${l}" data-name="${escapeHtml(pendingForAccueil.displayName || '?')}" data-agent="${escapeHtml(pendingForAccueil.agentPublicName || '')}">📢 Rappeler ${escapeHtml(pendingForAccueil.displayName || '?')}</button>`
          : '';
        queueHtml = `<div class="lv-queue lv-queue-agent${optedOut ? ' lv-queue-opted-out' : ''}">
          ${grpHint}
          ${preferredBtn}
          ${preferredRecallBtn}
          ${queue > 0 ? `<button class="lv-q-avail" data-local="${l}" data-delta="-1">✅ Je suis disponible</button>` : ''}
          ${recallBtn}
          ${callNextBtn}
          <div class="lv-queue-actions">${leaveBtn}${printBtnHtml}${pauseBtn}${fermerBtn}</div>
        </div>`;
      } else {
        const fermerLabel = isAccueil ? '🔴 Forcer fermeture' : '🔴 Je pars, fermer le bureau';
        const fermerBtn   = `<button class="lv-bureau-close${isAccueil ? ' lv-bureau-force' : ''}" data-local="${l}">${fermerLabel}</button>`;
        const noQueueWarn = !isAccueil && isOpen && l === currentAgentOpenLocal
          ? `<div class="lv-no-queue-warn">⚠️ Tu n'es pas lié à une file d'attente — préviens l'agent d'accueil pour qu'il t'envoie des bénéficiaires.</div>`
          : '';
        queueHtml = `<div class="lv-queue lv-queue-agent">
          ${noQueueWarn}
          ${queue > 0 ? `<button class="lv-q-avail" data-local="${l}" data-delta="-1">✅ Je suis disponible</button>` : ''}
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

      if (perm) {
        const svc           = perm.service === 'Autre' ? perm.serviceCustom : perm.service;
        const agt           = perm.agent   === 'Autre' ? perm.agentCustom  : perm.agent;
        const agtRoleColor  = DB.getAgentRoleColor(agt);
        const permCls       = isOpen ? 'lv-perm' : 'lv-closed';
        const permStatus    = isOpen ? '🔒 Permanent' : '⚫ Fermé';
        return `<div class="lv-card ${permCls}">
          <div class="lv-num">${labelHtml}</div>
          <div class="lv-status">${permStatus}</div>
          <div class="lv-svc">${svc}</div>
          <div class="lv-agt" style="${agtRoleColor ? `color:${agtRoleColor}` : ''}">${fmtAgent(agt)}</div>
          ${queueHtml}
        </div>`;
      }
      if (res) {
        const svc           = res.service === 'Autre' ? res.serviceCustom : res.service;
        const agt           = res.agent   === 'Autre' ? res.agentCustom  : res.agent;
        const endH          = res._end.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
        const agentCardColor = DB.getAgentColor(agt);     // couleur de carte (paramétrable)
        const agtRoleColor   = DB.getAgentRoleColor(agt); // couleur du pseudo (rôle)
        if (!isOpen) {
          return `<div class="lv-card lv-closed" style="${agentCardColor ? `border-top:6px solid ${agentCardColor}` : ''}">
            <div class="lv-num">${labelHtml}</div>
            <div class="lv-status">⚫ Fermé</div>
            <div class="lv-svc">${svc}</div>
            <div class="lv-agt" style="${agtRoleColor ? `color:${agtRoleColor}` : ''}">${fmtAgent(agt)}</div>
            <div class="lv-until">Jusqu'à ${endH}</div>
            ${queueHtml}
          </div>`;
        }
        const cardCls   = isBusyLocal ? 'lv-busy' : 'lv-free';
        const statusTxt = isBusyLocal ? '🔴 Occupé' : '🟢 Disponible';
        return `<div class="lv-card ${cardCls}" style="${agentCardColor ? `border-top:6px solid ${agentCardColor}` : ''}">
          <div class="lv-num">${labelHtml}</div>
          <div class="lv-status">${statusTxt}</div>
          <div class="lv-svc">${svc}</div>
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
          const myAgentKey = sessionStorage.getItem('cpas_current_agent_key');
          const amIHere    = !isAccueil && DB.getBureauAgentKey(l) === myAgentKey && myAgentKey;
          return `<div class="lv-card lv-free">
            <div class="lv-num">${labelHtml}</div>
            <div class="lv-status">🟢 Bureau ouvert</div>
            ${agentDisp ? `<div class="lv-agt">${escapeHtml(agentDisp)}</div>` : ''}
            ${declSvc
              ? `<div class="lv-svc">${escapeHtml(declSvc)}</div>`
              : '<div class="lv-svc lv-muted lv-no-svc">Aucun service déclaré</div>'}
            ${amIHere ? `<button class="lv-declare-svc" data-local="${l}">📢 ${declSvc ? 'Changer de service' : 'Déclarer pour un service'}</button>` : ''}
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
      .filter(([lieuId, lieu]) => !lieu.isBackoffice && !this._hiddenLieux.has(lieuId))
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
      const preferredCard = `<div class="lv-card lv-preferred-standalone">
        <div class="lv-preferred-standalone-title">👤 Demande agent spécifique</div>
        <div class="lv-preferred-standalone-desc">Un bénéficiaire souhaite être reçu par un agent en particulier.</div>
        <button class="lv-grp-preferred" id="lvPreferredBtn">Ne veut voir qu'un agent</button>
      </div>`;
      g('liveGrid').innerHTML = groupCards + preferredCard + bureauHtml;
    } else {
      // Mode bureau : n'afficher que la carte du local sélectionné
      g('liveGrid').innerHTML = renderCard(bureauLocal);
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
          benefName = (window.prompt('Nom du bénéficiaire (optionnel — Entrée pour ignorer) :') || '').trim() || null;
        }
        const routed = await DB.routeGroupQueue(grpId);
        const { label: ticket, resolvedName } = await DB.issueTicket(grpId, benefName);
        // Mémoriser le dernier ticket émis pour ce groupe (bouton reprint accueil)
        LIVE._lastEmittedByGrp[grpId] = { display: resolvedName || ticket, label: ticket, name: resolvedName || null };
        // Impression du ticket côté accueil au moment de l'envoi
        if (DB.getFeature('enableTicketPrint')) {
          const _grpPrint   = DB.getQueueGroups()[grpId];
          const _localLabel = routed ? DB.getLocalLabel(routed.localId) : (_grpPrint?.name || '');
          LIVE._doPrintTicket({ ticket: resolvedName || ticket, svc: _grpPrint?.name || '', localLabel: _localLabel });
        }
        // Informer l'agent si le prénom a été désambiguïsé (homonyme dans la même file)
        if (resolvedName && benefName && resolvedName !== benefName) {
          showToast(`Homonyme détecté — ce bénéficiaire sera appelé « ${resolvedName} » 👥`);
        }
        if (routed) {
          const _calledTicket = await DB.callNextTicket(grpId);
          showRoutingToast(routed.label, _calledTicket.display);
          const _grpObj = DB.getQueueGroups()[grpId];
          const _now2 = new Date();
          const _dayS2 = new Date(_now2); _dayS2.setHours(0,0,0,0);
          const _dayE2 = new Date(_now2); _dayE2.setHours(23,59,59,999);
          const _occ2 = DB.getInRange(_dayS2, _dayE2).find(o =>
            Number(o.localId) === routed.localId && o._start <= _now2 && (o._end === null || o._end >= _now2)
          );
          const _pubAgent2 = DB.getBureauAgentDisplayName(routed.localId);
          await DB.writeLastCall(routed.localId, _pubAgent2, _grpObj?.name || null, _calledTicket.display, _calledTicket.label, _calledTicket.name);
          LIVE._storeCall(routed.localId, _calledTicket, _occ2);
        } else {
          await DB.incrementGroupOverflow(grpId);
          const overflow = DB.getGroupOverflowQueue(grpId);
          showWaitBanner(overflow, ticket);
        }
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
          await DB.closePreferredRequest(reqId, localId);
          // Libérer la réservation (queue-1 posée à l'envoi)
          await DB.setQueue(localId, Math.max(0, DB.getQueue(localId) - 1));
          await DB.writeLastCall(localId, pubAgent, grp?.name || null, dispName);
          LIVE._storeCall(localId, dispName, occ2);
          showToast(`✅ ${dispName} reçu.`);
        };
        if (queue > 0) {
          // D'autres personnes attendent — demander si bypass
          window._openPreferredBypassModal?.(reqId, localId, dispName, doReceive);
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

        if (delta === -1 && grp) {
          // Agent libère son bureau : absorber l'overflow ou vraiment libérer
          const absorbed = await DB.absorbGroupOverflow(grp.id);
          if (!absorbed) {
            await DB.setQueue(localId, 0);
          } else {
            const _now = new Date();
            const _dayS = new Date(_now); _dayS.setHours(0,0,0,0);
            const _dayE = new Date(_now); _dayE.setHours(23,59,59,999);
            const _occ = DB.getInRange(_dayS, _dayE).find(o =>
              Number(o.localId) === localId && o._start <= _now && (o._end === null || o._end >= _now)
            );
            const _pubAgent = DB.getBureauAgentDisplayName(localId);
            const _ticket   = await DB.callNextTicket(grp.id);
            showAgentCallNotif(_ticket.label, _ticket.name);
            await DB.writeLastCall(localId, _pubAgent, grp?.name || null, _ticket.display, _ticket.label, _ticket.name);
            LIVE._storeCall(localId, _ticket, _occ);
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
          await DB.setQueue(localId, 1);
          await DB.absorbGroupOverflow(grpId);
          const _now  = new Date();
          const _dayS = new Date(_now); _dayS.setHours(0,0,0,0);
          const _dayE = new Date(_now); _dayE.setHours(23,59,59,999);
          const _occ  = DB.getInRange(_dayS, _dayE).find(o =>
            Number(o.localId) === localId && o._start <= _now && (o._end === null || o._end >= _now)
          );
          const _pubAgent = _occ?.agent ? DB.getAgentPublicName(_occ.agent) : null;
          const _grp      = DB.getQueueGroups()[grpId];
          const _ticket   = await DB.callNextTicket(grpId);
          showAgentCallNotif(_ticket.label, _ticket.name);
          await DB.writeLastCall(localId, _pubAgent, _grp?.name || null, _ticket.display, _ticket.label, _ticket.name);
          LIVE._storeCall(localId, _ticket, _occ);
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
          const svc = res.service === 'Autre' ? res.serviceCustom : res.service;
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
                const _svcOpen = res.service === 'Autre' ? res.serviceCustom : res.service;
                if (!DB.serviceMatchesGroup(_svcOpen, _grpCheck)) {
                  _notifMsg += ` ⚠️ Service "${_svcOpen}" ne correspond pas au groupe "${_grpCheck.name}".`;
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
        // Ré-annoncer sur l'écran public
        const grp = DB.getLocalGroup(localId);
        await DB.writeLastCall(localId, d.pubAgent ?? null, grp?.name ?? null, d.ticket);
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

    // Bouton "Bénéficiaire parti" — efface le dernier ticket en cours
    g('liveGrid').querySelectorAll('.lv-q-done').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const localId = parseInt(btn.dataset.local);
        delete this._lastCalled[localId];
        this._renderGridMode();
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
          const svc = next.service === 'Autre' ? next.serviceCustom : next.service;
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

    // Tous les locaux non-backoffice de tous les lieux
    const allLieux   = DB.getLieux();
    const allLocals  = new Set(
      Object.values(allLieux)
        .filter(l => !l.isBackoffice)
        .flatMap(l => (l.localIds || []).map(Number))
    );
    const ql = q.toLowerCase();

    const getAgt = r => (r.agent   === 'Autre' ? r.agentCustom   : r.agent)   || '';
    const getSvc = r => (r.service === 'Autre' ? r.serviceCustom : r.service)  || '';

    const matchesAgent   = r => {
      const name = getAgt(r);
      const pub  = DB.getAgentPublicName(name);
      return name.toLowerCase().includes(ql) || (pub && pub !== name && pub.toLowerCase().includes(ql));
    };
    const matchesService = r => getSvc(r).toLowerCase().includes(ql);
    const match = r => (matchesAgent(r) || matchesService(r)) && allLocals.has(parseInt(r.localId));

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
      return `<div class="lv-agent-row ${isCurrent ? 'lv-ar-now' : 'lv-ar-future'}" style="${cardColor ? `border-left:4px solid ${cardColor}` : ''}">
        <div class="lv-ar-dot">${isCurrent ? '🟢' : '🕐'}</div>
        <div class="lv-ar-info">
          <div class="lv-ar-loc">${escapeHtml(loc)}</div>
          <div class="lv-ar-svc">${escapeHtml(svc)}</div>
          <div class="lv-ar-agt" style="${roleColor ? `color:${roleColor}` : ''}">${fmtAgent(agt)}</div>
          <div class="lv-ar-time">${startH} – ${endH}</div>
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
        // Bureau ouvert (locaux publics)
        const openLocal = [...allLocals].find(lid => DB.getBureauAgentKey(lid) === matchedAgent.key && DB.isBureauOpen(lid));
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
          <div class="lv-ae-msg">Rien trouvé pour <strong>"${escapeHtml(q)}"</strong> aujourd'hui.</div>
        </div>`;
      return;
    }

    const isPresent = now_occs.length > 0 || perm_occs.length > 0 || locationHtml.includes('Bureau ouvert') || locationHtml.includes('back-office');
    const statusBadge = isPresent
      ? `<span class="lv-badge lv-badge-present">✅ Présent</span>`
      : all.length
        ? `<span class="lv-badge lv-badge-later">🕐 Prévu plus tard</span>`
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

    g('liveAgentResult').innerHTML = `
      <div class="lv-agent-header">
        ${titleHtml}
        ${statusBadge}
      </div>
      ${locationHtml}
      <div class="lv-agent-rows">${all.map(fmt).join('')}</div>`;
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
        // Tickets en attente = called+1 jusqu'à issued
        const waitingNums = [];
        for (let n = called + 1; n <= issued; n++) waitingNums.push(n);
        const ticketsHtml = waitingNums.length
          ? `<div class="lv-qg-ticket-row">
               ${waitingNums.map(n =>
                 `<button class="lv-qg-ticket-badge" data-grpid="${id}" data-num="${n}" title="Retirer ce ticket">${DB.formatTicketDisplay(id, n)} <span class="lv-qg-ticket-x">✕</span></button>`
               ).join('')}
             </div>`
          : '';
        return `<div class="lv-qg-item">
          <div class="lv-qg-info">
            <strong>${grp.name}</strong>
            <span class="lv-qg-locals">${locNames}</span>
          </div>
          <div class="lv-qg-actions">
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
          const grp   = DB.getQueueGroups()[grpId];
          const called = DB.getTicketCalled(grpId);
          const skipped = num - called;
          const info = skipped > 1
            ? `<div class="lv-bm-empty" style="color:#fbbf24">Les tickets ${DB.formatTicket(grpId, called + 1)} à ${label} seront retirés (${skipped} tickets).</div>`
            : `<div class="lv-bm-empty">Le ticket <strong>${label}</strong> sera retiré de la file d'attente.</div>`;
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
          await DB.deleteQueueGroup(btn.dataset.id);
          this._renderQueueGroupPanel();
        });
      });
    }

    // Cases à cocher pour nouveau groupe
    const localsEl = g('qgroupLocals');
    localsEl.innerHTML = allLocals.map(l =>
      `<label class="lv-qg-check">
        <input type="checkbox" value="${l}"> ${DB.getLocalLabel(l)}
      </label>`
    ).join('');

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
    customInput.classList.add('hidden');
  },

  _initQueueGroupPanel() {
    g('btnQueueGroups').addEventListener('click', () => {
      const panel = g('queueGroupPanel');
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) this._renderQueueGroupPanel();
    });

    g('btnQgroupAdd').addEventListener('click', async () => {
      const sel = g('qgroupNameSelect');
      const name = sel.value === '__autre__'
        ? g('qgroupNameCustom').value.trim()
        : sel.value;
      if (!name) return;
      const checked = [...g('qgroupLocals').querySelectorAll('input:checked')].map(i => parseInt(i.value));
      if (checked.length < 1) { showToast('⚠ Sélectionnez au moins 1 local.'); return; }
      const id = 'qg_' + Date.now();
      await DB.saveQueueGroup(id, name, checked);
      g('qgroupNameCustom').value = '';
      g('qgroupLocals').querySelectorAll('input').forEach(i => i.checked = false);
      this._renderQueueGroupPanel();
    });
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
      const svc     = o.service === 'Autre' ? o.serviceCustom : o.service;
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
    const perm = occs.find(r => parseInt(r.localId) === l && r.isPermanent);
    const res  = occs.find(r =>
      parseInt(r.localId) === l && !r.isPermanent && r._start <= dt && r._end > dt
    );

    if (perm) {
      const svc = perm.service === 'Autre' ? perm.serviceCustom : perm.service;
      return `<div class="lpill is-perm" title="${svc}">
        <div class="lp-num">${DB.getLocalLabel(l)}</div>
        <div class="lp-status">🔒 Permanent</div>
        <div class="lp-detail">${svc}</div>
      </div>`;
    }
    if (res) {
      const svc = res.service === 'Autre' ? res.serviceCustom : res.service;
      const agt = res.agent   === 'Autre' ? res.agentCustom  : res.agent;
      const agtFmt = fmtAgent(agt);
      const endH = res._end
        ? res._end.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
        : '';
      return `<div class="lpill is-booked" title="${svc} — ${agt}">
        <div class="lp-num">${DB.getLocalLabel(l)}</div>
        <div class="lp-status">🔴 Réservé</div>
        <div class="lp-detail">${svc}</div>
        <div class="lp-agent" style="${DB.getAgentRoleColor(agt) ? `color:${DB.getAgentRoleColor(agt)}` : ''}">${agtFmt}</div>
        ${endH ? `<div class="lp-until">jusqu'à ${endH}</div>` : ''}
      </div>`;
    }
    // Prochaine réservation après dt pour ce local
    const next = occs
      .filter(r => parseInt(r.localId) === l && !r.isPermanent && r._start > dt)
      .sort((a, b) => a._start - b._start)[0];
    const nextH = next
      ? next._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
      : null;
    return `<div class="lpill is-free">
      <div class="lp-num">${DB.getLocalLabel(l)}</div>
      <div class="lp-status">🟢 Libre</div>
      ${nextH ? `<div class="lp-free-until">jusqu'à ${nextH}</div>` : '<div class="lp-free-until">toute la journée</div>'}
    </div>`;
  }).join('');
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
