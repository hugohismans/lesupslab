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
// Logique de match :
//   - L'org de chaque CSV est inférée du nom de fichier :
//     "*cpas*" → org cpas, "*mrs*" → org mrs
//     (sinon : par majorité des Site dans le fichier)
//   - Pour chaque ponctuelle (T_P) importée :
//     - Si org a une CSV ouverte ET ID source dans la CSV → keepOpen=true (status reste 'open')
//     - Si org a une CSV ouverte ET ID source ABSENT      → status='done' (archivée)
//     - Si org n'a PAS de CSV ouverte                     → laissée 'open' inchangée
//   - Pour chaque récurrente (templateId === self) → keepOpen=true (toujours active)
//
// Sortie : output/requests-archived.json à importer en remplacement complet
// sur orgs/cpas-quaregnon/requests via Firebase Console.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');
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

  const result = { cpas: null, mrs: null }; // null = pas de CSV pour cet org → inchangé
  const seenHashes = new Set();

  for (const file of files) {
    const fullPath = path.join(OUVERTE_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    // Détection collision (fichiers identiques uploadés sous 2 noms)
    const hash = require('crypto').createHash('md5').update(content).digest('hex');

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

    let org = inferOrgFromFilename(file) || inferOrgFromContent(rows);
    if (!org) {
      console.warn(`  [skip] ${file} : impossible de déterminer l'org (nom + contenu ambigus)`);
      continue;
    }

    // Si même contenu déjà vu pour un autre org → warn (cas du doublon CPAS=MRS)
    if (seenHashes.has(hash)) {
      console.warn(`  [warn] ${file} a le même contenu qu'un autre fichier déjà chargé (doublon ?). On l'attribue à l'org "${org}".`);
    }
    seenHashes.add(hash);

    // Extraire les T_P IDs (ponctuelles)
    const ids = new Set();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;
      const id = String(row[0] || '').trim();
      if (/^T_[PR]\d+$/i.test(id)) ids.add(id);
    }

    // Si l'org a déjà été chargé, fusionne (merge des sets)
    if (result[org]) {
      ids.forEach(x => result[org].ids.add(x));
      result[org].files.push(file);
    } else {
      result[org] = { ids, files: [file] };
    }
    console.log(`  ${file.padEnd(30)} → org "${org}" : ${ids.size} ID(s) à garder ouvert`);
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
      console.log(`  ${org.toUpperCase()} : CSV trouvée (${ouverte[org].files.join(', ')}) — ${ouverte[org].ids.size} requêtes à garder`);
    } else {
      console.log(`  ${org.toUpperCase()} : pas de CSV ouverte → ponctuelles inchangées (toutes restent 'open')`);
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
    total:       0,
    recurrentes: 0,
    keptCpas:    0,
    archivedCpas:0,
    inchangéCpas:0,
    keptMrs:     0,
    archivedMrs: 0,
    inchangéMrs: 0,
    inconnu:     0,
  };

  for (const [reqId, payload] of Object.entries(requests)) {
    stats.total++;
    // Récurrente (template) → toujours keepOpen
    if (payload.recurrence && payload.recurrence.templateId === reqId) {
      payload.keepOpen = true;
      stats.recurrentes++;
      continue;
    }

    // Identifier l'org via le préfixe d'id : import_cpas_T_PXXX ou import_mrs_T_PXXX
    const m = reqId.match(/^import_(cpas|mrs)_(T_[PR]\d+)$/i);
    if (!m) {
      stats.inconnu++;
      continue; // id non standard, on touche pas
    }
    const org      = m[1].toLowerCase();
    const sourceId = m[2];

    const orgData = ouverte[org];
    if (!orgData) {
      // Pas de CSV pour cet org → laisser tel quel
      if (org === 'cpas') stats.inchangéCpas++; else stats.inchangéMrs++;
      continue;
    }

    if (orgData.ids.has(sourceId)) {
      // Match → garder ouverte
      payload.keepOpen = true;
      if (org === 'cpas') stats.keptCpas++; else stats.keptMrs++;
    } else {
      // Pas dans la liste ouverte → archiver
      payload.status = 'done';
      delete payload.keepOpen; // au cas où elle aurait été tagged précédemment
      if (org === 'cpas') stats.archivedCpas++; else stats.archivedMrs++;
    }
  }

  // ── Sortie ──
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
  const outputPath = path.join(OUT, 'requests-archived.json');
  fs.writeFileSync(outputPath, JSON.stringify(requests, null, 2));

  console.log('\n═══ Stats ═══');
  console.log(`  Total requêtes traitées : ${stats.total}`);
  console.log(`  Récurrentes (templates) → keepOpen : ${stats.recurrentes}`);
  console.log('');
  console.log(`  CPAS — gardées ouvertes  : ${stats.keptCpas}`);
  console.log(`  CPAS — archivées (done)  : ${stats.archivedCpas}`);
  console.log(`  CPAS — inchangées (no CSV): ${stats.inchangéCpas}`);
  console.log('');
  console.log(`  MRS  — gardées ouvertes  : ${stats.keptMrs}`);
  console.log(`  MRS  — archivées (done)  : ${stats.archivedMrs}`);
  console.log(`  MRS  — inchangées (no CSV): ${stats.inchangéMrs}`);
  console.log('');
  if (stats.inconnu) console.log(`  ⚠️  ${stats.inconnu} ID(s) non standard (préfixe non match)`);

  const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(`\n✓ ${outputPath} (${sizeMb} Mo)`);
  console.log('\nÉtape suivante :');
  console.log('  Firebase Console → orgs/cpas-quaregnon/requests');
  console.log('  → bouton ⋮ → Importer JSON → choisir `requests-archived.json`');
  console.log('  ⚠️  Replace : remplace toutes les requêtes par cette version mise à jour.');
  console.log('     Backup recommandé avant si tu as fait des modifs UI depuis l\'import.');
}

main();
