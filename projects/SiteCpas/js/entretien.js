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

  function showToast(msg, err = false) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!err);
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  const ENTRETIEN = {
    _tab: 'register',
    _guardDone: false,
    _logs: {},                 // Snapshot complet de entretien/logs (id -> log)

    init() {
      DB.init();
      DB.initConfig();
      DB.listenCleaningLogs();

      DB.onConfigChange(() => {
        if (!this._guardDone) { this._guard(); this._guardDone = true; }
        this._refreshSelects();
        if (this._tab === 'bilan') this._renderBilan();
      });
      DB.onCleaningLogsChange(logs => {
        this._logs = logs || {};
        if (this._tab === 'bilan') this._renderBilan();
      });

      this._bindTabs();
      this._bindRegister();
      this._bindBilan();
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
    },

    // ── Tabs ─────────────────────────────────────────────────────
    _bindTabs() {
      document.querySelectorAll('.ent-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.ent-tab').forEach(b => b.classList.remove('ent-tab-active'));
          btn.classList.add('ent-tab-active');
          this._tab = btn.dataset.tab;
          document.getElementById('entPaneRegister').style.display = (this._tab === 'register') ? '' : 'none';
          document.getElementById('entPaneBilan').style.display    = (this._tab === 'bilan')    ? '' : 'none';
          if (this._tab === 'bilan') this._renderBilan();
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
      bilanMonth.addEventListener('change', () => this._renderBilan());
      bilanLieu.addEventListener('change',  () => this._renderBilan());
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

      const typesById = Object.fromEntries(DB.getCleaningTypes().map(t => [t.id, t.label]));
      const todayIso = isoDate(new Date());

      let html = '<table class="ent-month-table"><thead><tr><th class="ent-local-col">Local</th>';
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
          // Contenu cellule : badges cleaners uniques concatenés
          const badgesText = [...new Set(logs.map(l => l.cleanerBadge).filter(Boolean))].join(' ');
          const tooltip = logs.map(l => {
            const t = new Date(l.ts || 0);
            const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
            return `${l.cleanerBadge || '?'} — ${typesById[l.typeId] || '?'} — ${hm}${l.approfondi ? ' (approfondi)' : ''}`;
          }).join('\n');
          html += `<td class="ent-day-cell ${statusCls}" title="${escapeHtml(tooltip)}"><span class="ent-cell-badge">${escapeHtml(badgesText)}</span></td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      bilanTable.innerHTML = html;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ENTRETIEN.init());
  } else {
    ENTRETIEN.init();
  }

  window.ENTRETIEN = ENTRETIEN;
})();
