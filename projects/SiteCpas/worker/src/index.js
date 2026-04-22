// ═══════════════════════════════════════════════════════════════════
// sitecpas-worker — Phase 1 squelette
// Endpoints minimaux pour valider le routing et le déploiement.
// Phase 2+ ajoutera l'auth (Firebase Admin SDK + sessions) puis
// progressivement les endpoints CRUD qui remplaceront les accès
// directs client → Firebase.
// ═══════════════════════════════════════════════════════════════════

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
        message: 'sitecpas-worker — Phase 1 squelette',
        routes:  ['/ping', '/version', '/health'],
      }, request);
    }

    return json({ error: 'not_found', path: url.pathname }, request, { status: 404 });
  },
};
