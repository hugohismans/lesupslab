// ═══════════════════════════════════════════════════════════════════
// modal.js — Modals : réservation / détail / confirmation suppression
// ═══════════════════════════════════════════════════════════════════

const MODAL = {
  _editId: null,

  // Recharge les listes locaux/agents/services depuis Firebase
  refreshSelects() {
    const curLocal   = g('fLocal').value;
    const curAgent   = g('fAgent').value;
    // Mémoriser les services actuellement actifs avant de re-rendre les boutons
    const curServices = [...g('fServiceBtns').querySelectorAll('.fs-svc-btn.active')].map(b => b.dataset.svc);

    g('fLocal').innerHTML = '<option value="">— Sélectionner —</option>' +
      CONFIG.LOCALS.map(l => `<option value="${l}">${DB.getLocalLabel(l)}</option>`).join('');

    // Boutons toggle pour les services (multi-sélection)
    g('fServiceBtns').innerHTML = DB.getServices().map(s =>
      `<button type="button" class="fs-svc-btn${curServices.includes(s) ? ' active' : ''}" data-svc="${escapeHtml(s)}">${escapeHtml(s)}</button>`
    ).join('');
    this._bindServiceBtns();

    g('fAgent').innerHTML = '<option value="">— Sélectionner —</option>' +
      DB.getAgents().map(a => `<option value="${a}">${a}</option>`).join('');

    if (curLocal)  g('fLocal').value  = curLocal;
    if (curAgent)  g('fAgent').value  = curAgent;

    // Mettre à jour la liste d'agents dans le select d'invitation
    const invSel = g('fInviteSelect');
    if (invSel) {
      const chips  = [...g('fInviteChips').querySelectorAll('.invite-chip')].map(c => c.dataset.key);
      invSel.innerHTML = '<option value="">+ Ajouter un agent...</option>' +
        DB.getAgentsWithKeys()
          .filter(a => a.key && !chips.includes(a.key))
          .map(a => `<option value="${a.key}" data-name="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`)
          .join('');
    }

    // Mettre à jour les créneaux horaires selon les horaires du lieu actif
    this._refreshTimeOpts();
    this._refreshDeskSelect();

    // Re-rendre la liste paramètres uniquement si aucun input n'est en cours d'édition
    const overlay = g('settingsOverlay');
    if (!overlay.classList.contains('hidden')) {
      const focused = overlay.querySelector('input:focus');
      if (!focused) this._renderSettingsList();
    }
  },

  // Mettre à jour le select desk selon le local sélectionné
  _refreshDeskSelect() {
    const localId = parseInt(g('fLocal').value);
    const wrap = g('fDeskWrap'), sel = g('fDesk');
    if (!wrap || !sel) return;
    if (localId && DB.localHasDesks(localId)) {
      sel.innerHTML = '<option value="">— Sélectionner un desk —</option>' +
        DB.getLocalDesks(localId).map(d =>
          `<option value="${d}">${escapeHtml(DB.getDeskLabel(d))}</option>`
        ).join('');
      wrap.style.display = '';
    } else {
      sel.innerHTML = '';
      wrap.style.display = 'none';
    }
  },

  // ─── Vérification de permission ───────────────────────────────
  // Remplace l'ancienne authentification admin par mot de passe.
  // Vérifie simplement que l'agent connecté a la permission requise.
  _requirePermission(perm, callback) {
    if (DB.hasPermission(perm)) { callback(); return; }
    showToast('Droits insuffisants — contactez votre administrateur.', 'warn');
  },

  // Raccourci pour la permission la plus utilisée
  _requireAdmin(callback) { this._requirePermission('editSettings', callback); },

  // Ouvrir le panneau paramètres
  openSettings() {
    const isAdmin = DB.hasPermission('editSettings');
    g('settingsTitle').textContent = isAdmin ? '⚙ Paramètres' : '🎨 Mes réglages';
    g('settingsOverlay').querySelectorAll('.st-admin-section').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
    // Sidebar — show/hide admin group
    const sideAdminGroup = g('settingsOverlay')?.querySelector('.st-sidenav-group.st-admin-section');
    if (sideAdminGroup) sideAdminGroup.style.display = isAdmin ? '' : 'none';
    this._renderSettingsList();
    g('settingsOverlay').classList.remove('hidden');
    this._initSidenavScroll();
  },

  // Sidebar navigation — scroll to section + highlight active link
  _initSidenavScroll() {
    const sidenav = g('stSidenav');
    const scroll  = g('settingsOverlay')?.querySelector('.st-settings-scroll');
    if (!sidenav || !scroll) return;

    // Click handler
    if (!sidenav._navBound) {
      sidenav._navBound = true;
      sidenav.addEventListener('click', e => {
        const link = e.target.closest('.st-sidenav-link');
        if (!link) return;
        const targetId = link.dataset.target;
        const anchor   = targetId && document.getElementById(targetId);
        if (anchor) {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
          sidenav.querySelectorAll('.st-sidenav-link').forEach(l => l.classList.remove('st-nav-active'));
          link.classList.add('st-nav-active');
        }
      });
      // Scroll spy
      scroll.addEventListener('scroll', () => {
        const anchors = scroll.querySelectorAll('.st-section-anchor[id]');
        let activeId = null;
        anchors.forEach(a => {
          if (a.getBoundingClientRect().top - scroll.getBoundingClientRect().top <= 32) activeId = a.id;
        });
        sidenav.querySelectorAll('.st-sidenav-link').forEach(l => {
          l.classList.toggle('st-nav-active', l.dataset.target === activeId);
        });
      }, { passive: true });
    }
  },

  _renderPermDay(lieuId) {
    const listEl = g('stPermList');
    if (!listEl) return;
    if (!lieuId) { listEl.innerHTML = '<p class="st-empty">Sélectionnez un lieu.</p>'; return; }

    const lieux = DB.getLieux();
    const lieu  = lieux[lieuId];
    if (!lieu) { listEl.innerHTML = '<p class="st-empty">Lieu introuvable.</p>'; return; }

    const localIds = (lieu.localIds || []).map(Number);
    const todayS   = new Date(); todayS.setHours(0,0,0,0);
    const todayE   = new Date(); todayE.setHours(23,59,59,999);
    const now      = new Date();

    const occs = DB.getInRange(todayS, todayE)
      .filter(r => localIds.includes(parseInt(r.localId)))
      .sort((a, b) => (a._start||0) - (b._start||0));

    if (!occs.length) {
      listEl.innerHTML = '<p class="st-empty">Aucune réservation aujourd\'hui pour ce lieu.</p>';
      return;
    }

    listEl.innerHTML = occs.map(r => {
      const svc   = DB.getSvcLabel(r);
      const agt   = r.agent   === 'Autre' ? r.agentCustom  : r.agent;
      const loc   = DB.getLocalLabel(r.localId);
      const hm    = r._start?.toLocaleTimeString('fr-BE', { hour:'2-digit', minute:'2-digit' }) || '';
      const hme   = r._end?.toLocaleTimeString('fr-BE',   { hour:'2-digit', minute:'2-digit' }) || '';
      const past   = r._end && r._end < now;
      const active = r._start <= now && (!r._end || r._end >= now);
      const state  = past ? 'perm-past' : active ? 'perm-active' : 'perm-upcoming';
      const badge  = past ? '✅' : active ? '🟢' : '🕐';
      return `<div class="st-perm-day-row ${state}">
        <span class="st-perm-badge">${badge}</span>
        <span class="st-perm-time">${hm}${hme ? ` – ${hme}` : ''}</span>
        <span class="st-perm-svc">${escapeHtml(svc || '—')}</span>
        <span class="st-perm-agt">${escapeHtml(agt || '—')}</span>
        <span class="st-perm-loc">📍 ${escapeHtml(loc)}</span>
      </div>`;
    }).join('');
  },

  _renderSettingsList() {
    const isAdmin = DB.hasPermission('editSettings');

    // ── Permanences du jour ────────────────────────────────────────
    const permSelect = g('stPermLieuSelect');
    if (permSelect) {
      const lieux = DB.getLieux();
      const lieuEntries = Object.entries(lieux).filter(([, l]) => !l.isBackoffice);
      permSelect.innerHTML = lieuEntries.map(([id, l]) =>
        `<option value="${id}">${escapeHtml(l.name)}</option>`
      ).join('');
      if (!permSelect._bound) {
        permSelect._bound = true;
        permSelect.addEventListener('change', () => this._renderPermDay(permSelect.value));
      }
      this._renderPermDay(permSelect.value || lieuEntries[0]?.[0] || '');
    }

    // ── Lieux ──────────────────────────────────────────────────────
    const lieux = DB.getLieux();
    const currentLieuId = DB.getCurrentLieuId();
    const lieuEntries   = Object.entries(lieux);
    const backofficeEnabled = DB.getFeature('enableBackoffice');
    const publicPermLieux = DB.getPublicPermLieux();
    g('stLieuList').innerHTML = lieuEntries.length
      ? lieuEntries.map(([id, lieu], idx) => `
          <div class="st-local-row st-lieu-row-wrap">
            <div class="st-lieu-row-main">
              <div class="st-lieu-arrows">
                <button class="st-lieu-up"   data-lieu-id="${id}" title="Monter"  ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button class="st-lieu-down" data-lieu-id="${id}" title="Descendre" ${idx === lieuEntries.length - 1 ? 'disabled' : ''}>▼</button>
              </div>
              <input class="st-local-input st-lieu-name-input" type="text" data-lieu-id="${id}"
                     value="${escapeHtml(lieu.name)}" placeholder="Nom interne du lieu">
              ${id === currentLieuId ? '<em class="st-lieu-active">(actif)</em>' : ''}
              ${backofficeEnabled ? `<label class="st-lieu-bo-label" title="Ce lieu est un backoffice (non public, présence sans réservation)">
                <input type="checkbox" class="st-lieu-bo-toggle" data-lieu-id="${id}" ${lieu.isBackoffice ? 'checked' : ''}>
                <span>🏢 BackOffice</span>
              </label>` : ''}
              <button class="st-local-save st-lieu-save" data-lieu-id="${id}" title="Renommer">✓</button>
              <button class="st-lieu-del" data-lieu-id="${id}" data-name="${escapeHtml(lieu.name)}" title="Supprimer">✕</button>
            </div>
            <div class="st-lieu-row-extra">
              <input class="st-local-input st-lieu-pubname-input" type="text" data-lieu-id="${id}"
                     value="${escapeHtml(lieu.publicName || '')}" placeholder="Nom public (affiché sur l'écran public)">
              <button class="st-local-save st-lieu-pubname-save" data-lieu-id="${id}" title="Sauver nom public">✓</button>
              <label class="st-lieu-perm-label" title="Afficher les permanences de ce lieu sur l'écran public">
                <input type="checkbox" class="st-lieu-perm-toggle" data-lieu-id="${id}" ${publicPermLieux[id] ? 'checked' : ''}>
                <span>📅 Permanences publiques</span>
              </label>
            </div>
          </div>`).join('')
      : '<p class="st-empty">Aucun lieu configuré.</p>';

    g('settingsOverlay').querySelectorAll('.st-lieu-up, .st-lieu-down').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const id  = btn.dataset.lieuId;
        const dir = btn.classList.contains('st-lieu-up') ? -1 : 1;
        btn.disabled = true;
        await DB.moveLieu(id, dir);
      }));
    });
    g('settingsOverlay').querySelectorAll('.st-lieu-save').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const id    = btn.dataset.lieuId;
        const row   = btn.closest('.st-local-row');
        const input = row?.querySelector('.st-lieu-name-input');
        const name  = input?.value.trim();
        if (!name) return;
        btn.disabled = true;
        await DB.renameLieu(id, name);
        showToast('Lieu renommé ✓');
        btn.disabled = false;
      }));
    });
    g('settingsOverlay').querySelectorAll('.st-lieu-name-input').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') g('settingsOverlay').querySelector(`.st-lieu-save[data-lieu-id="${input.dataset.lieuId}"]`)?.click();
      });
    });
    g('settingsOverlay').querySelectorAll('.st-lieu-del').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const id   = btn.dataset.lieuId;
        const name = btn.dataset.name;
        if (lieuEntries.length <= 1) return alert('Impossible de supprimer le dernier lieu.');
        if (!confirm(`Supprimer le lieu "${name}" et tous ses locaux ?`)) return;
        btn.disabled = true;
        await DB.removeLieu(id);
        showToast('Lieu supprimé ✓');
      }));
    });

    g('settingsOverlay').querySelectorAll('.st-lieu-bo-toggle').forEach(chk => {
      chk.addEventListener('change', () => this._requireAdmin(async () => {
        await DB.setLieuBackoffice(chk.dataset.lieuId, chk.checked || null);
        showToast(chk.checked ? 'Lieu marqué BackOffice ✓' : 'BackOffice désactivé ✓');
      }));
    });

    g('settingsOverlay').querySelectorAll('.st-lieu-pubname-save').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const id    = btn.dataset.lieuId;
        const row   = btn.closest('.st-lieu-row-wrap');
        const input = row?.querySelector('.st-lieu-pubname-input');
        const name  = input?.value.trim() || null;
        btn.disabled = true;
        await DB.setLieuPublicName(id, name);
        showToast('Nom public sauvegardé ✓');
        btn.disabled = false;
      }));
    });

    g('settingsOverlay').querySelectorAll('.st-lieu-perm-toggle').forEach(chk => {
      chk.addEventListener('change', () => this._requireAdmin(async () => {
        const allChecked = [...g('settingsOverlay').querySelectorAll('.st-lieu-perm-toggle')]
          .filter(c => c.checked).map(c => c.dataset.lieuId);
        await DB.setPublicPermLieux(allChecked);
        showToast('Permanences publiques mises à jour ✓');
      }));
    });

    // ── Horaires du lieu courant ───────────────────────────────────
    if (currentLieuId) {
      const lieuCfg = DB.getLieuConfig(currentLieuId);
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      const hoursHtml = `
        <div class="st-hours-row">
          <label>Ouverture
            <input type="number" id="stOpenHour" class="st-hour-input" min="0" max="23"
                   value="${lieuCfg.openHour}">h
          </label>
          <label>Fermeture
            <input type="number" id="stCloseHour" class="st-hour-input" min="1" max="24"
                   value="${lieuCfg.closeHour}">h
          </label>
          <label>Créneau
            <select id="stSlotMin" class="st-slot-select">
              ${[15,30,60].map(v => `<option value="${v}"${lieuCfg.slotMin===v?' selected':''}>${v} min</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="st-days-row">
          ${[1,2,3,4,5,6,0].map(dow => `
            <label class="st-day-label">
              <input type="checkbox" class="st-day-check" data-dow="${dow}"
                     ${lieuCfg.activeDays[dow] ? 'checked' : ''}>
              ${dayNames[dow]}
            </label>`).join('')}
        </div>
        <button id="stSaveHours" class="btn-sm btn-primary" style="margin-top:.5rem">
          Enregistrer les horaires
        </button>`;
      g('stLieuHours').innerHTML = hoursHtml;

      g('stSaveHours').addEventListener('click', () => this._requireAdmin(async () => {
        const openHour  = parseInt(g('stOpenHour').value);
        const closeHour = parseInt(g('stCloseHour').value);
        const slotMin   = parseInt(g('stSlotMin').value);
        if (isNaN(openHour) || isNaN(closeHour) || openHour >= closeHour) {
          return alert('Horaires invalides — l\'heure de fermeture doit être supérieure à l\'heure d\'ouverture.');
        }
        const activeDays = {};
        g('stLieuHours').querySelectorAll('.st-day-check').forEach(cb => {
          if (cb.checked) activeDays[cb.dataset.dow] = true;
        });
        await DB.setLieuHours(currentLieuId, openHour, closeHour, slotMin,
          Object.keys(activeDays).length ? activeDays : null);
        showToast('Horaires enregistrés ✓');
      }));
    } else {
      g('stLieuHours').innerHTML = '';
    }

    // ── Locaux du lieu courant ─────────────────────────────────────
    const currentLieu = lieux[currentLieuId];
    const lieuDisplayName = currentLieu?.name || '...';
    g('stLieuName').textContent     = lieuDisplayName;
    if (g('stLieuNameHours')) g('stLieuNameHours').textContent = lieuDisplayName;
    const localIds = currentLieu?.localIds || [];

    g('stLocalList').innerHTML = localIds.length
      ? localIds.map(id => {
          const desks = DB.getLocalDesks(id);
          const deskRows = desks.map(deskId => `
            <div class="st-desk-row">
              <input class="st-desk-input" type="text" data-localid="${id}" data-deskid="${deskId}"
                     value="${escapeHtml(DB.getDeskLabel(deskId))}" placeholder="Nom du desk">
              <button class="st-desk-save" data-localid="${id}" data-deskid="${deskId}" title="Renommer">✓</button>
              <button class="st-desk-del" data-localid="${id}" data-deskid="${deskId}" title="Supprimer">✕</button>
            </div>`).join('');
          return `
          <div class="st-local-row">
            <div class="st-local-labels">
              <input class="st-local-input" type="text" data-localid="${id}"
                     value="${escapeHtml(DB.getLocalLabel(id))}" placeholder="Nom interne (Local ${id})">
              <input class="st-local-pub-input" type="text" data-localid="${id}"
                     value="${escapeHtml(DB.getPublicLocalLabel(id) === DB.getLocalLabel(id) ? '' : DB.getPublicLocalLabel(id))}"
                     placeholder="Nom public (facultatif)">
              <input class="st-local-desc-input" type="text" data-localid="${id}"
                     value="${escapeHtml(DB.getLocalDescription(id))}"
                     placeholder="ℹ️ Accès / info pour les bénéficiaires (vue écran)">
            </div>
            <button class="st-local-save" data-localid="${id}" title="Enregistrer">✓</button>
            <button class="st-local-del" data-localid="${id}" data-lieu="${currentLieuId}" title="Supprimer">✕</button>
            <div class="st-desk-section">
              <div class="st-desk-title">Desks${desks.length ? '' : ' <span class="st-no-desk">(aucun)</span>'}</div>
              ${deskRows}
              <div class="st-desk-add-row">
                <input class="st-desk-add-input" type="text" data-localid="${id}" placeholder="Nouveau desk…">
                <button class="st-desk-add-btn" data-localid="${id}">+ Desk</button>
              </div>
            </div>
          </div>`;
        }).join('')
      : '<p class="st-empty">Aucun local dans ce lieu.</p>';

    g('settingsOverlay').querySelectorAll('.st-local-save').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const id       = btn.dataset.localid;
        const row      = btn.closest('.st-local-row');
        const input    = row?.querySelector('.st-local-input');
        const pubInput = row?.querySelector('.st-local-pub-input');
        const descInput = row?.querySelector('.st-local-desc-input');
        if (!input) return;
        btn.disabled = true;
        try {
          await DB.setLocalLabel(id, input.value);
          await DB.setPublicLocalLabel(id, pubInput?.value || '');
          await DB.setLocalDescription(id, descInput?.value || '');
          showToast('Libellé enregistré ✓');
          this.refreshSelects();
        } catch (e) {
          alert('Erreur : ' + e.message);
          btn.disabled = false;
        }
      }));
    });
    g('settingsOverlay').querySelectorAll('.st-local-input, .st-local-pub-input, .st-local-desc-input').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          g('settingsOverlay').querySelector(`.st-local-save[data-localid="${input.dataset.localid}"]`)?.click();
        }
      });
    });
    g('settingsOverlay').querySelectorAll('.st-local-del').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const localId = parseInt(btn.dataset.localid);
        const lieuId  = btn.dataset.lieu;
        if (!confirm(`Supprimer ce local ? Les réservations existantes ne seront pas supprimées.`)) return;
        btn.disabled = true;
        await DB.removeLocal(lieuId, localId);
        showToast('Local supprimé ✓');
      }));
    });

    // ── Desks ────────────────────────────────────────────────────
    g('settingsOverlay').querySelectorAll('.st-desk-save').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const deskId  = btn.dataset.deskid;
        const row     = btn.closest('.st-desk-row');
        const input   = row?.querySelector('.st-desk-input');
        if (!input) return;
        btn.disabled = true;
        await DB.setDeskLabel(deskId, input.value);
        showToast('Desk renommé ✓');
        btn.disabled = false;
      }));
    });
    g('settingsOverlay').querySelectorAll('.st-desk-input').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.closest('.st-desk-row')?.querySelector('.st-desk-save')?.click();
      });
    });
    g('settingsOverlay').querySelectorAll('.st-desk-del').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const localId = parseInt(btn.dataset.localid);
        const deskId  = btn.dataset.deskid;
        if (!confirm(`Supprimer ce desk ? Les réservations existantes ne seront pas supprimées.`)) return;
        btn.disabled = true;
        await DB.removeDesk(localId, deskId);
        showToast('Desk supprimé ✓');
      }));
    });
    g('settingsOverlay').querySelectorAll('.st-desk-add-btn').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const localId = parseInt(btn.dataset.localid);
        const row     = btn.closest('.st-desk-add-row');
        const input   = row?.querySelector('.st-desk-add-input');
        const label   = input?.value.trim();
        if (!label) return;
        btn.disabled = true;
        await DB.addDeskToLocal(localId, label);
        if (input) input.value = '';
        showToast('Desk ajouté ✓');
        btn.disabled = false;
      }));
    });

    // ── Agents ────────────────────────────────────────────────────
    const agents = DB.getAgentsWithKeys();
    const emojiEnabled    = DB.getFeature('agentEmoji');
    const currentAgentKey = sessionStorage.getItem('cpas_current_agent_key') || null;
    g('stAgentList').innerHTML = agents.length
      ? agents.map(({key, name}) => {
          const color      = DB.getAgentColorByKey(key) || '#a5b4fc';
          const emoji      = DB.getAgentEmojiByKey(key) || '';
          const pubName    = key ? (DB._config.agentPublicNames[key] || '') : '';
          const canEdit    = isAdmin || key === currentAgentKey;
          return `
            <div class="st-item st-agent-item">
              ${canEdit
                ? `<input type="color" class="st-agent-color" data-key="${key || ''}" value="${color}" title="Ma couleur">`
                : `<span class="st-agent-color-dot" style="background:${color}"></span>`}
              ${emojiEnabled
                ? (canEdit
                    ? `<button class="st-agent-emoji-btn" data-key="${key || ''}" title="Choisir un emoji">${emoji || '🧑‍💼'}</button>`
                    : `<span class="st-agent-emoji-static">${emoji || '🧑‍💼'}</span>`)
                : ''}
              <div class="st-agent-names">
                <span class="st-name">${escapeHtml(name)}</span>
                ${isAdmin ? `<input class="st-agent-pub-input" type="text" data-key="${key || ''}"
                  value="${escapeHtml(pubName)}" placeholder="Nom public (facultatif)">` : ''}
              </div>
              ${isAdmin ? `<button class="st-agent-pub-save" data-key="${key || ''}" title="Enregistrer nom public">✓</button>` : ''}
              ${isAdmin ? `<button class="st-del" data-type="agent" data-key="${key || ''}" data-name="${escapeHtml(name)}" title="Supprimer">✕</button>` : ''}
            </div>`;
        }).join('')
      : '<p class="st-empty">Aucun élément.</p>';

    g('settingsOverlay').querySelectorAll('.st-agent-color').forEach(input => {
      input.addEventListener('change', async () => {
        const key = input.dataset.key;
        if (!key) return;
        if (!DB.hasPermission('editSettings') && key !== (sessionStorage.getItem('cpas_current_agent_key') || null)) return;
        await DB.setAgentColor(key, input.value);
        CAL.render();
      });
    });
    g('settingsOverlay').querySelectorAll('.st-agent-emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (!key) return;
        if (!DB.hasPermission('editSettings') && key !== (sessionStorage.getItem('cpas_current_agent_key') || null)) return;
        EMOJI_PICKER.open(async emoji => {
          btn.textContent = emoji;
          await DB.setAgentEmoji(key, emoji);
          CAL.render();
        });
      });
    });
    g('settingsOverlay').querySelectorAll('.st-agent-pub-save').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const key   = btn.dataset.key;
        const input = btn.closest('.st-agent-item')?.querySelector('.st-agent-pub-input');
        if (!key || !input) return;
        await DB.setAgentPublicName(key, input.value);
        showToast('Nom public enregistré ✓');
      }));
    });
    g('settingsOverlay').querySelectorAll('.st-agent-pub-input').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.closest('.st-agent-item')?.querySelector('.st-agent-pub-save')?.click();
      });
    });

    // ── Services ───────────────────────────────────────────────────
    g('stSvcList').innerHTML = DB.getServicesWithKeys().length
      ? DB.getServicesWithKeys().map(({key, name}) => `
            <div class="st-item">
              <span class="st-name">${escapeHtml(name)}</span>
              <button class="st-del" data-type="service" data-key="${key || ''}" data-name="${escapeHtml(name)}" title="Supprimer">✕</button>
            </div>`).join('')
      : '<p class="st-empty">Aucun élément.</p>';

    g('settingsOverlay').querySelectorAll('.st-del').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const { type, key, name } = btn.dataset;
        if (!key) return alert('Clé Firebase manquante, rechargez la page.');
        if (!confirm(`Supprimer "${name}" ?`)) return;
        btn.disabled = true;
        if (type === 'agent') await DB.removeAgentByKey(key);
        else                  await DB.removeServiceByKey(key);
        showToast('Supprimé ✓');
      }));
    });

    // ── Modules (feature flags) ────────────────────────────────────
    // Modules essentiels (visibles directement)
    const MODULE_SIMPLE = [
      { key: 'enableTickets',    label: 'Files d\'attente (tickets)', desc: 'Bouton Direct + gestion des queues' },
      { key: 'enablePublicView', label: 'Vue publique',               desc: 'Lien vers l\'écran salle d\'attente' },
      { key: 'enablePresence',   label: 'Statuts présence agents',    desc: 'Bouton Mon statut (retard / absence)' },
      { key: 'enableNotif',      label: 'Centre de notifications',    desc: 'Cloche dans le header — panneau de notifications in-app' },
      { key: 'agentEmoji',       label: 'Emojis des agents',          desc: 'Afficher les emojis dans le calendrier' },
      { key: 'enableBackoffice', label: 'BackOffice',                 desc: 'Lieux internes non publics — présence des agents sans réservation ni queue' },
    ];

    // Modules avancés (dans le bloc <details>)
    const MODULE_ADV_GROUPS = [
      {
        group: '📋 Fonctionnalités',
        items: [
          { key: 'confirmPublicMessage', label: 'Confirmer les messages publics', desc: 'Demande une confirmation avant tout message visible par les bénéficiaires' },
          { key: 'enableInviteAgents',   label: 'Agents invités sur RDV',         desc: 'Permet d\'associer plusieurs agents à une réservation' },
          { key: 'enableNamedTickets',   label: 'Tickets nominatifs',             desc: 'Remplacer le numéro de ticket par le nom du bénéficiaire (accueil saisit le nom à l\'émission)' },
          { key: 'enableTicketPrint',    label: 'Impression de ticket',           desc: 'Bouton imprimer le numéro de ticket dans la vue Direct' },
          { key: 'enableCalendarSync',   label: 'Export iCal (Google/Apple)',     desc: 'Lien .ics pour importer les RDV dans un agenda externe' },
        ]
      },
      {
        group: '🔔 Notifications avancées',
        items: [
          { key: 'enableNotifReminder',         label: 'Rappel 5 min avant RDV',       desc: 'Alerte automatique avant chaque réservation concernant l\'agent connecté' },
          { key: 'enableNotifAuto',             label: 'Notifications automatiques',    desc: 'Retard agent, message du jour mis à jour, file d\'attente longue…' },
          { key: 'enableNotifAdmin',            label: 'Envoi manuel (admin → agents)', desc: 'Permet à l\'admin d\'envoyer une notification ciblée depuis les paramètres' },
          { key: 'enableNotifBrowser',          label: 'Notif navigateur (PC)',         desc: 'Toast système Windows / macOS / Android (onglet ouvert)' },
          { key: 'enableNotifBrowserUrgentOnly',label: 'PC — urgences uniquement',      desc: 'Les notifications PC ne s\'affichent que si la notif est 🚨 Urgence' },
          { key: 'enableNotifPush',             label: 'Push mobile (PWA)',             desc: 'Notifications push même navigateur fermé — nécessite l\'installation PWA', soon: true },
          { key: 'enableNotifPushUrgentOnly',   label: 'Mobile — urgences uniquement',  desc: 'Les push mobiles ne sont envoyés que pour les notifs 🚨 Urgence', soon: true },
          { key: 'enableNotifReadBy',           label: 'Accusé de lecture (admin)',     desc: 'Voir qui a lu chaque notification critique', soon: true },
        ]
      },
      {
        group: '📊 Modules supplémentaires',
        items: [
          { key: 'enableWeather',   label: 'Point météo',           desc: 'Bouton météo sur l\'accueil + phrases météo dans l\'assistant (nécessite une localisation configurée)' },
          { key: 'enableAnalytics', label: 'Analytics',             desc: 'Dashboard statistiques' },
          { key: 'enablePlanning',  label: 'Planning entretien/technique', desc: 'Outil de planning hebdomadaire pour les agents d\'entretien et techniciens' },
          { key: 'enableKiosk',     label: 'Borne kiosk',           desc: 'Écran tactile pour les bénéficiaires', soon: true },
          { key: 'rdvMode',         label: 'Mode RDV nominatifs',   desc: 'Passe en mode rendez-vous individuels', soon: true },
        ]
      },
      {
        group: '🏢 Identité organisation',
        items: [
          { key: 'isCpas', label: 'Mode CPAS', desc: 'Active les messages et conseils spécifiques aux CPAS (service social, bénéficiaires…)' },
        ]
      },
    ];

    const renderToggle = (m) => `
      <label class="st-toggle-row${m.soon ? ' st-toggle-soon' : ''}" title="${m.desc}">
        <input type="checkbox" class="st-feat-toggle" data-feat="${m.key}"
               ${DB.getFeature(m.key) ? 'checked' : ''}
               ${m.soon ? 'disabled' : ''}>
        <span>${m.label}${m.soon ? ' <em class="st-soon-badge">bientôt</em>' : ''}</span>
      </label>`;

    g('stModulesList').innerHTML = MODULE_SIMPLE.map(renderToggle).join('');

    const advListEl = g('stModulesAdvList');
    if (advListEl) {
      advListEl.innerHTML = MODULE_ADV_GROUPS.map(grp => `
        <div class="st-module-group">
          <div class="st-module-group-label">${grp.group}</div>
          ${grp.items.map(renderToggle).join('')}
        </div>`).join('');
    }

    g('settingsOverlay').querySelectorAll('.st-feat-toggle:not([disabled])').forEach(cb => {
      cb.addEventListener('change', () => this._requireAdmin(async () => {
        await DB.setFeature(cb.dataset.feat, cb.checked || null);
        applyFeatureFlags();
        CAL.render();
        LIVE.render();
      }));
    });

    // ── Absences (admin) ──────────────────────────────────────────
    const absBtn = g('btnManageAbsences');
    if (absBtn) absBtn.classList.toggle('hidden', !isAdmin);

    // ── Localisation (météo) ──────────────────────────────────────
    const locSel   = g('stCitySelect');
    const locHint  = g('stLocationHint');
    const locManual = g('stLocationManual');
    if (locSel && isAdmin) {
      const { lat, lon } = DB.getOrgCoords();
      if (lat && lon) {
        const matchVal = `${lat},${lon}`;
        let found = false;
        for (const opt of locSel.options) {
          if (opt.value === matchVal) { opt.selected = true; found = true; break; }
        }
        if (!found) {
          locSel.value = 'custom';
          if (locManual) locManual.classList.remove('hidden');
          if (g('stLatInput')) g('stLatInput').value = lat;
          if (g('stLonInput')) g('stLonInput').value = lon;
        } else {
          if (locManual) locManual.classList.add('hidden');
        }
        if (locHint) locHint.textContent = `Météo active — ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      } else {
        if (locHint) locHint.textContent = 'Aucune localisation configurée — météo désactivée';
      }
      locSel.addEventListener('change', () => {
        if (locManual) locManual.classList.toggle('hidden', locSel.value !== 'custom');
      });
      g('stLocationSave')?.addEventListener('click', () => this._requireAdmin(async () => {
        let lat, lon;
        if (locSel.value === 'custom') {
          lat = parseFloat(g('stLatInput')?.value);
          lon = parseFloat(g('stLonInput')?.value);
        } else if (locSel.value) {
          [lat, lon] = locSel.value.split(',').map(Number);
        }
        if (!lat || !lon || isNaN(lat) || isNaN(lon)) { showToast('Coordonnées invalides'); return; }
        await DB.setOrgCoords(lat, lon);
        if (typeof WEATHER !== 'undefined') WEATHER.fetch(lat, lon);
        if (locHint) locHint.textContent = `Météo active — ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        showToast('Localisation enregistrée ✓');
      }));
    }

    // ── Volume des sons ───────────────────────────────────────────
    const soundLevels = g('stSoundLevels');
    if (soundLevels) {
      const LEVELS = [
        { v: 0,   label: '🔇 Muet' },
        { v: 0.5, label: '🔈 Discret' },
        { v: 1,   label: '🔉 Normal' },
        { v: 1.5, label: '🔊 Fort' },
        { v: 2,   label: '📢 Très fort' },
      ];
      const _updateSoundBtns = (cur) => {
        soundLevels.querySelectorAll('.st-sound-btn').forEach(b => {
          b.classList.toggle('st-sound-active', Number(b.dataset.level) === Number(cur));
        });
      };
      _updateSoundBtns(DB.getSoundLevel());
      soundLevels.querySelectorAll('.st-sound-btn').forEach(btn => {
        btn.addEventListener('click', () => this._requireAdmin(async () => {
          const v = Number(btn.dataset.level);
          await DB.setSoundLevel(v);
          _updateSoundBtns(v);
          const lbl = LEVELS.find(l => l.v === v)?.label || '';
          showToast(`Volume : ${lbl} ✓`);
        }));
      });
    }

    // ── Heure de fin de journée ───────────────────────────────────
    const eodInput = g('stEndOfDayHour');
    const eodSave  = g('stEndOfDayHourSave');
    if (eodInput && isAdmin) {
      eodInput.value = DB.getEndOfDayHour();
      eodSave?.addEventListener('click', () => this._requireAdmin(async () => {
        const h = parseInt(eodInput.value);
        if (isNaN(h) || h < 0 || h > 23) { showToast('Heure invalide'); return; }
        await DB.setEndOfDayHour(h);
        showToast(`Alerte fin de journée configurée à ${h}h ✓`);
      }));
    }

    // ── Données sensibles — durée de conservation ─────────────────
    const sensitivInput = g('stSensitivDeleteMin');
    const sensitivSave  = g('stSensitivDeleteSave');
    if (sensitivInput && isAdmin) {
      sensitivInput.value = DB.getSensitivDataDeleteMin();
      sensitivSave?.addEventListener('click', () => this._requireAdmin(async () => {
        const min = parseInt(sensitivInput.value);
        if (isNaN(min) || min < 5) { showToast('Valeur invalide (min 5 minutes)'); return; }
        await DB.setSensitivDataDeleteMin(min);
        showToast(`Effacement données sensibles configuré à ${min} min ✓`);
      }));
    }

    // ── Affichage des tickets ──────────────────────────────────────
    if (isAdmin) {
      const LOCATIONS = ['publicCall', 'publicBureauCard', 'agentNotif', 'waitBanner', 'kiosk'];
      // Initialiser les checkboxes depuis la config
      LOCATIONS.forEach(loc => {
        const cfg = DB.getTicketDisplay(loc);
        ['showNum', 'showName'].forEach(field => {
          const cb = document.querySelector(`#stTicketDisplayTable input[data-loc="${loc}"][data-field="${field}"]`);
          if (cb) cb.checked = cfg[field];
        });
      });
      // Sauvegarder immédiatement au changement
      document.getElementById('stTicketDisplayTable')?.addEventListener('change', async e => {
        const cb = e.target;
        if (cb.tagName !== 'INPUT' || cb.type !== 'checkbox') return;
        const loc   = cb.dataset.loc;
        const field = cb.dataset.field;
        if (!loc || !field) return;
        await DB.setTicketDisplay(loc, field, cb.checked);
        showToast('Préférences d\'affichage enregistrées ✓', 'ok');
      });
    }

    // ── Diagnostic notifications navigateur ──────────────────────
    const _refreshNotifDiag = () => {
      const permEl  = g('stNotifPermState');
      const featEl  = g('stNotifFeatState');
      const reqBtn  = g('stNotifRequestBtn');
      const hint    = g('stNotifDeniedHint');
      if (!permEl) return;

      const perm = 'Notification' in window ? Notification.permission : 'unsupported';
      const feat = DB.getFeature('enableNotifBrowser');

      const permLabels = { granted: '✅ Autorisée', denied: '❌ Bloquée', default: '⏳ Non demandée', unsupported: '⚠️ Non supporté' };
      permEl.textContent = permLabels[perm] || perm;
      permEl.style.color = perm === 'granted' ? '#4ade80' : perm === 'denied' ? '#f87171' : '#fbbf24';

      featEl.textContent = feat ? '✅ Activée' : '❌ Désactivée — activer "Notif navigateur (PC)" ci-dessus';
      featEl.style.color = feat ? '#4ade80' : '#f87171';

      if (reqBtn) reqBtn.style.display = perm === 'default' ? '' : 'none';
      if (hint)   hint.classList.toggle('hidden', perm !== 'denied');
    };
    _refreshNotifDiag();

    g('stNotifTestBtn')?.addEventListener('click', () => {
      if (!('Notification' in window)) { showToast('Notifications non supportées par ce navigateur'); return; }
      if (Notification.permission !== 'granted') {
        showToast('Permission non accordée — autorisez d\'abord les notifications');
        _refreshNotifDiag();
        return;
      }
      if (!DB.getFeature('enableNotifBrowser')) {
        showToast('Feature "Notif navigateur" non activée dans les paramètres');
        return;
      }
      new Notification('🔔 Test SiteCpas', {
        body: 'Les notifications fonctionnent correctement !',
        icon: document.getElementById('appLogo')?.src || undefined,
      });
      showToast('Notification test envoyée ✓');
    });

    g('stNotifRequestBtn')?.addEventListener('click', async () => {
      const result = await Notification.requestPermission();
      _refreshNotifDiag();
      if (result === 'granted') showToast('Permission accordée ✓');
    });

    // ── Lieux publics ─────────────────────────────────────────────
    const renderPublicPlaces = () => {
      const list = g('stPublicPlacesList');
      if (!list) return;
      const places = DB.getPublicPlaces();
      list.innerHTML = places.length ? places.map(p => `
        <div class="st-screen-row" style="gap:.5rem;flex-wrap:wrap" data-place-id="${p.id}">
          <input type="text" class="st-local-input st-pp-name" value="${escapeHtml(p.name)}" placeholder="Nom" style="flex:1;min-width:140px">
          <input type="text" class="st-local-input st-pp-desc" value="${escapeHtml(p.description)}" placeholder="Description" style="flex:1;min-width:140px">
          <button class="st-local-save st-pp-save" title="Enregistrer">✓</button>
          <button class="st-screen-del st-pp-del" title="Supprimer">✕</button>
        </div>`).join('')
        : '<p class="st-empty" style="font-size:.83rem;color:#94a3b8">Aucun lieu public. Ajoutez-en un ci-dessous.</p>';

      list.querySelectorAll('.st-pp-save').forEach(btn => {
        btn.addEventListener('click', () => this._requireAdmin(async () => {
          const row  = btn.closest('[data-place-id]');
          const id   = row.dataset.placeId;
          const name = row.querySelector('.st-pp-name')?.value.trim();
          const desc = row.querySelector('.st-pp-desc')?.value.trim();
          if (!name) return;
          await DB.updatePublicPlace(id, name, desc);
          showToast('Lieu public mis à jour ✓');
        }));
      });
      list.querySelectorAll('.st-pp-del').forEach(btn => {
        btn.addEventListener('click', () => this._requireAdmin(async () => {
          const id = btn.closest('[data-place-id]').dataset.placeId;
          if (!confirm('Supprimer ce lieu public ?')) return;
          await DB.deletePublicPlace(id);
          showToast('Lieu supprimé');
        }));
      });
    };
    renderPublicPlaces();

    const ppAddBtn = g('stPublicPlaceAdd');
    ppAddBtn?.addEventListener('click', () => this._requireAdmin(async () => {
      const name = g('stPublicPlaceName')?.value.trim();
      const desc = g('stPublicPlaceDesc')?.value.trim();
      if (!name) { showToast('Le nom est requis'); return; }
      await DB.addPublicPlace(name, desc);
      if (g('stPublicPlaceName')) g('stPublicPlaceName').value = '';
      if (g('stPublicPlaceDesc')) g('stPublicPlaceDesc').value = '';
      showToast('Lieu public ajouté ✓');
    }));

    // Rafraîchir la liste quand la config change (DB listener)
    DB.onConfigChange(() => { if (g('stPublicPlacesList')) renderPublicPlaces(); });

    // ── Mascotte ──────────────────────────────────────────────────
    const mascotToggle      = g('stMascotEnabledToggle');
    const mascotPickerLabel = g('stMascotPickerLabel');
    const mascotGrid        = g('stMascotGrid');

    const _applyMascotToggleUI = (enabled) => {
      if (mascotToggle) mascotToggle.checked = !!enabled;
      if (mascotPickerLabel) mascotPickerLabel.style.opacity = enabled ? '' : '.4';
      if (mascotGrid) mascotGrid.style.opacity = enabled ? '' : '.4';
      if (mascotGrid) mascotGrid.querySelectorAll('button').forEach(b => b.disabled = !enabled);
    };

    if (mascotToggle) {
      _applyMascotToggleUI(DB.getFeature('enableMascot') !== false);
      mascotToggle.addEventListener('change', () => this._requireAdmin(async () => {
        await DB.setFeature('enableMascot', mascotToggle.checked || null);
        _applyMascotToggleUI(mascotToggle.checked);
        applyFeatureFlags();
        showToast(mascotToggle.checked ? 'Mascotte activée ✓' : 'Mascotte désactivée — boutons simples actifs');
      }));
    }

    if (mascotGrid) {
      const currentMascot = DB.getMascotId();
      mascotGrid.innerHTML = Object.entries(MASCOTS).map(([id, m]) => `
        <button class="st-mascot-btn${id === currentMascot ? ' st-mascot-active' : ''}" data-mascot-id="${id}" title="${m.label}">
          <svg class="st-mascot-preview" viewBox="${m.viewBox}" xmlns="http://www.w3.org/2000/svg">${m.svg}</svg>
          <span>${m.label}</span>
        </button>`).join('');
      if (DB.getFeature('enableMascot') === false) {
        mascotGrid.querySelectorAll('button').forEach(b => b.disabled = true);
      }
      mascotGrid.querySelectorAll('.st-mascot-btn').forEach(btn => {
        btn.addEventListener('click', () => this._requireAdmin(async () => {
          await DB.setMascotId(btn.dataset.mascotId);
          _applyMascot(btn.dataset.mascotId);
          mascotGrid.querySelectorAll('.st-mascot-btn').forEach(b => b.classList.toggle('st-mascot-active', b.dataset.mascotId === btn.dataset.mascotId));
          showToast('Mascotte mise à jour ✓');
        }));
      });
    }

    // ── Écrans publics ─────────────────────────────────────────────
    // Tous les locaux disponibles (toutes lieux confondus)
    const allLieux   = DB.getLieux();
    const allLocals  = Object.values(allLieux).flatMap(l => l.localIds);
    const screens    = DB.getScreens();
    const orgParam   = ORG_ID !== 'cpas-quaregnon' ? `?org=${ORG_ID}` : '';

    g('stScreenList').innerHTML = screens.length
      ? screens.map(s => {
          const localChecks = allLocals.map(lid => `
            <label class="st-screen-local-cb">
              <input type="checkbox" class="st-scr-local" data-screen="${s.id}" data-lid="${lid}"
                     ${s.localIds.includes(lid) ? 'checked' : ''}>
              ${escapeHtml(DB.getLocalLabel(lid))}
            </label>`).join('');
          const url = `public.html?screen=${s.id}${orgParam ? '&' + orgParam.slice(1) : ''}`;
          return `
            <div class="st-screen-card" data-screen-id="${s.id}">
              <div class="st-screen-row">
                <input class="st-local-input st-screen-name" type="text" data-screen-id="${s.id}"
                       value="${escapeHtml(s.name)}" placeholder="Nom de l'écran">
                <a class="st-screen-link" href="${url}" target="_blank" title="Ouvrir cet écran">🖥</a>
                <button class="st-local-save st-screen-save" data-screen-id="${s.id}" title="Renommer">✓</button>
                <button class="st-screen-del" data-screen-id="${s.id}" data-name="${escapeHtml(s.name)}" title="Supprimer">✕</button>
              </div>
              <div class="st-screen-locals">${localChecks}</div>
            </div>`;
        }).join('')
      : '<p class="st-empty">Aucun écran configuré. Créez-en un ci-dessous.</p>';

    // Sauvegarder le nom d'un écran
    g('settingsOverlay').querySelectorAll('.st-screen-save').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const id   = btn.dataset.screenId;
        const card = btn.closest('.st-screen-card');
        const name = card?.querySelector('.st-screen-name')?.value.trim();
        if (!name) return;
        btn.disabled = true;
        await DB.renameScreen(id, name);
        showToast('Écran renommé ✓');
        btn.disabled = false;
      }));
    });

    // Sauvegarder les locaux d'un écran quand une checkbox change
    g('settingsOverlay').querySelectorAll('.st-scr-local').forEach(cb => {
      cb.addEventListener('change', () => this._requireAdmin(async () => {
        const id   = cb.dataset.screen;
        const card = g('settingsOverlay').querySelector(`.st-screen-card[data-screen-id="${id}"]`);
        const localIds = {};
        card?.querySelectorAll('.st-scr-local:checked').forEach(c => {
          localIds[c.dataset.lid] = true;
        });
        await DB.setScreenLocals(id, Object.keys(localIds).length ? localIds : null);
        showToast('Écran mis à jour ✓');
      }));
    });

    // Supprimer un écran
    g('settingsOverlay').querySelectorAll('.st-screen-del').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        if (!confirm(`Supprimer l'écran "${btn.dataset.name}" ?`)) return;
        btn.disabled = true;
        await DB.removeScreen(btn.dataset.screenId);
        showToast('Écran supprimé ✓');
      }));
    });

    // ── Bureau d'accueil (local caché) ────────────────────────────
    if (isAdmin) {
      const deskSel  = g('stAccueilDeskSelect');
      const deskHint = g('stAccueilDeskHint');
      if (deskSel) {
        const currentDesk = DB.getAccueilDeskLocalId();
        // Remplir avec tous les locaux de tous les lieux (y compris cachés)
        const allLocals = Object.values(DB.getLieux()).flatMap(l => l.localIds);
        deskSel.innerHTML = '<option value="">— Aucun —</option>' +
          allLocals.map(id =>
            `<option value="${id}"${id === currentDesk ? ' selected' : ''}>${escapeHtml(DB.getLocalLabel(id))}</option>`
          ).join('');
        if (deskHint) deskHint.textContent = currentDesk
          ? `Actuel : ${DB.getLocalLabel(currentDesk)} (Local ${currentDesk})`
          : 'Aucun bureau d\'accueil défini.';
      }
      g('stAccueilDeskSave')?.addEventListener('click', () => this._requireAdmin(async () => {
        const val = parseInt(g('stAccueilDeskSelect')?.value) || null;
        await DB.setAccueilDeskLocalId(val);
        showToast(val ? `Bureau d'accueil défini : ${DB.getLocalLabel(val)} ✓` : 'Bureau d\'accueil retiré ✓');
      }));
    }

    // ── Rôles & Permissions ────────────────────────────────────────
    if (isAdmin) this._renderPermRoles();

    // ── Réinitialisation des mots de passe ─────────────────────────
    const pwdList = g('stAgentPasswordList');
    if (isAdmin && pwdList) {
      pwdList.innerHTML = agents.map(({key, name}) => `
        <div class="perm-agent-row">
          <span class="perm-agent-name">${escapeHtml(name)}</span>
          <button class="btn-sm btn-danger st-pwd-reset" data-key="${key}" data-name="${escapeHtml(name)}">
            Réinitialiser
          </button>
        </div>`).join('') || '<p class="st-empty">Aucun agent.</p>';
      pwdList.querySelectorAll('.st-pwd-reset').forEach(btn => {
        btn.addEventListener('click', () => this._requireAdmin(async () => {
          const name = btn.dataset.name;
          if (!confirm(`Réinitialiser le mot de passe de ${name} ? Ils devront en créer un nouveau à la prochaine connexion.`)) return;
          await DB.resetAgentPassword(btn.dataset.key);
          // Notif à l'admin (couche B.meta)
          const myKey = sessionStorage.getItem('cpas_current_agent_key');
          await DB.sendNotif(`Mot de passe réinitialisé pour ${name}.`, 'warn', myKey);
          showToast(`Mot de passe de ${name} réinitialisé ✓`);
        }));
      });
    }

    // ── Populate target du send-notif ──────────────────────────────
    const notifTarget = g('stNotifTarget');
    if (notifTarget) {
      notifTarget.innerHTML = '<option value="">— Tous les agents —</option>' +
        agents.map(a => `<option value="${a.key}">${escapeHtml(a.name)}</option>`).join('');
    }
  },

  _renderPermRoles() {
    const container = g('stPermRolesList');
    if (!container) return;
    const roles   = DB.getPermRoles();
    const agents  = DB.getAgentsWithKeys();
    const PERMS   = DB.PERM_KEYS;

    container.innerHTML = Object.entries(roles).map(([roleId, role]) => {
      const permChecks = PERMS.map(p => `
        <label class="perm-check-label">
          <input type="checkbox" class="perm-check" data-role="${roleId}" data-perm="${p.key}"
                 ${role.perms?.[p.key] ? 'checked' : ''}>
          <span>${p.label}</span>
        </label>`).join('');

      const agentOpts = agents.map(a => {
        const aRole = DB.getAgentPermRole(a.key);
        return `<option value="${a.key}" ${aRole === roleId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`;
      }).join('');

      return `
        <div class="perm-role-card" data-role-id="${roleId}">
          <div class="perm-role-hd">
            <span class="perm-role-dot" style="background:${escapeHtml(role.color || '#6b7280')}"></span>
            <input class="perm-role-name" type="text" data-role="${roleId}"
                   value="${escapeHtml(role.name)}" placeholder="Nom du rôle"
                   ${role.isBuiltin ? 'readonly' : ''}>
            <input type="color" class="perm-role-color" data-role="${roleId}"
                   value="${escapeHtml(role.color || '#6b7280')}"
                   ${role.isBuiltin ? 'disabled' : ''} title="Couleur">
            ${role.isBuiltin
              ? `<span class="perm-builtin-badge">intégré</span>`
              : `<button class="perm-role-save" data-role="${roleId}" title="Enregistrer">✓</button>
                 <button class="perm-role-del" data-role="${roleId}" data-name="${escapeHtml(role.name)}" title="Supprimer">✕</button>`
            }
          </div>
          <div class="perm-checks-grid">${permChecks}</div>
          <div class="perm-agents-row">
            <label class="perm-agents-label">Agents avec ce rôle :</label>
            <div class="perm-agents-list">
              ${agents.filter(a => DB.getAgentPermRole(a.key) === roleId).map(a =>
                `<span class="perm-agent-chip" style="border-color:${escapeHtml(role.color || '#6b7280')}">${escapeHtml(a.name)}</span>`
              ).join('') || '<span class="perm-no-agent">Aucun agent</span>'}
            </div>
          </div>
        </div>`;
    }).join('') || '<p class="st-empty">Aucun rôle défini.</p>';

    // Sauvegarder nom + couleur d'un rôle custom
    container.querySelectorAll('.perm-role-save').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        const roleId = btn.dataset.role;
        const card   = btn.closest('.perm-role-card');
        const name   = card?.querySelector('.perm-role-name')?.value.trim();
        const color  = card?.querySelector('.perm-role-color')?.value;
        if (!name) return;
        await DB.updatePermRole(roleId, { name, color });
        showToast('Rôle enregistré ✓');
        this._renderPermRoles();
      }));
    });

    // Mise à jour couleur en live (point coloré dans le header)
    container.querySelectorAll('.perm-role-color').forEach(inp => {
      inp.addEventListener('input', () => {
        const dot = inp.closest('.perm-role-hd')?.querySelector('.perm-role-dot');
        if (dot) dot.style.background = inp.value;
      });
    });

    // Supprimer un rôle custom
    container.querySelectorAll('.perm-role-del').forEach(btn => {
      btn.addEventListener('click', () => this._requireAdmin(async () => {
        if (!confirm(`Supprimer le rôle "${btn.dataset.name}" ? Les agents qui l'ont seront sans rôle.`)) return;
        btn.disabled = true;
        await DB.deletePermRole(btn.dataset.role);
        showToast('Rôle supprimé ✓');
        this._renderPermRoles();
      }));
    });

    // Toggle d'une permission
    container.querySelectorAll('.perm-check').forEach(cb => {
      cb.addEventListener('change', () => this._requireAdmin(async () => {
        const roleId = cb.dataset.role;
        const permKey = cb.dataset.perm;
        const role = DB.getPermRoles()[roleId];
        if (!role) return;
        const newPerms = { ...(role.perms || {}) };
        newPerms[permKey] = cb.checked;
        await DB.updatePermRole(roleId, { perms: newPerms });
        showToast('Permission mise à jour ✓');
      }));
    });

    // Render la section d'assignation des rôles aux agents
    const assignContainer = g('stPermAgentsList');
    if (!assignContainer) return;
    const rolesEntries = Object.entries(DB.getPermRoles());
    assignContainer.innerHTML = agents.map(({ key, name }) => {
      const currentRoleId = DB.getAgentPermRole(key) || '';
      return `
        <div class="perm-agent-row">
          <span class="perm-agent-name">${escapeHtml(name)}</span>
          <select class="perm-agent-role-sel" data-agent-key="${key}">
            <option value="">— Aucun rôle —</option>
            ${rolesEntries.map(([rid, r]) =>
              `<option value="${rid}" ${currentRoleId === rid ? 'selected' : ''}>${escapeHtml(r.name)}</option>`
            ).join('')}
          </select>
        </div>`;
    }).join('') || '<p class="st-empty">Aucun agent configuré.</p>';

    assignContainer.querySelectorAll('.perm-agent-role-sel').forEach(sel => {
      sel.addEventListener('change', () => this._requireAdmin(async () => {
        const key    = sel.dataset.agentKey;
        const roleId = sel.value || null;
        await DB.setAgentPermRole(key, roleId);
        showToast('Rôle assigné ✓');
        this._renderPermRoles(); // Rafraîchir les chips "Agents avec ce rôle"
      }));
    });

    // Ajouter un nouveau rôle custom
    const addBtn = g('stPermRoleAdd');
    if (addBtn) {
      addBtn.onclick = () => this._requireAdmin(async () => {
        const nameInput      = g('stPermRoleInput');
        const introTypeSel   = g('stPermRoleIntroType');
        const name           = nameInput?.value.trim();
        if (!name) return;
        addBtn.disabled = true;
        const introType = introTypeSel?.value || '__agent__';
        await DB.addPermRole(name, '#6b7280', introType);
        if (nameInput) nameInput.value = '';
        addBtn.disabled = false;
        showToast('Rôle créé ✓');
        this._renderPermRoles();
      });
    }
  },

  // ─── Régénérer les selects d'heure selon les horaires du lieu actif ──
  _refreshTimeOpts() {
    const { openHour, closeHour, slotMin } = DB.getLieuConfig();
    const saved = [g('fTimeStart').value, g('fTimeEnd').value];
    const timeOpts = [];
    for (let h = openHour; h <= closeHour; h++) {
      for (let m = 0; m < 60; m += slotMin) {
        if (h === closeHour && m > 0) break;
        const label = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        timeOpts.push(`<option value="${label}">${label}</option>`);
      }
    }
    g('fTimeStart').innerHTML = timeOpts.join('');
    g('fTimeEnd').innerHTML   = timeOpts.join('');
    // Restaurer la valeur si elle existe encore dans la liste
    if (saved[0]) g('fTimeStart').value = saved[0];
    if (saved[1]) g('fTimeEnd').value   = saved[1];
  },

  init() {
    // Peupler les selects d'heure — plage 0h-24h par défaut (sera rafraîchie par onConfigChange)
    const timeOpts = [];
    for (let h = 0; h <= 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (h === 24 && m > 0) break;
        const label = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        timeOpts.push(`<option value="${label}">${label}</option>`);
      }
    }
    g('fTimeStart').innerHTML = timeOpts.join('');
    g('fTimeEnd').innerHTML   = timeOpts.join('');

    // Locaux, agents et services : chargés dynamiquement via refreshSelects()
    // (appelé par DB.onConfigChange dans app.js au démarrage)

    // Champs conditionnels
    this._bindServiceBtns();
    g('fAgent').addEventListener('change', function() {
      cls('fAgentCustomWrap', this.value !== 'Autre');
    });
    g('fLocal').addEventListener('change', () => this._onLocalChange());
    g('fPermanent').addEventListener('change', function() {
      g('fDatesWrap').style.display = this.checked ? 'none' : '';
    });
    g('fRecType').addEventListener('change', function() {
      cls('fRecOptions', this.value === 'none');
      const units = { daily: 'jour(s)', weekly: 'semaine(s)', monthly: 'mois' };
      g('fIntervalUnit').textContent = units[this.value] || '';
      // Quotidienne : intervalle forcé à 1, non modifiable
      const intervalInput = g('fInterval');
      if (this.value === 'daily') {
        intervalInput.value = '1';
        intervalInput.disabled = true;
      } else {
        intervalInput.disabled = false;
      }
      // Mensuelle : interdire "pour toujours", forcer une date de fin
      const foreverOpt = g('fRecEnd').querySelector('option[value="forever"]');
      if (this.value === 'monthly') {
        if (foreverOpt) foreverOpt.disabled = true;
        g('fRecEnd').value = 'date';
        cls('fRecEndDateWrap', false);
      } else {
        if (foreverOpt) foreverOpt.disabled = false;
      }
    });
    g('fRecEnd').addEventListener('change', function() {
      cls('fRecEndDateWrap', this.value !== 'date');
    });

    // Mise à jour de l'indice de disponibilité quand les dates/récurrence changent
    ['fDateStart','fTimeStart','fDateEnd','fTimeEnd','fLocal','fRecType','fInterval','fRecEnd','fRecEndDate'].forEach(id => {
      g(id)?.addEventListener('change', () => this._updateHint());
    });

    // Boutons de fermeture génériques (data-close)
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => g(btn.dataset.close).classList.add('hidden'));
    });

    // Fermer sur clic sur l'overlay
    ['resOverlay','detOverlay','confOverlay','settingsOverlay','weekendWarnOverlay','presenceConfirmOverlay'].forEach(id => {
      g(id)?.addEventListener('click', e => { if (e.target.id === id) g(id).classList.add('hidden'); });
    });

    // Paramètres — ajouter agent (admin)
    g('stAgentAdd').addEventListener('click', () => this._requireAdmin(async () => {
      const name = g('stAgentInput').value.trim();
      if (!name) return;
      if (DB.getAgents().includes(name)) return alert('Cet agent existe déjà.');
      g('stAgentAdd').disabled = true;
      await DB.addAgent(name);
      g('stAgentInput').value = '';
      g('stAgentAdd').disabled = false;
      this.refreshSelects();
      showToast('Agent ajouté ✓');
    }));
    g('stAgentInput').addEventListener('keydown', e => { if (e.key === 'Enter') g('stAgentAdd').click(); });

    // Paramètres — import CSV agents (admin)
    g('stAgentImport').addEventListener('click', () => this._requireAdmin(() => {
      g('stAgentCsvFile').click();
    }));
    g('stAgentCsvFile').addEventListener('change', function () {
      const file = this.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const lines = evt.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const existing = new Set(DB.getAgents());
        let added = 0, skipped = 0;
        const btn = g('stAgentImport');
        btn.disabled = true; btn.textContent = 'Import en cours…';
        for (const line of lines) {
          const parts = line.split(';').map(p => p.trim());
          const privateName = parts[0];
          const publicName  = parts[1] || privateName;
          if (!privateName) { skipped++; continue; }
          if (existing.has(privateName)) { skipped++; continue; }
          existing.add(privateName);
          await DB.addAgent(privateName, publicName);
          added++;
        }
        btn.disabled = false; btn.textContent = '📋 Importer une liste (CSV)';
        this.value = ''; // reset file input
        showToast(`Import terminé : ${added} agent${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}${skipped ? `, ${skipped} ignoré${skipped > 1 ? 's' : ''}` : ''} ✓`);
      };
      reader.readAsText(file, 'UTF-8');
    });

    // Paramètres — ajouter service (admin)
    g('stSvcAdd').addEventListener('click', () => this._requireAdmin(async () => {
      const name = g('stSvcInput').value.trim();
      if (!name) return;
      if (DB.getServices().includes(name)) return alert('Ce service existe déjà.');
      g('stSvcAdd').disabled = true;
      await DB.addService(name);
      g('stSvcInput').value = '';
      g('stSvcAdd').disabled = false;
      this.refreshSelects();
      showToast('Service ajouté ✓');
    }));
    g('stSvcInput').addEventListener('keydown', e => { if (e.key === 'Enter') g('stSvcAdd').click(); });

    // Paramètres — ajouter lieu (admin)
    g('stLieuAdd').addEventListener('click', () => this._requireAdmin(async () => {
      const name = g('stLieuInput').value.trim();
      if (!name) return;
      g('stLieuAdd').disabled = true;
      await DB.addLieu(name);
      g('stLieuInput').value = '';
      g('stLieuAdd').disabled = false;
      this._renderSettingsList();
      showToast('Lieu ajouté ✓');
    }));
    g('stLieuInput').addEventListener('keydown', e => { if (e.key === 'Enter') g('stLieuAdd').click(); });

    // Paramètres — ajouter local au lieu courant (admin)
    g('stLocalAdd').addEventListener('click', () => this._requireAdmin(async () => {
      const label   = g('stLocalInput').value.trim();
      const lieuId  = DB.getCurrentLieuId();
      if (!lieuId) return alert('Aucun lieu actif.');
      g('stLocalAdd').disabled = true;
      await DB.addLocalToLieu(lieuId, label);
      g('stLocalInput').value = '';
      g('stLocalAdd').disabled = false;
      this._renderSettingsList();
      showToast('Local ajouté ✓');
    }));
    g('stLocalInput').addEventListener('keydown', e => { if (e.key === 'Enter') g('stLocalAdd').click(); });

    // Paramètres — ajouter un écran public (admin)
    g('stScreenAdd').addEventListener('click', () => this._requireAdmin(async () => {
      const name = g('stScreenInput').value.trim();
      if (!name) return;
      g('stScreenAdd').disabled = true;
      await DB.addScreen(name);
      g('stScreenInput').value = '';
      g('stScreenAdd').disabled = false;
      this._renderSettingsList();
      showToast('Écran ajouté ✓');
    }));
    g('stScreenInput').addEventListener('keydown', e => { if (e.key === 'Enter') g('stScreenAdd').click(); });

    // Bouton paramètres — ouvre directement (les sections admin/agent sont filtrées par permission)
    g('btnSettings').addEventListener('click', () => this.openSettings());

    // Test intro mascotte (superadmin)
    g('stTestIntroBtn')?.addEventListener('click', () => {
      const type = g('stTestIntroSelect')?.value;
      if (!type) return;
      localStorage.setItem('mc_welcome_test_intro', type);
      window.open('welcome.html', '_blank');
    });

    // Vider tous les locaux (fin de journée)
    g('btnClearAllLocals')?.addEventListener('click', () => this._requirePermission('editSettings', async () => {
      if (!confirm('Cela fermera tous les bureaux ouverts et retirera toutes les présences.\nContinuer ?')) return;
      await DB.clearAllLocals();
      showToast('Tous les locaux ont été vidés ✓');
    }));

    // Export JSON (admin)
    g('stExportJson').addEventListener('click', () => this._requireAdmin(async () => {
      const snap = await DB._db.ref('/').once('value');
      const data = snap.val();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `cpas-backup-${isoDate(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export JSON téléchargé ✓');
    }));

    // Export PDF (admin) — ouvre la vue semaine en mode impression
    g('stExportPdf').addEventListener('click', () => this._requireAdmin(() => {
      g('settingsOverlay').classList.add('hidden');
      window.print();
    }));


    // Envoyer une notification (admin — couche C)
    g('stNotifSend')?.addEventListener('click', () => this._requirePermission('sendNotif', async () => {
      const msg       = g('stNotifMessage')?.value.trim();
      const type      = g('stNotifType')?.value || 'info';
      const targetKey = g('stNotifTarget')?.value || null;
      const urgent    = g('stNotifUrgent')?.checked || false;
      if (!msg) return alert('Veuillez saisir un message.');
      if (urgent && !DB.hasPermission('sendUrgentNotif')) {
        return alert('Vous n\'avez pas la permission d\'envoyer des notifications urgentes.');
      }
      await DB.sendNotif(msg, type, targetKey, urgent ? { urgent: true } : {});
      if (g('stNotifMessage')) g('stNotifMessage').value = '';
      if (g('stNotifUrgent'))  g('stNotifUrgent').checked = false;
      showToast('Notification envoyée ✓');
    }));

    // Emoji picker
    EMOJI_PICKER.init();

    // Enregistrer
    g('resSave').addEventListener('click', () => this.save());

    // Détail → Supprimer / Modifier
    g('detDelete').addEventListener('click', () => this._confirmDelete());
    g('detEdit').addEventListener('click',   () => this._editFromDetail());

    // Confirmation suppression
    g('confConfirm').addEventListener('click', () => this._doDelete());
  },

  // ─── Ouvrir modal nouvelle réservation ─────────────────────────
  // ─── Initialiser le champ agents invités ──────────────────────
  _initInviteField(existingInvited) {
    const canInvite = DB.hasPermission('inviteAgents') && DB.getFeature('enableInviteAgents');
    cls('fInviteWrap', !canInvite);
    if (!canInvite) return;

    const chips  = g('fInviteChips');
    const sel    = g('fInviteSelect');

    // Charger les agents invités existants (mode édition)
    if (existingInvited) {
      Object.keys(existingInvited).forEach(key => {
        const agent = DB.getAgentsWithKeys().find(a => a.key === key);
        if (agent) this._addInviteChip(agent.key, agent.name);
      });
    }

    // Rafraîchir la liste du select (exclure déjà invités)
    this._refreshInviteSelect();

    // Listener select
    const newSel = sel.cloneNode(true);
    sel.parentNode.replaceChild(newSel, sel);
    newSel.addEventListener('change', () => {
      const key  = newSel.value;
      const name = newSel.options[newSel.selectedIndex]?.dataset?.name || key;
      if (!key) return;
      this._addInviteChip(key, name);
      this._refreshInviteSelect();
      newSel.value = '';
    });
  },

  _addInviteChip(key, name) {
    const chips = g('fInviteChips');
    if (!chips || chips.querySelector(`.invite-chip[data-key="${key}"]`)) return;
    const chip = document.createElement('span');
    chip.className = 'invite-chip';
    chip.dataset.key = key;
    const color = DB.getAgentRoleColor(name);
    chip.innerHTML = `<span class="invite-chip-dot" style="background:${color}"></span>${escapeHtml(name)}<button class="invite-chip-del" type="button">✕</button>`;
    chip.querySelector('.invite-chip-del').addEventListener('click', () => {
      chip.remove();
      this._refreshInviteSelect();
    });
    chips.appendChild(chip);
  },

  _refreshInviteSelect() {
    const sel   = g('fInviteSelect');
    if (!sel) return;
    const taken = [...g('fInviteChips').querySelectorAll('.invite-chip')].map(c => c.dataset.key);
    const curAgent = g('fAgent').value;
    sel.innerHTML = '<option value="">+ Ajouter un agent...</option>' +
      DB.getAgentsWithKeys()
        .filter(a => a.key && !taken.includes(a.key))
        .map(a => `<option value="${a.key}" data-name="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`)
        .join('');
  },

  openNew(opts = {}) {
    this._editId = null;
    this._reset();
    g('resTitle').textContent = 'Nouvelle réservation';
    this._initInviteField(null);

    if (opts.local) g('fLocal').value = opts.local;

    // Basculer UI back-office si un local est pré-sélectionné
    if (opts.local) this._onLocalChange();

    // Pré-sélectionner le desk si fourni
    if (opts.desk) {
      this._refreshDeskSelect();
      if (g('fDesk')) g('fDesk').value = opts.desk;
    }

    // Pré-remplir avec l'agent connecté (mode non back-office uniquement)
    const _connectedAgentName = document.getElementById('hsGreeting')?.dataset?.agentName || '';
    if (_connectedAgentName && g('fAgent') && !DB.isLocalBackoffice(parseInt(opts.local))) {
      const opt = [...g('fAgent').options].find(o => o.value === _connectedAgentName);
      if (opt) g('fAgent').value = _connectedAgentName;
    }

    const today = isoDate(new Date());
    g('fDateStart').value = opts.date || today;
    g('fDateEnd').value   = opts.date || today;

    if (opts.time) {
      g('fTimeStart').value = opts.time;
      const [h, m] = opts.time.split(':').map(Number);
      const closeH = DB.getLieuConfig().closeHour;
      const eh = (h + 1 < closeH) ? h + 1 : closeH - 1;
      g('fTimeEnd').value = `${String(eh).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }

    this._updateHint();
    g('resOverlay').classList.remove('hidden');
  },

  // ─── Ouvrir modal détail ────────────────────────────────────────
  openDetail(id, occDate) {
    this._editId  = id;
    this._occDate = occDate;
    const res = DB.getAll()[id];
    if (!res) return;

    const myKey      = sessionStorage.getItem('cpas_current_agent_key');
    const isConcerned = !res.secret || (myKey && (myKey === res.requesterAgentKey || myKey === res.targetAgentKey));
    const isSecret   = res.type === 'rendez-vous' && !!res.secret;
    const svc  = res.type === 'rendez-vous'
      ? (isSecret ? (isConcerned ? '📅 Rendez-vous 🔒' : '📅 Rendez-vous 🔒') : '📅 Rendez-vous')
      : DB.getSvcLabel(res);
    const agt  = res.agent   === 'Autre' ? res.agentCustom  : res.agent;
    const isRec = res.recurrence?.type && res.recurrence.type !== 'none';
    const recL  = { daily: 'Quotidienne', weekly: 'Hebdomadaire', monthly: 'Mensuelle' };

    let html = `
      <div class="det-row"><span class="det-l">Local</span>   <span class="det-v">${DB.getUnitLabel(parseInt(res.localId), res.deskId || null)}</span></div>
      <div class="det-row"><span class="det-l">Service</span> <span class="det-v">${svc}</span></div>
      <div class="det-row"><span class="det-l">Agent</span>   <span class="det-v">${fmtAgent(agt)}</span></div>
      ${res.agents && res.agents.length > 1
        ? `<div class="det-row"><span class="det-l">Participants</span><span class="det-v">${res.agents.map(a => escapeHtml(a)).join(', ')}</span></div>`
        : ''}`;

    if (res.isPermanent) {
      html += `<div class="det-row"><span class="det-l">Type</span>
        <span class="det-v"><span class="badge badge-perm">🔒 Réservation permanente</span></span></div>`;
    } else {
      const s = new Date(res.startDateTime);
      const e = new Date(res.endDateTime);
      html += `
        <div class="det-row"><span class="det-l">Début</span><span class="det-v">${fmtDT(s)}</span></div>
        <div class="det-row"><span class="det-l">Fin</span>  <span class="det-v">${fmtDT(e)}</span></div>`;
    }

    if (isRec) {
      html += `<div class="det-row"><span class="det-l">Récurrence</span>
        <span class="det-v"><span class="badge badge-rec">↻ ${recL[res.recurrence.type]}</span>
        — tous les ${res.recurrence.interval || 1}</span></div>
        <div class="det-row"><span class="det-l">Fin série</span>
        <span class="det-v">${res.recurrence.endDate || '♾ Pour toujours'}</span></div>`;
    }

    if (res.note) {
      if (isConcerned) {
        html += `<div class="det-row"><span class="det-l">Note</span><span class="det-v">${res.note}</span></div>`;
      } else {
        html += `<div class="det-row"><span class="det-l">Note</span><span class="det-v det-secret">🔒 Confidentiel</span></div>`;
      }
    } else if (res.comment) {
      html += `<div class="det-row"><span class="det-l">Note</span><span class="det-v">${res.comment}</span></div>`;
    }

    g('detBody').innerHTML = html;
    g('detOverlay').classList.remove('hidden');
  },

  // ─── Enregistrer (créer ou modifier) ───────────────────────────
  async save() {
    const localId  = parseInt(g('fLocal').value);
    const services = [...g('fServiceBtns').querySelectorAll('.fs-svc-btn.active')].map(b => b.dataset.svc);
    const service  = services[0] || '';   // compat backward
    const isBO     = localId && DB.isLocalBackoffice(localId);
    const isPerm   = g('fPermanent').checked;

    // Back-office : lire la liste multi-agents
    let boAgents = [];
    if (isBO) {
      boAgents = [...(g('fAgentsList')?.querySelectorAll('input[type="checkbox"]:checked') || [])]
        .map(cb => cb.value).filter(Boolean);
      if (!boAgents.length) return alert('Veuillez sélectionner au moins un participant.');
    }

    const agent    = isBO ? (boAgents[0] || '') : g('fAgent').value;

    if (!localId || !services.length || (!isBO && !agent))
      return alert('Veuillez remplir les champs obligatoires : Local, Service(s), Agent.');
    if (services.includes('Autre') && !g('fServiceCustom').value.trim())
      return alert('Veuillez préciser le service personnalisé.');
    if (!isBO && agent === 'Autre' && !g('fAgentCustom').value.trim())
      return alert("Veuillez préciser l'agent.");

    const deskId = DB.localHasDesks(localId) ? (g('fDesk')?.value || null) : null;
    if (DB.localHasDesks(localId) && !deskId) return alert('Veuillez sélectionner un desk.');

    let startDT = null, endDT = null;
    let exceptionDates = {}; // dates à exclure si l'utilisateur choisit "avec exceptions"

    if (!isPerm) {
      const ds = g('fDateStart').value, ts = g('fTimeStart').value;
      const de = g('fDateEnd').value,   te = g('fTimeEnd').value;
      if (!ds || !ts || !de || !te) return alert('Veuillez remplir les dates et heures.');
      startDT = `${ds}T${ts}`;
      endDT   = `${de}T${te}`;
      if (new Date(startDT) >= new Date(endDT)) return alert('La fin doit être après le début.');

      const recType2  = g('fRecType').value;
      const recEnd2   = g('fRecEnd').value === 'date' ? g('fRecEndDate').value : null;
      const interval2 = parseInt(g('fInterval').value) || 1;
      const isRec     = recType2 !== 'none';

      // Simuler toutes les occurrences de la série
      const tempRes = {
        localId, isPermanent: false,
        startDateTime: startDT, endDateTime: endDT,
        recurrence: { type: recType2, interval: interval2, endDate: recEnd2, seriesId: null }
      };
      const checkEnd = recEnd2
        ? new Date(recEnd2 + 'T23:59:59')
        : isRec
          ? advDate(new Date(startDT), recType2, 365)
          : new Date(endDT);

      const myOccs = expandReservation('__temp__', tempRes, new Date(startDT), checkEnd);

      // Vérifier les occurrences qui tombent un jour inactif (inutile pour quotidien : toujours le cas)
      if (isRec && recType2 !== 'daily') {
        const weekendDates = [];
        let wkCur = new Date(startDT);
        let wkGuard = 0;
        while (wkCur <= checkEnd && wkGuard++ < 700) {
          if (!DB.isDayActive(wkCur)) weekendDates.push(new Date(wkCur));
          wkCur = advDate(wkCur, recType2, interval2);
        }
        if (weekendDates.length) {
          const confirmed = await this._showWeekendWarning(weekendDates);
          if (!confirmed) return;
        }

        // Avertir si des occurrences tombent un jour férié belge
        const holidayOccs = [];
        let hCur = new Date(startDT);
        let hGuard = 0;
        while (hCur <= checkEnd && hGuard++ < 700) {
          const ds = isoDate(hCur);
          if (isBelgianHoliday(ds)) holidayOccs.push({ date: ds, name: getHolidayName(ds) });
          hCur = advDate(hCur, recType2, interval2);
        }
        if (holidayOccs.length) {
          const list = holidayOccs.slice(0, 5).map(h => `• ${h.date} — ${h.name}`).join('\n');
          const extra = holidayOccs.length > 5 ? `\n… et ${holidayOccs.length - 5} autre(s)` : '';
          const ok = confirm(`⚠️ Certaines occurrences tombent un jour férié belge :\n\n${list}${extra}\n\nCes dates seront quand même créées. Continuer ?`);
          if (!ok) return;
        }
      }

      // Trouver TOUS les conflits
      const conflicts = [];
      myOccs.forEach(occ => {
        const clash = DB.getInRange(occ._start, occ._end).filter(r =>
          DB.unitOccupies(r, localId, deskId) && r.id !== this._editId
          && (r.isPermanent || (r._start < occ._end && r._end > occ._start))
        );
        if (clash.length) conflicts.push({ occ, clash });
      });

      if (conflicts.length) {
        // Grouper par série source pour éviter de lister 700 occurrences
        const byId = {};
        conflicts.forEach(({ occ, clash }) => {
          clash.forEach(r => {
            if (!byId[r.id]) {
              const src = DB.getAll()[r.id];
              const srcIsRec = src?.recurrence?.type && src.recurrence.type !== 'none';
              byId[r.id] = { firstOcc: occ, count: 0, res: src, _isRec: srcIsRec, _isPerm: src?.isPermanent };
            }
            byId[r.id].count++;
          });
        });
        const groupedConflicts = Object.entries(byId).map(([id, { firstOcc, count, res, _isRec, _isPerm }]) => {
          const interval = parseInt(res?.recurrence?.interval) || 1;
          const recLbls  = {
            daily:   interval > 1 ? `tous les ${interval} jours`     : 'tous les jours',
            weekly:  interval > 1 ? `toutes les ${interval} semaines` : 'toutes les semaines',
            monthly: interval > 1 ? `tous les ${interval} mois`       : 'tous les mois',
          };
          return {
            occ: { ...firstOcc,
              _isRec, _isPerm,
              _recLabel: _isRec ? recLbls[res.recurrence.type] : null,
              _seriesCount: count
            },
            clash: [{ id, ...res }]
          };
        });

        const choice = await this._showConflictModal(groupedConflicts, localId, isRec);
        if (choice === 'cancel') return;
        if (choice === 'exceptions') {
          conflicts.forEach(c => { exceptionDates[c.occ._occDate] = true; });
        }
        if (choice === 'replace') {
          const toDelete = new Set();
          conflicts.forEach(c => c.clash.forEach(r => toDelete.add(r.id)));
          for (const id of toDelete) await DB.remove(id);
        }
      }

      // ── Vérifier les chevauchements de l'agent dans d'autres locaux ──
      const agentName = agent === 'Autre' ? g('fAgentCustom').value.trim() : agent;
      if (agentName) {
        let firstAgentClash = null;
        for (const occ of myOccs) {
          const clash = DB.getInRange(occ._start, occ._end).find(r =>
            !r.isPermanent &&
            parseInt(r.localId) !== localId &&
            r.id !== this._editId &&
            (r.agent === agentName || (r.agent === 'Autre' && r.agentCustom === agentName)) &&
            r._start < occ._end && r._end > occ._start
          );
          if (clash) { firstAgentClash = clash; break; }
        }
        if (firstAgentClash) {
          const clashLoc   = DB.getLocalLabel(parseInt(firstAgentClash.localId));
          const clashStart = firstAgentClash._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          const clashEnd   = firstAgentClash._end.toLocaleTimeString('fr-BE',   { hour: '2-digit', minute: '2-digit' });
          alert(`⚠️ Conflit d'agenda pour ${agentName} !\n\nDéjà réservé en "${clashLoc}" de ${clashStart} à ${clashEnd}.\n\nImpossible d'être dans deux locaux à la fois.`);
          return;
        }
      }
    } else {
      // Réservation permanente — vérifier les réservations existantes sur ce local
      const ds = g('fDateStart').value || isoDate(new Date());
      startDT = `${ds}T${String(DB.getLieuConfig().openHour).padStart(2,'0')}:00`;

      // Utiliser getInRange sur 5 ans pour avoir TOUTES les occurrences expandées
      const permStart = new Date(startDT);
      const permEnd   = new Date(permStart); permEnd.setFullYear(permEnd.getFullYear() + 5);
      const allOccs   = DB.getInRange(permStart, permEnd).filter(r =>
        DB.unitOccupies(r, localId, deskId) && r.id !== this._editId
      );

      if (allOccs.length) {
        // Grouper par série source (id) — 1 ligne par réservation/série, pas par occurrence
        const byId = {};
        allOccs.forEach(r => {
          if (!byId[r.id]) byId[r.id] = { res: DB.getAll()[r.id], firstOcc: r, count: 0 };
          byId[r.id].count++;
        });

        const conflictGroups = Object.entries(byId).map(([id, { res, firstOcc, count }]) => {
          const isRec = res?.recurrence?.type && res.recurrence.type !== 'none';
          // Construire une pseudo-occurrence descriptive
          const interval = parseInt(res.recurrence.interval) || 1;
          const recLabels = {
            daily:   interval > 1 ? `Tous les ${interval} jours`     : 'Tous les jours',
            weekly:  interval > 1 ? `Toutes les ${interval} semaines` : 'Toutes les semaines',
            monthly: interval > 1 ? `Tous les ${interval} mois`       : 'Tous les mois',
          };
          const label = isRec
            ? { _start: firstOcc._start, _end: firstOcc._end, _occDate: firstOcc._occDate,
                _isRec: true, _recLabel: recLabels[res.recurrence.type] || 'Récurrent',
                _interval: interval }
            : { _start: firstOcc._start, _end: firstOcc._end, _occDate: firstOcc._occDate,
                _isPerm: res?.isPermanent };
          return { occ: label, clash: [{ id, ...res }] };
        });

        const choice = await this._showConflictModal(conflictGroups, localId, false);
        if (choice === 'cancel') return;
        if (choice === 'replace') {
          const toDelete = new Set(allOccs.map(r => r.id));
          for (const id of toDelete) await DB.remove(id);
        }
      }
    }

    const recType = g('fRecType').value;

    // Agents invités (mode normal uniquement)
    const invitedAgents = {};
    if (!isBO) {
      g('fInviteChips')?.querySelectorAll('.invite-chip').forEach(chip => {
        if (chip.dataset.key) invitedAgents[chip.dataset.key] = true;
      });
    }

    const data = {
      localId,
      deskId: deskId || null,
      service,    services,   serviceCustom: g('fServiceCustom').value.trim(),
      agent,      agentCustom:   isBO ? '' : g('fAgentCustom').value.trim(),
      comment:    g('fComment').value.trim(),
      isPermanent: isPerm,
      startDateTime: startDT,
      endDateTime:   isPerm ? null : endDT,
      invitedAgents: Object.keys(invitedAgents).length ? invitedAgents : null,
      agents: isBO && boAgents.length > 1 ? boAgents : null,
      recurrence: {
        type:     isPerm ? 'none' : recType,
        interval: parseInt(g('fInterval').value) || 1,
        endDate:  g('fRecEnd').value === 'date' ? g('fRecEndDate').value : null,
        seriesId: this._editId ? (DB.getAll()[this._editId]?.recurrence?.seriesId || null) : null
      }
    };
    if (Object.keys(exceptionDates).length) data.exceptions = exceptionDates;

    try {
      if (this._editId) await DB.update(this._editId, data);
      else              await DB.add(data);
      g('resOverlay').classList.add('hidden');
      // Mascotte célèbre la réservation
      if (!this._editId) window.MascotBrain?.triggerCelebrate?.();
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
  },

  // ─── Modal d'avertissement occurrences week-end ────────────────
  _showWeekendWarning(weekendDates) {
    const MAX_SHOWN = 10;
    const shown = weekendDates.slice(0, MAX_SHOWN);
    g('weekendWarnList').innerHTML = shown.map(d =>
      `<li>${d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</li>`
    ).join('');
    const extra = weekendDates.length - MAX_SHOWN;
    const moreEl = g('weekendWarnMore');
    if (extra > 0) {
      moreEl.textContent = `... et ${extra} autre${extra > 1 ? 's' : ''} occurrence${extra > 1 ? 's' : ''} en week-end.`;
      moreEl.classList.remove('hidden');
    } else {
      moreEl.classList.add('hidden');
    }
    g('weekendWarnOverlay').classList.remove('hidden');
    return new Promise(resolve => {
      const done = confirmed => {
        g('weekendWarnOverlay').classList.add('hidden');
        g('weekendWarnCancel').removeEventListener('click', cancelH);
        g('weekendWarnConfirm').removeEventListener('click', confirmH);
        resolve(confirmed);
      };
      const cancelH  = () => done(false);
      const confirmH = () => done(true);
      g('weekendWarnCancel').addEventListener('click', cancelH);
      g('weekendWarnConfirm').addEventListener('click', confirmH);
    });
  },

  // ─── Modal de résolution de conflits ───────────────────────────
  _showConflictModal(conflicts, localId, isRec) {
    return new Promise(resolve => {
      const label = DB.getLocalLabel(localId);
      const n = conflicts.length;

      const isPerm = g('fPermanent').checked;
      g('conflictSummary').innerHTML = isPerm
        ? `⚠️ Réservation permanente sur <b>${label}</b> — ${n} réservation${n > 1 ? 's' : ''} existante${n > 1 ? 's' : ''} seront écrasées :`
        : `<b>${label}</b> est déjà réservé sur <b>${n} créneau${n > 1 ? 'x' : ''}</b> :`;

      g('conflictList').innerHTML = conflicts.map(({occ}) => {
        if (occ._isPerm) {
          return `<li>🔒 Réservation permanente (local bloqué définitivement)</li>`;
        }
        const dateStr = occ._start.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const tS = occ._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
        const tE = occ._end ? occ._end.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '';
        const timeStr = tE ? `${tS}–${tE}` : tS;
        if (occ._isRec) {
          const firstDate = occ._start.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
          return `<li>${timeStr} <em>(${occ._recLabel} à partir du ${firstDate})</em></li>`;
        }
        return `<li>${dateStr} · ${timeStr}</li>`;
      }).join('');

      // Masquer "exceptions" si pas récurrent OU si un conflit est une permanente
      const hasPerm = conflicts.some(({occ}) => occ._isPerm);
      cls('conflictBtnExceptions', !isRec || hasPerm);

      g('conflictOverlay').classList.remove('hidden');

      const done = choice => {
        g('conflictOverlay').classList.add('hidden');
        ['conflictBtnCancel','conflictBtnExceptions','conflictBtnReplace'].forEach(id => {
          const el = g(id);
          el.removeEventListener('click', el._conflictHandler);
        });
        resolve(choice);
      };

      [
        { id: 'conflictBtnCancel',     choice: 'cancel'     },
        { id: 'conflictBtnExceptions', choice: 'exceptions' },
        { id: 'conflictBtnReplace',    choice: 'replace'    },
      ].forEach(({ id, choice }) => {
        const el = g(id);
        el._conflictHandler = () => done(choice);
        el.addEventListener('click', el._conflictHandler);
      });
    });
  },

  // ─── Suppression ───────────────────────────────────────────────
  _confirmDelete() {
    const res   = DB.getAll()[this._editId];
    const isRec = res?.recurrence?.type && res.recurrence.type !== 'none';
    g('confText').textContent = isRec
      ? 'Cette réservation fait partie d\'une série récurrente.'
      : 'Confirmer la suppression de cette réservation ?';
    cls('confSeriesOpts', !isRec);
    if (isRec) g('confOverlay').querySelectorAll('input[name=delType]')[0].checked = true;
    g('confOverlay').classList.remove('hidden');
  },

  async _doDelete() {
    const res    = DB.getAll()[this._editId];
    const type   = document.querySelector('input[name=delType]:checked')?.value || 'single';
    const isRec  = res?.recurrence?.type && res.recurrence.type !== 'none';
    try {
      if (type === 'series' && res?.recurrence?.seriesId) {
        await DB.removeSeries(res.recurrence.seriesId);
      } else if (type === 'single' && isRec && this._occDate) {
        // Ajouter une exception pour cette date uniquement
        await DB.addException(this._editId, this._occDate);
      } else {
        await DB.remove(this._editId);
      }
      g('confOverlay').classList.add('hidden');
      g('detOverlay').classList.add('hidden');
    } catch (err) {
      alert('Erreur suppression : ' + err.message);
    }
  },

  _editFromDetail() {
    const res = DB.getAll()[this._editId];
    if (!res) return;
    g('detOverlay').classList.add('hidden');
    this._loadForm(this._editId, res);
  },

  // ─── Charger les données dans le formulaire (édition) ──────────
  _loadForm(id, res) {
    this._editId = id;
    this._reset();
    g('resTitle').textContent = 'Modifier la réservation';

    g('fLocal').value    = res.localId;
    this._refreshDeskSelect();
    if (res.deskId && g('fDesk')) g('fDesk').value = res.deskId;
    g('fComment').value  = res.comment || '';
    g('fPermanent').checked = res.isPermanent;

    // Mode back-office : afficher la liste multi-agents
    const _isBO = res.localId && DB.isLocalBackoffice(res.localId);
    if (_isBO) {
      cls('fAgentSingleWrap', true);
      cls('fAgentsListWrap',  false);
      cls('fInviteWrap',      true);
      const checkedNames = res.agents || (res.agent ? [res.agent] : []);
      this._populateBoAgents(checkedNames);
    } else {
      g('fAgent').value = res.agent;
    }

    // Pré-sélectionner les services (tableau ou valeur unique pour compat)
    const activeSvcs = res.services?.length ? res.services : (res.service ? [res.service] : []);
    g('fServiceBtns').querySelectorAll('.fs-svc-btn').forEach(btn => {
      btn.classList.toggle('active', activeSvcs.includes(btn.dataset.svc));
    });
    if (activeSvcs.includes('Autre')) { cls('fServiceCustomWrap', false); g('fServiceCustom').value = res.serviceCustom || ''; }
    if (res.agent === 'Autre') { cls('fAgentCustomWrap', false); g('fAgentCustom').value = res.agentCustom || ''; }

    if (res.isPermanent) {
      g('fDatesWrap').style.display = 'none';
    } else {
      if (res.startDateTime) {
        const [sd, st] = res.startDateTime.split('T');
        g('fDateStart').value = sd;
        g('fTimeStart').value = st?.slice(0, 5) || '';
      }
      if (res.endDateTime) {
        const [ed, et] = res.endDateTime.split('T');
        g('fDateEnd').value = ed;
        g('fTimeEnd').value = et?.slice(0, 5) || '';
      }
      const rec = res.recurrence;
      if (rec?.type && rec.type !== 'none') {
        g('fRecType').value = rec.type;
        cls('fRecOptions', false);
        g('fInterval').value = rec.interval || 1;
        const units = { daily: 'jour(s)', weekly: 'semaine(s)', monthly: 'mois' };
        g('fIntervalUnit').textContent = units[rec.type] || '';
        // Quotidienne : intervalle forcé à 1
        if (rec.type === 'daily') g('fInterval').disabled = true;
        else g('fInterval').disabled = false;
        // Mensuelle : forcer une date de fin (désactiver "pour toujours")
        if (rec.type === 'monthly') {
          const foreverOpt = g('fRecEnd').querySelector('option[value="forever"]');
          if (foreverOpt) foreverOpt.disabled = true;
          g('fRecEnd').value = 'date';
          cls('fRecEndDateWrap', false);
          if (rec.endDate) g('fRecEndDate').value = rec.endDate;
        } else if (rec.endDate) {
          g('fRecEnd').value = 'date';
          cls('fRecEndDateWrap', false);
          g('fRecEndDate').value = rec.endDate;
        }
      }
    }
    this._initInviteField(res.invitedAgents || null);
    g('resOverlay').classList.remove('hidden');
    this._updateHint();
  },

  // ─── Helpers ───────────────────────────────────────────────────
  _reset() {
    ['fLocal','fAgent','fServiceCustom','fAgentCustom','fComment',
     'fDateStart','fTimeStart','fDateEnd','fTimeEnd','fRecEndDate'].forEach(id => {
      const e = g(id); if (e) e.value = '';
    });
    // Désélectionner tous les boutons service
    g('fServiceBtns').querySelectorAll('.fs-svc-btn').forEach(b => b.classList.remove('active'));
    g('fPermanent').checked = false;
    g('fDatesWrap').style.display = '';
    g('fRecType').value  = 'none';
    g('fRecEnd').value   = 'forever';
    g('fInterval').value = '1';
    g('fInterval').disabled = false;
    cls('fServiceCustomWrap', true);
    cls('fAgentCustomWrap',   true);
    cls('fRecOptions',        true);
    cls('fRecEndDateWrap',    true);
    g('localHint').textContent = '';
    // Vider les chips d'invitation
    if (g('fInviteChips')) g('fInviteChips').innerHTML = '';
    if (g('fInviteSelect')) g('fInviteSelect').value = '';
    // Rétablir l'état normal (local non back-office)
    cls('fAgentSingleWrap', false);
    cls('fAgentsListWrap',  true);
    if (g('fAgentsList')) g('fAgentsList').innerHTML = '';
    // Réinitialiser le desk
    if (g('fDesk'))     g('fDesk').value = '';
    if (g('fDeskWrap')) g('fDeskWrap').style.display = 'none';
  },

  // Basculer entre mode agent unique et liste multi-agents selon le local
  _onLocalChange() {
    const localId = parseInt(g('fLocal').value);
    const isBO = localId && DB.isLocalBackoffice(localId);
    cls('fAgentSingleWrap', isBO);   // hidden si backoffice
    cls('fAgentsListWrap',  !isBO);  // hidden si normal
    cls('fInviteWrap',      isBO);   // cacher les invités en backoffice
    if (isBO) this._populateBoAgents();
    this._refreshDeskSelect();
  },

  // Remplir la liste de chips d'agents pour un local back-office
  _populateBoAgents(checkedNames = []) {
    const container = g('fAgentsList');
    if (!container) return;
    const connectedName = document.getElementById('hsGreeting')?.dataset?.agentName || '';
    const agents = (DB.getAgents() || []).filter(n => n !== 'Autre');
    container.innerHTML = agents.map(name => {
      const isMe = name === connectedName;
      const checked = isMe || checkedNames.includes(name);
      const color = DB.getAgentRoleColor?.(name) || '#1e3a5f';
      return `<label class="bo-agent-chip${checked ? ' checked' : ''}" data-name="${escapeHtml(name)}">
        <input type="checkbox" name="boAgent" value="${escapeHtml(name)}"${checked ? ' checked' : ''}>
        <span class="bo-chip-dot" style="background:${color}"></span>
        ${escapeHtml(name)}${isMe ? ' (moi)' : ''}
      </label>`;
    }).join('');
    // Toggle classe checked au clic
    container.querySelectorAll('.bo-agent-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const cb = chip.querySelector('input[type="checkbox"]');
        cb.checked = !cb.checked;
        chip.classList.toggle('checked', cb.checked);
      });
    });
  },

  // Attache les handlers click sur les boutons service (appelé après chaque re-render)
  _bindServiceBtns() {
    g('fServiceBtns').querySelectorAll('.fs-svc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        const hasAutre = [...g('fServiceBtns').querySelectorAll('.fs-svc-btn.active')]
          .some(b => b.dataset.svc === 'Autre');
        cls('fServiceCustomWrap', !hasAutre);
        if (!hasAutre) g('fServiceCustom').value = '';
      });
    });
  },

  _updateHint() {
    const ds      = g('fDateStart').value;
    const ts      = g('fTimeStart').value;
    const de      = g('fDateEnd').value;
    const te      = g('fTimeEnd').value;
    const localId = parseInt(g('fLocal').value);
    const deskId  = DB.localHasDesks(localId) ? (g('fDesk')?.value || null) : null;
    const hint    = g('localHint');

    if (!ds || !ts || !de || !te) { hint.innerHTML = ''; hint.className = 'hint'; return; }

    const s = new Date(`${ds}T${ts}`);
    const e = new Date(`${de}T${te}`);
    if (s >= e) { hint.innerHTML = ''; hint.className = 'hint'; return; }

    const recType2  = g('fRecType').value;
    const recEnd2   = g('fRecEnd').value === 'date' ? g('fRecEndDate').value : null;
    const interval2 = parseInt(g('fInterval').value) || 1;
    const isRec     = recType2 !== 'none';

    // Simuler toutes les occurrences pour trouver les conflits
    const tempRes = {
      localId: localId || 0, isPermanent: false,
      startDateTime: `${ds}T${ts}`, endDateTime: `${de}T${te}`,
      recurrence: { type: recType2, interval: interval2, endDate: recEnd2, seriesId: null }
    };
    const checkEnd = recEnd2
      ? new Date(recEnd2 + 'T23:59:59')
      : isRec
        ? advDate(s, recType2, 365)
        : e;
    const myOccs = expandReservation('__hint__', tempRes, s, checkEnd);

    const allUnits = DB.getDisplayUnits();

    // Unités libres sur la 1ère occurrence (pour la liste "libres")
    const takenFirst = new Set(
      DB.getInRange(s, e).filter(r => r.id !== this._editId)
        .map(r => r.deskId || String(r.localId))
    );
    const freeUnits = allUnits.filter(u => !takenFirst.has(u.deskId || String(u.localId)));

    // Compter les conflits si une unité est sélectionnée
    if (localId) {
      const conflictOccs = myOccs.filter(occ =>
        DB.getInRange(occ._start, occ._end).some(r =>
          DB.unitOccupies(r, localId, deskId) && r.id !== this._editId
          && (r.isPermanent || (r._start < occ._end && r._end > occ._start))
        )
      );
      if (conflictOccs.length) {
        const label = DB.getUnitLabel(localId, deskId);
        const freeList = freeUnits.length
          ? '<ul class="hint-list">' + freeUnits.map(u => `<li>${escapeHtml(u.fullLabel)}</li>`).join('') + '</ul>'
          : '<em>Aucune unité disponible</em>';

        // Vérifier si le conflit est dû à une réservation permanente
        const permConflict = DB.getInRange(conflictOccs[0]._start, conflictOccs[0]._end).find(r =>
          DB.unitOccupies(r, localId, deskId) && r.id !== this._editId && r.isPermanent
        );

        let suffix;
        if (permConflict) {
          suffix = ` est <b>bloqué définitivement</b> par une réservation permanente`;
        } else if (!isRec || conflictOccs.length === 1) {
          const dateStr = conflictOccs[0]._start.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' });
          suffix = ` le <b>${dateStr}</b>`;
        } else {
          const firstDate = conflictOccs[0]._start.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' });
          const recLbls = {
            daily:   interval2 > 1 ? `tous les ${interval2} jours`     : 'tous les jours',
            weekly:  interval2 > 1 ? `toutes les ${interval2} semaines` : 'toutes les semaines',
            monthly: interval2 > 1 ? `tous les ${interval2} mois`       : 'tous les mois',
          };
          suffix = ` à partir du <b>${firstDate}</b> (${recLbls[recType2] || 'récurrent'} · ${conflictOccs.length} occurrence${conflictOccs.length > 1 ? 's' : ''})`;
        }

        const freeTitle = permConflict ? 'Unités libres :' : 'Unités libres (1ère date conflictuelle) :';
        hint.innerHTML = `⚠️ <b>${escapeHtml(label)}</b>${permConflict ? '' : ' est déjà réservé'}${suffix}.<br>${freeTitle}${freeList}`;
        hint.className = 'hint hint-warn';
        return;
      }
    }

    if (!freeUnits.length) {
      hint.innerHTML = '❌ Aucune unité disponible sur cette plage.';
      hint.className = 'hint hint-err';
      return;
    }

    const freeList = '<ul class="hint-list">' + freeUnits.map(u => `<li>${escapeHtml(u.fullLabel)}</li>`).join('') + '</ul>';
    hint.innerHTML = '✅ Unités libres sur cette plage :' + freeList;
    hint.className = 'hint hint-ok';
  }
};

// ───────────────────────────────────────────────────────────────────
// Mini-helpers
// ───────────────────────────────────────────────────────────────────

function g(id) { return document.getElementById(id); }
function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showToast(msg = 'Modification enregistrée') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-in'));
  setTimeout(() => {
    t.classList.remove('toast-in');
    t.addEventListener('transitionend', () => t.remove());
  }, 2200);
}

// ── Modal confirmation ouverture/fermeture bureau ────────────────
function showBureauConfirm({ icon, title, info, okLabel, okClass, onOk, ok2Label, ok2Class, onOk2 }) {
  const overlay = g('bureauConfirmOverlay');
  g('bureauConfirmIcon').textContent  = icon;
  g('bureauConfirmTitle').textContent = title;
  g('bureauConfirmInfo').innerHTML    = info || '';
  const okBtn  = g('bureauConfirmOk');
  const ok2Btn = g('bureauConfirmOk2');
  if (okLabel) {
    okBtn.textContent = okLabel;
    okBtn.className   = `lv-bureau-modal-ok${okClass ? ' ' + okClass : ''}`;
    okBtn.style.display = '';
  } else {
    okBtn.style.display = 'none';
  }
  if (ok2Label) {
    ok2Btn.textContent = ok2Label;
    ok2Btn.className   = `lv-bureau-modal-ok lv-bureau-modal-ok2${ok2Class ? ' ' + ok2Class : ''}`;
    ok2Btn.classList.remove('hidden');
  } else {
    ok2Btn.classList.add('hidden');
  }
  overlay.classList.remove('hidden');

  const close = () => overlay.classList.add('hidden');
  okBtn.onclick  = () => { close(); if (onOk)  onOk(); };
  ok2Btn.onclick = () => { close(); if (onOk2) onOk2(); };
  g('bureauConfirmCancel').onclick = close;
  overlay.onclick = e => { if (e.target === overlay) close(); };
}

let _upcomingTimer = null;
function showUpcomingAlert(bureauLabel, agentName, service, minutesLeft) {
  const banner = document.getElementById('upcomingBanner');
  if (!banner) return;
  banner.querySelector('.lv-upcoming-bureau').textContent  = bureauLabel;
  banner.querySelector('.lv-upcoming-agent').textContent   = agentName || '';
  banner.querySelector('.lv-upcoming-service').textContent = service || '';
  banner.querySelector('.lv-upcoming-min').textContent     = `dans ${minutesLeft} min`;
  banner.classList.remove('hidden');
  if (_upcomingTimer) clearTimeout(_upcomingTimer);
  _upcomingTimer = setTimeout(() => banner.classList.add('hidden'), 10000);
  banner.onclick = () => { banner.classList.add('hidden'); clearTimeout(_upcomingTimer); };
}

let _routingTimer = null;
function showRoutingToast(bureauLabel, ticketNum) {
  const banner   = document.getElementById('routingBanner');
  const bureauEl = document.getElementById('routingBureau');
  const ticketEl = document.getElementById('routingTicket');
  if (!banner || !bureauEl) return;
  bureauEl.textContent = bureauLabel;
  if (ticketEl) {
    ticketEl.textContent = ticketNum || '';
    ticketEl.classList.toggle('hidden', !ticketNum);
  }
  banner.classList.remove('hidden');
  if (_routingTimer) clearTimeout(_routingTimer);
  _routingTimer = setTimeout(() => banner.classList.add('hidden'), 6000);
  banner.onclick = () => { banner.classList.add('hidden'); clearTimeout(_routingTimer); };
}

let _waitBannerTimer = null;
function showWaitBanner(queueCount, ticketNum, benefName) {
  const banner   = document.getElementById('waitBanner');
  const sub      = document.getElementById('waitBannerSub');
  const ticketEl = document.getElementById('waitTicket');
  if (!banner) return;
  const wbCfg = (typeof DB !== 'undefined') ? DB.getTicketDisplay('waitBanner') : { showNum: true, showName: false };
  if (ticketEl) {
    const parts = [];
    if (wbCfg.showNum  && ticketNum)  parts.push(`Ticket ${ticketNum}`);
    if (wbCfg.showName && benefName)  parts.push(benefName);
    ticketEl.textContent = parts.join(' — ');
    ticketEl.classList.toggle('hidden', !parts.length);
  }
  sub.textContent = queueCount > 0
    ? `${queueCount} personne${queueCount > 1 ? 's' : ''} en attente`
    : '';
  banner.classList.remove('hidden');
  if (_waitBannerTimer) clearTimeout(_waitBannerTimer);
  _waitBannerTimer = setTimeout(() => banner.classList.add('hidden'), 7000);
  banner.onclick = () => { banner.classList.add('hidden'); clearTimeout(_waitBannerTimer); };
}

let _agentCallTimer = null;
function showAgentCallNotif(ticketLabel, benefName) {
  const banner    = document.getElementById('agentCallBanner');
  const nameEl    = document.getElementById('agentCallName');
  const ticketEl  = document.getElementById('agentCallTicket');
  if (!banner) return;
  const anCfg = (typeof DB !== 'undefined') ? DB.getTicketDisplay('agentNotif') : { showNum: true, showName: true };
  if (nameEl)   { nameEl.textContent   = (anCfg.showName && benefName)  ? benefName  : ''; nameEl.classList.toggle('hidden', !anCfg.showName || !benefName); }
  if (ticketEl) { ticketEl.textContent = (anCfg.showNum  && ticketLabel) ? `n°${ticketLabel}` : ''; ticketEl.classList.toggle('hidden', !anCfg.showNum || !ticketLabel); }
  banner.classList.remove('hidden');
  if (_agentCallTimer) clearTimeout(_agentCallTimer);
  _agentCallTimer = setTimeout(() => banner.classList.add('hidden'), 7000);
  banner.onclick = () => { banner.classList.add('hidden'); clearTimeout(_agentCallTimer); };
}

// cls(id, hidden) — cache ou affiche via la classe CSS 'hidden'
function cls(id, hidden) {
  const e = g(id);
  if (e) e.classList.toggle('hidden', hidden);
}

// ═══════════════════════════════════════════════════════════════
// Gestion des absences
// ═══════════════════════════════════════════════════════════════

const ABSENCE_MOTIFS = {
  maladie:   { label: '🤒 Maladie' },
  conge:     { label: '🏖️ Congé' },
  mission:   { label: '🚗 Mission extérieure' },
  formation: { label: '📚 Formation' },
  autre:     { label: '📝 Autre' },
};

function fmtAbsenceDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ── Modal déclaration ────────────────────────────────────────────
let _absenceModalForKey = null; // agentKey ciblé (null = agent courant)

function openAbsenceModal(targetAgentKey, targetAgentName) {
  const agentKey = targetAgentKey || sessionStorage.getItem('cpas_current_agent_key');
  _absenceModalForKey = agentKey;

  const isAdmin = DB.hasPermission('editSettings');
  const agentWrap = g('absAgentWrap');
  if (agentWrap) agentWrap.classList.toggle('hidden', !isAdmin || !!targetAgentKey);

  if (isAdmin && !targetAgentKey) {
    // Peupler le select agents
    const sel = g('absAgentSelect');
    if (sel) {
      sel.innerHTML = DB.getAgentsWithKeys()
        .map(a => `<option value="${a.key}">${_esc(a.name)}</option>`).join('');
    }
  }

  g('absenceModalTitle').textContent = targetAgentName
    ? `Absence de ${targetAgentName}`
    : 'Déclarer une absence';

  // Dates par défaut : aujourd'hui
  const today = new Date().toISOString().slice(0, 10);
  g('absStartDate').value = today;
  g('absEndDate').value   = today;
  g('absMotif').value     = 'maladie';
  g('absComment').value   = '';
  g('absErr').classList.add('hidden');

  g('absenceModal').classList.remove('hidden');
  g('absStartDate').focus();
}

function closeAbsenceModal() {
  g('absenceModal').classList.add('hidden');
  _absenceModalForKey = null;
}

function _initAbsenceModal() {
  g('absenceModalClose')?.addEventListener('click', closeAbsenceModal);
  g('absenceModal')?.addEventListener('click', e => { if (e.target === g('absenceModal')) closeAbsenceModal(); });

  g('absSubmit')?.addEventListener('click', async () => {
    const isAdmin  = DB.hasPermission('editSettings');
    const agentKey = isAdmin && !_absenceModalForKey
      ? g('absAgentSelect')?.value
      : _absenceModalForKey || sessionStorage.getItem('cpas_current_agent_key');

    const start   = g('absStartDate').value;
    const end     = g('absEndDate').value;
    const motif   = g('absMotif').value;
    const comment = g('absComment').value.trim();
    const errEl   = g('absErr');

    if (!start || !end || start > end) {
      errEl.textContent = 'La date de fin doit être égale ou après la date de début.';
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');

    const btn = g('absSubmit');
    btn.disabled = true; btn.textContent = 'Enregistrement…';

    await DB.addAbsence({
      agentKey, startDate: start, endDate: end, motif,
      comment: comment || null,
      createdBy: sessionStorage.getItem('cpas_current_agent_key'),
    });

    btn.disabled = false; btn.textContent = "Enregistrer l'absence";
    closeAbsenceModal();
    showToast('Absence enregistrée ✓');
    // Rafraîchir la liste admin si ouverte
    if (!g('absencesListModal').classList.contains('hidden')) _renderAbsencesList();
  });
}

// ── Panel admin : liste des absences ─────────────────────────────
function openAbsencesList() {
  _renderAbsencesList();
  g('absencesListModal').classList.remove('hidden');
}

function _renderAbsencesList() {
  const container = g('absencesList');
  if (!container) return;

  const today     = new Date().toISOString().slice(0, 10);
  const agents    = DB.getAgentsWithKeys();
  const absences  = DB.getAbsences();

  // Trier : d'abord courantes (startDate <= today <= endDate), puis futures, puis passées
  const entries = Object.entries(absences)
    .map(([id, a]) => ({ id, ...a }))
    .sort((a, b) => {
      const aActive  = a.startDate <= today && a.endDate >= today;
      const bActive  = b.startDate <= today && b.endDate >= today;
      const aFuture  = a.startDate > today;
      const bFuture  = b.startDate > today;
      const aScore   = aActive ? 0 : aFuture ? 1 : 2;
      const bScore   = bActive ? 0 : bFuture ? 1 : 2;
      if (aScore !== bScore) return aScore - bScore;
      return a.startDate.localeCompare(b.startDate);
    });

  // Garder seulement les absences en cours et futures (+ 30 derniers jours)
  const limit = new Date(); limit.setDate(limit.getDate() - 30);
  const limitStr = limit.toISOString().slice(0, 10);
  const visible = entries.filter(a => a.endDate >= limitStr);

  if (!visible.length) {
    container.innerHTML = '<div class="abs-empty">Aucune absence enregistrée.</div>';
    return;
  }

  container.innerHTML = visible.map(a => {
    const agentObj  = agents.find(ag => ag.key === a.agentKey);
    const agentName = agentObj?.name || a.agentKey;
    const color     = DB.getAgentRoleColor(agentName);
    const motifInfo = ABSENCE_MOTIFS[a.motif] || ABSENCE_MOTIFS.autre;
    const isActive  = a.startDate <= today && a.endDate >= today;
    const isFuture  = a.startDate > today;
    const statusCls = isActive ? 'abs-item-active' : isFuture ? 'abs-item-future' : 'abs-item-past';
    const sameDay   = a.startDate === a.endDate;
    const datesStr  = sameDay
      ? fmtAbsenceDate(a.startDate)
      : `${fmtAbsenceDate(a.startDate)} → ${fmtAbsenceDate(a.endDate)}`;

    return `<div class="abs-item ${statusCls}" data-id="${a.id}">
      <div class="abs-item-left">
        <span class="abs-item-agent" style="${color ? `color:${color}` : ''}">${_esc(agentName)}</span>
        <span class="abs-item-motif">${motifInfo.label}</span>
        ${a.comment ? `<span class="abs-item-comment">${_esc(a.comment)}</span>` : ''}
      </div>
      <div class="abs-item-right">
        <span class="abs-item-dates">${datesStr}</span>
        <button class="abs-item-del" data-id="${a.id}" title="Supprimer">✕</button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.abs-item-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette absence ?')) return;
      await DB.deleteAbsence(btn.dataset.id);
      _renderAbsencesList();
      showToast('Absence supprimée.');
    });
  });
}

