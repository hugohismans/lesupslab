// ═══════════════════════════════════════════════════════════════════
// app.js — Initialisation principale
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async function () {

  // Initialiser Firebase et les modals
  DB.init();
  MODAL.init();

  // Config dynamique (agents / services / lieux) — écoute Firebase
  DB.initConfig();
  DB.initQueue();
  DB.initAgentStatus();
  DB.onConfigChange(() => {
    updateLieuTabs();
    MODAL.refreshSelects();
    CAL.render();
    updateStatusBar();
    updateMessageBubble();
  });

  // Charger la config par défaut si Firebase est vide (premier lancement)
  try {
    await DB.seedConfigIfEmpty();
    // DB.seedIfEmpty() désactivé — données de démo supprimées
  } catch (e) {
    console.warn('Seed skipped (Firebase non configuré) :', e.message);
  }

  // Re-rendre le calendrier et la status bar à chaque mise à jour Firebase
  DB.onChange(() => {
    CAL.render();
    updateStatusBar();
    LIVE.render();
  });
  DB.onQueueChange(() => LIVE.render());
  DB.onAgentStatusChange(() => LIVE.render());

  // Initialiser la status bar à l'heure actuelle
  const now = new Date();
  const roundedMin = Math.floor(now.getMinutes() / 30) * 30;
  document.getElementById('checkDate').value = isoDate(now);
  document.getElementById('checkTime').value =
    `${String(now.getHours()).padStart(2,'0')}:${String(roundedMin).padStart(2,'0')}`;

  // Mise à jour de la status bar quand l'utilisateur change la date/heure
  document.getElementById('checkDate').addEventListener('change', updateStatusBar);
  document.getElementById('checkTime').addEventListener('change', updateStatusBar);

  // Rendu initial du calendrier
  CAL.render();

  // ─── Message du jour ───────────────────────────────────────────
  function updateMessageBubble() {
    const msg     = DB.getMessageJour();
    const at      = DB.getMessageJourAt();
    const bubble  = document.getElementById('msgBubble');
    const isAdmin = sessionStorage.getItem('cpas_admin') === '1';
    if (msg) {
      document.getElementById('msgText').textContent = msg;
      const metaEl = document.getElementById('msgMeta');
      if (at) {
        const d = new Date(at);
        const dateStr = d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
        metaEl.textContent = `Mis à jour le ${dateStr} à ${timeStr}`;
      } else {
        metaEl.textContent = '';
      }
      bubble.classList.remove('hidden');
    } else if (isAdmin) {
      document.getElementById('msgText').textContent = 'Aucun message — cliquez ✏️ pour en ajouter un';
      document.getElementById('msgMeta').textContent = '';
      bubble.classList.remove('hidden');
    } else {
      bubble.classList.add('hidden');
    }
    document.getElementById('msgEdit').classList.toggle('hidden', !isAdmin);
  }

  document.getElementById('msgClose').addEventListener('click', () => {
    document.getElementById('msgBubble').classList.add('hidden');
  });
  document.getElementById('msgEdit').addEventListener('click', () => {
    document.getElementById('msgEditInput').value = DB.getMessageJour();
    document.getElementById('msgEditPublicInput').value = DB.getMessageJourPublic();
    document.getElementById('msgEditOverlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('msgEditInput').focus(), 80);
  });
  document.getElementById('msgEditSave').addEventListener('click', async () => {
    const txt    = document.getElementById('msgEditInput').value.trim();
    const pubTxt = document.getElementById('msgEditPublicInput').value.trim();
    await Promise.all([DB.setMessageJour(txt), DB.setMessageJourPublic(pubTxt)]);
    document.getElementById('msgEditOverlay').classList.add('hidden');
  });
  document.getElementById('msgEditClear').addEventListener('click', async () => {
    if (!confirm('Effacer les deux messages du jour ?')) return;
    await Promise.all([DB.setMessageJour(''), DB.setMessageJourPublic('')]);
    document.getElementById('msgEditOverlay').classList.add('hidden');
  });
  document.getElementById('msgEditOverlay').addEventListener('click', e => {
    if (e.target.id === 'msgEditOverlay') document.getElementById('msgEditOverlay').classList.add('hidden');
  });

  // ─── Onglets de lieux ──────────────────────────────────────────
  function updateLieuTabs() {
    const lieux     = DB.getLieux();
    const currentId = DB.getCurrentLieuId();
    const bar       = document.getElementById('lieuBar');
    bar.innerHTML   = Object.entries(lieux).map(([id, lieu]) => `
      <button class="lieu-tab${id === currentId ? ' active' : ''}" data-lieu="${id}">
        ${lieu.name.replace(/&/g,'&amp;').replace(/</g,'&lt;')}
      </button>`).join('');
    bar.querySelectorAll('.lieu-tab').forEach(btn => {
      btn.addEventListener('click', () => DB.setCurrentLieu(btn.dataset.lieu));
    });
  }

  // ─── Onglets de vue ────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      CAL.setView(this.dataset.view);
    });
  });

  // ─── Navigation ────────────────────────────────────────────────
  document.getElementById('btnPrev').addEventListener('click',  () => CAL.navigate(-1));
  document.getElementById('btnNext').addEventListener('click',  () => CAL.navigate(1));
  document.getElementById('btnToday').addEventListener('click', () => {
    CAL.goToday();
    // Remettre la status bar à maintenant
    const n = new Date();
    const rm = Math.floor(n.getMinutes() / 30) * 30;
    document.getElementById('checkDate').value = isoDate(n);
    document.getElementById('checkTime').value =
      `${String(n.getHours()).padStart(2,'0')}:${String(rm).padStart(2,'0')}`;
    updateStatusBar();
  });

  // ─── Vue Live ──────────────────────────────────────────────────
  document.getElementById('btnLive').addEventListener('click', () => LIVE.open());
  document.getElementById('btnLiveClose').addEventListener('click', () => LIVE.close());

  // ─── Statut présence ───────────────────────────────────────────
  function openPresenceOverlay() {
    const sel = document.getElementById('presenceAgent');
    sel.innerHTML = DB.getAgentsWithKeys().map(({key, name}) =>
      `<option value="${key}">${name}</option>`).join('');
    document.getElementById('presenceStatus').value = '';
    document.getElementById('presenceTimeWrap').style.display = 'none';
    document.getElementById('presenceOverlay').classList.remove('hidden');
  }
  document.getElementById('btnPresence').addEventListener('click', openPresenceOverlay);
  document.getElementById('btnPresenceHd').addEventListener('click', openPresenceOverlay);
  document.getElementById('presenceStatus').addEventListener('change', function () {
    document.getElementById('presenceTimeWrap').style.display = this.value === 'late' ? '' : 'none';
  });
  document.getElementById('presenceSave').addEventListener('click', async () => {
    const key    = document.getElementById('presenceAgent').value;
    const status = document.getElementById('presenceStatus').value;
    const time   = document.getElementById('presenceTime').value;
    await DB.setAgentStatus(key, status, time);
    document.getElementById('presenceOverlay').classList.add('hidden');
  });
  document.getElementById('presenceOverlay').addEventListener('click', e => {
    if (e.target.id === 'presenceOverlay') document.getElementById('presenceOverlay').classList.add('hidden');
  });
  document.getElementById('liveAgentSearch').addEventListener('input', function () {
    LIVE._agentQuery = this.value.trim();
    LIVE._renderAgentSuggestions(this.value.trim());
    LIVE.render();
  });
  document.getElementById('liveAgentSearch').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      this.value = '';
      LIVE._agentQuery = '';
      g('liveAgentSuggestions').innerHTML = '';
      LIVE.render();
    }
  });

  // ─── Nouvelle réservation ──────────────────────────────────────
  document.getElementById('btnNew').addEventListener('click', () => {
    MODAL.openNew({ date: isoDate(CAL.date) });
  });

});
