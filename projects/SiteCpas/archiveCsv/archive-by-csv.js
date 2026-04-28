// ═══════════════════════════════════════════════════════════════════
// archive-by-csv.js — Marque comme 'done' les requêtes importées
// dont l'ID source n'apparaît PAS dans les CSVs "ouvertes".
//
// Usage : node archive-by-csv.js
//
// Lit :
//   - archiveCsv/ouverte/*.csv    (fichiers d'export "encore ouvertes")
//   - output/requests-import.json (les ~3280 requêtes déjà importées)
//
// Logique de match — UNIFORME pour T_P (ponctuelles) ET T_R (récurrentes) :
//   - L'org de chaque CSV est inférée du nom de fichier :
//     "*cpas*" → org cpas, "*mrs*" → org mrs
//     (sinon : par majorité des Site dans le fichier)
//   - Si org a une CSV ouverte :
//     - ID source dans la CSV → keepOpen=true (status reste 'open')
//     - ID source ABSENT      → status='done' (archivée)
//                               + pour les T_R (templates) : recurrence retirée
//                                 (empêche la génération de nouvelles occurrences)
//   - Si org n'a PAS de CSV ouverte → laissée 'open' inchangée
//
// Détection de fichiers doublons (md5 identique) → second fichier ignoré
// avec warning. Évite de polluer le matching sur la mauvaise org.
//
// Sortie : output/requests-archived.json à importer en remplacement complet
// sur orgs/cpas-quaregnon/requests via Firebase Console.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');

const HERE = __dirname;
const OUT  = path.join(HERE, 'output');
const OUVERTE_DIR = path.join(HERE, 'ouverte');

// ── Détection org depuis le nom du fichier ──────────────────────
function inferOrgFromFilename(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('mrs'))  return 'mrs';
  if (lower.includes('cpas')) return 'cpas';
  return null;
}

// Fallback : déduire de la majorité des Site dans le contenu
function inferOrgFromContent(rows) {
  const counts = { cpas: 0, mrs: 0 };
  rows.forEach(r => {
    const site = String(r[3] || '').trim().toUpperCase();
    if (site === 'MRS') counts.mrs++;
    else if (site) counts.cpas++; // tout le reste (CPAS, Roseraie, Magasin, ILA…) = CPAS-side
  });
  if (counts.mrs > counts.cpas) return 'mrs';
  if (counts.cpas > counts.mrs) return 'cpas';
  return null;
}