function _initAbsencesList() {
  g('absencesListClose')?.addEventListener('click', () => g('absencesListModal').classList.add('hidden'));
  g('absencesListModal')?.addEventListener('click', e => {
    if (e.target === g('absencesListModal')) g('absencesListModal').classList.add('hidden');
  });
  g('absAddNew')?.addEventListener('click', () => {
    g('absencesListModal').classList.add('hidden');
    openAbsenceModal(null, null);
  });
}

// ═══════════════════════════════════════════════════════════════
// Requêtes (technique, entretien, autre)
// ═══════════════════════════════════════════════════════════════

const TECH_ISSUE_TYPES = {
  technique: { label: '🔧 Problème technique', role: '__technicien__' },
  entretien: { label: '🧹 Entretien / Nettoyage', role: '__entretien__' },
  autre:     { label: '📋 Requête',              role: '' },
};

let _tiCurrentType = 'technique'; // type actif

function openTechIssueModal() {
  const modal = g('techIssueModal');
  if (!modal) return;

  _tiCurrentType = 'technique';
  _tiRefreshTargets();

  // Réinitialiser les champs
  if (g('techIssueDesc'))   g('techIssueDesc').value  = '';
  if (g('techIssueLocal'))  g('techIssueLocal').value = '';
  if (g('techIssueUrgent')) g('techIssueUrgent').checked = false;

  // Auto-remplir le bureau depuis la session
  const myKey  = sessionStorage.getItem('cpas_current_agent_key');
  const bureau = myKey ? _getMyCurrentBureau(myKey) : null;
  if (bureau && g('techIssueLocal')) g('techIssueLocal').value = bureau;

  // Boutons de type
  g('techIssueTypes')?.querySelectorAll('.ti-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === _tiCurrentType);
    btn.onclick = () => {
      _tiCurrentType = btn.dataset.type;
      g('techIssueTypes').querySelectorAll('.ti-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _tiRefreshTargets();
    };
  });

  modal.classList.remove('hidden');
}

