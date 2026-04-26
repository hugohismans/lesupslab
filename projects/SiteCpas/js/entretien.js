// ═══════════════════════════════════════════════════════════════════
// entretien.js — Management Entretien : enregistrement + bilan mensuel
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Pad 2 chiffres
  const pad = n => String(n).padStart(2, '0');
  // YYYY-MM-DD pour une Date locale
  function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  // YYYY-MM pour le sélecteur de mois
  function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }

  if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE);

  const loadingEl  = document.getElementById('entLoading');
  const refusedEl  = document.getElementById('entRefused');
  const headerEl   = document.getElementById('entHeader');
  const bodyEl     = document.getElementById('entBody');
  const agentBadge = document.getElementById('entAgentBadge');
  const orgNameEl  = document.getElementById('entOrgName');
  const toastEl    = document.getElementById('entToast');

  const selLieu    = document.getElementById('entSelLieu');
  const selCleaner = document.getElementById('entSelCleaner');
  const selType    = document.getElementById('entSelType');
  const localsList = document.getElementById('entLocalsList');
  const btnSave    = document.getElementById('entBtnSave');

  const btnToggleAll = document.getElementById('entToggleAll');

  const bilanMonth = document.getElementById('entBilanMonth');
  const bilanLieu  = document.getElementById('entBilanLieu');
  const bilanTable = document.getElementById('entBilanTable');
  const btnPrint   = document.getElementById('entBtnPrint');
  const btnExport  = document.getElementById('entBtnExport');
  const printTitle = document.getElementById('entPrintTitle');
  const optBadge   = document.getElementById('entOptBadge');
  const optName    = document.getElementById('entOptName');
  const optType    = document.getElementById('entOptType');
  const annulList  = document.getElementById('entAnnulList');
  const annulMineOnly = document.getElementById('entAnnulMineOnly');

  const OPTS_KEY = 'cpas_entretien_bilan_opts';

  const MONTH_NAMES_FR = ['janvier','février','mars','avril','mai','juin',
                          'juillet','août','septembre','octobre','novembre','décembre'];
  const slug = s => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function showToast(msg, err = false) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!err);
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  // ── Emoji picker partagé (pour le stock entretien) ─────────────
  // Liste curatée pour consommables/entretien d'une maison de repos.
  const STOCK_EMOJIS = [
    '🧻','🗑','🧴','🧤','🧽','🧼',
    '🪣','🧹','🪥','🪠','🚽','🚰',
    '🧷','🩹','😷','🥽','🩺','💊',
    '🌡','✨','💧','🧺','🛏','🍽',
    '📦','🛒','☕','🥤','🍵','🧊',
    '💡','🔋','🧯','🪛','⚡','📋',
  ];
  const EMOJI_PICKER = {
    _popover:  null,
    _trigger:  null,
    _onPick:   null,
    _bound:    false,
    init() {
      if (this._bound) return;
      this._popover = document.getElementById('entEmojiPopover');
      if (!this._popover) return;
      // Construire la grille une seule fois
      this._popover.innerHTML = STOCK_EMOJIS.map(e =>
        `<button type="button" class="ent-emoji-opt" data-emoji="${e}" title="${e}">${e}</button>`
      ).join('');
      this._popover.querySelectorAll('.ent-emoji-opt').forEach(btn => {
        btn.addEventListener('mousedown', ev => {
          ev.preventDefault();
          this._pick(btn.dataset.emoji);
        });
      });
      // Fermer si on clique en dehors
      document.addEventListener('mousedown', (ev) => {
        if (this._popover.classList.contains('hidden')) return;
        if (this._popover.contains(ev.target)) return;
        if (this._trigger && this._trigger.contains(ev.target)) return;
        this.close();
      });
      // Échap pour fermer
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') this.close();
      });
      this._bound = true;
    },
    open(triggerEl, onPick) {
      this.init();
      if (!this._popover) return;
      this._trigger = triggerEl;
      this._onPick  = onPick;
      // Position : sous le trigger, alignée à gauche, recadrée si bord d'écran
      const r = triggerEl.getBoundingClientRect();
      this._popover.classList.remove('hidden');
      const pw = this._popover.offsetWidth;
      const ph = this._popover.offsetHeight;
      let left = r.left;
      let top  = r.bottom + 4;
      if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
      if (left < 8) left = 8;
      if (top  + ph > window.innerHeight - 8) top  = r.top - ph - 4; // au-dessus si manque de place
      this._popover.style.left = `${left}px`;
      this._popover.style.top  = `${top}px`;
      triggerEl.classList.add('active');
    },
    close() {
      if (!this._popover) return;
      this._popover.classList.add('hidden');
      if (this._trigger) this._trigger.classList.remove('active');
      this._trigger = null;
      this._onPick  = null;
    },
    _pick(emoji) {
      if (this._onPick) this._onPick(emoji);
      this.close();
    },
  };
  // Délégation globale : tout bouton .ent-emoji-trigger ouvre/ferme le
  // picker et met à jour son propre data-value + textContent à la sélection.
  document.addEventListener('click', (ev) => {
    const trig = ev.target.closest('.ent-emoji-trigger');
    if (!trig) return;
    ev.preventDefault();
    // Toggle : si déjà ouvert sur ce même trigger → fermer
    if (EMOJI_PICKER._trigger === trig && EMOJI_PICKER._popover && !EMOJI_PICKER._popover.classList.contains('hidden')) {
      EMOJI_PICKER.close();
      return;
    }
    EMOJI_PICKER.open(trig, (emoji) => {
      trig.dataset.value  = emoji;
      trig.textContent    = emoji;
    });
  });

  const ENTRETIEN = {
    _tab: 'dashboard',
    _guardDone: false,
    _logs: {},                 // Snapshot complet de entretien/logs (id -> log)

    // ── Dashboard / Requêtes (calqué sur TECH) ─────────────────────
    _allRequests: {},          // snapshot DB.listenRequests
    _period: 30,               // 7 | 30 | 90 | 365 | 'all'
    _status: 'all',            // 'all' | 'open' | 'in_progress' | 'done'
    _search: '',
    _suggestHighlight: -1,
    _reqStatusFilter: 'open',
    _reqUrgFilter:    'all',

    init() {
      DB.init();
      DB.initConfig();
      DB.listenCleaningLogs();
      DB.listenRequests();
      DB.listenStockItems();

      DB.onConfigChange(() => {
        if (!this._guardDone) { this._guard(); this._guardDone = true; }
        this._refreshSelects();
        if (this._tab === 'dashboard') this._renderDashboard();
        else if (this._tab === 'bilan') this._renderBilan();
      });
      DB.onCleaningLogsChange(logs => {
        this._logs = logs || {};
        if (this._tab === 'bilan') this._renderBilan();
        if (this._tab === 'annul') this._renderAnnul();
      });
      DB.onStockItemsChange(() => {
        if (this._tab === 'stock')       this._renderStock();
        if (this._tab === 'stockManage') this._renderStockManage();
      });
      let _schedulerRan = false;
      DB.onRequestChange(reqs => {
        this._allRequests = reqs || {};
        // Scheduler récurrences : 1ère exécution UNIQUEMENT après le 1er
        // snapshot de _requests, sinon il tourne à vide et bloque le
        // throttle 5min. (Bug observé : occurrences quotidiennes jamais
        // générées sur entretien si l'agent n'ouvre pas app.html.)
        if (!_schedulerRan) {
          _schedulerRan = true;
          DB.runRecurringRequestsScheduler?.().catch(e => console.warn('[recurring scheduler]', e));
        }
        if (!this._guardDone) return;
        if (this._tab === 'dashboard') this._renderDashboard();
        else if (this._tab === 'requests') this._renderRequestsPane();
      });

      this._bindTabs();
      this._bindRegister();
      this._bindBilan();
      this._bindAnnul();
      this._bindDashboard();
      this._bindRequestsPaneFilters();
    },

    _guard() {
      const agentKey = (typeof sessionStorage !== 'undefined')
        ? sessionStorage.getItem('cpas_current_agent_key')
        : null;
      loadingEl.style.display = 'none';
      if (!agentKey) { refusedEl.style.display = 'block'; return; }
      if (!DB.hasPermission?.('manageCleaning')) { refusedEl.style.display = 'block'; return; }
      headerEl.style.display = 'flex';
      bodyEl.style.display   = 'block';
      const agentName = DB.getAgentsWithKeys().find(a => a.key === agentKey)?.name || 'Agent';
      agentBadge.textContent = '👤 ' + agentName;
      orgNameEl.textContent  = (typeof ORG_ID !== 'undefined') ? ORG_ID : '—';

      // Défaut bilan = mois courant
      bilanMonth.value = monthKey(new Date());

      // Initialiser NOTIF (cloche entête) — l'agent a déjà un agentKey
      if (typeof NOTIF !== 'undefined' && NOTIF.init) {
        try { NOTIF.init(); } catch (e) { console.warn('[ENTRETIEN] NOTIF init failed', e); }
      }
      // Le scheduler récurrent est lancé depuis le 1er onRequestChange
      // (cf. init), pas ici — sinon il peut tourner à vide.
    },

    // ── Tabs ─────────────────────────────────────────────────────
    _bindTabs() {
      const PANES = {
        dashboard:   'entPaneDashboard',
        requests:    'entPaneRequests',
        register:    'entPaneRegister',
        bilan:       'entPaneBilan',
        annul:       'entPaneAnnul',
        stock:       'entPaneStock',
        stockManage: 'entPaneStockManage',
      };
      document.querySelectorAll('.ent-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.ent-tab').forEach(b => b.classList.remove('ent-tab-active'));
          btn.classList.add('ent-tab-active');
          this._tab = btn.dataset.tab;
          for (const [tab, id] of Object.entries(PANES)) {
            const el = document.getElementById(id);
            if (el) el.style.display = (this._tab === tab) ? '' : 'none';
          }
          if (this._tab === 'dashboard')   this._renderDashboard();
          if (this._tab === 'requests')    this._renderRequestsPane();
          if (this._tab === 'bilan')       this._renderBilan();
          if (this._tab === 'annul')       this._renderAnnul();
          if (this._tab === 'stock')       this._renderStock();
          if (this._tab === 'stockManage') this._renderStockManage();
        });
      });
    },

    // ── Refresh des selects (lieu/cleaner/type) ─────────────────
    _refreshSelects() {
      // Lieux
      const lieux = DB.getLieux();
      const lieuxHtml = '<option value="">— Sélectionner —</option>' +
        Object.entries(lieux).map(([id, l]) =>
          `<option value="${id}">${escapeHtml(l.name || id)}</option>`).join('');
      const curLieu = selLieu.value;
      selLieu.innerHTML = lieuxHtml;
      if (curLieu && lieux[curLieu]) selLieu.value = curLieu;

      const curBilanLieu = bilanLieu.value;
      bilanLieu.innerHTML = lieuxHtml;
      if (curBilanLieu && lieux[curBilanLieu]) bilanLieu.value = curBilanLieu;

      // Cleaners
      const cleaners = DB.getCleaners();
      const curCleaner = selCleaner.value;
      selCleaner.innerHTML = '<option value="">— Sélectionner —</option>' +
        cleaners.map(c =>
          `<option value="${c.id}">${escapeHtml(c.badge)} — ${escapeHtml(c.name)}</option>`).join('');
      if (curCleaner && cleaners.find(c => c.id === curCleaner)) selCleaner.value = curCleaner;

      // Types de nettoyage
      const types = DB.getCleaningTypes();
      const curType = selType.value;
      selType.innerHTML = '<option value="">— Sélectionner —</option>' +
        types.map(t =>
          `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join('');
      if (curType && types.find(t => t.id === curType)) selType.value = curType;

      this._renderLocals();
      this._updateSaveState();
    },

    // ── Formulaire Enregistrer ──────────────────────────────────
    _bindRegister() {
      selLieu.addEventListener('change', () => { this._renderLocals(); this._updateSaveState(); });
      selCleaner.addEventListener('change', () => this._updateSaveState());
      selType.addEventListener('change', () => this._updateSaveState());
      btnSave.addEventListener('click', () => this._save());
      btnToggleAll?.addEventListener('click', () => this._toggleAllLocals());
    },

    // Bascule tous les locaux visibles entre "tous cochés" et "tous décochés".
    // Agit sur "Nettoyé" uniquement — "Approfondi" suit la règle existante
    // (décoché automatiquement si "Nettoyé" est décoché).
    _toggleAllLocals() {
      const dones = Array.from(localsList.querySelectorAll('.ent-chk-done'));
      if (!dones.length) return;
      const allChecked = dones.every(cb => cb.checked);
      dones.forEach(cb => { cb.checked = !allChecked; });
      // Si on décoche tout, décocher aussi les "approfondi"
      if (allChecked) {
        localsList.querySelectorAll('.ent-chk-deep').forEach(cb => { cb.checked = false; });
      }
      this._updateToggleAllLabel();
      this._updateSaveState();
    },

    _updateToggleAllLabel() {
      if (!btnToggleAll) return;
      const dones = localsList.querySelectorAll('.ent-chk-done');
      if (!dones.length) { btnToggleAll.style.display = 'none'; return; }
      btnToggleAll.style.display = '';
      const allChecked = Array.from(dones).every(cb => cb.checked);
      btnToggleAll.textContent = allChecked ? 'Tout désélectionner' : 'Tout sélectionner';
    },

    _renderLocals() {
      const lieuId = selLieu.value;
      if (!lieuId) {
        localsList.innerHTML = '<div class="ent-empty-hint">Sélectionnez un lieu pour afficher ses locaux.</div>';
        return;
      }
      const lieu = DB.getLieux()[lieuId];
      const localIds = (lieu?.localIds || []).map(Number).sort((a, b) => a - b);
      if (!localIds.length) {
        localsList.innerHTML = '<div class="ent-empty-hint">Ce lieu n\'a aucun local configuré.</div>';
        return;
      }
      localsList.innerHTML = localIds.map(id => {
        const label = DB.getLocalLabel(id) || `Local ${id}`;
        return `<div class="ent-local-row" data-local="${id}">
          <div class="ent-local-name">${escapeHtml(label)}</div>
          <label class="ent-local-check">
            <input type="checkbox" class="ent-chk-done" data-local="${id}">
            Nettoyé
          </label>
          <label class="ent-local-check ent-local-check-deep">
            <input type="checkbox" class="ent-chk-deep" data-local="${id}">
            Approfondi
          </label>
        </div>`;
      }).join('');

      // Si "approfondi" est coché, on force "nettoyé" coché (UX)
      localsList.querySelectorAll('.ent-chk-deep').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) {
            const id = cb.dataset.local;
            const done = localsList.querySelector(`.ent-chk-done[data-local="${id}"]`);
            if (done) done.checked = true;
          }
          this._updateToggleAllLabel();
          this._updateSaveState();
        });
      });
      localsList.querySelectorAll('.ent-chk-done').forEach(cb => {
        cb.addEventListener('change', () => {
          if (!cb.checked) {
            // Décocher "approfondi" si "nettoyé" n'est plus coché
            const id = cb.dataset.local;
            const deep = localsList.querySelector(`.ent-chk-deep[data-local="${id}"]`);
            if (deep) deep.checked = false;
          }
          this._updateToggleAllLabel();
          this._updateSaveState();
        });
      });
      this._updateToggleAllLabel();
    },

    _updateSaveState() {
      const hasLieu    = !!selLieu.value;
      const hasCleaner = !!selCleaner.value;
      const hasType    = !!selType.value;
      const hasChecked = !!localsList.querySelector('.ent-chk-done:checked');
      btnSave.disabled = !(hasLieu && hasCleaner && hasType && hasChecked);
    },

    async _save() {
      const lieuId    = selLieu.value;
      const cleanerId = selCleaner.value;
      const typeId    = selType.value;
      if (!lieuId || !cleanerId || !typeId) return;

      const cleaner = DB.getCleaners().find(c => c.id === cleanerId);
      const cleanerBadge = cleaner?.badge || null;

      const date = isoDate(new Date());
      const checks = Array.from(localsList.querySelectorAll('.ent-chk-done:checked'))
        .map(cb => {
          const id = cb.dataset.local;
          const deep = localsList.querySelector(`.ent-chk-deep[data-local="${id}"]:checked`);
          return { localId: Number(id), approfondi: !!deep };
        });
      if (!checks.length) return;

      btnSave.disabled = true;
      const origLabel = btnSave.textContent;
      btnSave.textContent = '…';

      let okCount = 0;
      const errors = [];
      for (const { localId, approfondi } of checks) {
        try {
          await DB.addCleaningLog({ date, lieuId, localId, cleanerId, cleanerBadge, typeId, approfondi });
          okCount++;
        } catch (e) {
          errors.push({ localId, err: e?.message || String(e) });
        }
      }

      btnSave.textContent = origLabel;
      if (errors.length) {
        console.warn('[ENTRETIEN] save errors', errors);
        showToast(`${okCount} enregistré(s), ${errors.length} en erreur`, true);
      } else {
        showToast(`✓ ${okCount} local${okCount > 1 ? 'aux' : ''} enregistré${okCount > 1 ? 's' : ''}`);
        // Réinitialiser les checkboxes
        localsList.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
      }
      this._updateToggleAllLabel();
      this._updateSaveState();
    },

    // ── Bilan mensuel ───────────────────────────────────────────
    _bindBilan() {
      // Charger les préférences d'affichage depuis localStorage (défaut : badge only)
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(OPTS_KEY) || 'null'); } catch {}
      const opts = saved || { badge: true, name: false, type: false };
      if (optBadge) optBadge.checked = !!opts.badge;
      if (optName)  optName.checked  = !!opts.name;
      if (optType)  optType.checked  = !!opts.type;

      const saveOpts = () => {
        try {
          localStorage.setItem(OPTS_KEY, JSON.stringify({
            badge: !!optBadge?.checked,
            name:  !!optName?.checked,
            type:  !!optType?.checked,
          }));
        } catch {}
      };

      bilanMonth.addEventListener('change', () => this._renderBilan());
      bilanLieu.addEventListener('change',  () => this._renderBilan());
      [optBadge, optName, optType].forEach(cb => {
        cb?.addEventListener('change', () => { saveOpts(); this._renderBilan(); });
      });
      btnPrint?.addEventListener('click', () => this._printBilan());
      btnExport?.addEventListener('click', () => this._exportCsv());
    },

    _getBilanOpts() {
      return {
        badge: !!optBadge?.checked,
        name:  !!optName?.checked,
        type:  !!optType?.checked,
      };
    },

    // Impression via window.print() avec CSS @media print. L'utilisateur
    // peut aussi choisir "Enregistrer en PDF" dans la boîte d'impression.
    _printBilan() {
      if (!bilanMonth.value || !bilanLieu.value) {
        showToast('Sélectionne un mois et un lieu avant d\'imprimer.', true);
        return;
      }
      // Injecter le titre visible uniquement à l'impression
      if (printTitle) printTitle.textContent = this._bilanTitle();
      this._installPrintMode('bilan', '@page { size: landscape; margin: 1cm; }');
      setTimeout(() => window.print(), 50);
    },

    // Active un mode d'impression dédié : ajoute la classe `ent-printing-<mode>`
    // sur <body> + injecte une feuille @page temporaire, puis nettoie après
    // afterprint. Garantit qu'un mode n'écrase pas l'autre.
    _installPrintMode(mode, pageRule) {
      const cls = `ent-printing-${mode}`;
      document.body.classList.add(cls);
      let style = null;
      if (pageRule) {
        style = document.createElement('style');
        style.id = `ent-print-${mode}-page`;
        style.textContent = `@media print { ${pageRule} }`;
        document.head.appendChild(style);
      }
      const cleanup = () => {
        document.body.classList.remove(cls);
        if (style && style.parentNode) style.parentNode.removeChild(style);
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
    },

    _bilanTitle() {
      const [year, month] = (bilanMonth.value || '').split('-').map(Number);
      const lieuId = bilanLieu.value;
      const lieu   = DB.getLieux()[lieuId];
      const lieuName = lieu?.name || lieuId || '—';
      const mName = (month >= 1 && month <= 12) ? MONTH_NAMES_FR[month - 1] : '?';
      return `Bilan entretien — ${lieuName} — ${mName} ${year}`;
    },

    // Export CSV détaillé : 1 ligne par log, format pivotable dans Excel.
    _exportCsv() {
      const mkey   = bilanMonth.value;
      const lieuId = bilanLieu.value;
      if (!mkey || !lieuId) {
        showToast('Sélectionne un mois et un lieu avant d\'exporter.', true);
        return;
      }
      const [year, month] = mkey.split('-').map(Number);
      const monthPrefix = `${year}-${pad(month)}-`;
      const typesById = Object.fromEntries(DB.getCleaningTypes().map(t => [t.id, t.label]));
      const cleanersById = Object.fromEntries(DB.getCleaners().map(c => [c.id, c.name]));

      const rows = [[
        'Date', 'Local ID', 'Local', 'Badge', 'Agent entretien',
        'Type', 'Approfondi', 'Enregistré par (agentKey)', 'Enregistré à',
      ]];
      const logs = Object.values(this._logs || {})
        .filter(l => l && l.lieuId === String(lieuId) && typeof l.date === 'string' && l.date.startsWith(monthPrefix))
        .sort((a, b) => (a.date || '').localeCompare(b.date) || (a.ts || 0) - (b.ts || 0));

      for (const l of logs) {
        const tsStr = l.ts ? new Date(l.ts).toLocaleString('fr-BE') : '';
        rows.push([
          l.date || '',
          l.localId != null ? String(l.localId) : '',
          DB.getLocalLabel(l.localId) || `Local ${l.localId}`,
          l.cleanerBadge || '',
          cleanersById[l.cleanerId] || '',
          typesById[l.typeId] || '',
          l.approfondi ? 'Oui' : 'Non',
          l.byAgentKey || '',
          tsStr,
        ]);
      }

      // Séparateur ; (Excel FR par défaut). BOM UTF-8 pour les accents.
      const csv = rows.map(r => r.map(v => {
        const s = String(v ?? '');
        return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(';')).join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const lieuSlug = slug(DB.getLieux()[lieuId]?.name || lieuId);
      a.href = url;
      a.download = `bilan-entretien-${lieuSlug}-${year}-${pad(month)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`✓ Export : ${logs.length} ligne${logs.length > 1 ? 's' : ''}`);
    },

    _renderBilan() {
      const mkey   = bilanMonth.value;
      const lieuId = bilanLieu.value;
      if (!mkey || !lieuId) {
        bilanTable.innerHTML = '<div class="ent-empty-hint">Sélectionnez un mois et un lieu pour voir le bilan.</div>';
        return;
      }
      const [year, month] = mkey.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const lieu = DB.getLieux()[lieuId];
      const localIds = (lieu?.localIds || []).map(Number).sort((a, b) => a - b);
      if (!localIds.length) {
        bilanTable.innerHTML = '<div class="ent-empty-hint">Ce lieu n\'a aucun local configuré.</div>';
        return;
      }

      // Indexer les logs par (localId, date)
      // { [localId]: { [YYYY-MM-DD]: [logs] } }
      const monthPrefix = `${year}-${pad(month)}-`;
      const idx = {};
      Object.values(this._logs || {}).forEach(log => {
        if (!log || log.lieuId !== String(lieuId)) return;
        if (typeof log.date !== 'string' || !log.date.startsWith(monthPrefix)) return;
        const lid = String(log.localId);
        if (!idx[lid]) idx[lid] = {};
        if (!idx[lid][log.date]) idx[lid][log.date] = [];
        idx[lid][log.date].push(log);
      });

      const typesById    = Object.fromEntries(DB.getCleaningTypes().map(t => [t.id, t.label]));
      const cleanersById = Object.fromEntries(DB.getCleaners().map(c => [c.id, c.name]));
      const todayIso     = isoDate(new Date());
      const opts         = this._getBilanOpts();

      const monthLabel = (month >= 1 && month <= 12)
        ? `${MONTH_NAMES_FR[month - 1].toUpperCase()} ${year}`
        : `${year}`;
      let html = `<div class="ent-month-header">${escapeHtml(monthLabel)}</div>`;
      html += '<table class="ent-month-table"><thead><tr><th class="ent-local-col">Local</th>';
      for (let d = 1; d <= daysInMonth; d++) {
        const dObj = new Date(year, month - 1, d);
        const weekend = dObj.getDay() === 0 || dObj.getDay() === 6;
        const iso = isoDate(dObj);
        const cls = iso === todayIso ? 'ent-day-today' : (weekend ? 'ent-day-weekend' : '');
        html += `<th class="${cls}" title="${dObj.toLocaleDateString('fr-BE', { weekday:'long', day:'numeric', month:'long' })}">${d}</th>`;
      }
      html += '</tr></thead><tbody>';

      for (const lid of localIds) {
        html += `<tr><td class="ent-local-col">${escapeHtml(DB.getLocalLabel(lid) || `Local ${lid}`)}</td>`;
        for (let d = 1; d <= daysInMonth; d++) {
          const iso = `${year}-${pad(month)}-${pad(d)}`;
          const logs = idx[String(lid)]?.[iso] || [];
          if (!logs.length) {
            html += '<td class="ent-day-cell ent-status-empty"></td>';
            continue;
          }
          // Détection conflit : 2 cleaners distincts le même jour
          const distinctCleaners = [...new Set(logs.map(l => l.cleanerId || l.cleanerBadge || '?'))];
          const anyDeep  = logs.some(l => l.approfondi);
          const conflict = distinctCleaners.length > 1;
          let statusCls;
          if (conflict) statusCls = 'ent-status-conflict';
          else if (anyDeep) statusCls = 'ent-status-deep';
          else statusCls = 'ent-status-ok';
          // Contenu cellule selon les toggles Badge / Nom / Type
          const uniqBadges = [...new Set(logs.map(l => l.cleanerBadge).filter(Boolean))];
          const uniqNames  = [...new Set(logs.map(l => cleanersById[l.cleanerId] || '').filter(Boolean))];
          const uniqTypes  = [...new Set(logs.map(l => typesById[l.typeId] || '').filter(Boolean))];
          let cellInner = '';
          if (opts.badge && uniqBadges.length) {
            cellInner += `<span class="ent-cell-badge">${escapeHtml(uniqBadges.join(' '))}</span>`;
          }
          if (opts.name && uniqNames.length) {
            cellInner += `<span class="ent-cell-name">${escapeHtml(uniqNames.join(', '))}</span>`;
          }
          if (opts.type && uniqTypes.length) {
            cellInner += `<span class="ent-cell-type">${escapeHtml(uniqTypes.join(', '))}</span>`;
          }
          // Si toutes options off mais logs existent, afficher un point pour
          // signaler la couleur de fond sans être vide.
          if (!cellInner) cellInner = '<span class="ent-cell-badge">•</span>';
          const tooltip = logs.map(l => {
            const t  = new Date(l.ts || 0);
            const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
            const name = cleanersById[l.cleanerId] || '';
            return `${l.cleanerBadge || '?'}${name ? ' ' + name : ''} — ${typesById[l.typeId] || '?'} — ${hm}${l.approfondi ? ' (approfondi)' : ''}`;
          }).join('\n');
          html += `<td class="ent-day-cell ${statusCls}" title="${escapeHtml(tooltip)}">${cellInner}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      bilanTable.innerHTML = html;
    },

    // ── Onglet Annuler une saisie ───────────────────────────────
    _bindAnnul() {
      annulMineOnly?.addEventListener('change', () => this._renderAnnul());
    },

    _renderAnnul() {
      if (!annulList) return;
      const myKey = sessionStorage.getItem('cpas_current_agent_key') || null;
      const mineOnly = !!annulMineOnly?.checked;
      const typesById    = Object.fromEntries(DB.getCleaningTypes().map(t => [t.id, t.label]));
      const cleanersById = Object.fromEntries(DB.getCleaners().map(c => [c.id, c.name]));
      const lieuxById    = DB.getLieux();

      const entries = Object.entries(this._logs || {})
        .map(([id, l]) => ({ id, ...l }))
        .filter(l => !mineOnly || l.byAgentKey === myKey)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 100); // limite affichage aux 100 plus récentes

      if (!entries.length) {
        annulList.innerHTML = '<div class="ent-empty-hint">' +
          (mineOnly ? 'Aucune saisie de votre part.' : 'Aucune saisie enregistrée.') +
          '</div>';
        return;
      }

      annulList.innerHTML = entries.map(e => {
        const when = e.ts ? new Date(e.ts) : null;
        const whenStr = when
          ? `${pad(when.getDate())}/${pad(when.getMonth()+1)} ${pad(when.getHours())}:${pad(when.getMinutes())}`
          : (e.date || '');
        const lieuName = lieuxById[e.lieuId]?.name || e.lieuId || '?';
        const localName = DB.getLocalLabel(e.localId) || `Local ${e.localId}`;
        const cleanerName = cleanersById[e.cleanerId] || '';
        const typeLabel = typesById[e.typeId] || '?';
        const deepTag = e.approfondi ? ' <span class="ent-annul-deep">(approfondi)</span>' : '';
        const mine = e.byAgentKey === myKey;
        return `<div class="ent-annul-item" data-id="${escapeHtml(e.id)}">
          <div class="ent-annul-item-when">${escapeHtml(whenStr)}</div>
          <div class="ent-annul-item-desc">
            <b>${escapeHtml(localName)}</b> — ${escapeHtml(lieuName)} — ${escapeHtml(typeLabel)}${deepTag}
            <span class="ent-annul-meta">
              ${escapeHtml(e.cleanerBadge || '?')}${cleanerName ? ' · ' + escapeHtml(cleanerName) : ''}
              ${mine ? ' · <em style="color:#15803d">par vous</em>' : ''}
            </span>
          </div>
          <button type="button" class="ent-annul-del" data-id="${escapeHtml(e.id)}">🗑 Supprimer</button>
        </div>`;
      }).join('');

      annulList.querySelectorAll('.ent-annul-del').forEach(btn => {
        btn.addEventListener('click', () => this._removeLog(btn));
      });
    },

    async _removeLog(btn) {
      const id = btn.dataset.id;
      if (!id) return;
      const log = (this._logs || {})[id];
      if (!log) { showToast('Saisie introuvable', true); return; }
      const localName = DB.getLocalLabel(log.localId) || `Local ${log.localId}`;
      if (!confirm(`Supprimer la saisie "${localName}" du ${log.date} ?`)) return;
      btn.disabled = true;
      try {
        await DB.removeCleaningLog(id);
        showToast('✓ Saisie supprimée');
      } catch (e) {
        console.warn('[ENTRETIEN] remove failed', e);
        showToast('Erreur : ' + (e?.message || e), true);
        btn.disabled = false;
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // Dashboard (calqué sur TECH, scopé type=entretien)
    // ═══════════════════════════════════════════════════════════════
    _bindDashboard() {
      document.getElementById('entPeriodFilter')?.querySelectorAll('.ent-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#entPeriodFilter .ent-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._period = btn.dataset.period === 'all' ? 'all' : parseInt(btn.dataset.period, 10);
          this._renderDashboard();
        });
      });
      document.getElementById('entStatusFilter')?.querySelectorAll('.ent-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#entStatusFilter .ent-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._status = btn.dataset.status;
          this._renderDashboard();
        });
      });
      const searchEl = document.getElementById('entSearch');
      let searchT;
      searchEl?.addEventListener('input', () => {
        clearTimeout(searchT);
        searchT = setTimeout(() => {
          this._search = searchEl.value.trim().toLowerCase();
          this._renderDashboard();
        }, 250);
        this._renderSuggestions(searchEl.value);
      });
      searchEl?.addEventListener('focus',   () => this._renderSuggestions(searchEl.value));
      searchEl?.addEventListener('keydown', e => this._handleSearchKeydown(e));
      searchEl?.addEventListener('blur',    () => {
        setTimeout(() => document.getElementById('entSuggest')?.classList.add('hidden'), 150);
      });
      document.getElementById('entExportBtn')?.addEventListener('click', () => this._exportDashboardCSV());
    },

    _renderSuggestions(query) {
      const box = document.getElementById('entSuggest');
      if (!box) return;
      const q = (query || '').toLowerCase().trim();
      this._suggestHighlight = -1;

      const reqs = Object.values(this._allRequests || {}).filter(r => r.type === 'entretien');
      const countBy = (getter) => {
        const m = {};
        reqs.forEach(r => { const v = getter(r); if (v) m[v] = (m[v] || 0) + 1; });
        return m;
      };
      const locaux = countBy(r => r.local);
      const themes = countBy(r => r.themeId ? (DB.getThemeLabelForRequestType?.('entretien', r.themeId) || DB.getTechThemeLabel?.(r.themeId) || null) : null);
      const agents = {};
      reqs.forEach(r => {
        if (r.fromAgentName)  agents[r.fromAgentName]  = (agents[r.fromAgentName]  || 0) + 1;
        if (r.assignedToName) agents[r.assignedToName] = (agents[r.assignedToName] || 0) + 1;
      });
      const keywords = [
        { label: 'urgent',         matcher: r => r.urgent || (r.urgencyLevel >= 4), icon: '🚨' },
        { label: 'récurrente',     matcher: r => r.recurrence,                     icon: '↻' },
        { label: 'non catégorisé', matcher: r => !r.themeId,                       icon: '🏷️' },
      ];
      const match = (label) => !q || label.toLowerCase().includes(q);

      const groups = [];
      const mkGroup = (title, entries, icon) => {
        if (!entries.length) return;
        groups.push({ title, entries: entries.slice(0, 8).map(([label, count]) => ({ label, count, icon })) });
      };

      // Lieux : agréger les requêtes selon leurs locaux
      const lieuxObj = DB.getLieux?.() || {};
      const lieuCounts = [];
      Object.values(lieuxObj).forEach(lieu => {
        if (!lieu.name) return;
        const labels = (lieu.localIds || []).map(id => (DB.getLocalLabel(id) || '').toLowerCase());
        const count = reqs.filter(r => {
          if (!r.local) return false;
          const rl = r.local.toLowerCase();
          return labels.some(l => rl === l || rl.includes(l));
        }).length;
        if (count > 0 || match(lieu.name)) lieuCounts.push([lieu.name, count]);
      });

      mkGroup('Lieux',  lieuCounts.filter(([l]) => match(l)).sort((a, b) => b[1] - a[1]), '🏢');
      mkGroup('Locaux', Object.entries(locaux).filter(([l]) => match(l)).sort((a, b) => b[1] - a[1]), '📍');
      mkGroup('Thèmes', Object.entries(themes).filter(([l]) => match(l)).sort((a, b) => b[1] - a[1]), '🏷️');
      mkGroup('Agents', Object.entries(agents).filter(([l]) => match(l)).sort((a, b) => b[1] - a[1]), '👤');

      const keywordItems = keywords
        .filter(k => match(k.label))
        .map(k => ({ label: k.label, icon: k.icon, count: reqs.filter(k.matcher).length }))
        .filter(k => k.count > 0);
      if (keywordItems.length) groups.push({ title: 'Filtres rapides', entries: keywordItems });

      if (!groups.length) {
        box.innerHTML = `<div class="ent-suggest-empty">Tape un local, un thème, un agent ou un mot-clé…</div>`;
      } else {
        box.innerHTML = groups.map(g => `
          <div class="ent-suggest-group">${g.title}</div>
          ${g.entries.map(e => `
            <div class="ent-suggest-item" data-val="${e.label.replace(/"/g, '&quot;')}">
              <span class="ent-suggest-ico">${e.icon}</span>
              <span>${escapeHtml(e.label)}</span>
              <span class="ent-suggest-count">${e.count}</span>
            </div>`).join('')}
        `).join('');
      }
      box.classList.remove('hidden');
      box.querySelectorAll('.ent-suggest-item').forEach(it => {
        it.addEventListener('mousedown', ev => { ev.preventDefault(); this._applySuggestion(it.dataset.val); });
      });
    },

    _applySuggestion(value) {
      const input = document.getElementById('entSearch');
      if (input) input.value = value;
      this._search = value.toLowerCase();
      document.getElementById('entSuggest')?.classList.add('hidden');
      this._renderDashboard();
    },

    _handleSearchKeydown(e) {
      const box = document.getElementById('entSuggest');
      const items = box?.querySelectorAll('.ent-suggest-item');
      if (!items?.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._suggestHighlight = Math.min(this._suggestHighlight + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('active', i === this._suggestHighlight));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._suggestHighlight = Math.max(this._suggestHighlight - 1, 0);
        items.forEach((el, i) => el.classList.toggle('active', i === this._suggestHighlight));
      } else if (e.key === 'Enter' && this._suggestHighlight >= 0) {
        e.preventDefault();
        this._applySuggestion(items[this._suggestHighlight].dataset.val);
      } else if (e.key === 'Escape') {
        box?.classList.add('hidden');
      }
    },

    // Filtre de base, scopé type=entretien.
    _filteredReqs() {
      const now = Date.now();
      const periodMs = this._period === 'all' ? Infinity : this._period * 24 * 3600 * 1000;
      const cutoff = this._period === 'all' ? 0 : now - periodMs;
      const q = this._search;
      const reqs = this._allRequests || {};

      const lieuLocalLabels = [];
      if (q) {
        const lieux = DB.getLieux?.() || {};
        Object.values(lieux).forEach(lieu => {
          if (lieu.name && lieu.name.toLowerCase().includes(q)) {
            (lieu.localIds || []).forEach(id => {
              const lbl = DB.getLocalLabel(id);
              if (lbl) lieuLocalLabels.push(lbl.toLowerCase());
            });
          }
        });
      }

      return Object.entries(reqs)
        .map(([id, r]) => ({ id, ...r }))
        .filter(r => r.type === 'entretien')        // 🔒 scope entretien
        .filter(r => {
          if (r.createdAt < cutoff) return false;
          if (r.createdAt > now) return false;       // exclut les templates programmés (startDate future)
          if (this._status !== 'all' && r.status !== this._status) return false;
          if (!q) return true;
          const themeLbl = DB.getThemeLabelForRequestType?.('entretien', r.themeId)
                        || DB.getTechThemeLabel?.(r.themeId) || '';
          const hay = [
            r.description || '',
            r.local || '',
            r.fromAgentName || '',
            r.assignedToName || '',
            themeLbl,
          ].join(' ').toLowerCase();
          if (hay.includes(q)) return true;
          if (lieuLocalLabels.length && r.local) {
            const rLocal = r.local.toLowerCase();
            if (lieuLocalLabels.some(l => rLocal === l || rLocal.includes(l))) return true;
          }
          return false;
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },

    _renderDashboard() {
      const grid = document.getElementById('entGrid');
      if (!grid) return;
      const reqs = this._filteredReqs();
      const total           = reqs.length;
      const openCount       = reqs.filter(r => r.status === 'open').length;
      const inProgressCount = reqs.filter(r => r.status === 'in_progress').length;
      const doneCount       = reqs.filter(r => r.status === 'done').length;
      const postponedCount  = reqs.filter(r => r.status === 'postponed').length;

      const resolutions = reqs.filter(r => r.status === 'done').map(r => {
        const comments = r.comments ? Object.values(r.comments) : [];
        const lastTs = comments.length ? Math.max(...comments.map(c => c.createdAt || 0)) : 0;
        return lastTs > r.createdAt ? lastTs - r.createdAt : 0;
      }).filter(ms => ms > 0);
      const avgMs = resolutions.length ? resolutions.reduce((a, b) => a + b, 0) / resolutions.length : 0;
      const avgResolution = avgMs > 0 ? this._fmtDuration(avgMs) : '—';

      const themeLabel = id =>
        DB.getThemeLabelForRequestType?.('entretien', id) || DB.getTechThemeLabel?.(id) || '—';
      const themeCounts = {};
      reqs.forEach(r => { const k = r.themeId || '__none__'; themeCounts[k] = (themeCounts[k] || 0) + 1; });
      const topThemeEntry = Object.entries(themeCounts).sort((a, b) => b[1] - a[1])[0];
      const topThemeLabel = topThemeEntry ? themeLabel(topThemeEntry[0] === '__none__' ? null : topThemeEntry[0]) : '—';

      const localCounts = {};
      reqs.forEach(r => { if (r.local) localCounts[r.local] = (localCounts[r.local] || 0) + 1; });
      const topLocals = Object.entries(localCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

      const agentCounts = {};
      reqs.forEach(r => { if (r.assignedToName) agentCounts[r.assignedToName] = (agentCounts[r.assignedToName] || 0) + 1; });
      const topAgents = Object.entries(agentCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

      // Séries actives — on lit _allRequests (non filtré) pour inclure
      // les séries programmées dans le futur (createdAt > now).
      const now = Date.now();
      const activeSeries = Object.entries(this._allRequests || {})
        .map(([id, r]) => ({ id, ...r }))
        .filter(r =>
          r.type === 'entretien' &&
          r.recurrence && r.recurrence.templateId === r.id &&
          (!r.recurrence.until || r.recurrence.until > now)
        );
      const lateCutoff = now - 7 * 24 * 3600 * 1000;
      const lateReqs = reqs.filter(r =>
        (r.status === 'open' || r.status === 'in_progress') && r.createdAt < lateCutoff
      ).sort((a, b) => a.createdAt - b.createdAt);
      const uncategorized = reqs.filter(r => !r.themeId).length;

      const dayBuckets = this._buildDayBuckets(reqs);

      const kpi = (icon, value, label, color) => `
        <div class="ent-widget">
          <div class="ent-widget-title">${icon} ${label}</div>
          <div class="ent-kpi-value"${color ? ` style="color:${color}"` : ''}>${value}</div>
          <div class="ent-kpi-label">${label}</div>
        </div>`;
      const hBars = (entries, maxLabel = 24, clickable = false) => {
        if (!entries.length) return '<p class="ent-placeholder">Aucune donnée.</p>';
        const max = entries[0][1] || 1;
        return `<div class="ent-hbars">${entries.map(([label, count]) => {
          const pct = (count / max) * 100;
          const lbl = label.length > maxLabel ? label.slice(0, maxLabel - 1) + '…' : label;
          const click = clickable ? ` data-hbar-click="${escapeHtml(label)}" style="cursor:pointer"` : '';
          return `<div class="ent-hbar-row"${click}>
            <span class="ent-hbar-label" title="${escapeHtml(label)}">${escapeHtml(lbl)}</span>
            <div class="ent-hbar-track"><div class="ent-hbar-fill" style="width:${pct}%"></div></div>
            <span class="ent-hbar-count">${count}</span>
          </div>`;
        }).join('')}</div>`;
      };
      const vBars = buckets => {
        const max = Math.max(1, ...buckets.map(b => b.count));
        return `<div class="ent-vbars">${buckets.map(b => {
          const h = (b.count / max) * 100;
          return `<div class="ent-vbar-col" title="${b.label} : ${b.count} requête(s)">
            <div class="ent-vbar-track"><div class="ent-vbar-fill" style="height:${h}%"></div></div>
            <div class="ent-vbar-label">${b.shortLabel}</div>
          </div>`;
        }).join('')}</div>`;
      };
      const statusStack = () => {
        if (!total) return '<p class="ent-placeholder">Aucune donnée.</p>';
        const segments = [
          { key: 'open',        label: 'Ouvertes',  count: openCount,       color: '#fbbf24' },
          { key: 'in_progress', label: 'En cours',  count: inProgressCount, color: '#3b82f6' },
          { key: 'postponed',   label: 'Reportées', count: postponedCount,  color: '#94a3b8' },
          { key: 'done',        label: 'Terminées', count: doneCount,       color: '#10b981' },
        ];
        const bar = `<div class="ent-status-bar">${segments.filter(s => s.count > 0).map(s => {
          const pct = (s.count / total) * 100;
          return `<div class="ent-status-seg" style="flex:${s.count};background:${s.color}" title="${s.label} : ${s.count} (${pct.toFixed(0)}%)"></div>`;
        }).join('')}</div>`;
        const legend = `<div class="ent-status-legend">${segments.map(s => `
          <span class="ent-status-item"><span class="ent-status-dot" style="background:${s.color}"></span>${s.label} <b>${s.count}</b></span>
        `).join('')}</div>`;
        return bar + legend;
      };
      const timelineRows = reqs.slice(0, 15).map(r => {
        const dt = new Date(r.createdAt).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const theme = themeLabel(r.themeId);
        const statusIcon = { open: '🟡', in_progress: '🔵', postponed: '⏸', done: '✅' }[r.status] || '?';
        return `<tr>
          <td class="ent-tl-date">${dt}</td>
          <td>${statusIcon}</td>
          <td class="ent-tl-theme">${escapeHtml(theme)}</td>
          <td class="ent-tl-local">${escapeHtml(r.local || '—')}</td>
          <td class="ent-tl-desc" title="${escapeHtml(r.description || '')}">${escapeHtml((r.description || '').slice(0, 80))}</td>
        </tr>`;
      }).join('');

      const unitLabels = { days: 'jour(s)', weeks: 'sem.', months: 'mois' };
      const activeRecHtml = activeSeries.length
        ? activeSeries.map(t => {
            const rec = t.recurrence;
            const nextDate = rec.nextAt && (!rec.until || rec.nextAt <= rec.until)
              ? new Date(rec.nextAt).toLocaleDateString('fr-BE', { day: '2-digit', month: 'short', year: 'numeric' })
              : 'terminée';
            return `<div class="ent-rec-row">
              <div class="ent-rec-desc" title="${escapeHtml(t.description || '')}">${escapeHtml((t.description || '').slice(0, 60))}</div>
              <div class="ent-rec-meta">
                <span class="ent-rec-freq">↻ tous les ${rec.interval} ${unitLabels[rec.unit] || rec.unit}</span>
                <span>🏷️ ${escapeHtml(themeLabel(t.themeId))}</span>
                ${t.local ? `<span>📍 ${escapeHtml(t.local)}</span>` : ''}
                <span class="ent-rec-next">Prochaine : <b>${nextDate}</b></span>
              </div>
            </div>`;
          }).join('')
        : '<p class="ent-placeholder">Aucune série récurrente active.</p>';

      const lateHtml = lateReqs.length
        ? `<div class="ent-late-list">${lateReqs.slice(0, 10).map(r => {
            const days = Math.floor((now - r.createdAt) / (24 * 3600 * 1000));
            return `<div class="ent-late-row">
              <span class="ent-late-days">${days}j</span>
              <span class="ent-late-theme">${escapeHtml(themeLabel(r.themeId))}</span>
              <span class="ent-late-local">${escapeHtml(r.local || '—')}</span>
              <span class="ent-late-desc" title="${escapeHtml(r.description || '')}">${escapeHtml((r.description || '').slice(0, 50))}</span>
            </div>`;
          }).join('')}</div>${lateReqs.length > 10 ? `<p class="ent-widget-sub">… et ${lateReqs.length - 10} de plus</p>` : ''}`
        : '<p class="ent-placeholder">Aucune requête en retard 🎉</p>';

      grid.innerHTML = `
        ${kpi('🎫', total, 'Total requêtes')}
        ${kpi('🟠', openCount, 'Ouvertes', '#f59e0b')}
        ${kpi('⏱️', `<span style="font-size:1.5rem">${avgResolution}</span>`, 'Résolution moy.', '#0ea5e9')}
        ${kpi('🔥', `<span style="font-size:1rem;line-height:1.2;display:inline-block;margin-top:.3rem">${escapeHtml(topThemeLabel)}</span>`, 'Top thème')}

        <div class="ent-widget w-large">
          <div class="ent-widget-title">📈 Requêtes créées (période)</div>
          ${vBars(dayBuckets)}
        </div>

        <div class="ent-widget w-medium">
          <div class="ent-widget-title">🏷️ Répartition par thème</div>
          ${hBars(Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).map(([k, c]) => [
            k === '__none__' ? 'Non catégorisé' : themeLabel(k),
            c,
          ]))}
        </div>

        <div class="ent-widget w-medium">
          <div class="ent-widget-title">📍 Top 10 locaux</div>
          ${hBars(topLocals, 28, true)}
        </div>

        <div class="ent-widget w-medium">
          <div class="ent-widget-title">👷 Charge par agent (assignations)</div>
          ${hBars(topAgents, 28)}
        </div>

        <div class="ent-widget w-medium">
          <div class="ent-widget-title">🥧 Répartition par statut</div>
          ${statusStack()}
        </div>

        <div class="ent-widget w-medium">
          <div class="ent-widget-title">⚠️ Requêtes en retard <span class="ent-widget-sub">(> 7 jours ouvertes)</span></div>
          ${lateHtml}
        </div>

        <div class="ent-widget w-medium">
          <div class="ent-widget-title">↻ Séries récurrentes actives</div>
          ${activeRecHtml}
        </div>

        ${uncategorized > 0 ? `
        <div class="ent-widget w-large" style="background:#fffbeb;border:1.5px solid #fde68a">
          <div class="ent-widget-title">🏷️ Requêtes non catégorisées</div>
          <p style="font-size:.88rem;color:#92400e">
            <b>${uncategorized}</b> requête(s) dans la période n'ont pas de thème.
            Elles sont exclues des stats "par thème" ci-dessus.
          </p>
        </div>` : ''}

        <div class="ent-widget w-large">
          <div class="ent-widget-title">📜 Timeline récente <span class="ent-widget-sub">(15 dernières)</span></div>
          ${total === 0
            ? '<p class="ent-placeholder">Aucune requête pour cette période / filtre.</p>'
            : `<div class="ent-tl-wrap">
                <table class="ent-timeline">
                  <thead><tr><th>Date</th><th></th><th>Thème</th><th>Local</th><th>Description</th></tr></thead>
                  <tbody>${timelineRows}</tbody>
                </table>
              </div>`
          }
        </div>
      `;

      grid.querySelectorAll('[data-hbar-click]').forEach(row => {
        row.addEventListener('click', () => {
          const val = row.dataset.hbarClick;
          const searchEl = document.getElementById('entSearch');
          if (searchEl) { searchEl.value = val; this._search = val.toLowerCase(); this._renderDashboard(); }
        });
      });
    },

    _fmtDuration(ms) {
      const hours = ms / (1000 * 3600);
      if (hours < 1)  return `${Math.round(ms / 60000)} min`;
      if (hours < 24) return `${hours.toFixed(1)} h`;
      const days = hours / 24;
      return `${days.toFixed(1)} j`;
    },

    _buildDayBuckets(reqs) {
      const now = Date.now();
      const days = this._period === 'all' ? 30 : Math.min(this._period, 90);
      const buckets = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now - i * 24 * 3600 * 1000);
        const key = d.toISOString().slice(0, 10);
        const short = d.toLocaleDateString('fr-BE', { day: '2-digit' });
        buckets.push({ key, label: d.toLocaleDateString('fr-BE'), shortLabel: short, count: 0 });
      }
      reqs.forEach(r => {
        const k = new Date(r.createdAt).toISOString().slice(0, 10);
        const b = buckets.find(x => x.key === k);
        if (b) b.count++;
      });
      return buckets;
    },

    _exportDashboardCSV() {
      const reqs = this._filteredReqs();
      if (!reqs.length) { alert('Aucune requête à exporter avec ces filtres.'); return; }
      const themeLabel = id =>
        DB.getThemeLabelForRequestType?.('entretien', id) || DB.getTechThemeLabel?.(id) || '';
      const rows = [['id', 'createdAt', 'theme', 'status', 'local', 'description', 'agent_requester', 'agent_assigned', 'urgent', 'recurrence']];
      reqs.forEach(r => {
        const rec = r.recurrence;
        const recStr = rec ? (rec.templateId === r.id ? `template ${rec.interval}/${rec.unit}` : 'occurrence') : '';
        rows.push([
          r.id,
          new Date(r.createdAt).toISOString(),
          themeLabel(r.themeId),
          r.status || '',
          r.local || '',
          (r.description || '').replace(/\n/g, ' '),
          r.fromAgentName || '',
          r.assignedToName || '',
          r.urgent ? 'oui' : '',
          recStr,
        ]);
      });
      const csv = '﻿' + rows.map(row => row.map(cell => {
        const s = String(cell);
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(';')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `requetes_entretien_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },

    // ═══════════════════════════════════════════════════════════════
    // Pane Requêtes plein écran (réutilise REQUESTS._renderCard)
    // ═══════════════════════════════════════════════════════════════
    _bindRequestsPaneFilters() {
      document.querySelectorAll('#entReqTabs .req-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#entReqTabs .req-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._reqStatusFilter = btn.dataset.status;
          if (this._tab === 'requests') this._renderRequestsPane();
        });
      });
      document.querySelectorAll('#entReqUrgencyFilter .ent-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#entReqUrgencyFilter .ent-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._reqUrgFilter = btn.dataset.urg;
          if (this._tab === 'requests') this._renderRequestsPane();
        });
      });
      document.getElementById('entReqPrintBtn')?.addEventListener('click', () => this._printRequestsList());
    },

    _renderRequestsPane() {
      const listEl = document.getElementById('entReqList');
      if (!listEl) return;
      const reqs = this._allRequests || {};
      const isAdmin = DB.hasPermission?.('editSettings');
      const agents  = DB.getAgentsWithKeys?.() || [];
      const TYPE_ICONS = { technique: '🔧', entretien: '🧹', autre: '📋' };
      const STATUS_LABELS = {
        open:        '🟡 Ouverte',
        in_progress: '🔵 En cours',
        postponed:   '⏸ Reportée',
        done:        '✅ Terminée',
      };
      const urg = (r) => {
        const l = parseInt(r?.urgencyLevel);
        if (l >= 1 && l <= 5) return l;
        return r?.urgent ? 5 : 3;
      };
      const _now = Date.now();
      const entries = Object.entries(reqs)
        .filter(([, r]) => r.createdAt <= _now)              // exclut templates programmés
        .filter(([, r]) => r.type === 'entretien')           // 🔒 scope entretien
        .filter(([, r]) => r.status === this._reqStatusFilter)
        .filter(([, r]) => this._reqUrgFilter !== 'high' || urg(r) >= 4)
        .sort(([, a], [, b]) => (urg(b) - urg(a)) || (b.createdAt - a.createdAt));

      if (!entries.length) {
        listEl.innerHTML = '<div class="ent-loading">Aucune requête ne correspond aux filtres.</div>';
        return;
      }

      listEl.innerHTML = entries.map(([id, r]) =>
        (typeof REQUESTS !== 'undefined' && REQUESTS._renderCard)
          ? REQUESTS._renderCard(id, r, isAdmin, agents, TYPE_ICONS, STATUS_LABELS)
          : ''
      ).join('');

      if (typeof REQUESTS !== 'undefined') {
        if (!REQUESTS._agentKey)  REQUESTS._agentKey  = sessionStorage.getItem('cpas_current_agent_key');
        if (!REQUESTS._agentName) REQUESTS._agentName = DB.getAgentsWithKeys().find(a => a.key === REQUESTS._agentKey)?.name || null;

        listEl.querySelectorAll('[data-req-action]').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { reqAction: action, reqId: id } = btn.dataset;
            await REQUESTS._handleAction?.(action, id, null, agents);
          });
        });
        listEl.querySelectorAll('.req-assign-worker-select').forEach(sel => {
          sel.addEventListener('change', async (e) => {
            e.stopPropagation();
            const id = sel.dataset.reqId;
            try { await DB.assignRequestWorker(id, sel.value || null); } catch (err) { console.warn(err); }
          });
        });
        listEl.querySelectorAll('.req-comment-toggle').forEach(btn => {
          btn.addEventListener('click', () => REQUESTS._openCommentBox?.(btn.dataset.reqId));
        });
        listEl.querySelectorAll('.req-tag-btn').forEach(btn => {
          btn.addEventListener('click', () => REQUESTS._openThemePicker?.(btn.dataset.reqId));
        });
        listEl.querySelectorAll('.req-view-series').forEach(btn => {
          btn.addEventListener('click', (e) => { e.stopPropagation(); REQUESTS._openSeriesView?.(btn.dataset.reqId); });
        });
        listEl.querySelectorAll('.req-stop-series').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Arrêter la série ? Aucune nouvelle occurrence ne sera générée.')) return;
            try { await DB.stopRequestSeries(btn.dataset.reqId); } catch (err) { console.warn(err); }
          });
        });
        listEl.querySelectorAll('.req-urg-edit-btn').forEach(btn => {
          btn.addEventListener('click', (e) => { e.stopPropagation(); REQUESTS._openUrgencyPicker?.(btn.dataset.reqId); });
        });
      }
    },

    _printRequestsList() {
      const area = document.getElementById('entRqPrintArea');
      if (!area) return;
      const reqs = this._allRequests || {};
      const TYPE_ICONS = { technique: '🔧', entretien: '🧹', autre: '📋' };
      const urg = (r) => {
        const l = parseInt(r?.urgencyLevel);
        if (l >= 1 && l <= 5) return l;
        return r?.urgent ? 5 : 3;
      };
      const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      const _now = Date.now();
      const entries = Object.entries(reqs)
        .filter(([, r]) => r.createdAt <= _now)
        .filter(([, r]) => r.type === 'entretien')
        .filter(([, r]) => r.status === this._reqStatusFilter)
        .filter(([, r]) => this._reqUrgFilter !== 'high' || urg(r) >= 4);

      if (!entries.length) { alert('Aucune requête à imprimer avec les filtres actuels.'); return; }

      const groups = new Map();
      const UNASSIGNED_KEY = '__unassigned__';
      for (const [id, r] of entries) {
        let key = UNASSIGNED_KEY, label = 'Non assignée', badge = '';
        if (r.workerId) {
          key = `w:${r.workerId}`; label = r.workerName || 'Agent'; badge = r.workerBadge || '';
        } else if (r.assignedTo) {
          key = `a:${r.assignedTo}`; label = r.assignedToName || r.assignedTo;
        }
        if (!groups.has(key)) groups.set(key, { label, badge, list: [] });
        groups.get(key).list.push({ id, r });
      }
      groups.forEach(g => g.list.sort((x, y) => (urg(y.r) - urg(x.r)) || (y.r.createdAt - x.r.createdAt)));
      const groupEntries = Array.from(groups.entries()).sort(([ka, va], [kb, vb]) => {
        if (ka === UNASSIGNED_KEY) return 1;
        if (kb === UNASSIGNED_KEY) return -1;
        return va.label.localeCompare(vb.label, 'fr');
      });

      const statusLabels = {
        open: 'Requêtes ouvertes', in_progress: 'Requêtes en cours',
        postponed: 'Requêtes reportées', done: 'Requêtes terminées',
      };
      const statusTitle = statusLabels[this._reqStatusFilter] || 'Requêtes';
      const dateStr = new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      let html = `<div class="ent-print-rq-title">${esc(statusTitle)} entretien</div>`;
      html += `<div class="ent-print-rq-sub">Imprimé le ${esc(dateStr)} · ${entries.length} requête(s) au total</div>`;

      for (const [, g] of groupEntries) {
        html += `<div class="ent-print-rq-worker-block">
          <div class="ent-print-rq-worker-hd">
            ${g.badge ? `<span class="ent-print-rq-worker-badge">${esc(g.badge)}</span>` : ''}
            <span>${esc(g.label)}</span>
            <span class="ent-print-rq-worker-count">${g.list.length} requête${g.list.length > 1 ? 's' : ''}</span>
          </div>`;
        for (const { r } of g.list) {
          const u = urg(r);
          const icon = TYPE_ICONS[r.type] || '📋';
          const themeLbl = DB.getThemeLabelForRequestType?.(r.type, r.themeId) || DB.getTechThemeLabel?.(r.themeId) || '';
          const themeTxt = r.themeId ? ` · ${themeLbl}` : '';
          const localTxt = r.local ? ` · 📍 ${esc(r.local)}` : '';
          const reopenTxt = (r.status === 'postponed' && r.reopenAt)
            ? ` · ⏰ rouvre ${new Date(r.reopenAt).toLocaleDateString('fr-BE', { day:'2-digit', month:'2-digit' })}` : '';
          const from = r.fromAgentName ? `<small>— par ${esc(r.fromAgentName)}</small>` : '';
          const commentsHtml = r.comments ? Object.entries(r.comments)
            .sort(([, a], [, b]) => (a.createdAt || 0) - (b.createdAt || 0))
            .map(([, c]) => {
              const cd = c.createdAt ? new Date(c.createdAt) : null;
              const ct = cd ? cd.toLocaleDateString('fr-BE', { day:'2-digit', month:'2-digit' }) + ' ' +
                              cd.toLocaleTimeString('fr-BE', { hour:'2-digit', minute:'2-digit' }) : '';
              return `<div class="ent-print-rq-comment">
                <span class="ent-print-rq-comment-author">${esc(c.agentName || '?')}</span>
                ${ct ? `<span class="ent-print-rq-comment-time">${esc(ct)}</span>` : ''}
                <span class="ent-print-rq-comment-text">${esc(c.text || '')}</span>
              </div>`;
            }).join('') : '';
          html += `<div class="ent-print-rq-row">
            <span class="ent-print-rq-urg ent-print-rq-urg-${u}">${u}</span>
            <span class="ent-print-rq-type">${icon} ${esc(r.type || 'autre')}</span>
            <span class="ent-print-rq-desc">${esc(r.description || '')} ${from}</span>
            <span class="ent-print-rq-meta">${esc(themeTxt)}${esc(localTxt)}${esc(reopenTxt)}</span>
          </div>`;
          if (commentsHtml) html += `<div class="ent-print-rq-comments">${commentsHtml}</div>`;
        }
        html += `</div>`;
      }

      area.innerHTML = html;
      this._installPrintMode('rq', '@page { size: portrait; margin: 1cm; }');
      setTimeout(() => window.print(), 50);
    },

    // ═══════════════════════════════════════════════════════════════
    // Stock consommables — décrément 1 clic + gestion (set absolu/CRUD)
    // ═══════════════════════════════════════════════════════════════
    _renderStock() {
      const grid = document.getElementById('entStockGrid');
      if (!grid) return;
      const items = DB.getStockItems();
      if (!items.length) {
        grid.innerHTML = '<div class="ent-empty-hint">Aucun article configuré. Va dans 🛠 Gérer stock pour en ajouter.</div>';
        return;
      }
      const LOW_THRESHOLD = 5;
      grid.innerHTML = items.map(it => {
        const qty   = parseInt(it.quantity, 10) || 0;
        const cls   = qty === 0 ? ' ent-stock-card-zero' : (qty <= LOW_THRESHOLD ? ' ent-stock-card-low' : '');
        const emoji = it.emoji || '📦';
        const unit  = it.unit ? `<span class="ent-stock-unit">${escapeHtml(it.unit)}</span>` : '';
        return `<div class="ent-stock-card${cls}" data-id="${escapeHtml(it.id)}">
          <div class="ent-stock-card-hd">
            <span class="ent-stock-emoji">${escapeHtml(emoji)}</span>
            <span class="ent-stock-name">${escapeHtml(it.name || 'Article')}</span>
            ${unit}
          </div>
          <div class="ent-stock-qty">${qty}</div>
          <div class="ent-stock-card-actions">
            <button type="button" class="ent-stock-adj ent-stock-dec"   data-id="${escapeHtml(it.id)}" data-delta="-1">−1</button>
            <button type="button" class="ent-stock-adj ent-stock-inc"   data-id="${escapeHtml(it.id)}" data-delta="1">+1</button>
            <button type="button" class="ent-stock-adj ent-stock-dec-5" data-id="${escapeHtml(it.id)}" data-delta="-5">−5</button>
            <button type="button" class="ent-stock-adj ent-stock-inc-5" data-id="${escapeHtml(it.id)}" data-delta="5">+5</button>
          </div>
        </div>`;
      }).join('');

      grid.querySelectorAll('.ent-stock-adj').forEach(btn => {
        btn.addEventListener('click', () => this._adjustStock(btn));
      });
    },

    async _adjustStock(btn) {
      const id = btn.dataset.id;
      const delta = parseInt(btn.dataset.delta, 10) || 0;
      if (!id || !delta) return;
      const item = DB.getStockItems().find(it => it.id === id);
      const name = item?.name || 'Article';
      const current = parseInt(item?.quantity, 10) || 0;
      // Décrément sur stock vide : feedback explicite
      if (delta < 0 && current <= 0) {
        showToast(`${name} : stock vide, réapprovisionne via 🛠 Gérer stock`, true);
        return;
      }
      btn.disabled = true;
      try {
        const next = delta < 0
          ? await DB.decrementStockItem(id, -delta)
          : await DB.incrementStockItem(id, delta);
        showToast(`✓ ${name} : ${next}`);
      } catch (e) {
        console.warn('[ENTRETIEN] adjust stock failed', e);
        showToast('Erreur : ' + (e?.message || e), true);
      }
      btn.disabled = false;
    },

    _renderStockManage() {
      const list = document.getElementById('entStockManageList');
      if (!list) return;
      const items = DB.getStockItems();
      if (!items.length) {
        list.innerHTML = '<div class="ent-empty-hint">Aucun article configuré. Utilise le formulaire ci-dessous pour en ajouter.</div>';
      } else {
        list.innerHTML = items.map(it => {
          const emoji = it.emoji || '📦';
          const unit  = it.unit  || '';
          const qty   = parseInt(it.quantity, 10) || 0;
          return `<div class="ent-stock-manage-row" data-id="${escapeHtml(it.id)}">
            <button type="button" class="ent-emoji-trigger" data-field="emoji" data-value="${escapeHtml(emoji)}" title="Choisir un emoji">${escapeHtml(emoji)}</button>
            <input type="text"   class="ent-stock-input ent-stock-input-name"  data-field="name"     value="${escapeHtml(it.name || '')}" placeholder="Nom">
            <input type="text"   class="ent-stock-input ent-stock-input-unit"  data-field="unit"     value="${escapeHtml(unit)}" placeholder="Unité">
            <input type="number" class="ent-stock-input ent-stock-input-qty"   data-field="quantity" value="${qty}" min="0">
            <button type="button" class="ent-stock-save" data-id="${escapeHtml(it.id)}">✓</button>
            <button type="button" class="ent-stock-del"  data-id="${escapeHtml(it.id)}" title="Supprimer">🗑</button>
          </div>`;
        }).join('');
      }

      list.querySelectorAll('.ent-stock-save').forEach(btn => {
        btn.addEventListener('click', () => this._saveStockRow(btn));
      });
      list.querySelectorAll('.ent-stock-del').forEach(btn => {
        btn.addEventListener('click', () => this._removeStockRow(btn));
      });
      list.querySelectorAll('.ent-stock-input').forEach(input => {
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            const id = input.closest('.ent-stock-manage-row')?.dataset.id;
            list.querySelector(`.ent-stock-save[data-id="${id}"]`)?.click();
          }
        });
      });

      // Bouton "Ajouter" (bound une seule fois)
      const addBtn = document.getElementById('entStockAddBtn');
      if (addBtn && !addBtn._bound) {
        addBtn._bound = true;
        addBtn.addEventListener('click', () => this._addStockItem());
        // Submit on Enter dans le formulaire d'ajout
        ['entStockNewEmoji', 'entStockNewName', 'entStockNewUnit', 'entStockNewQty'].forEach(id => {
          document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') addBtn.click();
          });
        });
      }
    },

    async _saveStockRow(btn) {
      const row = btn.closest('.ent-stock-manage-row');
      const id  = row?.dataset.id;
      if (!id) return;
      // Pour le picker emoji on lit dataset.value (button), sinon .value (input).
      const getField = (field) => {
        const el = row.querySelector(`[data-field="${field}"]`);
        if (!el) return '';
        return field === 'emoji' ? (el.dataset.value || el.textContent) : el.value;
      };
      btn.disabled = true;
      try {
        await DB.updateStockItem(id, {
          emoji: getField('emoji'),
          name:  getField('name'),
          unit:  getField('unit'),
        });
        await DB.setStockQuantity(id, getField('quantity'));
        showToast('✓ Article mis à jour');
      } catch (e) {
        console.warn('[ENTRETIEN] update stock failed', e);
        showToast('Erreur : ' + (e?.message || e), true);
      }
      btn.disabled = false;
    },

    async _removeStockRow(btn) {
      const id = btn.dataset.id;
      if (!id) return;
      const item = DB.getStockItems().find(it => it.id === id);
      const name = item?.name || 'cet article';
      if (!confirm(`Supprimer "${name}" du stock ?`)) return;
      btn.disabled = true;
      try {
        await DB.removeStockItem(id);
        showToast('✓ Supprimé');
      } catch (e) {
        console.warn('[ENTRETIEN] remove stock failed', e);
        showToast('Erreur : ' + (e?.message || e), true);
        btn.disabled = false;
      }
    },

    async _addStockItem() {
      const emojiBtn = document.getElementById('entStockNewEmoji');
      const emoji   = emojiBtn?.dataset.value || emojiBtn?.textContent || '📦';
      const name  = document.getElementById('entStockNewName')?.value.trim();
      const unit  = document.getElementById('entStockNewUnit')?.value.trim();
      const qty   = parseInt(document.getElementById('entStockNewQty')?.value, 10) || 0;
      if (!name) {
        showToast('Donne un nom à l\'article', true);
        document.getElementById('entStockNewName')?.focus();
        return;
      }
      try {
        await DB.addStockItem({ name, emoji, unit, quantity: qty });
        showToast(`✓ ${name} ajouté`);
        // Reset le formulaire (emoji revient à 📦 par défaut)
        if (emojiBtn) { emojiBtn.dataset.value = '📦'; emojiBtn.textContent = '📦'; }
        document.getElementById('entStockNewName').value  = '';
        document.getElementById('entStockNewUnit').value  = '';
        document.getElementById('entStockNewQty').value   = '';
        document.getElementById('entStockNewName')?.focus();
      } catch (e) {
        console.warn('[ENTRETIEN] add stock failed', e);
        showToast('Erreur : ' + (e?.message || e), true);
      }
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ENTRETIEN.init());
  } else {
    ENTRETIEN.init();
  }

  window.ENTRETIEN = ENTRETIEN;
})();
