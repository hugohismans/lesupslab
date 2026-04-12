// ═══════════════════════════════════════════════════════════════════
// notif.js — Centre de notifications (couches A, B, B.1, C, D.1)
// ═══════════════════════════════════════════════════════════════════

const NOTIF = {
  _agentKey:      null,
  _agentName:     null,
  _notifs:        {},   // id → notif (Firebase + locales)
  _shownIds:      new Set(),
  _reminderSent:  new Set(),
  _dnd:           false,
  _panel:         null,
  _bell:          null,
  _badge:         null,
  _dndBtn:        null,
  _panelOpen:     false,
  _livePanel:     null,
  _liveBell:      null,
  _liveBadge:     null,
  _livePanelOpen:    false,
  _reminderInterval: null,
  _localIdSeq:       0,

  init() {
    this._agentKey = sessionStorage.getItem('cpas_current_agent_key');
    this._bell      = document.getElementById('notifBell');
    this._badge     = document.getElementById('notifBadge');
    this._panel     = document.getElementById('notifPanel');
    this._dndBtn    = document.getElementById('btnDnd');
    this._livePanel = document.getElementById('liveNotifPanel');
    this._liveBell  = document.getElementById('liveNotifBell');
    this._liveBadge = document.getElementById('liveNotifBadge');

    // Résoudre le nom de l'agent une fois la config chargée
    DB.onConfigChange(() => {
      const found = DB.getAgentsWithKeys().find(a => a.key === this._agentKey);
      this._agentName = found?.name || null;
    });

    // ── Couche D.1 — Permission notif navigateur ─────────────────────
    this._initNotifPermBanner();

    // ── Couche A — Écoute Firebase ──────────────────────────────────
    if (this._agentKey) {
      DB.listenNotifs(this._agentKey, (notifs) => {
        // Fusionner avec les notifs locales existantes
        const local = {};
        Object.entries(this._notifs).forEach(([id, n]) => {
          if (n._local) local[id] = n;
        });
        this._notifs = { ...notifs, ...local };
        this._onUpdate();
      });
    }

    // ── Couche B — Timer rappel 5 min avant RDV ─────────────────────
    this._startReminderTimer();

    // ── Couche B.1 — DND : lire l'état courant ──────────────────────
    DB.onAgentStatusChange(() => {
      if (!this._agentKey) return;
      const isDnd = DB.getAgentDnd(this._agentKey);
      if (isDnd !== this._dnd) {
        this._dnd = isDnd;
        this._updateDndBtn();
      }
    });

    // ── UI — Bell (header standard) ────────────────────────────────
    this._bell?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel();
    });

    // ── UI — Bell (vue Direct) ──────────────────────────────────────
    this._liveBell?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleLivePanel();
    });

    // DND button
    this._dndBtn?.addEventListener('click', () => this.toggleDnd());

    // Fermer les panels en cliquant ailleurs
    document.addEventListener('click', (e) => {
      if (this._panelOpen &&
          this._panel && !this._panel.contains(e.target) &&
          e.target !== this._bell && !this._bell?.contains(e.target)) {
        this._closePanel();
      }
      if (this._livePanelOpen &&
          this._livePanel && !this._livePanel.contains(e.target) &&
          e.target !== this._liveBell && !this._liveBell?.contains(e.target)) {
        this._closeLivePanel();
      }
    });

    // Notifier chaque connexion si Push PWA disponible (D.2 — stub)
    this._registerServiceWorker();
  },

  // ── Couche A — Mise à jour du badge et du panel ─────────────────
  _onUpdate() {
    const agentKey = this._agentKey;
    const unread = Object.entries(this._notifs).filter(([, n]) =>
      !n.readBy?.[agentKey] && !n._local
    ).length + Object.values(this._notifs).filter(n => n._local && !n._read).length;

    // Badge (header standard + vue Direct)
    const badgeTxt = unread > 9 ? '9+' : (unread || '');
    if (this._badge) {
      this._badge.textContent = badgeTxt;
      this._badge.classList.toggle('hidden', !unread);
    }
    if (this._liveBadge) {
      this._liveBadge.textContent = badgeTxt;
      this._liveBadge.classList.toggle('hidden', !unread);
    }

    // Notifs navigateur pour les nouvelles non-DND
    if (!this._dnd) {
      Object.entries(this._notifs).forEach(([id, n]) => {
        if (!this._shownIds.has(id)) {
          const isUnread = n._local ? !n._read : !n.readBy?.[agentKey];
          if (isUnread) {
            this._shownIds.add(id);
            this._showBrowserNotif(n);
            this._playSound(n.type === 'panic' ? 'panic' : (n.urgent ? 'urgent' : (n.type || 'info')));
            // Panic : ouvrir la modal d'alerte plein écran (pas à l'émetteur)
            if (n.type === 'panic' && n.sourceAgentKey !== agentKey) {
              window._showPanicAlert?.(n);
            }
          }
        }
      });
    }

    // Rafraîchir les panels si ouverts
    if (this._panelOpen) this._render();
    if (this._livePanelOpen) this._renderLive();
  },

  // ── Son — jouer un son selon le type de notif ───────────────────
  _playSound(type) {
    if (this._dnd) return;
    const lvl = DB.getSoundLevel();
    if (lvl === 0) return;
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const tone = (freq, t0, dur, vol = 0.28, shape = 'sine') => {
        vol = Math.min(1, vol * lvl);
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = shape;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, ctx.currentTime + t0);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + dur);
        osc.start(ctx.currentTime + t0);
        osc.stop(ctx.currentTime + t0 + dur + 0.05);
      };
      if (type === 'panic') {
        // Alarme stridentes — urgence absolue (5 bips rapides)
        for (let i = 0; i < 5; i++) {
          tone(1320, i * 0.16, 0.12, 0.6);
          tone(880,  i * 0.16 + 0.08, 0.08, 0.5);
        }
      } else if (type === 'preferred_request') {
        // Sonnette douce 3 tons — quelqu'un demande cet agent spécifiquement
        tone(523, 0,    0.18, 0.3, 'sine');
        tone(659, 0.22, 0.18, 0.3, 'sine');
        tone(784, 0.44, 0.28, 0.3, 'sine');
      } else if (type === 'alert' || type === 'urgent') {
        // 3 bips aigus et courts — urgence
        tone(1046, 0,    0.12, 0.45);
        tone(1046, 0.18, 0.12, 0.45);
        tone(1046, 0.36, 0.18, 0.45);
      } else if (type === 'tech_request') {
        // Deux tons descendants — demande d'intervention
        tone(660, 0,    0.2, 0.32, 'triangle');
        tone(440, 0.26, 0.28, 0.28, 'triangle');
      } else if (type === 'tech_reply') {
        // Deux tons montants — réponse reçue
        tone(440, 0,    0.15, 0.25, 'triangle');
        tone(660, 0.2,  0.22, 0.28, 'triangle');
      } else if (type === 'warn') {
        // Double ding — avertissement
        tone(784, 0,    0.18, 0.3);
        tone(784, 0.25, 0.22, 0.22);
      } else {
        // Info — ding doux unique
        tone(880, 0, 0.28, 0.22);
      }
    } catch (_) { /* AudioContext non supporté */ }
  },

  // ── Bannière demande de permission ───────────────────────────────
  _initNotifPermBanner() {
    if (!('Notification' in window)) return;
    const banner   = document.getElementById('notifPermBanner');
    const btn      = document.getElementById('notifPermBtn');
    const dismiss  = document.getElementById('notifPermDismiss');
    if (!banner || !btn) return;

    const _check = () => {
      const featureOn = DB.getFeature('enableNotifBrowser');
      const perm = Notification.permission;
      // Afficher si feature activée ET permission pas encore accordée/refusée
      const show = featureOn && perm === 'default';
      banner.classList.toggle('hidden', !show);
      // Si refusée → montrer un message différent
      if (featureOn && perm === 'denied') {
        banner.classList.remove('hidden');
        btn.textContent   = 'Comment autoriser ?';
        btn.onclick = () => window.open('https://support.google.com/chrome/answer/3220216', '_blank');
        banner.querySelector('.notif-perm-body strong').textContent = 'Notifications bloquées par le navigateur';
        banner.querySelector('.notif-perm-body span').textContent   = 'Autorisez manuellement depuis les paramètres du navigateur (icône 🔒 dans la barre d\'adresse).';
      }
    };

    btn.addEventListener('click', async () => {
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        if (result === 'granted') {
          banner.classList.add('hidden');
          new Notification('✅ Notifications activées', { body: 'Vous recevrez les alertes SiteCpas dans ce navigateur.' });
        } else {
          _check(); // afficher message "bloqué"
        }
      }
    });

    dismiss?.addEventListener('click', () => {
      banner.classList.add('hidden');
      sessionStorage.setItem('notifPermDismissed', '1');
    });

    // Ne pas re-afficher si l'utilisateur a déjà ignoré dans cette session
    if (sessionStorage.getItem('notifPermDismissed')) return;

    // Vérifier au chargement et à chaque changement de config
    setTimeout(_check, 1500);
    DB.onConfigChange(_check);
  },

  // ── Couche D.1 — Notification navigateur ─────────────────────────
  _showBrowserNotif(n) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || this._dnd) return;

    // Filtre selon les flags :
    // enableNotifBrowser = false → aucune notif navigateur
    // enableNotifBrowserUrgentOnly = true → seulement les urgences
    if (!DB.getFeature('enableNotifBrowser')) return;
    if (DB.getFeature('enableNotifBrowserUrgentOnly') && !n.urgent) return;

    const icons = { alert: '🚨', warn: '⚠️', info: 'ℹ️' };
    const prefix = n.urgent ? '🚨 URGENT — ' : '';
    try {
      new Notification(`${prefix}moncompagnon ${icons[n.type] || 'ℹ️'}`, {
        body:     n.message,
        icon:     'assets/logo.jpg',
        badge:    'assets/logo.jpg',
        tag:      n.type + '_' + (n.createdAt || ''),
        renotify: !!n.urgent,
        vibrate:  n.urgent ? [200, 100, 200] : undefined,
      });
    } catch (_) { /* Notification non supportée */ }
  },

  // ── Couche B — Timer rappel 5 min avant réservation ─────────────
  _startReminderTimer() {
    const check = () => {
      if (this._dnd || !this._agentKey || !this._agentName) return;
      const now   = new Date();
      const today = isoDate(now);
      const allRes = DB.getAll();

      Object.entries(allRes).forEach(([id, res]) => {
        if (!res.startDateTime) return;
        const start = new Date(res.startDateTime);
        if (isoDate(start) !== today) return;

        const diffMin = (start - now) / 60000;
        if (diffMin < 0 || diffMin > 6) return;

        // Est-ce mon RDV ?
        const resAgent = res.agent === 'Autre' ? res.agentCustom : res.agent;
        const isOwner   = resAgent === this._agentName;
        const isInvited = !!(res.invitedAgents?.[this._agentKey]);
        if (!isOwner && !isInvited) return;

        const remindKey = `remind_${id}_${today}`;
        if (this._reminderSent.has(remindKey)) return;
        this._reminderSent.add(remindKey);

        const svc   = res.service === 'Autre' ? res.serviceCustom : res.service;
        const local = DB.getLocalLabel(res.localId);
        const min   = Math.round(diffMin);
        const msg   = min <= 1
          ? `Maintenant — ${local} : ${svc}`
          : `Dans ${min} min — ${local} : ${svc}`;

        this._addLocal(msg, 'warn');
      });
    };

    clearInterval(this._reminderInterval);
    this._reminderInterval = setInterval(check, 30000);
    setTimeout(check, 5000); // premier check léger après le chargement
  },

  // Notif locale (non-Firebase, session uniquement)
  _addLocal(message, type) {
    const id = `_local_${++this._localIdSeq}`;
    this._notifs[id] = { message, type, createdAt: Date.now(), _local: true, _read: false };
    this._showBrowserNotif({ message, type });
    this._onUpdate();
    // Auto-dismiss après 10 min
    setTimeout(() => { delete this._notifs[id]; this._onUpdate(); }, 10 * 60 * 1000);
  },

  // ── Couche B.1 — Mode absent / DND ──────────────────────────────
  toggleDnd() {
    this._dnd = !this._dnd;
    DB.setDnd(this._agentKey, this._dnd);
    this._updateDndBtn();
    showToast(this._dnd ? 'Mode absent activé — notifications silencieuses' : 'Mode actif — notifications rétablies', this._dnd ? 'warn' : 'ok');
  },

  _updateDndBtn() {
    if (!this._dndBtn) return;
    this._dndBtn.classList.toggle('dnd-active', this._dnd);
    this._dndBtn.setAttribute('title', this._dnd
      ? 'Mode absent actif — cliquez pour reprendre'
      : 'Activer le mode absent (ne plus recevoir de notifications)');
    this._dndBtn.innerHTML = this._dnd ? '🔕' : '🔔';
  },

  // ── Panel ────────────────────────────────────────────────────────
  togglePanel() {
    if (this._panelOpen) this._closePanel();
    else this._openPanel();
  },

  _openPanel() {
    this._panelOpen = true;
    this._panel?.classList.remove('hidden');
    this._render(this._panel);
    // Marquer tout comme lu (Firebase)
    Object.entries(this._notifs).forEach(([id, n]) => {
      if (!n._local && !n.readBy?.[this._agentKey]) {
        DB.markNotifRead(id);
        // Pour les preferred_request : démarrer le timer de suppression données sensibles
        if (n.type === 'preferred_request' && n.requestId && !n.nameDeleteAt) {
          const deleteMin = DB.getSensitivDataDeleteMin?.() ?? 30;
          DB.markPreferredRequestNameRead(n.requestId, deleteMin);
        }
      }
      if (n._local) n._read = true;
    });
    // Mettre à jour le badge à 0
    if (this._badge) { this._badge.textContent = ''; this._badge.classList.add('hidden'); }
  },

  _closePanel() {
    this._panelOpen = false;
    this._panel?.classList.add('hidden');
  },

  // ── Panel vue Direct ─────────────────────────────────────────────
  _toggleLivePanel() {
    if (this._livePanelOpen) this._closeLivePanel();
    else this._openLivePanel();
  },

  _openLivePanel() {
    this._livePanelOpen = true;
    this._livePanel?.classList.remove('hidden');
    this._renderLive();
    // Marquer tout comme lu
    Object.entries(this._notifs).forEach(([id, n]) => {
      if (!n._local && !n.readBy?.[this._agentKey]) {
        DB.markNotifRead(id);
        if (n.type === 'preferred_request' && n.requestId && !n.nameDeleteAt) {
          const deleteMin = DB.getSensitivDataDeleteMin?.() ?? 30;
          DB.markPreferredRequestNameRead(n.requestId, deleteMin);
        }
      }
      if (n._local) n._read = true;
    });
    if (this._liveBadge) { this._liveBadge.textContent = ''; this._liveBadge.classList.add('hidden'); }
    if (this._badge) { this._badge.textContent = ''; this._badge.classList.add('hidden'); }
  },

  _closeLivePanel() {
    this._livePanelOpen = false;
    this._livePanel?.classList.add('hidden');
  },

  _renderLive() {
    if (!this._livePanel) return;
    this._render(this._livePanel);
  },

  // Countdown formatté pour données sensibles
  _formatCountdown(deleteAt) {
    const remaining = Math.max(0, deleteAt - Date.now());
    const totalMin  = Math.ceil(remaining / 60000);
    if (totalMin <= 0) return 'effacé';
    if (totalMin >= 60) {
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return `${h}h${m > 0 ? String(m).padStart(2,'0') : ''}`;
    }
    return `${totalMin} min`;
  },

  _render(target) {
    target = target || this._panel;
    if (!target) return;
    const agentKey = this._agentKey;
    const entries = Object.entries(this._notifs)
      .sort(([, a], [, b]) => b.createdAt - a.createdAt)
      .slice(0, 40);

    if (!entries.length) {
      target.innerHTML = `
        <div class="notif-panel-hd"><span>Notifications</span></div>
        <div class="notif-empty">Aucune notification</div>`;
      return;
    }

    const icons = { alert: '🚨', warn: '⚠️', info: 'ℹ️' };
    const isLive = target === this._livePanel;

    target.innerHTML = `
      <div class="notif-panel-hd">
        <span>Notifications</span>
        <button class="notif-clear-btn" data-clear="1">Tout effacer</button>
      </div>
      <div class="notif-list">
        ${entries.map(([id, n]) => {
          const isRead = n._local ? n._read : !!(n.readBy?.[agentKey]);
          const isPref = n.type === 'preferred_request';
          const isPrefReply = n.type === 'preferred_reply_accueil';
          const isPanic = n.type === 'panic';
          const icon   = isPanic ? '🚨' : (isPref ? '👤' : (isPrefReply ? '↩️' : (n.type === 'tech_request' ? '🔧' : (n.type === 'tech_reply' ? '↩️' : (n.urgent ? '🚨' : (icons[n.type] || 'ℹ️'))))));
          const d      = new Date(n.createdAt);
          const time   = d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          const canReply = n.type === 'tech_request' && n.replyable && !n.replied;

          // Contenu spécifique preferred_request (agent ciblé)
          let prefHtml = '';
          if (isPref) {
            const hasDeleteAt  = !!n.nameDeleteAt;
            const countdown    = hasDeleteAt ? this._formatCountdown(n.nameDeleteAt) : null;
            const expired      = hasDeleteAt && n.nameDeleteAt <= Date.now();
            prefHtml = `
              <div class="notif-sensitive-badge">⚠ Données sensibles${countdown && !expired ? ` — effacées dans <strong class="notif-countdown" data-delete-at="${n.nameDeleteAt}">${countdown}</strong>` : (expired ? ' — <strong>effacées</strong>' : '')}</div>
              <div class="notif-pref-body">
                <div class="notif-pref-row"><strong>Bénéficiaire :</strong> ${n.benefName ? escapeHtml(n.benefName) : '<em style="color:#94a3b8">[Données effacées]</em>'}</div>
                ${n.publicPlaceName ? `<div class="notif-pref-row"><strong>En attente :</strong> ${escapeHtml(n.publicPlaceName)}</div>` : ''}
              </div>
              ${n.status !== 'done' && n.status !== 'cancelled' && !n.responded ? `
              <div class="notif-pref-actions" data-request-id="${n.requestId || id}">
                <button class="notif-pref-btn notif-pref-now" data-id="${id}" data-req="${n.requestId || id}">✅ J'arrive tout de suite</button>
                <button class="notif-pref-btn notif-pref-eta" data-id="${id}" data-req="${n.requestId || id}">⏱ Dans X min…</button>
                <button class="notif-pref-btn notif-pref-decline" data-id="${id}" data-req="${n.requestId || id}">❌ Pas disponible</button>
              </div>` : (n.responded ? `<div style="font-size:.78rem;color:#4ade80;margin-top:.35rem">✓ Réponse envoyée</div>` : '')}`;
          }

          // Contenu spécifique preferred_reply_accueil
          let prefReplyHtml = '';
          if (isPrefReply && n.requestId && n.status !== 'done' && n.status !== 'cancelled') {
            const printBtn = n.ticketLabel && window.LIVE && DB.getFeature('enableTicketPrint')
              ? `<button class="notif-pref-print-btn" data-ticket="${escapeHtml(n.ticketLabel)}">🖨 Imprimer ${escapeHtml(n.ticketLabel)}</button>`
              : '';
            prefReplyHtml = `${printBtn}<button class="notif-pref-cancel-btn" data-req="${n.requestId}" data-lid="${n.localId || ''}">🗑 Annuler la demande</button>`;
          }

          return `
            <div class="notif-item notif-${n.type}${n.urgent ? ' notif-urgent' : ''}${isRead ? ' notif-read' : ''}${isPref ? ' notif-sensitive' : ''}" data-notif-id="${id}">
              <span class="notif-icon">${icon}</span>
              <div class="notif-body">
                <div class="notif-msg">${escapeHtml(n.message)}</div>
                <div class="notif-time">${time}${n.type === 'tech_request' && n.replied ? ' · <em>répondu</em>' : ''}</div>
                ${prefHtml}
                ${prefReplyHtml}
                ${canReply ? `<button class="notif-reply-btn" data-id="${id}" data-from="${n.fromAgentKey || ''}" data-desc="${encodeURIComponent(n.description || n.message)}">↩ Répondre</button>` : ''}
              </div>
              ${!n._local ? `<button class="notif-del" data-id="${id}">✕</button>` : ''}
            </div>`;
        }).join('')}
      </div>`;

    target.querySelectorAll('.notif-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        DB.deleteNotif(btn.dataset.id);
      });
    });

    target.querySelectorAll('.notif-reply-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isLive) this._closeLivePanel(); else this._closePanel();
        this._openReplyModal(btn.dataset.id, btn.dataset.from, decodeURIComponent(btn.dataset.desc || ''));
      });
    });

    // Boutons réponse preferred_request
    target.querySelectorAll('.notif-pref-now').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isLive) this._closeLivePanel(); else this._closePanel();
        window._openPreferredResponseModal?.(btn.dataset.id, btn.dataset.req, 'now');
      });
    });
    target.querySelectorAll('.notif-pref-eta').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isLive) this._closeLivePanel(); else this._closePanel();
        window._openPreferredResponseModal?.(btn.dataset.id, btn.dataset.req, 'eta');
      });
    });
    target.querySelectorAll('.notif-pref-decline').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isLive) this._closeLivePanel(); else this._closePanel();
        window._openPreferredResponseModal?.(btn.dataset.id, btn.dataset.req, 'decline');
      });
    });

    // Bouton imprimer ticket (côté accueil — demande spécifique acceptée)
    target.querySelectorAll('.notif-pref-print-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        window.LIVE?._doPrintTicket({ ticket: btn.dataset.ticket, svc: '', localLabel: '' });
      });
    });

    // Bouton annuler demande (côté accueil)
    target.querySelectorAll('.notif-pref-cancel-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Annuler cette demande bénéficiaire ?')) return;
        await DB.cancelPreferredRequest(btn.dataset.req, btn.dataset.lid ? parseInt(btn.dataset.lid) : null);
        const item = btn.closest('.notif-item');
        if (item) item.querySelector('.notif-pref-cancel-btn')?.remove();
      });
    });

    target.querySelector('[data-clear="1"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      Object.entries(this._notifs).forEach(([id, n]) => {
        if (!n._local) DB.deleteNotif(id);
      });
      Object.keys(this._notifs).forEach(id => {
        if (this._notifs[id]._local) delete this._notifs[id];
      });
      this._onUpdate();
    });

    // Démarrer les countdowns temps réel
    this._startCountdowns();
  },

  _countdownInterval: null,
  _startCountdowns() {
    clearInterval(this._countdownInterval);
    // Chercher les countdowns dans tous les panels visibles
    const getPanels = () => [this._panel, this._livePanel].filter(p => p && !p.classList.contains('hidden'));
    const allEls = () => getPanels().flatMap(p => [...(p.querySelectorAll('.notif-countdown[data-delete-at]') || [])]);
    if (!allEls().length) return;
    this._countdownInterval = setInterval(() => {
      const els = allEls();
      if (!els.length) { clearInterval(this._countdownInterval); return; }
      els.forEach(el => {
        const deleteAt = parseInt(el.dataset.deleteAt);
        if (!deleteAt) return;
        if (Date.now() >= deleteAt) {
          el.textContent = 'effacé';
          window._onPreferredDataExpired?.(deleteAt);
        } else {
          el.textContent = this._formatCountdown(deleteAt);
        }
      });
    }, 30000);
  },

  // ── Réponse à une requête (tech_request) ────────────────────────
  _openReplyModal(notifId, fromAgentKey, description) {
    const modal    = document.getElementById('techReplyModal');
    const ctx      = document.getElementById('techReplyContext');
    const etaInput = document.getElementById('techReplyEta');
    const comInput = document.getElementById('techReplyComment');
    if (!modal) return;

    const fromName = DB.getAgentsWithKeys().find(a => a.key === fromAgentKey)?.name || fromAgentKey || 'l\'agent';
    if (ctx) ctx.innerHTML = `<strong>Demande de ${escapeHtml(fromName)} :</strong><br>${escapeHtml(description)}`;
    if (etaInput) etaInput.value = '';
    if (comInput) comInput.value = '';

    modal.classList.remove('hidden');

    const closeModal = () => modal.classList.add('hidden');

    document.getElementById('techReplyClose')?.addEventListener('click', closeModal, { once: true });
    document.getElementById('techReplyCancelBtn')?.addEventListener('click', closeModal, { once: true });
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); }, { once: true });

    document.getElementById('techReplySendBtn')?.addEventListener('click', async () => {
      const eta     = etaInput?.value.trim()  || '';
      const comment = comInput?.value.trim() || '';
      if (!eta && !comment) {
        etaInput?.focus();
        return;
      }
      const myKey = sessionStorage.getItem('cpas_current_agent_key');
      await DB.sendTechReply(notifId, myKey, eta, comment);
      closeModal();
      if (typeof showToast === 'function') showToast('Réponse envoyée ✓');
    }, { once: true });
  },

  // ── Couche C — Envoi manuel (admin) ─────────────────────────────
  // Appelé depuis le panneau paramètres admin
  async sendBroadcast(message, type) {
    if (!DB.hasPermission('sendNotif')) return;
    await DB.sendNotif(message, type, null);
  },

  async sendToAgent(message, type, targetKey) {
    if (!DB.hasPermission('sendNotif')) return;
    await DB.sendNotif(message, type, targetKey);
  },

  // ── Méthode publique pour générer une notif auto (couche B) ──────
  // Utilisée par d'autres modules (ex: retard agent, message du jour)
  async auto(message, type, targetAgentKey) {
    // Écriture Firebase seulement si cible définie (évite les doublons multi-clients)
    // Pour les broadcasts auto → local uniquement
    if (targetAgentKey) {
      await DB.sendNotif(message, type, targetAgentKey);
    } else {
      this._addLocal(message, type);
    }
  },

  // ── Couche D.2 — Service Worker (stub PWA) ───────────────────────
  _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('firebase-messaging-sw.js').catch(() => {
      // SW non disponible (dev local, HTTP…) — silencieux
    });
  },
};