function _getMyCurrentBureau(agentKey) {
  // Cherche si l'agent est dans un bureau ouvert
  const lieux = DB.getLieux?.() || {};
  const appState = DB.getAppState?.() || {};
  for (const [lieuId, lieu] of Object.entries(lieux)) {
    const bureaux = appState?.bureaux || {};
    for (const [localId, info] of Object.entries(bureaux)) {
      if (info?.agentKey === agentKey) {
        return DB.getLocalLabel(localId) || `Bureau ${localId}`;
      }
    }
  }
  return null;
}

function _tiRefreshTargets() {
  const container = g('techIssueTargets');
  const noTech    = g('techIssueNoTech');
  if (!container) return;

  const typeConf    = TECH_ISSUE_TYPES[_tiCurrentType] || TECH_ISSUE_TYPES.autre;
  const defaultRole = typeConf.role; // rôle pré-coché selon le type

  const allRoles       = DB.getPermRoles();       // { roleId: { name, color, ... } }
  const agentsWithKeys = DB.getAgentsWithKeys();

  // Comptage agents par rôle
  const roleCount = {};
  agentsWithKeys.forEach(({ key }) => {
    const r = DB.getAgentPermRole(key) || '__agent__';
    roleCount[r] = (roleCount[r] || 0) + 1;
  });

  // Rôles qui ont au moins 1 agent, triés par nom
  const rolesWithAgents = Object.entries(allRoles)
    .filter(([id]) => (roleCount[id] || 0) > 0)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name));

  container.innerHTML = '';

  if (!rolesWithAgents.length) {
    if (noTech) noTech.classList.remove('hidden');
    return;
  }

  rolesWithAgents.forEach(([id, role]) => {
    const count   = roleCount[id] || 0;
    const checked = id === defaultRole;
    const dot     = role.color ? `<span style="width:.6rem;height:.6rem;border-radius:50%;background:${role.color};flex-shrink:0;display:inline-block"></span>` : '';
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:.55rem;cursor:pointer;font-size:.88rem;color:#e2e8f0;padding:.3rem .4rem;border-radius:6px;transition:background .12s';
    row.innerHTML = `<input type="checkbox" class="ti-role-cb" data-role="${id}" ${checked ? 'checked' : ''} style="accent-color:#6366f1;flex-shrink:0"> ${dot} ${escapeHtml(role.name)} <span style="color:#64748b;font-size:.8rem;margin-left:auto">${count} agent${count > 1 ? 's' : ''}</span>`;
    container.appendChild(row);
  });

  if (noTech) noTech.classList.add('hidden');
}

