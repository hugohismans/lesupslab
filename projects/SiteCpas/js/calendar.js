// ═══════════════════════════════════════════════════════════════════
// calendar.js — Vues jour / semaine / mois
// ═══════════════════════════════════════════════════════════════════

const CAL = {
  view: 'day',
  date: new Date(),

  setView(v) { this.view = v; this.render(); },

  navigate(dir) {
    const d = new Date(this.date);
    if (this.view === 'day')   d.setDate(d.getDate() + dir);
    if (this.view === 'week')  d.setDate(d.getDate() + 7 * dir);
    if (this.view === 'month') d.setMonth(d.getMonth() + dir);
    this.date = d;
    this.render();
  },

  goToday() { this.date = new Date(); this.render(); },

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

    let h = '<table class="cv-day-table"><thead><tr>';
    h += '<th class="tc-hd"></th>';
    CONFIG.LOCALS.forEach(l => h += `<th class="loc-hd">Local ${l}</th>`);
    h += '</tr></thead><tbody>';

    slots.forEach((slot, i) => {
      const sS = new Date(d); sS.setHours(slot.h, slot.m, 0, 0);
      const sE = new Date(sS.getTime() + CONFIG.SLOT_MIN * 60000);

      h += `<tr class="cv-row${i % 2 ? ' alt' : ''}">`;
      h += `<td class="tc">${slot.label}</td>`;

      CONFIG.LOCALS.forEach(l => {
        // Cette cellule est couverte par un rowspan précédent → on l'ignore
        if (coveredUntil[l] > i) return;

        const perm = occs.find(r => r.localId === l && r.isPermanent);
        const res  = occs.find(r =>
          r.localId === l && !r.isPermanent && r._start < sE && r._end > sS
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
          const isRec = res.recurrence?.type && res.recurrence.type !== 'none';
          const startH = res._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          const endH   = res._end.toLocaleTimeString('fr-BE',   { hour: '2-digit', minute: '2-digit' });
          h += `<td class="cv-cell is-booked${isRec ? ' is-rec' : ''}" rowspan="${span}"
            data-id="${res.id}" data-occ="${res._occDate || ''}" data-act="detail">
            <span class="ct">
              <b>${svc}</b><br>
              <small>${agt}</small><br>
              <small class="ct-time">${startH} – ${endH}${isRec ? ' ↻' : ''}</small>
            </span>
          </td>`;

        } else {
          h += `<td class="cv-cell is-free" data-local="${l}" data-date="${isoDate(d)}" data-time="${slot.label}" data-act="new"></td>`;
        }
      });

      h += '</tr>';
    });

    h += '</tbody></table>';
    el.innerHTML = h;
    this._bind(el);
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

    let h = '<div class="cv-week">';

    // En-tête : 7 jours Lun-Dim
    h += '<div class="cv-week-hd"><div class="tc-hd"></div>';
    for (let i = 0; i < 7; i++) {
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
      h += `<div class="cv-row${i % 2 ? ' alt' : ''}"><div class="tc">${slot.label}</div>`;

      for (let d = 0; d < 7; d++) {
        const day  = addDays(wS, d);
        const sS   = new Date(day); sS.setHours(slot.h, slot.m, 0, 0);
        const sE   = new Date(sS.getTime() + CONFIG.SLOT_MIN * 60000);
        const isTd = sameDay(day, today);

        const booked = new Set();
        occs.forEach(r => {
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

    let h = '<div class="cv-month">';

    // En-tête jours (Lun-Dim)
    h += '<div class="mo-hd">';
    ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].forEach(n => h += `<div class="mo-dn">${n}</div>`);
    h += '</div><div class="mo-grid">';

    let cursor = new Date(gS);
    let weeks = 0;
    while (weeks < 6) {
      for (let d = 0; d < 7; d++) {
        const inMonth = cursor.getMonth() === month && cursor.getFullYear() === year;
        const isTd    = sameDay(cursor, today);

        let free = CONFIG.LOCALS.length;
        if (inMonth) {
          const booked = new Set();
          occs.forEach(r => {
            if (r.isPermanent) { booked.add(r.localId); return; }
            if (r._start && sameDay(r._start, cursor)) booked.add(r.localId);
          });
          free = CONFIG.LOCALS.length - booked.size;
        }

        const color = inMonth ? availColor(free, CONFIG.LOCALS.length) : 'transparent';

        h += `<div class="mo-cell${!inMonth ? ' other' : ''}${isTd ? ' is-today' : ''}"
          data-date="${isoDate(cursor)}" data-act="go-day">
          <div class="mo-num${isTd ? ' num-today' : ''}">${cursor.getDate()}</div>
          ${inMonth ? `<div class="mo-bar" style="background:${color}">${free}/7</div>` : ''}
        </div>`;

        cursor = addDays(cursor, 1);
      }
      weeks++;
      // Arrêter si on est bien au-delà du mois
      if (cursor > mE && cursor.getMonth() !== month) break;
    }

    h += '</div></div>';
    el.innerHTML = h;
    this._bind(el);
  },

  // ─────────────────────────────────────────────────────────────────
  // Liaison des événements sur les cellules
  // ─────────────────────────────────────────────────────────────────
  _bind(el) {
    el.querySelectorAll('[data-act]').forEach(cell => {
      cell.addEventListener('click', () => {
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
    const perm = occs.find(r => r.localId === l && r.isPermanent);
    const res  = occs.find(r =>
      r.localId === l && !r.isPermanent && r._start <= dt && r._end > dt
    );

    if (perm) {
      const svc = perm.service === 'Autre' ? perm.serviceCustom : perm.service;
      return `<div class="lpill is-perm" title="${svc}">
        <div class="lp-num">Local ${l}</div>
        <div class="lp-status">🔒 Permanent</div>
        <div class="lp-detail">${svc}</div>
      </div>`;
    }
    if (res) {
      const svc = res.service === 'Autre' ? res.serviceCustom : res.service;
      const agt = res.agent   === 'Autre' ? res.agentCustom  : res.agent;
      const endH = res._end
        ? res._end.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
        : '';
      return `<div class="lpill is-booked" title="${svc} — ${agt}">
        <div class="lp-num">Local ${l}</div>
        <div class="lp-status">🔴 Réservé</div>
        <div class="lp-detail">${svc}</div>
        ${endH ? `<div class="lp-until">jusqu'à ${endH}</div>` : ''}
      </div>`;
    }
    return `<div class="lpill is-free">
      <div class="lp-num">Local ${l}</div>
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
