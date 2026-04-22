// ═══════════════════════════════════════════════════════════════════
// crypto.js — chiffrement field-level AES-GCM côté Worker
// Format : enc:v1:<nonceBase64>:<ciphertextBase64>
// Clé = ENCRYPTION_KEY secret (base64 de 32 bytes = AES-256).
// ═══════════════════════════════════════════════════════════════════

const PREFIX = 'enc:v1:';

let _keyCache = null;

async function _getKey(env) {
  if (_keyCache) return _keyCache;
  const raw = env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY secret missing');
  const bytes = _b64Decode(raw);
  if (bytes.length !== 32) throw new Error(`ENCRYPTION_KEY must be 32 bytes (got ${bytes.length})`);
  _keyCache = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return _keyCache;
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export async function encryptString(plaintext, env) {
  if (plaintext == null) return plaintext;
  const text = String(plaintext);
  if (text === '') return text;
  if (isEncrypted(text)) return text; // déjà chiffré (idempotent)

  const key = await _getKey(env);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, encoded));
  return `${PREFIX}${_b64Encode(nonce)}:${_b64Encode(ct)}`;
}

export async function decryptString(cipher, env) {
  if (!isEncrypted(cipher)) return cipher;
  const rest = cipher.slice(PREFIX.length);
  const [nonceB, ctB] = rest.split(':');
  if (!nonceB || !ctB) throw new Error('invalid_ciphertext_format');
  const key = await _getKey(env);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: _b64Decode(nonceB) }, key, _b64Decode(ctB),
  );
  return new TextDecoder().decode(pt);
}

// ── base64 helpers (URL-safe optionnel, ici standard) ───────────────
function _b64Encode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function _b64Decode(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