function _initTechIssueModal() {
  const modal = g('techIssueModal');
  if (!modal) return;

  const closeModal = () => modal.classList.add('hidden');
  g('techIssueClose')?.addEventListener('click', closeModal);
  g('techIssueCancelBtn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // ── Autocomplete bureau ──────────────────────────────────────
  const localInput   = g('techIssueLocal');
  const localSuggest = g('techIssueLocalSuggest');
  let _localHighlight = -1;

  function _getLocalOptions() {
    // Construit une liste d'entrées { value, internal, pub } pour chaque local
    const allLieux = DB.getLieux?.() || {};
    const seen = new Set();
    const entries = [];
    Object.values(allLieux).forEach(lieu => {
      (lieu.localIds || []).forEach(id => {
        if (seen.has(id)) return;
        seen.add(id);
        const internal = DB.getLocalLabel(id);
        const pub      = DB.getPublicLocalLabel(id);
        if (internal) entries.push({ value: internal, internal, pub: pub !== internal ? pub : null });
      });
    });
    return entries.sort((a, b) => a.internal.localeCompare(b.internal));
  }

  function _renderSuggestions(query) {
    if (!localSuggest) return;
    const q = query.toLowerCase().trim();
    const opts = _getLocalOptions();
    const matches = q
      ? opts.filter(e => e.internal.toLowerCase().includes(q) || (e.pub && e.pub.toLowerCase().includes(q)))
      : opts;
    _localHighlight = -1;
    if (!matches.length) {
      localSuggest.innerHTML = `<div class="ti-local-suggest-empty">Aucun résultat</div>`;
    } else {
      localSuggest.innerHTML = matches.map(e => {
        const pubHtml = e.pub ? ` <span style="color:#64748b;font-size:.8em">— ${e.pub}</span>` : '';
        return `<div class="ti-local-suggest-item" data-val="${e.value.replace(/"/g,'&quot;')}">${escapeHtml(e.internal)}${pubHtml}</div>`;
      }).join('');
      localSuggest.querySelectorAll('.ti-local-suggest-item').forEach(item => {
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          localInput.value = item.dataset.val;
          localSuggest.classList.add('hidden');
        });
      });
    }
    localSuggest.classList.remove('hidden');
  }

  localInput?.addEventListener('focus', () => _renderSuggestions(localInput.value));
  localInput?.addEventListener('input', () => _renderSuggestions(localInput.value));
  localInput?.addEventListener('keydown', e => {
    const items = localSuggest?.querySelectorAll('.ti-local-suggest-item');
    if (!items?.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _localHighlight = Math.min(_localHighlight + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('active', i === _localHighlight));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _localHighlight = Math.max(_localHighlight - 1, 0);
      items.forEach((it, i) => it.classList.toggle('active', i === _localHighlight));
    } else if (e.key === 'Enter' && _localHighlight >= 0) {
      e.preventDefault();
      localInput.value = items[_localHighlight].dataset.val;
      localSuggest.classList.add('hidden');
    } else if (e.key === 'Escape') {
      localSuggest.classList.add('hidden');
    }
  });
  localInput?.addEventListener('blur', () => {
    setTimeout(() => localSuggest?.classList.add('hidden'), 150);
  });

  g('techIssueSendBtn')?.addEventListener('click', async () => {
    const desc    = g('techIssueDesc')?.value.trim();
    const local   = g('techIssueLocal')?.value.trim() || null;
    const urgent  = g('techIssueUrgent')?.checked || false;
    if (!desc) { g('techIssueDesc')?.focus(); return; }

    // Résoudre les rôles cochés → clés d'agents
    const checkedRoles = new Set(
      [...(g('techIssueTargets')?.querySelectorAll('.ti-role-cb:checked') || [])]
        .map(cb => cb.dataset.role)
    );
    let targetKeys = DB.getAgentsWithKeys()
      .filter(({ key }) => checkedRoles.has(DB.getAgentPermRole(key) || '__agent__'))
      .map(a => a.key);

    // Fallback si aucun rôle coché ou aucun agent trouvé
    if (targetKeys.length === 0) {
      targetKeys = DB.getAgentsWithKeys()
        .filter(({ key }) => DB.getAgentPermRole(key) === '__admin__')
        .map(a => a.key);
    }

    const myKey  = sessionStorage.getItem('cpas_current_agent_key');
    const myName = DB.getAgentsWithKeys().find(a => a.key === myKey)?.name || 'Un agent';

    // Créer le ticket dans requests/ (vue Interventions)
    const requestId = await DB.createRequest({
      type:          _tiCurrentType,
      description:   desc,
      local,
      urgent,
      fromAgentKey:  myKey,
      fromAgentName: myName,
    });

    // Notifier les destinataires via le centre de notifs
    if (typeof REQUESTS !== 'undefined') {
      const req = { type: _tiCurrentType, description: desc, local, urgent, fromAgentKey: myKey, fromAgentName: myName };
      await REQUESTS.notifyTech(requestId, req, targetKeys);
    }

    closeModal();
    showToast('Requête envoyée ✓');
  });
}

