// ═══════════════════════════════════════════════════════════════════
// merge-themes.js — Fusionne les thèmes existants (backup) + nouveaux
//
// Usage : node merge-themes.js /chemin/vers/cpas-backup-XXX.json
//
// Sort dans output/themes-merged.json un objet contenant :
//   - les techThemes existants extraits du backup
//   - PLUS les nouveaux thèmes de output/themes-add.json
//
// Ce fichier fusionné est à importer sur appConfig/techThemes en remplacant
// (Firebase Console fait un REPLACE par défaut) — comme tout est dedans, on
// ne perd rien.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');

const HERE = __dirname;
const OUT  = path.join(HERE, 'output');

const ORG_ID = 'cpas-quaregnon';

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage : node merge-themes.js /chemin/vers/cpas-backup-XXX.json');
  process.exit(1);
}
if (!fs.existsSync(backupPath)) {
  console.error(`Fichier introuvable : ${backupPath}`);
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

// Le backup peut être structuré comme :
//   { orgs: { cpas-quaregnon: { appConfig: { techThemes: {...} } } } }
// OU simplement le contenu de orgs/cpas-quaregnon directement.
function findTechThemes(obj) {
  // Path 1 : root.orgs.<orgId>.appConfig.techThemes
  if (obj?.orgs?.[ORG_ID]?.appConfig?.techThemes) {
    return obj.orgs[ORG_ID].appConfig.techThemes;
  }
  // Path 2 : root.appConfig.techThemes (déjà scoped)
  if (obj?.appConfig?.techThemes) {
    return obj.appConfig.techThemes;
  }
  // Path 3 : root.techThemes (encore plus scoped)
  if (obj?.techThemes) {
    return obj.techThemes;
  }
  return null;
}

const existingThemes = findTechThemes(backup);
if (!existingThemes) {
  console.error('Aucun techThemes trouvé dans le backup. Structure attendue :');
  console.error('  orgs/' + ORG_ID + '/appConfig/techThemes/{themeId}');
  process.exit(1);
}

const newThemesPath = path.join(OUT, 'themes-add.json');
if (!fs.existsSync(newThemesPath)) {
  console.error(`Fichier introuvable : ${newThemesPath}`);
  console.error('Lance d\'abord `node import.js` pour le générer.');
  process.exit(1);
}
const newThemes = JSON.parse(fs.readFileSync(newThemesPath, 'utf8'));

// Fusion : les nouveaux écrasent les anciens si collision d'id (improbable
// vu que les nouveaux sont des -N* synthétiques uniques).
const merged = { ...existingThemes, ...newThemes };

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
const mergedPath = path.join(OUT, 'themes-merged.json');
fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2));

console.log(`✓ ${mergedPath}`);
console.log(`  ${Object.keys(existingThemes).length} thèmes existants (depuis backup)`);
console.log(`  + ${Object.keys(newThemes).length} nouveaux thèmes`);
console.log(`  = ${Object.keys(merged).length} thèmes au total`);
console.log('');
console.log('Étape suivante : Firebase Console → orgs/' + ORG_ID + '/appConfig/techThemes');
console.log('  → bouton ⋮ → Import JSON → choisir ce fichier `themes-merged.json`.');
console.log('  Le replace écrasera mais comme tout est dedans, rien n\'est perdu.');
