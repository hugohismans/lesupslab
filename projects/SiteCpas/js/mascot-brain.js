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
  // Dialogues visiteur — { ctx, lines[] }
  // ctx : 'any' | 'morning' | 'friday' | 'monday' | 'busy' | 'quiet' | 'late'
  visitor_dialogues: [
    // ── Toujours disponibles ──────────────────────────────────────
    { ctx: 'any', lines: [
      { speaker: 'visitor', text: "Bonjour ! Moi c'est {guestName}, la mascotte du {guestOrg} — je passais dans le coin ! 🙌" },
      { speaker: 'host',    text: "Oh ! {guestName} ! Quelle belle surprise — bienvenue chez nous ! 😊" },
      { speaker: 'visitor', text: "Ça se passe bien par ici ?" },
      { speaker: 'host',    text: "On assure ! Et à {guestOrg} ?" },
      { speaker: 'visitor', text: "Super aussi ! Bon, je te laisse — à bientôt {hostName} 👋" },
      { speaker: 'host',    text: "Avec plaisir {guestName} ! Reviens quand tu veux 💙" },
    ]},
    { ctx: 'any', lines: [
      { speaker: 'visitor', text: "Toc toc ! {guestName} du {guestOrg} — je faisais la tournée du réseau 🐾" },
      { speaker: 'host',    text: "ALORS ! Mais c'est {guestName} ! Entre, entre ! 🎉" },
      { speaker: 'visitor', text: "Je voulais voir comment vous vous en sortez par ici ?" },
      { speaker: 'host',    text: "On gère ! C'est plus facile avec moncompagnon 😄 Et chez vous ?" },
      { speaker: 'visitor', text: "Pareil — on est des pros. Bon, à la prochaine ! 👋" },
      { speaker: 'host',    text: "Reviens quand tu veux, {guestName} ! 🌟" },
    ]},
    { ctx: 'any', lines: [
      { speaker: 'visitor', text: "Salut {hostName} ! C'est {guestName} depuis {guestOrg} — réseau moncompagnon en visite 📡" },
      { speaker: 'host',    text: "Salut {guestName} ! Quel bon vent t'amène aujourd'hui ? 😄" },
      { speaker: 'visitor', text: "Je voulais juste passer dire bonjour et voir comment ça se passe chez vous !" },
      { speaker: 'host',    text: "C'est adorable ! On tient le fort ici — et à {guestOrg} ?" },
      { speaker: 'visitor', text: "Nickel aussi ! Allez, à très vite {hostName} 👋" },
      { speaker: 'host',    text: "Prends soin de toi {guestName} ! ✨" },
    ]},
    { ctx: 'any', lines: [
      { speaker: 'visitor', text: "Coucou ! Je m'appelle {guestName}, je viens du {guestOrg} 🌤️" },
      { speaker: 'host',    text: "{guestName} ! On se tient compagnie entre mascottes, j'adore ça 😄" },
      { speaker: 'visitor', text: "Haha exactement ! Comment va l'équipe ici ?" },
      { speaker: 'host',    text: "Au top ! On fait du bon travail ensemble 💙 Et chez toi ?" },
      { speaker: 'visitor', text: "Pareil — on est fiers de nos équipes ! À bientôt 🤝" },
      { speaker: 'host',    text: "À bientôt {guestName} ! 💫" },
    ]},
    { ctx: 'any', lines: [
      { speaker: 'visitor', text: "Yoohoo ! {guestName} du {guestOrg} ici — petite visite surprise 🎊" },
      { speaker: 'host',    text: "Oh {guestName} ! Tu tombes bien — une petite pause ça fait du bien ! 😄" },
      { speaker: 'visitor', text: "C'est l'idée ! Comment ça se passe côté travail en ce moment ?" },
      { speaker: 'host',    text: "On gère tout ça avec le sourire 💪 Toi aussi j'espère ?" },
      { speaker: 'visitor', text: "Toujours ! Allez, je te laisse — bonne journée à {hostOrg} 🌈" },
      { speaker: 'host',    text: "Merci {guestName} ! À bientôt chez nous 💙" },
    ]},

    // ── Matin (avant 10h) ─────────────────────────────────────────
    { ctx: 'morning', lines: [
      { speaker: 'visitor', text: "Bonjour {hostName} ! {guestName} du {guestOrg} — vous commencez tôt à {hostOrg} ! 🌅" },
      { speaker: 'host',    text: "{guestName} ! Et toi aussi apparemment ! Tu prends le café ?" },
      { speaker: 'visitor', text: "Avec plaisir ☕ Bonne journée en vue chez vous ?" },
      { speaker: 'host',    text: "On espère ! Et à {guestOrg} ?" },
      { speaker: 'visitor', text: "Ça se lance doucement 😄 Bon courage à toute l'équipe !" },
      { speaker: 'host',    text: "Pareil pour vous {guestName} ! À bientôt ☀️" },
    ]},
    { ctx: 'morning', lines: [
      { speaker: 'visitor', text: "Bien le bonjour ! Je suis {guestName}, mascotte du {guestOrg} — debout de bonne heure ! ⏰" },
      { speaker: 'host',    text: "{guestName} ! Quelle énergie ce matin ! Bienvenue ! ☀️" },
      { speaker: 'visitor', text: "Haha merci ! On aime bien commencer la journée du bon pied 😊" },
      { speaker: 'host',    text: "C'est la meilleure façon ! Comment ça se passe à {guestOrg} en ce moment ?" },
      { speaker: 'visitor', text: "Ça roule ! Bon, je vous laisse attaquer la journée — bonne chance ! 💪" },
      { speaker: 'host',    text: "À toi aussi {guestName} ! Reviens quand tu veux 🌟" },
    ]},

    // ── Lundi ────────────────────────────────────────────────────
    { ctx: 'monday', lines: [
      { speaker: 'visitor', text: "Bon lundi ! {guestName} du {guestOrg} passe vous donner un coup de boost ☕🎉" },
      { speaker: 'host',    text: "{guestName} ! Un lundi avec une visite, c'est un bon signe 😄" },
      { speaker: 'visitor', text: "C'est ma mission ! La semaine commence bien ici ?" },
      { speaker: 'host',    text: "On s'y met ! Et à {guestOrg} ?" },
      { speaker: 'visitor', text: "Pareil — lundi oblige ! Allez, bon courage à l'équipe 💪" },
      { speaker: 'host',    text: "Merci {guestName} ! Ça fait chaud au cœur 💙" },
    ]},

    // ── Vendredi ─────────────────────────────────────────────────
    { ctx: 'friday', lines: [
      { speaker: 'visitor', text: "VENDREDI ! {guestName} du {guestOrg} passe célébrer ça avec vous 🎉" },
      { speaker: 'host',    text: "{guestName} ! T'as bien fait de passer — on en avait besoin ! 🥳" },
      { speaker: 'visitor', text: "La semaine s'est bien passée à {hostOrg} ?" },
      { speaker: 'host',    text: "On a assuré ! Et vous à {guestOrg} ?" },
      { speaker: 'visitor', text: "Pareil ! On a mérité ce week-end 🏖️ Bon repos à toute l'équipe !" },
      { speaker: 'host',    text: "À toi aussi {guestName} ! Passe un super week-end 🌈" },
    ]},

    // ── File chargée ──────────────────────────────────────────────
    { ctx: 'busy', lines: [
      { speaker: 'visitor', text: "Oh là là ! {guestName} du {guestOrg} — ça a l'air animé chez vous ! 😅" },
      { speaker: 'host',    text: "{guestName} ! Oui c'est du sport aujourd'hui — mais l'équipe tient ! 💪" },
      { speaker: 'visitor', text: "Respect ! On a eu des jours pareils à {guestOrg} — ça forge le caractère !" },
      { speaker: 'host',    text: "Ha ! T'as raison 😄 Comment vous gérez ces moments chez vous ?" },
      { speaker: 'visitor', text: "Beaucoup de café et d'entraide ! Bon courage — vous assurez 🔥" },
      { speaker: 'host',    text: "Merci {guestName} ! Ça recharge les batteries ! 💙" },
    ]},

    // ── Journée calme ─────────────────────────────────────────────
    { ctx: 'quiet', lines: [
      { speaker: 'visitor', text: "Coucou ! Je suis {guestName} du {guestOrg} — j'avais l'impression que vous soufflez un peu aujourd'hui 😌" },
      { speaker: 'host',    text: "{guestName} ! Bien vu — journée tranquille, on en profite ! 🧘" },
      { speaker: 'visitor', text: "C'est bien de souffler parfois ! Chez nous c'est pareil en ce moment." },
      { speaker: 'host',    text: "Le calme avant la tempête peut-être ! Mais on est prêts 😄" },
      { speaker: 'visitor', text: "Profitez-en bien ! Allez, à bientôt {hostName} 🌿" },
      { speaker: 'host',    text: "À bientôt {guestName} ! Merci pour la petite visite 💙" },
    ]},

    // ── Fin de journée ────────────────────────────────────────────
    { ctx: 'late', lines: [
      { speaker: 'visitor', text: "Bonsoir ! {guestName} du {guestOrg} — encore au bureau à cette heure-ci ? 🌙" },
      { speaker: 'host',    text: "{guestName} ! Fin de journée chez nous — et chez toi ?" },
      { speaker: 'visitor', text: "Pareil ! On range les dossiers 😄 La journée s'est bien passée ?" },
      { speaker: 'host',    text: "Oui, l'équipe a bien assuré ! Bonne soirée à {guestOrg} !" },
      { speaker: 'visitor', text: "Merci {hostName} ! Rentrez bien — à bientôt 🌙" },
      { speaker: 'host',    text: "Bonne soirée {guestName} ! À très vite 💙" },
    ]},
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

  // ── Afficher une ligne de dialogue inter-mascottes ─────────────
  _showDialogueLine(line) {
    if (line.speaker === 'host') {
      // Bulle bleue au-dessus de la mascotte locale
      const bubble = document.getElementById('msHostBubble');
      const textEl = document.getElementById('msHostBubbleText');
      if (textEl) textEl.textContent = line.text;
      if (bubble) {
        bubble.classList.remove('hidden');
        // Relancer l'animation d'entrée
        bubble.style.animation = 'none';
        bubble.offsetHeight; // reflow
        bubble.style.animation = '';
      }
      // Masquer la bulle visiteur quand l'hôte parle
      document.getElementById('msVisitorBubble')?.classList.add('hidden');
    } else {
      // Bulle blanche au-dessus du visiteur
      const bubble = document.getElementById('msVisitorBubble');
      const textEl = document.getElementById('msVisitorBubbleText');
      if (textEl) textEl.textContent = line.text;
      if (bubble) {
        bubble.classList.remove('hidden');
        bubble.style.animation = 'none';
        bubble.offsetHeight;
        bubble.style.animation = '';
      }
      // Masquer la bulle hôte quand le visiteur parle
      document.getElementById('msHostBubble')?.classList.add('hidden');
    }
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

      const currentOrgId = window.ORG_ID || window.CONFIG?.ORG_ID || '';
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

  // ── Picker dialogue contextuel ────────────────────────────────
  _pickVisitorDialogue() {
    const ctx = this._buildContext();
    const { h, dow, queueTotal, todayBookings } = ctx;

    // Mapper contexte actuel → tags prioritaires
    const tags = ['any'];
    if (h < 10)                              tags.unshift('morning');
    if (dow === 1 && h < 12)                 tags.unshift('monday');
    if (dow === 5 && h >= 14)                tags.unshift('friday');
    if (queueTotal >= 5)                     tags.unshift('busy');
    if (todayBookings === 0 && h >= 9)       tags.unshift('quiet');
    if (h >= 17)                             tags.unshift('late');

    // Filtrer les dialogues par tag prioritaire, fallback sur 'any'
    for (const tag of tags) {
      const matches = BRAIN_TEXTS.visitor_dialogues.filter(d => d.ctx === tag);
      if (matches.length) return matches[Math.floor(Math.random() * matches.length)].lines;
    }
    const all = BRAIN_TEXTS.visitor_dialogues;
    return all[Math.floor(Math.random() * all.length)].lines;
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

      const currentOrgId = window.ORG_ID || window.CONFIG?.ORG_ID || '';
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

    // Préparer visiteur gauche (g1)
    const visitor1El = document.getElementById('msVisitor');
    if (!visitor1El) return;
    const svg1El = document.getElementById('msVisitorSvg');
    if (svg1El) { svg1El.setAttribute('viewBox', g1Mascot.viewBox); svg1El.innerHTML = g1Mascot.svg; }
    const name1El = document.getElementById('msVisitorName');
    if (name1El) name1El.textContent = `${g1Name} 🎉`;

    // Préparer visiteur droite (g2) si disponible
    const g2Mascot = g2 ? (MASCOTS[g2.mascotType] || MASCOTS.chat) : null;
    const visitor2El = document.getElementById('msVisitor2');
    if (visitor2El && g2Mascot) {
      const svg2El = document.getElementById('msVisitor2Svg');
      if (svg2El) { svg2El.setAttribute('viewBox', g2Mascot.viewBox); svg2El.innerHTML = g2Mascot.svg; }
      const name2El = document.getElementById('msVisitor2Name');
      if (name2El) name2El.textContent = `${g2Name} 🎉`;
    }

    this._state    = 'visitor';
    this._priority = 1;
    clearInterval(this._scanInterval);
    document.getElementById('hsMascotBubble')?.classList.add('hidden');

    // Entrée festive
    this._showVisitor(visitor1El);
    this._applyState('idle', 1, 'stars', []);
    if (visitor2El && g2Mascot) {
      setTimeout(() => this._showVisitor(visitor2El), 400); // g2 arrive 400ms après
    }

    let t = 900;
    // Dans les dialogues week-end, 'visitor' = g1 (gauche), 'visitor2' = g2 (droite)
    sequence.forEach((line, i) => {
      setTimeout(() => {
        if (line.speaker === 'host') {
          this._showDialogueLine(line);
        } else {
          // Alterner g1 et g2 si deux visiteurs
          const useG2 = g2Mascot && (i % 3 === 2); // g2 parle sur 3ème ligne, 6ème, etc.
          const bubbleId = useG2 ? 'msVisitor2Bubble' : 'msVisitorBubble';
          const textId   = useG2 ? 'msVisitor2BubbleText' : 'msVisitorBubbleText';
          // Masquer l'autre bulle visiteur
          document.getElementById(useG2 ? 'msVisitorBubble' : 'msVisitor2Bubble')?.classList.add('hidden');
          document.getElementById('msHostBubble')?.classList.add('hidden');
          const bubble = document.getElementById(bubbleId);
          const textEl = document.getElementById(textId);
          if (textEl) textEl.textContent = line.text;
          if (bubble) { bubble.classList.remove('hidden'); bubble.style.animation='none'; bubble.offsetHeight; bubble.style.animation=''; }
        }
        // Animation festive collective
        if (i === 2 || i === Math.floor(sequence.length / 2)) {
          const stage = document.querySelector('.hs-mascot-stage');
          stage?.classList.remove('ms-happy'); stage?.classList.add('ms-celebrating');
          visitor1El.classList.add('ms-visitor-excited');
          visitor2El?.classList.add('ms-visitor-excited');
          setTimeout(() => {
            stage?.classList.remove('ms-celebrating');
            visitor1El.classList.remove('ms-visitor-excited');
            visitor2El?.classList.remove('ms-visitor-excited');
          }, 2400);
        }
      }, t);
      t += 3200 + line.text.length * 35;
    });

    // Clôture de la fête
    setTimeout(() => {
      document.getElementById('msHostBubble')?.classList.add('hidden');
      this._hideVisitor(visitor1El);
      if (visitor2El && g2Mascot) setTimeout(() => this._hideVisitor(visitor2El), 200);
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

    const dlg = this._pickVisitorDialogue();
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

    // Masquer la bulle worker pendant la conversation
    document.getElementById('hsMascotBubble')?.classList.add('hidden');

    // Animation d'entrée
    this._showVisitor(visitorEl);

    // Séquence de dialogue
    let t = 800;
    sequence.forEach((line, i) => {
      setTimeout(() => {
        this._showDialogueLine(line);

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
      document.getElementById('msHostBubble')?.classList.add('hidden');
      this._hideVisitor(visitorEl);

      // Mascotte hôte heureuse — reprend sa bulle normale
      this._state    = 'idle';
      this._priority = 99;
      this._applyState('happy', 6, 'hearts', [BRAIN_TEXTS.after_visit]);

      // Reprendre le scan
      this._scanInterval = setInterval(() => this._scan(), 30_000);
    }, t + 600);
  },
};