// Bouton "Mes absences" dans le header (visible pour tous)
// Bouton "Gestion absences" dans settings (admin uniquement)

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fmtDT(d) {
  return d.toLocaleDateString('fr-BE', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// ═══════════════════════════════════════════════════════════════════
// Diffusion accueil — envoyer une notif à des rôles
// ═══════════════════════════════════════════════════════════════════

function openBroadcastModal() {
  const modal = g('broadcastModal');
  if (!modal) return;

  // Reset
  if (g('broadcastMsg'))    g('broadcastMsg').value = '';
  if (g('broadcastUrgent')) g('broadcastUrgent').checked = false;

  // Peupler la liste des rôles
  const container = g('broadcastTargets');
  if (container) {
    const allRoles = DB.getPermRoles();
    const agentsWithKeys = DB.getAgentsWithKeys();
    const roleCount = {};
    agentsWithKeys.forEach(({ key }) => {
      const r = DB.getAgentPermRole(key) || '__agent__';
      roleCount[r] = (roleCount[r] || 0) + 1;
    });

    const rolesWithAgents = Object.entries(allRoles)
      .filter(([id]) => (roleCount[id] || 0) > 0)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name));

    container.innerHTML = '';
    rolesWithAgents.forEach(([id, role]) => {
      const count = roleCount[id] || 0;
      const dot   = role.color ? `<span style="width:.6rem;height:.6rem;border-radius:50%;background:${role.color};flex-shrink:0;display:inline-block"></span>` : '';
      const row   = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:.55rem;cursor:pointer;font-size:.88rem;color:#e2e8f0;padding:.3rem .4rem;border-radius:6px;transition:background .12s';
      row.innerHTML = `<input type="checkbox" class="bc-role-cb" data-role="${id}" checked style="accent-color:#6366f1;flex-shrink:0"> ${dot} ${escapeHtml(role.name)} <span style="color:#64748b;font-size:.8rem;margin-left:auto">${count} agent${count > 1 ? 's' : ''}</span>`;
      container.appendChild(row);
    });
  }

  modal.classList.remove('hidden');
  g('broadcastMsg')?.focus();
}

