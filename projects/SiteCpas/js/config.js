// ═══════════════════════════════════════════════════════════════════
// config.js — Configuration de l'application
// ═══════════════════════════════════════════════════════════════════

// Extraire l'orgId depuis l'URL : /cpas-quaregnon/app.html → "cpas-quaregnon"
// En dev local (chemin ne correspondant pas à un orgId), fallback sur 'cpas-quaregnon'
const ORG_ID = (() => {
  // Priorité 1 : paramètre ?org= (dev/test uniquement)
  const param = new URLSearchParams(window.location.search).get('org');
  if (param) return param;
  // Priorité 2 : premier segment de l'URL (prod)
  const parts = window.location.pathname.split('/').filter(Boolean);
  const skip  = ['projects', 'SiteCpas', 'app.html', 'public.html', 'index.html', 'migrate.html', 'welcome.html', 'superadmin.html'];
  const first = parts[0];
  return (first && !skip.includes(first)) ? first : 'cpas-quaregnon';
})();

const CONFIG = {

  // ── FIREBASE ─────────────────────────────────────────────────────
  // Remplacer avec les identifiants de votre projet Firebase
  FIREBASE: {
    apiKey:            'AIzaSyBV5plJl_9fbjhpumCNoj6BgVN3uqpWrOs',
    authDomain:        'cpasquaregnon-70f59.firebaseapp.com',
    databaseURL:       'https://cpasquaregnon-70f59-default-rtdb.europe-west1.firebasedatabase.app',
    projectId:         'cpasquaregnon-70f59',
    storageBucket:     'cpasquaregnon-70f59.firebasestorage.app',
    messagingSenderId: '1028628915813',
    appId:             '1:1028628915813:web:dbca4db8ed5b511321c88c'
  },

  // ── HORAIRES D'OUVERTURE ─────────────────────────────────────────
  // [FAKE — À CONFIRMER AVEC LE CLIENT]
  HOURS_START: 0,   // 0h00 (TEST — remettre 8 en prod)
  HOURS_END:   24,  // 24h00 (TEST — remettre 22 en prod)
  SLOT_MIN:    30,  // tranches de 30 minutes

  // ── LOCAUX ───────────────────────────────────────────────────────
  LOCALS: [1, 2, 3, 4, 5, 6, 7],
  // Local 1-2  → Permanences (aide générale + Énergie)
  // Local 3-4  → Service d'insertion socio-professionnelle
  // Local 5    → Médiation de dettes
  // Local 6    → Étrangers / Logement / Énergie
  // Local 7    → Urgence et divers / Intervention AS

  // ── SERVICES ─────────────────────────────────────────────────────
  SERVICES: [
    'Permanence aide générale',
    'Permanence Énergie',
    "Service d'insertion socio-professionnelle",
    'Médiation de dettes',
    'Étrangers / Logement / Énergie',
    'Urgence et divers',
    'Accueil / Desk d\'accueil',
    'Autre'
  ],

  // ── PUSH PWA (Couche D.2) ────────────────────────────────────────
  // Clé VAPID : Firebase Console → Paramètres → Cloud Messaging → Certificats Web Push
  // Laisser vide pour désactiver le Push PWA côté client.
  VAPID_KEY: '',

  // ── AGENTS ───────────────────────────────────────────────────────
  // À remplacer par la liste réelle des travailleurs
  AGENTS: [
    'AS Martin',
    'AS Dubois',
    'AS Lambert',
    'AS Renard',
    'AS Claes',
    'AS Pirard',
    'AS Maes',
    'Réceptionniste',
    'Autre'
  ]
};
