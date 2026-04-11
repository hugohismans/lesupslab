// ═══════════════════════════════════════════════════════════════════
// mascot-brain.js — Cerveau réactif de la mascotte CPAS
// Machine à états contextuelle : file, heure, jour, équipe, événements
// ═══════════════════════════════════════════════════════════════════

/* ── Textes contextuels ─────────────────────────────────────────── */
const BRAIN_TEXTS = {
  idle: [
    "Tu veux un coup de main ? 😊",
    "Tout est calme... pour l'instant 🙂",
    "Je veille sur vous ! 💙",
    "Des questions ? Je suis là 🐙",
  ],
  monday: [
    "Lundi ! ☕ La semaine commence — je te fais un café imaginaire",
    "Bon lundi, courage ! On y va doucement 💪",
    "La semaine reprend — je suis là pour t'accompagner ! 🌅",
    "Lundi matin... ☕ Respire. Tu assures.",
  ],
  friday: [
    "Vendredi ! 🎉 La semaine s'est bien passée ?",
    "Plus que quelques heures... bon courage et bon week-end ! 🌈",
    "Vendredi soir — tu l'as mérité 🥳",
    "Allez, on tient jusqu'au bout ! Le week-end approche 🏁",
  ],
  early: [
    "Lève-tôt ! 🌙 Je suis encore en mode nuit moi...",
    "Tu arrives avant les oiseaux ? Café en priorité ☕",
    "Z... z... Hein ? Oh, te voilà déjà ! Bonjour ⏰",
    "Si tôt ? Tu es motivé·e ! 🌄",
  ],
  late: [
    "Il est tard... 🌙 Pense à rentrer !",
    "La journée se termine — bien mérité 😴",
    "Les lumières s'éteignent... prends soin de toi 🌙",
    "Dernière ligne droite — courage 🌟",
  ],
  stressed: [
    "La file s'allonge ! 😅 L'équipe est sur le pont !",
    "Beaucoup de monde aujourd'hui... courage à tous ! 💪",
    "Ouf ! Ça défile — mais vous gérez 🔥",
    "Ça bouge ! Vous assurez 💪",
  ],
  alarmed: [
    "⚠️ La file est très longue ! Renforts nécessaires ?",
    "😰 Situation tendue — vous avez besoin d'aide ?",
    "La file explose ! Que puis-je faire pour vous ? 🆘",
    "🚨 Beaucoup d'attente ! Tenez bon !",
  ],
  quiet: [
    "Journée tranquille... j'en profite pour méditer 🧘",
    "Pas grand monde aujourd'hui — le calme avant la tempête ? 👀",
    "Calme plat ⛵ Profitez pour souffler un peu !",
    "Aucune réservation pour l'instant... Je garde un œil 🐱",
  ],
  full_team: [
    "Toute l'équipe est là ! 🎉 Quelle belle journée en perspective !",
    "100% présents ! Vous êtes au complet — super équipe 💪",
    "Toutes les forces en présence — ça va dépoter ! 🌟",
    "L'équipe au complet, c'est la fête ! 🎊",
  ],
  december: [
    "Décembre est là ! ❄️ La magie de Noël approche...",
    "Il neige sur les dossiers... ❄️ Bon courage jusqu'aux fêtes !",
    "🎄 Plus que quelques jours avant les vacances — tiens bon !",
    "Ho ho ho ! 🎅 Joyeux mois de décembre !",
  ],
  celebrating: [
    "C'est réservé ! 🎉 Parfait !",
    "Réservation enregistrée — hop dans les livres ! 📅",
    "Voilà du bon travail ! ✅",
    "Une réservation de plus ! 🎊",
  ],
  curious: [
    "Psst... tout va bien ? Je suis là 👀",
    "Tu regardes quelque chose ? 🧐",
    "Un coup de main ? Je suis disponible 😊",
    "Je t'observe avec intérêt 🐙",
  ],
  bored: [
    "... *regarde par la fenêtre* 🌤️",
    "Tellement calme que j'ai compté mes tentacules — j'en ai 5 !",
    "Je me demande quel temps il fait dehors... 🌤️",
    "z... NON je dormais pas du tout. Que puis-je faire ? 😅",
    "*soupir* Des fois je compte les pixels... 🔢",
  ],
  hover: [
    "Oh ! Tu m'as vu ! 😊",
    "Coucou ! 👋",
    "Bonjour ! Je suis là !",
    "C'est moi, ta mascotte préférée 🐙",
  ],
  focus_start: [
    "Ok, je me tais ! Bonne concentration 🎯",
    "Je disparais dans les étoiles... revenez quand vous voulez 🌙",
    "Mode ninja activé — je ne dis plus rien 🤫",
    "Je vais faire une petite sieste pendant que tu travailles 😴",
    "Go go go ! Je t'observe en silence 👀",
  ],
  focus_end: [
    "Oh ! Te revoilà ! 🌟 Comment ça s'est passé ?",
    "*bâille* Waouh, déjà ? Bien dormi moi aussi 😴",
    "Bienvenue hors de la zone de concentration ! Ça a été ? 😊",
    "On reprend la vie normale ! Tu as été productif·ve ? ✨",
    "Retour parmi nous ! J'espère que tu as bien avancé 🎯",
  ],
  after_visit: "C'était sympa cette visite ! 😊 À bientôt les copains !",

  // Dialogues fête du week-end — multi-mascottes
  weekend_party: [
    [
      { speaker: 'host',    text: "OH ! C'est le week-end... 🎉 Regardez qui arrive pour fêter ça !" },
      { speaker: 'visitor', text: "C'est {g1Name} de {g1Org} ! On a entendu que vous finissez bientôt ! 🥳" },
      { speaker: 'host',    text: "ET {g2Name} de {g2Org} aussi ?! Quelle surprise ! 😱" },
      { speaker: 'visitor', text: "On fait jamais les choses à moitié ! Vive le week-end ! 🙌" },
      { speaker: 'host',    text: "VIVE LE WEEK-END ! 🎊 À lundi les amis !" },
      { speaker: 'visitor', text: "Profitez bien ! On vous laisse partir ! 👋✨" },
    ],
    [
      { speaker: 'visitor', text: "SURPRISE ! {g1Name} de {g1Org} débarque pour la fin de semaine ! 🎉" },
      { speaker: 'host',    text: "Nooooon ! {g1Name} ! ET {g2Name} aussi ? C'est la fête ! 🥳" },
      { speaker: 'visitor', text: "Le réseau moncompagnon est en mode week-end, baby ! 🕺" },
      { speaker: 'host',    text: "Vous êtes trop fous ! Ça fait du bien ! 😄" },
      { speaker: 'visitor', text: "Allez {hostName}, on te libère... profite bien ! 🌈" },
      { speaker: 'host',    text: "Vous aussi ! À la semaine prochaine ! 💙" },
    ],
    [
      { speaker: 'host',    text: "Qui c'est qui frappe à ma porte en fin d'après-midi ? 🚪" },
      { speaker: 'visitor', text: "C'EST {g1Name} ET {g2Name} ! On est là pour le décompte final ! ⏰" },
      { speaker: 'host',    text: "Ha ha ha ! La cavalerie est là ! 🎊" },
      { speaker: 'visitor', text: "Plus que quelques minutes... tu tiens ? 😄" },
      { speaker: 'host',    text: "Je tiens, je tiens ! Avec vous à côté c'est facile ! 💪" },
      { speaker: 'visitor', text: "Excellent week-end à toute l'équipe de {g1Org} ! On vous aime ! 💙" },
      { speaker: 'host',    text: "Pareil pour vous ! À la semaine prochaine les amis ! 🌟" },
    ],
  ],

  // Dialogues visiteur — [{ speaker: 'host'|'visitor', text }]
  visitor_dialogues: [
    [
      { speaker: 'visitor', text: "Bonjour ! Je suis {guestName}, la mascotte de {guestOrg} ! 🙌" },
      { speaker: 'host',    text: "Ah, {guestName} ! Quelle surprise ! Bienvenue à {hostOrg} ! 😊" },
      { speaker: 'visitor', text: "Ça baigne à {hostOrg} ?" },
      { speaker: 'host',    text: "On s'en sort ! Et à {guestOrg} ?" },
      { speaker: 'visitor', text: "Nickel ! Allez, je te laisse travailler. À bientôt ! 👋" },
      { speaker: 'host',    text: "À bientôt {guestName} ! Passe le bonjour 💙" },
    ],
    [
      { speaker: 'visitor', text: "Toc toc ! C'est {guestName} de {guestOrg} 🐾" },
      { speaker: 'host',    text: "ALORS ! Mais c'est {guestName} ! Entre, entre ! 🎉" },
      { speaker: 'visitor', text: "Je passais dans le coin... comment ça se passe par ici ?" },
      { speaker: 'host',    text: "L'équipe assure comme toujours 💪 Et chez vous ?" },
      { speaker: 'visitor', text: "Pareil ! On est des pros. Bon, à la prochaine ! 👋" },
      { speaker: 'host',    text: "Reviens quand tu veux {guestName} ! 🌟" },
    ],
    [
      { speaker: 'visitor', text: "Salut {hostName} ! {guestName} de {guestOrg} à l'appareil 📡" },
      { speaker: 'host',    text: "Salut {guestName} ! Quel bon vent t'amène ? 😄" },
      { speaker: 'visitor', text: "Je faisais la tournée du réseau moncompagnon — vous tenez le coup ?" },
      { speaker: 'host',    text: "On gère ! C'est quand même plus facile avec moncompagnon non ? 😊" },
      { speaker: 'visitor', text: "Tellement ! Bon, à très vite {hostName} 👋" },
      { speaker: 'host',    text: "Prends soin de toi {guestName} ! ✨" },
    ],
    [
      { speaker: 'visitor', text: "Coucou {hostName} ! {guestName} de {guestOrg} ici 🌤️" },
      { speaker: 'host',    text: "Ah {guestName} ! Quelle belle surprise du matin ! 🌟" },
      { speaker: 'visitor', text: "On se tient compagnie entre mascottes 😄 Comment va l'équipe ?" },
      { speaker: 'host',    text: "Elle est au top ! On fait du bon travail ensemble 💙" },
      { speaker: 'visitor', text: "C'est ça qui compte. À bientôt les ami·es ! 🤝" },
      { speaker: 'host',    text: "À bientôt {guestName} ! 💫" },
    ],
  ],
};

