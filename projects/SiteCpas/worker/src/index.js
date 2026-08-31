// ═══════════════════════════════════════════════════════════════════
// sitecpas-worker
// Phase 1  : /ping /version /health — squelette
// Phase 2  : POST /auth/login — customToken Firebase
// Phase 3  : POST /data/write — proxy CRUD avec autorisation + chiffrement
//            POST /data/decrypt — déchiffrement batch côté serveur
// ═══════════════════════════════════════════════════════════════════

import {
  parseServiceAccount, getAccessToken, createCustomToken,
  dbGet, dbSet, dbUpdate, dbPush, dbRemove,
} from './firebase.js';
import { requireAuth } from './auth-middleware.js';
import { isAuthorized } from './authz.js';
import { encryptForWrite, decryptForRead, isSensitiveLeaf } from './sensitive.js';
import { decryptString } from './crypto.js';

const ALLOWED_ORIGINS = [
  'https://cpasquaregnon.vercel.app',
  'https://cpasquaregnon-git-dev-hugohismans-5460s-projects.vercel.app',
  'http://localhost:5501',
  'http://127.0.0.1:5501',
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allow  = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  };
}

function json(data, request, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request),
      ...(init.headers || {}),
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Routes
    if (url.pathname === '/ping') {
      return json({ ok: true, pong: Date.now() }, request);
    }

    if (url.pathname === '/version') {
      return json({
        name:        'sitecpas-worker',
        version:     env.APP_VERSION || 'unknown',
        environment: env.ENVIRONMENT || 'unknown',
        ts:          Date.now(),
      }, request);
    }

    if (url.pathname === '/health') {
      return json({
        status:   'healthy',
        checks:   { worker: 'ok' },
        ts:       Date.now(),
      }, request);
    }

    if (url.pathname === '/') {
      return json({
        message: 'sitecpas-worker — Phase 3',
        routes:  ['/ping', '/version', '/health', 'POST /auth/login', 'POST /data/write', 'POST /data/decrypt'],
      }, request);
    }

    // ── Phase 2a : auth login ──────────────────────────────────────
    if (url.pathname === '/auth/login' && request.method === 'POST') {
      return handleAuthLogin(request, env);
    }
    // ── Phase 3 : création mdp (premier login / post-reset) ────────
    if (url.pathname === '/auth/set-password' && request.method === 'POST') {
      return handleAuthSetPassword(request, env);
    }

    // ── Phase 3bis : superadmin ────────────────────────────────────
    if (url.pathname === '/superadmin/login' && request.method === 'POST') {
      return handleSuperadminLogin(request, env);
    }

    // ── Phase 3bis : kiosk (non-authentifié + rate limit) ──────────
    if (url.pathname === '/kiosk/issue-ticket' && request.method === 'POST') {
      return handleKioskIssueTicket(request, env, corsHeaders(request));
    }

    // ── Phase 3 : CRUD proxy authentifié + chiffrement ────────────
    if (url.pathname === '/data/write' && request.method === 'POST') {
      return requireAuth(request, env, (req, e, auth) => handleDataWrite(req, e, auth, corsHeaders(request)));
    }
    if (url.pathname === '/data/decrypt' && request.method === 'POST') {
      return requireAuth(request, env, (req, e, auth) => handleDataDecrypt(req, e, auth, corsHeaders(request)));
    }

    return json({ error: 'not_found', path: url.pathname }, request, { status: 404 });
  },
};

