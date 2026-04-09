// ═══════════════════════════════════════════════════════════════════
// db.js — Firebase Realtime Database + expansion récurrence + seed
// ═══════════════════════════════════════════════════════════════════

const DB = {
  _db:   null,
  _data: {},
  _cbs:  [],

  init() {
    if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE);
    this._db = firebase.database();
    this._db.ref('reservations').on('value', snap => {
      this._data = snap.val() || {};
      this._cbs.forEach(fn => fn());
    });
  },

  onChange(fn) { this._cbs.push(fn); },
  getAll()     { return this._data; },

  // Retourne toutes les occurrences (récurrentes comprises) qui chevauchent [start, end]
  getInRange(start, end) {
    const result = [];
    Object.entries(this._data).forEach(([id, res]) => {
      expandReservation(id, res, start, end).forEach(o => result.push(o));
    });
    return result;
  },

  async add(data) {
    const ref = this._db.ref('reservations').push();
    const needsSeries = !data.isPermanent && data.recurrence?.type !== 'none';
    const seriesId = needsSeries ? genId() : null;
    await ref.set({ ...data, recurrence: { ...data.recurrence, seriesId }, createdAt: Date.now() });
    return ref.key;
  },

  async update(id, data) {
    await this._db.ref(`reservations/${id}`).update({ ...data, updatedAt: Date.now() });
  },

  async remove(id) {
    await this._db.ref(`reservations/${id}`).remove();
  },

  async removeSeries(seriesId) {
    const updates = {};
    Object.entries(this._data).forEach(([id, r]) => {
      if (r.recurrence?.seriesId === seriesId) updates[`reservations/${id}`] = null;
    });
    if (Object.keys(updates).length) await this._db.ref().update(updates);
  },

  // Charge des données de démonstration si Firebase est vide (premier lancement)
  async seedIfEmpty() {
    const snap = await this._db.ref('reservations').once('value');
    if (snap.val() !== null) return;

    const mon = getLastMonday();
    const tue = addDays(mon, 1);
    const wed = addDays(mon, 2);
    const thu = addDays(mon, 3);
    const fri = addDays(mon, 4);

    const seeds = [
      // ─ Local 1 — Permanence aide générale (Lun/Mer/Jeu/Ven 8h30-11h30)
      mkSeed(1, 'Permanence aide générale',             'AS Martin',  mon, '08:30', '11:30', 'weekly', 'Permanences Aristote'),
      mkSeed(1, 'Permanence aide générale',             'AS Dubois',  wed, '08:30', '11:30', 'weekly', 'Permanences Aristote'),
      mkSeed(1, 'Permanence aide générale',             'AS Martin',  thu, '08:30', '11:30', 'weekly', 'Permanences Aristote'),
      mkSeed(1, 'Permanence aide générale',             'AS Dubois',  fri, '08:30', '11:30', 'weekly', 'Permanences Aristote'),
      // ─ Local 2 — Permanence Énergie (Lun/Mer/Jeu/Ven 8h30-11h30)
      mkSeed(2, 'Permanence Énergie',                   'AS Lambert', mon, '08:30', '11:30', 'weekly'),
      mkSeed(2, 'Permanence Énergie',                   'AS Renard',  wed, '08:30', '11:30', 'weekly'),
      mkSeed(2, 'Permanence Énergie',                   'AS Lambert', thu, '08:30', '11:30', 'weekly'),
      mkSeed(2, 'Permanence Énergie',                   'AS Renard',  fri, '08:30', '11:30', 'weekly'),
      // ─ Local 3 — Insertion (rendez-vous individuels — mardi)
      mkSeed(3, "Service d'insertion socio-professionnelle", 'AS Claes',  tue, '09:00', '10:00', 'none'),
      mkSeed(3, "Service d'insertion socio-professionnelle", 'AS Maes',   tue, '10:30', '11:30', 'none'),
      mkSeed(3, "Service d'insertion socio-professionnelle", 'AS Pirard', tue, '13:00', '14:00', 'none'),
      // ─ Local 4 — Insertion (jeudi récurrent)
      mkSeed(4, "Service d'insertion socio-professionnelle", 'AS Claes',  thu, '09:00', '10:30', 'weekly'),
      mkSeed(4, "Service d'insertion socio-professionnelle", 'AS Maes',   thu, '14:00', '16:00', 'weekly'),
      // ─ Local 5 — Médiation de dettes (mercredi matin)
      mkSeed(5, 'Médiation de dettes',                  'AS Pirard',  wed, '09:00', '12:00', 'weekly'),
      // ─ Local 6 — Étrangers / Logement / Énergie
      mkSeed(6, 'Étrangers / Logement / Énergie',       'AS Claes',   tue, '13:00', '16:30', 'weekly'),
      mkSeed(6, 'Étrangers / Logement / Énergie',       'AS Renard',  fri, '09:00', '11:30', 'weekly'),
      // ─ Local 7 — Urgences / Intervention AS (PERMANENT)
      {
        localId: 7,
        service: 'Urgence et divers', serviceCustom: '',
        agent: 'AS Maes', agentCustom: '',
        comment: "Local réservé aux urgences et interventions de l'AS hors permanences",
        isPermanent: true,
        startDateTime: isoDate(mon) + 'T08:00',
        endDateTime: null,
        recurrence: { type: 'none', interval: 1, endDate: null, seriesId: null },
        createdAt: Date.now()
      }
    ];

    const updates = {};
    seeds.forEach(s => {
      const key = this._db.ref('reservations').push().key;
      updates[`reservations/${key}`] = s;
    });
    await this._db.ref().update(updates);
    console.log('✅ Données de démonstration CPAS chargées.');
  }
};

