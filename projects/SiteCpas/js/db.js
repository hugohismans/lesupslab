// ═══════════════════════════════════════════════════════════════════
// db.js — Firebase Realtime Database + expansion récurrence + seed
// ═══════════════════════════════════════════════════════════════════

const DB = {
  _db:           null,
  _data:         {},
  _cbs:          [],
  _config:       { agents: [], services: [], localLabels: {} },
  _configCbs:    [],
  _lieux:        {},
  _currentLieuId: null,

  init() {
    if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE);
    this._db = firebase.database();
    this._db.ref('reservations').on('value', snap => {
      this._data = snap.val() || {};
      this._cbs.forEach(fn => fn());
    });
  },

  // ── Config dynamique (agents / services) ─────────────────────────
  initConfig() {
    this._db.ref('appConfig').on('value', snap => {
      const hasConfig = snap.val() !== null;
      const d = snap.val() || {};
      this._config = {
        agents:   hasConfig
          ? (d.agents   ? Object.entries(d.agents).map(([k,v])  => ({key: k, name: v})) : [])
          : CONFIG.AGENTS.filter(a => a !== 'Autre').map(name => ({key: null, name})),
        services: hasConfig
          ? (d.services ? Object.entries(d.services).map(([k,v]) => ({key: k, name: v})) : [])
          : CONFIG.SERVICES.filter(s => s !== 'Autre').map(name => ({key: null, name})),
        localLabels:       d.localLabels || {},
        agentColors:       d.agentColors  || {},
        agentEmojis:       d.agentEmojis  || {},
        features:          d.features     || {},
        adminPasswordHash: d.adminPasswordHash || null,
        appPasswordHash:   d.appPasswordHash   || null
      };

      // Charger les lieux triés par order
      this._lieux = {};
      if (d.lieux) {
        Object.entries(d.lieux)
          .map(([id, lieu]) => ({
            id,
            name:     lieu.name || 'Sans nom',
            order:    lieu.order ?? 999,
            localIds: lieu.localIds
              ? Object.keys(lieu.localIds).map(Number).sort((a, b) => a - b)
              : []
          }))
          .sort((a, b) => a.order - b.order)
          .forEach(({ id, name, order, localIds }) => {
            this._lieux[id] = { name, order, localIds };
          });
      }

      // Restaurer le lieu depuis localStorage, sinon prendre le premier
      const saved = localStorage.getItem('cpas_currentLieu');
      if (saved && this._lieux[saved]) {
        this._currentLieuId = saved;
      } else if (!this._currentLieuId || !this._lieux[this._currentLieuId]) {
        const ids = Object.keys(this._lieux);
        this._currentLieuId = ids.length ? ids[0] : null;
      }
      if (this._currentLieuId && this._lieux[this._currentLieuId]) {
        CONFIG.LOCALS = [...this._lieux[this._currentLieuId].localIds];
      }

      this._configCbs.forEach(fn => fn());
    });
  },

  onConfigChange(fn)      { this._configCbs.push(fn); },
  getAgents()             { return [...this._config.agents.map(a => a.name),   'Autre']; },
  getServices()           { return [...this._config.services.map(s => s.name), 'Autre']; },
  getAgentsWithKeys()     { return this._config.agents; },
  getServicesWithKeys()   { return this._config.services; },
  getLocalLabel(id)       { return this._config.localLabels[id] || `Local ${id}`; },
  getAdminHash()           { return this._config.adminPasswordHash || null; },
  async setAdminHash(hash) { await this._db.ref('appConfig/adminPasswordHash').set(hash); },
  getAppHash()             { return this._config.appPasswordHash   || null; },
  async setAppHash(hash)   { await this._db.ref('appConfig/appPasswordHash').set(hash); },

  async setLocalLabel(id, label) {
    const val = label.trim() || null;
    await this._db.ref(`appConfig/localLabels/${id}`).set(val);
  },

  // ── Couleurs agents ──────────────────────────────────────────────
  getAgentColorByKey(key) {
    return this._config.agentColors[key] || null;
  },

  getAgentColor(agentName) {
    const agent = this._config.agents.find(a => a.name === agentName);
    if (!agent || !agent.key) return null;
    return this._config.agentColors[agent.key] || null;
  },

  async setAgentColor(key, color) {
    await this._db.ref(`appConfig/agentColors/${key}`).set(color);
  },

  getAgentEmojiByKey(key) { return this._config.agentEmojis[key] || ''; },
  getAgentEmoji(agentName) {
    const agent = this._config.agents.find(a => a.name === agentName);
    if (!agent || !agent.key) return '';
    return this._config.agentEmojis[agent.key] || '';
  },
  async setAgentEmoji(key, emoji) {
    await this._db.ref(`appConfig/agentEmojis/${key}`).set(emoji || null);
  },

  getFeature(name)           { return !!this._config.features[name]; },
  async setFeature(name, val) { await this._db.ref(`appConfig/features/${name}`).set(val || null); },

  async addAgent(name) {
    await this._db.ref('appConfig/agents').push(name);
  },
  async removeAgentByKey(key) {
    await this._db.ref(`appConfig/agents/${key}`).remove();
  },
  async addService(name) {
    await this._db.ref('appConfig/services').push(name);
  },
  async removeServiceByKey(key) {
    await this._db.ref(`appConfig/services/${key}`).remove();
  },

  // ── Lieux ────────────────────────────────────────────────────────
  getCurrentLieuId() { return this._currentLieuId; },

  getLieux() {
    // Retourne un objet dont les clés sont dans l'ordre du champ order
    const sorted = Object.entries(this._lieux)
      .sort(([, a], [, b]) => (a.order ?? 999) - (b.order ?? 999));
    const result = {};
    sorted.forEach(([id, lieu]) => { result[id] = lieu; });
    return result;
  },

  setCurrentLieu(lieuId) {
    this._currentLieuId = lieuId;
    localStorage.setItem('cpas_currentLieu', lieuId);
    const lieu = this._lieux[lieuId];
    if (lieu) CONFIG.LOCALS = [...lieu.localIds];
    this._configCbs.forEach(fn => fn());
  },

  async renameLieu(lieuId, name) {
    await this._db.ref(`appConfig/lieux/${lieuId}/name`).set(name);
  },

  async addLieu(name) {
    const maxOrder = Object.values(this._lieux).reduce((m, l) => Math.max(m, l.order ?? 0), -1);
    const ref = await this._db.ref('appConfig/lieux').push({ name, order: maxOrder + 1, localIds: {} });
    return ref.key;
  },

  async moveLieu(lieuId, dir) {
    const entries = Object.entries(this._lieux)
      .sort(([, a], [, b]) => (a.order ?? 999) - (b.order ?? 999));
    const idx     = entries.findIndex(([id]) => id === lieuId);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= entries.length) return;
    // Réécrire tous les ordres par position pour garantir l'unicité
    const updates = {};
    entries.forEach(([id], i) => {
      let pos = i;
      if (i === idx)     pos = swapIdx;
      if (i === swapIdx) pos = idx;
      updates[`appConfig/lieux/${id}/order`] = pos;
    });
    await this._db.ref().update(updates);
  },

  async removeLieu(lieuId) {
    const lieu = this._lieux[lieuId];
    const updates = { [`appConfig/lieux/${lieuId}`]: null };
    if (lieu?.localIds) {
      lieu.localIds.forEach(id => { updates[`appConfig/localLabels/${id}`] = null; });
    }
    await this._db.ref().update(updates);
  },

  async addLocalToLieu(lieuId, label) {
    const allIds = Object.values(this._lieux).flatMap(l => l.localIds);
    const newId  = allIds.length ? Math.max(...allIds) + 1 : 1;
    const updates = {
      [`appConfig/localLabels/${newId}`]:              label || `Local ${newId}`,
      [`appConfig/lieux/${lieuId}/localIds/${newId}`]: true
    };
    await this._db.ref().update(updates);
    return newId;
  },

  async removeLocal(lieuId, localId) {
    await this._db.ref().update({
      [`appConfig/lieux/${lieuId}/localIds/${localId}`]: null,
      [`appConfig/localLabels/${localId}`]:              null
    });
  },

  async seedConfigIfEmpty() {
    const snap = await this._db.ref('appConfig').once('value');
    const d    = snap.val() || {};
    const updates = {};

    if (!d.agents) {
      CONFIG.AGENTS.filter(a => a !== 'Autre').forEach(a => {
        updates[`appConfig/agents/${genId()}`] = a;
      });
    }
    if (!d.services) {
      CONFIG.SERVICES.filter(s => s !== 'Autre').forEach(s => {
        updates[`appConfig/services/${genId()}`] = s;
      });
    }
    // Créer le lieu "CPAS" par défaut avec les locaux 1-7 si aucun lieu n'existe
    if (!d.lieux) {
      const lieuId   = genId();
      const localIds = {};
      [1, 2, 3, 4, 5, 6, 7].forEach(id => { localIds[id] = true; });
      updates[`appConfig/lieux/${lieuId}`] = { name: 'CPAS', order: 0, localIds };
    }

    if (Object.keys(updates).length) await this._db.ref().update(updates);
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

  // Ajoute une date d'exception (suppression d'une seule occurrence)
  async addException(id, occDate) {
    await this._db.ref(`reservations/${id}/exceptions/${occDate}`).set(true);
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

  const exceptions = res.exceptions || {};

  let guard = 0;
  while (cur < viewEnd && guard++ < 700) {
    if (recEnd && cur > recEnd) break;
    const end = new Date(cur.getTime() + dur);
    const occDate = isoDate(cur);
    const dow = cur.getDay(); // 0=Dim, 6=Sam
    if (end > viewStart && !exceptions[occDate] && dow !== 0 && dow !== 6) {
      results.push({ id, ...res, _start: new Date(cur), _end: end, _occDate: occDate });
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

// Formate le nom d'un agent avec son emoji si la feature est activée
function fmtAgent(name) {
  if (!DB.getFeature('agentEmoji')) return name;
  const emoji = DB.getAgentEmoji(name) || '🧑‍💼';
  return `${emoji} ${name}`;
}

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