function _initBroadcastModal() {
  const modal = g('broadcastModal');
  if (!modal) return;

  const closeModal = () => modal.classList.add('hidden');
  g('broadcastClose')?.addEventListener('click', closeModal);
  g('broadcastCancelBtn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  g('broadcastSendBtn')?.addEventListener('click', async () => {
    const msg    = g('broadcastMsg')?.value.trim();
    const urgent = g('broadcastUrgent')?.checked || false;
    if (!msg) { g('broadcastMsg')?.focus(); return; }

    // Résoudre les rôles cochés → clés d'agents
    const checkedRoles = new Set(
      [...(g('broadcastTargets')?.querySelectorAll('.bc-role-cb:checked') || [])]
        .map(cb => cb.dataset.role)
    );
    const targetKeys = DB.getAgentsWithKeys()
      .filter(({ key }) => checkedRoles.has(DB.getAgentPermRole(key) || '__agent__'))
      .map(a => a.key);

    if (!targetKeys.length) { showToast('Sélectionne au moins un destinataire.'); return; }

    const myKey  = sessionStorage.getItem('cpas_current_agent_key');
    const myName = DB.getAgentsWithKeys().find(a => a.key === myKey)?.name || 'Accueil';

    const btn = g('broadcastSendBtn');
    if (btn) btn.disabled = true;

    await Promise.all(targetKeys.map(k =>
      DB.sendNotif(msg, urgent ? 'alert' : 'info', k, {
        urgent,
        fromAgentKey:  myKey,
        fromAgentName: myName,
      })
    ));

    if (btn) btn.disabled = false;
    closeModal();
    showToast(`Message envoyé à ${targetKeys.length} agent${targetKeys.length > 1 ? 's' : ''} ✓`);
  });
}
