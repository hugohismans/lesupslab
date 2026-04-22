// ═══════════════════════════════════════════════════════════════════
// auth-middleware.js — vérification des ID Tokens Firebase côté Worker
// Phase 3 — utilisé par toutes les routes /data/*.
// ═══════════════════════════════════════════════════════════════════

import { jwtVerify, createRemoteJWKSet } from 'jose';

// JWK publiques Firebase — signées par Google pour les tokens
// d'Identity Platform (anciens Firebase Auth v1).
const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let _jwks = null;

function jwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  return _jwks;
}

// Vérifie un ID Token Firebase et retourne { uid, orgId, role, raw }.
// Throw si invalide / expiré / audience incorrecte.
export async function verifyIdToken(token, env) {
  const projectId = projectIdFromServiceAccount(env);
  if (!projectId) throw new Error('project_id missing in FIREBASE_SERVICE_ACCOUNT');

  const { payload } = await jwtVerify(token, jwks(), {
    issuer:   `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  const uid   = payload.sub || payload.user_id;
  const orgId = payload.orgId || null;
  const role  = payload.role  || null;
  if (!uid)   throw new Error('uid missing from token');

  return { uid, orgId, role, raw: payload };
}

// Extrait le token depuis Authorization: Bearer ...
export function extractBearer(request) {
  const h = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// Wrapper utilitaire : vérifie le token ou retourne 401. Sinon appelle
// le handler avec (request, env, authCtx).
export async function requireAuth(request, env, handler) {
  const token = extractBearer(request);
  if (!token) {
    return new Response(JSON.stringify({ error: 'unauthorized', detail: 'missing_bearer' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  let auth;
  try {
    auth = await verifyIdToken(token, env);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'unauthorized', detail: e?.message || 'invalid_token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  return handler(request, env, auth);
}

function projectIdFromServiceAccount(env) {
  try {
    const sa = typeof env.FIREBASE_SERVICE_ACCOUNT === 'string'
      ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
      : env.FIREBASE_SERVICE_ACCOUNT;
    return sa?.project_id || null;
  } catch { return null; }
}