// ═══════════════════════════════════════════════════════════════════
// Auth login — Phase 2a
// Body : { orgId, agentKey, password }
// Réponse succès : { customToken, agentKey, orgId, role }
// Erreurs : 400 bad_request, 401 invalid_credentials, 500 internal
// ═══════════════════════════════════════════════════════════════════
async function handleAuthLogin(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'bad_request', detail: 'invalid_json' }, request, { status: 400 }); }

  const orgId    = String(body.orgId || '').trim();
  const agentKey = String(body.agentKey || '').trim();
  const password = String(body.password || '');
  if (!orgId || !agentKey || !password) {
    return json({ error: 'bad_request', detail: 'missing_fields' }, request, { status: 400 });
  }
  // Garde-fou : orgId / agentKey = lowercase-alnum-dash uniquement
  if (!/^[a-z0-9-]+$/.test(orgId) || !/^[a-zA-Z0-9_-]+$/.test(agentKey)) {
    return json({ error: 'bad_request', detail: 'invalid_id_format' }, request, { status: 400 });
  }

  try {
    const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    const token = await getAccessToken(sa);

    // Lire le hash et le rôle de l'agent
    const dbUrl = env.FIREBASE_DB_URL;
    if (!dbUrl) throw new Error('FIREBASE_DB_URL var missing');

    const [storedHash, role] = await Promise.all([
      dbGet(dbUrl, `orgs/${orgId}/appConfig/agentPasswords/${agentKey}`, token),
      dbGet(dbUrl, `orgs/${orgId}/appConfig/agentRoles/${agentKey}`, token),
    ]);

    if (!storedHash) {
      return json({ error: 'invalid_credentials', detail: 'no_password_set' }, request, { status: 401 });
    }

    // Comparaison SHA-256 du password fourni vs hash stocké
    const enc    = new TextEncoder().encode(password);
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    // Comparaison constant-time
    if (!constantTimeEquals(hash, storedHash)) {
      return json({ error: 'invalid_credentials' }, request, { status: 401 });
    }

    const customToken = await createCustomToken(sa, agentKey, { orgId, role: role || null });
    return json({ customToken, agentKey, orgId, role: role || null }, request);
  } catch (e) {
    console.error('[auth/login] error', e?.message || e);
    return json({ error: 'internal', detail: e?.message || String(e) }, request, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — set-password (création du 1er mdp ou après reset admin)
// Body : { orgId, agentKey, password }
// Accept NON-authentifié car l'agent n'a pas encore de mdp.
// Refuse si agentPasswords/{key} existe déjà (donc remise à zéro admin
// est un prérequis). Si c'est le 1er agent à créer un mdp dans l'org,
// lui assigne automatiquement le rôle __admin__.
// ═══════════════════════════════════════════════════════════════════
async function handleAuthSetPassword(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'bad_request', detail: 'invalid_json' }, request, { status: 400 }); }

  const orgId    = String(body.orgId || '').trim();
  const agentKey = String(body.agentKey || '').trim();
  const password = String(body.password || '');
  if (!orgId || !agentKey || !password) {
    return json({ error: 'bad_request', detail: 'missing_fields' }, request, { status: 400 });
  }
  if (password.length < 4 || password.length > 200) {
    return json({ error: 'bad_request', detail: 'invalid_password_length' }, request, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(orgId) || !/^[a-zA-Z0-9_-]+$/.test(agentKey)) {
    return json({ error: 'bad_request', detail: 'invalid_id_format' }, request, { status: 400 });
  }

  try {
    const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    const accessToken = await getAccessToken(sa);
    const dbUrl = env.FIREBASE_DB_URL;
    if (!dbUrl) throw new Error('FIREBASE_DB_URL var missing');

    // Vérifier que l'agent existe
    const agentExists = await dbGet(dbUrl, `orgs/${orgId}/appConfig/agents/${agentKey}`, accessToken);
    if (!agentExists) {
      return json({ error: 'forbidden', detail: 'agent_not_found' }, request, { status: 403 });
    }

    // Refuser si mdp déjà défini
    const existingHash = await dbGet(dbUrl, `orgs/${orgId}/appConfig/agentPasswords/${agentKey}`, accessToken);
    if (existingHash) {
      return json({ error: 'forbidden', detail: 'password_already_set' }, request, { status: 403 });
    }

    // Hash + set
    const enc = new TextEncoder().encode(password);
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    await dbSet(dbUrl, `orgs/${orgId}/appConfig/agentPasswords/${agentKey}`, hash, accessToken);

    // Si aucun admin n'existe dans l'org → ce 1er est admin
    const roles = await dbGet(dbUrl, `orgs/${orgId}/appConfig/agentRoles`, accessToken);
    const hasAdmin = roles && Object.values(roles).includes('__admin__');
    let wasFirstAdmin = false;
    if (!hasAdmin) {
      await dbSet(dbUrl, `orgs/${orgId}/appConfig/agentRoles/${agentKey}`, '__admin__', accessToken);
      wasFirstAdmin = true;
    }

    // Audit
    try {
      await dbPush(dbUrl, `orgs/${orgId}/audit`, {
        ts:     Date.now(),
        action: 'agent.pwd.create',
        actor:  `agent:${agentKey}`,
        details: { agentKey, wasFirstAdmin },
        origin: 'worker',
      }, accessToken);
    } catch { /* non-fatal */ }

    return json({ ok: true, wasFirstAdmin }, request);
  } catch (e) {
    console.error('[auth/set-password] error', e?.message || e);
    return json({ error: 'internal', detail: e?.message || String(e) }, request, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — CRUD proxy générique avec autorisation + chiffrement auto
// Body : { op, path, value }
//   op : 'set' | 'update' | 'push' | 'remove'
//   path : relatif à orgs/{orgId}/ (jamais commence par /orgs/)
//   value : payload pour set/update/push (ignoré pour remove)
// Réponse : { ok: true, result? } ou { error, detail }
// ═══════════════════════════════════════════════════════════════════
const ALLOWED_OPS = ['set', 'update', 'push', 'remove'];

async function handleDataWrite(request, env, auth, cors) {
  let body;
  try { body = await request.json(); }
  catch { return jsonWithCors({ error: 'bad_request', detail: 'invalid_json' }, cors, 400); }

  const op    = String(body.op || '').trim();
  const path  = String(body.path || '').trim().replace(/^\/+|\/+$/g, '');
  const value = body.value;
  if (!ALLOWED_OPS.includes(op)) return jsonWithCors({ error: 'bad_request', detail: 'invalid_op' }, cors, 400);
  if (!path)                     return jsonWithCors({ error: 'bad_request', detail: 'missing_path' }, cors, 400);
  if (path.includes('..') || path.includes('//')) {
    return jsonWithCors({ error: 'bad_request', detail: 'invalid_path' }, cors, 400);
  }

  // Le superadmin peut écrire n'importe où (même hors /orgs/, ex:
  // /superadmin/onboardingToken, /superadmin/mascotTypes…). Le client
  // précise dans ce cas un path préfixé par "superadmin/" ou un
  // "orgs/<orgId>/…" absolu via { absolute: true }.
  const superMode = auth.raw?.superadmin === true;
  let absPath;
  if (superMode && body.absolute === true) {
    absPath = path;
  } else if (superMode && path.startsWith('superadmin/')) {
    absPath = path;
  } else {
    // Agent normal : orgId obligatoire dans les claims du token
    const orgId = auth.orgId;
    if (!orgId || !/^[a-z0-9-]+$/.test(orgId)) {
      return jsonWithCors({ error: 'unauthorized', detail: 'no_org_in_token' }, cors, 401);
    }
    // Vérifier autorisation par rules (path relatif à l'org). On passe
    // la value pour les règles qui inspectent son contenu (ex: agentRoles
    // self-set refuse __admin__).
    const check = isAuthorized(path, op, auth, value);
    if (!check.allowed) {
      console.warn('[data/write] denied', { uid: auth.uid, orgId, op, path, reason: check.reason });
      return jsonWithCors({ error: 'forbidden', detail: 'authz_denied', path, op }, cors, 403);
    }
    absPath = `orgs/${orgId}/${path}`;
  }

  try {
    const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    const accessToken = await getAccessToken(sa);
    const dbUrl = env.FIREBASE_DB_URL;
    if (!dbUrl) throw new Error('FIREBASE_DB_URL var missing');

    let result = null;

    if (op === 'remove') {
      await dbRemove(dbUrl, absPath, accessToken);
    } else {
      // Chiffrement automatique des champs sensibles
      const processed = await encryptForWrite(path, value, env);
      if (op === 'set')    result = await dbSet(dbUrl, absPath, processed, accessToken);
      if (op === 'update') result = await dbUpdate(dbUrl, absPath, processed, accessToken);
      if (op === 'push')   result = await dbPush(dbUrl, absPath, processed, accessToken);
    }

    // AUDIT signé côté serveur (append-only). Pour un superadmin on log
    // sous /superadmin/audit (hors orgs), sinon sous orgs/{orgId}/audit.
    try {
      const auditPath = superMode ? 'superadmin/audit' : `orgs/${auth.orgId}/audit`;
      await dbPush(dbUrl, auditPath, {
        ts:     Date.now(),
        action: `data.${op}`,
        actor:  superMode ? 'superadmin' : `agent:${auth.uid}`,
        details: { path, op, absPath, resKey: result?.name || null },
        origin: 'worker',
      }, accessToken);
    } catch (auditErr) {
      console.warn('[data/write] audit append failed (non-fatal)', auditErr?.message || auditErr);
    }

    return jsonWithCors({ ok: true, result }, cors, 200);
  } catch (e) {
    console.error('[data/write] error', e?.message || e);
    return jsonWithCors({ error: 'internal', detail: e?.message || String(e) }, cors, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3 — déchiffrement batch
// Body : { paths: [path, ...], items: [{ path, cipher }, ...] }
//   items (recommandé) : le client renvoie le ciphertext qu'il a déjà lu
//     depuis Firebase → déchiffrement direct, ZÉRO lecture serveur. Sur les
//     collections à plusieurs milliers d'entrées (requests), le mode "paths"
//     faisait un read Firebase par entrée : trop lent, et le batch entier
//     dépassait le plafond → plus rien ne se déchiffrait.
//   paths : mode historique (lecture Firebase du path puis déchiffrement),
//     conservé pour les clients pas encore à jour et pour les paths sans
//     ciphertext fourni. paths = chemins relatifs à orgs/{orgId}/, soit une
//     feuille sensible (ex "reservations/abc/comment"), soit un objet parent
//     (ex "reservations/abc") dont on déchiffre les champs sensibles.
// Réponse : { results: { path: plaintextValue | null } }
// ═══════════════════════════════════════════════════════════════════
const DECRYPT_MAX_PATHS  = 2000;   // plafond global d'un batch
const DECRYPT_MAX_READS  = 500;    // plafond des paths nécessitant un read Firebase
const DECRYPT_MAX_CIPHER = 20000;  // garde-fou taille d'un ciphertext

function normDecryptPath(p) {
  return String(p || '').replace(/^\/+|\/+$/g, '');
}

async function handleDataDecrypt(request, env, auth, cors) {
  let body;
  try { body = await request.json(); }
  catch { return jsonWithCors({ error: 'bad_request', detail: 'invalid_json' }, cors, 400); }

  // Ciphertexts fournis par le client, indexés par path normalisé.
  const cipherByPath = new Map();
  if (Array.isArray(body.items)) {
    for (const it of body.items) {
      if (!it || typeof it.path !== 'string' || typeof it.cipher !== 'string') continue;
      if (it.cipher.length > DECRYPT_MAX_CIPHER) continue;
      const rel = normDecryptPath(it.path);
      if (rel) cipherByPath.set(rel, it.cipher);
    }
  }

  // paths explicites, sinon on prend ceux des items.
  const paths = (Array.isArray(body.paths) && body.paths.length)
    ? body.paths
    : [...cipherByPath.keys()];
  if (!paths.length) return jsonWithCors({ error: 'bad_request', detail: 'empty_paths' }, cors, 400);
  if (paths.length > DECRYPT_MAX_PATHS) {
    return jsonWithCors({ error: 'bad_request', detail: 'too_many_paths' }, cors, 400);
  }

  // Les paths sans ciphertext fourni coûtent un read Firebase chacun : plafond bas.
  const needsRead = paths.filter(p => !cipherByPath.has(normDecryptPath(p)));
  if (needsRead.length > DECRYPT_MAX_READS) {
    return jsonWithCors({ error: 'bad_request', detail: 'too_many_paths' }, cors, 400);
  }

  const orgId = auth.orgId;
  if (!orgId) return jsonWithCors({ error: 'unauthorized', detail: 'no_org_in_token' }, cors, 401);

  try {
    const results = {};

    // ── 1) Ciphertexts fournis : déchiffrement direct, aucun read ──
    // On exige que le path soit une feuille sensible connue, pour ne pas
    // transformer l'endpoint en oracle de déchiffrement générique.
    for (const p of paths) {
      const rel = normDecryptPath(p);
      if (!cipherByPath.has(rel)) continue;
      if (!isSensitiveLeaf(rel)) { results[p] = null; continue; }
      try {
        results[p] = await decryptString(cipherByPath.get(rel), env);
      } catch (e) {
        console.warn('[data/decrypt] cipher failed', p, e?.message || e);
        results[p] = null;
      }
    }

    // ── 2) Reste : lecture Firebase puis déchiffrement (mode historique) ──
    if (needsRead.length) {
      const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
      const accessToken = await getAccessToken(sa);
      const dbUrl = env.FIREBASE_DB_URL;

      // Concurrence limitée à 20 reads en parallèle pour ne pas saturer.
      const queue = [...needsRead];
      async function worker() {
        while (queue.length) {
          const p = queue.shift();
          try {
            const pRel = normDecryptPath(p);
            if (!pRel) { results[p] = null; continue; }
            const raw = await dbGet(dbUrl, `orgs/${orgId}/${pRel}`, accessToken);
            results[p] = await decryptForRead(pRel, raw, env);
          } catch (e) {
            console.warn('[data/decrypt] path failed', p, e?.message || e);
            results[p] = null;
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(20, needsRead.length) }, () => worker()));
    }

    return jsonWithCors({ results }, cors, 200);
  } catch (e) {
    console.error('[data/decrypt] error', e?.message || e);
    return jsonWithCors({ error: 'internal', detail: e?.message || String(e) }, cors, 500);
  }
}

function jsonWithCors(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3bis — Superadmin login
// Body : { password }
// Réponse succès : { customToken } — contient claims { superadmin: true }.
// Le client signInWithCustomToken avec ce token → uid = "superadmin".
// Les routes /data/write et /superadmin/data/* reconnaissent ce claim
// et autorisent toutes les opérations.
// ═══════════════════════════════════════════════════════════════════
async function handleSuperadminLogin(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'bad_request', detail: 'invalid_json' }, request, { status: 400 }); }

  const password = String(body.password || '');
  if (!password) return json({ error: 'bad_request', detail: 'missing_password' }, request, { status: 400 });

  try {
    const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    const accessToken = await getAccessToken(sa);
    const dbUrl = env.FIREBASE_DB_URL;

    const storedHash = await dbGet(dbUrl, 'superadmin/passwordHash', accessToken);
    if (!storedHash) {
      return json({ error: 'forbidden', detail: 'not_configured' }, request, { status: 403 });
    }
    const enc = new TextEncoder().encode(password);
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (!constantTimeEquals(hash, storedHash)) {
      // Audit des échecs (anti-bruteforce observability)
      try {
        await dbPush(dbUrl, 'superadmin/audit', {
          ts: Date.now(),
          action: 'superadmin.login.failed',
          ip: request.headers.get('CF-Connecting-IP') || 'unknown',
          origin: 'worker',
        }, accessToken);
      } catch { /* non-fatal */ }
      return json({ error: 'invalid_credentials' }, request, { status: 401 });
    }

    const customToken = await createCustomToken(sa, 'superadmin', { superadmin: true });
    try {
      await dbPush(dbUrl, 'superadmin/audit', {
        ts: Date.now(),
        action: 'superadmin.login',
        ip: request.headers.get('CF-Connecting-IP') || 'unknown',
        origin: 'worker',
      }, accessToken);
    } catch { /* non-fatal */ }
    return json({ customToken }, request);
  } catch (e) {
    console.error('[superadmin/login] error', e?.message || e);
    return json({ error: 'internal', detail: e?.message || String(e) }, request, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 3bis — Kiosk issue ticket (borne publique, non-authentifiée)
// Body : { orgId, groupId, name? }
// Rate limit : 30 req/min par IP via un compteur in-memory simple
// (pas durable entre requests du même Worker instance, mais bon
// compromis pour un MVP anti-flood). Idéalement on utiliserait
// Cloudflare Rate Limiting API ou Durable Objects.
// ═══════════════════════════════════════════════════════════════════
const _kioskRate = new Map(); // ip → { count, resetAt }
const KIOSK_RATE_LIMIT = 30;  // 30 tickets/min/IP max
const KIOSK_RATE_WINDOW_MS = 60 * 1000;

function _kioskCheckRate(ip) {
  const now = Date.now();
  const cur = _kioskRate.get(ip);
  if (!cur || cur.resetAt < now) {
    _kioskRate.set(ip, { count: 1, resetAt: now + KIOSK_RATE_WINDOW_MS });
    return true;
  }
  if (cur.count >= KIOSK_RATE_LIMIT) return false;
  cur.count++;
  return true;
}

async function handleKioskIssueTicket(request, env, cors) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!_kioskCheckRate(ip)) {
    return jsonWithCors({ error: 'rate_limited', detail: 'max 30 tickets/min/ip' }, cors, 429);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonWithCors({ error: 'bad_request', detail: 'invalid_json' }, cors, 400); }

  const orgId   = String(body.orgId || '').trim();
  const groupId = String(body.groupId || '').trim();
  const name    = body.name ? String(body.name).trim().slice(0, 50) : null;
  if (!orgId || !groupId) {
    return jsonWithCors({ error: 'bad_request', detail: 'missing_fields' }, cors, 400);
  }
  if (!/^[a-z0-9-]+$/.test(orgId) || !/^[a-zA-Z0-9_-]+$/.test(groupId)) {
    return jsonWithCors({ error: 'bad_request', detail: 'invalid_id_format' }, cors, 400);
  }

  try {
    const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    const accessToken = await getAccessToken(sa);
    const dbUrl = env.FIREBASE_DB_URL;

    // Vérifier que la borne kiosk est activée pour l'org
    const features = await dbGet(dbUrl, `orgs/${orgId}/appConfig/features`, accessToken);
    if (!features || features.enableKiosk !== true) {
      return jsonWithCors({ error: 'forbidden', detail: 'kiosk_disabled' }, cors, 403);
    }
    // Vérifier que le groupe existe
    const group = await dbGet(dbUrl, `orgs/${orgId}/appConfig/queueGroups/${groupId}`, accessToken);
    if (!group) {
      return jsonWithCors({ error: 'not_found', detail: 'group_unknown' }, cors, 404);
    }

    const today = new Date().toISOString().slice(0, 10);
    const basePath = `orgs/${orgId}/queues/${today}`;

    // Incrémentation du compteur. Pas de transaction REST native —
    // on lit+écrit, risque théorique de double-numéro si 2 kiosques
    // incrémentent simultanément. Acceptable pour un CPAS (un seul
    // kiosque en pratique, et le rate limit bride la concurrence).
    const currentTick = await dbGet(dbUrl, `${basePath}/tick_${groupId}`, accessToken);
    const n = (parseInt(currentTick) || 0) + 1;

    const writes = {
      [`${basePath}/tick_${groupId}`]:       n,
      [`${basePath}/times_${groupId}/${n}`]: Date.now(),
    };
    if (name) writes[`${basePath}/names_${groupId}/${n}`] = name;

    // Multi-path update via root ref
    const r = await fetch(`${dbUrl.replace(/\/$/, '')}/.json`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body:    JSON.stringify(writes),
    });
    if (!r.ok) throw new Error(`multi-write ${r.status} ${await r.text()}`);

    // Audit
    try {
      await dbPush(dbUrl, `orgs/${orgId}/audit`, {
        ts: Date.now(),
        action: 'kiosk.ticket.issue',
        actor: `kiosk:${ip}`,
        details: { groupId, number: n, hasName: !!name },
        origin: 'worker',
      }, accessToken);
    } catch { /* non-fatal */ }

    // Format ticket : première lettre groupName + numéro
    const prefix = (group.name || 'T').trim().charAt(0).toUpperCase();
    const label  = `${prefix}${String(n).padStart(2, '0')}`;

    return jsonWithCors({ ok: true, label, number: n }, cors, 200);
  } catch (e) {
    console.error('[kiosk/issue-ticket] error', e?.message || e);
    return jsonWithCors({ error: 'internal', detail: e?.message || String(e) }, cors, 500);
  }
}

function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
