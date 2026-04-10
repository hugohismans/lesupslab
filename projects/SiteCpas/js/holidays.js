// ═══════════════════════════════════════════════════════════════════
// holidays.js — Jours fériés belges
// ═══════════════════════════════════════════════════════════════════

// Calcul de Pâques (algorithme de Meeus/Jones/Butcher)
function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addD(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// Retourne un Set de strings "YYYY-MM-DD" pour les jours fériés belges de l'année donnée
function getBelgianHolidays(year) {
  const easter = easterDate(year);
  const fixed = [
    `${year}-01-01`, // Nouvel An
    `${year}-05-01`, // Fête du Travail
    `${year}-07-21`, // Fête Nationale
    `${year}-08-15`, // Assomption
    `${year}-11-01`, // Toussaint
    `${year}-11-11`, // Armistice
    `${year}-12-25`, // Noël
  ];
  const variable = [
    addD(easter,  1),  // Lundi de Pâques
    addD(easter, 39),  // Ascension
    addD(easter, 50),  // Lundi de Pentecôte
  ].map(d => isoDate(d));

  return new Set([...fixed, ...variable]);
}

// Vérifie si une date ISO est un jour férié belge
function isBelgianHoliday(dateStr) {
  const year = parseInt(dateStr.slice(0, 4));
  return getBelgianHolidays(year).has(dateStr);
}

// Nom du jour férié pour affichage
const HOLIDAY_NAMES = {
  '01-01': 'Nouvel An',
  '05-01': 'Fête du Travail',
  '07-21': 'Fête Nationale',
  '08-15': 'Assomption',
  '11-01': 'Toussaint',
  '11-11': 'Armistice',
  '12-25': 'Noël',
};

function getHolidayName(dateStr) {
  const year   = parseInt(dateStr.slice(0, 4));
  const mmdd   = dateStr.slice(5);
  if (HOLIDAY_NAMES[mmdd]) return HOLIDAY_NAMES[mmdd];
  const easter = easterDate(year);
  if (dateStr === isoDate(addD(easter,  1))) return 'Lundi de Pâques';
  if (dateStr === isoDate(addD(easter, 39))) return 'Ascension';
  if (dateStr === isoDate(addD(easter, 50))) return 'Lundi de Pentecôte';
  return 'Jour férié';
}
