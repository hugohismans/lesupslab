// ═══════════════════════════════════════════════════════════════════
// merge-final.js — Génère un seul fichier d'import qui contient :
//   - Les techThemes existants (depuis le backup) + les nouveaux (themes-add.json)
//   - Toutes les requêtes (requests-import.json) ajoutées aux requêtes existantes du backup
//   - Tous les autres nodes du backup (absences, appState, audit, entretien, etc.)
//
// Usage : node merge-final.js /chemin/vers/cpas-backup-XXX.json
//
// Sortie : output/final-import.json à importer en UN SEUL replace sur
// `orgs/cpas-quaregnon`. Comme tout est dedans (anciennes données + nouveaux
// imports), rien n'est perdu.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');

const HERE = __dirname;
const OUT  = path.join(HERE, 'output');
const ORG_ID = 'cpas-quaregnon';

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage : node merge-final.js /chemin/vers/cpas-backup-XXX.json');
  process.exit(1);
}
if (!fs.existsSync(backupPath)) {
  console.error(`Fichier introuvable : ${backupPath}`);
  process.exit(1);
}

// Le backup est wrappé { orgs: { cpas-quaregnon: {...} } } par notre exporter.
// Tolère aussi les backups directs (sans wrapping).
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
let orgData;
if (backup?.orgs?.[ORG_ID]) {
  orgData = backup.orgs[ORG_ID];
} else if (backup?.appConfig || backup?.requests) {
  orgData = backup;
} else {
  console.error('Structure du backup non reconnue. Attendu :');
  console.error('  { orgs: { ' + ORG_ID + ': {...} } }');
  process.exit(1);
}

// Charger les fichiers générés par import.js
const newRequestsPath = path.join(OUT, 'requests-import.json');
const newThemesPath   = path.join(OUT, 'themes-add.json');
if (!fs.existsSync(newRequestsPath) || !fs.existsSync(newThemesPath)) {
  console.error('Fichiers manquants. Lance d\'abord `node import.js` pour les générer.');
  process.exit(1);
}
const newRequests = JSON.parse(fs.readFileSync(newRequestsPath, 'utf8'));
const newThemes   = JSON.parse(fs.readFileSync(newThemesPath, 'utf8'));

// Cloner orgData pour ne pas muter
const merged = JSON.parse(JSON.stringify(orgData));

// Fusionner les techThemes : existants + nouveaux
merged.appConfig = merged.appConfig || {};
const oldThemes = merged.appConfig.techThemes || {};
merged.appConfig.techThemes = { ...oldThemes, ...newThemes };

// Fusionner les requests : existantes (s'il y en avait) + nouvelles
const oldRequests = merged.requests || {};
merged.requests = { ...oldRequests, ...newRequests };

// Wrapper pour Firebase Console (l'import sur orgs/{orgId} attend ce contenu directement)
const finalContent = merged;

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

// Format 1 : contenu direct, à importer sur orgs/cpas-quaregnon
const finalPath = path.join(OUT, 'final-import.json');
fs.writeFileSync(finalPath, JSON.stringify(finalContent, null, 2));

// Format 2 : wrappé { cpas-quaregnon: {...} }, à importer sur le node `orgs/`
// Utile quand orgs/cpas-quaregnon n'existe pas encore (impossible de naviguer dessus).
const orgsWrappedPath = path.join(OUT, 'final-import-orgs.json');
fs.writeFileSync(orgsWrappedPath, JSON.stringify({ [ORG_ID]: finalContent }, null, 2));

const sizeMb = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(2);
console.log(`✓ ${finalPath} (${sizeMb} Mo)`);
console.log(`✓ ${orgsWrappedPath} (même contenu, wrappé pour import direct sur orgs/)`);
console.log('');
console.log('Contenu :');
console.log(`  - techThemes : ${Object.keys(oldThemes).length} existants + ${Object.keys(newThemes).length} nouveaux = ${Object.keys(merged.appConfig.techThemes).length}`);
console.log(`  - requests   : ${Object.keys(oldRequests).length} existantes + ${Object.keys(newRequests).length} nouvelles = ${Object.keys(merged.requests).length}`);
const otherNodes = Object.keys(merged).filter(k => k !== 'appConfig' && k !== 'requests');
console.log(`  - autres     : ${otherNodes.join(', ')}`);
console.log('');
console.log('Étape suivante (au choix selon ton état Firebase) :');
console.log('  A) Si orgs/' + ORG_ID + ' existe déjà :');
console.log('     Firebase Console → orgs/' + ORG_ID + ' → ⋮ → Import JSON → `final-import.json`');
console.log('  B) Si orgs/ existe mais est vide (cas après nettoyage) :');
console.log('     Firebase Console → orgs/ → ⋮ → Import JSON → `final-import-orgs.json`');
console.log('     (préserve superadmin/ qui est sibling)');
