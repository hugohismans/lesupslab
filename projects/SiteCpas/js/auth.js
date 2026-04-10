// ═══════════════════════════════════════════════════════════════════
// auth.js — Authentification par mot de passe (hash Firebase)
// ═══════════════════════════════════════════════════════════════════

(function () {
  const KEY = 'cpas_auth_v1';

  // ── Page app.html : vérifier la session ──────────────────────────
  if (!document.getElementById('loginForm')) {
    if (sessionStorage.getItem(KEY) !== '1') { location.href = 'index.html'; return; }
    document.getElementById('btnLogout').addEventListener('click', function () {
      if (confirm('Se déconnecter ?')) {
        sessionStorage.removeItem(KEY);
        location.href = 'index.html';
      }
    });
    return;
  }

  // ── Page index.html ──────────────────────────────────────────────
  if (sessionStorage.getItem(KEY) === '1') { location.href = 'app.html'; return; }

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Init Firebase (lecture seule du hash)
  if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE);
  const db = firebase.database();

  const loginForm     = document.getElementById('loginForm');
  const pwdInput      = document.getElementById('password');
  const errMsg        = document.getElementById('loginErr');
  const createWrap    = document.getElementById('createPwdWrap');
  const createBtn     = document.getElementById('createPwdBtn');
  const createErr     = document.getElementById('createPwdErr');

  pwdInput.addEventListener('input', () => errMsg.classList.add('hidden'));

  db.ref('appConfig/appPasswordHash').once('value').then(snap => {
    const storedHash = snap.val();

    if (!storedHash) {
      // Aucun mot de passe configuré → mode création
      loginForm.classList.add('hidden');
      createWrap.classList.remove('hidden');

      createBtn.addEventListener('click', async () => {
        const pwd     = document.getElementById('newPwd').value;
        const confirm = document.getElementById('newPwdConfirm').value;
        if (!pwd) return;
        if (pwd !== confirm) { createErr.classList.remove('hidden'); return; }
        createErr.classList.add('hidden');
        createBtn.disabled = true;
        const hash = await sha256(pwd);
        await db.ref('appConfig/appPasswordHash').set(hash);
        sessionStorage.setItem(KEY, '1');
        location.href = 'app.html';
      });

    } else {
      // Mot de passe existant → mode connexion standard
      loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const inputHash = await sha256(pwdInput.value);
        if (inputHash === storedHash) {
          sessionStorage.setItem(KEY, '1');
          location.href = 'app.html';
        } else {
          errMsg.classList.remove('hidden');
          pwdInput.select();
        }
      });
    }
  }).catch(() => {
    errMsg.textContent = 'Impossible de contacter le serveur. Vérifiez votre connexion.';
    errMsg.classList.remove('hidden');
  });

})();