// ── Lecture des CSVs ouvertes ───────────────────────────────────
function loadOuverteCsvs() {
  if (!fs.existsSync(OUVERTE_DIR)) {
    console.error(`Dossier introuvable : ${OUVERTE_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(OUVERTE_DIR).filter(f => f.toLowerCase().endsWith('.csv'));
  if (!files.length) {
    console.error(`Aucun CSV dans ${OUVERTE_DIR}`);
    process.exit(1);
  }
  // Tri alphabétique pour rendre l'ordre déterministe (sinon readdirSync
  // peut donner un ordre différent selon l'OS / le système de fichiers)
  files.sort();

  const result = { cpas: null, mrs: null }; // null = pas de CSV pour cet org → inchangé
  const seenHashes = new Map();              // hash → nom du fichier déjà chargé

  for (const file of files) {
    const fullPath = path.join(OUVERTE_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const hash = crypto.createHash('md5').update(content).digest('hex');

    // Skip les doublons exacts (même md5 que fichier déjà chargé)
    if (seenHashes.has(hash)) {
      console.warn(`  [skip] ${file} : doublon exact de ${seenHashes.get(hash)} (md5 identique)`);
      continue;
    }
    seenHashes.set(hash, file);

    let rows;
    try {
      rows = parse(content, {
        delimiter:        [',', ';'],
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes:     true,
        bom:              true,
      });
    } catch (e) {
      console.warn(`  [skip] ${file} : parse error → ${e.message}`);
      continue;
    }

    const orgByName    = inferOrgFromFilename(file);
    const orgByContent = inferOrgFromContent(rows);

    // Garde-fou : si le nom dit "cpas" mais le contenu est MRS (ou inverse),
    // c'est un fichier mal nommé (cas vu : requestouvertecpas.csv contient
    // en fait des tâches MRS). On skip pour ne pas polluer le matching.
    if (orgByName && orgByContent && orgByName !== orgByContent) {
      console.warn(`  [skip] ${file} : nom suggère "${orgByName}" mais contenu suggère "${orgByContent}" — fichier mal nommé, ignoré`);
      continue;
    }

    const org = orgByName || orgByContent;
    if (!org) {
      console.warn(`  [skip] ${file} : impossible de déterminer l'org (nom + contenu ambigus)`);
      continue;
    }

    // Extraire les IDs (T_P et T_R sont traités uniformément)
    const ids = new Set();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;
      const id = String(row[0] || '').trim();
      if (/^T_[PR]\d+$/i.test(id)) ids.add(id);
      // (les headers sont skippés naturellement car "Numéro de la tâche" ne match pas le regex)
    }

    // Fusion si l'org a déjà été chargé via un autre fichier
    if (result[org]) {
      ids.forEach(x => result[org].ids.add(x));
      result[org].files.push(file);
    } else {
      result[org] = { ids, files: [file] };
    }

    // Compter T_P vs T_R pour le récap
    const tp = [...ids].filter(x => /^T_P/i.test(x)).length;
    const tr = [...ids].filter(x => /^T_R/i.test(x)).length;
    console.log(`  ${file.padEnd(30)} → org "${org}" : ${ids.size} ID(s) à garder (${tp} ponctuelles, ${tr} récurrentes)`);
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────────
function main() {
  console.log('═══ Archive par CSV ouvertes ═══\n');

  const ouverte = loadOuverteCsvs();

  console.log('\nÉtat des org :');
  ['cpas', 'mrs'].forEach(org => {
    if (ouverte[org]) {
      const tp = [...ouverte[org].ids].filter(x => /^T_P/i.test(x)).length;
      const tr = [...ouverte[org].ids].filter(x => /^T_R/i.test(x)).length;
      console.log(`  ${org.toUpperCase()} : CSV trouvée (${ouverte[org].files.join(', ')})`);
      console.log(`           ${ouverte[org].ids.size} à garder ouvert (${tp} T_P, ${tr} T_R)`);
    } else {
      console.log(`  ${org.toUpperCase()} : pas de CSV ouverte → ses requêtes seront laissées inchangées (toutes restent 'open')`);
    }
  });

  // ── Lire les requêtes importées ──
  const importPath = path.join(OUT, 'requests-import.json');
  if (!fs.existsSync(importPath)) {
    console.error(`\nFichier manquant : ${importPath}`);
    console.error('Lance d\'abord `node import.js` pour générer les requêtes.');
    process.exit(1);
  }
  const requests = JSON.parse(fs.readFileSync(importPath, 'utf8'));

  // ── Appliquer la logique d'archive ──
  const stats = {
    total:        0,
    keptCpasTp:   0, keptCpasTr:   0,
    archivedCpasTp: 0, archivedCpasTr: 0,
    inchangéCpas: 0,
    keptMrsTp:    0, keptMrsTr:    0,
    archivedMrsTp: 0, archivedMrsTr: 0,
    inchangéMrs:  0,
    inconnu:      0,
  };

  for (const [reqId, payload] of Object.entries(requests)) {
    stats.total++;

    // Identifier l'org + sourceId via le préfixe : import_cpas_T_PXXX ou import_mrs_T_RXXX
    const m = reqId.match(/^import_(cpas|mrs)_(T_[PR]\d+)$/i);
    if (!m) {
      stats.inconnu++;
      continue; // id non standard, on touche pas
    }
    const org      = m[1].toLowerCase();
    const sourceId = m[2];
    const isTp     = /^T_P/i.test(sourceId);

    const orgData = ouverte[org];
    if (!orgData) {
      // Pas de CSV pour cet org → laisser tel quel
      if (org === 'cpas') stats.inchangéCpas++; else stats.inchangéMrs++;
      continue;
    }

    if (orgData.ids.has(sourceId)) {
      // Match → garder ouverte
      payload.keepOpen = true;
      // S'assurer que status reste 'open' (au cas où re-run sur un fichier déjà archivé)
      if (payload.status !== 'open') payload.status = 'open';
      if (org === 'cpas') (isTp ? stats.keptCpasTp++ : stats.keptCpasTr++);
      else                (isTp ? stats.keptMrsTp++  : stats.keptMrsTr++);
    } else {
      // Pas dans la liste ouverte → archiver
      payload.status = 'done';
      delete payload.keepOpen;
      // Si c'est un template récurrent : retirer recurrence pour stopper la génération
      // (le scheduler ne reconnaît plus comme template)
      if (payload.recurrence) delete payload.recurrence;
      if (org === 'cpas') (isTp ? stats.archivedCpasTp++ : stats.archivedCpasTr++);
      else                (isTp ? stats.archivedMrsTp++  : stats.archivedMrsTr++);
    }
  }

  // ── Sortie ──
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
  const outputPath = path.join(OUT, 'requests-archived.json');
  fs.writeFileSync(outputPath, JSON.stringify(requests, null, 2));

  console.log('\n═══ Stats ═══');
  console.log(`  Total requêtes traitées : ${stats.total}`);
  console.log('');
  console.log(`  CPAS — gardées ouvertes : ${stats.keptCpasTp + stats.keptCpasTr} (${stats.keptCpasTp} T_P, ${stats.keptCpasTr} T_R)`);
  console.log(`  CPAS — archivées (done) : ${stats.archivedCpasTp + stats.archivedCpasTr} (${stats.archivedCpasTp} T_P, ${stats.archivedCpasTr} T_R)`);
  if (stats.inchangéCpas) console.log(`  CPAS — inchangées (pas de CSV) : ${stats.inchangéCpas}`);
  console.log('');
  console.log(`  MRS  — gardées ouvertes : ${stats.keptMrsTp + stats.keptMrsTr} (${stats.keptMrsTp} T_P, ${stats.keptMrsTr} T_R)`);
  console.log(`  MRS  — archivées (done) : ${stats.archivedMrsTp + stats.archivedMrsTr} (${stats.archivedMrsTp} T_P, ${stats.archivedMrsTr} T_R)`);
  if (stats.inchangéMrs) console.log(`  MRS  — inchangées (pas de CSV) : ${stats.inchangéMrs}`);
  console.log('');
  if (stats.inconnu) console.log(`  ⚠️  ${stats.inconnu} ID(s) non standard (préfixe non match)`);

  const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(`\n✓ ${outputPath} (${sizeMb} Mo)`);
  console.log('\nÉtape suivante :');
  console.log('  1. Backup d\'abord (Paramètres admin → ⬇ Exporter JSON)');
  console.log('  2. Firebase Console → orgs/cpas-quaregnon/requests');
  console.log('     → bouton ⋮ → Importer JSON → choisir `requests-archived.json`');
  console.log('  ⚠️  Replace : remplace toutes les requêtes par cette version mise à jour.');
}

main();
