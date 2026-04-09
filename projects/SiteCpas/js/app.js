// ═══════════════════════════════════════════════════════════════════
// app.js — Initialisation principale
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async function () {

  // Initialiser Firebase et les modals
  DB.init();
  MODAL.init();

  // Config dynamique (agents / services) — écoute Firebase
  DB.initConfig();
  DB.onConfigChange(() => {
    MODAL.refreshSelects();
    CAL.render();
    updateStatusBar();
  });

  // Charger données de démo si Firebase est vide (premier lancement)
  try {
    await DB.seedConfigIfEmpty();
    await DB.seedIfEmpty();
  } catch (e) {
    console.warn('Seed skipped (Firebase non configuré) :', e.message);
  }

  // Re-rendre le calendrier et la status bar à chaque mise à jour Firebase
  DB.onChange(() => {
    CAL.render();
    updateStatusBar();
  });

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

  // ─── Nouvelle réservation ──────────────────────────────────────
  document.getElementById('btnNew').addEventListener('click', () => {
    MODAL.openNew({ date: isoDate(CAL.date) });
  });

});
