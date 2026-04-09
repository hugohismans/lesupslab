// ═══════════════════════════════════════════════════════════════════
// auth.js — Authentification par mot de passe partagé
// ═══════════════════════════════════════════════════════════════════

(function () {
  const KEY = 'cpas_auth_v1';

  function onLoginPage() { return !!document.getElementById('loginForm'); }

  if (onLoginPage()) {
    if (sessionStorage.getItem(KEY) === '1') { location.href = 'app.html'; return; }

    const form     = document.getElementById('loginForm');
    const pwdInput = document.getElementById('password');
    const errMsg   = document.getElementById('loginErr');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (pwdInput.value === CONFIG.APP_PASSWORD) {
        sessionStorage.setItem(KEY, '1');
        location.href = 'app.html';
      } else {
        errMsg.classList.remove('hidden');
        pwdInput.select();
      }
    });
    pwdInput.addEventListener('input', () => errMsg.classList.add('hidden'));

  } else {
    // Page app.html — vérifier l'auth
    if (sessionStorage.getItem(KEY) !== '1') { location.href = 'index.html'; }

    document.getElementById('btnLogout').addEventListener('click', function () {
      if (confirm('Se déconnecter ?')) {
        sessionStorage.removeItem(KEY);
        location.href = 'index.html';
      }
    });
  }
})();
