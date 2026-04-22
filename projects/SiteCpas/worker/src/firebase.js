// ═══════════════════════════════════════════════════════════════════
// firebase.js — helpers Firebase Admin côté Worker
// - parseServiceAccount : parse le JSON du secret
// - getAccessToken : JWT RS256 → access_token OAuth2 pour Firebase REST
// - dbGet : GET REST https://{dbUrl}/{path}.json
// - createCustomToken : JWT RS256 signInWithCustomToken
// ═══════════════════════════════════════════════════════════════════

import { importPKCS8, SignJWT } from 'jose';

export function parseServiceAccount(raw) {
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT secret is empty');
  const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!sa.client_email || !sa.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT missing client_email/private_key');
  }
  return sa;
}

// Importe la clé privée RS256 depuis le PEM du service account
async function importKey(sa) {
  // Le JSON du service account peut avoir des \n littéraux — les normaliser
  const pem = sa.private_key.replace(/\\n/g, '\n');
  return importPKCS8(pem, 'RS256');
}

// Signe un JWT RS256 signé par le service account
async function signSa(sa, payload, { expSec = 3600 } = {}) {
  const key = await importKey(sa);
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + expSec)
    .sign(key);
}

// Récupère un access_token OAuth2 Google pour lire/écrire Firebase RTDB.
// Scope minimal : firebase.database (lecture/écriture RTDB).
// Durée : 1h — on ne cache pas pour Phase 2a (1 login/jour/agent, négligeable).
export async function getAccessToken(sa) {
  const AUD   = 'https://oauth2.googleapis.com/token';
  const scope = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';
  const jwt = await signSa(sa, { iss: sa.client_email, scope, aud: AUD }, { expSec: 3600 });

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion:  jwt,
  });
  const r = await fetch(AUD, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`OAuth2 token exchange failed: ${r.status} ${text}`);
  }
  const j = await r.json();
  return j.access_token;
}

// Lit un path Firebase RTDB via REST
export async function dbGet(dbUrl, path, accessToken) {
  const url = `${dbUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}.json`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Firebase REST get ${path} failed: ${r.status} ${text}`);
  }
  return await r.json(); // peut être null, string, object...
}

// PUT — remplace entièrement la valeur au path (équivalent .set()).
// Retourne la nouvelle valeur.
export async function dbSet(dbUrl, path, value, accessToken) {
  const url = `${dbUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}.json`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body:    JSON.stringify(value ?? null),
  });
  if (!r.ok) throw new Error(`dbSet ${path} ${r.status} ${await r.text()}`);
  return await r.json();
}

// PATCH — merge partiel (équivalent .update()).
export async function dbUpdate(dbUrl, path, value, accessToken) {
  const url = `${dbUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}.json`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body:    JSON.stringify(value || {}),
  });
  if (!r.ok) throw new Error(`dbUpdate ${path} ${r.status} ${await r.text()}`);
  return await r.json();
}

// POST — crée un nouvel enfant avec clé auto (équivalent .push()).
// Retourne { name: "-Nxxxx" } la clé générée.
export async function dbPush(dbUrl, path, value, accessToken) {
  const url = `${dbUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}.json`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body:    JSON.stringify(value ?? null),
  });
  if (!r.ok) throw new Error(`dbPush ${path} ${r.status} ${await r.text()}`);
  return await r.json(); // { name: "-NxxxxKey" }
}

// DELETE
export async function dbRemove(dbUrl, path, accessToken) {
  const url = `${dbUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}.json`;
  const r = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`dbRemove ${path} ${r.status} ${await r.text()}`);
  return null;
}

// Génère un customToken Firebase pour signInWithCustomToken côté client.
// uid = identifiant utilisateur Firebase (on utilise l'agentKey).
// claims = claims custom embarqués dans auth.token (ex: orgId, role).
export async function createCustomToken(sa, uid, claims = {}) {
  const AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
  const payload = {
    iss:    sa.client_email,
    sub:    sa.client_email,
    aud:    AUD,
    uid:    String(uid),
    claims: claims,
  };
  return await signSa(sa, payload, { expSec: 3600 });
}
