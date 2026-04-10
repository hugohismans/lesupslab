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
      // Sauter le week-end
      const dow = d.getDay(); // 0=Dim, 6=Sam
      if (dow === 6) d.setDate(d.getDate() + (dir > 0 ? 2 : -1));
      if (dow === 0) d.setDate(d.getDate() + (dir > 0 ? 1 : -2));
    }
    if (this.view === 'week')  d.setDate(d.getDate() + 7 * dir);
    if (this.view === 'month') d.setMonth(d.getMonth() + dir);
    this.date = d;
    this.render();
  },

  goToday() {
    const d = new Date();
    const dow = d.getDay();
    if (dow === 6) d.setDate(d.getDate() + 2); // Sam → Lun
    if (dow === 0) d.setDate(d.getDate() + 1); // Dim → Lun
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
    const dS    = new Date(d); dS.setHours(CONFIG.HOURS_START, 0, 0, 0);
    const dE    = new Date(d); dE.setHours(CONFIG.HOURS_END,   0, 0, 0);
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
      const sE = new Date(sS.getTime() + CONFIG.SLOT_MIN * 60000);

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
            const jE = new Date(jS.getTime() + CONFIG.SLOT_MIN * 60000);
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
          h += `<td class="cv-cell is-booked${isRec ? ' is-rec' : ''}" rowspan="${span}"
            data-id="${res.id}" data-occ="${res._occDate || ''}" data-act="detail"
            data-slot="${i}" data-local="${l}" data-span="${span}" data-occ-date="${isoDate(res._start)}"
            draggable="true"${colorStyle}>
            <span class="ct">
              <b>${svc}</b><br>
              <small>${agtFmt}</small><br>
              <small class="ct-time">${startH} – ${endH}${isRec ? ` ↻ ${recLabel}` : ''}</small>
              ${comment ? `<small class="ct-comment" title="${escapeHtml(comment)}">💬 ${escapeHtml(comment)}</small>` : ''}
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
    const wS     = weekStart(this.date);
    const wE     = addDays(wS, 6); wE.setHours(CONFIG.HOURS_END, 0, 0, 0);
    const wSfull = new Date(wS); wSfull.setHours(CONFIG.HOURS_START, 0, 0, 0);
    const occs   = DB.getInRange(wSfull, wE);
    const slots  = getSlots();
    const today  = new Date();

    // Titre : "Semaine du X au Y mois AAAA" (Lun → Ven)
    const wE2 = addDays(wS, 4);
    const sameMonth = wS.getMonth() === wE2.getMonth();
    const weekTitle = sameMonth
      ? `${wS.getDate()} – ${wE2.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : `${wS.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })} – ${wE2.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    let h = '<div class="cv-week">';
    h += `<div class="cv-period-bar">${weekTitle}</div>`;

    // En-tête : 5 jours Lun-Ven
    h += '<div class="cv-week-hd cv-week-hd-5"><div class="tc-hd"></div>';
    for (let i = 0; i < 5; i++) {
      const day = addDays(wS, i);
      const isTd = sameDay(day, today);
      h += `<div class="wkd-hd${isTd ? ' is-today' : ''}" data-date="${isoDate(day)}" data-act="go-day">
        <div class="wkd-name">${dayName(day)}</div>
        <div class="wkd-num${isTd ? ' num-today' : ''}">${day.getDate()}</div>
      </div>`;
    }
    h += '</div>';

    // Lignes de créneaux — 5 jours
    slots.forEach((slot, i) => {
      h += `<div class="cv-row cv-row-5${i % 2 ? ' alt' : ''}"><div class="tc">${slot.label}</div>`;

      for (let d = 0; d < 5; d++) {
        const day  = addDays(wS, d);
        const sS   = new Date(day); sS.setHours(slot.h, slot.m, 0, 0);
        const sE   = new Date(sS.getTime() + CONFIG.SLOT_MIN * 60000);
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
            if (!localsSet.has(parseInt(r.localId))) return;
            if (r.isPermanent) { booked.add(r.localId); return; }
            if (r._start && sameDay(r._start, cursor)) booked.add(r.localId);
          });
          free = CONFIG.LOCALS.length - booked.size;
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

      const totalMin = (CONFIG.HOURS_END - CONFIG.HOURS_START) * 60;
      const elapsed  = (now.getHours() - CONFIG.HOURS_START) * 60 + now.getMinutes();
      if (elapsed < 0 || elapsed > totalMin) return;

      const pct = (elapsed / totalMin) * 100;

      // Chercher ou créer la ligne
      let line = el.querySelector('.now-line');
      if (!line) {
        line = document.createElement('div');
        line.className = 'now-line';
        el.style.position = 'relative';
        el.appendChild(line);
      }

      // Trouver la hauteur de la zone scrollable (thead exclu)
      const table  = el.querySelector('.cv-day-table');
      const thead  = table?.querySelector('thead');
      const datebar = el.querySelector('.cv-day-datebar');
      const topOffset = (datebar?.offsetHeight || 0) + (thead?.offsetHeight || 0);
      const totalH = table ? table.offsetHeight - (thead?.offsetHeight || 0) : 0;

      line.style.top = (topOffset + (pct / 100) * totalH) + 'px';

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
    table.addEventListener('dragstart', e => {
      const card = e.target.closest('.cv-cell.is-booked');
      if (!card) { e.preventDefault(); return; }
      const res = DB.getById(card.dataset.id);
      if (!res)  { e.preventDefault(); return; }
      const isRec = res.recurrence?.type && res.recurrence.type !== 'none';
      const span  = parseInt(card.dataset.span) || 1;
      self._dnd = {
        resId:       card.dataset.id,
        isRec,
        span,
        durMs:       span * CONFIG.SLOT_MIN * 60000,
        occDate:     card.dataset.occDate,
        origLocalId: parseInt(card.dataset.local),
      };
      card.classList.add('dnd-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.id);
    });

    // ── dragover — toujours appelé sur la table entière ─────────────
    // e.preventDefault() DOIT être appelé pour autoriser le drop
    table.addEventListener('dragover', e => {
      if (!self._dnd) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      table.querySelectorAll('.dnd-over').forEach(c => c.classList.remove('dnd-over'));
      const target = e.target.closest('.cv-cell.is-free');
      if (!target) return;

      // Surligner les slots de la durée dans la colonne cible
      const startSlot  = parseInt(target.dataset.slot);
      const targetLocal = target.dataset.local;
      for (let s = startSlot; s < startSlot + self._dnd.span; s++) {
        const row  = table.querySelector(`tr[data-slot="${s}"]`);
        const cell = row?.querySelector(`.cv-cell.is-free[data-local="${targetLocal}"]`);
        if (cell) cell.classList.add('dnd-over');
        else if (s === startSlot) target.classList.add('dnd-over'); // fallback
      }
    });

    // ── dragend — nettoyage ─────────────────────────────────────────
    table.addEventListener('dragend', e => {
      const card = e.target.closest('.cv-cell.is-booked');
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

      const target = e.target.closest('.cv-cell.is-free');
      if (!target) return; // drop sur une cellule non libre → annulé

      const newLocalId  = parseInt(target.dataset.local);
      const newDate     = target.dataset.date;
      const newTime     = target.dataset.time;
      const [hh, mm]    = newTime.split(':').map(Number);
      const newStart    = new Date(`${newDate}T${pad(hh)}:${pad(mm)}:00`);
      const newEnd      = new Date(newStart.getTime() + dnd.durMs);
      const newStartISO = `${newDate}T${pad(hh)}:${pad(mm)}`;
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
  _timer:       null,
  _agentQuery:  '',

  open() {
    g('liveOverlay').classList.remove('hidden');
    g('liveAgentSearch').value = '';
    this._agentQuery = '';
    this._renderAgentSuggestions('');
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

    // Barre de présence — agents avec statut non-présent uniquement
    const presenceItems = DB.getAgentsWithKeys()
      .map(({key, name}) => ({ key, name, st: DB.getAgentStatus(key) }))
      .filter(a => a.st);
    const presBar = g('livePresenceBar');
    if (presenceItems.length) {
      presBar.innerHTML = presenceItems.map(({ name, st }) => {
        const color = DB.getAgentColor(name);
        if (st.status === 'absent') {
          return `<span class="lv-pres-badge lv-pres-absent" style="${color ? `border-color:${color}` : ''}">❌ ${fmtAgent(name)} — Absent</span>`;
        }
        return `<span class="lv-pres-badge lv-pres-late" style="${color ? `border-color:${color}` : ''}">🕐 ${fmtAgent(name)}${st.arrivalTime ? ` — arrivée ${st.arrivalTime}` : ' — En retard'}</span>`;
      }).join('');
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

    g('liveGrid').innerHTML = CONFIG.LOCALS.map(l => {
      const perm = occs.find(r => parseInt(r.localId) === l && r.isPermanent);
      const res  = occs.find(r =>
        parseInt(r.localId) === l && !r.isPermanent && r._start <= now && r._end > now
      );
      const next = !perm && !res
        ? occs.filter(r => parseInt(r.localId) === l && !r.isPermanent && r._start > now)
               .sort((a, b) => a._start - b._start)[0]
        : null;

      const label = DB.getLocalLabel(l);
      const queue = DB.getQueue(l);
      const queueHtml = `<div class="lv-queue">
        <button class="lv-q-btn" data-local="${l}" data-delta="-1">−</button>
        <span class="lv-q-count${queue > 0 ? ' lv-q-active' : ''}">${queue > 0 ? `${queue} en attente` : 'File vide'}</span>
        <button class="lv-q-btn" data-local="${l}" data-delta="1">+</button>
      </div>`;

      if (perm) {
        const svc = perm.service === 'Autre' ? perm.serviceCustom : perm.service;
        const agt = perm.agent   === 'Autre' ? perm.agentCustom  : perm.agent;
        return `<div class="lv-card lv-perm">
          <div class="lv-num">${label}</div>
          <div class="lv-status">🔒 Permanent</div>
          <div class="lv-svc">${svc}</div>
          <div class="lv-agt" style="${DB.getAgentColor(agt) ? `color:${DB.getAgentColor(agt)}` : ''}">${fmtAgent(agt)}</div>
          ${queueHtml}
        </div>`;
      }
      if (res) {
        const svc  = res.service === 'Autre' ? res.serviceCustom : res.service;
        const agt  = res.agent   === 'Autre' ? res.agentCustom  : res.agent;
        const endH = res._end.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
        const agentColor = DB.getAgentColor(agt);
        return `<div class="lv-card lv-busy" style="${agentColor ? `border-top:6px solid ${agentColor}` : ''}">
          <div class="lv-num">${label}</div>
          <div class="lv-status">🔴 Occupé</div>
          <div class="lv-svc">${svc}</div>
          <div class="lv-agt" style="${agentColor ? `color:${agentColor}` : ''}">${fmtAgent(agt)}</div>
          <div class="lv-until">Jusqu'à ${endH}</div>
          ${queueHtml}
        </div>`;
      }
      const nextStr = next
        ? `Prochain : ${next._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`
        : '';
      return `<div class="lv-card lv-free">
        <div class="lv-num">${label}</div>
        <div class="lv-status">🟢 Libre</div>
        ${nextStr ? `<div class="lv-next">${nextStr}</div>` : ''}
        ${queueHtml}
      </div>`;
    }).join('');

    // Binder les boutons file d'attente
    g('liveGrid').querySelectorAll('.lv-q-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const localId = parseInt(btn.dataset.local);
        const delta   = parseInt(btn.dataset.delta);
        await DB.setQueue(localId, DB.getQueue(localId) + delta);
      });
    });
  },

  _renderSearchMode(now, occs, q) {
    g('liveGrid').classList.add('hidden');
    g('liveAgentResult').classList.remove('hidden');

    const localsSet = new Set(CONFIG.LOCALS.map(Number));
    const ql = q.toLowerCase();

    const getAgt = r => (r.agent   === 'Autre' ? r.agentCustom   : r.agent)   || '';
    const getSvc = r => (r.service === 'Autre' ? r.serviceCustom : r.service)  || '';

    // Détecter si la query correspond à un agent ou un service
    const matchesAgent   = r => getAgt(r).toLowerCase().includes(ql);
    const matchesService = r => getSvc(r).toLowerCase().includes(ql);
    const match = r => (matchesAgent(r) || matchesService(r)) && localsSet.has(parseInt(r.localId));

    const now_occs    = occs.filter(r => match(r) && !r.isPermanent && r._start <= now && r._end > now);
    const future_occs = occs.filter(r => match(r) && !r.isPermanent && r._start > now)
                            .sort((a, b) => a._start - b._start);
    const perm_occs   = occs.filter(r => match(r) && r.isPermanent);
    const all = [...now_occs, ...perm_occs, ...future_occs];

    // Titre : est-ce qu'on cherche un agent ou un service ?
    const isAgentSearch = DB.getAgents().some(a => a !== 'Autre' && a.toLowerCase().includes(ql));
    const isSvcSearch   = !isAgentSearch || DB.getServices().some(s => s !== 'Autre' && s.toLowerCase().includes(ql));

    const fmt = r => {
      const agt  = getAgt(r);
      const svc  = getSvc(r);
      const loc  = DB.getLocalLabel(parseInt(r.localId));
      const color = DB.getAgentColor(agt);
      if (r.isPermanent) {
        return `<div class="lv-agent-row lv-ar-perm">
          <div class="lv-ar-dot">🔒</div>
          <div class="lv-ar-info">
            <div class="lv-ar-loc">${loc}</div>
            <div class="lv-ar-svc">${svc}</div>
            <div class="lv-ar-agt" style="${color ? `color:${color}` : ''}">${fmtAgent(agt)}</div>
            <div class="lv-ar-time">Permanent</div>
          </div>
        </div>`;
      }
      const startH = r._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
      const endH   = r._end.toLocaleTimeString('fr-BE',   { hour: '2-digit', minute: '2-digit' });
      const isCurrent = r._start <= now && r._end > now;
      return `<div class="lv-agent-row ${isCurrent ? 'lv-ar-now' : 'lv-ar-future'}" style="${color ? `border-left:4px solid ${color}` : ''}">
        <div class="lv-ar-dot">${isCurrent ? '🔴' : '🕐'}</div>
        <div class="lv-ar-info">
          <div class="lv-ar-loc">${loc}</div>
          <div class="lv-ar-svc">${svc}</div>
          <div class="lv-ar-agt" style="${color ? `color:${color}` : ''}">${fmtAgent(agt)}</div>
          <div class="lv-ar-time">${startH} – ${endH}</div>
        </div>
      </div>`;
    };

    if (!all.length) {
      g('liveAgentResult').innerHTML = `
        <div class="lv-agent-empty">
          <div class="lv-ae-icon">🔍</div>
          <div class="lv-ae-msg">Rien trouvé pour <strong>"${q}"</strong> aujourd'hui.</div>
        </div>`;
      return;
    }

    const isPresent = now_occs.length > 0 || perm_occs.length > 0;
    const statusBadge = isPresent
      ? `<span class="lv-badge lv-badge-present">✅ Présent aujourd'hui</span>`
      : `<span class="lv-badge lv-badge-later">🕐 Prévu plus tard</span>`;

    // Titre adapté selon le type de recherche
    let titleHtml;
    if (isAgentSearch && all.length) {
      const firstAgt = getAgt(all[0]);
      const color    = DB.getAgentColor(firstAgt);
      titleHtml = `<div class="lv-agent-name" style="${color ? `color:${color}` : ''}">${fmtAgent(firstAgt)}</div>`;
    } else {
      const firstSvc = getSvc(all[0]);
      titleHtml = `<div class="lv-agent-name lv-svc-title">🗂 ${firstSvc}</div>`;
    }

    g('liveAgentResult').innerHTML = `
      <div class="lv-agent-header">
        ${titleHtml}
        ${statusBadge}
      </div>
      <div class="lv-agent-rows">${all.map(fmt).join('')}</div>`;
  },

  _renderAgentSuggestions(q) {
    const box = g('liveAgentSuggestions');
    if (!q) { box.innerHTML = ''; return; }
    const ql = q.toLowerCase();

    const agentMatches = DB.getAgents()
      .filter(a => a !== 'Autre' && a.toLowerCase().includes(ql))
      .slice(0, 4)
      .map(a => {
        const color = DB.getAgentColor(a);
        return `<button class="lv-suggestion" data-val="${a}">
          <span class="lv-sug-tag lv-sug-agent">Agent</span>
          <span style="${color ? `color:${color}` : ''}">${fmtAgent(a)}</span>
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

  _tick() {
    if (this._timer) clearInterval(this._timer);
    const update = () => {
      if (g('liveOverlay').classList.contains('hidden')) {
        clearInterval(this._timer); this._timer = null; return;
      }
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const el = g('liveClock');
      if (el) el.textContent = `${hh}:${mm}:${ss}`;
      this.render();
    };
    update();
    this._timer = setInterval(update, 1000);
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
        <div class="lp-agent" style="${DB.getAgentColor(agt) ? `color:${DB.getAgentColor(agt)}` : ''}">${agtFmt}</div>
        ${endH ? `<div class="lp-until">jusqu'à ${endH}</div>` : ''}
      </div>`;
    }
    return `<div class="lpill is-free">
      <div class="lp-num">${DB.getLocalLabel(l)}</div>
      <div class="lp-status">🟢 Libre</div>
    </div>`;
  }).join('');
}

// ───────────────────────────────────────────────────────────────────
// Helpers calendrier
// ───────────────────────────────────────────────────────────────────

function getSlots() {
  const slots = [];
  for (let h = CONFIG.HOURS_START; h < CONFIG.HOURS_END; h++) {
    for (let m = 0; m < 60; m += CONFIG.SLOT_MIN) {
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

function availColor(free, total) {
  if (free >= total)                   return '#bbf7d0';
  if (free >= Math.ceil(total * 0.7))  return '#86efac';
  if (free >= Math.ceil(total * 0.4))  return '#fde68a';
  if (free > 0)                        return '#fdba74';
  return '#fca5a5';
}
