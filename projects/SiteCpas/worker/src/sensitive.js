// ═══════════════════════════════════════════════════════════════════
// sensitive.js — déclare les champs à chiffrer au repos + helpers
// qui appliquent le chiffrement avant écriture Firebase.
//
// Règle : path (relatif à orgs/{orgId}/) + nom de champ.
// Si path pointe directement sur un champ sensible (ex :
// reservations/abc/note), la VALEUR entière est chiffrée.
// Si path pointe sur l'objet parent (push reservations, set
// reservations/abc, update reservations/abc), on inspecte l'objet
// pour chiffrer chaque champ sensible trouvé.
// ═══════════════════════════════════════════════════════════════════

import { encryptString, decryptString, isEncrypted } from './crypto.js';

// { pathPattern: [field, field, ...] }
// pathPattern = pattern d'objet parent
const SENSITIVE_FIELDS_BY_PARENT = [
  { pattern: /^reservations(\/[^/]+)?$/,                  fields: ['note'] },
  { pattern: /^appState\/appointmentRequests(\/[^/]+)?$/, fields: ['message'] },
  { pattern: /^requests(\/[^/]+)?$/,                      fields: ['description'] },
  { pattern: /^planning(\/[^/]+)?$/,                      fields: ['notes'] },
];

// Patterns qui matchent DIRECTEMENT un champ sensible (valeur scalaire à chiffrer).
const SENSITIVE_LEAF_PATTERNS = [
  /^reservations\/[^/]+\/note$/,
  /^appState\/appointmentRequests\/[^/]+\/message$/,
  /^requests\/[^/]+\/description$/,
  /^planning\/[^/]+\/notes$/,
];

export function isSensitiveLeaf(path) {
  return SENSITIVE_LEAF_PATTERNS.some(r => r.test(path));
}

function parentFieldsForPath(path) {
  for (const entry of SENSITIVE_FIELDS_BY_PARENT) {
    if (entry.pattern.test(path)) return entry.fields;
  }
  return null;
}

// Applique le chiffrement à la valeur à écrire.
// - Si le path est un leaf sensible → chiffre la valeur entière
// - Si le path matche un parent connu → parcourt l'objet et chiffre
//   les sous-champs sensibles (au 1er niveau uniquement pour simplicité)
// - Sinon → valeur inchangée
export async function encryptForWrite(path, value, env) {
  if (value == null) return value;
  if (isSensitiveLeaf(path)) {
    return typeof value === 'string' ? await encryptString(value, env) : value;
  }
  const fields = parentFieldsForPath(path);
  if (!fields || typeof value !== 'object' || Array.isArray(value)) return value;

  // Cas push (collection parente) : value = { autoKey: resa } peut arriver,
  // mais ici on passe déjà par un `.push()` Firebase → value = le new record.
  // On chiffre les champs sensibles de value directement.
  const out = { ...value };
  for (const f of fields) {
    if (typeof out[f] === 'string' && out[f].length > 0 && !isEncrypted(out[f])) {
      out[f] = await encryptString(out[f], env);
    }
  }
  return out;
}

// Déchiffre la valeur lue (utilisé par /data/decrypt).
export async function decryptForRead(path, value, env) {
  if (value == null) return value;
  if (isSensitiveLeaf(path)) {
    return typeof value === 'string' && isEncrypted(value) ? await decryptString(value, env) : value;
  }
  const fields = parentFieldsForPath(path);
  if (!fields || typeof value !== 'object' || Array.isArray(value)) return value;
  const out = { ...value };
  for (const f of fields) {
    if (typeof out[f] === 'string' && isEncrypted(out[f])) {
      out[f] = await decryptString(out[f], env);
    }
  }
  return out;
}
