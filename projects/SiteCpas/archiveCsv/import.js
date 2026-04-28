// ═══════════════════════════════════════════════════════════════════
// import.js — Convertit les CSV de l'ancien système en JSON Firebase
//
// Lit les 4 CSVs dans le dossier courant, applique les mappings, et
// produit 2 fichiers de sortie dans output/ :
//   - requests-import.json : à importer dans orgs/{orgId}/requests
//   - themes-add.json      : à importer dans orgs/{orgId}/appConfig/techThemes
//
// Usage : node import.js
// ═══════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const ORG_ID = 'cpas-quaregnon';
const HERE   = __dirname;
const OUT    = path.join(HERE, 'output');

// ── Conversion date Excel ────────────────────────────────────────
// Excel epoch : 1899-12-30 + n jours. Marche pour toutes les dates
// après 1900-03-01 (avant, le bug du leap-year 1900 fausserait).
function excelSerialToTs(serial) {
  const n = parseFloat(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
}

// ── Génère un id Firebase-style (push-key) ───────────────────────
// Pas le vrai algo Firebase mais un id unique compatible avec le pattern
// observable (-N + base64-ish chars). Suffisant pour des nouveaux thèmes.
function genFirebaseId(seed) {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `-N${ts}_${rnd}_${seed}`;
}

// ── Thèmes par défaut SiteCpas (seedés dans db.js:2870) ──────────
// On reproduit la liste pour pouvoir mapper sans accès Firebase live.
// Les ids sont synthétiques (le script génère un id unique pour chacun).
const DEFAULT_THEMES = [
  'Chauffage / Chaudière',
  'Plomberie (évier, toilette, fuite)',
  'Électricité',
  'Serrurerie / Clés',
  'Menuiserie (porte, fenêtre, meuble)',
  'Peinture / Revêtement',
  'Nettoyage ponctuel',
  'Informatique / Réseau',
  'Mobilier',
  'Sécurité / Alarme',
  'Espaces verts',
  'Autre',
];

// Mapping CSV "Nature" (raw) → label de thème SiteCpas (existant ou nouveau)
const THEME_MAP = {
  // Existants
  'plomberie':            'Plomberie (évier, toilette, fuite)',
  'sanitaire':            'Plomberie (évier, toilette, fuite)',
  'menuiserie':           'Menuiserie (porte, fenêtre, meuble)',
  'electricité':          'Électricité',
  'electricite':          'Électricité',
  'électricité':          'Électricité',
  'peinture':             'Peinture / Revêtement',
  'jardin / extérieur':   'Espaces verts',
  'jardin / exterieur':   'Espaces verts',
  'chauffage':            'Chauffage / Chaudière',
  // Nouveaux à créer (label canonique)
  'entretien général':    'Entretien général',
  'entretien general':    'Entretien général',
  'hvac':                 'HVAC',
  'cuisine':              'Cuisine',
  'buanderie - cuisine':  'Buanderie - Cuisine',
  'cogénération':         'Cogénération',
  'cogeneration':         'Cogénération',
  'cogengreen':           'Cogénération',
  'marchandises magasin': 'Marchandises magasin',
  'parc voitures':        'Parc voitures',
  'télécom.':             'Télécom',
  'telecom.':             'Télécom',
  'télécom':              'Télécom',
  'réunions':             'Réunions',
  'reunions':             'Réunions',
};

// ── État global du script ────────────────────────────────────────
const knownThemes = new Map();   // label → themeId
const newThemes   = {};          // themeId → { label, order }
const requests    = {};          // reqId → payload
const stats       = {
  parsed: 0, written: 0, errors: 0,
  byFile: {}, byTheme: {}, missingTheme: 0,
  templates: 0, ponctuelles: 0,
  withoutDate: 0, withoutDescription: 0,
};

// Initialiser les thèmes par défaut avec des ids synthétiques.
// Le seed dans db.js utilise des push() qui renvoient -N* — on a besoin
// d'ids stables pour pointer dessus depuis les requests.
DEFAULT_THEMES.forEach((label, i) => {
  knownThemes.set(label.toLowerCase(), { id: genFirebaseId(`def${i}`), label, order: i });
});

// ── Mapping helpers ──────────────────────────────────────────────
function normTheme(raw) {
  return String(raw || '').trim().toLowerCase();
}

function mapTheme(raw) {
  const norm = normTheme(raw);
  if (!norm) {
    stats.missingTheme++;
    return knownThemes.get('autre').id;
  }
  // Match direct sur le label canonique mappé
  const canonical = THEME_MAP[norm];
  if (canonical) {
    const lower = canonical.toLowerCase();
    if (knownThemes.has(lower)) return knownThemes.get(lower).id;
    // Créer le nouveau thème
    const id = genFirebaseId(`new_${stats.byTheme[canonical] || 0}`);
    const order = knownThemes.size;
    knownThemes.set(lower, { id, label: canonical, order });
    newThemes[id] = { label: canonical, order };
    return id;
  }
  // Fallback : essayer un match exact sur les défauts
  if (knownThemes.has(norm)) return knownThemes.get(norm).id;
  // Tout le reste → "Autre" (loggue pour visibilité)
  stats.missingTheme++;
  console.warn(`  [theme] inconnu : "${raw}" → "Autre"`);
  return knownThemes.get('autre').id;
}

function mapWorker(raw1, raw2, raw3) {
  const parts = [raw1, raw2, raw3]
    .map(s => String(s || '').trim())
    .filter(s => s && !/^\s*$/.test(s));
  if (!parts.length) return null;
  return parts.join(' + ');
}

function mapInitiator(raw) {
  const t = String(raw || '').trim();
  return t || null;
}

function mapSite(raw) {
  const t = String(raw || '').trim();
  // Normalisation casse minimale (cpas → CPAS, mrs → MRS) sinon on garde tel quel
  if (/^cpas$/i.test(t)) return 'CPAS';
  if (/^mrs$/i.test(t))  return 'MRS';
  return t;
}

// Détermine le préfixe d'org depuis le nom du fichier (cpas vs mrs).
// Les anciennes bases CPAS et MRS ont des numérotations indépendantes :
// le même ID source (T_P1333) peut désigner 2 requêtes complètement
// différentes selon l'org, donc on disambigue dans l'ID importé.
function orgPrefix(sourceFile) {
  return /^cpas/i.test(sourceFile) ? 'cpas' : 'mrs';
}

// ── Parse une ligne ponctuelle ───────────────────────────────────
function parsePonctuelle(row, sourceFile) {
  // Colonnes (ordre exact du header) :
  //  0: Numéro de la tâche (T_PXXXX)
  //  1: Date de création de la tâche (Excel serial)
  //  2: Nom de la personne initiatrice de la tâche
  //  3: Site de réalisation de la tâche
  //  4: Nature de la tâche
  //  5: Description de la tâche
  //  6: Date de début de la tâche (Excel serial)
  //  7: Durée estimée
  //  8: Nombre de personnes
  //  9: Service N°1 mandaté
  // 10: Service N°2 mandaté
  // 11: Service N°3 mandaté
  const sourceId = String(row[0] || '').trim();
  if (!sourceId || !/^T_P/i.test(sourceId)) return null; // skip lignes vides ou mal formées

  const description = String(row[5] || '').trim();
  if (!description) {
    stats.withoutDescription++;
    return null;
  }

  const createdAt = excelSerialToTs(row[1]);
  if (!createdAt) {
    stats.withoutDate++;
    // On garde quand même : on met createdAt à maintenant pour ne pas perdre la requête
  }

  const reqId = `import_${orgPrefix(sourceFile)}_${sourceId}`;
  const payload = {
    type:           'technique',
    description,
    local:          mapSite(row[3]) || null,
    urgent:         null,
    urgencyLevel:   3,
    fromAgentKey:   null,
    fromAgentName:  mapInitiator(row[2]),
    themeId:        mapTheme(row[4]),
    status:         'open',
    assignedTo:     null,
    assignedToName: null,
    assignedAt:     null,
    workerId:       null,
    workerBadge:    null,
    workerName:     mapWorker(row[9], row[10], row[11]),
    reopenAt:       null,
    createdAt:      createdAt || Date.now(),
    importSource:   { file: sourceFile, sourceId },
  };
  stats.ponctuelles++;
  return [reqId, payload];
}

// ── Parse une ligne récurrente ───────────────────────────────────
function parseRecurrente(row, sourceFile) {
  // Colonnes (ordre exact du header) :
  //  0: Numéro de la tâche (T_RXXX)
  //  1: Date de création de la tâche
  //  2: Nom initiatrice
  //  3: Site
  //  4: Nature de la tâche
  //  5: Description
  //  6: Prochaine date pour la tâche (Excel serial — = nextAt du template)
  //  7: Durée estimée
  //  8: Nombre de personnes
  //  9: Service mandaté
  // 10: Journée de la semaine (ignoré)
  // 11: Tâche réalisée toutes les X semaines
  // 12: Journée du mois (ignoré)
  // 13: Tâche émise tous les X mois
  const sourceId = String(row[0] || '').trim();
  if (!sourceId || !/^T_R/i.test(sourceId)) return null;

  const description = String(row[5] || '').trim();
  if (!description) {
    stats.withoutDescription++;
    return null;
  }

  const createdAt = excelSerialToTs(row[1]) || Date.now();
  const reqId = `import_${orgPrefix(sourceFile)}_${sourceId}`;

  // Récurrence : weeks > months en priorité
  let recurrence = null;
  const weeks  = parseInt(String(row[11] || '').trim(), 10);
  const months = parseInt(String(row[13] || '').trim(), 10);
  if (Number.isFinite(weeks) && weeks > 0) {
    recurrence = { unit: 'weeks', interval: weeks };
  } else if (Number.isFinite(months) && months > 0) {
    recurrence = { unit: 'months', interval: months };
  } else {
    console.warn(`  [recur] ${sourceId} : pas d'interval (semaines/mois vides) → import comme ponctuelle`);
  }

  let nextAt = excelSerialToTs(row[6]);
  if (recurrence) {
    if (!nextAt) {
      // Sans nextAt on ne peut pas planifier — calcule depuis createdAt + interval
      const d = new Date(createdAt);
      if (recurrence.unit === 'weeks')  d.setDate(d.getDate() + recurrence.interval * 7);
      if (recurrence.unit === 'months') d.setMonth(d.getMonth() + recurrence.interval);
      d.setHours(0, 0, 0, 0);
      nextAt = d.getTime();
    }
    recurrence.startDate  = null;
    recurrence.until      = null;
    recurrence.templateId = reqId; // self-template
    recurrence.nextAt     = nextAt;
  }

  const payload = {
    type:           'technique',
    description,
    local:          mapSite(row[3]) || null,
    urgent:         null,
    urgencyLevel:   3,
    fromAgentKey:   null,
    fromAgentName:  mapInitiator(row[2]),
    themeId:        mapTheme(row[4]),
    status:         'open',
    assignedTo:     null,
    assignedToName: null,
    assignedAt:     null,
    workerId:       null,
    workerBadge:    null,
    workerName:     mapWorker(row[9], null, null),
    reopenAt:       null,
    createdAt,
    importSource:   { file: sourceFile, sourceId },
  };
  if (recurrence) {
    payload.recurrence = recurrence;
    stats.templates++;
  } else {
    stats.ponctuelles++;
  }
  return [reqId, payload];
}

// ── Lecture d'un CSV ─────────────────────────────────────────────
function readCsv(filename, separator) {
  const content = fs.readFileSync(path.join(HERE, filename), 'utf8');
  const records = parse(content, {
    delimiter:        separator,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes:     true,
    bom:              true,
  });
  return records;
}

// ── Main ─────────────────────────────────────────────────────────
function main() {
  console.log('═══ Import CSV → Firebase JSON ═══\n');

  const FILES = [
    { file: 'CPASponctuel.csv',     sep: ',', parser: parsePonctuelle },
    { file: 'mrsponctuel.csv',      sep: ',', parser: parsePonctuelle },
    { file: 'CPASRecutentes.csv',   sep: ';', parser: parseRecurrente },
    { file: 'mrsRecurentes.csv',    sep: ';', parser: parseRecurrente },
  ];

  for (const { file, sep, parser } of FILES) {
    let rows;
    try { rows = readCsv(file, sep); }
    catch (e) {
      console.error(`  [error] lecture ${file}: ${e.message}`);
      stats.errors++;
      continue;
    }

    let count = 0;
    // skip header (row 0) et les lignes vides initiales
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      // Skip si toutes les colonnes sont vides
      if (row.every(c => String(c || '').trim() === '')) continue;
      stats.parsed++;
      try {
        const result = parser(row, file);
        if (!result) continue;
        const [reqId, payload] = result;
        if (requests[reqId]) {
          console.warn(`  [dup] ${reqId} déjà importé (${requests[reqId].importSource.file})`);
          stats.errors++;
          continue;
        }
        requests[reqId] = payload;
        count++;
        stats.byTheme[payload.themeId] = (stats.byTheme[payload.themeId] || 0) + 1;
      } catch (e) {
        console.error(`  [error] ligne ${i+1} de ${file}: ${e.message}`);
        stats.errors++;
      }
    }
    stats.byFile[file] = count;
    stats.written += count;
    console.log(`  ${file.padEnd(28)} → ${count} requêtes`);
  }

  // ── Préparer les fichiers de sortie ──
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

  // 1) requests
  const requestsPath = path.join(OUT, 'requests-import.json');
  fs.writeFileSync(requestsPath, JSON.stringify(requests, null, 2));
  console.log(`\n✓ ${requestsPath} — ${Object.keys(requests).length} requêtes`);

  // 2) thèmes nouveaux
  const themesPath = path.join(OUT, 'themes-add.json');
  fs.writeFileSync(themesPath, JSON.stringify(newThemes, null, 2));
  console.log(`✓ ${themesPath} — ${Object.keys(newThemes).length} nouveaux thèmes`);

  // 3) défauts (snapshot complet, en référence si la base est vide)
  const defaultThemesObj = {};
  for (const [, info] of knownThemes) {
    if (DEFAULT_THEMES.includes(info.label)) {
      defaultThemesObj[info.id] = { label: info.label, order: info.order };
    }
  }
  const defaultsPath = path.join(OUT, 'themes-defaults-reference.json');
  fs.writeFileSync(defaultsPath, JSON.stringify(defaultThemesObj, null, 2));
  console.log(`✓ ${defaultsPath} — référence des 12 thèmes par défaut (NE PAS importer si déjà présents)`);

  // ── Récap statistiques ──
  console.log('\n═══ Stats ═══');
  console.log(`  Lignes parsées      : ${stats.parsed}`);
  console.log(`  Requêtes générées   : ${stats.written}`);
  console.log(`    - ponctuelles     : ${stats.ponctuelles}`);
  console.log(`    - templates récur.: ${stats.templates}`);
  console.log(`  Erreurs / skips     : ${stats.errors}`);
  console.log(`  Sans description    : ${stats.withoutDescription}`);
  console.log(`  Sans date création  : ${stats.withoutDate}`);
  console.log(`  Thèmes manquants    : ${stats.missingTheme}`);
  console.log(`  Nouveaux thèmes créés: ${Object.keys(newThemes).length}`);
  console.log('\nPour importer dans Firebase :');
  console.log('  1. Console Firebase → Data → naviguer vers `orgs/' + ORG_ID + '/appConfig/techThemes`');
  console.log('     → bouton ⋮ → Importer JSON → choisir `output/themes-add.json` (FUSION : Firebase ne supprime rien)');
  console.log('  2. Naviguer vers `orgs/' + ORG_ID + '/requests`');
  console.log('     → bouton ⋮ → Importer JSON → choisir `output/requests-import.json`');
  console.log('  ⚠️  L\'import écrase le node ciblé : si tu as déjà des requêtes, assure-toi de les exporter avant.');
}

main();
