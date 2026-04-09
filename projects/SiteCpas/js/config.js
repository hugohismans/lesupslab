// ═══════════════════════════════════════════════════════════════════
// config.js — Configuration de l'application
// ═══════════════════════════════════════════════════════════════════

const CONFIG = {

  // ── MOT DE PASSE PARTAGÉ ─────────────────────────────────────────
  // IMPORTANT : remplacer avant mise en production
  APP_PASSWORD: 'cpas2024',

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
  HOURS_START: 8,   // 8h00
  HOURS_END:   18,  // 18h00
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
