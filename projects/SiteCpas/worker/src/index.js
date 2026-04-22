// ═══════════════════════════════════════════════════════════════════
// sitecpas-worker — Phase 2a auth endpoint
// /ping /version /health — squelette Phase 1
// /auth/login — Phase 2a : valide mdp agent + retourne customToken
// Phase 2b câblera le client (auth.js) sur cet endpoint.
// ═══════════════════════════════════════════════════════════════════

import { parseServiceAccount, getAccessToken, dbGet, createCustomToken } from './firebase.js';

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
        message: 'sitecpas-worker — Phase 2a',
        routes:  ['/ping', '/version', '/health', 'POST /auth/login'],
      }, request);
    }

    // ── Phase 2a : auth login ──────────────────────────────────────
    if (url.pathname === '/auth/login' && request.method === 'POST') {
      return handleAuthLogin(request, env);
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

function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