/* ── MascotBrain ─────────────────────────────────────────────────── */
const MascotBrain = {
  _state:        'idle',
  _priority:     99,
  _accessory:    null,
  _scanInterval: null,
  _bubbleTimeout: null,
  _idleTimer:    null,

  // ── Initialisation ─────────────────────────────────────────────
  init() {
    // Attendre que le DOM de la mascotte soit prêt
    const checkReady = () => {
      if (!document.querySelector('.hs-mascot-stage')) {
        setTimeout(checkReady, 200);
        return;
      }
      this._scan();
      this._scanInterval = setInterval(() => this._scan(), 30_000);
      this._scheduleVisit();
      this._bindInteractions();
    };
    checkReady();
  },

  // ── Helpers animation visiteur ─────────────────────────────────
  _showVisitor(el) {
    el.style.display = 'flex';
    el.classList.remove('ms-visitor-leave');
    // Double rAF pour laisser le navigateur calculer le display avant la transition
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('ms-visitor-enter');
    }));
  },
  _hideVisitor(el) {
    document.getElementById('msVisitorBubble')?.classList.add('hidden');
    el.classList.remove('ms-visitor-enter');
    el.classList.add('ms-visitor-leave');
    setTimeout(() => {
      el.style.display = 'none';
      el.classList.remove('ms-visitor-leave');
    }, 500);
  },

  // ── Scan contexte → choix état ─────────────────────────────────
  _scan() {
    if (this._state === 'concentrating' || this._state === 'visitor') return;
    const ctx    = this._buildContext();
    const chosen = this._resolveState(ctx);
    if (chosen.priority < this._priority || chosen.state !== this._state) {
      this._applyState(chosen.state, chosen.priority, chosen.accessory, chosen.bubbles);
    }
  },

  _buildContext() {
    const now = new Date();
    const h   = now.getHours();
    const dow = now.getDay();   // 0=dim … 6=sam
    const m   = now.getMonth() + 1;

    // File d'attente (tickets actifs)
    let queueTotal = 0;
    try {
      const q = window.DB?.getQueue?.() || {};
      queueTotal = Object.keys(q).length;
    } catch (_) {}

    // Présences agents
    let presenceCount = 0, totalAgents = 0;
    try {
      const agents = window.DB?.getAgents?.() || {};
      totalAgents  = Object.keys(agents).length;
      const pres   = window.DB?.getPresences?.() || {};
      presenceCount = Object.values(pres).filter(p => p === 'present').length;
    } catch (_) {}

    // Réservations aujourd'hui (estimation via occs)
    let todayBookings = 0;
    try {
      const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
      const endOfDay   = new Date(now); endOfDay.setHours(23,59,59,999);
      const occs = window.DB?.getInRange?.(startOfDay, endOfDay) || [];
      todayBookings = occs.length;
    } catch (_) {}

    return { h, dow, m, queueTotal, presenceCount, totalAgents, todayBookings };
  },

  _resolveState(ctx) {
    const { h, dow, m, queueTotal, presenceCount, totalAgents, todayBookings } = ctx;

    if (queueTotal >= 15)
      return { state:'alarmed',    priority:2,  accessory:'sweat',   bubbles: BRAIN_TEXTS.alarmed };
    if (queueTotal >= 9)
      return { state:'stressed',   priority:5,  accessory:'sweat',   bubbles: BRAIN_TEXTS.stressed };
    if (dow === 1 && h >= 7 && h < 10)
      return { state:'coffee',     priority:7,  accessory:'coffee',  bubbles: BRAIN_TEXTS.monday };
    if (dow === 5 && h >= 15)
      return { state:'happy',      priority:6,  accessory:'stars',   bubbles: BRAIN_TEXTS.friday };
    if (h < 7)
      return { state:'sleepy',     priority:8,  accessory:'moon',    bubbles: BRAIN_TEXTS.early };
    if (h >= 17)
      return { state:'sleepy',     priority:8,  accessory:'moon',    bubbles: BRAIN_TEXTS.late };
    if (todayBookings === 0 && h >= 9 && h < 17)
      return { state:'cozy',       priority:9,  accessory:null,      bubbles: BRAIN_TEXTS.quiet };
    if (totalAgents > 0 && presenceCount >= totalAgents)
      return { state:'happy',      priority:6,  accessory:'hearts',  bubbles: BRAIN_TEXTS.full_team };
    if (m === 12)
      return { state:'happy',      priority:10, accessory:'snow',    bubbles: BRAIN_TEXTS.december };

    return { state:'idle', priority:99, accessory:null, bubbles: BRAIN_TEXTS.idle };
  },

  // ── Appliquer un état ──────────────────────────────────────────
  _applyState(state, priority, accessory, bubbles) {
    this._state    = state;
    this._priority = priority;

    const stage = document.querySelector('.hs-mascot-stage');
    if (!stage) return;

    // Retirer anciens états ms-*
    const classes = Array.from(stage.classList).filter(c => c.startsWith('ms-'));
    classes.forEach(c => stage.classList.remove(c));
    if (state !== 'idle') stage.classList.add(`ms-${state}`);

    this._setAccessory(accessory);

    // Bulle contextuelle (phrase aléatoire)
    if (bubbles?.length && state !== 'idle') {
      const text = bubbles[Math.floor(Math.random() * bubbles.length)];
      window.HOME?._showBubble?.(text);
    }

    // Auto-retour idle après 12 secondes (sauf alarme + visiteur + concentration)
    clearTimeout(this._bubbleTimeout);
    if (state !== 'alarmed' && state !== 'visitor' && state !== 'concentrating') {
      this._bubbleTimeout = setTimeout(() => {
        if (this._state === state) this._applyState('idle', 99, null, []);
      }, 12_000);
    }
  },

  // ── Accessoires ────────────────────────────────────────────────
  _setAccessory(id) {
    const stage = document.querySelector('.hs-mascot-stage');
    if (!stage) return;
    stage.querySelector('.ms-acc-container')?.remove();
    if (!id || !MASCOT_ACCESSORIES[id]) return;

    const div = document.createElement('div');
    div.className = `ms-acc-container ms-acc-${id}`;
    div.innerHTML = MASCOT_ACCESSORIES[id];
    stage.appendChild(div);
  },

  // ── Triggers événementiels ─────────────────────────────────────
  triggerCelebrate(text) {
    const msg = text || BRAIN_TEXTS.celebrating[0];
    this._applyState('celebrating', 3, 'stars', [msg]);
  },

  triggerAgentArrived(name) {
    const text = `${name} est arrivé·e ! La journée peut commencer 🎉`;
    this._applyState('excited', 4, 'sparkles', [text]);
  },

  // ── Interactions utilisateur ───────────────────────────────────
  _bindInteractions() {
    const resetIdle = () => {
      clearTimeout(this._idleTimer);
      if (this._state === 'bored' || this._state === 'curious') {
        this._applyState('idle', 99, null, []);
      }
      this._idleTimer = setTimeout(() => {
        if (this._priority >= 10 && this._state !== 'concentrating' && this._state !== 'visitor') {
          this._applyState('curious', 10, 'thought', BRAIN_TEXTS.curious);
          setTimeout(() => {
            if (this._state === 'curious') {
              this._applyState('bored', 10, 'thought', BRAIN_TEXTS.bored);
            }
          }, 90_000);
        }
      }, 30_000);
    };
    document.addEventListener('mousemove', resetIdle, { passive: true });
    document.addEventListener('click',     resetIdle, { passive: true });
    document.addEventListener('keydown',   resetIdle, { passive: true });

    // Hover sur la mascotte
    const stage = document.querySelector('.hs-mascot-stage');
    stage?.addEventListener('mouseenter', () => {
      if (this._priority >= 12 && this._state !== 'concentrating') {
        this._applyState('waving', 12, null, BRAIN_TEXTS.hover);
      }
    });
  },

  // ── Mode concentration ─────────────────────────────────────────
  enterFocus() {
    const ctx = this._buildContext();
    let text = BRAIN_TEXTS.focus_start[Math.floor(Math.random() * BRAIN_TEXTS.focus_start.length)];
    if (ctx.dow === 1 && ctx.h < 10)  text = "Allez, café avalé, concentration lancée ! ☕🎯";
    if (ctx.queueTotal >= 5)          text = "Bonne idée de souffler — focus, tu gères ! 🎯";
    if (ctx.h >= 16)                  text = "Dernier effort, je m'éclipse — allez ! 🌙";

    window.HOME?._showBubble?.(text);
    this._state    = 'concentrating';
    this._priority = 0;
    clearInterval(this._scanInterval);
    clearTimeout(this._bubbleTimeout);

    setTimeout(() => {
      // Masquer la bulle
      const bubble = document.getElementById('hsMascotBubble');
      if (bubble) bubble.classList.add('hidden');

      const stage = document.querySelector('.hs-mascot-stage');
      if (stage) {
        Array.from(stage.classList).filter(c => c.startsWith('ms-')).forEach(c => stage.classList.remove(c));
        stage.classList.add('ms-concentrating');
      }
      this._setAccessory('moon');
      this._showFocusBadge(true);
    }, 2_200);
  },

  exitFocus() {
    clearTimeout(this._bubbleTimeout);
    const stage = document.querySelector('.hs-mascot-stage');
    if (stage) stage.classList.remove('ms-concentrating');
    this._showFocusBadge(false);
    this._setAccessory(null);

    const text = BRAIN_TEXTS.focus_end[Math.floor(Math.random() * BRAIN_TEXTS.focus_end.length)];
    this._state    = 'idle';
    this._priority = 99;
    window.HOME?._showBubble?.(text);

    // Reprendre le scan
    this._scanInterval = setInterval(() => this._scan(), 30_000);
    setTimeout(() => this._scan(), 500);
  },

  _showFocusBadge(show) {
    let badge = document.getElementById('msFocusBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'msFocusBadge';
      badge.className = 'ms-focus-badge';
      badge.textContent = '🎯 Mode concentration — cliquer pour reprendre';
      badge.addEventListener('click', () => this.exitFocus());
      // Insérer après les boutons de la mascotte
      const btns = document.querySelector('.hs-mascot-btns');
      if (btns) btns.after(badge);
      else document.querySelector('.hs-mascot-stage')?.after(badge);
    }
    badge.style.display = show ? '' : 'none';
  },

  // ── Bouton "Inviter mes amis" ──────────────────────────────────
  async triggerParty() {
    if (this._state === 'alarmed' || this._state === 'concentrating' || this._state === 'visitor') {
      window.HOME?._showBubble?.("Pas maintenant... une prochaine fois ! 😅");
      return;
    }
    // Feedback immédiat
    window.HOME?._showBubble?.("Je lance les invitations... 📨🎉");

    try {
      const snap = await firebase.database().ref('superadmin/orgDirectory').once('value');
      const dir  = snap.val();
      if (!dir) { window.HOME?._showBubble?.("Aucun ami connecté pour l'instant... 😢"); return; }

      const currentOrgId = window.CONFIG?.ORG_ID || '';
      const others = Object.entries(dir)
        .filter(([id, d]) => id !== currentOrgId && d.visitsEnabled !== false)
        .map(([, data]) => data);

      if (!others.length) { window.HOME?._showBubble?.("Personne de disponible en ce moment 😢"); return; }

      // Choisir 1 à 3 invités selon disponibilité
      const shuffled = others.sort(() => Math.random() - 0.5);
      const guests   = shuffled.slice(0, Math.min(3, shuffled.length));

      sessionStorage.setItem('mc_visit_done', '1'); // marquer pour éviter doublon auto
      setTimeout(() => {
        if (guests.length >= 2) this._startWeekendParty(guests);
        else this._startVisit(guests[0]);
      }, 1500);
    } catch (_) {
      window.HOME?._showBubble?.("Impossible de contacter mes amis... 😢");
    }
  },

  // ── Visites inter-org ──────────────────────────────────────────
  _scheduleVisit() {
    if (sessionStorage.getItem('mc_visit_done')) return;
    const now  = new Date();
    const dow  = now.getDay();
    const h    = now.getHours();

    // Vendredi après-midi : visite de fête possible dès 14h30
    if (dow === 5 && h >= 14) {
      const delay = 40_000 + Math.random() * 80_000; // 40s-2min
      setTimeout(() => this._tryVisit(true), delay);
      return;
    }

    // Session normale : visite aléatoire 2-5 min après chargement
    const delay = 120_000 + Math.random() * 180_000;
    setTimeout(() => this._tryVisit(false), delay);
  },

  async _tryVisit(isWeekend = false) {
    const chance = isWeekend ? 0.55 : 0.15; // 55% vendredi, 15% sinon
    if (Math.random() > chance) return;
    sessionStorage.setItem('mc_visit_done', '1');

    try {
      const snap = await firebase.database().ref('superadmin/orgDirectory').once('value');
      const dir  = snap.val();
      if (!dir) return;

      const currentOrgId = window.CONFIG?.ORG_ID || '';
      const others = Object.entries(dir)
        .filter(([id, d]) => id !== currentOrgId && d.visitsEnabled !== false)
        .map(([, data]) => data);

      if (!others.length) return;

      if (isWeekend && others.length >= 2) {
        // Fête du week-end : 1-3 visiteurs
        const shuffled = others.sort(() => Math.random() - 0.5);
        const guests   = shuffled.slice(0, Math.min(3, shuffled.length));
        this._startWeekendParty(guests);
      } else {
        const visitor = others[Math.floor(Math.random() * others.length)];
        this._startVisit(visitor);
      }
    } catch (_) { /* Firebase peut ne pas être dispo */ }
  },

  // ── Fête du week-end ───────────────────────────────────────────
  _startWeekendParty(guests) {
    if (this._state === 'alarmed' || this._state === 'concentrating') return;

    const hostMascot = MASCOTS[window.CONFIG?.MASCOT_ID] || MASCOTS.poulpe;
    const hostName   = hostMascot.name;

    const partyDialogues = BRAIN_TEXTS.weekend_party;
    const dlg = partyDialogues[Math.floor(Math.random() * partyDialogues.length)];

    // Remplacer les tokens du dialogue
    const g1 = guests[0];
    const g2 = guests[1];
    const g1Mascot  = MASCOTS[g1?.mascotType] || MASCOTS.chat;
    const g1Name    = g1?.mascotName || g1Mascot.name;
    const g1Org     = (g1?.orgName || '').replace(/^(CPAS d[eu]?|CPAS de la)\s+/i, '');
    const g2Name    = g2 ? (g2.mascotName || (MASCOTS[g2.mascotType] || MASCOTS.chat).name) : '';
    const g2Org     = g2 ? (g2.orgName || '').replace(/^(CPAS d[eu]?|CPAS de la)\s+/i, '') : '';

    const sequence = dlg.map(line => ({
      speaker: line.speaker,
      text: line.text
        .replace(/\{hostName\}/g, hostName)
        .replace(/\{g1Name\}/g,  g1Name) .replace(/\{g1Org\}/g,  g1Org)
        .replace(/\{g2Name\}/g,  g2Name) .replace(/\{g2Org\}/g,  g2Org),
    }));

    // Préparer le visiteur principal (g1)
    const visitorEl = document.getElementById('msVisitor');
    if (!visitorEl) return;
    const svgEl = document.getElementById('msVisitorSvg');
    if (svgEl) {
      svgEl.setAttribute('viewBox', g1Mascot.viewBox);
      svgEl.innerHTML = g1Mascot.svg;
    }
    const nameEl = document.getElementById('msVisitorName');
    if (nameEl) nameEl.textContent = `${g1Name}${g2Name ? ` & ${g2Name}` : ''} 🎉`;

    this._state    = 'visitor';
    this._priority = 1;
    clearInterval(this._scanInterval);

    // Entrée festive
    this._showVisitor(visitorEl);
    this._applyState('idle', 1, 'stars', []);

    let t = 600;
    sequence.forEach((line, i) => {
      setTimeout(() => {
        if (line.speaker === 'host') {
          window.HOME?._showBubble?.(line.text);
        } else {
          const bubble = document.getElementById('msVisitorBubble');
          const textEl = document.getElementById('msVisitorBubbleText');
          if (textEl) textEl.textContent = line.text;
          if (bubble) bubble.classList.remove('hidden');
        }
        // Animations festives au pic du dialogue
        if (i === 2 || i === Math.floor(sequence.length / 2)) {
          const stage = document.querySelector('.hs-mascot-stage');
          stage?.classList.remove('ms-happy');
          stage?.classList.add('ms-celebrating');
          visitorEl.classList.add('ms-visitor-excited');
          // Changer l'accessoire du visiteur (si g2)
          if (g2Name && i === 2) {
            const svgEl = document.getElementById('msVisitorSvg');
            const g2Mascot = MASCOTS[g2?.mascotType] || MASCOTS.chat;
            if (svgEl) { svgEl.setAttribute('viewBox', g2Mascot.viewBox); svgEl.innerHTML = g2Mascot.svg; }
          }
          setTimeout(() => {
            stage?.classList.remove('ms-celebrating');
            visitorEl.classList.remove('ms-visitor-excited');
          }, 2400);
        }
      }, t);
      t += 3200 + line.text.length * 35;
    });

    // Clôture de la fête
    setTimeout(() => {
      this._hideVisitor(visitorEl);
      // Mascotte encore festive un moment
      this._state    = 'idle';
      this._priority = 99;
      this._applyState('celebrating', 4, 'stars', ["Quel début de week-end ! On garde cette énergie ! 🥳"]);
      this._scanInterval = setInterval(() => this._scan(), 30_000);
    }, t + 800);
  },

  _startVisit(visitor) {
    if (this._state === 'alarmed' || this._state === 'concentrating') return;

    const hostMascot  = MASCOTS[window.CONFIG?.MASCOT_ID] || MASCOTS.poulpe;
    const guestMascot = MASCOTS[visitor.mascotType] || MASCOTS.chat;
    const hostName    = hostMascot.name;
    const guestName   = visitor.mascotName || guestMascot.name;
    const hostOrg     = (window.CONFIG?.ORG_NAME || 'ici').replace(/^(CPAS d[eu]?|CPAS de la)\s+/i, '');
    const guestOrg    = (visitor.orgName || 'là-bas').replace(/^(CPAS d[eu]?|CPAS de la)\s+/i, '');

    const dialogues = BRAIN_TEXTS.visitor_dialogues;
    const dlg = dialogues[Math.floor(Math.random() * dialogues.length)];
    const sequence = dlg.map(line => ({
      speaker: line.speaker,
      text: line.text
        .replace(/\{guestName\}/g, guestName).replace(/\{hostName\}/g, hostName)
        .replace(/\{guestOrg\}/g,  guestOrg) .replace(/\{hostOrg\}/g,  hostOrg),
    }));

    // Préparer le DOM visiteur
    const visitorEl = document.getElementById('msVisitor');
    if (!visitorEl) return;
    const svgEl = document.getElementById('msVisitorSvg');
    if (svgEl) {
      svgEl.setAttribute('viewBox', guestMascot.viewBox);
      svgEl.innerHTML = guestMascot.svg;
    }
    const nameEl = document.getElementById('msVisitorName');
    if (nameEl) nameEl.textContent = `${guestName} — ${visitor.orgName || ''}`;

    this._state    = 'visitor';
    this._priority = 1;
    clearInterval(this._scanInterval);

    // Animation d'entrée
    this._showVisitor(visitorEl);

    // Séquence de dialogue
    let t = 800;
    sequence.forEach((line, i) => {
      setTimeout(() => {
        if (line.speaker === 'host') {
          window.HOME?._showBubble?.(line.text);
        } else {
          const bubble = document.getElementById('msVisitorBubble');
          const textEl = document.getElementById('msVisitorBubbleText');
          if (textEl) textEl.textContent = line.text;
          if (bubble) {
            bubble.classList.remove('hidden');
            // Petit reset animation
            bubble.style.animation = 'none';
            bubble.offsetHeight;
            bubble.style.animation = '';
          }
        }

        // Au milieu : animation joueur ensemble
        if (i === Math.floor(sequence.length / 2)) {
          const stage = document.querySelector('.hs-mascot-stage');
          stage?.classList.add('ms-excited');
          visitorEl.classList.add('ms-visitor-excited');
          setTimeout(() => {
            stage?.classList.remove('ms-excited');
            visitorEl.classList.remove('ms-visitor-excited');
          }, 1800);
        }
      }, t);
      t += 2600 + line.text.length * 38;
    });

    // Départ du visiteur
    setTimeout(() => {
      this._hideVisitor(visitorEl);

      // Mascotte hôte heureuse
      this._state    = 'idle';
      this._priority = 99;
      this._applyState('happy', 6, 'hearts', [BRAIN_TEXTS.after_visit]);

      // Reprendre le scan
      this._scanInterval = setInterval(() => this._scan(), 30_000);
    }, t + 600);
  },
};
