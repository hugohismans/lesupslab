// ═══════════════════════════════════════════════════════════════════
// analytics.js — Dashboard statistiques (registre de widgets extensible)
//
// Architecture "future-proof" : tout nouveau module peut enregistrer
// ses propres widgets via ANALYTICS.register({ id, label, size, render })
// sans modifier ce fichier.
// ═══════════════════════════════════════════════════════════════════

const ANALYTICS = {
  _widgets: [],
  _period:  'week',

  // ── API publique ───────────────────────────────────────────────────
  // Enregistre un widget. Appelable depuis n'importe quel module JS.
  // widget = {
  //   id       : string unique,
  //   label    : string affiché dans le titre de la carte,
  //   size     : 'small' | 'medium' | 'large',
  //   category : string optionnel (ex: 'reservations', 'tickets', 'kiosk'),
  //   render   : function(el, { period, from, to })
  // }
  register(widget) {
    if (!this._widgets.find(w => w.id === widget.id)) {
      this._widgets.push(widget);
    }
    return this;  // chainable
  },

  open() {
    document.getElementById('analyticsOverlay').classList.remove('hidden');
    this.render();
  },

  close() {
    document.getElementById('analyticsOverlay').classList.add('hidden');
  },

  // ── Plage de dates selon la période ───────────────────────────────
  _periodRange(period) {
    const now  = new Date();
    const to   = new Date(now); to.setHours(23, 59, 59, 999);
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    if (period === 'week')  from.setDate(from.getDate() - 6);
    if (period === 'month') from.setDate(from.getDate() - 29);
    return { from, to };
  },

  // ── Rendu de la grille ────────────────────────────────────────────
  render() {
    const grid = document.getElementById('analyticsGrid');
    if (!grid) return;
    const { from, to } = this._periodRange(this._period);
    const ctx = { period: this._period, from, to };
    grid.innerHTML = '';
    if (!this._widgets.length) {
      grid.innerHTML = '<p class="an-empty an-empty-full">Aucun widget enregistré.</p>';
      return;
    }
    this._widgets.forEach(w => {
      const card = document.createElement('div');
      card.className = `an-widget an-w-${w.size || 'medium'}`;
      card.innerHTML = `
        <div class="an-widget-hd">
          <span class="an-widget-title">${w.label}</span>
        </div>
        <div class="an-widget-body" id="anw-${w.id}"></div>`;
      grid.appendChild(card);
      try {
        w.render(card.querySelector('.an-widget-body'), ctx);
      } catch (e) {
        card.querySelector('.an-widget-body').innerHTML =
          '<p class="an-empty">Erreur de rendu.</p>';
        console.error('[Analytics] widget', w.id, e);
      }
    });
  },

  // ── Export CSV ────────────────────────────────────────────────────
  exportCSV() {
    const { from, to } = this._periodRange(this._period);
    const occs = _anOccs(from, to).sort((a, b) =>
      new Date(a.startDateTime) - new Date(b.startDateTime));

    const rows = [['Date', 'Début', 'Fin', 'Local', 'Service', 'Agent', 'Commentaire']];
    occs.forEach(r => {
      const s = r._start || new Date(r.startDateTime);
      const e = r._end   || new Date(r.endDateTime);
      rows.push([
        isoDate(s),
        s.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }),
        e.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }),
        DB.getLocalLabel(r.localId),
        r.service === 'Autre' ? (r.serviceCustom || '') : r.service,
        r.agent   === 'Autre' ? (r.agentCustom   || '') : r.agent,
        r.comment || '',
      ]);
    });

    const csv  = rows.map(r =>
      r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `reservations_${isoDate(from)}_au_${isoDate(to)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  // ── Initialisation des événements ─────────────────────────────────
  init() {
    document.querySelectorAll('.an-period').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.an-period').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._period = btn.dataset.period;
        this.render();
      });
    });
    document.getElementById('btnAnalyticsClose')?.addEventListener('click', () => this.close());
    document.getElementById('btnAnExportCsv')?.addEventListener('click',    () => this.exportCSV());
    document.getElementById('analyticsOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'analyticsOverlay') this.close();
    });
  },
};


// ═══════════════════════════════════════════════════════════════════
// Helpers internes partagés entre widgets
// ═══════════════════════════════════════════════════════════════════

// Toutes les occurrences non-permanentes dans la plage [from, to]
function _anOccs(from, to) {
  return DB.getInRange(from, to).filter(r => !r.isPermanent);
}

// Nombre total de locaux configurés dans Firebase (dynamique)
function _totalLocaux() {
  const lieux = DB.getLieux?.() || {};
  return Object.values(lieux).reduce((sum, l) => sum + (l.localIds?.length || 0), 0);
}

// Barre horizontale (pour classements)
function _anBar(label, val, max) {
  const pct  = max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0;
  const safe = label.length > 28 ? label.slice(0, 27) + '…' : label;
  return `
    <div class="an-bar-row">
      <span class="an-bar-label" title="${escapeHtml(label)}">${escapeHtml(safe)}</span>
      <div class="an-bar-track">
        <div class="an-bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="an-bar-val">${val}</span>
    </div>`;
}

// escapeHtml est déjà défini dans modal.js (fonction globale)
// isoDate est défini dans db.js (fonction globale)


// ═══════════════════════════════════════════════════════════════════
// Widgets intégrés — Réservations
// Catégorie : 'reservations'
// ═══════════════════════════════════════════════════════════════════

// ── KPI : Total réservations ───────────────────────────────────────
ANALYTICS.register({
  id: 'kpi-total', label: 'Réservations', size: 'small', category: 'reservations',
  render(el, { from, to }) {
    const n = _anOccs(from, to).length;
    el.innerHTML = `
      <div class="an-kpi-wrap">
        <div class="an-kpi-icon">📅</div>
        <div class="an-kpi-val">${n}</div>
        <div class="an-kpi-sub">sur la période</div>
      </div>`;
  },
});

// ── KPI : Locaux actifs ────────────────────────────────────────────
ANALYTICS.register({
  id: 'kpi-locals', label: 'Locaux actifs', size: 'small', category: 'reservations',
  render(el, { from, to }) {
    const unique = new Set(_anOccs(from, to).map(r => r.localId)).size;
    el.innerHTML = `
      <div class="an-kpi-wrap">
        <div class="an-kpi-icon">🚪</div>
        <div class="an-kpi-val">${unique}</div>
        <div class="an-kpi-sub">sur ${_totalLocaux()} locaux</div>
      </div>`;
  },
});

// ── KPI : Agents actifs ────────────────────────────────────────────
ANALYTICS.register({
  id: 'kpi-agents', label: 'Agents actifs', size: 'small', category: 'reservations',
  render(el, { from, to }) {
    const occs   = _anOccs(from, to);
    const unique = new Set(occs.map(r => r.agent === 'Autre' ? r.agentCustom : r.agent)).size;
    el.innerHTML = `
      <div class="an-kpi-wrap">
        <div class="an-kpi-icon">👥</div>
        <div class="an-kpi-val">${unique}</div>
        <div class="an-kpi-sub">agents distincts</div>
      </div>`;
  },
});

// ── KPI : Durée moyenne ────────────────────────────────────────────
ANALYTICS.register({
  id: 'kpi-duration', label: 'Durée moyenne', size: 'small', category: 'reservations',
  render(el, { from, to }) {
    const occs = _anOccs(from, to).filter(r => r.startDateTime && r.endDateTime);
    const avg  = occs.length
      ? Math.round(occs.reduce((s, r) =>
          s + (new Date(r.endDateTime) - new Date(r.startDateTime)), 0
        ) / occs.length / 60000)
      : 0;
    const h = Math.floor(avg / 60);
    const m = avg % 60;
    const label = avg === 0 ? '—'
      : h > 0 ? `${h}h${String(m).padStart(2,'0')}`
      : `${m} min`;
    el.innerHTML = `
      <div class="an-kpi-wrap">
        <div class="an-kpi-icon">⏱</div>
        <div class="an-kpi-val">${label}</div>
        <div class="an-kpi-sub">par réservation</div>
      </div>`;
  },
});

// ── Graphique quotidien (barres verticales) ────────────────────────
ANALYTICS.register({
  id: 'chart-daily', label: 'Réservations par jour', size: 'large', category: 'reservations',
  render(el, { period, from, to }) {
    if (period === 'today') {
      el.innerHTML = '<p class="an-empty">Sélectionner 7 ou 30 jours pour voir ce graphique.</p>';
      return;
    }

    // Construire la liste de jours
    const days = [];
    const cur  = new Date(from);
    while (cur <= to) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

    const counts = days.map(d => {
      const dS = new Date(d); dS.setHours(0, 0, 0, 0);
      const dE = new Date(d); dE.setHours(23, 59, 59, 999);
      return DB.getInRange(dS, dE).filter(r => !r.isPermanent).length;
    });

    const max  = Math.max(...counts, 1);
    const today = isoDate(new Date());

    const cols = days.map((d, i) => {
      const pct    = Math.round((counts[i] / max) * 100);
      const isToday = isoDate(d) === today;
      const dow    = d.toLocaleDateString('fr-BE', { weekday: 'short' });
      const day    = d.toLocaleDateString('fr-BE', { day: 'numeric' });
      const full   = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
      return `
        <div class="an-col-wrap${isToday ? ' is-today' : ''}" title="${full} : ${counts[i]} réservation(s)">
          <div class="an-col-count">${counts[i] > 0 ? counts[i] : ''}</div>
          <div class="an-col-track">
            <div class="an-col-fill" style="height:${pct}%"></div>
          </div>
          <div class="an-col-label">
            <span class="an-col-dow">${dow}</span>
            <span class="an-col-day">${day}</span>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `<div class="an-col-chart">${cols}</div>`;
  },
});

