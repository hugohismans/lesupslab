// ═══════════════════════════════════════════════════════════════════
// authz.js — règles d'autorisation côté Worker pour /data/write
//
// Deux niveaux de règles :
//  1. Règles "scoped" (match path exact avec :params) — utilisées pour
//     les cas où l'autorisation dépend de l'identité (ex: un agent ne
//     peut modifier que son propre mdp). Évaluées en PREMIER.
//  2. Règles "zone" (startsWith) — catch-all pour les collections
//     entières. Évaluées EN SECOND si aucune scoped rule ne matche.
//
// Path = chemin relatif à orgs/{orgId}/ (sans ce préfixe).
// ═══════════════════════════════════════════════════════════════════

// Match un pattern avec des :param. Ex: "reservations/:id"
function match(pattern, path) {
  const pp = pattern.split('/').filter(Boolean);
  const qp = path.split('/').filter(Boolean);
  if (pp.length !== qp.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i];
    if (p.startsWith(':')) params[p.slice(1)] = qp[i];
    else if (p !== qp[i]) return null;
  }
  return params;
}

function startsWithPath(prefix, path) {
  return path === prefix || path.startsWith(prefix + '/');
}

function isAdmin(auth)  { return auth.role === '__admin__' || auth.raw?.admin === true; }
function isSuperadmin(auth) { return auth.raw?.superadmin === true; }

const ALL_OPS = ['set', 'update', 'push', 'remove'];

// ── 1. SCOPED RULES — évaluées en premier ──────────────────────────
// Premier match gagne. Ne PAS faire de catch-all ici (le catch-all
// est dans ZONE_RULES).
const SCOPED_RULES = [
  // Mdp agent — agent lui-même OU admin
  { pattern: 'appConfig/agentPasswords/:agentKey',
    ops: ['set', 'remove'],
    check: (p, op, a) => isAdmin(a) || a.uid === p.agentKey },

  // Rôle agent :
  //  - admin : tout autorisé (assigner/retirer n'importe quel rôle à n'importe qui)
  //  - agent : set SON propre rôle UNIQUEMENT si la valeur n'est pas
  //    '__admin__' (anti auto-promotion). La règle autorise aussi le
  //    changement de rôle custom (Phase 3ter welcome.html flow).
  { pattern: 'appConfig/agentRoles/:agentKey',
    ops: ALL_OPS,
    check: (p, op, a, value) => {
      if (isAdmin(a)) return true;
      if (a.uid !== p.agentKey) return false;
      if (op === 'remove') return true; // l'agent peut retirer son rôle
      if (typeof value !== 'string') return false;
      if (value === '__admin__') return false;
      return true;
    }},
  { pattern: 'appConfig/agentPermRoles/:agentKey',
    ops: ALL_OPS,
    check: (p, op, a) => isAdmin(a) },

  // Paramètres perso de l'agent — lui ou l'admin
  { pattern: 'appConfig/agentColors/:agentKey',
    ops: ['set', 'remove'],
    check: (p, op, a) => isAdmin(a) || a.uid === p.agentKey },
  { pattern: 'appConfig/agentEmojis/:agentKey',
    ops: ['set', 'remove'],
    check: (p, op, a) => isAdmin(a) || a.uid === p.agentKey },
  { pattern: 'appConfig/agentGenders/:agentKey',
    ops: ['set', 'remove'],
    check: (p, op, a) => isAdmin(a) || a.uid === p.agentKey },
  { pattern: 'appConfig/agentPublicNames/:agentKey',
    ops: ['set', 'remove'],
    check: (p, op, a) => isAdmin(a) || a.uid === p.agentKey },
];

// ── 2. ZONE RULES — prefix-based, ordre important ──────────────────
// Une règle zone couvre tout sous-path à partir du prefix.
const ZONE_RULES = [
  // ── Zones agent (toute écriture OK si authentifié) ──
  { prefix: 'reservations',             ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'appState/bureaux',         ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'appState/appointmentRequests', ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'appState/preferredRequests',   ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'appState/preferredPending', ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'appState/lastCall',        ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'appState/lastCalls',       ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'appState',                 ops: ALL_OPS, check: (a) => !!a.uid }, // catch-all appState
  { prefix: 'queues',                   ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'queueHistory',             ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'agentStatus',              ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'notifications',            ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'requests',                 ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'planning',                 ops: ALL_OPS, check: (a) => !!a.uid },
  { prefix: 'absences',                 ops: ALL_OPS, check: (a) => !!a.uid },

  // Audit : append-only côté client (push seul autorisé)
  { prefix: 'audit',                    ops: ['push'], check: (a) => !!a.uid },

  // ── Zones admin ──
  // appConfig est admin-only par défaut (les scoped rules ci-dessus
  // ont déjà traité les sous-champs self-scope). Couvre aussi le
  // 'appConfig' exact (multi-path update sur l'objet parent).
  { prefix: 'appConfig',                ops: ALL_OPS, check: (a) => isAdmin(a) },
];

export function isAuthorized(path, op, auth, value) {
  // 0. Superadmin bypass : n'importe quel path, n'importe quelle op.
  if (isSuperadmin(auth)) return { allowed: true, rule: 'superadmin_bypass' };

  // 1. Scoped rules d'abord
  for (const rule of SCOPED_RULES) {
    const params = match(rule.pattern, path);
    if (!params) continue;
    if (!rule.ops.includes(op)) continue;
    try {
      if (rule.check(params, op, auth, value)) return { allowed: true, rule: rule.pattern };
      // Scoped match mais check refuse → ne pas tomber dans ZONE_RULES
      // (on ne veut pas qu'une règle zone plus large autorise ce qu'une
      // règle scoped spécifique refuse — principe deny-overrides-allow
      // pour les sous-champs sensibles).
      return { allowed: false, reason: 'scoped_denied', rule: rule.pattern };
    } catch { return { allowed: false, reason: 'scoped_error' }; }
  }

  // 2. Zone rules (prefix)
  for (const rule of ZONE_RULES) {
    if (!startsWithPath(rule.prefix, path)) continue;
    if (!rule.ops.includes(op)) continue;
    try {
      if (rule.check(auth)) return { allowed: true, rule: rule.prefix };
    } catch { /* fall through */ }
  }

  return { allowed: false, reason: 'no_matching_rule' };
}
