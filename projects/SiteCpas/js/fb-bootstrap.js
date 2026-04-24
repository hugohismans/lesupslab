// ═══════════════════════════════════════════════════════════════════
// fb-bootstrap.js — doit être chargé AVANT les SDK Firebase.
//
// HOTFIX bug récurrent de login : Firebase Realtime DB stocke un flag
// `firebase:previous_websocket_failure=true` en localStorage dès qu'un
// WebSocket tombe une fois (réseau flaky, proxy corporate CPAS qui
// coupe les WS, fermeture d'onglet pendant un upgrade, etc.). Au
// chargement suivant, Firebase saute directement au long-polling qui
// peut être plus fragile côté CSP ou bloqué par certains firewalls.
//
// Symptôme : page "Chargement…" qui ne termine jamais, liste d'agents
// vide sur index.html, app.html qui reste vide après login. Fix
// temporaire côté utilisateur : vider le localStorage.
//
// Ce script supprime systématiquement le flag au chargement de chaque
// page → Firebase retente WebSocket en premier, ce qui marche dans
// 99% des cas. Coût : une seule tentative ratée par session si le
// réseau refuse vraiment les WS (quelques secondes avant fallback).
// ═══════════════════════════════════════════════════════════════════

(function () {
  try {
    localStorage.removeItem('firebase:previous_websocket_failure');
  } catch (e) { /* localStorage indisponible (mode privé strict) — pas grave */ }
})();
