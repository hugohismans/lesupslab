// ═══════════════════════════════════════════════════════════════════
// auth.js — Authentification individuelle par agent
// ═══════════════════════════════════════════════════════════════════

(function () {
  const AUTH_KEY  = 'cpas_auth_v1';
  const AGENT_KEY = 'cpas_current_agent_key';
  const orgParam  = ORG_ID !== 'cpas-quaregnon' ? `?org=${ORG_ID}` : '';

  // ── Page app.html : vérifier la session ─────────────────────────
  if (!document.getElementById('stepAgent')) {
    if (sessionStorage.getItem(AUTH_KEY) !== '1') {
      location.href = `index.html${orgParam}`; return;
    }
    document.getElementById('btnLogout')?.addEventListener('click', function () {
      if (confirm('Se déconnecter ?')) {
        sessionStorage.removeItem(AUTH_KEY);
        sessionStorage.removeItem(AGENT_KEY);
        sessionStorage.removeItem('cpas_admin'); // compat legacy
        location.href = `index.html${orgParam}`;
      }
    });
    return;
  }

  // ── Page index.html ──────────────────────────────────────────────
  if (sessionStorage.getItem(AUTH_KEY) === '1') {
    location.href = `app.html${orgParam}`; return;
  }

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE);
  const db = firebase.database();

  // Phase 0 sécu : Firebase Anonymous Auth pour satisfaire les Rules
  // qui exigent auth != null sur /orgs/*. Sans ça, même la liste des
  // agents (nécessaire au login) est inaccessible.
  // authReady est une promise résolue quand l'auth anonyme est OK.
  const authReady = (firebase.auth
    ? firebase.auth().signInAnonymously()
        .then(cred => { console.log('%c[auth] 🔐 anonymous auth OK', 'color:#10b981;font-weight:bold', 'uid=', cred?.user?.uid); })
        .catch(err => console.error('[auth] 🔐 anonymous auth FAILED', err))
    : Promise.resolve());

  // ════════════════════════════════════════════════════════════════
  // Mascot bubble system
  // ════════════════════════════════════════════════════════════════
  let _mascotName = 'moncompagnon';
  let _bubbleTimer = null;

  function _showBubble(text) {
    const el = document.getElementById('loginMascotBubble');
    const tx = document.getElementById('loginMascotText');
    if (!el || !tx) return;
    tx.textContent = text;
    el.classList.remove('hidden', 'lm-bubble-in');
    void el.offsetWidth; // force reflow for transition
    el.classList.add('lm-bubble-in');
  }

  function _stopBubble() { clearInterval(_bubbleTimer); _bubbleTimer = null; }

  function _rotateBubble(phrases, ms = 8000) {
    _stopBubble();
    if (!phrases.length) return;
    let idx = 0;
    _showBubble(phrases[idx]);
    if (phrases.length > 1) {
      _bubbleTimer = setInterval(() => {
        idx = (idx + 1) % phrases.length;
        _showBubble(phrases[idx]);
      }, ms);
    }
  }

  // ── Phrase pools ────────────────────────────────────────────────
  const _phrasesAgent = () => [
    'Bonjour ! Clique sur ton prénom pour commencer ta journée 👋',
    'Qui est là aujourd\'hui ? Sélectionne ton nom pour te connecter 😊',
    genf('Content·e de te voir ! Choisis ton prénom dans la liste'),
    genf('Prêt·e pour une nouvelle journée ? Je suis là pour t\'aider 🌟'),
  ];

  const _phrasesLogin = name => [
    `Bon retour ${name} ! Entre ton mot de passe pour continuer 🔑`,
    `Plus qu'un mot de passe et tu es dans la place, ${name} !`,
    `Mot de passe oublié ? Le lien est juste en bas 👇`,
    `Hâte de travailler avec toi aujourd'hui, ${name} 😊`,
  ];

  const _phrasesFirstConn = (name, isAdmin) => {
    const phrases = [
      isAdmin
        ? genf(`${name}, tu es le·la premier·ère à te connecter — tu seras l'administrateur·ice de l'application ! 🏆`)
        : genf(`Bienvenue ${name} ! Je suis ${_mascotName}, ton assistant numérique — ravi·e de faire ta connaissance ! 🎉`),
      `Tu arrives au bon endroit, ${name} — on va faire du bon travail ensemble 🌟`,
      genf(`Première connexion — choisis un mot de passe que toi seul·e connais 🔐`),
      `${_mascotName} sera là pour t'aider chaque jour. Mais d'abord, sécurise ton compte !`,
    ];
    return phrases;
  };

  const _phrasesForgot = () => [
    `Pas de panique ! Ton admin peut réinitialiser ton mot de passe en deux clics 😊`,
    `Clique sur "Prévenir l'administrateur" et je m'occupe du reste ! 📨`,
    `Ça arrive à tout le monde d'oublier — l'admin est là pour ça 😄`,
  ];

  // ── Contact admin ───────────────────────────────────────────────
  async function _contactAdmin() {
    _stopBubble();
    _showBubble('Je préviens l\'administrateur pour toi ! 📬');
    const btn = document.getElementById('btnContactAdmin');
    if (btn) { btn.disabled = true; btn.textContent = '✓ Message envoyé'; }
    try {
      const rolesSnap = await db.ref(`orgs/${ORG_ID}/appConfig/agentRoles`).once('value');
      const roles = rolesSnap.val() || {};
      const adminKeys = Object.entries(roles).filter(([, r]) => r === '__admin__').map(([k]) => k);
      const agentName = _selectedAgent?.name;
      const msg = agentName
        ? `${agentName} a besoin d'aide pour se connecter — problème de mot de passe.`
        : `Un agent a besoin d'aide pour se connecter.`;
      const notif = { type: 'warn', message: msg, createdAt: Date.now(), readBy: null };
      if (adminKeys.length) {
        for (const key of adminKeys) {
          await db.ref(`orgs/${ORG_ID}/notifications`).push({ ...notif, targetAgentKey: key });
        }
      } else {
        await db.ref(`orgs/${ORG_ID}/notifications`).push({ ...notif, targetAgentKey: null });
      }
    } catch (e) { console.warn('[AUTH] contact admin failed', e); }
  }

  document.getElementById('btnContactAdmin')?.addEventListener('click', _contactAdmin);

  // ════════════════════════════════════════════════════════════════
  // Onboarding modal (première connexion — couleur + emoji)
  // ════════════════════════════════════════════════════════════════
  const OB_COLORS = [
    '#7c3aed', '#2563eb', '#0891b2', '#059669', '#ca8a04',
    '#dc2626', '#db2777', '#ea580c', '#64748b', '#1a3a5c',
  ];
  const OB_EMOJIS = [
    '😊','😎','🌟','💪','🦊','🐱','🐧','🦋','🌈','🍀',
    '🎯','🎨','🚀','🌻','🦁','🐸','🐼','🦉','🍕','☕',
  ];

  let _obColor    = null;
  let _obEmoji    = null;
  let _obGender   = null;
  let _obAgentKey = null;
  let _obAgentName = null;

  function _openOnboarding(key, name, isAdmin) {
    _obAgentKey  = key;
    _obAgentName = name;

    const modal = document.getElementById('onboardingModal');
    if (!modal) return;

    // Clone mascot SVG into onboarding (copy viewBox too)
    const src = document.getElementById('loginMascotSvg');
    const dst = document.getElementById('obMascotSvg');
    if (src && dst) {
      dst.innerHTML  = src.innerHTML;
      dst.setAttribute('viewBox', src.getAttribute('viewBox') || '0 0 100 118');
    }

    // Reset gender selection
    _obGender = null;

    // Mascot phrase
    const obText = document.getElementById('obBubbleText');
    if (obText) {
      obText.textContent = `Bonjour ${name} ! Avant tout, dis-moi comment t'appeler pour que je m'exprime correctement 🙂`;
    }

    // Build gender picker
    const genderEl = document.getElementById('obGender');
    if (genderEl) {
      genderEl.querySelectorAll('.lm-ob-gender-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.addEventListener('click', () => {
          genderEl.querySelectorAll('.lm-ob-gender-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          _obGender = btn.dataset.gender;
          if (typeof setGender === 'function') setGender(_obGender);
          // Mettre à jour le texte de la bulle selon le genre choisi
          if (obText) obText.textContent = genf(isAdmin
            ? `Parfait·e ! Maintenant, quelle couleur et quel emoji te ressemblent ?`
            : `Super ! Choisis une couleur et un emoji qui te correspondent 🎨`);
          _updateObConfirm();
        });
      });
    }

    // Build color picker
    const colorsEl = document.getElementById('obColors');
    if (colorsEl) {
      colorsEl.innerHTML = OB_COLORS.map(c =>
        `<button class="lm-ob-color" data-color="${c}" style="background:${c}" title="${c}" type="button"></button>`
      ).join('');
      colorsEl.querySelectorAll('.lm-ob-color').forEach(btn => {
        btn.addEventListener('click', () => {
          colorsEl.querySelectorAll('.lm-ob-color').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          _obColor = btn.dataset.color;
          _updateObConfirm();
        });
      });
    }

    // Build emoji picker
    const emojisEl = document.getElementById('obEmojis');
    if (emojisEl) {
      emojisEl.innerHTML = OB_EMOJIS.map(e =>
        `<button class="lm-ob-emoji" data-emoji="${e}" type="button">${e}</button>`
      ).join('');
      emojisEl.querySelectorAll('.lm-ob-emoji').forEach(btn => {
        btn.addEventListener('click', () => {
          emojisEl.querySelectorAll('.lm-ob-emoji').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          _obEmoji = btn.dataset.emoji;
          _updateObConfirm();
        });
      });
    }

    modal.classList.remove('hidden');

    // Confirm button
    const confirmBtn = document.getElementById('btnObConfirm');
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    newBtn.addEventListener('click', _confirmOnboarding);
  }

  function _updateObConfirm() {
    const btn = document.getElementById('btnObConfirm');
    if (!btn) return;
    btn.disabled = !(_obGender && _obColor && _obEmoji);
  }

  async function _confirmOnboarding() {
    const btn = document.getElementById('btnObConfirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

    try {
      // Save gender + color + emoji for this agent
      if (_obGender) {
        await db.ref(`orgs/${ORG_ID}/appConfig/agentGenders/${_obAgentKey}`).set(_obGender);
      }
      await db.ref(`orgs/${ORG_ID}/appConfig/agentColors/${_obAgentKey}`).set(_obColor);
      await db.ref(`orgs/${ORG_ID}/appConfig/agentEmojis/${_obAgentKey}`).set(_obEmoji);
    } catch (e) { console.warn('[AUTH] onboarding save failed', e); }

    // Mascot reaction phrase (genrée !)
    const obText = document.getElementById('obBubbleText');
    const reactions = [
      genf(`Très bon·ne choix, ${_obAgentName} ! On va passer de super moments ensemble 🎉`),
      `${_obEmoji} te ressemble bien ! J'adore — allons-y ! 🚀`,
      genf(`Parfait·e ${_obAgentName} ! Ton profil est prêt·e — bienvenue dans l'équipe 💜`),
    ];
    if (obText) obText.textContent = reactions[Math.floor(Math.random() * reactions.length)];

    // Close after a short delay and go to welcome intro
    setTimeout(() => {
      document.getElementById('onboardingModal')?.classList.add('hidden');
      sessionStorage.setItem(AUTH_KEY, '1');
      sessionStorage.setItem(AGENT_KEY, _obAgentKey);
      location.href = `welcome.html${orgParam}`;
    }, 2200);
  }

  // ════════════════════════════════════════════════════════════════
  // Org config load (name, logo, mascot)
  // ════════════════════════════════════════════════════════════════
  authReady.then(() => db.ref(`orgs/${ORG_ID}/appConfig`).once('value')).then(snap => {
    const cfg  = snap.val() || {};
    const meta = cfg.meta   || {};
    const name = meta.name  || ORG_ID;
    document.getElementById('loginTitle').textContent = name;
    document.title = `${name} — Connexion`;
    if (meta.logoUrl) {
      const img = document.getElementById('loginLogo');
      if (img) { img.src = meta.logoUrl; img.style.display = ''; }
    }
    // Appliquer la mascotte + récupérer son nom
    const mascotId = cfg.mascotId || 'poulpe';
    if (typeof _applyMascot === 'function') _applyMascot(mascotId);
    if (typeof MASCOTS !== 'undefined' && MASCOTS[mascotId]) {
      _mascotName = MASCOTS[mascotId].name;
    }
    // Démarrer les phrases d'accueil une fois le contexte connu
    _rotateBubble(_phrasesAgent());
  }).catch(() => {
    document.getElementById('loginTitle').textContent = ORG_ID;
    _rotateBubble(_phrasesAgent());
  });

  // ════════════════════════════════════════════════════════════════
  // Liste des agents
  // ════════════════════════════════════════════════════════════════
  let _agents = []; // [{ key, name }]
  let _selectedAgent = null;

  authReady.then(() => db.ref(`orgs/${ORG_ID}/appConfig/agents`).once('value')).then(snap => {
    const raw = snap.val();
    if (!raw) {
      document.getElementById('agentList').innerHTML =
        '<p style="color:#94a3b8;font-size:.85rem;text-align:center">Aucun agent configuré.<br>Contactez votre administrateur.</p>';
      return;
    }
    _agents = Object.entries(raw).map(([key, name]) => ({ key, name }));
    _renderAgentList();
  });

  function _renderAgentList(filter = '') {
    const container = document.getElementById('agentList');
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? _agents.filter(({ name }) => name.toLowerCase().includes(q))
      : _agents;

    if (!filtered.length) {
      container.innerHTML = `<p class="agent-search-empty">Aucun agent trouvé pour « ${_esc(filter)} »</p>`;
      return;
    }

    container.innerHTML = filtered.map(({ key, name }) => `
      <button class="agent-btn" data-key="${key}" data-name="${_esc(name)}">
        <span class="agent-btn-avatar">${name.charAt(0).toUpperCase()}</span>
        <span class="agent-btn-name">${_esc(name)}</span>
        <span class="agent-btn-arrow">›</span>
      </button>`).join('');

    container.querySelectorAll('.agent-btn').forEach(btn => {
      btn.addEventListener('click', () => _selectAgent(btn.dataset.key, btn.dataset.name));
    });
  }

  // Brancher le champ de recherche
  document.getElementById('agentSearch')?.addEventListener('input', function () {
    _renderAgentList(this.value);
  });

  async function _selectAgent(key, name) {
    _selectedAgent = { key, name };

    document.getElementById('selectedAgentBadge').innerHTML = `
      <span class="agent-btn-avatar">${name.charAt(0).toUpperCase()}</span>
      <strong>${_esc(name)}</strong>`;

    const snap = await db.ref(`orgs/${ORG_ID}/appConfig/agentPasswords/${key}`).once('value');
    const storedHash = snap.val();

    document.getElementById('stepAgent').classList.add('hidden');
    document.getElementById('stepPassword').classList.remove('hidden');

    if (storedHash) {
      _showLoginForm(storedHash, name);
    } else {
      _showCreateForm(key, name);
    }
  }

  function _showLoginForm(storedHash, agentName) {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('createPwdWrap').classList.add('hidden');
    const pwdInput = document.getElementById('password');
    const errMsg   = document.getElementById('loginErr');
    pwdInput.value = '';
    errMsg.classList.add('hidden');
    setTimeout(() => pwdInput.focus(), 80);

    // Bubble
    _rotateBubble(_phrasesLogin(agentName || _selectedAgent?.name || ''));

    const form = document.getElementById('loginForm');
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener('submit', async e => {
      e.preventDefault();
      const input = newForm.querySelector('#password');
      const err   = newForm.querySelector('#loginErr');
      const hash  = await sha256(input.value);
      if (hash === storedHash) {
        _loginSuccess(_selectedAgent.key);
      } else {
        err.classList.remove('hidden');
        input.select();
      }
    });

    // Mot de passe oublié
    newForm.querySelector('#btnForgotPwd')?.addEventListener('click', () => {
      _rotateBubble(_phrasesForgot());
      document.getElementById('forgotPwdModal').classList.remove('hidden');
    });
    document.getElementById('btnForgotClose')?.addEventListener('click', () => {
      document.getElementById('forgotPwdModal').classList.add('hidden');
      // Remettre les phrases login après fermeture
      _rotateBubble(_phrasesLogin(_selectedAgent?.name || ''));
    });
  }

  async function _showCreateForm(key, name) {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('createPwdWrap').classList.remove('hidden');
    document.getElementById('createPwdErr').classList.add('hidden');

    // Détecter si c'est le premier agent (→ super admin)
    const rolesSnap = await db.ref(`orgs/${ORG_ID}/appConfig/agentRoles`).once('value');
    const existingRoles = rolesSnap.val() || {};
    const isFirstAdmin = !Object.values(existingRoles).includes('__admin__');

    const infoEl = document.getElementById('createPwdInfo');
    if (isFirstAdmin) {
      infoEl.innerHTML = `Bienvenue ${_esc(name)} ! Vous êtes le <strong>premier administrateur</strong> — vous aurez accès à tous les paramètres.`;
      infoEl.style.borderLeftColor = '#ef4444';
    } else {
      infoEl.textContent = `Première connexion — choisissez votre mot de passe personnel.`;
      infoEl.style.borderLeftColor = '';
    }

    // Bubble pour première connexion
    _rotateBubble(_phrasesFirstConn(name, isFirstAdmin));

    setTimeout(() => document.getElementById('newPwd').focus(), 80);

    const btn = document.getElementById('createPwdBtn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
      const pwd     = document.getElementById('newPwd').value;
      const confirm = document.getElementById('newPwdConfirm').value;
      const errEl   = document.getElementById('createPwdErr');
      if (!pwd) return;
      if (pwd !== confirm) { errEl.classList.remove('hidden'); return; }
      errEl.classList.add('hidden');
      newBtn.disabled = true;
      newBtn.textContent = 'Création…';

      const hash = await sha256(pwd);
      await db.ref(`orgs/${ORG_ID}/appConfig/agentPasswords/${key}`).set(hash);

      // Premier admin : assigner le rôle __admin__ automatiquement
      if (isFirstAdmin) {
        await db.ref(`orgs/${ORG_ID}/appConfig/agentRoles/${key}`).set('__admin__');
      }

      // Réinitialiser le flag "tutorial vu" pour que le tuto repasse
      localStorage.removeItem(`mc_welcomed_${key}`);

      // Ouvrir l'onboarding de personnalisation
      _openOnboarding(key, name, isFirstAdmin);
    });
  }

  async function _loginSuccess(agentKey) {
    sessionStorage.setItem(AUTH_KEY, '1');
    sessionStorage.setItem(AGENT_KEY, agentKey);
    // Charger le genre sauvegardé et le mettre en session
    try {
      const gSnap = await db.ref(`orgs/${ORG_ID}/appConfig/agentGenders/${agentKey}`).once('value');
      const g = gSnap.val();
      if (g && typeof setGender === 'function') setGender(g);
    } catch (e) { /* silently ignore */ }
    location.href = `app.html${orgParam}`;
  }

  // Retour à la sélection d'agent
  document.getElementById('btnBackAgent').addEventListener('click', () => {
    _selectedAgent = null;
    _rotateBubble(_phrasesAgent());
    document.getElementById('stepPassword').classList.add('hidden');
    document.getElementById('stepAgent').classList.remove('hidden');
  });

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