// ───────────────────────────────────────────────────────────────────
// Expansion des réservations récurrentes
// ───────────────────────────────────────────────────────────────────

function expandReservation(id, res, viewStart, viewEnd) {
  // Permanente → toujours visible
  if (res.isPermanent) {
    return [{ id, ...res, _start: new Date(res.startDateTime), _end: null }];
  }

  const origStart = new Date(res.startDateTime);
  const origEnd   = new Date(res.endDateTime);
  const dur       = origEnd - origStart; // durée en ms

  // Réservation simple (pas de récurrence)
  if (!res.recurrence || res.recurrence.type === 'none') {
    if (origStart < viewEnd && origEnd > viewStart) {
      return [{ id, ...res, _start: origStart, _end: origEnd }];
    }
    return [];
  }

  // Réservation récurrente
  const type     = res.recurrence.type;
  const interval = parseInt(res.recurrence.interval) || 1;
  const recEnd   = res.recurrence.endDate
    ? new Date(res.recurrence.endDate + 'T23:59:59')
    : null;

  const results = [];
  let cur = new Date(origStart);

  // Avance rapide vers viewStart pour éviter d'itérer depuis des années en arrière
  const msPerInterval = approxIntervalMs(type, interval);
  if (msPerInterval > 0 && cur < viewStart) {
    const skip = Math.max(0, Math.floor((viewStart - cur) / msPerInterval) - 2);
    if (skip > 0) cur = advDate(cur, type, interval * skip);
  }

  let guard = 0;
  while (cur < viewEnd && guard++ < 700) {
    if (recEnd && cur > recEnd) break;
    const end = new Date(cur.getTime() + dur);
    if (end > viewStart) {
      results.push({ id, ...res, _start: new Date(cur), _end: end, _occDate: isoDate(cur) });
    }
    cur = advDate(cur, type, interval);
  }
  return results;
}

function advDate(d, type, n) {
  const r = new Date(d);
  if (type === 'daily')   r.setDate(r.getDate() + n);
  if (type === 'weekly')  r.setDate(r.getDate() + 7 * n);
  if (type === 'monthly') r.setMonth(r.getMonth() + n);
  return r;
}

function approxIntervalMs(type, n) {
  if (type === 'daily')   return n * 86400000;
  if (type === 'weekly')  return n * 7 * 86400000;
  if (type === 'monthly') return n * 30 * 86400000;
  return 0;
}

// ───────────────────────────────────────────────────────────────────
// Helpers partagés (utilisés par calendar.js, modal.js, app.js)
// ───────────────────────────────────────────────────────────────────

function isoDate(d)    {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function genId()       { return Math.random().toString(36).slice(2, 11); }

function getLastMonday() {
  const d = new Date();
  const day = d.getDay(); // 0=Dim, 1=Lun, ...
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function mkSeed(localId, service, agent, date, t1, t2, recType, comment = '') {
  return {
    localId, service, serviceCustom: '',
    agent, agentCustom: '',
    comment,
    isPermanent: false,
    startDateTime: isoDate(date) + 'T' + t1,
    endDateTime:   isoDate(date) + 'T' + t2,
    recurrence: {
      type: recType,
      interval: 1,
      endDate: null,
      seriesId: recType !== 'none' ? genId() : null
    },
    createdAt: Date.now()
  };
}