// ── Top services ───────────────────────────────────────────────────
ANALYTICS.register({
  id: 'top-services', label: 'Services les plus demandés', size: 'medium', category: 'reservations',
  render(el, { from, to }) {
    const counts = {};
    _anOccs(from, to).forEach(r => {
      const svc = r.service === 'Autre' ? (r.serviceCustom || 'Autre') : r.service;
      counts[svc] = (counts[svc] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7);
    if (!sorted.length) { el.innerHTML = '<p class="an-empty">Aucune donnée sur cette période.</p>'; return; }
    const max = sorted[0][1];
    el.innerHTML = `<div class="an-bars">${sorted.map(([s, n]) => _anBar(s, n, max)).join('')}</div>`;
  },
});

// ── Top agents ─────────────────────────────────────────────────────
ANALYTICS.register({
  id: 'top-agents', label: 'Agents les plus actifs', size: 'medium', category: 'reservations',
  render(el, { from, to }) {
    const counts = {};
    _anOccs(from, to).forEach(r => {
      const agt = r.agent === 'Autre' ? (r.agentCustom || 'Autre') : r.agent;
      counts[agt] = (counts[agt] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7);
    if (!sorted.length) { el.innerHTML = '<p class="an-empty">Aucune donnée sur cette période.</p>'; return; }
    const max = sorted[0][1];
    el.innerHTML = `<div class="an-bars">${sorted.map(([a, n]) => _anBar(a, n, max)).join('')}</div>`;
  },
});

// ── Locaux les plus utilisés ───────────────────────────────────────
ANALYTICS.register({
  id: 'top-locals', label: 'Utilisation des locaux', size: 'medium', category: 'reservations',
  render(el, { from, to }) {
    const counts = {};
    _anOccs(from, to).forEach(r => {
      const lbl = DB.getLocalLabel(r.localId);
      counts[lbl] = (counts[lbl] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) { el.innerHTML = '<p class="an-empty">Aucune donnée sur cette période.</p>'; return; }
    const max = sorted[0][1];
    el.innerHTML = `<div class="an-bars">${sorted.map(([l, n]) => _anBar(l, n, max)).join('')}</div>`;
  },
});

// ── Répartition horaire ────────────────────────────────────────────
ANALYTICS.register({
  id: 'peak-hours', label: 'Répartition horaire', size: 'medium', category: 'reservations',

  render(el, { from, to }) {
    const counts = {};
    _anOccs(from, to).forEach(r => {
      if (!r.startDateTime) return;
      const h = new Date(r.startDateTime).getHours();
      const label = `${String(h).padStart(2,'0')}h`;
      counts[label] = (counts[label] || 0) + 1;
    });
    // Trier par heure
    const sorted = Object.entries(counts).sort((a, b) =>
      parseInt(a[0]) - parseInt(b[0]));
    if (!sorted.length) { el.innerHTML = '<p class="an-empty">Aucune donnée sur cette période.</p>'; return; }
    const max = Math.max(...sorted.map(([, n]) => n), 1);
    el.innerHTML = `<div class="an-bars">${sorted.map(([h, n]) => _anBar(h, n, max)).join('')}</div>`;
  },
});


// ═══════════════════════════════════════════════════════════════════
// Widgets — Files d'attente (tickets)
// Catégorie : 'tickets'
// ═══════════════════════════════════════════════════════════════════

// Helper : somme d'une clé préfixée dans un snapshot de queue range
function _anTicketSum(data, prefix) {
  let total = 0;
  Object.values(data).forEach(day => {
    if (!day) return;
    Object.entries(day).forEach(([k, v]) => {
      if (k.startsWith(prefix)) total += (v || 0);
    });
  });
  return total;
}

// KPI : Tickets émis ───────────────────────────────────────────────
ANALYTICS.register({
  id: 'kpi-tickets-issued', label: 'Tickets émis', size: 'small', category: 'tickets',
  render(el, { period, from, to }) {
    const _set = n => {
      const sub = period === 'today' ? 'aujourd\'hui' : 'sur la période';
      el.innerHTML = `
        <div class="an-kpi-wrap">
          <div class="an-kpi-icon">🎫</div>
          <div class="an-kpi-val">${n}</div>
          <div class="an-kpi-sub">${sub}</div>
        </div>`;
    };
    if (period === 'today') {
      const groups = DB.getQueueGroups();
      _set(Object.keys(groups).reduce((s, gid) => s + DB.getTicketIssued(gid), 0));
      return;
    }
    DB.fetchQueueRange(from, to).then(data => _set(_anTicketSum(data, 'tick_')));
  },
});

// KPI : Tickets traités ────────────────────────────────────────────
ANALYTICS.register({
  id: 'kpi-tickets-called', label: 'Tickets traités', size: 'small', category: 'tickets',
  render(el, { period, from, to }) {
    const _set = n => {
      const sub = period === 'today' ? 'aujourd\'hui' : 'sur la période';
      el.innerHTML = `
        <div class="an-kpi-wrap">
          <div class="an-kpi-icon">✅</div>
          <div class="an-kpi-val">${n}</div>
          <div class="an-kpi-sub">${sub}</div>
        </div>`;
    };
    if (period === 'today') {
      const groups = DB.getQueueGroups();
      _set(Object.keys(groups).reduce((s, gid) => s + DB.getTicketCalled(gid), 0));
      return;
    }
    DB.fetchQueueRange(from, to).then(data => _set(_anTicketSum(data, 'tcall_')));
  },
});

// Graphique : Tickets par jour ─────────────────────────────────────
ANALYTICS.register({
  id: 'chart-tickets-daily', label: 'Tickets par jour', size: 'large', category: 'tickets',
  render(el, { period, from, to }) {
    if (period === 'today') {
      // Aujourd'hui : barres par groupe de file
      const groups = DB.getQueueGroups();
      const entries = Object.entries(groups).map(([gid, g]) => [
        g.name || gid,
        DB.getTicketIssued(gid),
        DB.getTicketCalled(gid),
      ]);
      if (!entries.length) { el.innerHTML = '<p class="an-empty">Aucune file configurée.</p>'; return; }
      const maxVal = Math.max(...entries.map(([, issued]) => issued), 1);
      el.innerHTML = `<div class="an-bars">${
        entries.map(([name, issued, called]) => `
          ${_anBar(`🎫 ${name}`, issued, maxVal)}
          ${_anBar(`✅ ${name}`, called, maxVal)}
        `).join('')
      }</div>`;
      return;
    }
    // Semaine/mois : graphique colonnes
    DB.fetchQueueRange(from, to).then(data => {
      const days = [];
      const cur = new Date(from);
      while (cur <= to) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
      const counts = days.map(d => {
        const day = data[isoDate(d)];
        if (!day) return 0;
        return Object.entries(day)
          .filter(([k]) => k.startsWith('tick_'))
          .reduce((s, [, v]) => s + (v || 0), 0);
      });
      const max = Math.max(...counts, 1);
      const today = isoDate(new Date());
      const cols = days.map((d, i) => {
        const pct    = Math.round((counts[i] / max) * 100);
        const isToday = isoDate(d) === today;
        const dow    = d.toLocaleDateString('fr-BE', { weekday: 'short' });
        const day    = d.toLocaleDateString('fr-BE', { day: 'numeric' });
        const full   = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
        return `
          <div class="an-col-wrap${isToday ? ' is-today' : ''}" title="${full} : ${counts[i]} ticket(s)">
            <div class="an-col-count">${counts[i] > 0 ? counts[i] : ''}</div>
            <div class="an-col-track">
              <div class="an-col-fill" style="height:${pct}%"></div>
            </div>
            <div class="an-col-label">
              <span class="an-col-dow">${dow}</span>
              <span class="an-col-day">${day}</span>
            </div>
          </div>`;
      }).join('');
      el.innerHTML = `<div class="an-col-chart">${cols}</div>`;
    });
  },
});
