// ═══════════════════════════════════════════════════════════════════
// db.js — Firebase Realtime Database + expansion récurrence + seed
// ═══════════════════════════════════════════════════════════════════

const DB = {
  _db:           null,
  _data:         {},
  _cbs:          [],
  _config:       { agents: [], services: [], localLabels: {}, publicLabels: {}, permRoles: {}, agentRoles: {}, tempAdminGrant: null },
  _configCbs:    [],
  _lieux:        {},
  _currentLieuId: null,

  // ── Helpers multi-tenant ─────────────────────────────────────────
  // Toutes les refs Firebase passent par _ref() pour le préfixe org
  _ref(path) {
    return this._db.ref(`orgs/${ORG_ID}/${path}`);
  },
  async _update(updates) {
    const prefixed = {};
    Object.entries(updates).forEach(([k, v]) => {
      prefixed[`orgs/${ORG_ID}/${k}`] = v;
    });
    return this._db.ref().update(prefixed);
  },

  init() {
    if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE);
    this._db = firebase.database();
    this._ref('reservations').on('value', snap => {
      this._data = snap.val() || {};
      this._cbs.forEach(fn => fn());
    });
  },

  // ── Config dynamique (agents / services) ─────────────────────────
  initConfig() {
    this._ref('appConfig').on('value', snap => {
      const hasConfig = snap.val() !== null;
      const d = snap.val() || {};
      this._config = {
        agents:   hasConfig
          ? (d.agents   ? Object.entries(d.agents).map(([k,v])  => ({key: k, name: v})) : [])
          : CONFIG.AGENTS.filter(a => a !== 'Autre').map(name => ({key: null, name})),
        services: hasConfig
          ? (d.services ? Object.entries(d.services).map(([k,v]) => ({key: k, name: v})) : [])
          : CONFIG.SERVICES.filter(s => s !== 'Autre').map(name => ({key: null, name})),
        localLabels:        d.localLabels        || {},
        publicLabels:       d.publicLabels       || {},
        localDescriptions:  d.localDescriptions  || {},
        agentColors:       d.agentColors      || {},
        agentEmojis:       d.agentEmojis      || {},
        agentPublicNames:  d.agentPublicNames || {},
        features:          d.features     || {},
        messageJour:           d.messageJour           || '',
        messageJourAt:         d.messageJourAt         || null,
        messageJourPublic:     d.messageJourPublic     || '',
        messageJourPublicAt:   d.messageJourPublicAt   || null,
        adminPasswordHash: d.adminPasswordHash || null,
        appPasswordHash:   d.appPasswordHash   || null,
        queueGroups:       d.queueGroups       || {},
        screens:           d.screens           || {},
        permRoles:         d.permRoles         || {},
        agentRoles:        d.agentRoles        || {},
        agentPasswords:    d.agentPasswords    || {},
        hiddenLocals:      d.hiddenLocals      || {},
        accueilDeskLocalId: d.accueilDeskLocalId || null,
        mascotId:          d.mascotId           || 'poulpe',
        orgLat:               d.meta?.lat                  || null,
        orgLon:               d.meta?.lon                  || null,
        endOfDayHour:         d.meta?.endOfDayHour         ?? 17,
        sensitivDataDeleteMin: d.meta?.sensitivDataDeleteMin ?? 30,
        tempAdminGrant:       d.tempAdminGrant             || null,
        publicPlaces:         d.publicPlaces
          ? Object.entries(d.publicPlaces)
              .map(([id, p]) => ({ id, name: p.name || '', description: p.description || '', order: p.order ?? 999 }))
              .sort((a, b) => a.order - b.order)
          : [],
        publicPermLieux: d.publicPermLieux || {},
        ticketDisplay:   d.ticketDisplay   || {},
        localDesks:  d.localDesks  || {},   // { [localId]: { [deskId]: true } }
        deskLabels:  d.deskLabels  || {},   // { [deskId]: "Desk A" }
      };

      // Charger les lieux triés par order
      this._lieux = {};
      if (d.lieux) {
        Object.entries(d.lieux)
          .map(([id, lieu]) => ({
            id,
            name:       lieu.name || 'Sans nom',
            order:      lieu.order ?? 999,
            localIds:   lieu.localIds
              ? Object.keys(lieu.localIds).map(Number).sort((a, b) => a - b)
              : [],
            openHour:    lieu.openHour    ?? null,
            closeHour:   lieu.closeHour   ?? null,
            slotMin:     lieu.slotMin     ?? null,
            activeDays:  lieu.activeDays  || null,  // {1:true,2:true,...} — null = défaut Lun-Ven
            isBackoffice: !!lieu.isBackoffice,
            publicName:   lieu.publicName || null,
          }))
          .sort((a, b) => a.order - b.order)
          .forEach(({ id, name, order, localIds, openHour, closeHour, slotMin, activeDays, isBackoffice, publicName }) => {
            this._lieux[id] = { name, order, localIds, openHour, closeHour, slotMin, activeDays, isBackoffice, publicName };
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
        // Exclure les locaux cachés de CONFIG.LOCALS (visible partout sauf accueil desk)
        CONFIG.LOCALS = this._lieux[this._currentLieuId].localIds
          .filter(id => !this._config.hiddenLocals[String(id)]);
      }

      this._configCbs.forEach(fn => fn());
    });
  },

  onConfigChange(fn)      { this._configCbs.push(fn); },
  getAgents()             { return [...this._config.agents.map(a => a.name),   'Autre']; },
  getServices()           { return [...this._config.services.map(s => s.name), 'Autre']; },
  getAgentsWithKeys()     { return this._config.agents; },
  // Retourne le nom du lieu auquel appartient un local (ou null)
  getLocalLieuName(localId) {
    const found = Object.values(this._lieux).find(l => l.localIds.includes(Number(localId)));
    return found?.name || null;
  },
  // Retourne true si le local appartient à un lieu "backoffice"
  isLocalBackoffice(localId) {
    return Object.values(this._lieux).some(l => l.isBackoffice && l.localIds.includes(Number(localId)));
  },
  async setLieuBackoffice(lieuId, value) {
    await this._ref(`appConfig/lieux/${lieuId}/isBackoffice`).set(value || null);
  },
  // Présence backoffice : { agentKey: { since } }
  getBackofficePresence(localId) {
    return this._bureauState[String(localId)]?.presence || {};
  },
  isAgentPresentInLocal(localId, agentKey) {
    return !!(this._bureauState[String(localId)]?.presence?.[agentKey]);
  },
  async setAgentPresence(localId, isPresent) {
    const agentKey = sessionStorage.getItem('cpas_current_agent_key') || null;
    if (!agentKey) return;
    if (isPresent) {
      await this._ref(`appState/bureaux/${localId}/presence/${agentKey}`).set({ since: Date.now() });
    } else {
      await this._ref(`appState/bureaux/${localId}/presence/${agentKey}`).remove();
    }
  },
  // Retourne le localId backoffice où l'agent courant est déjà présent (ou null)
  getAgentCurrentBackofficeLocal() {
    const agentKey = sessionStorage.getItem('cpas_current_agent_key') || null;
    if (!agentKey) return null;
    const backofficeLocals = Object.values(this._lieux)
      .filter(l => l.isBackoffice)
      .flatMap(l => l.localIds);
    for (const lid of backofficeLocals) {
      if (this.isAgentPresentInLocal(lid, agentKey)) return lid;
    }
    return null;
  },
  // Retourne le localId où l'agent est déclaré présent (backoffice OU bureau d'accueil)
  getAgentCurrentPresenceLocal() {
    const bo   = this.getAgentCurrentBackofficeLocal();
    if (bo !== null) return bo;
    const desk = this.getAccueilDeskLocalId();
    const agentKey = sessionStorage.getItem('cpas_current_agent_key') || null;
    if (desk !== null && agentKey && this.isAgentPresentInLocal(desk, agentKey)) return desk;
    return null;
  },

  // Retourne les agents ayant le rôle accueil
  getAccueilAgentKeys() {
    return this._config.agents
      .filter(a => a.key && this.getAgentPermRole(a.key) === '__accueil__')
      .map(a => a.key);
  },
  getServicesWithKeys()   { return this._config.services; },
  // Retourne la liste des services d'une réservation (compat ancien format champ unique)
  getResSvcs(res)         { return res.services?.length ? res.services : (res.service ? [res.service] : []); },
  // Retourne le libellé affichable des services (ex: "Aide sociale + Médiation")
  getSvcLabel(res)        { if (res?.type === 'rendez-vous') return '📅 Rendez-vous'; return this.getResSvcs(res).map(s => s === 'Autre' ? (res.serviceCustom || 'Autre') : s).join(' + ') || ''; },
  getById(id)             { return this._data[id] ? { id, ...this._data[id] } : null; },
  getLocalLabel(id)       { return this._config.localLabels[id]       || `Local ${id}`; },
  getPublicLocalLabel(id) { return this._config.publicLabels[id]      || this.getLocalLabel(id); },
  getLocalDescription(id) { return this._config.localDescriptions[id] || ''; },

  // ── Desks ─────────────────────────────────────────────────────────
  getLocalDesks(localId)  { return Object.keys(this._config.localDesks[String(localId)] || {}); },
  localHasDesks(localId)  { return this.getLocalDesks(localId).length > 0; },
  getDeskLabel(deskId)    { return this._config.deskLabels[deskId] || `Desk ${String(deskId).slice(-4)}`; },
  // Libellé complet "Bureau 1 — Desk A" ou "Bureau 1"
  getUnitLabel(localId, deskId) {
    const loc = this.getLocalLabel(localId);
    return deskId ? `${loc} — ${this.getDeskLabel(deskId)}` : loc;
  },
  // Liste des unités d'affichage pour le lieu courant (colonnes calendrier)
  getDisplayUnits() {
    const units = [];
    CONFIG.LOCALS.forEach(localId => {
      const desks = this.getLocalDesks(localId);
      if (desks.length > 0) {
        desks.forEach(deskId => units.push({
          type: 'desk', localId, deskId,
          label: this.getDeskLabel(deskId),
          fullLabel: this.getUnitLabel(localId, deskId),
        }));
      } else {
        units.push({ type: 'local', localId, deskId: null,
          label: this.getLocalLabel(localId), fullLabel: this.getLocalLabel(localId) });
      }
    });
    return units;
  },
  // Helper conflit unifié — remplace parseInt(r.localId) === localId dans les conflits
  // deskId null = mode local legacy, deskId string = mode desk
  unitOccupies(r, localId, deskId) {
    const rLocal = parseInt(r.localId);
    const rDesk  = r.deskId || null;
    if (deskId) {
      // Mode desk : bloqué par même desk OU par résa legacy du même local (règle 4)
      return rDesk === deskId || (!rDesk && rLocal === localId);
    } else {
      // Mode local legacy : bloqué seulement si même local et pas de deskId sur r
      return rLocal === localId && !rDesk;
    }
  },
  // CRUD desks
  async addDeskToLocal(localId, label) {
    const ref = this._ref(`appConfig/localDesks/${localId}`).push();
    const deskId = ref.key;
    await this._update({
      [`appConfig/localDesks/${localId}/${deskId}`]: true,
      [`appConfig/deskLabels/${deskId}`]: label.trim() || 'Desk',
    });
    return deskId;
  },
  async setDeskLabel(deskId, label) {
    await this._ref(`appConfig/deskLabels/${deskId}`).set(label.trim() || null);
  },
  async removeDesk(localId, deskId) {
    await this._update({
      [`appConfig/localDesks/${localId}/${deskId}`]: null,
      [`appConfig/deskLabels/${deskId}`]: null,
    });
  },
  isLocalHidden(localId)  { return !!(this._config.hiddenLocals[String(localId)]); },
  getAccueilDeskLocalId() { return this._config.accueilDeskLocalId ? Number(this._config.accueilDeskLocalId) : null; },
  async setAccueilDeskLocalId(localId) {
    const prev = this.getAccueilDeskLocalId();
    if (prev !== null) await this._ref(`appConfig/hiddenLocals/${prev}`).remove();
    if (localId) {
      await this._ref('appConfig/accueilDeskLocalId').set(String(localId));
      await this._ref(`appConfig/hiddenLocals/${localId}`).set(true);
    } else {
      await this._ref('appConfig/accueilDeskLocalId').remove();
    }
  },
  getAdminHash()           { return this._config.adminPasswordHash || null; },
  async setAdminHash(hash) { await this._ref('appConfig/adminPasswordHash').set(hash); },
  getAppHash()             { return this._config.appPasswordHash   || null; },
  async setAppHash(hash)   { await this._ref('appConfig/appPasswordHash').set(hash); },

  async moveReservation(id, newLocalId, newStartISO, newEndISO, newDeskId = null) {
    await this._ref(`reservations/${id}`).update({
      localId:       String(newLocalId),
      deskId:        newDeskId || null,
      startDateTime: newStartISO,
      endDateTime:   newEndISO,
    });
  },

  async moveOccurrence(id, occDateISO, newLocalId, newStartISO, newEndISO, newDeskId = null) {
    const res = this._data[id];
    if (!res) throw new Error('Réservation introuvable');
    // Marquer l'occurrence originale comme exception
    await this._ref(`reservations/${id}/exceptions/${occDateISO}`).set(true);
    // Créer une nouvelle réservation ponctuelle pour cette occurrence
    const { recurrence, exceptions, ...base } = res;
    await this._ref('reservations').push({
      ...base,
      localId:       String(newLocalId),
      deskId:        newDeskId || null,
      startDateTime: newStartISO,
      endDateTime:   newEndISO,
      recurrence:    { type: 'none' },
    });
  },

  async setLocalLabel(id, label) {
    const val = label.trim() || null;
    await this._ref(`appConfig/localLabels/${id}`).set(val);
  },
  async setPublicLocalLabel(id, label) {
    const val = label.trim() || null;
    await this._ref(`appConfig/publicLabels/${id}`).set(val);
  },
  async setLocalDescription(id, desc) {
    const val = (desc || '').trim() || null;
    await this._ref(`appConfig/localDescriptions/${id}`).set(val);
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

  // Couleur du pseudo (définie par le rôle de l'agent)
  // Fallback sur la couleur individuelle si aucun rôle assigné
  getAgentRoleColor(agentName) {
    const agent = this._config.agents.find(a => a.name === agentName);
    if (!agent?.key) return this.getAgentColor(agentName);
    const roleId = this.getAgentPermRole(agent.key);
    if (!roleId) return this.getAgentColor(agentName);
    const role = this.getPermRole(roleId);
    return role?.color || this.getAgentColor(agentName);
  },

  async setAgentColor(key, color) {
    await this._ref(`appConfig/agentColors/${key}`).set(color);
  },

  getAgentEmojiByKey(key) { return this._config.agentEmojis[key] || ''; },
  getAgentEmoji(agentName) {
    const agent = this._config.agents.find(a => a.name === agentName);
    if (!agent || !agent.key) return '';
    return this._config.agentEmojis[agent.key] || '';
  },
  async setAgentEmoji(key, emoji) {
    await this._ref(`appConfig/agentEmojis/${key}`).set(emoji || null);
  },

  getAgentPublicName(agentName) {
    const agent = this._config.agents.find(a => a.name === agentName);
    if (!agent?.key) return agentName;
    return this._config.agentPublicNames[agent.key] || agentName;
  },
  async setAgentPublicName(key, name) {
    await this._ref(`appConfig/agentPublicNames/${key}`).set(name.trim() || null);
  },

  getFeature(name)           { return !!this._config.features[name]; },
  async setFeature(name, val) { await this._ref(`appConfig/features/${name}`).set(val ? true : false); },

  // ── Affichage des tickets (par emplacement) ───────────────────────
  // locations: publicCall | publicBureauCard | agentNotif | waitBanner | kiosk
  _ticketDisplayDefaults: {
    publicCall:       { showNum: true,  showName: true  },
    publicBureauCard: { showNum: true,  showName: false },
    agentNotif:       { showNum: true,  showName: true  },
    waitBanner:       { showNum: true,  showName: false },
    kiosk:            { showNum: true,  showName: true  },
    groupCard:        { showNum: true,  showName: true  },
  },
  getTicketDisplay(location) {
    const def     = this._ticketDisplayDefaults[location] || { showNum: true, showName: true };
    const stored  = this._config.ticketDisplay[location]  || {};
    return { ...def, ...stored };
  },
  async setTicketDisplay(location, field, val) {
    await this._ref(`appConfig/ticketDisplay/${location}/${field}`).set(!!val);
  },

  getMascotId()              { return this._config.mascotId || 'poulpe'; },
  async setMascotId(id)      { await this._ref('appConfig/mascotId').set(id); },
  getOrgCoords()             { return { lat: this._config.orgLat, lon: this._config.orgLon }; },
  async setOrgCoords(lat, lon) {
    await this._ref('appConfig/meta/lat').set(parseFloat(lat) || null);
    await this._ref('appConfig/meta/lon').set(parseFloat(lon) || null);
  },
  getEndOfDayHour()          { return this._config.endOfDayHour ?? 17; },

  // ── Cache météo Firebase ──────────────────────────────────────────
  initWeather() {
    this._ref('appConfig/weather').on('value', snap => {
      const data = snap.val();
      if (typeof WEATHER !== 'undefined') WEATHER._loadFromFirebase(data);
    });
  },
  async setWeatherCache(data) {
    await this._ref('appConfig/weather').set(data);
  },

  // Prochain jour ouvré selon les activeDays configurés sur tous les lieux
  // Retourne { label: 'lundi', daysDelta: 3 } ou null si aucun jour configuré
  getNextWorkDay() {
    // Agréger tous les jours actifs de tous les lieux (union)
    const active = new Set();
    for (const lieu of Object.values(this._lieux)) {
      if (lieu.activeDays) {
        for (const [dow, on] of Object.entries(lieu.activeDays)) {
          if (on) active.add(Number(dow));
        }
      }
    }
    // Fallback : lun-ven si aucun lieu configuré
    if (!active.size) { [1,2,3,4,5].forEach(d => active.add(d)); }

    const DAY_NAMES = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    const today = new Date().getDay();
    for (let delta = 1; delta <= 7; delta++) {
      const dow = (today + delta) % 7;
      if (active.has(dow)) return { label: DAY_NAMES[dow], delta };
    }
    return null;
  },
  async setEndOfDayHour(hour) {
    await this._ref('appConfig/meta/endOfDayHour').set(parseInt(hour) || 17);
  },

  getMessageJour()              { return this._config.messageJour         || ''; },
  getMessageJourAt()            { return this._config.messageJourAt       || null; },
  getMessageJourPublic()        { return this._config.messageJourPublic   || ''; },
  getMessageJourPublicAt()      { return this._config.messageJourPublicAt || null; },
  async setMessageJour(txt) {
    await this._ref('appConfig').update({
      messageJour:   txt || null,
      messageJourAt: txt ? new Date().toISOString() : null
    });
  },
  async setMessageJourPublic(txt) {
    await this._ref('appConfig').update({
      messageJourPublic:   txt || null,
      messageJourPublicAt: txt ? new Date().toISOString() : null
    });
  },

  // ── Statut présence agents ────────────────────────────────────
  _statusCbs: [],
  _agentStatus: {},
  initAgentStatus() {
    const today = isoDate(new Date());
    this._ref(`agentStatus/${today}`).on('value', snap => {
      this._agentStatus = snap.val() || {};
      this._statusCbs.forEach(fn => fn());
    });
  },
  onAgentStatusChange(fn) { this._statusCbs.push(fn); },
  getAgentStatus(agentKey)  { return this._agentStatus[agentKey] || null; },
  getAgentDnd(agentKey)     { return !!(this._agentStatus[agentKey]?.dnd); },
  async setAgentStatus(agentKey, status, arrivalTime) {
    const today = isoDate(new Date());
    if (!status) {
      // Retour à présent : toujours garantir connectedAt (évite "Pas encore connecté")
      const current = this._agentStatus[agentKey] || {};
      const keep = {};
      keep.connectedAt = current.connectedAt || Date.now();
      if (current.dnd) keep.dnd = true;
      await this._ref(`agentStatus/${today}/${agentKey}`).set(keep);
    } else {
      const current = this._agentStatus[agentKey] || {};
      const data = status === 'late'
        ? { status, arrivalTime: arrivalTime || '' }
        : { status };
      if (status === 'done')   data.logoutAt    = Date.now();
      if (current.dnd)         data.dnd         = true;
      if (current.connectedAt) data.connectedAt  = current.connectedAt;
      await this._ref(`agentStatus/${today}/${agentKey}`).set(data);
    }
  },
  async setDnd(agentKey, active) {
    const today = isoDate(new Date());
    if (active) {
      await this._ref(`agentStatus/${today}/${agentKey}/dnd`).set(true);
    } else {
      await this._ref(`agentStatus/${today}/${agentKey}/dnd`).remove();
    }
  },
  isConnectedToday(agentKey) {
    return !!(this._agentStatus[agentKey]?.connectedAt);
  },
  getConnectedTodayAgents() {
    // Retourne les clés des agents ayant connectedAt aujourd'hui
    return Object.entries(this._agentStatus)
      .filter(([, v]) => v?.connectedAt)
      .map(([k]) => k);
  },
  async markConnectedToday(agentKey) {
    if (this.isConnectedToday(agentKey)) return; // déjà marqué
    const today = isoDate(new Date());
    await this._ref(`agentStatus/${today}/${agentKey}/connectedAt`).set(Date.now());
  },
  async fetchPresenceLog(date) {
    const snap = await this._ref(`agentStatus/${date}`).once('value');
    return snap.val() || {};
  },

  // ── Absences ──────────────────────────────────────────────────
  _absences:    {},
  _absenceCbs:  [],
  initAbsences() {
    this._ref('absences').on('value', snap => {
      this._absences = snap.val() || {};
      this._absenceCbs.forEach(fn => fn());
    });
  },
  onAbsenceChange(fn)  { this._absenceCbs.push(fn); },
  getAbsences()        { return this._absences; },
  getAgentAbsenceOn(agentKey, dateStr) {
    // Retourne l'objet absence si l'agent est absent ce jour-là
    return Object.entries(this._absences).find(([, a]) =>
      a.agentKey === agentKey && a.startDate <= dateStr && a.endDate >= dateStr
    ) || null; // [id, absence] ou null
  },
  isAgentAbsentOn(agentKey, dateStr) {
    return !!this.getAgentAbsenceOn(agentKey, dateStr);
  },
  isAgentAbsentToday(agentKey) {
    return this.isAgentAbsentOn(agentKey, isoDate(new Date()));
  },
  async addAbsence({ agentKey, startDate, endDate, motif, comment, createdBy }) {
    const id = `abs_${Date.now()}`;
    await this._ref(`absences/${id}`).set({
      agentKey, startDate, endDate,
      motif: motif || 'autre',
      comment: comment || null,
      createdBy: createdBy || null,
      createdAt: Date.now(),
    });
    return id;
  },
  async deleteAbsence(id) {
    await this._ref(`absences/${id}`).remove();
  },
  async updateAbsence(id, fields) {
    await this._ref(`absences/${id}`).update(fields);
  },

  // ── File d'attente ────────────────────────────────────────────
  _queueCbs: [],
  // ── Dernier appel par local (Firebase, pour rappel côté bureau) ──
  _lastCallPerLocal: {},
  _lastCallPerLocalCbs: [],
  initLastCallPerLocal() {
    this._ref('appState/lastCalls').on('value', snap => {
      this._lastCallPerLocal = snap.val() || {};
      this._lastCallPerLocalCbs.forEach(fn => fn());
    });
  },
  onLastCallPerLocalChange(fn) { this._lastCallPerLocalCbs.push(fn); },
  getLastCallForLocal(localId) { return this._lastCallPerLocal[String(localId)] || this._lastCallPerLocal[localId] || null; },
  async clearLastCallForLocal(localId) { await this._ref(`appState/lastCalls/${localId}`).remove(); },
  // ── État ouverture bureaux ───────────────────────────────────────
  _bureauState: {},
  _bureauCbs:   [],
  initBureauState() {
    this._ref('appState/bureaux').on('value', snap => {
      this._bureauState = snap.val() || {};
      this._bureauCbs.forEach(fn => fn());
    });
  },
  onBureauStateChange(fn) { this._bureauCbs.push(fn); },
  isBureauOpen(localId)          { return !!(this._bureauState[String(localId)]?.open); },
  getBureauPause(localId)        { return this._bureauState[String(localId)]?.pause || null; },
  getBureauOptedOut(localId)     { return !!(this._bureauState[String(localId)]?.optedOut); },
  getBureauDeclaredService(localId) { return this._bureauState[String(localId)]?.declaredService || null; },
  async setBureauDeclaredService(localId, service) {
    await this._ref(`appState/bureaux/${localId}/declaredService`).set(service || null);
  },

  async setBureauOptedOut(localId, optedOut) {
    if (optedOut) {
      await this._ref(`appState/bureaux/${localId}/optedOut`).set(true);
    } else {
      await this._ref(`appState/bureaux/${localId}/optedOut`).remove();
    }
  },

  async openBureau(localId) {
    const agentKey = sessionStorage.getItem('cpas_current_agent_key') || null;
    await this._ref(`appState/bureaux/${localId}`).set({ open: true, ts: Date.now(), agentKey });
    // Si l'agent avait le statut "en route" (late), l'effacer maintenant qu'il est arrivé
    if (agentKey && this._agentStatus[agentKey]?.status === 'late') {
      await this.setAgentStatus(agentKey, null);
    }
  },
  getBureauAgentKey(localId)            { return this._bureauState[String(localId)]?.agentKey || null; },
  isBureauBusyWithPreferred(localId)    { return !!(this._bureauState[String(localId)]?.busyWithPreferred); },
  async setBureauBusyWithPreferred(localId, busy) {
    if (busy) await this._ref(`appState/bureaux/${localId}/busyWithPreferred`).set(true);
    else      await this._ref(`appState/bureaux/${localId}/busyWithPreferred`).remove();
  },
  // Retourne le localId ouvert par l'agent courant (ou null si aucun)
  getOpenBureauForCurrentAgent() {
    const agentKey = sessionStorage.getItem('cpas_current_agent_key') || null;
    if (!agentKey) return null;
    const found = Object.entries(this._bureauState).find(([, state]) => state?.open && state?.agentKey === agentKey);
    return found ? parseInt(found[0]) : null;
  },
  async closeBureau(localId) {
    await this._ref(`appState/bureaux/${localId}`).set({ open: false, ts: Date.now() });
    await this.setQueue(localId, 0);
    // Désinscrire le local de toutes les files d'attente partagées
    const groups = this._config.queueGroups || {};
    await Promise.all(
      Object.keys(groups)
        .filter(gId => (groups[gId].localIds || []).map(Number).includes(Number(localId)))
        .map(gId => this.leaveQueueGroup(gId, localId))
    );
  },
  async setBureauPause(localId, { estimatedMin, comment }) {
    await this._ref(`appState/bureaux/${localId}/pause`).set({
      startedAt:    Date.now(),
      estimatedMin: estimatedMin || null,
      comment:      comment      || null,
    });
  },
  async clearBureauPause(localId) {
    await this._ref(`appState/bureaux/${localId}/pause`).remove();
  },

  _queueData: {},
  initQueue() {
    const today = isoDate(new Date());
    this._ref(`queues/${today}`).on('value', snap => {
      this._queueData = snap.val() || {};
      this._queueCbs.forEach(fn => fn());
    });
  },
  onQueueChange(fn) { this._queueCbs.push(fn); },

  // Retourne le premier groupe auquel appartient un local, ou null (rétro-compat)
  getLocalGroup(localId) {
    const lid = parseInt(localId);
    const groups = this._config.queueGroups || {};
    for (const [id, g] of Object.entries(groups)) {
      if ((g.localIds || []).map(Number).includes(lid)) return { id, ...g };
    }
    return null;
  },

  // Retourne TOUS les groupes auxquels appartient un local
  getLocalGroups(localId) {
    const lid = parseInt(localId);
    const groups = this._config.queueGroups || {};
    return Object.entries(groups)
      .filter(([, g]) => (g.localIds || []).map(Number).includes(lid))
      .map(([id, g]) => ({ id, ...g }));
  },

  // Parmi tous les groupes d'un local, retourne celui dont le prochain ticket à appeler
  // est le plus ancien (timestamp d'émission). Fallback : waitSince_, puis overflow max.
  getOldestOverflowGroup(localId) {
    const grps = this.getLocalGroups(localId).filter(g => this.getGroupOverflowQueue(g.id) > 0);
    if (!grps.length) return null;
    return grps.reduce((best, g) => {
      // Prochain ticket non-skippé de chaque groupe
      const nextN    = (n => { const issued = this.getTicketIssued(g.id); while (n <= issued && this.isTicketSkipped(g.id, n)) n++; return n; })(this.getTicketCalled(g.id) + 1);
      const bestNextN = (n => { const issued = this.getTicketIssued(best.id); while (n <= issued && this.isTicketSkipped(best.id, n)) n++; return n; })(this.getTicketCalled(best.id) + 1);
      const ts     = this.getTicketIssuedAt(g.id,    nextN)    || this.getGroupOverflowSince(g.id)    || Infinity;
      const bestTs = this.getTicketIssuedAt(best.id, bestNextN) || this.getGroupOverflowSince(best.id) || Infinity;
      return ts < bestTs ? g : best;
    });
  },

  getQueueGroups() { return this._config.queueGroups || {}; },

  // File individuelle du local (pas de logique groupe ici)
  getQueue(localId) {
    return this._queueData[String(localId)] || 0;
  },

  async setQueue(localId, n) {
    const today = isoDate(new Date());
    await this._ref(`queues/${today}/${localId}`).set(Math.max(0, n) || null);
  },

  // Routage de groupe : trouve le prochain local libre et l'incrémente
  // Retourne { localId, label } ou null si tous occupés
  async routeGroupQueue(groupId) {
    const grp = (this._config.queueGroups || {})[groupId];
    if (!grp) return null;
    const localIds = (grp.localIds || []).map(Number);
    // Un local est disponible si : ouvert, file vide, pas retiré, pas de préférence en attente, pas en cours avec un preferred
    const freeLocal = localIds.find(l =>
      this.isBureauOpen(l) &&
      this.getQueue(l) === 0 &&
      !this.getBureauOptedOut(l) &&
      !this.getPreferredPending(l) &&
      !this.isBureauBusyWithPreferred(l)
    );
    if (freeLocal == null) return null; // tous occupés ou aucun ouvert
    await this.setQueue(freeLocal, 1);
    return { localId: freeLocal, label: this.getPublicLocalLabel(freeLocal) };
  },

  // File d'attente en débordement (tous les locaux du groupe sont occupés)
  getGroupOverflowQueue(groupId) {
    return this._queueData[`wait_${groupId}`] || 0;
  },
  // Timestamp du premier ticket entré dans l'overflow (pour comparer avec preferredPending.ts)
  getGroupOverflowSince(groupId) {
    return this._queueData[`waitSince_${groupId}`] || null;
  },

  async incrementGroupOverflow(groupId) {
    const today = isoDate(new Date());
    const n = this.getGroupOverflowQueue(groupId) + 1;
    const writes = { [`wait_${groupId}`]: n };
    // Premier ticket dans l'overflow : enregistrer le timestamp d'arrivée
    if (n === 1) writes[`waitSince_${groupId}`] = Date.now();
    await this._ref(`queues/${today}`).update(writes);
  },

  async absorbGroupOverflow(groupId) {
    // Un local vient de se libérer et il y a des gens en attente →
    // on réaffecte directement ce local (queue reste à 1) et on décrémente l'overflow
    const today = isoDate(new Date());
    const n = this.getGroupOverflowQueue(groupId);
    if (n <= 0) return false;
    const writes = { [`wait_${groupId}`]: n - 1 || null };
    // Plus personne en overflow : effacer le timestamp
    if (n - 1 <= 0) writes[`waitSince_${groupId}`] = null;
    await this._ref(`queues/${today}`).update(writes);
    return true;
  },

  async clearGroupTickets(groupId) {
    const today = isoDate(new Date());
    const ref   = this._ref(`queues/${today}`);
    await ref.child(`tick_${groupId}`).remove();
    await ref.child(`tcall_${groupId}`).remove();
    await ref.child(`wait_${groupId}`).remove();
    await ref.child(`skip_${groupId}`).remove();
    await ref.child(`times_${groupId}`).remove();
    await ref.child(`names_${groupId}`).remove();
  },

  // Remet à zéro TOUTES les files (locaux + groupes) ET les demandes agent spécifique
  async resetAllQueues() {
    const today = isoDate(new Date());
    await this._ref(`queues/${today}`).remove();
    await this._ref('appState/preferredPending').remove();
    await this._ref('appState/preferredQueue').remove();
  },

  // Lit les données de file d'attente pour une plage de dates (historique)
  async fetchQueueRange(from, to) {
    const fromStr = isoDate(from);
    const toStr   = isoDate(to);
    const snap = await this._ref('queues')
      .orderByKey().startAt(fromStr).endAt(toStr).once('value');
    return snap.val() || {};
  },

  async fetchWaitStats(days = 7) {
    const results = {};
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = isoDate(d);
      const snap = await this._ref(`queueHistory/${dateStr}`).once('value');
      if (!snap.exists()) continue;
      snap.forEach(groupSnap => {
        const id = groupSnap.key;
        if (!results[id]) results[id] = { totalMs: 0, count: 0 };
        groupSnap.forEach(ticketSnap => {
          const v = ticketSnap.val();
          if (v?.waitMs > 0) { results[id].totalMs += v.waitMs; results[id].count++; }
        });
      });
    }
    return results;
  },

  // ── Tickets journaliers ──────────────────────────────────────────
  getTicketIssued(groupId) {
    return this._queueData[`tick_${groupId}`] || 0;
  },

  _ticketPrefix(groupId) {
    const groups = this._config.queueGroups || {};
    const grp    = groups[groupId];
    if (!grp?.name) return 'T';

    const _base = (name) => {
      const stop  = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'et', 'en', 'à', 'au', 'aux', 'un', 'une']);
      const words = name.trim().split(/\s+/).filter(w => !stop.has(w.toLowerCase()));
      const src   = words.length ? words : [name.trim()];
      return src.slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('') || 'T';
    };

    const base = _base(grp.name);

    // Détecter les conflits de préfixe entre groupes → numéroter à partir du 2e
    const conflicting = Object.entries(groups)
      .filter(([, g]) => g?.name && _base(g.name) === base)
      .map(([id]) => id)
      .sort();                       // tri stable par groupId

    const idx = conflicting.indexOf(groupId);
    return idx <= 0 ? base : `${base}${idx + 1}`;
  },

  formatTicket(groupId, n) {
    return `${this._ticketPrefix(groupId)}${String(n).padStart(2, '0')}`;
  },

  // Résout les conflits de prénom dans une même file :
  // si "Hugo" existe déjà → retourne "Hugo 2", "Hugo 3", etc.
  // N'inclut que les tickets réellement en attente (tcall+1..tick, hors skip_)
  _resolveTicketName(groupId, name) {
    const tcall    = this.getTicketCalled(groupId);
    const tick     = this.getTicketIssued(groupId);
    const namesData = this._queueData[`names_${groupId}`] || {};
    const skipData  = this._queueData[`skip_${groupId}`]  || {};
    const existing = Object.entries(namesData)
      .filter(([n]) => { const num = parseInt(n, 10); return num > tcall && num <= tick && !skipData[n]; })
      .map(([, v]) => v.toLowerCase());
    const base = name.trim();
    if (!existing.includes(base.toLowerCase())) return base;
    let i = 2;
    while (existing.includes(`${base.toLowerCase()} ${i}`)) i++;
    return `${base} ${i}`;
  },

  async issueTicket(groupId, beneficiaryName) {
    const today = isoDate(new Date());
    const n = this.getTicketIssued(groupId) + 1;
    const writes = { [`tick_${groupId}`]: n, [`times_${groupId}/${n}`]: Date.now() };
    let resolvedName = null;
    if (beneficiaryName) {
      resolvedName = this._resolveTicketName(groupId, beneficiaryName.trim());
      writes[`names_${groupId}/${n}`] = resolvedName;
    }
    await this._ref(`queues/${today}`).update(writes);
    // Retourne { label: numéro formaté, resolvedName: nom résolu (null si pas de nom) }
    return { label: this.formatTicket(groupId, n), resolvedName };
  },

  // Timestamp d'émission du ticket N d'un groupe (pour comparer l'ancienneté inter-groupes)
  getTicketIssuedAt(groupId, n) {
    return this._queueData[`times_${groupId}`]?.[String(n)] || null;
  },

  getTicketName(groupId, number) {
    return this._queueData[`names_${groupId}`]?.[String(number)] || null;
  },
  // Retourne le label à afficher : nom du bénéficiaire si dispo, sinon numéro formaté
  // nameOverride permet de passer le nom déjà lu (quand il vient d'être supprimé de Firebase)
  formatTicketDisplay(groupId, number, nameOverride) {
    const name = nameOverride !== undefined ? nameOverride : this.getTicketName(groupId, number);
    if (name) return name;
    return this.formatTicket(groupId, number);
  },

  // Label affiché du prochain ticket en attente dans l'overflow
  getNextQueueTicketDisplay(groupId) {
    const next = (this._queueData[`tcall_${groupId}`] || 0) + 1;
    return this.formatTicketDisplay(groupId, next);
  },

  getTicketCalled(groupId) {
    return this._queueData[`tcall_${groupId}`] || 0;
  },

  // Tickets reçus hors-ordre (prioritaires) — exclus de l'affichage EN ATTENTE
  isTicketSkipped(groupId, n) {
    return !!(this._queueData[`skip_${groupId}`]?.[String(n)]);
  },

  async callNextTicket(groupId) {
    const today  = isoDate(new Date());
    const issued = this.getTicketIssued(groupId);
    let   called = this.getTicketCalled(groupId) + 1;

    // Avancer automatiquement les tickets reçus hors-ordre (prioritaires déjà traités)
    const writes = {};
    while (called <= issued && this.isTicketSkipped(groupId, called)) {
      writes[`skip_${groupId}/${called}`] = null; // supprimer le marqueur
      called++;
    }
    writes[`tcall_${groupId}`] = called;

    // Lire le nom et le timestamp AVANT suppression
    const name     = this.getTicketName(groupId, called);
    const issuedAt = this.getTicketIssuedAt(groupId, called);
    await this._ref(`queues/${today}`).update(writes);
    if (name) await this._ref(`queues/${today}/names_${groupId}/${called}`).remove();
    await this._ref(`queues/${today}/times_${groupId}/${called}`).remove();

    // Archiver dans queueHistory pour les stats de temps d'attente (fire-and-forget)
    const calledAt = Date.now();
    if (issuedAt && issuedAt > 0) {
      this._ref(`queueHistory/${today}/${groupId}/${called}`)
        .set({ issuedAt, calledAt, waitMs: calledAt - issuedAt })
        .catch(() => {});
    }

    const label   = this.formatTicket(groupId, called);
    const display = name || label;
    return { display, label, name: name || null };
  },

  async dismissTicket(groupId, ticketNumber) {
    // Retire UN SEUL ticket via skip_ (ou avance tcall s'il est le suivant direct)
    const today   = isoDate(new Date());
    const current = this.getTicketCalled(groupId);
    if (ticketNumber <= current) return; // déjà traité

    const writes = {};
    if (ticketNumber === current + 1) {
      // C'est le ticket suivant : avancer tcall, absorber les skip_ consécutifs
      let newCall = ticketNumber;
      const tick  = this.getTicketIssued(groupId);
      while (newCall + 1 <= tick && this.isTicketSkipped(groupId, newCall + 1)) {
        writes[`skip_${groupId}/${newCall + 1}`] = null;
        newCall++;
      }
      writes[`tcall_${groupId}`] = newCall;
    } else {
      // Ticket en milieu de file : marquer skip_ sans toucher tcall
      writes[`skip_${groupId}/${ticketNumber}`] = true;
    }

    // Décrémenter l'overflow de 1 (un seul ticket retiré)
    const overflow = this.getGroupOverflowQueue(groupId);
    if (overflow > 0) {
      const newOverflow = Math.max(0, overflow - 1);
      writes[`wait_${groupId}`]     = newOverflow || null;
      if (newOverflow <= 0) writes[`waitSince_${groupId}`] = null;
    }

    await this._ref(`queues/${today}`).update(writes);
    await this._ref(`queues/${today}/names_${groupId}/${ticketNumber}`).remove();
    await this._ref(`queues/${today}/times_${groupId}/${ticketNumber}`).remove();

    // Nettoyer la demande spécifique (preferred) associée à ce ticket si elle existe
    const ticketLabel = this.formatTicket(groupId, ticketNumber);
    const prefMatch = this.findPreferredPendingByTicket(ticketLabel);
    if (prefMatch) {
      if (prefMatch.pend.requestId) {
        await this._ref(`appState/preferredRequests/${prefMatch.pend.requestId}`).update({ status: 'done', benefName: null });
      }
      await this._ref(`appState/preferredPending/${prefMatch.localId}`).remove();
      await this.shiftPreferredQueue(prefMatch.localId);
    } else {
      // Chercher dans preferredQueue de tous les locaux
      for (const [lidStr, queueData] of Object.entries(this._preferredQueue || {})) {
        for (const [key, item] of Object.entries(queueData || {})) {
          if (item.ticketLabel === ticketLabel) {
            if (item.requestId) {
              await this._ref(`appState/preferredRequests/${item.requestId}`).update({ status: 'done', benefName: null });
            }
            await this._ref(`appState/preferredQueue/${lidStr}/${key}`).remove();
            break;
          }
        }
      }
    }
  },

  async writeLastCall(localId, agentName, groupName, ticketNum, ticketLabel, ticketName) {
    const payload = {
      localId:     Number(localId),
      agentName:   agentName   || null,
      groupName:   groupName   || null,
      ticketNum:   ticketNum   || null,   // display (rétro-compatibilité)
      ticketLabel: ticketLabel || null,   // ex. "M01"
      ticketName:  ticketName  || null,   // ex. "Michel" (tickets nominatifs)
      ts: Date.now()
    };
    // Écriture globale (vue publique) + par local (rappel côté bureau)
    await Promise.all([
      this._ref('appState/lastCall').set(payload),
      this._ref(`appState/lastCalls/${localId}`).set(payload),
    ]);
  },

  async saveQueueGroup(id, name, localIds, services = []) {
    await this._ref(`appConfig/queueGroups/${id}`).set({
      name,
      localIds: localIds.map(Number),
      services: services.length ? services : null,
    });
  },

  // Vérifie si un nom de service correspond au groupe d'un local
  serviceMatchesGroup(serviceName, grp) {
    if (!grp || !serviceName) return true;
    const svcLow = serviceName.toLowerCase();
    const grpServices = grp.services || [];
    if (grpServices.length > 0) {
      return grpServices.some(s => s.toLowerCase() === svcLow);
    }
    // Fallback : correspondance partielle avec le nom du groupe
    const grpLow = (grp.name || '').toLowerCase();
    return svcLow === grpLow || svcLow.includes(grpLow) || grpLow.includes(svcLow);
  },

  async deleteQueueGroup(id) {
    await this._ref(`appConfig/queueGroups/${id}`).remove();
  },

  // Ajoute un local à la liste d'un groupe (inscription dynamique depuis la vue bureau)
  async joinQueueGroup(groupId, localId) {
    const grp = (this._config.queueGroups || {})[groupId];
    if (!grp) return;
    const ids = [...new Set([...(grp.localIds || []).map(Number), Number(localId)])];
    await this._ref(`appConfig/queueGroups/${groupId}/localIds`).set(ids);
  },

  // Retire un local de la liste d'un groupe (désinscription dynamique)
  async leaveQueueGroup(groupId, localId) {
    const grp = (this._config.queueGroups || {})[groupId];
    if (!grp) return;
    const ids = (grp.localIds || []).map(Number).filter(l => l !== Number(localId));
    await this._ref(`appConfig/queueGroups/${groupId}/localIds`).set(ids.length ? ids : null);
  },

  // ── Lieux publics ────────────────────────────────────────────────
  getPublicPlaces() { return this._config.publicPlaces || []; },

  async addPublicPlace(name, description) {
    const maxOrder = (this._config.publicPlaces || []).reduce((m, p) => Math.max(m, p.order ?? 0), -1);
    await this._ref('appConfig/publicPlaces').push({ name, description: description || null, order: maxOrder + 1 });
  },

  async updatePublicPlace(id, name, description) {
    await this._ref(`appConfig/publicPlaces/${id}`).update({ name, description: description || null });
  },

  async deletePublicPlace(id) {
    await this._ref(`appConfig/publicPlaces/${id}`).remove();
  },

  // ── Paramètre durée conservation données sensibles ───────────────
  getSensitivDataDeleteMin() { return this._config.sensitivDataDeleteMin ?? 30; },
  async setSensitivDataDeleteMin(min) {
    await this._ref('appConfig/meta/sensitivDataDeleteMin').set(parseInt(min) || 30);
  },

  // ── Demandes "Ne veut voir qu'un agent" ─────────────────────────
  // Retourne le localId ouvert par un agentKey donné (null si aucun)
  getBureauByAgent(agentKey) {
    const found = Object.entries(this._bureauState)
      .find(([, state]) => state?.open && state?.agentKey === agentKey);
    return found ? parseInt(found[0]) : null;
  },

  _preferredPending: {},
  _preferredPendingCbs: [],

  // Listener top-level unique — fiable dès le démarrage, sans dépendance au config timing
  initPreferredPending() {
    this._ref('appState/preferredPending').on('value', snap => {
      this._preferredPending = snap.val() || {};
      this._preferredPendingCbs.forEach(fn => fn());
    });
  },

  onPreferredPendingChange(fn) {
    this._preferredPendingCbs.push(fn);
  },

  getPreferredPending(localId) {
    return this._preferredPending[String(localId)] || this._preferredPending[localId] || null;
  },

  // Cherche dans tous les preferredPending lequel correspond à ce ticketLabel
  findPreferredPendingByTicket(ticketLabel) {
    if (!ticketLabel) return null;
    for (const [lidStr, pend] of Object.entries(this._preferredPending || {})) {
      if (pend?.ticketLabel === ticketLabel) return { localId: parseInt(lidStr), pend };
    }
    return null;
  },

  // ── File d'attente preferred par local (plusieurs personnes qui veulent le même agent) ──
  _preferredQueue: {},
  _preferredQueueCbs: [],

  initPreferredQueue() {
    this._ref('appState/preferredQueue').on('value', snap => {
      this._preferredQueue = snap.val() || {};
      this._preferredQueueCbs.forEach(fn => fn());
    });
  },

  onPreferredQueueChange(fn) {
    this._preferredQueueCbs.push(fn);
  },

  getPreferredQueue(localId) {
    const entries = this._preferredQueue[String(localId)] || {};
    return Object.entries(entries)
      .map(([key, val]) => ({ _key: key, ...val }))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  },

  async pushToPreferredQueue(localId, item) {
    await this._ref(`appState/preferredQueue/${localId}`).push(item);
  },

  // Retire le premier de la queue et le promeut en preferredPending. Retourne l'item promu ou null.
  async shiftPreferredQueue(localId) {
    const queue = this.getPreferredQueue(localId);
    if (!queue.length) return null;
    const next = queue[0];
    await this._ref(`appState/preferredQueue/${localId}/${next._key}`).remove();
    await this._ref(`appState/preferredPending/${localId}`).set({
      displayName:     next.displayName     || '—',
      agentPublicName: next.agentPublicName || null,
      requestId:       next.requestId,
      ticketLabel:     next.ticketLabel     || null,
      ts:              Date.now(),
    });
    return next;
  },

  async createPreferredRequest(benefName, targetAgentKey, accueilAgentKey, publicPlaceId, publicPlaceName, localId) {
    const ref = await this._ref('appState/preferredRequests').push({
      benefName,
      targetAgentKey,
      accueilAgentKey,
      publicPlaceId:   publicPlaceId   || null,
      publicPlaceName: publicPlaceName || null,
      localId:         localId         || null,
      status:          'pending',
      etaMin:          null,
      agentComment:    null,
      requestedAt:     Date.now(),
      respondedAt:     null,
      nameDeleteAt:    null,
    });
    return { requestId: ref.key };
  },

  async respondToPreferredRequest(requestId, response, etaMin, comment, localId, agentPublicName, displayName) {
    const updates = {
      status:       response,
      etaMin:       etaMin   || null,
      agentComment: comment  || null,
      respondedAt:  Date.now(),
    };
    await this._ref(`appState/preferredRequests/${requestId}`).update(updates);
    // Créer preferredPending sur l'écran public si l'agent est dans un local
    if ((response === 'accepted' || response === 'eta') && localId) {
      // Si le local appartient à un groupe de file, émettre un ticket pour stats + impression
      const grp = this.getLocalGroup(localId);
      let ticketLabel   = null;
      let resolvedName  = displayName;
      if (grp) {
        const result = await this.issueTicket(grp.id, displayName || null);
        ticketLabel  = result.label;
        resolvedName = result.resolvedName || displayName; // nom dédupliqué = cohérent avec EN ATTENTE
        await this.incrementGroupOverflow(grp.id);
      }
      await this._ref(`appState/preferredPending/${localId}`).set({
        displayName:     resolvedName   || '—',
        agentPublicName: agentPublicName || null,
        requestId,
        ticketLabel:     ticketLabel || null,
        ts: Date.now(),
      });
    }
    return { ticketLabel };
  },

  async closePreferredRequest(requestId, localId) {
    await this._ref(`appState/preferredRequests/${requestId}`).update({
      status:    'done',
      benefName: null,    // suppression immédiate données sensibles
    });
    if (localId) {
      // Si un ticket avait été émis pour ce client, le marquer comme "appelé" pour les stats
      const pend = this.getPreferredPending(localId);
      if (pend?.ticketLabel) {
        const grp = this.getLocalGroup(localId);
        if (grp) {
          const m = pend.ticketLabel.match(/(\d+)$/);
          const ticketNum = m ? parseInt(m[1], 10) : null;
          if (ticketNum !== null) {
            const today = isoDate(new Date());
            // Marquer le ticket comme traité hors-ordre (skip_) sans avancer tcall_
            // → les tickets intermédiaires (avant ce numéro) restent visibles en EN ATTENTE
            const overflow = this.getGroupOverflowQueue(grp.id);
            const writes   = { [`skip_${grp.id}/${ticketNum}`]: true };
            await this._ref(`queues/${today}/names_${grp.id}/${ticketNum}`).remove();
            if (overflow > 0) {
              const newOverflow = Math.max(0, overflow - 1);
              writes[`wait_${grp.id}`] = newOverflow || null;
              if (newOverflow <= 0) writes[`waitSince_${grp.id}`] = null;
            }
            await this._ref(`queues/${today}`).update(writes);
          }
        }
      }
      await this._ref(`appState/preferredPending/${localId}`).remove();
    }
  },

  async cancelPreferredRequest(requestId, localId) {
    await this._ref(`appState/preferredRequests/${requestId}`).update({
      status:    'cancelled',
      benefName: null,
    });
    if (localId) {
      const grp = this.getLocalGroup(localId);
      const today = isoDate(new Date());

      // Helper : annuler le ticket associé à un ticketLabel
      const cancelTicketLabel = async (ticketLabel) => {
        if (!ticketLabel || !grp) return;
        const m = ticketLabel.match(/(\d+)$/);
        const ticketNum = m ? parseInt(m[1], 10) : null;
        if (ticketNum === null) return;
        await this._ref(`queues/${today}/names_${grp.id}/${ticketNum}`).remove();
        const issued = this.getTicketIssued(grp.id);
        const writes = {};
        if (ticketNum === issued) {
          // Dernier ticket : décrémenter tick_ pour éviter un trou en fin de file
          writes[`tick_${grp.id}`] = issued - 1 || null;
        } else {
          // Milieu de file : marquer skip_ pour l'exclure de l'affichage sans décaler les autres
          writes[`skip_${grp.id}/${ticketNum}`] = true;
        }
        const ovf = this.getGroupOverflowQueue(grp.id);
        if (ovf > 0) {
          const newOvf = ovf - 1;
          writes[`wait_${grp.id}`] = newOvf || null;
          if (newOvf <= 0) writes[`waitSince_${grp.id}`] = null;
        }
        if (Object.keys(writes).length) await this._ref(`queues/${today}`).update(writes);
      };

      // Vérifier si c'est dans preferredPending
      const pend = this.getPreferredPending(localId);
      if (pend?.requestId === requestId) {
        await cancelTicketLabel(pend.ticketLabel);
        await this._ref(`appState/preferredPending/${localId}`).remove();
        return;
      }

      // Vérifier si c'est dans preferredQueue (en attente derrière le pending actuel)
      const queue = this.getPreferredQueue(localId);
      const queueItem = queue.find(item => item.requestId === requestId);
      if (queueItem) {
        await cancelTicketLabel(queueItem.ticketLabel);
        await this._ref(`appState/preferredQueue/${localId}/${queueItem._key}`).remove();
        return;
      }

      // Fallback : retirer le pending si requestId correspond (legacy sans requestId stocké)
      if (pend) {
        await this._ref(`appState/preferredPending/${localId}`).remove();
      }
    }
  },

  async markPreferredRequestNameRead(requestId, deleteMin) {
    const deleteAt = Date.now() + (deleteMin || 30) * 60000;
    await this._ref(`appState/preferredRequests/${requestId}/nameDeleteAt`).set(deleteAt);
  },

  async erasePreferredRequestSensitiveData(requestId) {
    await this._ref(`appState/preferredRequests/${requestId}/benefName`).remove();
  },

  // Lecture d'une demande preferred (one-time)
  async getPreferredRequest(requestId) {
    const snap = await this._ref(`appState/preferredRequests/${requestId}`).once('value');
    return snap.val();
  },

  // Nettoyage au démarrage : effacer les benefName expirés
  async cleanExpiredPreferredData() {
    const snap = await this._ref('appState/preferredRequests').once('value');
    const all = snap.val() || {};
    const now = Date.now();
    for (const [id, req] of Object.entries(all)) {
      if (req.nameDeleteAt && req.nameDeleteAt <= now && req.benefName) {
        await this._ref(`appState/preferredRequests/${id}/benefName`).remove();
      }
    }
  },

  // ── Notifications ────────────────────────────────────────────────
  _notifCbs: [],
  listenNotifs(agentKey, callback) {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this._ref('notifications').orderByChild('createdAt').startAt(sevenDaysAgo).on('value', snap => {
      const all = snap.val() || {};
      const filtered = {};
      Object.entries(all).forEach(([id, n]) => {
        // Garder si broadcast (null) ou ciblé sur cet agent
        if (!n.targetAgentKey || n.targetAgentKey === agentKey) {
          // Respecter la date d'expiration
          if (!n.expiresAt || n.expiresAt > Date.now()) {
            filtered[id] = n;
          }
        }
      });
      callback(filtered);
    });
  },

  async sendNotif(message, type, targetAgentKey, opts = {}) {
    const { urgent, expiresMin, ...extra } = opts;
    const ref = await this._ref('notifications').push({
      message,
      type:           type || 'info',
      urgent:         urgent ? true : null,
      targetAgentKey: targetAgentKey || null,
      createdAt:      Date.now(),
      expiresAt:      expiresMin ? Date.now() + expiresMin * 60000 : null,
      sourceAgentKey: sessionStorage.getItem('cpas_current_agent_key') || null,
      ...extra,  // fromAgentKey, fromAgentName, replyable, description, local, etc.
    });
    return ref.key;
  },

  // Envoie une notif "problème technique" à chaque technicien ciblé
  async sendTechRequest(description, local, technicianKeys) {
    const myKey  = sessionStorage.getItem('cpas_current_agent_key') || null;
    const myName = myKey ? (this.getAgentsWithKeys().find(a => a.key === myKey)?.name || myKey) : 'Un agent';
    const localTxt = local ? ` — ${local}` : '';
    const message = `🔧 Problème technique${localTxt}\n${description}`;
    const base = {
      type:           'tech_request',
      message,
      fromAgentKey:   myKey,
      fromAgentName:  myName,
      local:          local || null,
      description,
      replyable:      true,
      createdAt:      Date.now(),
      sourceAgentKey: myKey,
    };
    const ids = [];
    for (const key of technicianKeys) {
      const ref = await this._ref('notifications').push({ ...base, targetAgentKey: key });
      ids.push(ref.key);
    }
    return ids;
  },

  // Envoie une réponse d'un technicien à l'agent demandeur
  async sendTechReply(techRequestNotifId, fromAgentKey, eta, comment) {
    const fromName = fromAgentKey ? (this.getAgentsWithKeys().find(a => a.key === fromAgentKey)?.name || fromAgentKey) : 'Tech';
    const etaTxt   = eta?.trim()     || '';
    const comTxt   = comment?.trim() || '';
    const parts    = [etaTxt, comTxt].filter(Boolean);
    const message  = `↩️ Réponse de ${fromName} — ${parts.join(' — ')}`;
    // Lire la notif originale pour trouver l'expéditeur
    const origSnap = await this._ref(`notifications/${techRequestNotifId}`).once('value');
    const orig     = origSnap.val();
    if (!orig) return;
    await this._ref('notifications').push({
      type:             'tech_reply',
      message,
      fromAgentKey,
      fromAgentName:    fromName,
      eta:              etaTxt || null,
      comment:          comTxt || null,
      techRequestId:    techRequestNotifId,
      targetAgentKey:   orig.fromAgentKey || null,
      createdAt:        Date.now(),
      sourceAgentKey:   fromAgentKey,
    });
    // Marquer la notif originale comme "répondue"
    await this._ref(`notifications/${techRequestNotifId}/replied`).set(true);
  },

  async markNotifRead(notifId) {
    const agentKey = sessionStorage.getItem('cpas_current_agent_key');
    if (!agentKey) return;
    await this._ref(`notifications/${notifId}/readBy/${agentKey}`).set(Date.now());
  },

  async deleteNotif(notifId) {
    await this._ref(`notifications/${notifId}`).remove();
  },

  async cleanOldNotifs() {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const snap = await this._ref('notifications').orderByChild('createdAt').endAt(cutoff).once('value');
    const old = snap.val() || {};
    const updates = {};
    Object.keys(old).forEach(id => { updates[`notifications/${id}`] = null; });
    if (Object.keys(updates).length) await this._update(updates);
  },

  // ── Requests (tickets intervention) ──────────────────────────────
  _requests:    {},
  _requestCbs:  [],
  listenRequests() {
    this._ref('requests').on('value', snap => {
      this._requests = snap.val() || {};
      this._requestCbs.forEach(fn => fn(this._requests));
    });
  },
  onRequestChange(fn) { this._requestCbs.push(fn); },
  getRequests()       { return this._requests; },

  async createRequest({ type, description, local, urgent, fromAgentKey, fromAgentName }) {
    const id = `req_${Date.now()}`;
    await this._ref(`requests/${id}`).set({
      type:         type || 'technique',
      description,
      local:        local || null,
      urgent:       urgent ? true : null,
      fromAgentKey: fromAgentKey || null,
      fromAgentName: fromAgentName || null,
      status:       'open',
      assignedTo:   null,
      assignedToName: null,
      assignedAt:   null,
      createdAt:    Date.now(),
    });
    return id;
  },

  async claimRequest(requestId) {
    const myKey  = sessionStorage.getItem('cpas_current_agent_key');
    const myName = myKey ? (this.getAgentsWithKeys().find(a => a.key === myKey)?.name || myKey) : null;
    await this._ref(`requests/${requestId}`).update({
      status:        'in_progress',
      assignedTo:    myKey,
      assignedToName: myName,
      assignedAt:    Date.now(),
    });
  },

  async assignRequest(requestId, agentKey) {
    const agentName = this.getAgentsWithKeys().find(a => a.key === agentKey)?.name || agentKey;
    await this._ref(`requests/${requestId}`).update({
      status:        'in_progress',
      assignedTo:    agentKey,
      assignedToName: agentName,
      assignedAt:    Date.now(),
    });
  },

  async setRequestStatus(requestId, status) {
    await this._ref(`requests/${requestId}/status`).set(status);
  },

  async addRequestComment(requestId, text) {
    const myKey  = sessionStorage.getItem('cpas_current_agent_key');
    const myName = myKey ? (this.getAgentsWithKeys().find(a => a.key === myKey)?.name || myKey) : 'Anonyme';
    await this._ref(`requests/${requestId}/comments`).push({
      agentKey: myKey,
      agentName: myName,
      text,
      createdAt: Date.now(),
    });
  },

  async deleteRequest(requestId) {
    await this._ref(`requests/${requestId}`).remove();
  },

  // Fin de journée — vider tous les bureaux et présences backoffice
  async clearAllLocals() {
    const updates = {};
    // Fermer tous les bureaux (inclut les présences backoffice stockées sous appState/bureaux)
    Object.keys(this._bureauState).forEach(id => {
      updates[`appState/bureaux/${id}`] = null;
    });
    if (Object.keys(updates).length) await this._update(updates);
  },

  // Fin de journée — marquer tous les agents connectés comme "Au revoir"
  async goodbyeAllAgents() {
    const today   = isoDate(new Date());
    const updates = {};
    Object.entries(this._agentStatus).forEach(([agentKey, status]) => {
      if (!status?.connectedAt) return;          // pas connecté aujourd'hui
      if (status?.status === 'done') return;     // déjà parti
      const keep = { status: 'done', logoutAt: Date.now() };
      if (status.connectedAt) keep.connectedAt = status.connectedAt;
      if (status.dnd)         keep.dnd         = true;
      updates[`agentStatus/${today}/${agentKey}`] = keep;
    });
    if (Object.keys(updates).length) await this._update(updates);
  },

  async addAgent(name, publicName) {
    const ref = await this._ref('appConfig/agents').push(name);
    if (publicName && publicName !== name) {
      await this._ref(`appConfig/agentPublicNames/${ref.key}`).set(publicName);
    }
    return ref.key;
  },

  // Niveau de volume son : 0=muet 0.5=discret 1=normal 1.5=fort 2=très fort (défaut 1)
  getSoundLevel()    { return this._config.features?.soundLevel ?? 1; },
  async setSoundLevel(v) { await this._ref('appConfig/features/soundLevel').set(v); },

  getAgentPublicName(key) {
    return this._config.agentPublicNames?.[key] || null;
  },
  // Nom d'affichage public d'un agent (public name configuré, sinon nom normal)
  getAgentDisplayName(key) {
    if (!key) return null;
    return this._config.agentPublicNames?.[key]
      || this.getAgentsWithKeys().find(a => a.key === key)?.name
      || null;
  },
  // Nom d'affichage public de l'agent actuellement dans un bureau
  getBureauAgentDisplayName(localId) {
    return this.getAgentDisplayName(this.getBureauAgentKey(localId));
  },
  async removeAgentByKey(key) {
    await this._ref(`appConfig/agents/${key}`).remove();
  },
  async addService(name) {
    await this._ref('appConfig/services').push(name);
  },
  async removeServiceByKey(key) {
    await this._ref(`appConfig/services/${key}`).remove();
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
    await this._ref(`appConfig/lieux/${lieuId}/name`).set(name);
  },

  async setLieuPublicName(lieuId, publicName) {
    await this._ref(`appConfig/lieux/${lieuId}/publicName`).set(publicName || null);
  },

  getPublicPermLieux() {
    return this._config.publicPermLieux || {};
  },

  async setPublicPermLieux(lieuIds) {
    // lieuIds = array of lieuId strings to show permanences for
    const obj = {};
    lieuIds.forEach(id => { obj[id] = true; });
    await this._ref('appConfig/publicPermLieux').set(Object.keys(obj).length ? obj : null);
  },

  async addLieu(name) {
    const maxOrder = Object.values(this._lieux).reduce((m, l) => Math.max(m, l.order ?? 0), -1);
    const ref = await this._ref('appConfig/lieux').push({ name, order: maxOrder + 1, localIds: {} });
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
    await this._update(updates);
  },

  async removeLieu(lieuId) {
    const lieu = this._lieux[lieuId];
    const updates = { [`appConfig/lieux/${lieuId}`]: null };
    if (lieu?.localIds) {
      lieu.localIds.forEach(id => { updates[`appConfig/localLabels/${id}`] = null; });
    }
    await this._update(updates);
  },

  async addLocalToLieu(lieuId, label) {
    const allIds = Object.values(this._lieux).flatMap(l => l.localIds);
    const newId  = allIds.length ? Math.max(...allIds) + 1 : 1;
    const updates = {
      [`appConfig/localLabels/${newId}`]:              label || `Local ${newId}`,
      [`appConfig/lieux/${lieuId}/localIds/${newId}`]: true
    };
    await this._update(updates);
    return newId;
  },

  async removeLocal(lieuId, localId) {
    await this._update({
      [`appConfig/lieux/${lieuId}/localIds/${localId}`]: null,
      [`appConfig/localLabels/${localId}`]:              null
    });
  },

  // ── Horaires & jours actifs par lieu ─────────────────────────────
  // activeDays : objet {0:true, 1:true, ...} avec 0=Dim…6=Sam
  // Valeurs null → fallback sur CONFIG (HOURS_START/END/SLOT_MIN, lun-ven)
  getLieuConfig(lieuId) {
    const id   = lieuId || this._currentLieuId;
    const lieu = this._lieux[id] || {};
    return {
      openHour:   lieu.openHour  ?? CONFIG.HOURS_START,
      closeHour:  lieu.closeHour ?? CONFIG.HOURS_END,
      slotMin:    lieu.slotMin   ?? CONFIG.SLOT_MIN,
      activeDays: lieu.activeDays || { 1: true, 2: true, 3: true, 4: true, 5: true },
    };
  },

  isDayActive(date, lieuId) {
    const cfg = this.getLieuConfig(lieuId);
    return !!cfg.activeDays[date.getDay()];
  },

  async setLieuHours(lieuId, openHour, closeHour, slotMin, activeDays) {
    await this._update({
      [`appConfig/lieux/${lieuId}/openHour`]:   openHour,
      [`appConfig/lieux/${lieuId}/closeHour`]:  closeHour,
      [`appConfig/lieux/${lieuId}/slotMin`]:    slotMin,
      [`appConfig/lieux/${lieuId}/activeDays`]: activeDays,
    });
  },

  // ── Écrans publics ───────────────────────────────────────────────
  // Un écran = un sous-ensemble nommé de locaux affiché via ?screen={id}
  getScreens() {
    return Object.entries(this._config.screens || {})
      .map(([id, s]) => ({
        id,
        name:     s.name     || 'Écran sans nom',
        order:    s.order    ?? 999,
        localIds: s.localIds ? Object.keys(s.localIds).map(Number).sort((a,b) => a-b) : [],
      }))
      .sort((a, b) => a.order - b.order);
  },

  async addScreen(name) {
    const order = Object.keys(this._config.screens || {}).length;
    const ref = await this._ref('appConfig/screens').push({ name, order, localIds: {} });
    return ref.key;
  },

  async renameScreen(id, name) {
    await this._ref(`appConfig/screens/${id}/name`).set(name);
  },

  async setScreenLocals(id, localIdsObj) {
    // localIdsObj : { 1: true, 3: true, ... } ou null pour vider
    await this._ref(`appConfig/screens/${id}/localIds`).set(localIdsObj || null);
  },

  async removeScreen(id) {
    await this._ref(`appConfig/screens/${id}`).remove();
  },

  // ── Rôles & Permissions ──────────────────────────────────────────
  // Clés de permission disponibles (source unique de vérité)
  PERM_KEYS: [
    { key: 'createReservation', label: 'Créer une réservation' },
    { key: 'editReservation',   label: 'Modifier une réservation' },
    { key: 'deleteReservation', label: 'Supprimer une réservation' },
    { key: 'inviteAgents',      label: 'Inviter des agents sur un RDV' },
    { key: 'manageAgentStatus', label: 'Modifier le statut d\'un autre agent' },
    { key: 'openBureau',        label: 'Ouvrir un bureau' },
    { key: 'closeBureau',       label: 'Fermer un bureau' },
    { key: 'managePause',       label: 'Gérer les pauses' },
    { key: 'manageQueue',       label: 'Gérer la file d\'attente' },
    { key: 'sendPublicMessage', label: 'Modifier le message public' },
    { key: 'sendNotif',         label: 'Envoyer une notification aux agents' },
    { key: 'sendUrgentNotif',   label: 'Envoyer une notification urgente 🚨' },
    { key: 'viewAnalytics',     label: 'Voir les statistiques' },
    { key: 'editSettings',      label: 'Modifier les paramètres (admin)' },
    { key: 'managePlanning',    label: 'Créer/modifier le planning des agents' },
    { key: 'viewAllPlanning',   label: 'Voir le planning de tous les agents' },
    { key: 'panicButton',       label: 'Accès au bouton panique 🚨' },
    { key: 'panicDemo',         label: 'Démo du bouton panique (formation) 🧪' },
    { key: 'kickFromLocal',        label: 'Retirer un agent de son local (kick)' },
    { key: 'canAnnounceArrival',   label: 'Prévenir les collègues à l\'arrivée (modal mascotte)' },
  ],

  // Rôles par défaut utilisés si aucun rôle n'est défini dans Firebase
  // Chaque rôle a un introType implicite (= son propre ID) pour la page welcome.html
  _defaultPermRoles: {
    '__admin__': {
      name: 'Admin', color: '#ef4444', isBuiltin: true,
      perms: { createReservation:true, editReservation:true, deleteReservation:true,
               inviteAgents:true, manageAgentStatus:true, openBureau:true, closeBureau:true,
               managePause:true, manageQueue:true, sendPublicMessage:true, sendNotif:true,
               sendUrgentNotif:true, viewAnalytics:true, editSettings:true,
               managePlanning:true, viewAllPlanning:true, panicButton:true, kickFromLocal:true, panicDemo:true },
    },
    '__direction__': {
      // Vue complète + analytics, pas de gestion opérationnelle directe
      name: 'Direction', color: '#0369a1', isBuiltin: true,
      perms: { createReservation:false, editReservation:false, deleteReservation:false,
               inviteAgents:false, manageAgentStatus:true, openBureau:false, closeBureau:false,
               managePause:false, manageQueue:false, sendPublicMessage:true, sendNotif:true,
               sendUrgentNotif:true, viewAnalytics:true, editSettings:false,
               managePlanning:true, viewAllPlanning:true, panicButton:false, kickFromLocal:false, canAnnounceArrival:true, panicDemo:false },
    },
    '__chef_service__': {
      // Coordination équipe : voit tout, peut notifier, peut modifier les RDV de l'équipe
      name: 'Chef de service', color: '#0f766e', isBuiltin: true,
      perms: { createReservation:true, editReservation:true, deleteReservation:true,
               inviteAgents:true, manageAgentStatus:true, openBureau:true, closeBureau:true,
               managePause:true, manageQueue:true, sendPublicMessage:true, sendNotif:true,
               sendUrgentNotif:false, viewAnalytics:true, editSettings:false,
               managePlanning:true, viewAllPlanning:true, panicButton:false, kickFromLocal:true, canAnnounceArrival:true, panicDemo:false },
    },
    '__as__': {
      // Assistant social : gère ses RDV et sa file, collabore avec l'équipe
      name: 'Assistant·e social·e', color: '#2563eb', isBuiltin: true,
      perms: { createReservation:true, editReservation:true, deleteReservation:false,
               inviteAgents:true, manageAgentStatus:false, openBureau:true, closeBureau:true,
               managePause:true, manageQueue:true, sendPublicMessage:false, sendNotif:false,
               sendUrgentNotif:false, viewAnalytics:false, editSettings:false, panicButton:true, kickFromLocal:false, panicDemo:true },
    },
    '__accueil__': {
      // Accueil : crée des tickets, oriente, voit toute la file
      name: 'Accueil', color: '#8b5cf6', isBuiltin: true,
      perms: { createReservation:true, editReservation:false, deleteReservation:false,
               inviteAgents:true, manageAgentStatus:false, openBureau:true, closeBureau:true,
               managePause:false, manageQueue:true, sendPublicMessage:false, sendNotif:true,
               sendUrgentNotif:false, viewAnalytics:true, editSettings:false, panicButton:true, kickFromLocal:false, panicDemo:true },
    },
    '__agent__': {
      // Agent de bureau : gère ses RDV et sa propre file
      name: 'Agent', color: '#3b82f6', isBuiltin: true,
      perms: { createReservation:true, editReservation:true, deleteReservation:false,
               inviteAgents:false, manageAgentStatus:false, openBureau:true, closeBureau:true,
               managePause:true, manageQueue:true, sendPublicMessage:false, sendNotif:false,
               sendUrgentNotif:false, viewAnalytics:false, editSettings:false, panicButton:true, kickFromLocal:false, panicDemo:true },
    },
    '__technicien__': {
      // Technicien : consulte l'agenda, pas de gestion de file ni de RDV bénéficiaires
      name: 'Technicien·ne', color: '#475569', isBuiltin: true,
      perms: { createReservation:false, editReservation:false, deleteReservation:false,
               inviteAgents:false, manageAgentStatus:false, openBureau:false, closeBureau:false,
               managePause:false, manageQueue:false, sendPublicMessage:false, sendNotif:false,
               sendUrgentNotif:false, viewAnalytics:false, editSettings:false, panicButton:false, kickFromLocal:false, panicDemo:false },
    },
    '__entretien__': {
      // Agent d'entretien : accès minimal, juste voir la présence et les messages
      name: 'Entretien', color: '#15803d', isBuiltin: true,
      perms: { createReservation:false, editReservation:false, deleteReservation:false,
               inviteAgents:false, manageAgentStatus:false, openBureau:false, closeBureau:false,
               managePause:false, manageQueue:false, sendPublicMessage:false, sendNotif:false,
               sendUrgentNotif:false, viewAnalytics:false, editSettings:false, panicButton:false, kickFromLocal:false, panicDemo:false },
    },
    '__juriste__': {
      // Juriste : gère ses RDV, consulte l'équipe, pas de gestion file
      name: 'Juriste', color: '#4338ca', isBuiltin: true,
      perms: { createReservation:true, editReservation:true, deleteReservation:false,
               inviteAgents:true, manageAgentStatus:false, openBureau:false, closeBureau:false,
               managePause:false, manageQueue:false, sendPublicMessage:false, sendNotif:false,
               sendUrgentNotif:false, viewAnalytics:false, editSettings:false, panicButton:false, kickFromLocal:false, panicDemo:false },
    },
  },

  getPermRoles() {
    const stored = this._config.permRoles;
    // Fusionner les rôles built-in avec ceux stockés dans Firebase
    const merged = { ...this._defaultPermRoles };
    Object.entries(stored).forEach(([id, r]) => {
      const defaultRole  = merged[id] || {};
      const defaultPerms = defaultRole.perms || {};
      const storedPerms  = r.perms || {};
      // Fusion profonde des perms : les valeurs stockées gagnent,
      // mais les clés absentes de Firebase tombent sur les valeurs par défaut.
      // Cela évite de perdre les nouvelles permissions quand le rôle Firebase
      // a été sauvegardé avant leur ajout.
      const mergedPerms = { ...defaultPerms, ...storedPerms };
      merged[id] = { ...defaultRole, ...r, perms: mergedPerms, isBuiltin: !!this._defaultPermRoles[id] };
    });
    return merged;
  },

  getPermRole(roleId) {
    return this.getPermRoles()[roleId] || null;
  },

  async addPermRole(name, color, introType) {
    const perms = {};
    this.PERM_KEYS.forEach(p => { perms[p.key] = false; });
    const data = { name, color: color || '#6b7280', perms };
    if (introType) data.introType = introType;
    const ref = await this._ref('appConfig/permRoles').push(data);
    return ref.key;
  },

  async updatePermRole(roleId, { name, color, perms }) {
    const updates = {};
    if (name  !== undefined) updates[`appConfig/permRoles/${roleId}/name`]  = name;
    if (color !== undefined) updates[`appConfig/permRoles/${roleId}/color`] = color;
    if (perms !== undefined) updates[`appConfig/permRoles/${roleId}/perms`] = perms;
    await this._update(updates);
  },

  async deletePermRole(roleId) {
    if (this._defaultPermRoles[roleId]) return; // ne pas supprimer les built-ins
    await this._ref(`appConfig/permRoles/${roleId}`).remove();
    // Retirer ce rôle de tous les agents qui l'avaient
    const updates = {};
    Object.entries(this._config.agentRoles).forEach(([agentKey, rid]) => {
      if (rid === roleId) updates[`appConfig/agentRoles/${agentKey}`] = null;
    });
    if (Object.keys(updates).length) await this._update(updates);
  },

  // Assigner un rôle à un agent (par sa clé Firebase)
  async setAgentPermRole(agentKey, roleId) {
    await this._ref(`appConfig/agentRoles/${agentKey}`).set(roleId || null);
  },

  // Mot de passe individuel d'un agent (hash SHA-256)
  agentHasPassword(agentKey) { return !!this._config.agentPasswords[agentKey]; },
  async setAgentPasswordHash(agentKey, hash) {
    await this._ref(`appConfig/agentPasswords/${agentKey}`).set(hash);
  },
  async resetAgentPassword(agentKey) {
    await this._ref(`appConfig/agentPasswords/${agentKey}`).remove();
  },
  // Vérifie si au moins un agent a le rôle Admin (pour la détection du premier superadmin)
  hasAnySuperAdmin() {
    return Object.values(this._config.agentRoles).includes('__admin__');
  },

  getAgentPermRole(agentKey) {
    // Grant temporaire : l'agent désigné obtient le rôle __admin__ pendant l'absence
    const grant = this._config.tempAdminGrant;
    if (grant && grant.grantedTo === agentKey) return '__admin__';
    return this._config.agentRoles[agentKey] || null;
  },

  getTempAdminGrant() { return this._config.tempAdminGrant || null; },

  async setTempAdminGrant(grantedTo, grantedBy) {
    await this._ref('appConfig/tempAdminGrant').set({ grantedTo, grantedBy, grantedAt: Date.now() });
  },

  async revokeTempAdminGrant() {
    await this._ref('appConfig/tempAdminGrant').remove();
  },

  // Vérifie si l'utilisateur courant a une permission donnée.
  // Rôle non assigné → fallback sur __agent__ (accès de base, pas d'admin).
  hasPermission(perm) {
    const agentKey = sessionStorage.getItem('cpas_current_agent_key');
    if (!agentKey) return false; // non connecté
    const roleId = this.getAgentPermRole(agentKey) || '__agent__';
    const role   = this.getPermRole(roleId);
    if (!role) return false;
    return !!role.perms?.[perm];
  },

  async seedConfigIfEmpty() {
    const snap = await this._ref('appConfig').once('value');
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

    // Activer les modules principaux par défaut si pas encore définis (vérification individuelle)
    [
      ['enableTickets',    true],
      ['enablePublicView', true],
      ['enablePresence',   true],
    ].forEach(([key, val]) => {
      if (!d.features || d.features[key] === undefined) {
        updates[`appConfig/features/${key}`] = val;
      }
    });

    if (Object.keys(updates).length) await this._update(updates);
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

  getReservationById(id) { return this._data[id] ? { id, ...this._data[id] } : null; },

  getLocalName(localId) {
    return this._config?.localLabels?.[localId] || `Local ${localId}`;
  },

  getAgentDisplayNameByKey(agentKey) {
    return this._config.agents.find(a => a.key === agentKey)?.name || agentKey || '';
  },

  // ── Disponibilités RDV ──────────────────────────────────────────
  listenAvailabilitySlots(agentKey, cb) {
    this._ref(`appState/availabilitySlots/${agentKey}`).on('value', snap => {
      const slots = [];
      snap.forEach(c => {
        const v = c.val();
        if (c.key !== '_settings') slots.push({ id: c.key, ...v });
      });
      slots.sort((a, b) => (a.startDateTime || '').localeCompare(b.startDateTime || ''));
      cb(slots);
    });
  },

  async getAvailabilitySettings(agentKey) {
    const snap = await this._ref(`appState/availabilitySlots/${agentKey}/_settings`).once('value');
    return snap.val() || {};
  },

  async setAvailabilitySettings(agentKey, settings) {
    await this._ref(`appState/availabilitySlots/${agentKey}/_settings`).set(settings);
  },

  async addAvailabilitySlot(agentKey, startDateTime, endDateTime, label, autoAccept, favoriteLocalId, recurrence) {
    const ref = this._ref(`appState/availabilitySlots/${agentKey}`).push();
    await ref.set({
      startDateTime,
      endDateTime,
      label:           label || '',
      autoAccept:      autoAccept ? true : null,
      favoriteLocalId: favoriteLocalId || null,
      recurrence:      recurrence || null,
      createdAt:       Date.now(),
    });
    return ref.key;
  },

  async deleteAvailabilitySlotOccurrence(agentKey, slotId, occDate) {
    // Marquer une date d'exception sur un slot récurrent (supprime uniquement cette occurrence)
    await this._ref(`appState/availabilitySlots/${agentKey}/${slotId}/exceptions/${occDate}`).set(true);
  },

  async deleteAvailabilitySlot(agentKey, slotId) {
    await this._ref(`appState/availabilitySlots/${agentKey}/${slotId}`).remove();
  },

  async getAvailabilitySlot(agentKey, slotId) {
    const snap = await this._ref(`appState/availabilitySlots/${agentKey}/${slotId}`).once('value');
    return snap.exists() ? { id: slotId, ...snap.val() } : null;
  },

  // ── Demandes de RDV ─────────────────────────────────────────────
  listenAppointmentRequests(agentKey, cb) {
    // Écoute les demandes où cet agent est la cible OU le demandeur
    this._ref('appState/appointmentRequests').on('value', snap => {
      const all = [];
      snap.forEach(c => {
        const v = c.val();
        if (v.targetAgentKey === agentKey || v.requesterAgentKey === agentKey) {
          all.push({ id: c.key, ...v });
        }
      });
      all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      cb(all);
    });
  },

  async getAppointmentRequest(requestId) {
    const snap = await this._ref(`appState/appointmentRequests/${requestId}`).once('value');
    return snap.exists() ? { id: requestId, ...snap.val() } : null;
  },

  async createAppointmentRequest({ slotId, targetAgentKey, requesterAgentKey, requesterName, withPerson, message }) {
    const ref = this._ref('appState/appointmentRequests').push();
    await ref.set({
      slotId,
      targetAgentKey,
      requesterAgentKey,
      requesterName,
      withPerson,
      message:    message || '',
      status:     'pending',
      localId:    null,
      createdAt:  Date.now(),
      respondedAt: null,
    });
    return ref.key;
  },

  async acceptAppointmentRequest(requestId, localId) {
    await this._ref(`appState/appointmentRequests/${requestId}`).update({
      status:      'accepted',
      localId:     String(localId),
      respondedAt: Date.now(),
    });
  },

  async refuseAppointmentRequest(requestId) {
    await this._ref(`appState/appointmentRequests/${requestId}`).update({
      status:      'refused',
      respondedAt: Date.now(),
    });
  },

  // Vérifie si un slot a déjà une demande acceptée
  async isSlotTaken(agentKey, slotId) {
    const snap = await this._ref('appState/appointmentRequests')
      .orderByChild('slotId').equalTo(slotId).once('value');
    let taken = false;
    snap.forEach(c => {
      if (c.val().status === 'accepted') taken = true;
    });
    return taken;
  },

  // Retourne les requests par slotId (pour marquer les slots pris dans l'UI)
  async getRequestsBySlotIds(slotIds) {
    const snap = await this._ref('appState/appointmentRequests').once('value');
    const result = {};
    snap.forEach(c => {
      const v = c.val();
      if (slotIds.includes(v.slotId) && v.status === 'accepted') {
        result[v.slotId] = true;
      }
    });
    return result;
  },

  async add(data) {
    const ref = this._ref('reservations').push();
    const needsSeries = !data.isPermanent && data.recurrence?.type !== 'none';
    const seriesId = needsSeries ? genId() : null;
    await ref.set({ ...data, recurrence: { ...data.recurrence, seriesId }, createdAt: Date.now() });
    return ref.key;
  },

  async update(id, data) {
    await this._ref(`reservations/${id}`).update({ ...data, updatedAt: Date.now() });
  },

  async remove(id) {
    await this._ref(`reservations/${id}`).remove();
  },

  // Ajoute une date d'exception (suppression d'une seule occurrence)
  async addException(id, occDate) {
    await this._ref(`reservations/${id}/exceptions/${occDate}`).set(true);
  },

  async removeSeries(seriesId) {
    const updates = {};
    Object.entries(this._data).forEach(([id, r]) => {
      if (r.recurrence?.seriesId === seriesId) updates[`reservations/${id}`] = null;
    });
    if (Object.keys(updates).length) await this._update(updates);
  },

  // Charge des données de démonstration si Firebase est vide (premier lancement)
  async seedIfEmpty() {
    const snap = await this._ref('reservations').once('value');
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
      const key = this._ref('reservations').push().key;
      updates[`reservations/${key}`] = s;
    });
    await this._update(updates);
    console.log('✅ Données de démonstration CPAS chargées.');
  },

  // ══════════════════════════════════════════════════════════════════
  // Planning agents (entretien / technicien)
  // ══════════════════════════════════════════════════════════════════
  _planningData: {},
  _planningCbs:  [],

  initPlanning() {
    this._ref('planning').on('value', snap => {
      this._planningData = snap.val() || {};
      this._planningCbs.forEach(fn => fn());
    });
  },
  onPlanningChange(fn)   { this._planningCbs.push(fn); },
  getPlanningTasks()     { return this._planningData; },

  async addPlanningTask(data) {
    const ref = await this._ref('planning').push({
      ...data,
      createdBy: sessionStorage.getItem('cpas_current_agent_key') || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return ref.key;
  },
  async updatePlanningTask(id, fields) {
    await this._ref(`planning/${id}`).update({ ...fields, updatedAt: Date.now() });
  },
  async deletePlanningTask(id) {
    await this._ref(`planning/${id}`).remove();
  },
  async addPlanningException(taskId, occDateISO) {
    await this._ref(`planning/${taskId}/exceptions/${occDateISO}`).set(true);
  },
  async checkinPlanningTask(taskId, occDateISO) {
    const now = Date.now();
    if (occDateISO) {
      await this._ref(`planning/${taskId}/occurrences/${occDateISO}`).update({ checkinAt: now, status: 'inprogress' });
    } else {
      await this._ref(`planning/${taskId}`).update({ checkinAt: now, status: 'inprogress', updatedAt: now });
    }
  },
  async donePlanningTask(taskId, occDateISO) {
    const now = Date.now();
    if (occDateISO) {
      await this._ref(`planning/${taskId}/occurrences/${occDateISO}`).update({ doneAt: now, status: 'done' });
    } else {
      await this._ref(`planning/${taskId}`).update({ doneAt: now, status: 'done', updatedAt: now });
    }
  },
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

function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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
