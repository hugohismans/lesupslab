// ═══════════════════════════════════════════════════════════════════
// authz.js — règles d'autorisation côté Worker pour /data/write
//
// Chaque règle reçoit { path, op, auth, env, value } et retourne true
// si l'opération est autorisée. Le premier match gagne.
// Path = chemin relatif à orgs/{orgId}/ (sans ce préfixe).
// ═══════════════════════════════════════════════════════════════════

// Match un pattern avec des :param. Ex: "reservations/:id"
// retourne { id: 'abc' } ou null si pas de match.
function match(pattern, path) {
  const pp = pattern.split('/').filter(Boolean);
  const qp = path.split('/').filter(Boolean);
  if (pp.length !== qp.length && !pattern.endsWith('/*')) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i];
    if (p === '*') return params;
    if (p.startsWith(':')) params[p.slice(1)] = qp[i];
    else if (p !== qp[i]) return null;
  }
  return params;
}

function matchPrefix(prefix, path) {
  return path === prefix || path.startsWith(prefix + '/');
}

// ── Rôle effectif de l'auth ─────────────────────────────────────────
// Pour l'instant on se base sur le claim role embarqué dans le token
// (mis lors de createCustomToken). Un tempAdminGrant actif sera ajouté
// dans une version future — les grants sont vérifiés côté DB mais
// pour la Phase 3 MVP on considère que le role embarqué au login suffit.
function isAdmin(auth)  { return auth.role === '__admin__' || auth.raw?.admin === true; }
function isSuper(auth)  { return auth.raw?.superadmin === true; }

// ── Liste des règles ────────────────────────────────────────────────
// Les règles plus spécifiques doivent venir avant les plus génériques.
// eslint-disable-next-line no-unused-vars
const RULES = [
  // ── Réservations : tout agent authentifié peut créer/modifier/supprimer
  // (le code métier côté client s'occupe de la cohérence). Le Worker
  // vérifie juste que l'op est autorisée à ce path par ce role.
  { pattern: 'reservations',              ops: ['push'],                    check: (p, op, a) => !!a.uid },
  { pattern: 'reservations/:id',          ops: ['set', 'update', 'remove'], check: (p, op, a) => !!a.uid },
  { pattern: 'reservations/:id/exceptions/:date', ops: ['set', 'remove'],   check: (p, op, a) => !!a.uid },

  // ── Appointment requests (RDV)
  { pattern: 'appState/appointmentRequests',       ops: ['push'],                      check: (p, op, a) => !!a.uid },
  { pattern: 'appState/appointmentRequests/:id',   ops: ['set', 'update', 'remove'],   check: (p, op, a) => !!a.uid },

  // ── État temps réel des bureaux (ouvert / pause / lastCall / etc.)
  { pattern: 'appState/bureaux/:localId',          ops: ['set', 'update', 'remove'],   check: (p, op, a) => !!a.uid },
  { pattern: 'appState/bureaux/:localId/:field',   ops: ['set', 'remove'],             check: (p, op, a) => !!a.uid },
  { pattern: 'appState/lastCall',                  ops: ['set'],                       check: (p, op, a) => !!a.uid },
  { pattern: 'appState/lastCalls/:localId',        ops: ['set'],                       check: (p, op, a) => !!a.uid },
  { pattern: 'appState/preferredPending/:localId', ops: ['set', 'remove'],             check: (p, op, a) => !!a.uid },

  // ── Files d'attente
  { pattern: 'queues/:date/:key',                  ops: ['set', 'update', 'remove'],   check: (p, op, a) => !!a.uid },
  { pattern: 'queues/:date/:key/:sub',             ops: ['set', 'remove'],             check: (p, op, a) => !!a.uid },
  { pattern: 'queueHistory/:date',                 ops: ['set', 'push'],               check: (p, op, a) => !!a.uid },

  // ── Statut agent du jour
  { pattern: 'agentStatus/:date/:agentKey',        ops: ['set', 'update', 'remove'],   check: (p, op, a) => !!a.uid },

  // ── Agent settings perso (mdp, couleur, emoji, genre, mascot pref)
  // L'agent peut modifier SON propre compte uniquement.
  // L'admin peut gérer n'importe qui.
  { pattern: 'appConfig/agentPasswords/:agentKey',
    ops: ['set', 'remove'],
    check: (p, op, a) => isAdmin(a) || a.uid === p.agentKey },
  { pattern: 'appConfig/agentColors/:agentKey',
    ops: ['set', 'remove'],
    check: (p, op, a) => isAdmin(a) || a.uid === p.agentKey },
  { pattern: 'appConfig/agentEmojis/:agentKey',
    ops: ['set', 'remove'],
    check: (p, op, a) => isAdmin(a) || a.uid === p.agentKey },
  { pattern: 'appConfig/agentGenders/:agentKey',
    ops: ['set', 'remove'],
    check: (p, op, a) => isAdmin(a) || a.uid === p.agentKey },
  { pattern: 'appConfig/agentRoles/:agentKey',
    ops: ['set', 'remove'],
    check: (p, op, a) => isAdmin(a) || a.uid === p.agentKey },
  { pattern: 'appConfig/mascotId',
    ops: ['set'],
    check: (p, op, a) => !!a.uid }, // tout agent peut changer la mascotte partagée (admin only si tu veux restreindre → à ajuster)
  { pattern: 'appConfig/agentPermRoles/:agentKey',
    ops: ['set', 'remove'],
    check: (p, op, a) => isAdmin(a) },

  // ── Reste de appConfig : admin uniquement
  { pattern: 'appConfig/*',                        ops: ['set', 'update', 'remove', 'push'], check: (p, op, a) => isAdmin(a) },

  // ── Notifications (envoi à d'autres agents, marquage lu, cleanup)
  { pattern: 'notifications/:agentKey',            ops: ['set', 'update', 'remove', 'push'], check: (p, op, a) => !!a.uid },
  { pattern: 'notifications/:agentKey/:notifId',   ops: ['set', 'update', 'remove'],         check: (p, op, a) => !!a.uid },

  // ── Requêtes techniques / interventions
  { pattern: 'requests',                           ops: ['push'],                      check: (p, op, a) => !!a.uid },
  { pattern: 'requests/:id',                       ops: ['set', 'update', 'remove'],   check: (p, op, a) => !!a.uid },

  // ── Planning
  { pattern: 'planning',                           ops: ['push'],                      check: (p, op, a) => !!a.uid },
  { pattern: 'planning/:taskId',                   ops: ['set', 'update', 'remove'],   check: (p, op, a) => !!a.uid },

  // ── Absences
  { pattern: 'absences',                           ops: ['push'],                      check: (p, op, a) => !!a.uid },
  { pattern: 'absences/:id',                       ops: ['set', 'update', 'remove'],   check: (p, op, a) => !!a.uid },

  // ── Audit : écriture en append-only (jamais modifier/supprimer côté client)
  { pattern: 'audit',                              ops: ['push'],                      check: (p, op, a) => !!a.uid },
];

export function isAuthorized(path, op, auth) {
  for (const rule of RULES) {
    const params = match(rule.pattern, path) || matchPrefixParams(rule.pattern, path);
    if (!params) continue;
    if (!rule.ops.includes(op)) continue;
    try {
      if (rule.check(params, op, auth)) return { allowed: true, rule: rule.pattern };
    } catch { /* fall through */ }
  }
  return { allowed: false };
}

function matchPrefixParams(pattern, path) {
  if (!pattern.endsWith('/*')) return null;
  const prefix = pattern.slice(0, -2);
  if (!matchPrefix(prefix, path)) return null;
  return {};
}
