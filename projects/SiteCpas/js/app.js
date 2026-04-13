// ═══════════════════════════════════════════════════════════════════
// app.js — Initialisation principale
// ═══════════════════════════════════════════════════════════════════

// MASCOTS et _applyMascot définis dans js/mascots.js (chargé avant)

function _showCalView(view) {
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('planningPanel')?.classList.add('hidden');
  document.getElementById('cal').classList.remove('hidden');
  document.getElementById('statusBar')?.classList.remove('hidden');
  document.getElementById('calLegend')?.classList.remove('hidden');
  document.getElementById('lieuBar').classList.remove('hidden');
  document.querySelectorAll('.hd-cal-only').forEach(el => el.style.display = '');
  CAL.setView(view);
}
function _showHomeView() {
  document.getElementById('homeScreen').classList.remove('hidden');
  document.getElementById('cal').classList.add('hidden');
  document.getElementById('planningPanel')?.classList.add('hidden');
  document.getElementById('statusBar')?.classList.add('hidden');
  document.getElementById('calLegend')?.classList.add('hidden');
  document.getElementById('lieuBar').classList.add('hidden');
  document.querySelectorAll('.hd-cal-only').forEach(el => el.style.display = 'none');
  HOME.render();
}
function _showPlanningView() {
  document.getElementById('homeScreen').classList.add('hidden');
  document.getElementById('cal').classList.add('hidden');
  document.getElementById('planningPanel')?.classList.remove('hidden');
  document.getElementById('statusBar')?.classList.add('hidden');
  document.getElementById('calLegend')?.classList.add('hidden');
  document.getElementById('lieuBar').classList.add('hidden');
  document.querySelectorAll('.hd-cal-only').forEach(el => el.style.display = 'none');
  if (typeof PLANNING !== 'undefined') PLANNING.render();
}

// ── Écran d'accueil ────────────────────────────────────────────────
const HOME = {
  _initialized:   false,
  _lastPhrase:    null,
  _lastPhraseAt:  0,
  _eyeFrame:      null,

  // ── Occurrences de phrases (localStorage par agent) ──────────────
  _getPhraseOccurrences() {
    const k = sessionStorage.getItem('cpas_current_agent_key') || 'anon';
    try { return JSON.parse(localStorage.getItem(`mc_phrases_${k}`) || '{}'); } catch { return {}; }
  },
  _savePhraseOccurrences(counts) {
    const k = sessionStorage.getItem('cpas_current_agent_key') || 'anon';
    localStorage.setItem(`mc_phrases_${k}`, JSON.stringify(counts));
  },
  _pickWeighted(phrases) {
    const counts = this._getPhraseOccurrences();
    // Score inversely proportional to occurrence count
    const scored = phrases.map(p => ({ ...p, score: 1 / (1 + (counts[p.id] || 0) * 0.65) }));
    const total  = scored.reduce((s, p) => s + p.score, 0);
    let r = Math.random() * total;
    for (const p of scored) { r -= p.score; if (r <= 0) return p; }
    return scored[scored.length - 1];
  },
  _recordPhrase(id) {
    const c = this._getPhraseOccurrences();
    c[id] = (c[id] || 0) + 1;
    this._savePhraseOccurrences(c);
  },

  // ── Phrase contextuelle principale ───────────────────────────────
  _getMascotPhrase(agentName, myRes, now) {
    const hour    = now.getHours();
    const weekday = now.getDay(); // 0=dim
    const isCpas  = DB.getFeature('isCpas');
    const agentKey = sessionStorage.getItem('cpas_current_agent_key');
    const roleId   = agentKey ? (DB.getAgentPermRole(agentKey) || '__agent__') : null;

    // Priorité 1 — RDV imminent (≤ 12 min)
    const imminent = myRes
      .filter(r => { const d = (r._start - now) / 60000; return d > 0 && d <= 12; })
      .sort((a, b) => a._start - b._start)[0];
    if (imminent) {
      const svc = escapeHtml(DB.getSvcLabel(imminent));
      const loc = escapeHtml(DB.getLocalLabel(imminent.localId));
      const min = Math.round((imminent._start - now) / 60000);
      return min <= 1 ? `C'est l'heure ! ${loc} — ${svc} 🚀` : `Dans ${min} min : ${svc} au ${loc} ⏰`;
    }

    // Priorité 2 — RDV en cours
    const active = myRes.find(r => r._start <= now && r._end && r._end >= now);
    if (active) {
      const p = this._pickWeighted([
        { id: 'rdv_active1', text: `En cours — concentration max ! 🤝` },
        { id: 'rdv_active2', text: `Je te laisse te concentrer sur ton rendez-vous 😊` },
      ]);
      this._recordPhrase(p.id);
      return p.text;
    }

    // Priorité 3 — prochain RDV dans < 60 min
    const nextSoon = myRes
      .filter(r => { const d = (r._start - now) / 60000; return d > 12 && d <= 60; })
      .sort((a, b) => a._start - b._start)[0];
    if (nextSoon) {
      const svc = escapeHtml(DB.getSvcLabel(nextSoon));
      const min = Math.round((nextSoon._start - now) / 60000);
      return `Prochain RDV dans ${min} min — ${svc} 📅`;
    }

    // Priorité 4 — pool contextuel
    const noRes  = myRes.length === 0;
    const pool   = [];
    const month  = now.getMonth(); // 0=jan … 11=dec
    // Prénom = première partie du nom (avant espace)
    const prenom = agentName ? agentName.split(' ')[0] : null;
    const n  = prenom ? ` ${prenom}` : '';    // " Marie" ou ""
    const np = prenom ? `${prenom}, ` : '';   // "Marie, " ou ""

    // ── Par heure ───────────────────────────────────────────────────

    if (hour < 9) {
      // Tôt le matin — énergique et doux
      pool.push({ id: 'early1',  text: weekday === 1 ? `Bon lundi matin${n} ! La semaine est toute neuve 💪` : `Déjà là de bonne heure${n} ! J'admire ta motivation ☀️` });
      pool.push({ id: 'early2',  text: `${np}tu es parmi les premiers ce matin ! Les lève-tôt ont un avantage ⏰` });
      pool.push({ id: 'early3',  text: `Un café avant de commencer${n} ? Tu le mérites ☕` });
      pool.push({ id: 'early4',  text: `Le bureau est encore calme${n} — profites-en, c'est rare 🌅` });
      pool.push({ id: 'early5',  text: `Bonne journée${n} ! Elle commence à peine et tu es déjà là 💪` });
      pool.push({ id: 'early6',  text: `Matin frais${n} ! Une belle journée se prépare ☀️` });
      pool.push({ id: 'early7',  text: prenom ? `Debout de bonne heure, ${prenom} ! C'est ton super-pouvoir 🦸` : `Debout de bonne heure ! C'est ton super-pouvoir 🦸` });
      pool.push({ id: 'early8',  text: `Le calme du matin${n}… savourons ça avant que ça s'emballe 😄` });

    } else if (hour < 10) {
      // 9h–10h : lancement de journée
      pool.push({ id: 'ms1',  text: `Bonne journée${n} ! J'espère qu'elle sera douce ☀️` });
      pool.push({ id: 'ms2',  text: noRes ? `Matinée tranquille${n} — profites-en pour souffler ☕` : `${myRes.length} rendez-vous aujourd'hui${n}. On y va ! 📋` });
      pool.push({ id: 'ms3',  text: `${np}tu vas assurer aujourd'hui, j'en suis sûr·e ! 🌟` });
      pool.push({ id: 'ms4',  text: `Prêt·e${n} ? La journée commence ! 🚀` });
      pool.push({ id: 'ms5',  text: `Tout commence maintenant${n} — belle journée devant toi 🌤️` });
      pool.push({ id: 'ms6',  text: prenom ? `${prenom} est dans la place ! La journée peut commencer 🎯` : `La journée peut commencer ! 🎯` });
      pool.push({ id: 'ms7',  text: `${np}commence doucement — il est encore tôt 😊` });
      pool.push({ id: 'ms8',  text: `J'ai hâte de voir ce que tu vas accomplir aujourd'hui${n} ! ✨` });
      pool.push({ id: 'ms9',  text: `La journée est encore vierge${n} — tout est possible 🌈` });
      pool.push({ id: 'ms10', text: noRes ? `Aucun RDV ce matin${n} — du temps pour bien démarrer ☕` : `La machine est lancée${n} — ${myRes.length} RDV au programme ! 📅` });
      pool.push({ id: 'ms11', text: `Bonne arrivée${n} ! Je gardais le bureau au chaud 🐙` });
      pool.push({ id: 'ms12', text: `Nouveau jour, nouvelles opportunités${n} ! 🌅` });

    } else if (hour < 12) {
      // 10h–12h : milieu de matinée
      pool.push({ id: 'mm1',  text: `La matinée avance bien${n} ? 📊` });
      pool.push({ id: 'mm2',  text: noRes ? `Rien au programme ce matin${n} — c'est bien aussi 😌` : `Tu avances sur ta journée${n} — continue ! 💪` });
      pool.push({ id: 'mm3',  text: `Tu es en pleine forme${n} ! Ça se voit 💪` });
      pool.push({ id: 'mm4',  text: `${np}encore deux heures avant le midi — le temps de faire de belles choses ✨` });
      pool.push({ id: 'mm5',  text: `À mi-matinée${n} — tu assures ! 🎯` });
      pool.push({ id: 'mm6',  text: prenom ? `${prenom} en pleine action — tu gères vraiment bien 💪` : `En pleine action — tu gères vraiment bien 💪` });
      pool.push({ id: 'mm7',  text: `La matinée file${n} ! C'est bon signe 🌤️` });
      pool.push({ id: 'mm8',  text: prenom ? `${prenom} en mode concentration — j'adore ! 🧠` : `En mode concentration — j'adore ! 🧠` });
      pool.push({ id: 'mm9',  text: `${np}sais-tu que les pauses régulières boostent la productivité ? Juste un rappel ☕` });
      pool.push({ id: 'mm10', text: noRes ? `Pas de RDV ce matin${n} — du temps pour les à-côtés 📝` : `Les rendez-vous s'enchaînent${n} ? Tu gères 💪` });

    } else if (hour < 13) {
      // 12h–13h : heure du déjeuner
      pool.push({ id: 'l1',  text: `C'est l'heure du midi${n} ! Recharge bien tes batteries ☕` });
      pool.push({ id: 'l2',  text: `Une bonne pause, c'est un meilleur après-midi 🥪` });
      pool.push({ id: 'l3',  text: `${np}mange bien ! Tu as besoin d'énergie pour la suite 🍽️` });
      pool.push({ id: 'l4',  text: `Pose-toi un moment${n} — tu l'as bien mérité ☀️` });
      pool.push({ id: 'l5',  text: `Midi${n} ! La matinée est derrière toi — belle première moitié 🎉` });
      pool.push({ id: 'l6',  text: `${np}tu as le droit de décrocher le temps du repas 😌` });
      pool.push({ id: 'l7',  text: `La pause de midi, c'est sacré${n} ! Profites-en 🍽️` });
      pool.push({ id: 'l8',  text: prenom ? `Bon appétit, ${prenom} ! 🥗` : `Bon appétit ! 🥗` });
      pool.push({ id: 'l9',  text: `Mi-journée${n} ! Tu as déjà accompli plein de choses ce matin 👏` });
      pool.push({ id: 'l10', text: `Le midi c'est aussi fait pour décompresser${n} — souffle un peu 🌬️` });

    } else if (hour < 14) {
      // 13h–14h : reprise
      pool.push({ id: 'ps1', text: `L'après-midi commence${n} ! On repart ? 🌤️` });
      pool.push({ id: 'ps2', text: `Bien reposé·e${n} ? La deuxième partie t'attend 💪` });
      pool.push({ id: 'ps3', text: `Mi-journée passée${n} — tu assures ! 🎯` });
      pool.push({ id: 'ps4', text: `Retour aux affaires${n} ! 🚀` });
      pool.push({ id: 'ps5', text: `${np}c'est reparti — deuxième mi-temps de la journée ! ⚽` });
      pool.push({ id: 'ps6', text: `Après une bonne pause, tout va mieux${n} — go ! 🌟` });
      pool.push({ id: 'ps7', text: prenom ? `${prenom} est de retour — la journée peut reprendre 😄` : `De retour — la journée reprend 😄` });
      pool.push({ id: 'ps8', text: noRes ? `Après-midi libre${n} — profites-en pour avancer sur autre chose 📝` : `Encore quelques RDV${n} et la journée est dans la poche 📋` });

    } else if (hour < 16) {
      // 14h–16h : après-midi
      pool.push({ id: 'a1',  text: `L'après-midi est bien lancé${n} ! 🌤️` });
      pool.push({ id: 'a2',  text: noRes ? `Après-midi libre${n} — profites-en bien 😌` : `Encore quelques RDV${n} et c'est bouclé 📋` });
      pool.push({ id: 'a3',  text: `Tu tiens le bon bout${n} ! 💪` });
      pool.push({ id: 'a4',  text: `Une chose à la fois${n} — tu vas y arriver 🎯` });
      pool.push({ id: 'a5',  text: `Rappel doux : tu as le droit de faire une pause ☕` });
      pool.push({ id: 'a6',  text: `${np}le coup de mou de 15h, ça ne dure pas. Courage ! ⭐` });
      pool.push({ id: 'a7',  text: `Tu avances${n} — et c'est ce qui compte 📈` });
      pool.push({ id: 'a8',  text: prenom ? `${prenom} qui performe en après-midi — classe 💼` : `Performant en après-midi — classe 💼` });
      pool.push({ id: 'a9',  text: `${np}encore deux heures et c'est dans la boîte 🎁` });
      pool.push({ id: 'a10', text: `La journée avance bien${n} ! Je suis fier·e de toi 🌟` });
      pool.push({ id: 'a11', text: `${np}si tu as une petite baisse d'énergie, c'est normal ! Un verre d'eau peut aider 💧` });
      pool.push({ id: 'a12', text: `On est à mi-chemin de l'après-midi${n} ! La fin approche 🏁` });

    } else if (hour < 17) {
      // 16h–17h : fin d'après-midi
      pool.push({ id: 'la1', text: `Presque fini${n} ! Encore un effort 🌅` });
      pool.push({ id: 'la2', text: weekday === 5 ? `Plus qu'une heure${n} et c'est le week-end ! 🎉` : `La journée se termine bientôt${n} — bien joué 👏` });
      pool.push({ id: 'la3', text: noRes ? `Journée tranquille${n} — c'est mérité 😌` : `Tu as bien rempli ta journée${n} ! 📋` });
      pool.push({ id: 'la4', text: `${np}la ligne d'arrivée est toute proche ! 🏁` });
      pool.push({ id: 'la5', text: `Courage${n} — encore une petite heure ⭐` });
      pool.push({ id: 'la6', text: `${np}tu vas y arriver — tu y arrives toujours 😊` });
      pool.push({ id: 'la7', text: prenom ? `${prenom} en fin de journée — encore solide ! 💪` : `En fin de journée — encore solide ! 💪` });
      pool.push({ id: 'la8', text: `La journée touche à sa fin${n} — belle résistance 🌙` });

    } else {
      // Après 17h
      pool.push({ id: 'eod1', text: weekday === 5 ? `Bon week-end${n} ! Bien mérité 🎉` : `La journée se termine${n} — beau travail aujourd'hui 🌙` });
      pool.push({ id: 'eod2', text: `Plus que quelques minutes${n} — courage ! ⭐` });
      pool.push({ id: 'eod3', text: `${np}belle journée. Rentre bien ce soir ! 🏠` });
      pool.push({ id: 'eod4', text: `Tu as assuré aujourd'hui${n} 🌟` });
      pool.push({ id: 'eod5', text: `Encore là${n} ? Tu mérites une médaille 🏅` });
      pool.push({ id: 'eod6', text: prenom ? `${prenom}, c'est l'heure de rentrer ! Demain est un autre jour 🌙` : `C'est l'heure de rentrer ! Demain est un autre jour 🌙` });
      pool.push({ id: 'eod7', text: `Bonne soirée${n} ! Tu l'as bien méritée 🌙` });
      pool.push({ id: 'eod8', text: `${np}pose-toi ce soir — tu as donné aujourd'hui 💙` });
      pool.push({ id: 'eod9', text: weekday === 4 ? `Jeudi soir${n} ! Le week-end est presque là 🎉` : `Belle fin de journée${n} ! ✨` });
    }

    // ── Jours de la semaine ─────────────────────────────────────────
    if (weekday === 1) {
      pool.push({ id: 'mon1', text: `Bon lundi${n} ! Nouvelle semaine, nouvelle chance 💪` });
      pool.push({ id: 'mon2', text: `Lundi${n} — le jour le plus courageux de la semaine ! 🦁` });
      pool.push({ id: 'mon3', text: prenom ? `${prenom} qui attaque le lundi — respect ! 💪` : `Qui attaque le lundi — respect ! 💪` });
      pool.push({ id: 'mon4', text: `${np}7 jours sans lundi… c'était le week-end ! 😄` });
      pool.push({ id: 'mon5', text: `Lundi matin${n} — la semaine t'appartient 🚀` });
    }
    if (weekday === 2) {
      pool.push({ id: 'tue1', text: `Mardi${n} ! La semaine est bien lancée 📈` });
      pool.push({ id: 'tue2', text: `${np}le mardi, c'est quand on réalise que le lundi s'est bien passé 😄` });
      pool.push({ id: 'tue3', text: `Mardi${n} — la semaine est en route ! 🚂` });
      pool.push({ id: 'tue4', text: prenom ? `${prenom} au mardi — tu tiens la cadence ! 💪` : `Au mardi — tu tiens la cadence ! 💪` });
    }
    if (weekday === 3) {
      pool.push({ id: 'wed1', text: `Mercredi${n} ! La semaine est à moitié faite 🐪` });
      pool.push({ id: 'wed2', text: `Milieu de semaine${n} ! C'est le moment de souffler un peu 🌬️` });
      pool.push({ id: 'wed3', text: `${np}mercredi — le dos de la semaine ! On dévale maintenant 🎿` });
      pool.push({ id: 'wed4', text: prenom ? `${prenom} au milieu de semaine — toujours debout ! 🌟` : `Au milieu de semaine — toujours debout ! 🌟` });
      pool.push({ id: 'wed5', text: `Mercredi${n} — demain c'est déjà presque jeudi 😄` });
    }
    if (weekday === 4) {
      pool.push({ id: 'thu1', text: `Jeudi${n} ! Plus qu'un jour demain 🎯` });
      pool.push({ id: 'thu2', text: `${np}le jeudi, c'est le vendredi de ceux qui bossent dur 😄` });
      pool.push({ id: 'thu3', text: `Jeudi${n} — le week-end se rapproche sérieusement ! 🏁` });
      pool.push({ id: 'thu4', text: prenom ? `${prenom} au jeudi — la fin de semaine est toute proche ! 🎉` : `Au jeudi — la fin de semaine est toute proche ! 🎉` });
    }
    if (weekday === 5) {
      pool.push({ id: 'fri1', text: `C'est vendredi${n} ! Le week-end approche 🎉` });
      pool.push({ id: 'fri2', text: `Vendredi${n} ! On tient le bon bout 🏁` });
      pool.push({ id: 'fri3', text: prenom ? `${prenom} au vendredi — le plus beau jour de la semaine ! 🎊` : `Au vendredi — le plus beau jour de la semaine ! 🎊` });
      pool.push({ id: 'fri4', text: `${np}dernière ligne droite avant le week-end ! 🚀` });
      pool.push({ id: 'fri5', text: `Vendredi${n} — tu as survécu à une semaine de plus ! 😄🎉` });
    }

    // ── Saisonnier (mois par mois) ──────────────────────────────────
    if (month === 0)  pool.push({ id: 'jan1', text: `Bonne année${n} ! Que cette nouvelle année soit belle 🎊` });
    if (month === 0)  pool.push({ id: 'jan2', text: `Janvier${n} — un nouveau départ ! 🌟` });
    if (month === 1)  pool.push({ id: 'feb1', text: `Février${n} — le mois le plus court, mais pas le moins intense ! 💪` });
    if (month === 2)  pool.push({ id: 'mar1', text: `Mars${n} ! Le printemps pointe son nez 🌱` });
    if (month >= 2 && month <= 4) pool.push({ id: 'spring1', text: `Le printemps est là${n} ! Belle énergie 🌸` });
    if (month >= 2 && month <= 4) pool.push({ id: 'spring2', text: `Les beaux jours reviennent${n} ! ça met de bonne humeur 🌷` });
    if (month === 4)  pool.push({ id: 'may1', text: `Mai${n} ! La saison des ponts et des jours fériés 😄` });
    if (month >= 5 && month <= 7) pool.push({ id: 'sum1', text: `Bel été${n} — même au bureau, on profite ! ☀️` });
    if (month >= 5 && month <= 7) pool.push({ id: 'sum2', text: `${np}les vacances approchent ou viennent de passer — profites-en ! 🏖️` });
    if (month === 7)  pool.push({ id: 'aug1', text: `Août${n} — le bureau est calme ! C'est l'été 🌴` });
    if (month === 8)  pool.push({ id: 'sep1', text: `Bonne rentrée${n} ! 📚` });
    if (month === 8)  pool.push({ id: 'sep2', text: `Septembre${n} — nouvelle saison, nouvelles ambitions ! 🍂` });
    if (month >= 8 && month <= 10) pool.push({ id: 'fall1', text: `L'automne est là${n} — cocooning assuré 🍂` });
    if (month >= 8 && month <= 10) pool.push({ id: 'fall2', text: `Saison des feuilles qui tombent${n} — et de la bonne organisation ! 🍁` });
    if (month === 10) pool.push({ id: 'nov1', text: `Novembre${n} — on pousse jusqu'aux fêtes ! 💪` });
    if (month === 11) pool.push({ id: 'dec1', text: `Les fêtes approchent${n} ! 🎄` });
    if (month === 11) pool.push({ id: 'dec2', text: prenom ? `${prenom}, encore quelques semaines et c'est Noël ! 🎅` : `Encore quelques semaines et c'est Noël ! 🎅` });
    if (month === 11) pool.push({ id: 'dec3', text: `Décembre${n} — l'ambiance de fin d'année est là 🌟` });
    if (month === 11 || month <= 1) pool.push({ id: 'win1', text: `Bien au chaud${n} ! L'hiver est rude dehors ❄️` });
    if (month === 11 || month <= 1) pool.push({ id: 'win2', text: `${np}en hiver, chaque jour au bureau mérite respect ! 🧣` });

    // ── Général — ton chaleureux et varié ──────────────────────────
    pool.push({ id: 'g1',  text: `Je suis là si tu as besoin de moi 😊` });
    pool.push({ id: 'g2',  text: `Tout se passe bien ? N'hésite pas à consulter ton agenda 📅` });
    pool.push({ id: 'g3',  text: `Une bonne organisation, c'est la clé d'une belle journée 🗝️` });
    pool.push({ id: 'g4',  text: `Tu gères tout ça parfaitement${n} 👏` });
    pool.push({ id: 'g5',  text: prenom ? `Comment tu vas aujourd'hui, ${prenom} ? 😊` : `Comment tu vas aujourd'hui ? 😊` });
    pool.push({ id: 'g6',  text: `Garde le sourire${n} ! Ça fait toute la différence 😊` });
    pool.push({ id: 'g7',  text: `Tu fais un métier vraiment utile${n} — j'espère que tu le sais 💙` });
    pool.push({ id: 'g8',  text: `Je suis toujours là si tu as besoin${n} — mais sans déranger 😊` });
    pool.push({ id: 'g9',  text: `Tu n'es pas seul·e${n} — je suis là ! 🐙` });
    pool.push({ id: 'g10', text: `Chaque petite action compte${n} — vraiment ✨` });
    pool.push({ id: 'g11', text: prenom ? `Psst, ${prenom}… tu es au top 🤫` : `Psst… tu es au top 🤫` });
    pool.push({ id: 'g12', text: `Je suis ton assistant préféré, non ? 🐙😄` });
    pool.push({ id: 'g13', text: `${np}si tu as besoin de moi, je suis là. Sinon je me balade 🎵` });
    pool.push({ id: 'g14', text: `Rien de spécial à signaler${n} — et c'est une bonne nouvelle ! 😌` });
    pool.push({ id: 'g15', text: prenom ? `${prenom} + moncompagnon = équipe de choc 💪🐙` : `Toi + moi = équipe de choc 💪🐙` });
    pool.push({ id: 'g16', text: `Je ne suis qu'une mascotte${n}, mais j'espère te rendre la journée meilleure 😊` });
    pool.push({ id: 'g17', text: `${np}dis-moi, tu as pensé à boire un peu d'eau ? 💧` });
    pool.push({ id: 'g18', text: `On forme une belle équipe${n} ! 🤝` });
    pool.push({ id: 'g19', text: prenom ? `Je pense à toi, ${prenom} 💙` : `Je pense à vous 💙` });
    pool.push({ id: 'g20', text: `${np}une belle journée se construit moment par moment ✨` });
    pool.push({ id: 'g21', text: `Respire${n} — tout va bien se passer 🌬️` });
    pool.push({ id: 'g22', text: `La clé du bonheur au bureau${n} ? Une bonne tasse de café et un bon agenda 😄` });
    pool.push({ id: 'g23', text: `${np}j'espère que tu as le sourire aujourd'hui 😊` });
    pool.push({ id: 'g24', text: noRes ? `Journée sans RDV${n} — c'est une journée pour faire avancer les dossiers 📂` : `Journée chargée${n} ? Tu gères, j'en suis certain·e 💪` });
    pool.push({ id: 'g25', text: `Je suis fier·e de toi${n} 🌟` });
    pool.push({ id: 'g26', text: prenom ? `${prenom}, chaque jour tu fais de ton mieux — c'est tout ce qu'on demande 💙` : `Chaque jour, tu fais de ton mieux — c'est tout ce qu'on demande 💙` });
    pool.push({ id: 'g27', text: `Tu es plus fort·e que tu ne le crois${n} 💪` });
    pool.push({ id: 'g28', text: `${np}n'oublie pas : tu n'as pas à être parfait·e, juste présent·e 😊` });
    pool.push({ id: 'g29', text: `Un jour à la fois${n} — c'est comme ça qu'on avance 🚶` });
    pool.push({ id: 'g30', text: prenom ? `${prenom} — je suis vraiment content·e que tu sois là aujourd'hui 💙` : `Content·e que vous soyez là aujourd'hui 💙` });

    // ── Spécifique CPAS ─────────────────────────────────────────────
    if (isCpas) {
      pool.push({ id: 'c1',  text: `Un sourire, c'est le meilleur accueil pour un bénéficiaire 😊` });
      pool.push({ id: 'c2',  text: `Patience et écoute font toute la différence 🤝` });
      pool.push({ id: 'c3',  text: `Chaque dossier, c'est une personne qui compte sur toi${n} 💙` });
      pool.push({ id: 'c4',  text: `Prendre soin de soi, c'est mieux aider les autres 🌱` });
      pool.push({ id: 'c5',  text: `Le service social, c'est l'un des métiers les plus nobles${n} 🌟` });
      pool.push({ id: 'c6',  text: `Chaque bénéficiaire repart avec un peu de ton aide${n} 🤝` });
      pool.push({ id: 'c7',  text: `Ton travail fait une vraie différence dans des vies${n} 💪` });
      pool.push({ id: 'c8',  text: prenom ? `Merci pour tout ce que tu fais, ${prenom} — vraiment 🙏` : `Merci pour tout ce que vous faites — vraiment 🙏` });
      pool.push({ id: 'c9',  text: `Un dossier à la fois — c'est comme ça qu'on avance 📂` });
      pool.push({ id: 'c10', text: `Les files d'attente, ça se gère${n} ! Un ticket à la fois 🎫` });
      pool.push({ id: 'c11', text: `Tu sais écouter comme personne${n} 🎧` });
      pool.push({ id: 'c12', text: `Les bénéficiaires voient ton investissement${n} — même s'ils ne le disent pas 💙` });
      pool.push({ id: 'c13', text: `Le travail social, c'est invisible mais essentiel${n} 🌿` });
      pool.push({ id: 'c14', text: prenom ? `${prenom}, tu portes un métier difficile avec beaucoup de dignité 🙏` : `Vous portez un métier difficile avec beaucoup de dignité 🙏` });
      pool.push({ id: 'c15', text: `Derrière chaque ticket, il y a une histoire${n} — et tu en prends soin 💙` });
      pool.push({ id: 'c16', text: `La solidarité, c'est ce que tu incarnes chaque jour${n} 🤝` });
      pool.push({ id: 'c17', text: `${np}les petits gestes font les grandes différences dans la vie des gens 🌱` });
      pool.push({ id: 'c18', text: `Travailler pour les autres demande une grande générosité${n} — tu l'as 💙` });
      pool.push({ id: 'c19', text: noRes ? `Journée calme${n} — c'est aussi de la préparation pour mieux aider demain 📝` : `RDV après RDV${n} — tu es là pour chacun. Bravo 💪` });
      pool.push({ id: 'c20', text: prenom ? `${prenom}, ce que tu fais chaque jour, c'est du lien humain — et ça n'a pas de prix 💛` : `Ce que vous faites chaque jour, c'est du lien humain — et ça n'a pas de prix 💛` });
      pool.push({ id: 'c21', text: `N'oublie pas de prendre soin de toi aussi${n} — tu ne peux pas tout donner sans te ressourcer 🌿` });
      pool.push({ id: 'c22', text: `Chaque "merci" d'un bénéficiaire, c'est grâce à toi${n} 💙` });
      pool.push({ id: 'c23', text: `L'accueil chaleureux que tu offres${n} — ça compte plus qu'on ne le dit 🤗` });
      if (weekday === 1) pool.push({ id: 'c_mon', text: `Bon lundi${n} ! Les bénéficiaires comptent sur toi cette semaine 💪` });
      if (weekday === 5) pool.push({ id: 'c_fri', text: `Belle semaine${n} ! Tu as bien aidé autour de toi 💙` });
      if (weekday === 3) pool.push({ id: 'c_wed', text: `Milieu de semaine${n} — les bénéficiaires ont besoin de toi jusqu'au bout ! 💙` });
    }

    // ── Météo contextuelle (~22 % de chance) ─────────────────────────
    if (typeof WEATHER !== 'undefined' && WEATHER.get() && DB.getFeature('enableWeather') && Math.random() < 0.22) {
      const wxPool = WEATHER.getPhrases(prenom);
      if (wxPool.length) {
        const wx = this._pickWeighted(wxPool);
        this._recordPhrase(wx.id);
        return wx.text;
      }
    }

    const p = this._pickWeighted(pool);
    this._recordPhrase(p.id);
    return p.text;
  },

  // ── Phrase d'au revoir contextuelle ─────────────────────────────
  _getGoodbyePhrase(agentName) {
    const now     = new Date();
    const hour    = now.getHours();
    const weekday = now.getDay(); // 0=dim, 5=ven, 6=sam
    const isCpas  = DB.getFeature('isCpas');
    const prenom  = agentName ? agentName.split(' ')[0] : null;
    const n  = prenom ? ` ${prenom}` : '';
    const np = prenom ? `${prenom}, ` : '';

    // Prochain jour ouvré
    const nwd = DB.getNextWorkDay();
    const demain = nwd?.delta === 1 ? 'demain' : (nwd?.label ?? 'bientôt');
    const aDemain = `à ${demain}`;

    const pool = [];

    // ── Vendredi → week-end ──────────────────────────────────────
    if (weekday === 5) {
      pool.push({ id: 'bye_fri1', text: `Bon week-end${n} ! Tu l'as bien mérité 🎉` });
      pool.push({ id: 'bye_fri2', text: `${np}c'est le week-end ! Déconnecte complètement — tu reviendras rechargé·e 🔋` });
      pool.push({ id: 'bye_fri3', text: prenom ? `${prenom} quitte le navire — bon week-end à toi ! ⛵🎊` : `Bon week-end à toi ! ⛵🎊` });
      pool.push({ id: 'bye_fri4', text: `Vendredi soir${n} — profite bien, tu l'as mérite 100 fois ! 🌙` });
      pool.push({ id: 'bye_fri5', text: `${np}deux jours pour toi maintenant — repose-toi vraiment 🛋️` });
    }

    // ── Veille de jour férié / long week-end ────────────────────
    if (weekday === 4) {
      pool.push({ id: 'bye_thu1', text: `Bonne soirée${n} — demain presque vendredi ! 🏁` });
      pool.push({ id: 'bye_thu2', text: `${np}belle fin de semaine, le week-end approche 😊` });
    }

    // ── Fin de journée par heure ─────────────────────────────────
    if (hour < 13) {
      pool.push({ id: 'bye_noon1', text: `Bonne après-midi${n} ! À bientôt 🌤️` });
      pool.push({ id: 'bye_noon2', text: `${np}tu pars tôt aujourd'hui ? Profites-en bien 😊` });
      pool.push({ id: 'bye_noon3', text: `À plus${n} ! Bonne continuation de journée 🌟` });
    } else if (hour < 17) {
      pool.push({ id: 'bye_pm1', text: `Bonne fin d'après-midi${n} ! ${aDemain.charAt(0).toUpperCase() + aDemain.slice(1)} 🌤️` });
      pool.push({ id: 'bye_pm2', text: `${np}belle fin de journée — profite du reste de l'après-midi ☀️` });
      pool.push({ id: 'bye_pm3', text: `${aDemain.charAt(0).toUpperCase() + aDemain.slice(1)}${n} — tu as bien assuré aujourd'hui 💪` });
    } else if (hour < 19) {
      pool.push({ id: 'bye_eve1', text: `Bonne soirée${n} ! Rentre bien 🏠` });
      pool.push({ id: 'bye_eve2', text: `${np}belle soirée devant toi — tu l'as bien méritée 🌙` });
      pool.push({ id: 'bye_eve3', text: `${aDemain.charAt(0).toUpperCase() + aDemain.slice(1)}${n} ! Repose-toi bien ce soir 😴` });
      pool.push({ id: 'bye_eve4', text: prenom ? `${prenom} tire sa révérence — ${aDemain} ! 🎩✨` : `On tire sa révérence — ${aDemain} ! 🎩✨` });
    } else {
      pool.push({ id: 'bye_late1', text: `Bonne nuit${n} ! Tu as bien bossé 🌙` });
      pool.push({ id: 'bye_late2', text: `${np}il est tard — va te reposer, tu l'as bien mérité 😴` });
      pool.push({ id: 'bye_late3', text: `${aDemain.charAt(0).toUpperCase() + aDemain.slice(1)}${n} — prends soin de toi cette nuit 🌙` });
    }

    // ── Général au revoir ────────────────────────────────────────
    pool.push({ id: 'bye_g1', text: `Au revoir${n} ! C'était une belle journée 🌟` });
    pool.push({ id: 'bye_g2', text: `${np}${aDemain} — belle soirée à toi 😊` });
    pool.push({ id: 'bye_g3', text: prenom ? `Prends soin de toi, ${prenom} 💙` : `Prends soin de toi 💙` });
    pool.push({ id: 'bye_g4', text: `${np}bonne fin de journée ! Tu as fait du bon travail 💼` });
    pool.push({ id: 'bye_g5', text: prenom ? `À bientôt, ${prenom} ! 👋` : `À bientôt ! 👋` });
    pool.push({ id: 'bye_g6', text: `La journée s'achève${n} — belle soirée 🌙` });
    pool.push({ id: 'bye_g7', text: `${np}je garde le bureau au chaud pour ${demain} 🐙` });
    pool.push({ id: 'bye_g8', text: `Merci pour cette journée${n} — ${aDemain} ! 🙏` });
    pool.push({ id: 'bye_g9', text: prenom ? `${prenom}, tu as fait de belles choses aujourd'hui 💛` : `Tu as fait de belles choses aujourd'hui 💛` });
    pool.push({ id: 'bye_g10', text: `${np}pose-toi ce soir — ${demain} est un autre beau jour ✨` });

    // ── CPAS ────────────────────────────────────────────────────
    if (isCpas) {
      pool.push({ id: 'bye_cpas1', text: `${np}tu as aidé des gens aujourd'hui — c'est précieux 💙` });
      pool.push({ id: 'bye_cpas2', text: `Belle journée${n} ! Les bénéficiaires auront été entre de bonnes mains 🤝` });
      pool.push({ id: 'bye_cpas3', text: prenom ? `Merci pour tout ce que tu fais, ${prenom} — rentre bien 🙏` : `Merci pour tout ce que tu fais — rentre bien 🙏` });
    }

    // ── Météo au retour (si dispo) ───────────────────────────────
    if (typeof WEATHER !== 'undefined' && WEATHER.get() && DB.getFeature('enableWeather')) {
      const w = WEATHER.get();
      if (w.type === 'rainy' || w.type === 'showery')
        pool.push({ id: 'bye_wx_rain', text: `🌧️ Il pleut encore dehors${n} — n'oublie pas le parapluie au retour !` });
      if (w.type === 'snowy' || w.type === 'snowshower')
        pool.push({ id: 'bye_wx_snow', text: `❄️ Attention à la neige sur le chemin du retour${n} — sois prudent·e !` });
      if (w.type === 'stormy')
        pool.push({ id: 'bye_wx_storm', text: `⛈️ Orage dehors${n} — attends que ça se calme si tu peux !` });
      if (w.type === 'sunny' || w.type === 'mostlyClear')
        pool.push({ id: 'bye_wx_sun', text: `☀️ Belle fin de journée dehors${n} — profites-en pour rentrer au soleil 😊` });
      if (w.temp >= 28)
        pool.push({ id: 'bye_wx_hot', text: `🥵 ${w.temp}°C dehors${n} — hydrate-toi bien sur le chemin du retour 💧` });
      if (w.temp <= 2)
        pool.push({ id: 'bye_wx_cold', text: `🥶 ${w.temp}°C dehors${n} — couvre-toi bien en sortant ! 🧣` });
    }

    // ── Phrases selon le poste ───────────────────────────────────
    const agentKey  = sessionStorage.getItem('cpas_current_agent_key');
    const introType = this._getAgentIntroType(agentKey);
    const roleGb = {
      __direction__:   [
        { id: 'bye_dir1', text: `Bonne soirée${n} ! Votre service a tourné à merveille aujourd'hui 👑` },
        { id: 'bye_dir2', text: `${np}vous pouvez partir l'esprit tranquille — tout s'est bien passé ✨` },
      ],
      __admin__:       [
        { id: 'bye_adm1', text: `Bonne soirée${n} ! Sans toi, rien ne tourne comme il faut — merci ⚙️` },
        { id: 'bye_adm2', text: `${np}tu as géré — ${aDemain} pour de nouvelles aventures 🔧` },
      ],
      __chef_service__:[
        { id: 'bye_cs1', text: `Bien joué${n} ! Ton équipe a bien tourné aujourd'hui — ${aDemain} 💼` },
        { id: 'bye_cs2', text: `${np}bonne coordination aujourd'hui — repose-toi et ${aDemain} 🟢` },
      ],
      __as__:          [
        { id: 'bye_as1', text: `${np}tu as fait du bien aujourd'hui — c'est pas rien. Repose-toi bien 💙` },
        { id: 'bye_as2', text: `Merci${n} pour tout ce que tu fais pour les gens — ${aDemain} 🤝` },
      ],
      __accueil__:     [
        { id: 'bye_acc1', text: `${np}tu as été le premier sourire de beaucoup de gens aujourd'hui — merci 💙` },
        { id: 'bye_acc2', text: `Belle journée d'accueil${n} ! ${aDemain.charAt(0).toUpperCase()+aDemain.slice(1)} 🌟` },
      ],
      __technicien__:  [
        { id: 'bye_tec1', text: `${np}tout tourne encore grâce à toi — ${aDemain} 🔧` },
        { id: 'bye_tec2', text: `Bonne soirée${n} ! Aucun bug critique aujourd'hui — succès total 💻` },
      ],
      __entretien__:   [
        { id: 'bye_ent1', text: `${np}les bureaux sont nickel — bonne soirée et merci 🌿` },
        { id: 'bye_ent2', text: `Bonne fin de journée${n} ! Sans toi, l'endroit ne serait pas si accueillant ✨` },
      ],
      __juriste__:     [
        { id: 'bye_jur1', text: `Bonne soirée${n} ! Le droit a bien été défendu aujourd'hui ⚖️` },
        { id: 'bye_jur2', text: `${np}dossiers bien gérés — ${aDemain} ! 🟢` },
      ],
    };
    pool.push(...(roleGb[introType] || []));

    const p = this._pickWeighted(pool);
    this._recordPhrase(p.id);
    return p.text;
  },

  // ── Conseil à la demande (adapté au rôle) ───────────────────────
  _getTip() {
    const agentKey = sessionStorage.getItem('cpas_current_agent_key');
    const roleId   = agentKey ? (DB.getAgentPermRole(agentKey) || '__agent__') : '__agent__';
    const isCpas   = DB.getFeature('isCpas');

    const adminTips = [
      { id: 'tip_adm1', text: 'Paramètres → Modules pour activer/désactiver chaque fonctionnalité 🔧' },
      { id: 'tip_adm2', text: 'Paramètres → Rôles & Permissions pour définir qui fait quoi ⚙️' },
      { id: 'tip_adm3', text: 'Envoie une notification à tous les agents depuis Paramètres → 📣 Envoyer une notification' },
      { id: 'tip_adm4', text: 'Les couleurs et emojis des agents se configurent dans Paramètres → 🎨 Agents' },
      { id: 'tip_adm5', text: 'Le message du jour s\'affiche sur l\'accueil de tous les agents 📌' },
      { id: 'tip_adm6', text: 'Clique sur le titre de l\'app dans le header pour accéder rapidement aux paramètres ⚙️' },
    ];
    const accueilTips = [
      { id: 'tip_acc1', text: 'En vue Direct, glisse-dépose les cartes pour réorganiser la file 🖱️' },
      { id: 'tip_acc2', text: '"Appeler le suivant" dans la vue Direct passe automatiquement au numéro suivant ⏭️' },
      { id: 'tip_acc3', text: 'Clique sur une carte de ticket pour voir les détails 🔍' },
      { id: 'tip_acc4', text: 'La vue publique s\'affiche sur l\'écran d\'attente — active-la depuis les Paramètres 🖥️' },
    ];
    const agentTips = [
      { id: 'tip_agt1', text: 'Le bouton 🔕 dans le header met toutes tes notifications en pause (mode absent)' },
      { id: 'tip_agt2', text: 'Exporte ton agenda en iCal pour l\'importer dans Google Agenda ou Apple Calendrier 📅' },
      { id: 'tip_agt3', text: 'En vue Jour, glisse-dépose tes réservations pour les déplacer 🗓️' },
      { id: 'tip_agt4', text: 'La cloche 🔔 dans le header affiche toutes tes notifications récentes' },
      { id: 'tip_agt5', text: 'Déclare-toi dans ton bureau sur l\'accueil pour que tes collègues te trouvent 📍' },
      { id: 'tip_agt6', text: 'Consulte la vue "Qui est où" en haut de l\'accueil pour savoir où sont tes collègues 🗺' },
    ];
    const cpasGenTips = isCpas ? [
      { id: 'tip_cpas1', text: 'Utilise le champ commentaire de la réservation pour noter les besoins spéciaux 📝' },
      { id: 'tip_cpas2', text: 'Les agents invités sur un RDV reçoivent les mêmes rappels que l\'agent principal 🔔' },
    ] : [];

    let pool;
    if (roleId === '__admin__')        pool = [...adminTips, ...agentTips];
    else if (roleId === '__accueil__') pool = [...accueilTips, ...agentTips];
    else                               pool = [...agentTips];
    pool = [...pool, ...cpasGenTips];

    const p = this._pickWeighted(pool);
    this._recordPhrase(p.id);
    return p.text;
  },

  // ── Yeux qui suivent la souris ───────────────────────────────────
  _initEyeTracking() {
    const track = (x, y) => {
      if (this._eyeFrame) cancelAnimationFrame(this._eyeFrame);
      this._eyeFrame = requestAnimationFrame(() => this._trackEyes(x, y));
    };
    document.addEventListener('mousemove', e => track(e.clientX, e.clientY));
    document.addEventListener('touchmove', e => {
      const t = e.touches[0];
      if (t) track(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('mouseleave', () => this._resetPupils());
  },

  _trackEyes(mouseX, mouseY) {
    const svg = document.getElementById('hsMascotSvg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const vbParts = (svg.getAttribute('viewBox') || '0 0 100 118').split(' ');
    const vbW = parseFloat(vbParts[2]) || 100;
    const vbH = parseFloat(vbParts[3]) || 118;
    const scaleX = rect.width  / vbW;
    const scaleY = rect.height / vbH;

    svg.querySelectorAll('.mc-pupil').forEach(pupil => {
      const origCx = parseFloat(pupil.dataset.origCx ?? (pupil.dataset.origCx = pupil.getAttribute('cx')));
      const origCy = parseFloat(pupil.dataset.origCy ?? (pupil.dataset.origCy = pupil.getAttribute('cy')));

      const pxPage = rect.left + origCx * scaleX;
      const pyPage = rect.top  + origCy * scaleY;
      const dx = mouseX - pxPage;
      const dy = mouseY - pyPage;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return;

      const maxOffset = 2.8; // SVG units max travel
      const strength  = Math.min(1, dist / (80 * scaleX));
      pupil.setAttribute('cx', String(origCx + (dx / dist) * maxOffset * strength));
      pupil.setAttribute('cy', String(origCy + (dy / dist) * maxOffset * strength));
    });
  },

  _resetPupils() {
    const svg = document.getElementById('hsMascotSvg');
    if (!svg) return;
    svg.querySelectorAll('.mc-pupil').forEach(pupil => {
      if (pupil.dataset.origCx) pupil.setAttribute('cx', pupil.dataset.origCx);
      if (pupil.dataset.origCy) pupil.setAttribute('cy', pupil.dataset.origCy);
    });
  },

  // ── Présentation de la mascotte (première rencontre) ────────────
  _hasMet(mascotId, agentKey) {
    return !!localStorage.getItem(`mc_met_${mascotId}_${agentKey}`);
  },
  _markMet(mascotId, agentKey) {
    localStorage.setItem(`mc_met_${mascotId}_${agentKey}`, '1');
  },
  _getIntroPhrase(mascotName, prenom) {
    const n  = prenom ? ` ${prenom}` : '';
    const np = prenom ? `${prenom}, ` : '';
    const phrases = [
      prenom
        ? `Salut ${prenom} ! Moi c'est ${mascotName} — ton compagnon du quotidien 😊`
        : `Salut ! Moi c'est ${mascotName} — ton compagnon du quotidien 😊`,
      prenom
        ? `${prenom} ! Je me présente : je m'appelle ${mascotName}. Enchanté·e ! 🤝`
        : `Je me présente : je m'appelle ${mascotName}. Enchanté·e ! 🤝`,
      `Bonjour${n} ! Je suis ${mascotName}, et je serai là chaque jour 💙`,
      prenom
        ? `${prenom} — je m'appelle ${mascotName} et je suis ravi·e de te rencontrer ! 🌟`
        : `Je m'appelle ${mascotName} et je suis ravi·e de te rencontrer ! 🌟`,
      `Ah${n}, tu es là ! Je suis ${mascotName} — on va bien s'entendre 😄`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  },

  // ── Afficher la bulle ────────────────────────────────────────────
  _showBubble(text) {
    const bubble  = document.getElementById('hsMascotBubble');
    const textEl  = document.getElementById('hsMascotBubbleText');
    if (!bubble || !textEl) return;
    textEl.textContent = text;
    bubble.classList.remove('hidden', 'hs-bubble-new');
    // Relancer l'animation CSS
    void bubble.offsetWidth;
    bubble.classList.add('hs-bubble-new');
    this._lastPhrase   = text;
    this._lastPhraseAt = Date.now();
  },

  // ── Mettre à jour la bulle (appelé par render + timer) ──────────
  // ── Bonjour du jour (une seule fois par jour par agent) ─────────
  _bonjourKey(agentKey) {
    return `mc_bonjour_${agentKey}_${new Date().toISOString().slice(0, 10)}`;
  },
  _hasSaidBonjourToday(agentKey) {
    if (localStorage.getItem(this._bonjourKey(agentKey))) return true;
    // Si déjà connecté dans Firebase (rechargement de page, localStorage vidé…)
    // → considérer le bonjour comme déjà dit pour éviter le rappel intempestif
    if (typeof DB !== 'undefined' && DB.isConnectedToday?.(agentKey)) {
      this._markSaidBonjourToday(agentKey);
      return true;
    }
    return false;
  },
  _markSaidBonjourToday(agentKey) { localStorage.setItem(this._bonjourKey(agentKey), '1'); },

  // Résout l'introType d'un agent (built-in roleId, ou introType du rôle custom, ou __agent__ par défaut)
  _getAgentIntroType(agentKey) {
    if (!agentKey || agentKey === 'anon' || typeof DB === 'undefined') return '__agent__';
    const roleId   = DB.getAgentPermRole?.(agentKey) || '__agent__';
    const builtins = new Set(['__direction__','__admin__','__chef_service__','__as__','__accueil__','__agent__','__technicien__','__entretien__','__juriste__']);
    if (builtins.has(roleId)) return roleId;
    return DB.getPermRoles?.()?.[roleId]?.introType || '__agent__';
  },

  _getBonjourPhrase(agentName, mascotName) {
    const now     = new Date();
    const weekday = now.getDay();
    const hour    = now.getHours();
    const prenom  = agentName ? agentName.split(' ')[0] : null;
    const n  = prenom ? ` ${prenom}` : '';
    const np = prenom ? `${prenom}, ` : '';

    const pool = [
      // ── Notifier l'arrivée (thème principal) ──────────────────────
      { id: 'bj_n1',  text: prenom ? `Bonjour ${prenom} ! Je préviens tout de suite que tu es arrivé·e 📣` : `Bonjour ! Je préviens que tu es arrivé·e 📣` },
      { id: 'bj_n2',  text: `${np}je mets ton statut à jour — te voilà officellement présent·e ! ✅` },
      { id: 'bj_n3',  text: `Arrivée enregistrée${n} ! Je note ça dans mes tablettes 📋` },
      { id: 'bj_n4',  text: prenom ? `${prenom} est dans la place — je ${G('le', 'la')} signale à toute l'équipe ! 🎉` : `Tu es dans la place — je le signale à toute l'équipe ! 🎉` },
      { id: 'bj_n5',  text: `${np}présence confirmée ! Je t'inscris comme arrivé·e 🟢` },
      { id: 'bj_n6',  text: `Top${n}, tu es là ! Je marque ton arrivée illico 🚀` },
      { id: 'bj_n7',  text: `${np}je t'attendais ! Arrivée enregistrée — bonne journée 😊` },
      { id: 'bj_n8',  text: prenom ? `${prenom} connecté·e — mission du jour : commencer ! ✅` : `Connecté·e — mission du jour : commencer ! ✅` },
      { id: 'bj_n9',  text: `Bonjour${n} ! Je note ton arrivée et je te laisse t'installer ☕` },
      { id: 'bj_n10', text: `${np}c'est noté — tu es là ! La journée peut vraiment commencer 🌅` },

      // ── Bonjour chaleureux ─────────────────────────────────────────
      { id: 'bj_w1',  text: genf(`Bonjour${n} ! Content·e de te voir aujourd'hui 😊`) },
      { id: 'bj_w2',  text: `${np}bonjour ! J'espère que tu vas bien ce matin ☀️` },
      { id: 'bj_w3',  text: prenom ? `Ah, ${prenom} ! Bonjour bonjour ! 🌟` : `Ah, bonjour bonjour ! 🌟` },
      { id: 'bj_w4',  text: `Bonjour${n} ! Une nouvelle journée, un nouveau départ 🌈` },
      { id: 'bj_w5',  text: `${np}te voilà ! Bonjour et bienvenue pour cette belle journée 💙` },

      // ── Selon l'heure ──────────────────────────────────────────────
      ...(hour < 8 ? [
        { id: 'bj_h1', text: `Déjà là${n} ? De bonne heure ! Je note ton arrivée matinale ⏰` },
        { id: 'bj_h2', text: `${np}lève-tôt ! Arrivée enregistrée — café d'abord ? ☕` },
      ] : hour < 10 ? [
        { id: 'bj_h3', text: `Bonjour${n} ! Belle heure pour commencer — je préviens que tu es là 🟢` },
        { id: 'bj_h4', text: `${np}bonne arrivée ! Je t'inscris comme présent·e pour la journée ✅` },
      ] : hour < 12 ? [
        { id: 'bj_h5', text: `Arrivée en milieu de matinée${n} — je note ça ! ☀️` },
        { id: 'bj_h6', text: `${np}te voilà ! Mieux vaut tard que jamais — je marque ton arrivée 😄` },
      ] : [
        { id: 'bj_h7', text: `Bonjour${n} ! (ou presque bonsoir 😄) — arrivée enregistrée !` },
        { id: 'bj_h8', text: `${np}début de service en après-midi — je note que tu es là 🟢` },
      ]),

      // ── Selon le jour ──────────────────────────────────────────────
      ...(weekday === 1 ? [
        { id: 'bj_d1', text: `Bon lundi${n} ! Le retour du week-end — je note ton arrivée courageuse 💪` },
        { id: 'bj_d2', text: `${np}lundi matin, déjà là ! Je préviens l'équipe que tu es revenu·e 🦁` },
      ] : weekday === 5 ? [
        { id: 'bj_d3', text: `Bonjour${n} ! Dernier jour de la semaine — je te marque présent·e 🎉` },
        { id: 'bj_d4', text: `${np}vendredi ! Je note ton arrivée — plus qu'une journée avant le week-end 🏁` },
      ] : []),

      // ── Avec nom de mascotte ───────────────────────────────────────
      { id: 'bj_m1', text: prenom ? `${prenom} ! C'est ${mascotName} — je te souhaite la bienvenue et je préviens que tu es là 🌟` : `C'est ${mascotName} — bonjour et arrivée enregistrée ! 🌟` },
      { id: 'bj_m2', text: `Bonjour${n} ! ${mascotName} de service — ton arrivée est bien notée ✅` },
    ];

    // ── Phrases contextuelles selon le poste ──────────────────────────
    const agentKey  = sessionStorage.getItem('cpas_current_agent_key');
    const introType = this._getAgentIntroType(agentKey);
    const roleBj = {
      __direction__:   [
        { id: 'bj_dir1', text: `Bonjour${n} ! Tout le service est sous votre commandement — belle journée, Directeur·ice 👑` },
        { id: 'bj_dir2', text: `${np}la journée commence sous votre direction ! Arrivée enregistrée ✨` },
      ],
      __admin__:       [
        { id: 'bj_adm1', text: `Bonjour${n} ! Chef·fe des opérations en ligne — arrivée enregistrée ⚙️` },
        { id: 'bj_adm2', text: `${np}l'admin est là — je préviens l'équipe ! On peut vraiment commencer 🔧` },
      ],
      __chef_service__:[
        { id: 'bj_cs1', text: `Bonjour${n} ! Le service peut vraiment démarrer — je te marque présent·e 💼` },
        { id: 'bj_cs2', text: `${np}chef·fe en place ! Arrivée enregistrée — bonne coordination aujourd'hui 🟢` },
      ],
      __as__:          [
        { id: 'bj_as1', text: `Bonjour${n} ! Une nouvelle journée pour accompagner les gens 💙 Arrivée enregistrée` },
        { id: 'bj_as2', text: `${np}les bénéficiaires sont entre de bonnes mains aujourd'hui — je te marque présent·e ✅` },
      ],
      __accueil__:     [
        { id: 'bj_acc1', text: `Bonjour${n} ! Le poste d'accueil est en ligne — je te marque présent·e 🌟` },
        { id: 'bj_acc2', text: `${np}première ligne activée ! Les bénéficiaires vont apprécier — arrivée enregistrée 💙` },
      ],
      __technicien__:  [
        { id: 'bj_tec1', text: genf(`Bonjour${n} ! Le·la technicien·ne est là — tout va bien fonctionner aujourd'hui 🔧`) },
        { id: 'bj_tec2', text: `${np}arrivée enregistrée ! Prêt·e à dépanner l'univers ? 💻` },
      ],
      __entretien__:   [
        { id: 'bj_ent1', text: `Bonjour${n} ! Merci d'être là — je note ton arrivée 🌿` },
        { id: 'bj_ent2', text: `${np}te voilà ! Grâce à toi, tout sera impeccable — arrivée enregistrée ✨` },
      ],
      __juriste__:     [
        { id: 'bj_jur1', text: `Bonjour${n} ! Le droit est bien gardé aujourd'hui — arrivée enregistrée ⚖️` },
        { id: 'bj_jur2', text: `${np}juriste en place ! Je préviens l'équipe de ton arrivée 🟢` },
      ],
    };
    pool.push(...(roleBj[introType] || []));

    const p = this._pickWeighted(pool);
    this._recordPhrase(p.id);
    return p.text;
  },

  // ── Rappels "dis-moi bonjour" avant l'arrivée ────────────────────
  _getNotYetBonjourPhrase(agentName, mascotName) {
    const prenom = agentName ? agentName.split(' ')[0] : null;
    const n  = prenom ? ` ${prenom}` : '';
    const np = prenom ? `${prenom}, ` : '';
    const pool = [
      { id: 'nyb1',  text: `Psst${n}… dis-moi bonjour pour que je signale ton arrivée ! 👋` },
      { id: 'nyb2',  text: `${np}n'oublie pas de me saluer — c'est comme ça que je sais que tu es là 😊` },
      { id: 'nyb3',  text: `Je ne t'ai pas encore dit bonjour aujourd'hui${n} ! Un petit clic et je préviens tout le monde 🟢` },
      { id: 'nyb4',  text: `Hé${n} ! Je ne t'ai pas encore marqué·e présent·e — dis-moi bonjour d'abord 👋` },
      { id: 'nyb5',  text: `${np}ta présence n'est pas encore signalée. Un bonjour suffit ! 😄` },
      { id: 'nyb6',  text: prenom ? `${prenom} ! Je suis là mais je t'ai pas encore dit bonjour officiellement 🙈` : `Je suis là mais je ne t'ai pas encore dit bonjour officiellement 🙈` },
      { id: 'nyb7',  text: `Un bonjour${n} et je marque ton arrivée — promis c'est rapide ! 📣` },
      { id: 'nyb8',  text: `${np}clique sur moi pour qu'on se dise bonjour et que je te mette en présent·e 🎯` },
      { id: 'nyb9',  text: `Je t'attends${n} ! Un petit bonjour et ta journée démarre officiellement 🌅` },
      { id: 'nyb10', text: prenom ? `${prenom}, ${mascotName} attend ton bonjour du matin ! 🐙` : `${mascotName} attend ton bonjour du matin ! 🐙` },
      { id: 'nyb11', text: `${np}sans bonjour, je ne peux pas signaler que tu es là — aide-moi à t'aider 😊` },
      { id: 'nyb12', text: `Tu es là${n} mais pas encore "officiel·le" — un clic sur moi pour changer ça 👇` },
    ];

    // ── Phrases contextuelles selon le poste ──────────────────────────
    const agentKey  = sessionStorage.getItem('cpas_current_agent_key');
    const introType = this._getAgentIntroType(agentKey);
    const roleNyb   = {
      __direction__:  [{ id: 'nyb_dir1', text: `${np}même Madame/Monsieur la Directrice doit me dire bonjour ! Un petit clic suffit 😄` }],
      __admin__:      [{ id: 'nyb_adm1', text: `${np}l'admin est arrivé·e mais pas encore officiel·le — un clic et c'est réglé ⚙️` }],
      __chef_service__:[{ id: 'nyb_cs1',  text: `${np}le service ne peut pas vraiment commencer sans ton bonjour — allez ! 💼` }],
      __as__:         [{ id: 'nyb_as1',  text: `${np}tes bénéficiaires comptent sur toi — dis-moi bonjour pour démarrer officiellement 💙` }],
      __accueil__:    [{ id: 'nyb_acc1', text: `${np}le poste d'accueil attend ! Dis-moi bonjour pour que je te mette en service 🌟` }],
      __technicien__: [{ id: 'nyb_tec1', text: `${np}le technicien·ne est là mais pas encore enregistré·e — un clic et c'est bon 🔧` }],
      __entretien__:  [{ id: 'nyb_ent1', text: `Bonjour${n} ! Tu es là ? Dis-le moi et je note ton arrivée 🌿` }],
      __juriste__:    [{ id: 'nyb_jur1', text: `${np}la loi attend, mais moi aussi ! Dis-moi bonjour d'abord ⚖️` }],
    };
    pool.push(...(roleNyb[introType] || []));

    const p = this._pickWeighted(pool);
    this._recordPhrase(p.id);
    return p.text;
  },

  // ── Déclencher le bonjour explicitement (clic mascotte) ──────────
  _firstBonjourKey(agentKey) { return `mc_first_bonjour_${agentKey}`; },
  _isFirstEverBonjour(agentKey) { return !localStorage.getItem(this._firstBonjourKey(agentKey)); },
  _markFirstBonjour(agentKey) { localStorage.setItem(this._firstBonjourKey(agentKey), '1'); },

  sayBonjour(agentName) {
    const agentKey = sessionStorage.getItem('cpas_current_agent_key') || 'anon';
    if (agentKey === 'anon') return;
    const mascotId = (typeof DB !== 'undefined' && DB.getMascotId) ? DB.getMascotId() : 'poulpe';
    const mascot   = MASCOTS[mascotId] || MASCOTS.poulpe;

    const firstEver = this._isFirstEverBonjour(agentKey);

    this._markSaidBonjourToday(agentKey);
    DB.markConnectedToday(agentKey);
    this._showBubble(this._getBonjourPhrase(agentName, mascot.name));
    this._lastPhraseAt = Date.now();

    // Premier bonjour de la première connexion → présentation du rôle d'assistant
    if (firstEver) {
      this._markFirstBonjour(agentKey);
      const prenom = agentName ? agentName.split(' ')[0] : null;
      const n = prenom ? ` ${prenom}` : '';
      const onboardingMsgs = [
        `Je suis là pour t'aider à prendre l'application en main, en douceur 💡 Je te glisserai des petits conseils régulièrement — tu peux aussi en demander un à tout moment !`,
        `Je serai ton guide${n} ! Je t'apprendrai les fonctionnalités pas à pas et je te donnerai des astuces au fil des jours 🌟 Tu peux cliquer sur "💡 Astuce" quand tu veux !`,
        `Mon rôle${n} : t'aider à maîtriser l'application en douceur, à ton rythme 😊 Je te ferai des petits rappels et conseils réguliers — pas de pression !`,
      ];
      setTimeout(() => {
        this._showBubble(onboardingMsgs[Math.floor(Math.random() * onboardingMsgs.length)]);
      }, 4500);
    }
  },

  // ── Bloquer une action si bonjour pas dit ────────────────────────
  _requireBonjour(action) {
    const agentKey  = sessionStorage.getItem('cpas_current_agent_key');
    if (!agentKey || this._hasSaidBonjourToday(agentKey)) { action(); return; }
    const agentName = document.getElementById('hsGreeting')?.dataset?.agentName || '';
    const prenom    = agentName ? agentName.split(' ')[0] : null;
    const n         = prenom ? ` ${prenom}` : '';
    const msgs = [
      `Un petit bonjour d'abord${n} ! 👋 Clique sur moi pour signaler ton arrivée.`,
      `Impossible de faire ça sans dire bonjour d'abord${n} ! 🙈 Un clic sur moi suffit.`,
      `${prenom ? prenom + ', ' : ''}dis-moi bonjour en cliquant sur moi — ensuite tu pourras tout faire 😊`,
      `Hé${n} ! Ta présence n'est pas encore signalée — clique sur moi d'abord 👇`,
    ];
    this._showBubble(msgs[Math.floor(Math.random() * msgs.length)]);
    document.getElementById('hsMascotSvg')?.classList.add('needs-bonjour');
  },

  _updateBubble(agentName, myRes) {
    const agentKey  = sessionStorage.getItem('cpas_current_agent_key') || 'anon';
    const mascotId  = (typeof DB !== 'undefined' && DB.getMascotId) ? DB.getMascotId() : 'poulpe';
    const mascot    = MASCOTS[mascotId] || MASCOTS.poulpe;
    const prenom    = agentName ? agentName.split(' ')[0] : null;

    // Priorité absolue : bonjour pas encore dit → rappel permanent
    if (agentKey !== 'anon' && !this._hasSaidBonjourToday(agentKey)) {
      const text = this._getNotYetBonjourPhrase(agentName, mascot.name);
      if (text !== this._lastPhrase) this._showBubble(text);
      return;
    }

    // Première rencontre avec cette mascotte → phrase d'introduction
    if (!this._hasMet(mascotId, agentKey)) {
      this._markMet(mascotId, agentKey);
      this._showBubble(this._getIntroPhrase(mascot.name, prenom));
      return;
    }

    const now  = new Date();
    const diff = Date.now() - this._lastPhraseAt;
    if (diff < 30000 && this._lastPhrase) return;

    // Rotation habituelle
    const text = this._getMascotPhrase(agentName, myRes, now);
    if (text !== this._lastPhrase) this._showBubble(text);
  },

  init() {
    if (this._initialized) return;
    this._initialized = true;

    // ─ Date ─────────────────────────────────────────────────────────
    const now = new Date();
    const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    document.getElementById('hsDate').textContent =
      `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

    // ─ Yeux qui suivent la souris ────────────────────────────────────
    this._initEyeTracking();

    // ─ Clic sur la mascotte → bonjour du jour ───────────────────────
    document.getElementById('hsMascotSvg')?.addEventListener('click', () => {
      const agentKey  = sessionStorage.getItem('cpas_current_agent_key');
      const agentName = document.getElementById('hsGreeting')?.dataset?.agentName || '';
      if (agentKey && !this._hasSaidBonjourToday(agentKey)) {
        this.sayBonjour(agentName);
        this.render(); // met à jour statut + bouton
        // Si le rôle de l'agent permet d'annoncer son arrivée, ouvrir la modale
        if (DB.hasPermission('canAnnounceArrival')) {
          setTimeout(() => _openArrivalAnnounceModal(agentName), 600);
        }
      }
    });

    // ─ Bouton "Demander un conseil" ──────────────────────────────────
    document.getElementById('hsAskTip')?.addEventListener('click', () => {
      const tip = this._getTip();
      this._showBubble(tip);
    });

    // ─ Bouton "🎯 Focus" ─────────────────────────────────────────────
    document.getElementById('hsFocusBtn')?.addEventListener('click', () => {
      if (window.MascotBrain?._state === 'concentrating') window.MascotBrain.exitFocus();
      else window.MascotBrain?.enterFocus?.();
    });

    // ─ Bouton "🎉 Inviter mes amis" (admin uniquement) ───────────────
    document.getElementById('hsPartyBtn')?.addEventListener('click', () => {
      window.MascotBrain?.triggerParty?.();
    });

    // ─ Panneau test animations mascotte (admin uniquement) ───────────
    const mascotTestBtn   = document.getElementById('hsMascotTestBtn');
    const mascotTestPanel = document.getElementById('msMascotTestPanel');
    mascotTestBtn?.addEventListener('click', () => {
      mascotTestPanel?.classList.toggle('hidden');
    });
    mascotTestPanel?.querySelectorAll('[data-state]').forEach(btn => {
      btn.addEventListener('click', () => {
        const state = btn.dataset.state;
        const acc   = btn.dataset.acc || null;
        if (!window.MascotBrain) return;
        // Forcer l'état directement
        MascotBrain._state    = 'idle';
        MascotBrain._priority = 99;
        const texts = BRAIN_TEXTS?.[state] || [];
        MascotBrain._applyState(state, 1, acc || null,
          texts.length ? texts : [`[Test] État : ${state}`]);
        // Mettre en surbrillance le bouton actif
        mascotTestPanel.querySelectorAll('[data-state]').forEach(b => b.style.borderColor = '');
        btn.style.borderColor = '#60a5fa';
      });
    });
    document.getElementById('msTestVisitBtn')?.addEventListener('click', () => {
      window.MascotBrain?.triggerParty?.();
    });

    // ─ Bouton refresh APIs (admin) ───────────────────────────────────
    document.getElementById('hsWeatherRefresh')?.addEventListener('click', async () => {
      const btn = document.getElementById('hsWeatherRefresh');
      if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
      const { lat, lon } = DB.getOrgCoords();
      if (typeof WEATHER !== 'undefined' && lat && lon) {
        await WEATHER.forceRefresh(lat, lon);
      }
      if (btn) { btn.textContent = '↺'; btn.disabled = false; }
      HOME.render();
    });

    // ─ Bouton "Ma journée est terminée" ─────────────────────────────
    document.getElementById('hsGoodbye')?.addEventListener('click', async () => {
      const agentKey  = sessionStorage.getItem('cpas_current_agent_key');
      const agentName = document.getElementById('hsGreeting')?.dataset?.agentName || '';
      const isDone    = DB.getAgentStatus(agentKey)?.status === 'done';
      if (isDone) {
        // Retour en présent → révoquer le grant temporaire si applicable
        await _revokeMyTempAdmin(agentKey, agentName);
        await DB.markConnectedToday(agentKey);
        await DB.setAgentStatus(agentKey, null);
        const prenom = agentName ? agentName.split(' ')[0] : null;
        const n = prenom ? ` ${prenom}` : '';
        const backPhrases = [
          `Ah${n}, tu es de retour ! 😄`,
          `Rebonjour${n} ! On repart ? 💪`,
          `${prenom ? `${prenom} de` : 'De'} retour — la journée continue ! 🌟`,
          `Bienvenue à nouveau${n} ! 🙌`,
          `${prenom ? `${prenom}, r` : 'R'}ebonjour ! Tu t'étais trompé·e ? 😄`,
        ];
        this._showBubble(backPhrases[Math.floor(Math.random() * backPhrases.length)]);
      } else {
        await DB.setAgentStatus(agentKey, 'done');
        const msg = this._getGoodbyePhrase(agentName);
        this._showBubble(msg);
        // Si l'agent est admin → proposer un admin temporaire
        const roleId = DB.getAgentPermRole(agentKey);
        if (roleId === '__admin__') {
          await _promptTempAdmin(agentKey, agentName);
        }
      }
    });

    // ─ Mode sobre — Bonjour / Au revoir ─────────────────────────────
    document.getElementById('hsSimpleBonjour')?.addEventListener('click', async () => {
      const agentKey  = sessionStorage.getItem('cpas_current_agent_key');
      const agentName = document.getElementById('hsGreeting')?.dataset?.agentName || '';
      const isDone    = DB.getAgentStatus(agentKey)?.status === 'done';
      if (isDone) {
        await DB.setAgentStatus(agentKey, null);
        showToast('Bonjour, bienvenue ! ✓', 'ok');
      } else {
        showToast('Vous êtes déjà enregistré·e comme présent·e', 'info');
      }
    });
    document.getElementById('hsSimpleAurevoir')?.addEventListener('click', async () => {
      const agentKey  = sessionStorage.getItem('cpas_current_agent_key');
      const agentName = document.getElementById('hsGreeting')?.dataset?.agentName || '';
      const isDone    = DB.getAgentStatus(agentKey)?.status === 'done';
      if (!isDone) {
        await DB.setAgentStatus(agentKey, 'done');
        const roleId = DB.getAgentPermRole(agentKey);
        if (roleId === '__admin__') await _promptTempAdmin(agentKey, agentName);
        showToast('Au revoir — bonne journée ! 👋', 'ok');
      } else {
        showToast('Vous avez déjà terminé votre journée', 'info');
      }
    });

    // ─ Bouton "Point météo" ──────────────────────────────────────────
    document.getElementById('hsAskWeather')?.addEventListener('click', () => {
      const agentName = document.getElementById('hsGreeting')?.dataset?.agentName || '';
      const prenom    = agentName ? agentName.split(' ')[0] : null;
      if (typeof WEATHER === 'undefined' || !WEATHER.get()) {
        this._showBubble('🌡️ Météo indisponible — aucune localisation configurée.');
        return;
      }
      const wxPool = WEATHER.getPhrases(prenom);
      if (!wxPool.length) { this._showBubble('🌡️ Pas de données météo pour le moment.'); return; }
      const wx = this._pickWeighted(wxPool);
      this._recordPhrase(wx.id);
      this._showBubble(wx.text);
    });

    // ─ Rafraîchir la bulle toutes les 45 s quand l'accueil est visible ─
    setInterval(() => {
      const screen = document.getElementById('homeScreen');
      if (!screen || screen.classList.contains('hidden')) return;
      this._lastPhraseAt = 0; // forcer le refresh
      this.render();
    }, 45000);

    // ─ Personnalisation widgets ──────────────────────────────────────
    document.getElementById('hsCustomizeBtn')?.addEventListener('click', () => {
      const agentKey = sessionStorage.getItem('cpas_current_agent_key');
      if (agentKey) _openCustomizeModal(agentKey);
    });
    document.getElementById('hsCustomizeClose')?.addEventListener('click', () => {
      document.getElementById('hsCustomizeOverlay').classList.add('hidden');
    });
    document.getElementById('hsCustomizeOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'hsCustomizeOverlay')
        document.getElementById('hsCustomizeOverlay').classList.add('hidden');
    });

    // ─ Se déclarer dans un bureau — lieu + cartes toggle ─────────────
    document.getElementById('hsDeclLieuSelect').addEventListener('change', () => {
      this._renderDeclCards();
      this._renderQueueGroups();
    });
    document.getElementById('hsDeclCards').addEventListener('click', e => {
      // Bouton kick admin
      const kickBtn = e.target.closest('.hs-decl-kick-btn');
      if (kickBtn) {
        e.stopPropagation();
        const localId     = parseInt(kickBtn.dataset.kickLocal);
        const kickAgentKey = kickBtn.dataset.kickAgent;
        const label        = DB.getLocalLabel(localId);
        const isBusy       = DB.getQueue(localId) >= 1 || DB.isBureauBusyWithPreferred(localId);
        if (isBusy) {
          const agentNameBusy = DB.getAgentDisplayName(kickAgentKey) || kickAgentKey;
          showBureauConfirm({ icon: '🔴', title: 'Consultation en cours',
            info: `<strong>${escapeHtml(label)}</strong> est actuellement avec un bénéficiaire.<br>En tant qu'administrateur, vous pouvez forcer le retrait.`,
            okLabel: '⚡ Forcer le retrait', okClass: 'ok-danger',
            onOk: async () => {
              await DB.closeBureau(localId);
              await DB.sendNotif(
                `⚠️ Un administrateur vous a retiré du local "${label}" pendant une consultation. Pensez à quitter le local.`,
                'urgent', kickAgentKey
              );
              showToast(`${agentNameBusy} retiré de force de ${label} ✓`);
            },
          });
          return;
        }
        const agentName = DB.getAgentDisplayName(kickAgentKey) || kickAgentKey;
        showBureauConfirm({
          icon: '⚠️', title: `Retirer ${escapeHtml(agentName)} ?`,
          info: `Voulez-vous retirer <strong>${escapeHtml(agentName)}</strong> du local <strong>${escapeHtml(label)}</strong> ?<br><br>L'agent recevra une notification.`,
          okLabel: 'Retirer', okClass: 'ok-danger',
          onOk: async () => {
            await DB.closeBureau(localId);
            await DB.sendNotif(
              `⚠️ Un administrateur vous a retiré du local "${label}". Pensez à quitter le local par vous-même.`,
              'info', kickAgentKey
            );
            showToast(`${agentName} retiré de ${label} ✓`);
          },
        });
        return;
      }
      const card = e.target.closest('[data-local-id]');
      if (!card) return;
      const localId = parseInt(card.dataset.localId);
      if (!localId) return;
      this._requireBonjour(() => this._handleDeclClick(localId));
    });
  },

  render() {
    const screen = document.getElementById('homeScreen');
    if (!screen || screen.classList.contains('hidden')) return; // pas visible

    const agentKey  = sessionStorage.getItem('cpas_current_agent_key');
    const agents    = DB.getAgentsWithKeys();
    const agentObj  = agents.find(a => a.key === agentKey);
    const agentName = agentObj?.name || null;

    // ─ Salutation ────────────────────────────────────────────────────
    const greetEl = document.getElementById('hsGreeting');
    // ─ Indicateur météo (admin uniquement) ──────────────────────────
    const wxInd = document.getElementById('hsWeatherIndicator');
    if (wxInd && DB.hasPermission('editSettings') && DB.getFeature('enableWeather')) {
      const { lat, lon } = DB.getOrgCoords();
      const wxData = typeof WEATHER !== 'undefined' ? WEATHER.get() : null;
      if (!lat || !lon) {
        wxInd.className = 'hs-weather-indicator hs-wx-warn';
        wxInd.title = 'Météo : aucune localisation configurée';
      } else if (!wxData) {
        wxInd.className = 'hs-weather-indicator hs-wx-error';
        wxInd.title = 'Météo : données indisponibles (API injoignable ?)';
      } else {
        wxInd.className = 'hs-weather-indicator hs-wx-ok';
        wxInd.title = `Météo active — ${wxData.temp}°C, ${wxData.label} (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
      }
      wxInd.classList.remove('hidden');
    } else if (wxInd) {
      wxInd.classList.add('hidden');
    }
    const wxRefreshBtn = document.getElementById('hsWeatherRefresh');
    if (wxRefreshBtn) wxRefreshBtn.classList.toggle('hidden', !DB.hasPermission('editSettings') || !DB.getFeature('enableWeather'));

    // ─ Glow bonjour ─────────────────────────────────────────────────
    const needsBonjour = !!(agentKey && !this._hasSaidBonjourToday(agentKey));
    document.getElementById('hsMascotSvg')?.classList.toggle('needs-bonjour', needsBonjour);
    document.getElementById('hsBonjourHint')?.classList.toggle('hidden', !needsBonjour);

    greetEl.dataset.agentName = agentName || '';
    if (agentName) {
      const emoji = DB.getAgentEmojiByKey(agentKey) || '👋';
      const color = DB.getAgentRoleColor(agentName) || null;
      const nameHtml = color
        ? `<span style="color:${color}">${escapeHtml(agentName)}</span>`
        : escapeHtml(agentName);
      greetEl.innerHTML = `Bonjour,&nbsp;${nameHtml} ${emoji}`;
    } else {
      greetEl.textContent = 'Bienvenue 👋';
    }

    // ─ Mon statut ────────────────────────────────────────────────────
    const myStatusEl = document.getElementById('hsMyStatus');
    if (myStatusEl && agentKey) {
      const st        = DB.getAgentStatus(agentKey);
      const connected = DB.isConnectedToday(agentKey);
      // Bureau ouvert
      const myBureau = DB.getOpenBureauForCurrentAgent?.() ?? null;
      const myBureauLabel = myBureau !== null ? DB.getLocalLabel(myBureau) : null;
      const myBureauLieu  = myBureau !== null ? DB.getLocalLieuName?.(myBureau) ?? '' : '';
      // Backoffice
      const allLieux = DB.getLieux();
      let boLabel = null;
      outer: for (const [, lieu] of Object.entries(allLieux)) {
        if (!lieu.isBackoffice) continue;
        for (const lid of lieu.localIds) {
          const pres = DB.getBackofficePresence(lid);
          if (pres[agentKey]) { boLabel = DB.getLocalLabel(lid); break outer; }
        }
      }

      let icon, text, cls;
      if (!connected) {
        icon = '⏳'; text = genf('Pas encore connecté·e aujourd\'hui'); cls = 'hs-status-notyet';
      } else if (st?.status === 'done') {
        const nwd = DB.getNextWorkDay();
        const nextLabel = nwd?.delta === 1 ? 'à demain !' : nwd ? `à ${nwd.label} !` : 'à bientôt !';
        icon = '🏁'; text = `Journée terminée — ${nextLabel}`; cls = 'hs-status-done';
      } else if (st?.status === 'absent') {
        icon = '❌'; text = 'Absent aujourd\'hui'; cls = 'hs-status-absent';
      } else if (st?.status === 'late') {
        icon = '🚶'; text = st.arrivalTime ? `En route — arrivée prévue ${st.arrivalTime}` : 'J\'arrive !'; cls = 'hs-status-late';
        // Permettre d'annuler le statut "en route" manuellement
        setTimeout(() => {
          const _cancelLate = document.getElementById('hsCancelLate');
          if (_cancelLate) _cancelLate.onclick = async () => {
            const _ak = sessionStorage.getItem('cpas_current_agent_key');
            if (_ak) { await DB.setAgentStatus(_ak, null); }
          };
        }, 0);
      } else if (myBureauLabel) {
        icon = '🟢'; text = `Bureau ouvert — ${myBureauLabel}${myBureauLieu ? ` · ${myBureauLieu}` : ''}`; cls = 'hs-status-open';
      } else if (boLabel) {
        icon = '🏢'; text = `En backoffice — ${boLabel}`; cls = 'hs-status-bo';
      } else {
        icon = '✅'; text = 'Présent aujourd\'hui'; cls = 'hs-status-present';
      }

      myStatusEl.className = `hs-my-status ${cls}`;
      const _cancelBtn = cls === 'hs-status-late' ? `<button class="hs-status-cancel" id="hsCancelLate" title="Annuler le statut En route">✕</button>` : '';
      myStatusEl.innerHTML = `<span class="hs-status-icon">${icon}</span><span class="hs-status-text">${text}</span>${_cancelBtn}`;
      myStatusEl.classList.remove('hidden');

      // Bouton au revoir / rebonjour selon statut
      const goodbyeBtn = document.getElementById('hsGoodbye');
      if (goodbyeBtn) {
        const isDone = st?.status === 'done';
        goodbyeBtn.textContent = isDone ? '👋 Rebonjour !' : '👋 Au revoir';
        goodbyeBtn.classList.toggle('hs-goodbye-back', isDone);
      }
    } else if (myStatusEl) {
      myStatusEl.classList.add('hidden');
    }

    // ─ Message du jour ───────────────────────────────────────────────
    const msg     = DB.getMessageJour();
    const msgCard = document.getElementById('hsMsgCard');
    if (msg) {
      document.getElementById('hsMsgText').textContent = msg;
      msgCard.classList.remove('hidden');
    } else {
      msgCard.classList.add('hidden');
    }

    // ─ Mon agenda du jour ────────────────────────────────────────────
    const agendaEl = document.getElementById('hsAgenda');
    if (agentName) {
      const todayS = new Date(); todayS.setHours(0,0,0,0);
      const todayE = new Date(); todayE.setHours(23,59,59,999);
      const todays = DB.getInRange(todayS, todayE)
        .filter(r => {
          const a = r.agent === 'Autre' ? r.agentCustom : r.agent;
          return a === agentName || (Array.isArray(r.agents) && r.agents.includes(agentName));
        })
        .sort((a, b) => (a._start||0) - (b._start||0));

      // ─ Détection chevauchements ──────────────────────────────────
      const warnSet = new Set();
      for (let i = 0; i < todays.length - 1; i++) {
        const a = todays[i], b = todays[i + 1];
        if (a._end && b._start && a._end > b._start) {
          warnSet.add(i);
          warnSet.add(i + 1);
        }
      }
      const hasOverlap = warnSet.size > 0;
      if (hasOverlap) {
        const todayKey = `cpas_overlap_notif_${new Date().toISOString().slice(0,10)}_${agentKey}`;
        if (!sessionStorage.getItem(todayKey)) {
          sessionStorage.setItem(todayKey, '1');
          DB.sendNotif(
            '⚠️ Chevauchement dans votre agenda du jour — vérifiez vos réservations.',
            'info', agentKey
          );
        }
      }

      // ─ Bulle mascotte ────────────────────────────────────────────
      this._updateBubble(agentName, todays);
      if (todays.length === 0) {
        agendaEl.innerHTML = '<div class="hs-agenda-empty">Aucune réservation aujourd\'hui</div>';
      } else {
        const now = new Date();
        // Trouver l'index avant lequel insérer la barre "maintenant"
        // Si now est pendant le créneau i → barre avant i
        // Si now est entre i et i+1 → barre après i (avant i+1)
        // Si now est après tout → pas de barre
        let nowLineIdx = -1;
        for (let i = 0; i < todays.length; i++) {
          if (now < todays[i]._end) { nowLineIdx = i; break; }
        }
        // Label au-dessus de la barre : "Événement en cours" ou "Prochain dans X h Y min"
        let nowLabel = '';
        if (nowLineIdx !== -1) {
          const r = todays[nowLineIdx];
          if (r._start <= now) {
            nowLabel = 'Événement en cours';
          } else {
            const diffMs  = r._start - now;
            const diffMin = Math.round(diffMs / 60000);
            const h       = Math.floor(diffMin / 60);
            const min     = diffMin % 60;
            nowLabel = 'Prochain' + (h > 0 ? ` dans ${h}h` : '') + (min > 0 ? ` ${min}min` : '');
          }
        }
        const nowLine = `<div class="hs-agenda-nowline">
          ${nowLabel ? `<div class="hs-agenda-nowlabel">${nowLabel}</div>` : ''}
          <div class="hs-agenda-nowbar"><span class="hs-agenda-nowdot"></span></div>
        </div>`;
        agendaEl.innerHTML = todays.map((r, i) => {
          const svc    = DB.getSvcLabel(r);
          const loc    = DB.getUnitLabel(parseInt(r.localId), r.deskId || null);
          const hm     = r._start?.toLocaleTimeString('fr-BE', { hour:'2-digit', minute:'2-digit' }) || '';
          const hme    = r._end?.toLocaleTimeString('fr-BE',   { hour:'2-digit', minute:'2-digit' }) || '';
          const active = r._start <= now && (r._end === null || r._end >= now);
          const warn   = warnSet.has(i);
          const line   = i === nowLineIdx ? nowLine : '';
          return `${line}<div class="hs-agenda-item${active ? ' hs-agenda-active' : ''}${warn ? ' hs-agenda-warn' : ''}"
            data-res-id="${r.id}" style="cursor:pointer">
            <div class="hs-agenda-time">${hm}${hme ? ` – ${hme}` : ''}</div>
            <div class="hs-agenda-info">
              <span class="hs-agenda-svc">${escapeHtml(svc)}</span>
              <span class="hs-agenda-loc">📍 ${escapeHtml(loc)}</span>
              ${warn ? '<span class="hs-agenda-overlap-badge">⚠️ Chevauchement</span>' : ''}
            </div>
          </div>`;
        }).join('');
        agendaEl.querySelectorAll('[data-res-id]').forEach(el => {
          el.addEventListener('click', () => MODAL.openDetail(el.dataset.resId));
        });
      }
    } else {
      agendaEl.innerHTML = '<div class="hs-agenda-empty">Connectez-vous pour voir votre agenda</div>';
    }

    // ─ Bureau d'accueil (local caché) — pour "Qui est où" uniquement ─
    const deskLocalId = DB.getAccueilDeskLocalId();

    // ─ Qui est où ────────────────────────────────────────────────────
    const presEl = document.getElementById('hsPresence');
    const lieux  = DB.getLieux();
    const presRows = [];
    const _assignedKeys = new Set(); // agents déjà positionnés quelque part

    // Accueil desk dans "Qui est où" si présence
    if (deskLocalId !== null) {
      const dp = DB.getBackofficePresence(deskLocalId);
      const dk = Object.keys(dp);
      if (dk.length > 0) {
        const dn = dk.map(k => agents.find(a => a.key === k)?.name || k);
        dk.forEach(k => _assignedKeys.add(k));
        presRows.push(`<div class="hs-pres-row hs-pres-desk">
          <span class="hs-pres-local">🪟 Accueil</span>
          <span class="hs-pres-lieu"></span>
          <span class="hs-pres-agents">${dn.map(n => `<span class="hs-pres-chip">${escapeHtml(n)}</span>`).join('')}</span>
        </div>`);
      }
    }
    Object.values(lieux).forEach(lieu => {
      lieu.localIds.forEach(localId => {
        if (DB.isLocalHidden(localId)) return;
        const localLabel = DB.getLocalLabel(localId);
        const lieuName   = lieu.name;
        if (lieu.isBackoffice && DB.getFeature('enableBackoffice')) {
          const presence = DB.getBackofficePresence(localId);
          const keys = Object.keys(presence);
          if (keys.length > 0) {
            const names = keys.map(k => agents.find(a => a.key === k)?.name || k);
            keys.forEach(k => _assignedKeys.add(k));
            presRows.push(`<div class="hs-pres-row hs-pres-bo">
              <span class="hs-pres-local">🏢 ${escapeHtml(localLabel)}</span>
              <span class="hs-pres-lieu">${escapeHtml(lieuName)}</span>
              <span class="hs-pres-agents">${names.map(n => `<span class="hs-pres-chip">${escapeHtml(n)}</span>`).join('')}</span>
            </div>`);
          }
        } else if (!lieu.isBackoffice) {
          if (DB.isBureauOpen(localId)) {
            const openKey  = DB.getBureauAgentKey(localId);
            const openName = openKey ? (agents.find(a => a.key === openKey)?.name || null) : null;
            const isMe     = openKey && openKey === agentKey;
            const isBusy   = DB.getQueue(localId) >= 1 || DB.isBureauBusyWithPreferred(localId);
            if (openKey) _assignedKeys.add(openKey);
            presRows.push(`<div class="hs-pres-row${isMe ? ' hs-pres-me' : ''}${isBusy ? ' hs-pres-busy' : ''}">
              <span class="hs-pres-local">${isBusy ? '🔴' : '🟢'} ${escapeHtml(localLabel)}${isBusy ? ' <span class="hs-pres-benef">· avec bénéf.</span>' : ''}</span>
              <span class="hs-pres-lieu">${escapeHtml(lieuName)}</span>
              <span class="hs-pres-agents">${openName ? `<span class="hs-pres-chip">${escapeHtml(openName)}${isMe ? ' ✓' : ''}</span>` : ''}</span>
            </div>`);
          }
        }
      });
    });

    // Agents connectés aujourd'hui mais sans bureau assigné
    const _freeAgents = DB.getConnectedTodayAgents().filter(k => {
      if (_assignedKeys.has(k)) return false;
      const st = DB.getAgentStatus(k);
      return st?.status !== 'done' && st?.status !== 'absent';
    });
    if (_freeAgents.length > 0) {
      const _freeNames = _freeAgents.map(k => agents.find(a => a.key === k)?.name || k);
      presRows.push(`<div class="hs-pres-row hs-pres-free">
        <span class="hs-pres-local">🟡 Présent·e</span>
        <span class="hs-pres-lieu">Sans bureau</span>
        <span class="hs-pres-agents">${_freeNames.map(n => `<span class="hs-pres-chip hs-pres-chip-free">${escapeHtml(n)}</span>`).join('')}</span>
      </div>`);
    }

    // Agents en mission ou formation — tous les agents, bureau ou non
    const _today = new Date().toISOString().slice(0, 10);
    const _missionAgents = [];
    const _formationAgents = [];
    agents.forEach(({ key, name }) => {
      const absEntry = DB.getAgentAbsenceOn(key, _today);
      if (!absEntry) return;
      const [, abs] = absEntry;
      if (abs.motif === 'mission') _missionAgents.push({ name, comment: abs.comment || null });
      else if (abs.motif === 'formation') _formationAgents.push({ name, comment: abs.comment || null });
    });
    if (_missionAgents.length > 0) {
      presRows.push(`<div class="hs-pres-row hs-pres-mission">
        <span class="hs-pres-local">🚗 En mission</span>
        <span class="hs-pres-lieu"></span>
        <span class="hs-pres-agents">${_missionAgents.map(a =>
          `<span class="hs-pres-chip hs-pres-chip-mission">${escapeHtml(a.name)}${a.comment ? `<span class="hs-pres-chip-comment"> — ${escapeHtml(a.comment)}</span>` : ''}</span>`
        ).join('')}</span>
      </div>`);
    }
    if (_formationAgents.length > 0) {
      presRows.push(`<div class="hs-pres-row hs-pres-formation">
        <span class="hs-pres-local">📚 En formation</span>
        <span class="hs-pres-lieu"></span>
        <span class="hs-pres-agents">${_formationAgents.map(a =>
          `<span class="hs-pres-chip hs-pres-chip-formation">${escapeHtml(a.name)}${a.comment ? `<span class="hs-pres-chip-comment"> — ${escapeHtml(a.comment)}</span>` : ''}</span>`
        ).join('')}</span>
      </div>`);
    }

    presEl.innerHTML = presRows.length
      ? presRows.join('')
      : '<div class="hs-agenda-empty">Aucun bureau ouvert</div>';

    // ─ Liste déroulante déclaration bureau ──────────────────────────
    this._renderDeclSelect();
    _renderExtraWidgets();
  },

  _renderDeclSelect() {
    const lieuSelect = document.getElementById('hsDeclLieuSelect');
    const currEl     = document.getElementById('hsDeclCurrent');
    if (!lieuSelect) return;

    const openBureau   = DB.getOpenBureauForCurrentAgent();
    const boLocal      = DB.getFeature('enableBackoffice') ? DB.getAgentCurrentPresenceLocal() : null;
    const currentLocal = openBureau ?? boLocal;

    // Badge bureau actuel
    if (currEl) {
      currEl.innerHTML = currentLocal !== null
        ? `<div class="hs-decl-current">📍 Bureau actuel : <strong>${escapeHtml(DB.getLocalLabel(currentLocal))}</strong></div>`
        : '';
    }

    // Populate lieu select (garde la sélection précédente ou sélectionne le lieu du bureau actuel)
    const lieux    = DB.getLieux();
    const prevVal  = lieuSelect.value;
    lieuSelect.innerHTML = '';
    Object.entries(lieux).forEach(([lieuId, lieu]) => {
      const opt = document.createElement('option');
      opt.value       = lieuId;
      opt.textContent = lieu.name;
      lieuSelect.appendChild(opt);
    });
    // Sélectionner le lieu contenant le bureau actuel si possible
    if (currentLocal !== null) {
      const lieuOfCurrent = Object.entries(lieux).find(([, l]) => l.localIds.includes(currentLocal));
      if (lieuOfCurrent) lieuSelect.value = lieuOfCurrent[0];
    } else if (prevVal && [...lieuSelect.options].some(o => o.value === prevVal)) {
      lieuSelect.value = prevVal;
    }

    this._renderDeclCards();
    this._renderQueueGroups();
  },

  _renderQueueGroups() {
    const el = document.getElementById('hsQueueGroups');
    if (!el) return;
    const groups = Object.entries(DB.getQueueGroups() || {});
    if (!groups.length) { el.innerHTML = '<div class="hs-qgrp-empty">Aucun groupe de file configuré.</div>'; return; }
    el.innerHTML = groups.map(([id, grp]) => {
      const lids    = (grp.localIds || []).map(Number);
      const total   = lids.length;
      const open    = lids.filter(l => DB.isBureauOpen(l)).length;
      const ovf     = DB.getGroupOverflowQueue(id);
      const statusCls = open === 0 ? 'hs-qgrp-row-closed' : open < total ? 'hs-qgrp-row-partial' : 'hs-qgrp-row-open';
      const statusDot = open === 0 ? '⚪' : open < total ? '🟡' : '🟢';
      return `<div class="hs-qgrp-row ${statusCls}">
        <span class="hs-qgrp-dot">${statusDot}</span>
        <span class="hs-qgrp-name">${escapeHtml(grp.name)}</span>
        <span class="hs-qgrp-bureaux">${open} / ${total} bureau${total > 1 ? 'x' : ''} ouvert${open > 1 ? 's' : open === 1 ? '' : 's'}</span>
        ${ovf > 0 ? `<span class="hs-qgrp-ovf">${ovf} en attente</span>` : ''}
      </div>`;
    }).join('');
  },

  _renderDeclCards() {
    const lieuSelect = document.getElementById('hsDeclLieuSelect');
    const cards      = document.getElementById('hsDeclCards');
    if (!lieuSelect || !cards) return;

    const agentKey   = sessionStorage.getItem('cpas_current_agent_key');
    const lieux      = DB.getLieux();
    const lieu       = lieux[lieuSelect.value];
    const openBureau = DB.getOpenBureauForCurrentAgent();
    const boLocal    = DB.getFeature('enableBackoffice') ? DB.getAgentCurrentPresenceLocal() : null;
    const currentLocal = openBureau ?? boLocal;

    if (!lieu) { cards.innerHTML = ''; return; }

    // Réservations du jour (badge) — toute réservation d'aujourd'hui, permanences toujours incluses
    const now  = new Date();
    const dayS = new Date(now); dayS.setHours(0, 0, 0, 0);
    const dayE = new Date(now); dayE.setHours(23, 59, 59, 999);
    const todayOccs = DB.getInRange(dayS, dayE);

    cards.innerHTML = lieu.localIds.map(localId => {
      const label = DB.getLocalLabel(localId);
      const isBO  = DB.getFeature('enableBackoffice') && DB.isLocalBackoffice(localId);
      let iAmHere = false;
      const occupantNames = [];

      if (isBO) {
        const pres = DB.getBackofficePresence(localId);
        Object.keys(pres).forEach(k => {
          if (k === agentKey) iAmHere = true;
          else occupantNames.push(DB.getAgentDisplayName(k) || '?');
        });
      } else {
        const oKey = DB.getBureauAgentKey(localId);
        if (oKey) {
          if (oKey === agentKey) iAmHere = true;
          else occupantNames.push(DB.getAgentDisplayName(oKey) || '?');
        }
      }

      const activeOcc  = todayOccs.find(r => Number(r.localId) === localId) || null;
      const isOccupied = occupantNames.length > 0;
      const isCurrent  = localId === currentLocal;
      const isBusy     = DB.getQueue(localId) >= 1 || DB.isBureauBusyWithPreferred(localId);

      // Files d'attente dont ce local fait partie
      const _localGrps = DB.getLocalGroups(localId);

      const cls = ['hs-decl-local',
        isCurrent  ? 'hs-decl-active'   : '',
        isOccupied ? 'hs-decl-occupied' : '',
        _localGrps.length ? 'hs-decl-has-perm' : '',
      ].filter(Boolean).join(' ');

      const lines = [];
      // Indicateur "avec un bénéficiaire"
      if (isBusy && (isCurrent || isOccupied))
        lines.push(`<div class="hs-decl-busy">🔴 Avec un bénéficiaire</div>`);

      if (isCurrent && occupantNames.length)
        lines.push(`<div class="hs-decl-me">✅ Vous + ${escapeHtml(occupantNames.join(', '))}</div>`);
      else if (isCurrent)
        lines.push(`<div class="hs-decl-me">✅ Vous êtes ici</div>`);
      else if (isOccupied)
        lines.push(`<div class="hs-decl-occ">👤 ${escapeHtml(occupantNames.join(', '))}</div>`);
      else
        lines.push(`<div class="hs-decl-avail">Libre</div>`);

      // Groupes de file d'attente
      if (_localGrps.length) {
        const grpBadges = _localGrps.map(g => {
          const ovf = DB.getGroupOverflowQueue(g.id);
          return `<span class="hs-decl-grp-badge">${escapeHtml(g.name)}${ovf > 0 ? ` <span class="hs-decl-grp-ovf">${ovf}</span>` : ''}</span>`;
        }).join('');
        lines.push(`<div class="hs-decl-grps">🔗 ${grpBadges}<span class="hs-decl-grp-legend">= personnes en attente</span></div>`);
      }

      const isAdmin    = DB.hasPermission('kickFromLocal');
      const kickTarget = !isBO && isOccupied && !isCurrent && isAdmin
        ? DB.getBureauAgentKey(localId) : null;
      const kickBtn = kickTarget
        ? `<button class="hs-decl-kick-btn" data-kick-local="${localId}" data-kick-agent="${kickTarget}" title="Retirer l'agent de ce local">✕</button>`
        : '';

      return `<div class="${cls}" data-local-id="${localId}">
        <div class="hs-decl-name-row">
          <span class="hs-decl-name">${escapeHtml(label)}</span>
          ${kickBtn}
        </div>
        ${lines.join('')}
      </div>`;
    }).join('') || '<div class="hs-decl-avail">Aucun bureau dans ce lieu.</div>';
  },

  _isBureauBusy(localId) {
    return DB.getQueue(localId) >= 1 || DB.isBureauBusyWithPreferred(localId);
  },

  _getActiveOccupancy(localId) {
    const now  = new Date();
    const dayS = new Date(now); dayS.setHours(0, 0, 0, 0);
    const dayE = new Date(now); dayE.setHours(23, 59, 59, 999);
    return DB.getInRange(dayS, dayE).find(r =>
      Number(r.localId) === localId && r._start <= now && (r._end === null || r._end > now)
    ) || null;
  },

  async _handleDeclClick(localId) {
    const agentKey = sessionStorage.getItem('cpas_current_agent_key');
    const isBO     = DB.getFeature('enableBackoffice') && DB.isLocalBackoffice(localId);
    const label    = DB.getLocalLabel(localId);

    if (isBO) {
      // Déjà présent ici → quitter
      if (agentKey && DB.isAgentPresentInLocal(localId, agentKey)) {
        if (this._isBureauBusy(localId)) {
          showBureauConfirm({ icon: '🔴', title: 'Consultation en cours',
            info: `Vous êtes actuellement avec un bénéficiaire dans <strong>${escapeHtml(label)}</strong>.<br>Terminez la consultation avant de quitter.`,
            okLabel: null }); return;
        }
        const _activeOcc = this._getActiveOccupancy(localId);
        if (_activeOcc) {
          showBureauConfirm({ icon: '🔒', title: 'Permanence en cours',
            info: `Une permanence est en cours dans <strong>${escapeHtml(label)}</strong>. Voulez-vous la terminer et quitter ?`,
            okLabel: 'Finir la permanence et quitter', okClass: 'ok-close',
            onOk: async () => { await DB.setAgentPresence(localId, false); this.render(); },
          }); return;
        }
        showBureauConfirm({ icon: '🚪', title: `Quitter ${escapeHtml(label)}`,
          info: `Voulez-vous quitter <strong>${escapeHtml(label)}</strong> ?`,
          okLabel: 'Quitter', okClass: 'ok-close',
          onOk: async () => { await DB.setAgentPresence(localId, false); this.render(); },
        }); return;
      }
      // Vérifier consultation en cours avant tout changement
      const _curOpen = DB.getOpenBureauForCurrentAgent();
      const _curBO   = DB.getAgentCurrentPresenceLocal();
      const _curBusy = _curOpen !== null ? _curOpen : _curBO;
      if (_curBusy !== null && _curBusy !== localId && this._isBureauBusy(_curBusy)) {
        showBureauConfirm({ icon: '🔴', title: 'Consultation en cours',
          info: `Vous êtes avec un bénéficiaire dans <strong>${escapeHtml(DB.getLocalLabel(_curBusy))}</strong>.<br>Terminez la consultation avant de changer de local.`,
          okLabel: null }); return;
      }

      // Quelqu'un d'autre déjà là → confirmer
      const pres    = DB.getBackofficePresence(localId);
      const others  = Object.keys(pres).filter(k => k !== agentKey)
                             .map(k => DB.getAgentDisplayName(k) || '?');
      const doJoin  = async () => {
        const prevLocal = DB.getAgentCurrentPresenceLocal();
        if (prevLocal !== null && prevLocal !== localId) await DB.setAgentPresence(prevLocal, false);
        const openBureau = DB.getOpenBureauForCurrentAgent();
        if (openBureau !== null) await DB.closeBureau(openBureau);
        await DB.setAgentPresence(localId, true);
        this.render();
      };
      if (others.length > 0) {
        showBureauConfirm({
          icon: '👥', title: `Rejoindre ${escapeHtml(label)}`,
          info: `<strong>${escapeHtml(others.join(', '))}</strong> est déjà présent(e) dans <strong>${escapeHtml(label)}</strong>.<br>Voulez-vous rejoindre ce local ?`,
          okLabel: 'Oui, rejoindre', okClass: 'ok-open', onOk: doJoin,
        });
      } else {
        // Changer de local si déjà ailleurs
        const prevLocal  = DB.getAgentCurrentPresenceLocal();
        if (prevLocal !== null && prevLocal !== localId) {
          const prevLabel = DB.getLocalLabel(prevLocal);
          showBureauConfirm({
            icon: '🔄', title: 'Changer de local',
            info: `Vous êtes déjà présent(e) à <strong>${escapeHtml(prevLabel)}</strong>. Voulez-vous changer ?`,
            okLabel: 'Oui, changer', okClass: 'ok-open', onOk: doJoin,
          }); return;
        }
        const openBureau = DB.getOpenBureauForCurrentAgent();
        if (openBureau !== null) {
          showBureauConfirm({
            icon: '🔄', title: 'Changer de local',
            info: `Vous êtes dans <strong>${escapeHtml(DB.getLocalLabel(openBureau))}</strong>. Voulez-vous changer ?`,
            okLabel: 'Oui, changer', okClass: 'ok-open', onOk: doJoin,
          }); return;
        }
        await doJoin();
      }
    } else {
      // Bureau normal
      const currAgentKey = DB.getBureauAgentKey(localId);
      // Déjà présent ici → confirmation avant de quitter
      if (currAgentKey === agentKey) {
        if (this._isBureauBusy(localId)) {
          showBureauConfirm({ icon: '🔴', title: 'Consultation en cours',
            info: `Vous êtes actuellement avec un bénéficiaire dans <strong>${escapeHtml(label)}</strong>.<br>Terminez la consultation avant de quitter.`,
            okLabel: null }); return;
        }
        const _activeOcc = this._getActiveOccupancy(localId);
        if (_activeOcc) {
          showBureauConfirm({ icon: '🔒', title: 'Permanence en cours',
            info: `Une permanence est en cours dans <strong>${escapeHtml(label)}</strong>. Voulez-vous la terminer et fermer le bureau ?`,
            okLabel: 'Finir la permanence et quitter', okClass: 'ok-close',
            onOk: async () => {
              await DB.clearBureauPause(localId);
              const pref = DB.getPreferredPending(localId);
              if (pref?.requestId) {
                await DB.cancelPreferredRequest(pref.requestId, localId);
                window._notifyPreferredCancelledOnClose?.(pref, label);
              }
              await DB.closeBureau(localId);
              this.render();
            },
          }); return;
        }
        showBureauConfirm({ icon: '🚪', title: `Quitter ${escapeHtml(label)}`,
          info: `Voulez-vous fermer <strong>${escapeHtml(label)}</strong> ?`,
          okLabel: 'Quitter', okClass: 'ok-close',
          onOk: async () => { await DB.closeBureau(localId); this.render(); },
        }); return;
      }
      // Bureau occupé par quelqu'un d'autre
      if (currAgentKey) {
        const otherName = DB.getAgentDisplayName(currAgentKey) || '?';
        showBureauConfirm({
          icon: '⚠️', title: `${escapeHtml(label)} est occupé`,
          info: `<strong>${escapeHtml(otherName)}</strong> est déjà dans <strong>${escapeHtml(label)}</strong>.<br>Vous ne pouvez pas rejoindre un bureau normal occupé.`,
          okLabel: null,
        }); return;
      }
      // Déjà dans un autre bureau ?
      const alreadyOpen = DB.getOpenBureauForCurrentAgent();
      if (alreadyOpen !== null && alreadyOpen !== localId) {
        showBureauConfirm({
          icon: '⚠️', title: 'Bureau déjà ouvert',
          info: `<div class="lv-bm-empty" style="color:#fbbf24">Vous êtes déjà dans <strong>${escapeHtml(DB.getLocalLabel(alreadyOpen))}</strong>.<br>Fermez ce bureau d'abord.</div>`,
          okLabel: null,
        }); return;
      }
      if (DB.getFeature('enableBackoffice')) {
        const boLocal = DB.getAgentCurrentPresenceLocal();
        if (boLocal !== null) {
          if (this._isBureauBusy(boLocal)) {
            showBureauConfirm({ icon: '🔴', title: 'Consultation en cours',
              info: `Vous êtes avec un bénéficiaire dans <strong>${escapeHtml(DB.getLocalLabel(boLocal))}</strong>.<br>Terminez la consultation avant de changer de local.`,
              okLabel: null }); return;
          }
          showBureauConfirm({
            icon: '🔄', title: 'Changer de local',
            info: `Vous êtes présent(e) à <strong>${escapeHtml(DB.getLocalLabel(boLocal))}</strong>. Voulez-vous changer ?`,
            okLabel: 'Oui, changer', okClass: 'ok-open',
            onOk: async () => {
              await DB.setAgentPresence(boLocal, false);
              await DB.openBureau(localId);
              this.render();
            },
          }); return;
        }
      }
      await DB.openBureau(localId);
      if (DB.getFeature('enableNotif')) {
        const _lieuName  = DB.getLocalLieuName(localId);
        const _localName = label;
        const _grp       = DB.getLocalGroup(localId);
        let _msg = `🟢 ${_localName}${_lieuName ? ` (${_lieuName})` : ''} vient d'ouvrir.`;
        if (!_grp) _msg += ` ⚠️ Pas de file partagée.`;
        await Promise.all(DB.getAccueilAgentKeys().map(k => DB.sendNotif(_msg, 'info', k)));
      }
      this.render();
    }
  },
};

// ─── Modal admin temporaire ────────────────────────────────────────
async function _promptTempAdmin(adminKey, adminName) {
  const overlay = document.getElementById('tempAdminOverlay');
  const select  = document.getElementById('tempAdminSelect');
  if (!overlay || !select) return;

  // Remplir la liste avec tous les agents sauf l'admin lui-même
  const agents = DB.getAgentsWithKeys().filter(a => a.key && a.key !== adminKey);
  select.innerHTML = '<option value="">— Aucun administrateur temporaire —</option>';
  agents.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.key;
    opt.textContent = a.name;
    select.appendChild(opt);
  });

  overlay.classList.remove('hidden');

  await new Promise(resolve => {
    const confirm = document.getElementById('tempAdminConfirm');
    const skip    = document.getElementById('tempAdminSkip');
    const closeX  = overlay.querySelector('[data-close="tempAdminOverlay"]');

    const close = () => {
      overlay.classList.add('hidden');
      confirm.removeEventListener('click', onConfirm);
      skip.removeEventListener('click', onSkip);
      closeX?.removeEventListener('click', onSkip);
    };

    const onConfirm = async () => {
      const chosenKey = select.value;
      close();
      if (!chosenKey) { resolve(); return; }

      await DB.setTempAdminGrant(chosenKey, adminKey);

      const chosenName = DB.getAgentsWithKeys().find(a => a.key === chosenKey)?.name || 'Agent';
      const adminPrenom = adminName ? adminName.split(' ')[0] : 'L\'admin';
      await DB.sendNotif(
        `⚙️ Tu es désigné·e administrateur·rice temporaire pendant l'absence de ${adminPrenom}. Tu recevras les notifications admin jusqu'à son retour.`,
        'info', chosenKey
      );
      resolve();
    };

    const onSkip = () => { close(); resolve(); };

    confirm.addEventListener('click', onConfirm);
    skip.addEventListener('click', onSkip);
    closeX?.addEventListener('click', onSkip);
  });
}

async function _revokeMyTempAdmin(adminKey, adminName) {
  const grant = DB.getTempAdminGrant();
  if (!grant || grant.grantedBy !== adminKey) return;
  await DB.revokeTempAdminGrant();
  const adminPrenom = adminName ? adminName.split(' ')[0] : 'L\'admin';
  await DB.sendNotif(
    `⚙️ Tes droits administrateur·rice temporaires ont été révoqués — ${adminPrenom} est de retour.`,
    'info', grant.grantedTo
  );
}

function applyFeatureFlags() {
  const show = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  };
  show('btnLive',             DB.getFeature('enableTickets'));
  show('btnPublic',           DB._config.features['enablePublicView'] !== false);
  show('btnPresenceHd',       DB.getFeature('enablePresence'));
  show('btnAnalytics',        DB.getFeature('enableAnalytics'));
  show('notifBell',           DB.getFeature('enableNotif'));
  show('btnDnd',              DB.getFeature('enableNotif'));
  show('btnCalendarExport',   DB.getFeature('enableCalendarSync') && !!sessionStorage.getItem('cpas_current_agent_key'));
  // Bouton personnaliser — visible uniquement si connecté
  const _customizeBtn = document.getElementById('hsCustomizeBtn');
  if (_customizeBtn) {
    const _ak = sessionStorage.getItem('cpas_current_agent_key');
    _customizeBtn.classList.toggle('hidden', !_ak || _ak === 'anon');
    if (_ak && _ak !== 'anon') { _applyRoleDefaultWidgets(_ak); _applyWidgetPrefs(_ak); }
  }
  // Bannière RDV intégrateur — visible par défaut, cachée si explicitement désactivée
  const _intBanner = document.getElementById('hsIntegratorBanner');
  if (_intBanner) {
    _intBanner.style.display = 'block'; // montrer immédiatement
    DB._ref('appConfig/integratorRdvEnabled').once('value').then(snap => {
      if (snap.val() === false) _intBanner.style.display = 'none';
    }).catch(() => {}); // erreur silencieuse — bannière reste visible
  }
  // Bouton météo (visible uniquement si météo activée et coords configurées)
  const wxBtn = document.getElementById('hsAskWeather');
  if (wxBtn) {
    const { lat, lon } = DB.getOrgCoords();
    const wxData = typeof WEATHER !== 'undefined' ? WEATHER.get() : null;
    wxBtn.classList.toggle('hidden', !DB.getFeature('enableWeather') || !wxData);
  }

  // Mode mascotte — afficher/cacher la scène mascotte vs mode sobre
  const mascotEnabled = DB.getFeature('enableMascot') !== false; // défaut true
  const mascotStage   = document.querySelector('.hs-mascot-stage');
  const simpleMode    = document.getElementById('hsSimpleMode');
  if (mascotStage) mascotStage.style.display = mascotEnabled ? '' : 'none';
  if (simpleMode)  simpleMode.classList.toggle('hidden', mascotEnabled);
  // En mode sobre, la cloche de notif du header reste visible même si mascotte cachée
  // (le bouton au-revoir est sur l'écran accueil uniquement)

  // Boutons mascotte réservés aux admins
  const _mascotAgentKey = sessionStorage.getItem('cpas_current_agent_key');
  const _mascotRole     = _mascotAgentKey ? (DB.getAgentPermRole?.(_mascotAgentKey) || '__agent__') : null;
  const _isMascotAdmin  = ['__admin__','__direction__','__chef_service__'].includes(_mascotRole);
  const partyBtn2 = document.getElementById('hsPartyBtn');
  if (partyBtn2) partyBtn2.style.display = _isMascotAdmin ? '' : 'none';
  const testBtn2 = document.getElementById('hsMascotTestBtn');
  if (testBtn2) testBtn2.style.display = _isMascotAdmin ? '' : 'none';

  // Onglet Planning — visible pour entretien/technicien ET les rôles avec viewAllPlanning
  const _planningAgentKey = sessionStorage.getItem('cpas_current_agent_key');
  const _planningRole     = _planningAgentKey ? (DB.getAgentPermRole?.(_planningAgentKey) || '__agent__') : null;
  const _isFieldAgent     = _planningRole === '__entretien__' || _planningRole === '__technicien__';
  const _canViewAllPl     = DB.hasPermission?.('viewAllPlanning');
  const _showPlanning     = (_isFieldAgent || _canViewAllPl) && DB.getFeature('enablePlanning');
  show('tabPlanning', _showPlanning);
  if (_showPlanning && DB.hasPermission?.('managePlanning')) {
    document.getElementById('plBtnAdd')?.classList.remove('hidden');
  }

  // Bouton Diffuser — permission sendNotif
  show('btnBroadcast', DB.hasPermission?.('sendNotif') || false);
}

// ─── Export iCal (Phase 5.6) ───────────────────────────────────
function _icalDate(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function _icalEsc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}
function generateIcal(agentName, reservations) {
  const stamp = _icalDate(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//moncompagnon.be//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${_icalEsc(document.getElementById('appOrgName')?.textContent || 'SiteCpas')} — ${_icalEsc(agentName)}`,
  ];
  Object.entries(reservations).forEach(([id, res]) => {
    const resAgent = res.agent === 'Autre' ? res.agentCustom : res.agent;
    if (resAgent !== agentName) return;
    if (!res.startDateTime || (!res.endDateTime && !res.isPermanent)) return;
    const start = new Date(res.startDateTime);
    const end   = res.endDateTime ? new Date(res.endDateTime) : new Date(res.startDateTime);
    if (!res.isPermanent && res.endDateTime) { /* OK */ }
    const svc   = DB.getSvcLabel(res);
    const local = DB.getLocalLabel(res.localId);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${id}@moncompagnon`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${_icalDate(start)}`);
    lines.push(`DTEND:${_icalDate(end)}`);
    lines.push(`SUMMARY:${_icalEsc(svc)} — ${_icalEsc(local)}`);
    if (res.comment) lines.push(`DESCRIPTION:${_icalEsc(res.comment)}`);
    lines.push(`LOCATION:${_icalEsc(local)}`);
    if (res.recurrence?.type && res.recurrence.type !== 'none') {
      const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' }[res.recurrence.type] || 'WEEKLY';
      const interval = parseInt(res.recurrence.interval) || 1;
      let rrule = `RRULE:FREQ=${freq};INTERVAL=${interval}`;
      if (res.recurrence.endDate) rrule += `;UNTIL=${_icalDate(new Date(res.recurrence.endDate + 'T23:59:59'))}`;
      lines.push(rrule);
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function updateOrgName() {
  DB._ref('appConfig/meta').once('value').then(snap => {
    const meta = snap.val() || {};
    const name = meta.name || ORG_ID;
    const el = document.getElementById('appOrgName');
    if (el) { el.textContent = name; document.title = `${name} — Réservation`; }
    if (meta.logoUrl) {
      const img = document.getElementById('appLogo');
      if (img) { img.src = meta.logoUrl; img.onerror = () => { img.src = 'assets/logo.jpg'; }; }
    }
  });
}

// ── Widget Manager — personnalisation de la page d'accueil ───────────────────

// Widgets affichés par défaut selon le rôle (premier login uniquement)
// Les IDs listés sont ceux qui seront CACHÉS — tout le reste est visible.
const WIDGET_ROLE_DEFAULTS = {
  '__accueil__':      ['agenda','declare','weather','upcoming','week','shortcuts','mission','notes','reminders'],
  '__as__':           ['presence','qgroups','weather','stats','waitstats','week','shortcuts','notes'],
  '__admin__':        ['agenda','declare','qgroups','weather','stats','waitstats','mission','notes','reminders'],
  '__direction__':    ['agenda','declare','qgroups','weather','upcoming','shortcuts','mission','notes','reminders'],
  '__chef_service__': ['declare','qgroups','weather','stats','waitstats','shortcuts','mission','notes','reminders'],
  '__technicien__':   ['presence','qgroups','weather','stats','waitstats','upcoming','week','shortcuts','notes','reminders'],
  '__entretien__':    ['agenda','presence','declare','qgroups','weather','stats','waitstats','shortcuts','mission','notes','reminders'],
  '__juriste__':      ['presence','declare','qgroups','weather','stats','waitstats','week','shortcuts','mission','notes'],
  '__agent__':        ['presence','qgroups','weather','stats','waitstats','week','shortcuts','mission','notes','reminders'],
};

function _applyRoleDefaultWidgets(agentKey) {
  // N'intervenir que si aucune préférence n'a jamais été sauvegardée (premier login)
  if (localStorage.getItem(_widgetKey(agentKey)) !== null) return;
  const role    = DB.getAgentPermRole(agentKey) || '__agent__';
  const hidden  = WIDGET_ROLE_DEFAULTS[role] || WIDGET_ROLE_DEFAULTS['__agent__'];
  _setHiddenWidgets(agentKey, hidden);
}

const WIDGETS = [
  { id: 'agenda',    label: '📅 Mon agenda du jour',              selector: '.hs-widget-agenda',    width: 'half' },
  { id: 'presence',  label: '🗺 Qui est où',                      selector: '.hs-widget-presence',  width: 'half' },
  { id: 'declare',   label: '📍 Me déclarer dans un bureau',      selector: '.hs-widget-declare',   width: 'full' },
  { id: 'qgroups',   label: '🔗 Permanences de service ouvertes', selector: '.hs-widget-qgroups',   width: 'full' },
  { id: 'weather',   label: '🌤 Météo',                           selector: '.hs-widget-weather',   width: 'half' },
  { id: 'stats',     label: '📊 Stats du jour',                   selector: '.hs-widget-stats',     width: 'half' },
  { id: 'waitstats', label: '⏱ Temps d\'attente moyen',          selector: '.hs-widget-waitstats', width: 'half' },
  { id: 'upcoming',  label: '⏰ Prochaines réservations',         selector: '.hs-widget-upcoming',  width: 'full' },
  { id: 'notifs',    label: '🔔 Dernières notifications',         selector: '.hs-widget-notifs',    width: 'half' },
  { id: 'week',      label: '📋 Planning de la semaine',          selector: '.hs-widget-week',      width: 'full' },
  { id: 'shortcuts', label: '🔗 Mes raccourcis',                  selector: '.hs-widget-shortcuts', width: 'full' },
  { id: 'mission',   label: '🚗 Partir en mission',               selector: '.hs-widget-mission',   width: 'full' },
  { id: 'notes',     label: '📝 Notes rapides',                  selector: '.hs-widget-notes',     width: 'half' },
  { id: 'reminders', label: '✅ Rappels du jour',                 selector: '.hs-widget-reminders', width: 'half' },
];

// ── Définition des raccourcis disponibles ───────────────────────────
const HS_SC_DEFS = [
  { id: 'calendar', label: '📅 Calendrier',  sub: 'Planning',        click: () => { document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'day')); _showCalView('day'); } },
  { id: 'live',     label: '📋 Vue direct',  sub: 'File d\'attente', click: () => LIVE.open() },
  { id: 'new',      label: '➕ Réserver',    sub: 'Nouveau créneau', click: () => document.getElementById('btnNew')?.click() },
  { id: 'status',   label: '👤 Statut',      sub: 'Ma présence',     click: () => document.getElementById('btnPresenceHd')?.click() },
  { id: 'notifs',   label: '🔔 Notifs',      sub: 'Notifications',   click: () => NOTIF.togglePanel?.() },
  { id: 'panic',    label: '🚨 Urgence',     sub: 'Bouton panique',  click: () => document.getElementById('panicBtn')?.click() },
];
const HS_SC_DEFAULT = ['calendar', 'new', 'live', 'status'];

function _scKey(agentKey)       { return `cpas_sc_${agentKey}`; }
function _getScPrefs(agentKey)  {
  try { const s = localStorage.getItem(_scKey(agentKey)); return s ? JSON.parse(s) : HS_SC_DEFAULT; }
  catch { return HS_SC_DEFAULT; }
}
function _setScPrefs(agentKey, ids) { localStorage.setItem(_scKey(agentKey), JSON.stringify(ids)); }

function _renderShortcutsWidget(agentKey) {
  const el = document.getElementById('hsCustomShortcuts');
  if (!el) return;
  const enabled = _getScPrefs(agentKey);
  const visible = HS_SC_DEFS.filter(s => enabled.includes(s.id));
  if (!visible.length) {
    el.innerHTML = '<div class="hs-sc-empty">Aucun raccourci sélectionné — cliquez ✏️ pour en ajouter.</div>';
    return;
  }
  el.innerHTML = visible.map(s => `
    <button class="hs-sc-btn" data-sc="${s.id}">
      <span class="hs-sc-icon">${s.label.split(' ')[0]}</span>
      <span class="hs-sc-label">${s.label.split(' ').slice(1).join(' ')}</span>
      <span class="hs-sc-sub">${escapeHtml(s.sub)}</span>
    </button>`).join('');
  el.querySelectorAll('.hs-sc-btn').forEach(btn => {
    const def = HS_SC_DEFS.find(s => s.id === btn.dataset.sc);
    if (def) btn.addEventListener('click', def.click);
  });
}

let _scEditOpen = false;
function _initShortcutsEdit() {
  const btn = document.getElementById('hsScEditBtn');
  if (!btn) return;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (_scEditOpen) { document.getElementById('hsScPopover')?.remove(); _scEditOpen = false; return; }
    const agentKey = sessionStorage.getItem('cpas_current_agent_key') || 'anon';
    const enabled = _getScPrefs(agentKey);
    const pop = document.createElement('div');
    pop.id = 'hsScPopover';
    pop.className = 'hs-sc-popover';
    pop.innerHTML = HS_SC_DEFS.map(s => `
      <label class="hs-sc-pop-row">
        <input type="checkbox" data-sc="${s.id}" ${enabled.includes(s.id) ? 'checked' : ''}>
        <span>${s.label}</span>
      </label>`).join('');
    pop.querySelectorAll('input').forEach(cb => {
      cb.addEventListener('change', () => {
        const ak2 = sessionStorage.getItem('cpas_current_agent_key') || 'anon';
        const newEnabled = HS_SC_DEFS.filter(s => pop.querySelector(`[data-sc="${s.id}"]`)?.checked).map(s => s.id);
        _setScPrefs(ak2, newEnabled);
        _renderShortcutsWidget(ak2);
      });
    });
    btn.parentElement.appendChild(pop);
    _scEditOpen = true;
    setTimeout(() => document.addEventListener('click', function _close(e) {
      if (pop.contains(e.target)) return;
      pop.remove(); _scEditOpen = false; document.removeEventListener('click', _close);
    }), 0);
  });
}

// ── Widget Météo ───────────────────────────────────────────────────
function _renderWeatherWidget() {
  const el = document.getElementById('hsWeather');
  if (!el) return;
  if (typeof WEATHER === 'undefined') {
    el.innerHTML = '<div class="hs-weather-empty">Module météo indisponible</div>'; return;
  }
  const w = WEATHER.get();
  if (!w) { el.innerHTML = '<div class="hs-weather-empty">Données météo indisponibles</div>'; return; }
  const details = [];
  if (w.wind > 0)   details.push(`💨 ${w.wind} km/h`);
  if (w.precip > 0) details.push(`🌧 ${w.precip} mm`);
  const updatedAt = w.fetchedAt
    ? new Date(w.fetchedAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
    : null;
  el.innerHTML = `
    <div class="hs-weather-main">
      <span class="hs-weather-emoji">${w.emoji}</span>
      <span class="hs-weather-temp">${w.temp}°C</span>
    </div>
    <div class="hs-weather-label">${escapeHtml(w.label)}</div>
    ${details.length ? `<div class="hs-weather-details">${details.join(' · ')}</div>` : ''}
    ${updatedAt ? `<div class="hs-weather-update">Dernière mise à jour : ${updatedAt}</div>` : ''}`;
}

// ── Widget Stats du jour ───────────────────────────────────────────
function _renderStatsWidget() {
  const el = document.getElementById('hsStats');
  if (!el) return;
  const locals     = (CONFIG.LOCALS || []).map(Number);
  const openCount  = locals.filter(l => DB.isBureauOpen(l)).length;
  const groups     = Object.entries(DB.getQueueGroups() || {});
  const totalQueue = groups.reduce((acc, [id]) => acc + DB.getGroupOverflowQueue(id), 0);
  const lastCalls  = locals
    .map(l => DB.getLastCallForLocal(l)).filter(Boolean)
    .sort((a, b) => (b.calledAt || 0) - (a.calledAt || 0));
  const last = lastCalls[0];
  el.innerHTML = `
    <div class="hs-stats-row">
      <div class="hs-stat-card">
        <div class="hs-stat-val">${openCount}</div>
        <div class="hs-stat-lbl">bureau${openCount !== 1 ? 'x' : ''} ouvert${openCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="hs-stat-card">
        <div class="hs-stat-val">${totalQueue}</div>
        <div class="hs-stat-lbl">en attente</div>
      </div>
      <div class="hs-stat-card">
        <div class="hs-stat-val">${groups.filter(([,g]) => (g.localIds||[]).some(l => DB.isBureauOpen(Number(l)))).length}</div>
        <div class="hs-stat-lbl">service${groups.length !== 1 ? 's' : ''} actif${groups.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
    ${last ? `<div class="hs-stats-last">Dernier ticket : <strong>${escapeHtml(last.ticketLabel || String(last.ticketNum || '?'))}</strong>${last.ticketName ? ` — ${escapeHtml(last.ticketName)}` : ''}</div>` : ''}`;
}

// ── Widget Temps d'attente moyen par service ────────────────────────
async function _renderWaitStatsWidget() {
  const el = g('hsWaitStats');
  if (!el) return;
  const groups = DB.getQueueGroups() || {};
  const entries = Object.entries(groups);
  if (!entries.length) { el.innerHTML = '<div class="hs-wait-empty">Aucun groupe de file configuré.</div>'; return; }
  el.innerHTML = '<div class="hs-wait-empty">Chargement…</div>';
  const stats = await DB.fetchWaitStats(7);
  if (!Object.keys(stats).length) {
    el.innerHTML = '<div class="hs-wait-empty">Données en cours de collecte — disponibles dès demain.</div>';
    return;
  }
  el.innerHTML = entries.map(([id, grp]) => {
    const s = stats[id];
    if (!s?.count) return `<div class="hs-wait-row"><span class="hs-wait-grp">${escapeHtml(grp.name)}</span><span class="hs-wait-val">—</span></div>`;
    const avgMin = Math.round(s.totalMs / s.count / 60000);
    return `<div class="hs-wait-row">
      <span class="hs-wait-grp">${escapeHtml(grp.name)}</span>
      <span class="hs-wait-val">~${avgMin} min</span>
      <span class="hs-wait-n">${s.count} ticket${s.count > 1 ? 's' : ''}</span>
    </div>`;
  }).join('') + '<div class="hs-wait-footer">Moyenne sur 7 jours</div>';
}

// ── Widget Prochaines réservations ─────────────────────────────────
function _renderUpcomingWidget() {
  const el = document.getElementById('hsUpcoming');
  if (!el) return;
  const now  = new Date();
  const dayE = new Date(now); dayE.setHours(23, 59, 59, 999);
  const occs = DB.getInRange(now, dayE)
    .filter(r => !r.isPermanent && r._start > now)
    .sort((a, b) => a._start - b._start)
    .slice(0, 6);
  if (!occs.length) {
    el.innerHTML = '<div class="hs-upcoming-empty">Aucune réservation à venir aujourd\'hui</div>'; return;
  }
  el.innerHTML = occs.map(r => {
    const hm  = r._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
    const hme = r._end?.toLocaleTimeString('fr-BE',  { hour: '2-digit', minute: '2-digit' }) || '';
    const svc = DB.getSvcLabel(r);
    const agt = r.agent === 'Autre' ? (r.agentCustom || 'Autre') : (r.agent || '');
    const loc = DB.getUnitLabel(parseInt(r.localId), r.deskId || null);
    return `<div class="hs-upcoming-row">
      <span class="hs-upcoming-time">${hm}${hme ? `–${hme}` : ''}</span>
      <span class="hs-upcoming-svc">${escapeHtml(svc)}</span>
      <span class="hs-upcoming-agt">${escapeHtml(agt)}</span>
      <span class="hs-upcoming-loc">📍 ${escapeHtml(loc)}</span>
    </div>`;
  }).join('');
}

// ── Widget Dernières notifications ─────────────────────────────────
function _renderNotifsWidget(agentKey) {
  const el = document.getElementById('hsRecentNotifs');
  if (!el) return;
  const notifs = (typeof NOTIF !== 'undefined' && NOTIF.getAll) ? NOTIF.getAll() : {};
  const list = Object.entries(notifs)
    .filter(([, n]) => !n.targetAgentKey || n.targetAgentKey === agentKey)
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))
    .slice(0, 5);
  if (!list.length) { el.innerHTML = '<div class="hs-notifs-empty">Aucune notification récente</div>'; return; }
  el.innerHTML = list.map(([, n]) => {
    const time  = n.createdAt ? new Date(n.createdAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '';
    const icon  = n.type === 'panic' ? '🚨' : n.urgent ? '❗' : n.type === 'alert' ? '⚠️' : 'ℹ️';
    const isRead = n.readBy?.[agentKey] || n._read;
    const msg   = (n.message || '').replace(/\n/g, ' ');
    return `<div class="hs-notif-row${isRead ? '' : ' hs-notif-unread'}">
      <span class="hs-notif-icon">${icon}</span>
      <span class="hs-notif-msg">${escapeHtml(msg.slice(0, 70))}${msg.length > 70 ? '…' : ''}</span>
      <span class="hs-notif-time">${time}</span>
    </div>`;
  }).join('');
}

// ── Widget Planning de la semaine ──────────────────────────────────
function _renderWeekWidget() {
  const el = document.getElementById('hsWeekPlan');
  if (!el) return;
  const agentName = document.getElementById('hsGreeting')?.dataset?.agentName || '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days  = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekend
    if (days.length >= 5) break;
    days.push(d);
    if (days.length === 1 && i === 0 && today.getDay() !== 0 && today.getDay() !== 6) { /* ok */ }
  }
  // Ensure we have 5 working days
  if (days.length < 5) {
    let d = days.length ? new Date(days[days.length - 1]) : new Date(today);
    while (days.length < 5) {
      d = new Date(d); d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(d));
    }
  }
  const weekEnd = new Date(days[days.length - 1]); weekEnd.setHours(23, 59, 59, 999);
  const allOccs = DB.getInRange(today, weekEnd).filter(r => {
    if (r.isPermanent) return false;
    if (!agentName) return false;
    const a = r.agent === 'Autre' ? (r.agentCustom || 'Autre') : r.agent;
    return a === agentName || (Array.isArray(r.agents) && r.agents.includes(agentName));
  });
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  el.innerHTML = `<div class="hs-week-cols">${days.map((d, i) => {
    const dEnd  = new Date(d); dEnd.setHours(23, 59, 59, 999);
    const occs  = allOccs.filter(r => r._start >= d && r._start <= dEnd).sort((a, b) => a._start - b._start);
    const isToday = i === 0;
    const label = isToday ? "Auj." : `${dayNames[d.getDay()]} ${d.getDate()}`;
    const rows = occs.slice(0, 4).map(r => {
      const hm  = r._start.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
      const hme = r._end?.toLocaleTimeString('fr-BE',  { hour: '2-digit', minute: '2-digit' }) || '';
      const svc = DB.getSvcLabel(r);
      const loc = DB.getUnitLabel(parseInt(r.localId), r.deskId || null);
      return `<div class="hs-week-item" data-res-id="${r.id}" style="cursor:pointer" title="${escapeHtml(svc)} — ${escapeHtml(loc)}">
        <span class="hs-week-time">${hm}${hme ? ` – ${hme}` : ''}</span>
        <span class="hs-week-svc">${escapeHtml(svc.slice(0, 22))}${svc.length > 22 ? '…' : ''}</span>
      </div>`;
    }).join('');
    const extra = occs.length > 4 ? `<div class="hs-week-more">+${occs.length - 4} autre${occs.length - 4 > 1 ? 's' : ''}</div>` : '';
    return `<div class="hs-week-col${isToday ? ' hs-week-today' : ''}">
      <div class="hs-week-day-hd">${label}</div>
      ${rows || '<div class="hs-week-empty">—</div>'}${extra}
    </div>`;
  }).join('')}</div>`;
  el.querySelectorAll('[data-res-id]').forEach(item => {
    item.addEventListener('click', () => MODAL.openDetail(item.dataset.resId));
  });
}

// ── Appel groupé des nouveaux widgets (depuis HOME.render) ──────────
// ── Widget Mission ──────────────────────────────────────────────────
function _renderMissionWidget(agentKey) {
  const el = document.getElementById('hsMission');
  if (!el) return;
  if (!agentKey || agentKey === 'anon') { el.innerHTML = ''; return; }

  const today    = new Date().toISOString().slice(0, 10);
  const absEntry = DB.getAgentAbsenceOn(agentKey, today);
  const isMission = absEntry && absEntry[1]?.motif === 'mission';

  if (isMission) {
    const comment = absEntry[1].comment ? `<div class="hs-mission-comment">📝 ${escapeHtml(absEntry[1].comment)}</div>` : '';
    el.innerHTML = `
      <div class="hs-mission-status">
        <span class="hs-mission-badge">🚗 En mission</span>
        ${comment}
      </div>
      <button class="hs-mission-return-btn" id="hsMissionReturnBtn">✅ Retour de mission</button>`;
    document.getElementById('hsMissionReturnBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('hsMissionReturnBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
      await DB.deleteAbsence(absEntry[0]);
      showToast('Retour de mission enregistré ✓');
    });
  } else {
    el.innerHTML = `
      <input class="hs-mission-input" id="hsMissionComment" type="text"
        placeholder="Destination / motif (optionnel)" maxlength="80">
      <button class="hs-mission-go-btn" id="hsMissionGoBtn">🚗 Partir en mission</button>`;
    document.getElementById('hsMissionGoBtn')?.addEventListener('click', async () => {
      const openLocal = DB.getOpenBureauForCurrentAgent();
      if (openLocal !== null) {
        const localLabel = DB.getLocalLabel(openLocal);
        alert(`⚠️ Vous êtes actuellement dans le local "${localLabel}".\n\nVeuillez quitter votre local avant de partir en mission.`);
        return;
      }
      const btn     = document.getElementById('hsMissionGoBtn');
      const comment = document.getElementById('hsMissionComment')?.value.trim() || null;
      if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
      await DB.addAbsence({ agentKey, startDate: today, endDate: today, motif: 'mission',
        comment, createdBy: agentKey });
      showToast('Mission déclarée ✓');
    });
  }
}

// ── Widget Notes rapides ─────────────────────────────────────────────
function _renderNotesWidget(agentKey) {
  const el = document.getElementById('hsNotes');
  if (!el || !agentKey) return;
  const key  = `cpas_notes_${agentKey}`;
  const saved = localStorage.getItem(key) || '';
  el.innerHTML = `<textarea class="hs-notes-ta" id="hsNotesTa" placeholder="Écris tes notes ici…" spellcheck="false">${escapeHtml(saved)}</textarea>
    <div class="hs-notes-hint">Sauvegarde automatique</div>`;
  let _notesTimer;
  document.getElementById('hsNotesTa')?.addEventListener('input', e => {
    clearTimeout(_notesTimer);
    _notesTimer = setTimeout(() => localStorage.setItem(key, e.target.value), 600);
  });
}

// ── Widget Rappels du jour ───────────────────────────────────────────
function _renderRemindersWidget(agentKey) {
  const el = document.getElementById('hsReminders');
  if (!el || !agentKey) return;
  const today   = new Date().toISOString().slice(0, 10);
  const key     = `cpas_reminders_${agentKey}_${today}`;
  const getList = () => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
  const saveList = list => localStorage.setItem(key, JSON.stringify(list));

  const render = () => {
    const list = getList();
    el.innerHTML = `
      <ul class="hs-rem-list">${list.map((item, i) => `
        <li class="hs-rem-item${item.done ? ' hs-rem-done' : ''}">
          <input type="checkbox" class="hs-rem-cb" data-i="${i}" ${item.done ? 'checked' : ''}>
          <span class="hs-rem-text">${escapeHtml(item.text)}</span>
          <button class="hs-rem-del" data-i="${i}" title="Supprimer">✕</button>
        </li>`).join('')}
      </ul>
      <form class="hs-rem-form" id="hsRemForm">
        <input class="hs-rem-input" id="hsRemInput" type="text" placeholder="Ajouter un rappel…" maxlength="80">
        <button class="hs-rem-add" type="submit">+</button>
      </form>
      ${list.length ? `<div class="hs-rem-hint">${list.filter(r => r.done).length}/${list.length} fait${list.filter(r=>r.done).length > 1 ? 's' : ''} · Remis à zéro demain</div>` : ''}`;

    el.querySelectorAll('.hs-rem-cb').forEach(cb => cb.addEventListener('change', () => {
      const i = parseInt(cb.dataset.i);
      const l = getList(); l[i].done = cb.checked; saveList(l); render();
    }));
    el.querySelectorAll('.hs-rem-del').forEach(btn => btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i);
      const l = getList(); l.splice(i, 1); saveList(l); render();
    }));
    document.getElementById('hsRemForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const inp = document.getElementById('hsRemInput');
      const txt = inp?.value.trim();
      if (!txt) return;
      const l = getList(); l.push({ text: txt, done: false }); saveList(l);
      render();
      document.getElementById('hsRemInput')?.focus();
    });
  };
  render();
}

function _renderExtraWidgets() {
  const agentKey = sessionStorage.getItem('cpas_current_agent_key');
  [
    [_renderWeatherWidget,    []],
    [_renderStatsWidget,      []],
    [_renderWaitStatsWidget,  []],
    [_renderUpcomingWidget,  []],
    [_renderNotifsWidget,    [agentKey]],
    [_renderWeekWidget,      []],
    [_renderShortcutsWidget, [agentKey]],
    [_renderMissionWidget,   [agentKey]],
    [_renderNotesWidget,     [agentKey]],
    [_renderRemindersWidget, [agentKey]],
  ].forEach(([fn, args]) => { try { fn(...args); } catch(e) { console.warn('[widget]', fn.name, e); } });
}

function _widgetKey(agentKey)      { return `cpas_widgets_${agentKey}`; }
function _widgetOrderKey(agentKey) { return `cpas_widgets_order_${agentKey}`; }

function _getHiddenWidgets(agentKey) {
  try { return JSON.parse(localStorage.getItem(_widgetKey(agentKey)) || '[]'); }
  catch { return []; }
}
function _setHiddenWidgets(agentKey, hiddenIds) {
  localStorage.setItem(_widgetKey(agentKey), JSON.stringify(hiddenIds));
}

function _getWidgetOrder(agentKey) {
  try {
    const stored = JSON.parse(localStorage.getItem(_widgetOrderKey(agentKey)) || 'null');
    const defaultOrder = WIDGETS.map(w => w.id);
    if (!Array.isArray(stored)) return defaultOrder;
    // Compléter si des widgets ont été ajoutés depuis
    const full = [...stored.filter(id => defaultOrder.includes(id))];
    defaultOrder.forEach(id => { if (!full.includes(id)) full.push(id); });
    return full;
  } catch { return WIDGETS.map(w => w.id); }
}
function _setWidgetOrder(agentKey, orderedIds) {
  localStorage.setItem(_widgetOrderKey(agentKey), JSON.stringify(orderedIds));
}

function _applyWidgetPrefs(agentKey) {
  const hidden = _getHiddenWidgets(agentKey);
  const order  = _getWidgetOrder(agentKey);
  WIDGETS.forEach(w => {
    const el = document.querySelector(w.selector);
    if (!el) return;
    el.classList.toggle('hidden', hidden.includes(w.id));
    el.style.order = order.indexOf(w.id);
  });
}

function _openCustomizeModal(agentKey) {
  const hidden  = _getHiddenWidgets(agentKey);
  const order   = _getWidgetOrder(agentKey);
  const list    = document.getElementById('hsCustomizeList');
  if (!list) return;

  const ordered = [...WIDGETS].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const n = ordered.length;

  list.innerHTML = ordered.map((w, idx) => {
    const widthBadge = w.width === 'half'
      ? `<span class="hs-cust-badge hs-cust-badge-half">½ largeur</span>`
      : `<span class="hs-cust-badge hs-cust-badge-full">↔ pleine</span>`;
    return `
    <div class="hs-customize-row">
      <label class="hs-customize-chk-label">
        <input type="checkbox" class="hs-customize-cb" data-widget="${w.id}"
          ${!hidden.includes(w.id) ? 'checked' : ''}>
        <span>${w.label}</span>
      </label>
      ${widthBadge}
      <div class="hs-customize-arrows">
        <button class="hs-cust-arrow" data-dir="up"   data-widget="${w.id}"${idx === 0     ? ' disabled' : ''}>▲</button>
        <button class="hs-cust-arrow" data-dir="down" data-widget="${w.id}"${idx === n - 1 ? ' disabled' : ''}>▼</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.hs-customize-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const newHidden = WIDGETS
        .filter(w => !list.querySelector(`[data-widget="${w.id}"]`)?.checked)
        .map(w => w.id);
      _setHiddenWidgets(agentKey, newHidden);
      _applyWidgetPrefs(agentKey);
    });
  });

  list.querySelectorAll('.hs-cust-arrow').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.widget;
      const dir = btn.dataset.dir;
      const cur = _getWidgetOrder(agentKey);
      const idx = cur.indexOf(id);
      if (dir === 'up'   && idx > 0)          [cur[idx - 1], cur[idx]] = [cur[idx], cur[idx - 1]];
      if (dir === 'down' && idx < cur.length - 1) [cur[idx], cur[idx + 1]] = [cur[idx + 1], cur[idx]];
      _setWidgetOrder(agentKey, cur);
      _applyWidgetPrefs(agentKey);
      _openCustomizeModal(agentKey);
    });
  });

  document.getElementById('hsCustomizeOverlay').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', async function () {

  // ── Écran de chargement avec mascotte ─────────────────────────
  (function initLoadingScreen() {
    const screen  = document.getElementById('appLoadingScreen');
    const msgEl   = document.getElementById('loadMascotMsg');
    const barEl   = document.getElementById('loadProgressBar');
    const svgEl   = document.getElementById('loadMascotSvg');
    if (!screen) return;

    // Appliquer la mascotte immédiatement (peut être null au 1er chargement)
    const _applyLoadMascot = () => {
      if (!svgEl) return;
      const mid = DB.getMascotId?.() || sessionStorage.getItem('mc_last_mascot') || 'poulpe';
      const mascot = typeof MASCOTS !== 'undefined' ? MASCOTS[mid] : null;
      if (mascot) {
        svgEl.innerHTML = mascot.svg;
        svgEl.setAttribute('viewBox', mascot.viewBox || '0 0 100 118');
      }
    };
    _applyLoadMascot();

    const MESSAGES = [
      { pct: 15, msg: 'Connexion à Firebase…' },
      { pct: 30, msg: 'Chargement de la configuration…' },
      { pct: 55, msg: 'Récupération des réservations…' },
      { pct: 75, msg: 'Préparation de l\'interface…' },
      { pct: 90, msg: genf('Presque prêt·e…') },
    ];

    // Premier accès = peut prendre plus longtemps → message dédié
    const isFirstLoad = !sessionStorage.getItem('mc_loaded_once');
    if (isFirstLoad) {
      MESSAGES.push({ pct: 50, msg: 'Je crée ta session, ça peut prendre un moment la première fois ☕' });
    }

    let _msgIdx = 0;
    const _interval = setInterval(() => {
      if (_msgIdx >= MESSAGES.length) { clearInterval(_interval); return; }
      const m = MESSAGES[_msgIdx++];
      if (msgEl) msgEl.textContent = m.msg;
      if (barEl) barEl.style.width = m.pct + '%';
    }, 600);

    // Masquer l'écran une fois la config chargée (premier onConfigChange)
    let _hidden = false;
    const _hideLoading = () => {
      if (_hidden) return;
      _hidden = true;
      clearInterval(_interval);
      sessionStorage.setItem('mc_loaded_once', '1');
      if (barEl) barEl.style.width = '100%';
      if (msgEl) msgEl.textContent = genf('Prêt·e ! ✓');
      setTimeout(() => {
        if (screen) { screen.style.opacity = '0'; setTimeout(() => { screen.style.display = 'none'; }, 420); }
      }, 200);
    };

    // Timeout de sécurité 12s (en cas de Firebase lent)
    const _safetyTimeout = setTimeout(_hideLoading, 12000);
    DB._loadingHide = () => { clearTimeout(_safetyTimeout); _hideLoading(); };
  })();

  // Initialiser Firebase et les modals
  DB.init();
  MODAL.init();
  ANALYTICS.init();
  NOTIF.init();
  if (typeof REQUESTS !== 'undefined') REQUESTS.init();

  // Config dynamique (agents / services / lieux) — écoute Firebase
  DB.initConfig();
  DB.initQueue();
  DB.initAgentStatus();
  DB.initBureauState();
  DB.initPreferredPending();
  DB.initPreferredQueue();
  DB.initLastCallPerLocal();
  DB.initAbsences();
  DB.initPlanning();
  DB.listenRequests();
  DB.onConfigChange(() => {
    // Cacher l'écran de chargement au premier appel
    if (DB._loadingHide) { DB._loadingHide(); DB._loadingHide = null; }
    updateLieuTabs();
    MODAL.refreshSelects();
    CAL.render();
    LIVE.render();
    updateStatusBar();
    updateMessageBubble();
    updateOrgName();
    applyFeatureFlags();
    _applyMascot(DB.getMascotId());
    HOME.render();
    if (typeof PLANNING !== 'undefined') PLANNING.render();
  });

  // Planning : re-rendre à chaque changement Firebase
  DB.onPlanningChange(() => {
    if (typeof PLANNING !== 'undefined') PLANNING.render();
  });

  // Charger la config par défaut si Firebase est vide (premier lancement)
  try {
    await DB.seedConfigIfEmpty();
    // DB.seedIfEmpty() désactivé — données de démo supprimées
  } catch (e) {
    console.warn('Seed skipped (Firebase non configuré) :', e.message);
  }

  // Re-rendre le calendrier et la status bar à chaque mise à jour Firebase
  DB.onChange(() => {
    CAL.render();
    updateStatusBar();
    LIVE.render();
    HOME.render();
  });
  DB.onQueueChange(() => { LIVE.render(); HOME.render(); });
  DB.onAgentStatusChange(() => { LIVE.render(); HOME.render(); });
  DB.onBureauStateChange(() => { LIVE.render(); HOME.render(); });
  // Sync cross-device : quand Firebase lastCalls/{localId} change (accueil a routé un ticket),
  // mettre à jour _lastCalled sur l'appareil du bureau pour que "En cours/Rappeler" soit correct
  DB.onLastCallPerLocalChange(() => {
    const role = LIVE.getRole?.();
    if (role && role !== 'accueil') {
      const lid = parseInt(role.replace('bureau_', ''));
      if (LIVE._lastCalled[lid] !== false) {  // respecter la sentinelle "effacé volontairement"
        const fb = DB.getLastCallForLocal(lid);
        if (fb) {
          const obj = {
            ticket:      fb.ticketNum   || fb.ticketLabel || null,
            ticketLabel: fb.ticketLabel || null,
            ticketName:  fb.ticketName  || null,
            svc:         fb.groupName   || null,
            pubAgent:    fb.agentName   || null,
            localLabel:  DB.getLocalLabel(lid),
            time:        new Date(fb.ts || Date.now()),
          };
          LIVE._lastCalled[lid] = obj;
          try { localStorage.setItem(`cpas_lastCall_${lid}`, JSON.stringify(obj)); } catch(_) {}
        } else if (LIVE._lastCalled[lid]) {
          // Firebase a été vidé (clearLastCallForLocal) → vider aussi la mémoire
          LIVE._lastCalled[lid] = false;
          try { localStorage.removeItem(`cpas_lastCall_${lid}`); } catch(_) {}
        }
      }
    }
    LIVE.render();
  });
  DB.onAbsenceChange(() => { LIVE.render(); HOME.render(); });

  // Météo — lire Firebase d'abord, puis rafraîchir l'API si besoin (1x/heure)
  if (typeof WEATHER !== 'undefined') {
    DB.initWeather(); // écoute Firebase → WEATHER._loadFromFirebase
    const _refreshWeatherIfStale = () => {
      const { lat, lon } = DB.getOrgCoords();
      if (!lat || !lon) return;
      const cached = WEATHER.get();
      const age    = cached ? Date.now() - (cached.fetchedAt || 0) : Infinity;
      if (age >= 60 * 60 * 1000) WEATHER.fetch(lat, lon); // > 1h → appel API
    };
    // Quand la config charge (coords dispo) → vérifier si le cache est périmé
    DB.onConfigChange(_refreshWeatherIfStale);
    // Vérifier toutes les 15 min (l'appel API ne se fait que si > 1h)
    setInterval(_refreshWeatherIfStale, 15 * 60 * 1000);
    // Quand la météo est mise à jour → redessiner l'accueil
    WEATHER.onChange(() => { HOME.render(); applyFeatureFlags(); });
  }

  // Alerte fin de journée — vérifie toutes les 5 min si des agents sont encore connectés
  const _endOfDayAlertKey = 'cpas_eod_alerted_' + new Date().toISOString().slice(0, 10);
  const _checkEndOfDay = () => {
    if (!DB.hasPermission('editSettings')) return;
    if (sessionStorage.getItem(_endOfDayAlertKey)) return;
    const now = new Date();
    const endHour = DB.getEndOfDayHour();
    if (now.getHours() < endHour) return;
    const connected = DB.getConnectedTodayAgents();
    if (!connected.length) return;
    sessionStorage.setItem(_endOfDayAlertKey, '1'); // alerter une seule fois par session
    const agents = DB.getAgentsWithKeys();
    const names = connected
      .map(key => agents.find(a => a.key === key)?.name || key)
      .join(', ');
    showToast(`⏰ Fin de journée (${endHour}h) — encore connectés : ${names}`);
    // Propose d'envoyer un message
    setTimeout(() => {
      const msg = `Il est ${now.getHours()}h${String(now.getMinutes()).padStart(2,'0')} — pensez à vous déconnecter !`;
      if (confirm(`Envoyer un rappel de fin de journée aux agents encore connectés ?\n\n"${msg}"\n\nDestinataires : ${names}`)) {
        connected.forEach(key => DB.sendNotif(msg, 'info', key));
        showToast('Rappels envoyés ✓');
      }
    }, 500);
  };
  setInterval(_checkEndOfDay, 5 * 60 * 1000);
  DB.onAgentStatusChange(_checkEndOfDay); // aussi quand le statut change

  // Initialiser les modaux absences
  if (typeof _initAbsenceModal === 'function') _initAbsenceModal();
  if (typeof _initAbsencesList === 'function') _initAbsencesList();

  // Bouton "Mes absences" dans le header (présence)
  document.getElementById('btnMyAbsences')?.addEventListener('click', () => {
    const agentKey  = sessionStorage.getItem('cpas_current_agent_key');
    const agentObj  = DB.getAgentsWithKeys().find(a => a.key === agentKey);
    openAbsenceModal(agentKey, agentObj?.name || null);
  });
  // Bouton admin "Gestion absences"
  document.getElementById('btnManageAbsences')?.addEventListener('click', openAbsencesList);

  // Bouton "📤 Requête" — demande tech / entretien / autre
  if (typeof _initTechIssueModal === 'function') _initTechIssueModal();
  document.getElementById('btnTechIssue')?.addEventListener('click', () => {
    if (typeof openTechIssueModal === 'function') openTechIssueModal();
  });

  // Bouton "📢 Diffuser" — accueil/admin
  if (typeof _initBroadcastModal === 'function') _initBroadcastModal();
  document.getElementById('btnBroadcast')?.addEventListener('click', () => {
    if (typeof openBroadcastModal === 'function') openBroadcastModal();
  });
  // Visibilité gérée dans applyFeatureFlags() (appelée au bon moment)

  // Initialiser la status bar à l'heure actuelle
  const now = new Date();
  const roundedMin = Math.floor(now.getMinutes() / 30) * 30;
  document.getElementById('checkDate').value = isoDate(now);
  document.getElementById('checkTime').value =
    `${String(now.getHours()).padStart(2,'0')}:${String(roundedMin).padStart(2,'0')}`;

  // Mise à jour de la status bar quand l'utilisateur change la date/heure
  document.getElementById('checkDate').addEventListener('change', updateStatusBar);
  document.getElementById('checkTime').addEventListener('change', updateStatusBar);

  // Rendu initial (écran d'accueil par défaut)
  HOME.init();
  HOME.render();

  // Widgets supplémentaires — callbacks
  NOTIF.onWidgetUpdate(() => {
    const ak = sessionStorage.getItem('cpas_current_agent_key');
    if (ak) _renderNotifsWidget(ak);
  });
  _initShortcutsEdit();

  // Initialiser le cerveau de la mascotte
  if (typeof MascotBrain !== 'undefined') {
    window.MascotBrain = MascotBrain;
    MascotBrain.init();
    // Révéler le bouton "Inviter mes amis" si l'orgDirectory contient des voisins
    // (révélé uniquement si Firebase répond et si des orgs voisines existent)
  }

  // ─── Badge agent connecté ──────────────────────────────────────
  (function initAgentBadge() {
    const agentKey = sessionStorage.getItem('cpas_current_agent_key');
    const badge    = document.getElementById('hdAgentBadge');
    if (!badge) return;
    if (!agentKey) { badge.style.display = 'none'; return; }
    // Le nom est disponible une fois la config chargée — on attend onConfigChange
    function renderBadge() {
      const agents = DB.getAgentsWithKeys();
      const found  = agents.find(a => a.key === agentKey);
      if (found) {
        const roleColor = DB.getAgentRoleColor(found.name);
        badge.innerHTML = `<span class="hd-agent-dot" style="background:${roleColor}"></span>${found.name}`;
        badge.style.display = '';
      }
    }
    DB.onConfigChange(renderBadge);
    renderBadge();
  })();

  // ─── Message du jour ───────────────────────────────────────────
  function updateMessageBubble() {
    const msg     = DB.getMessageJour();
    const at      = DB.getMessageJourAt();
    const bubble  = document.getElementById('msgBubble');
    const isAdmin = DB.hasPermission('sendPublicMessage');
    if (msg) {
      document.getElementById('msgText').textContent = msg;
      const metaEl = document.getElementById('msgMeta');
      if (at) {
        const d = new Date(at);
        const dateStr = d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
        metaEl.textContent = `Mis à jour le ${dateStr} à ${timeStr}`;
      } else {
        metaEl.textContent = '';
      }
      bubble.classList.remove('hidden');
    } else if (isAdmin) {
      document.getElementById('msgText').textContent = 'Aucun message — cliquez ✏️ pour en ajouter un';
      document.getElementById('msgMeta').textContent = '';
      bubble.classList.remove('hidden');
    } else {
      bubble.classList.add('hidden');
    }
    document.getElementById('msgEdit').classList.toggle('hidden', !DB.hasPermission('sendPublicMessage'));
  }

  document.getElementById('msgClose').addEventListener('click', () => {
    document.getElementById('msgBubble').classList.add('hidden');
  });
  document.getElementById('msgEdit').addEventListener('click', () => {
    document.getElementById('msgEditInput').value = DB.getMessageJour();
    document.getElementById('msgEditPublicInput').value = DB.getMessageJourPublic();
    document.getElementById('msgEditOverlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('msgEditInput').focus(), 80);
  });
  document.getElementById('msgEditSave').addEventListener('click', async () => {
    const txt    = document.getElementById('msgEditInput').value.trim();
    const pubTxt = document.getElementById('msgEditPublicInput').value.trim();
    await Promise.all([DB.setMessageJour(txt), DB.setMessageJourPublic(pubTxt)]);
    document.getElementById('msgEditOverlay').classList.add('hidden');
  });
  document.getElementById('msgEditClear').addEventListener('click', async () => {
    if (!confirm('Effacer les deux messages du jour ?')) return;
    await Promise.all([DB.setMessageJour(''), DB.setMessageJourPublic('')]);
    document.getElementById('msgEditOverlay').classList.add('hidden');
  });
  document.getElementById('msgEditOverlay').addEventListener('click', e => {
    if (e.target.id === 'msgEditOverlay') document.getElementById('msgEditOverlay').classList.add('hidden');
  });

  // ─── Onglets de lieux ──────────────────────────────────────────
  function updateLieuTabs() {
    const lieux     = DB.getLieux();
    const currentId = DB.getCurrentLieuId();
    const bar       = document.getElementById('lieuBar');
    bar.innerHTML   = Object.entries(lieux).map(([id, lieu]) => `
      <button class="lieu-tab${id === currentId ? ' active' : ''}" data-lieu="${id}">
        ${lieu.name.replace(/&/g,'&amp;').replace(/</g,'&lt;')}
      </button>`).join('');
    bar.querySelectorAll('.lieu-tab').forEach(btn => {
      btn.addEventListener('click', () => DB.setCurrentLieu(btn.dataset.lieu));
    });
  }

  // _showCalView / _showHomeView définis au niveau global (voir bas de fichier)

  // ─── Onglets de vue ────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      if (this.dataset.view === 'home') {
        _showHomeView();
      } else if (this.dataset.view === 'planning') {
        _showPlanningView();
      } else {
        _showCalView(this.dataset.view);
      }
    });
  });

  // ─── Navigation ────────────────────────────────────────────────
  document.getElementById('btnPrev').addEventListener('click',  () => CAL.navigate(-1));
  document.getElementById('btnNext').addEventListener('click',  () => CAL.navigate(1));
  document.getElementById('btnToday').addEventListener('click', () => {
    CAL.goToday();
    // Remettre la status bar à maintenant
    const n = new Date();
    const rm = Math.floor(n.getMinutes() / 30) * 30;
    document.getElementById('checkDate').value = isoDate(n);
    document.getElementById('checkTime').value =
      `${String(n.getHours()).padStart(2,'0')}:${String(rm).padStart(2,'0')}`;
    updateStatusBar();
  });

  // ─── Vue Live ──────────────────────────────────────────────────
  document.getElementById('btnLive').addEventListener('click', () => LIVE.open());
  document.getElementById('btnLiveClose').addEventListener('click', () => LIVE.close());

  // ─── Analytics ─────────────────────────────────────────────────
  document.getElementById('btnAnalytics').addEventListener('click', () => ANALYTICS.open());

  // ─── Modal Pause bureau ────────────────────────────────────────
  let _pauseTargetLocal = null;

  window.openPauseModal = function(localId) {
    _pauseTargetLocal = localId;
    const label = DB.getLocalLabel(localId);
    document.getElementById('pauseBureauLabel').textContent = `Bureau : ${label}`;
    // Reset
    document.querySelector('input[name="pauseDur"][value="0"]').checked = true;
    document.getElementById('pauseDurCustom').value = '';
    document.getElementById('pauseComment').value = '';
    document.getElementById('pauseOverlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('pauseComment').focus(), 80);
  };

  document.getElementById('pauseClose').addEventListener('click', () => {
    document.getElementById('pauseOverlay').classList.add('hidden');
  });
  document.getElementById('pauseOverlay').addEventListener('click', e => {
    if (e.target.id === 'pauseOverlay') document.getElementById('pauseOverlay').classList.add('hidden');
  });

  // Activer/désactiver le champ "autre durée" selon la radio sélectionnée
  document.querySelectorAll('input[name="pauseDur"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const customInput = document.getElementById('pauseDurCustom');
      customInput.disabled = radio.value !== 'custom';
      if (radio.value === 'custom') customInput.focus();
    });
  });

  document.getElementById('pauseConfirm').addEventListener('click', async () => {
    if (_pauseTargetLocal === null) return;
    const selected = document.querySelector('input[name="pauseDur"]:checked');
    let estimatedMin = null;
    if (selected.value === 'custom') {
      const v = parseInt(document.getElementById('pauseDurCustom').value);
      if (v > 0) estimatedMin = v;
    } else if (selected.value !== '0') {
      estimatedMin = parseInt(selected.value);
    }
    const comment = document.getElementById('pauseComment').value.trim() || null;
    await DB.setBureauPause(_pauseTargetLocal, { estimatedMin, comment });
    document.getElementById('pauseOverlay').classList.add('hidden');
  });

  // ─── Statut présence ───────────────────────────────────────────
  function openPresenceOverlay() {
    const sel      = document.getElementById('presenceAgent');
    const myKey    = sessionStorage.getItem('cpas_current_agent_key');
    const canManage = DB.hasPermission('manageAgentStatus');
    const agents   = DB.getAgentsWithKeys();

    if (canManage) {
      // Admin/Direction : tous les agents, propre compte en premier
      const sorted = [...agents].sort((a, b) =>
        a.key === myKey ? -1 : b.key === myKey ? 1 : 0
      );
      sel.innerHTML = sorted.map(({key, name}) =>
        `<option value="${key}">${name}${key === myKey ? ' (moi)' : ''}</option>`).join('');
      sel.disabled = false;
    } else {
      // Agent standard : uniquement son propre compte
      const me = agents.find(a => a.key === myKey);
      sel.innerHTML = me
        ? `<option value="${me.key}">${me.name}</option>`
        : '<option value="">— Agent inconnu —</option>';
      sel.disabled = true;
    }

    document.getElementById('presenceStatus').value = '';
    document.getElementById('presenceTimeWrap').style.display = 'none';
    document.getElementById('presenceNotifWrap').classList.add('hidden');

    // Peupler les checkboxes de groupes à notifier
    const checksEl = document.getElementById('presenceNotifChecks');
    if (checksEl) {
      const roles = DB.getPermRoles();
      const groups = [
        { id: 'all', label: 'Tous les agents' },
        ...Object.entries(roles).map(([rid, r]) => ({ id: `role:${rid}`, label: r.name })),
      ];
      checksEl.innerHTML = groups.map(g => `
        <label class="presence-notif-check-label">
          <input type="checkbox" class="presence-notif-cb" value="${g.id}">
          <span>${escapeHtml(g.label)}</span>
        </label>`).join('');

      // Exclusivité : "Tous les agents" désactive les autres, et inversement
      const allCb   = checksEl.querySelector('.presence-notif-cb[value="all"]');
      const roleCbs = [...checksEl.querySelectorAll('.presence-notif-cb:not([value="all"])')];

      allCb?.addEventListener('change', () => {
        if (allCb.checked) {
          roleCbs.forEach(cb => { cb.checked = false; cb.disabled = true; });
        } else {
          roleCbs.forEach(cb => { cb.disabled = false; });
        }
      });
      roleCbs.forEach(cb => cb.addEventListener('change', () => {
        if (cb.checked && allCb?.checked) {
          allCb.checked = false;
          roleCbs.forEach(c => { c.disabled = false; });
        }
      }));
    }

    document.getElementById('presenceOverlay').classList.remove('hidden');
  }

  // Afficher le bloc "Notifier" seulement si statut non-vide (≠ Présent)
  document.getElementById('presenceStatus').addEventListener('change', function() {
    const wrap = document.getElementById('presenceNotifWrap');
    if (!wrap) return;
    if (this.value) {
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
      // Décocher tout
      wrap.querySelectorAll('.presence-notif-cb').forEach(cb => cb.checked = false);
    }
  });
  document.getElementById('btnPresenceHd').addEventListener('click', openPresenceOverlay);
  document.getElementById('presenceStatus').addEventListener('change', function () {
    document.getElementById('presenceTimeWrap').style.display = this.value === 'late' ? '' : 'none';
  });
  // Collecte les groupes cochés et leurs libellés
  function _getCheckedNotifGroups() {
    return [...document.querySelectorAll('.presence-notif-cb:checked')].map(cb => ({
      id:    cb.value,
      label: cb.closest('label')?.querySelector('span')?.textContent || cb.value,
    }));
  }

  // Envoie les notifications après confirmation
  async function _sendPresenceNotifs(agentName, status, time, groups, comment, urgent) {
    let msg = '';
    if (status === 'late' && time) msg = `${agentName} arrive — arrivée prévue à ${time}.`;
    else if (status === 'absent')  msg = `${agentName} est absent(e) aujourd'hui.`;
    if (!msg) return;
    if (comment) msg += ` — ${comment}`;

    const type = status === 'absent' ? 'alert' : 'warn';
    const opts = urgent ? { urgent: true } : {};
    for (const g of groups) {
      if (g.id === 'all') {
        await DB.sendNotif(msg, type, null, opts);
      } else if (g.id.startsWith('role:')) {
        const roleId = g.id.slice(5);
        const targets = DB.getAgentsWithKeys().filter(a => DB.getAgentPermRole(a.key) === roleId);
        for (const a of targets) await DB.sendNotif(msg, type, a.key, opts);
      }
    }
  }

  document.getElementById('presenceSave').addEventListener('click', async () => {
    const key    = document.getElementById('presenceAgent').value;
    const status = document.getElementById('presenceStatus').value;
    const time   = document.getElementById('presenceTime').value;
    const myKey  = sessionStorage.getItem('cpas_current_agent_key');
    if (!key) return;

    const agentName = DB.getAgentsWithKeys().find(a => a.key === key)?.name || '?';
    const isMyOwn   = key === myKey;
    const checkedGroups = _getCheckedNotifGroups();
    const willNotify = status && DB.getFeature('enableNotifAuto') && checkedGroups.length;

    if (willNotify) {
      // Afficher la modale de confirmation
      document.getElementById('presenceConfirmList').innerHTML =
        checkedGroups.map(g => `<li>${escapeHtml(g.label)}</li>`).join('');
      const confirmMsg = document.getElementById('presenceConfirmMsg');
      if (confirmMsg) confirmMsg.value = '';

      // Urgent wrap — visible uniquement si la permission est accordée
      const urgentWrap = document.getElementById('presenceUrgentWrap');
      if (urgentWrap) {
        const canUrgent = DB.hasPermission('sendUrgentNotif');
        urgentWrap.classList.toggle('hidden', !canUrgent);
        const urgentCb = document.getElementById('presenceConfirmUrgent');
        if (urgentCb) urgentCb.checked = false;
      }

      document.getElementById('presenceConfirmOverlay').classList.remove('hidden');
      setTimeout(() => confirmMsg?.focus(), 80);

      // Attendre la réponse de l'utilisateur
      await new Promise(resolve => {
        const ok     = document.getElementById('presenceConfirmOk');
        const cancel = document.getElementById('presenceConfirmCancel');
        const close  = () => {
          document.getElementById('presenceConfirmOverlay').classList.add('hidden');
          ok.removeEventListener('click', onOk);
          cancel.removeEventListener('click', onCancel);
        };
        const onOk = async () => {
          const comment = document.getElementById('presenceConfirmMsg')?.value.trim() || '';
          const urgent  = document.getElementById('presenceConfirmUrgent')?.checked || false;
          close();
          // Garantir connectedAt avant setAgentStatus pour éviter "Pas encore connecté"
          if (!status || status === 'present') await DB.markConnectedToday(key);
          await DB.setAgentStatus(key, status, time);
          if (!isMyOwn) {
            const lbl = { late: `J'arrive ! (arrivée prévue ${time || '?'})`, absent: 'Absent(e)' };
            let adminMsg = `Votre statut a été mis à jour : ${lbl[status] || 'Présent(e)'}.`;
            if (comment) adminMsg += ` — ${comment}`;
            await DB.sendNotif(adminMsg, 'info', key);
          }
          await _sendPresenceNotifs(agentName, status, time, checkedGroups, comment, urgent);
          document.getElementById('presenceOverlay').classList.add('hidden');
          if (!status || status === 'present') {
            window.MascotBrain?.triggerAgentArrived?.(agentName);
            await _revokeMyTempAdmin(myKey, agentName);
            // Supprimer toute absence mission/formation du jour
            const _todayStr = new Date().toISOString().slice(0, 10);
            const _absEntry = DB.getAgentAbsenceOn(key, _todayStr);
            if (_absEntry && ['mission','formation'].includes(_absEntry[1]?.motif)) {
              await DB.deleteAbsence(_absEntry[0]);
            }
          }
          if (isMyOwn && status === 'absent' && DB._config.agentRoles[myKey] === '__admin__' && !DB.getTempAdminGrant()) {
            await _promptTempAdmin(myKey, agentName);
          }
          resolve();
        };
        const onCancel = () => { close(); resolve(); };
        ok.addEventListener('click', onOk);
        cancel.addEventListener('click', onCancel);
      });
    } else {
      // Pas de notif → enregistrer directement
      // Garantir connectedAt avant setAgentStatus pour éviter "Pas encore connecté"
      if (!status || status === 'present') await DB.markConnectedToday(key);
      await DB.setAgentStatus(key, status, time);
      if (!isMyOwn && DB.getFeature('enableNotifAuto')) {
        const lbl = { late: `J'arrive ! (arrivée prévue ${time || '?'})`, absent: 'Absent(e)' };
        await DB.sendNotif(`Votre statut a été mis à jour : ${lbl[status] || 'Présent(e)'}.`, 'info', key);
      }
      document.getElementById('presenceOverlay').classList.add('hidden');
      if (!status || status === 'present') {
        window.MascotBrain?.triggerAgentArrived?.(agentName);
        await _revokeMyTempAdmin(myKey, agentName);
        // Supprimer toute absence mission/formation du jour
        const _todayStr2 = new Date().toISOString().slice(0, 10);
        const _absEntry2 = DB.getAgentAbsenceOn(key, _todayStr2);
        if (_absEntry2 && ['mission','formation'].includes(_absEntry2[1]?.motif)) {
          await DB.deleteAbsence(_absEntry2[0]);
        }
      }
      if (isMyOwn && status === 'absent' && DB._config.agentRoles[myKey] === '__admin__' && !DB.getTempAdminGrant()) {
        await _promptTempAdmin(myKey, agentName);
      }
    }
  });
  document.getElementById('presenceOverlay').addEventListener('click', e => {
    if (e.target.id === 'presenceOverlay') document.getElementById('presenceOverlay').classList.add('hidden');
  });
  document.getElementById('liveAgentSearch').addEventListener('input', function () {
    LIVE._agentQuery = this.value.trim();
    LIVE._renderAgentSuggestions(this.value.trim());
    LIVE.render();
  });
  document.getElementById('liveAgentSearch').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      this.value = '';
      LIVE._agentQuery = '';
      g('liveAgentSuggestions').innerHTML = '';
      LIVE.render();
    }
  });

  // ─── Export iCal (Phase 5.6) ──────────────────────────────────
  document.getElementById('btnCalendarExport')?.addEventListener('click', () => {
    const agentKey  = sessionStorage.getItem('cpas_current_agent_key');
    const agent     = DB.getAgentsWithKeys().find(a => a.key === agentKey);
    if (!agent) return showToast('Connectez-vous pour exporter votre agenda.', 'warn');
    const ics       = generateIcal(agent.name, DB.getAll());
    const blob      = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url       = URL.createObjectURL(blob);
    const a         = document.createElement('a');
    a.href          = url;
    a.download      = `agenda-${agent.name.toLowerCase().replace(/\s+/g,'-')}-${isoDate(new Date())}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Agenda exporté ✓');
  });

  // ─── Nouvelle réservation ──────────────────────────────────────
  document.getElementById('btnNew').addEventListener('click', () => {
    HOME._requireBonjour(() => MODAL.openNew({ date: isoDate(CAL.date) }));
  });

  // Bouton "Public" → ouvre vuepublic.html (lien direct, pas de dropdown)
  // L'URL inclut l'orgId si différent du défaut
  const _pubBtn = document.getElementById('btnPublic');
  if (_pubBtn && _pubBtn.tagName === 'A') {
    const _orgParam = ORG_ID !== 'cpas-quaregnon' ? `?org=${encodeURIComponent(ORG_ID)}` : '';
    _pubBtn.href = `vuepublic.html${_orgParam}`;
  }

  // Bouton ajout écran → géré dans modal.js (_initSettings)

  // ── Boutons flottants fin de journée (admin only) ─────────────────
  function _updateEodFab() {
    const fab = document.getElementById('eodFab');
    if (fab) fab.classList.toggle('hidden', !DB.hasPermission('editSettings'));
  }
  DB.onConfigChange(_updateEodFab);
  _updateEodFab();

  document.getElementById('btnFabClearLocals')?.addEventListener('click', async () => {
    if (!DB.hasPermission('editSettings')) return;
    const nb = Object.keys(DB._bureauState).filter(id => DB.isBureauOpen(id)).length;
    if (!nb) { showToast('Aucun bureau ouvert.', 'info'); return; }
    if (!confirm(`Fermer ${nb} bureau${nb > 1 ? 'x' : ''} ouvert${nb > 1 ? 's' : ''} ?\n\nLes agents restent marqués comme présents.`)) return;
    await DB.clearAllLocals();
    showToast('Tous les bureaux ont été fermés ✓');
  });

  document.getElementById('btnFabGoodbyeAll')?.addEventListener('click', async () => {
    if (!DB.hasPermission('editSettings')) return;
    const connected = DB.getConnectedTodayAgents().filter(k => DB.getAgentStatus(k)?.status !== 'done');
    if (!connected.length) { showToast('Aucun agent encore connecté.', 'info'); return; }
    const names = connected
      .map(k => DB.getAgentsWithKeys().find(a => a.key === k)?.name || k)
      .join(', ');
    if (!confirm(`Marquer ${connected.length} agent${connected.length > 1 ? 's' : ''} comme "Au revoir" ?\n\n${names}`)) return;
    await DB.goodbyeAllAgents();
    showToast('Bonne fin de journée à tous 👋');
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── "Ne veut voir qu'un agent" — circuit préférentiel ────────
  // ═══════════════════════════════════════════════════════════════

  // initPreferredPending() est appelé directement au démarrage (voir ligne init)

  // Nettoyer les données sensibles expirées au démarrage
  DB.cleanExpiredPreferredData?.();

  // ── Modal A : ouverture gérée directement dans calendar.js ─────
  // Le submit reste ici
  document.getElementById('prefRequestConfirm')?.addEventListener('click', async () => {
    const overlay   = document.getElementById('preferredRequestOverlay');
    const benefName = (document.getElementById('prefBenefName')?.value || '').trim();
    const agentKey  = document.getElementById('prefAgentSelect')?.value;
    const placeOpt  = document.getElementById('prefPublicPlaceSelect');
    const placeId   = placeOpt?.value || null;
    const placeName = placeId ? (placeOpt?.selectedOptions[0]?.dataset?.name || '') : null;

    if (!benefName) { showToast('Veuillez saisir le nom du bénéficiaire.'); return; }
    if (!agentKey)  { showToast('Veuillez sélectionner un agent.'); return; }

    // Vérifier si cible est admin / chef_service / direction → confirmer d'abord (Modal D)
    const targetRole    = DB.getAgentPermRole(agentKey);
    const needsConfirm  = ['__admin__', '__chef_service__', '__direction__'].includes(targetRole);
    if (needsConfirm) {
      _openPreferredDirectionConfirm(benefName, agentKey, placeId, placeName);
      overlay.classList.add('hidden');
      return;
    }
    overlay.classList.add('hidden');
    await _handlePreferredRequest(benefName, agentKey, placeId, placeName);
  });

  document.getElementById('prefRequestCancel')?.addEventListener('click', () => {
    document.getElementById('preferredRequestOverlay')?.classList.add('hidden');
  });

  // Fermer en cliquant sur le fond
  document.getElementById('preferredRequestOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'preferredRequestOverlay')
      document.getElementById('preferredRequestOverlay').classList.add('hidden');
  });

  // ── Modal D : Confirmation chef/direction ────────────────────────
  let _prefDirPending = null;
  function _openPreferredDirectionConfirm(benefName, agentKey, placeId, placeName) {
    const overlay = document.getElementById('preferredDirectionConfirmOverlay');
    if (!overlay) return;
    const agentName = DB.getAgentsWithKeys().find(a => a.key === agentKey)?.name || agentKey;
    const roleMap   = { '__admin__': 'Administrateur', '__chef_service__': 'Chef de service', '__direction__': 'Direction' };
    document.getElementById('prefDirAgentLabel').textContent = agentName;
    document.getElementById('prefDirRoleLabel').textContent  = roleMap[DB.getAgentPermRole(agentKey)] || '';
    _prefDirPending = { benefName, agentKey, placeId, placeName };
    overlay.classList.remove('hidden');
  }

  document.getElementById('prefDirYes')?.addEventListener('click', async () => {
    document.getElementById('preferredDirectionConfirmOverlay')?.classList.add('hidden');
    if (_prefDirPending) {
      const { benefName, agentKey, placeId, placeName } = _prefDirPending;
      _prefDirPending = null;
      await _handlePreferredRequest(benefName, agentKey, placeId, placeName);
    }
  });
  document.getElementById('prefDirNo')?.addEventListener('click', () => {
    document.getElementById('preferredDirectionConfirmOverlay')?.classList.add('hidden');
    _prefDirPending = null;
  });

  // ── Logique de routage principal ─────────────────────────────────
  async function _handlePreferredRequest(benefName, targetAgentKey, placeId, placeName) {
    const myKey     = sessionStorage.getItem('cpas_current_agent_key');
    const agentInfo = DB.getAgentsWithKeys().find(a => a.key === targetAgentKey);
    const agentName = agentInfo?.name || targetAgentKey;

    // Vérifier si l'agent est connecté aujourd'hui
    const connectedToday = DB.getConnectedTodayAgents();
    const isConnected    = connectedToday.includes(targetAgentKey);

    if (!isConnected) {
      // Absent / jamais connecté → notif accueil uniquement
      await DB.sendNotif(
        `${agentName} n'est pas au bureau aujourd'hui — le bénéficiaire n'a pas pu être orienté.`,
        'info', myKey
      );
      showToast(`${agentName} n'est pas au bureau.`);
      return;
    }

    // Trouver le bureau ouvert (non-backoffice) de l'agent
    const localId = DB.getBureauByAgent(targetAgentKey);

    // Vérifier le statut DND
    const agentStatus = DB.getAgentStatus(targetAgentKey);
    const isDnd        = agentStatus?.status === 'dnd';

    // Calculer displayName (prénom ou ticket# selon config)
    const enableNamed = DB.getFeature('enableNamedTickets');
    const displayName = enableNamed ? (benefName.split(' ')[0] || benefName) : 'Bénéficiaire';

    const agentPublicName = DB.getAgentPublicName(targetAgentKey);

    // Vérifier si le bureau est déjà occupé (preferred en attente OU agent en cours avec quelqu'un)
    if (localId !== null) {
      const existingPending = DB.getPreferredPending(localId);
      const busyWithPref    = DB.isBureauBusyWithPreferred(localId);
      if (existingPending || busyWithPref) {
        // Bureau occupé → mettre en file d'attente preferred
        const { requestId } = await DB.createPreferredRequest(
          benefName, targetAgentKey, myKey, placeId, placeName, localId
        );
        // Émettre un ticket pour que la personne apparaisse dans la file visible
        let ticketLabel    = null;
        let resolvedName   = displayName;
        const grpForQueue  = DB.getLocalGroup(localId);
        if (grpForQueue) {
          const ticketResult = await DB.issueTicket(grpForQueue.id, displayName || null);
          ticketLabel  = ticketResult.label;
          resolvedName = ticketResult.resolvedName || displayName; // nom dédupliqué = même que EN ATTENTE
          await DB.incrementGroupOverflow(grpForQueue.id);
        }
        await DB.pushToPreferredQueue(localId, { displayName: resolvedName, agentPublicName, requestId, ts: Date.now(), ticketLabel });
        const queueLen = DB.getPreferredQueue(localId).length + 1; // +1 car le push n'est pas encore reflété localement
        const localLabel = DB.getLocalLabel(localId);
        await DB.sendNotif(
          `${agentName} est occupé(e) — ${displayName} est en file d'attente (position ${queueLen}).`,
          'info', myKey,
          { requestId, localId }
        );
        showToast(`${agentName} est occupé(e) — ${displayName} mis en file d'attente.`);
        return;
      }
    }

    // Créer la demande en Firebase
    const { requestId } = await DB.createPreferredRequest(
      benefName, targetAgentKey, myKey, placeId, placeName, localId
    );

    if (localId !== null) {
      // Bureau ouvert → notif agent + notif accueil "diriger vers bureau"
      const localLabel = DB.getLocalLabel(localId);
      const dndNote    = isDnd ? ' (🔕 Ne pas déranger — notifié quand même)' : '';

      await DB.sendNotif(
        `${benefName} vous demande spécifiquement.${placeId ? ` En attente : ${placeName}.` : ''}`,
        'preferred_request', targetAgentKey,
        { requestId, benefName, publicPlaceName: placeName || null, accueilAgentKey: myKey, sensitiveData: true }
      );

      await DB.respondToPreferredRequest(requestId, 'accepted', null, null, localId, agentPublicName, displayName);

      await DB.sendNotif(
        `${agentName} est au ${localLabel}${dndNote} — dirigez le bénéficiaire directement vers ce bureau.`,
        'info', myKey,
        { requestId, localId }
      );
    } else {
      // Pas de bureau ouvert → notif agent avec boutons réponse + notif accueil "en attente"
      const dndNote = isDnd ? ' (🔕 Ne pas déranger)' : '';
      await DB.sendNotif(
        `${benefName} vous demande spécifiquement.${placeId ? ` En attente : ${placeName}.` : ''}${dndNote}`,
        'preferred_request', targetAgentKey,
        { requestId, benefName, publicPlaceName: placeName || null, accueilAgentKey: myKey, sensitiveData: true }
      );

      await DB.sendNotif(
        `En attente de réponse de ${agentName}${dndNote}…`,
        'info', myKey,
        { requestId, awaitingReply: true, targetAgentName: agentName }
      );
    }
    showToast(`Demande envoyée à ${agentName}.`);
  }

  // ── Modal B : Agent — répondre à une demande ─────────────────────
  let _prefResponseContext = null;

  window._openPreferredResponseModal = (notifId, reqId, mode) => {
    const overlay = document.getElementById('preferredResponseOverlay');
    if (!overlay) return;
    _prefResponseContext = { notifId, reqId, mode };

    const etaWrap = document.getElementById('prefResponseEtaWrap');
    const ctx     = document.getElementById('prefResponseContext');
    if (etaWrap) etaWrap.classList.add('hidden');
    if (ctx) ctx.textContent = 'Chargement…';
    document.getElementById('prefResponseComment').value = '';

    overlay.classList.remove('hidden');

    // Charger les détails de la demande
    DB.getPreferredRequest(reqId).then(req => {
      if (!req) { if (ctx) ctx.textContent = 'Demande introuvable.'; return; }
      const placeTxt = req.publicPlaceName ? ` — Attend : ${req.publicPlaceName}` : '';
      if (ctx) ctx.textContent = `${req.benefName || '[données effacées]'} demande à vous voir${placeTxt}.`;

      // Gestion countdown données sensibles
      if (req.nameDeleteAt) {
        const cdEl = document.getElementById('prefDeleteCountdownNote');
        if (cdEl) {
          const rem = Math.max(0, Math.round((req.nameDeleteAt - Date.now()) / 60000));
          cdEl.textContent = rem > 0 ? `Données effacées dans ${rem} min` : 'Données déjà effacées';
          cdEl.style.display = '';
        }
      }
    });

    if (mode === 'eta') {
      if (etaWrap) etaWrap.classList.remove('hidden');
      document.getElementById('prefResponseEtaMin')?.focus();
    }
  };

  document.getElementById('preferredResponseOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'preferredResponseOverlay')
      document.getElementById('preferredResponseOverlay').classList.add('hidden');
  });

  const _sendPreferredReply = async (response, etaMin) => {
    if (!_prefResponseContext) return;
    const { reqId } = _prefResponseContext;
    const myKey     = sessionStorage.getItem('cpas_current_agent_key');
    const comment   = document.getElementById('prefResponseComment')?.value.trim() || null;
    document.getElementById('preferredResponseOverlay')?.classList.add('hidden');

    const req = await DB.getPreferredRequest(reqId);
    if (!req) return;

    const localId = DB.getBureauByAgent(myKey);
    const myPublicName = DB.getAgentPublicName(myKey);
    const enableNamed  = DB.getFeature('enableNamedTickets');
    const displayName  = enableNamed && req.benefName
      ? (req.benefName.split(' ')[0] || req.benefName)
      : 'Bénéficiaire';

    const { ticketLabel } = await DB.respondToPreferredRequest(reqId, response, etaMin, comment, localId, myPublicName, displayName);

    const myName   = DB.getAgentsWithKeys().find(a => a.key === myKey)?.name || 'L\'agent';
    const localLbl = localId ? ` (${DB.getLocalLabel(localId)})` : '';
    let replyMsg   = '';
    if (response === 'accepted') {
      replyMsg = `✅ ${myName}${localLbl} arrive tout de suite.`;
    } else if (response === 'eta') {
      replyMsg = `🕐 ${myName}${localLbl} arrive dans environ ${etaMin} min.`;
    } else {
      replyMsg = `❌ ${myName} est indisponible.`;
    }
    if (comment) replyMsg += ` — ${comment}`;
    if (localId && (response === 'accepted' || response === 'eta')) {
      replyMsg += ` Diriger vers ${DB.getLocalLabel(localId)}.`;
      if (ticketLabel) replyMsg += ` Ticket : ${ticketLabel}.`;
    }

    await DB.sendNotif(replyMsg, 'preferred_reply_accueil', req.accueilAgentKey, { requestId: reqId, ticketLabel: ticketLabel || null });
    _prefResponseContext = null;
  };

  document.getElementById('prefResponseNow')?.addEventListener('click', () => _sendPreferredReply('accepted', null));
  document.getElementById('prefResponseDecline')?.addEventListener('click', () => _sendPreferredReply('declined', null));
  document.getElementById('prefResponseEta')?.addEventListener('click', () => {
    const etaWrap = document.getElementById('prefResponseEtaWrap');
    if (etaWrap?.classList.contains('hidden')) {
      etaWrap.classList.remove('hidden');
      document.getElementById('prefResponseEtaMin')?.focus();
    } else {
      const min = parseInt(document.getElementById('prefResponseEtaMin')?.value) || 5;
      _sendPreferredReply('eta', min);
    }
  });

  // ── Modal C : Bypass queue ────────────────────────────────────────
  let _prefBypassCallback = null;

  window._openPreferredBypassModal = (reqId, localId, displayName, onYes, meta = {}) => {
    const overlay = document.getElementById('preferredBypassOverlay');
    if (!overlay) return;
    const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '—';
    const nameEl = document.getElementById('prefBypassName');
    if (nameEl) nameEl.textContent = displayName;
    // Ticket file partagée (prochain en attente)
    const qTicketEl = document.getElementById('prefBypassQueueTicket');
    const qTimeEl   = document.getElementById('prefBypassQueueTime');
    if (qTicketEl) qTicketEl.textContent = meta.nextTicket || '—';
    if (qTimeEl)   qTimeEl.textContent   = fmtTime(meta.overflowSince);
    // Personne avec préférence
    const pNameEl = document.getElementById('prefBypassPrefName');
    const pTimeEl = document.getElementById('prefBypassPrefTime');
    if (pNameEl) pNameEl.textContent = displayName;
    if (pTimeEl) pTimeEl.textContent = fmtTime(meta.prefTs);
    _prefBypassCallback = onYes;
    overlay.classList.remove('hidden');
  };

  document.getElementById('prefBypassYes')?.addEventListener('click', async () => {
    document.getElementById('preferredBypassOverlay')?.classList.add('hidden');
    if (_prefBypassCallback) { await _prefBypassCallback(); _prefBypassCallback = null; }
  });
  document.getElementById('prefBypassNo')?.addEventListener('click', () => {
    document.getElementById('preferredBypassOverlay')?.classList.add('hidden');
    showToast('La personne attend son tour.');
    _prefBypassCallback = null;
  });

  // ── Hook expiration données sensibles ────────────────────────────
  window._onPreferredDataExpired = async (reqId) => {
    if (!reqId) return;
    await DB.erasePreferredRequestSensitiveData(reqId);
    const cdEl = document.getElementById('prefDeleteCountdownNote');
    if (cdEl) cdEl.textContent = '[Données effacées]';
  };

  // ── Hook fermeture bureau avec preferredPending ──────────────────
  window._notifyPreferredCancelledOnClose = async (pending, localLabel) => {
    const myKey  = sessionStorage.getItem('cpas_current_agent_key');
    const myName = DB.getAgentsWithKeys().find(a => a.key === myKey)?.name || 'L\'agent';
    for (const accKey of DB.getAccueilAgentKeys()) {
      await DB.sendNotif(
        `${myName} a fermé son bureau (${localLabel}) — le bénéficiaire ${pending.displayName || ''} n'a pas encore été reçu.`,
        'warn', accKey, { requestId: pending.requestId }
      );
    }
  };

  // Re-render vue Direct quand preferredPending OU preferredQueue change (listeners top-level)
  DB.onPreferredPendingChange(() => { LIVE.render(); HOME.render(); });
  DB.onPreferredQueueChange(()   => { LIVE.render(); HOME.render(); });

  // ═══════════════════════════════════════════════════════════════
  // ─── Annonce d'arrivée (mascotte) ─────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  function _openArrivalAnnounceModal(agentName) {
    const overlay    = document.getElementById('arrivalAnnounceOverlay');
    const checksEl   = document.getElementById('arrivalRoleChecks');
    const lieuSel    = document.getElementById('arrivalLieu');
    if (!overlay || !checksEl || !lieuSel) return;

    // Remplir les checkboxes de rôles (tous les rôles, sauf le propre rôle de l'agent)
    const myAgentKey = sessionStorage.getItem('cpas_current_agent_key');
    const myRoleId   = DB.getAgentPermRole(myAgentKey) || '__agent__';
    const roles      = DB.getPermRoles();

    checksEl.innerHTML = Object.entries(roles).map(([rid, role]) => `
      <label class="arrival-role-check">
        <input type="checkbox" class="arrival-cb" data-role-id="${rid}"
          ${rid === myRoleId ? '' : 'checked'}>
        <span class="arrival-role-dot" style="background:${role.color || '#6b7280'}"></span>
        <span>${role.name}</span>
      </label>`).join('');

    // Remplir le sélecteur de lieux
    const lieux = Object.entries(DB._lieux || {})
      .sort(([, a], [, b]) => (a.order || 999) - (b.order || 999));
    lieuSel.innerHTML = '<option value="">— Aucun lieu précisé —</option>' +
      lieux.map(([lid, l]) => `<option value="${lid}">${l.name}</option>`).join('');

    overlay.classList.remove('hidden');

    // Bouton Ignorer
    const skipOnce = () => overlay.classList.add('hidden');
    document.getElementById('arrivalAnnounceSkip')
      ?.addEventListener('click', skipOnce, { once: true });

    // Fermeture via ✕
    document.getElementById('arrivalAnnounceClose')
      ?.addEventListener('click', skipOnce, { once: true });

    // Fermeture en cliquant l'overlay
    const bgClose = e => { if (e.target === overlay) overlay.classList.add('hidden'); };
    overlay.addEventListener('click', bgClose);

    // Bouton Prévenir
    document.getElementById('arrivalAnnounceSend')
      ?.addEventListener('click', async () => {
        overlay.classList.add('hidden');
        overlay.removeEventListener('click', bgClose);
        await _sendArrivalAnnouncement(agentName, checksEl, lieuSel.value);
      }, { once: true });
  }

  async function _sendArrivalAnnouncement(agentName, checksEl, lieuId) {
    const lieuName = lieuId ? (DB._lieux[lieuId]?.name || '') : '';
    const msg = lieuName
      ? `👋 ${agentName} vient d'arriver — ${lieuName}`
      : `👋 ${agentName} vient d'arriver`;

    // Collecter les rôles cochés
    const selectedRoleIds = [...checksEl.querySelectorAll('.arrival-cb:checked')]
      .map(cb => cb.dataset.roleId);

    if (!selectedRoleIds.length) return;

    // Trouver tous les agents ayant l'un des rôles cochés (sauf l'agent qui annonce)
    const myAgentKey = sessionStorage.getItem('cpas_current_agent_key');
    const targets    = DB.getAgentsWithKeys()
      .filter(a => a.key && a.key !== myAgentKey && selectedRoleIds.includes(DB.getAgentPermRole(a.key) || '__agent__'));

    // Envoyer une notif par agent cible
    await Promise.all(targets.map(a =>
      DB.sendNotif(msg, 'arrival', a.key, { lieuId: lieuId || null, sourceAgentKey: myAgentKey })
    ));

    if (targets.length) {
      showToast(`Arrivée annoncée à ${targets.length} collègue${targets.length > 1 ? 's' : ''} ✓`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── Gestion RDV depuis le panneau de notifications ──────────
  // ═══════════════════════════════════════════════════════════════

  // Ouvre un local picker inline (overlay dynamique) pour accepter un RDV depuis la notif
  window._openRdvAcceptModal = async (notifId, requestId) => {
    const req = await DB.getAppointmentRequest(requestId);
    if (!req) { showToast('Demande introuvable.', 'warn'); return; }

    const myKey  = sessionStorage.getItem('cpas_current_agent_key');
    const myName = DB.getAgentsWithKeys().find(a => a.key === myKey)?.name || '';
    const startDT = req.startDateTime;
    const endDT   = req.endDateTime;

    // Construire l'overlay local picker
    const conflicts   = DB.getInRange(startDT, endDT);
    const takenLocals = new Set(conflicts.map(r => String(r.localId)));

    const lieux = Object.entries(DB._lieux || {})
      .filter(([, l]) => !l.isBackoffice)
      .sort(([, a], [, b]) => (a.order || 999) - (b.order || 999));

    let localListHtml = '';
    lieux.forEach(([, lieu]) => {
      const vis = lieu.localIds.filter(lid => !DB.isLocalHidden(lid));
      if (!vis.length) return;
      localListHtml += `<div style="font-size:.78rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;padding:.35rem 0 .1rem">${lieu.name}</div>`;
      vis.forEach(lid => {
        const label = DB.getLocalLabel(lid);
        const free  = !takenLocals.has(String(lid));
        localListHtml += `<button class="rdv-notif-local-btn${free ? '' : ' rdv-local-busy'}"
          data-lid="${lid}" ${free ? '' : 'disabled'}
          style="display:flex;align-items:center;gap:.6rem;padding:.55rem .85rem;border:1.5px solid ${free ? '#e2e8f0' : '#fecaca'};border-radius:10px;background:${free ? '#f8fafc' : '#fff5f5'};cursor:${free ? 'pointer' : 'default'};font-size:.88rem;text-align:left;width:100%;margin-bottom:.3rem;${free ? '' : 'opacity:.5'}">
          <span>${free ? '🟢' : '🔴'}</span> ${label}
          ${free ? '' : '<span style="margin-left:auto;font-size:.75rem;color:#ef4444">Occupé</span>'}
        </button>`;
      });
    });

    const overlay = document.createElement('div');
    overlay.className = 'rdv-overlay';
    overlay.style.zIndex = '4000';
    overlay.innerHTML = `
      <div class="rdv-modal">
        <div class="rdv-modal-hd">
          <h3>🏠 Choisir le local — RDV</h3>
          <button class="rdv-modal-close" id="_rdvNotifLocalClose">✕</button>
        </div>
        <p class="rdv-modal-hint">Sélectionnez un local frontoffice pour ce rendez-vous (${req.requesterName || ''}).</p>
        <div class="rdv-local-list" style="max-height:300px;overflow-y:auto">${localListHtml || '<div class="rdv-empty">Aucun local disponible.</div>'}</div>
        <div class="rdv-modal-ft"><button class="btn-cancel" id="_rdvNotifLocalCancel">Annuler</button></div>
      </div>`;

    document.body.appendChild(overlay);

    const _close = () => overlay.remove();
    overlay.querySelector('#_rdvNotifLocalClose')?.addEventListener('click', _close);
    overlay.querySelector('#_rdvNotifLocalCancel')?.addEventListener('click', _close);
    overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });

    overlay.querySelectorAll('.rdv-notif-local-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        _close();
        const localId = String(btn.dataset.lid);
        try {
          await _rdvFinalizeAcceptFromApp(req, requestId, localId, myKey, myName);
          // Marquer la notif comme répondue
          if (notifId) await DB._ref(`notifications/${notifId}/rdvResponded`).set(true);
        } catch (e) {
          showToast('Erreur lors de l\'acceptation : ' + e.message, 'warn');
        }
      });
    });
  };

  // Logique d'acceptation RDV depuis app.js (similaire à rdv.js _finalizeAccept)
  async function _rdvFinalizeAcceptFromApp(req, requestId, localId, _myKey, myName) {
    if (!req || !req.startDateTime || !req.endDateTime) {
      showToast('Demande introuvable ou incomplète.', 'warn');
      return;
    }
    const startDT = req.startDateTime;
    const endDT   = req.endDateTime;
    const localName = DB.getLocalName(localId);
    const withPerson = req.withPerson || {};
    const withStr = withPerson.type === 'agent' ? withPerson.name : `(ext.) ${withPerson.name || ''}`;
    const rdvNote = `RDV avec ${withStr}${req.message ? ' — ' + req.message : ''}`;

    // Vérifier conflit RDV pour cet agent
    const conflicts = DB.getInRange(startDT, endDT);
    const rdvConflict = conflicts.find(r => r.agent === myName && r.type === 'rendez-vous');
    if (rdvConflict) {
      await DB.refuseAppointmentRequest(requestId);
      if (req.requesterAgentKey) {
        await DB.sendNotif(`❌ RDV refusé automatiquement — conflit de rendez-vous.`, 'rdv_refused', req.requesterAgentKey, { requestId });
      }
      showToast('Conflit de rendez-vous détecté — RDV refusé.', 'warn');
      return;
    }

    // Split des réservations backoffice (utilise _start/_end pour les récurrentes)
    const rdvS = new Date(startDT).getTime();
    const rdvE = new Date(endDT).getTime();
    const boRes = conflicts.filter(r => {
      const boS = r._start ? r._start.getTime() : new Date(r.startDateTime).getTime();
      const boE = r._end   ? r._end.getTime()   : new Date(r.endDateTime).getTime();
      return r.agent === myName && DB.isLocalBackoffice(r.localId) && boS < rdvE && boE > rdvS;
    });
    for (const bo of boRes) {
      const boActualStart = bo._start ? bo._start.toISOString().slice(0, 16) : bo.startDateTime;
      const boActualEnd   = bo._end   ? bo._end.toISOString().slice(0, 16)   : bo.endDateTime;
      const isRec = bo.recurrence && bo.recurrence.type && bo.recurrence.type !== 'none';
      if (isRec && bo._occDate) {
        await DB.addException(bo.id, bo._occDate);
        if (boActualStart < startDT) await DB._ref('reservations').push({ localId: String(bo.localId), agent: bo.agent, services: bo.services || [], startDateTime: boActualStart, endDateTime: startDT, recurrence: { type: 'none' }, createdAt: Date.now() });
        if (boActualEnd > endDT)   await DB._ref('reservations').push({ localId: String(bo.localId), agent: bo.agent, services: bo.services || [], startDateTime: endDT, endDateTime: boActualEnd, recurrence: { type: 'none' }, createdAt: Date.now() });
      } else {
        if (bo.id) await DB.remove(bo.id);
        if (boActualStart < startDT) await DB._ref('reservations').push({ localId: String(bo.localId), agent: bo.agent, services: bo.services || [], startDateTime: boActualStart, endDateTime: startDT, recurrence: { type: 'none' }, createdAt: Date.now() });
        if (boActualEnd > endDT)   await DB._ref('reservations').push({ localId: String(bo.localId), agent: bo.agent, services: bo.services || [], startDateTime: endDT, endDateTime: boActualEnd, recurrence: { type: 'none' }, createdAt: Date.now() });
      }
    }

    // Créer la réservation RDV
    await DB._ref('reservations').push({ localId: String(localId), agent: myName, services: [], type: 'rendez-vous', rdvSlotId: req.slotId || null, startDateTime: startDT, endDateTime: endDT, note: rdvNote, secret: req.secret ? true : null, requesterAgentKey: req.requesterAgentKey || null, targetAgentKey: _myKey || null, recurrence: { type: 'none' }, createdAt: Date.now() });

    // Mettre à jour la demande
    await DB.acceptAppointmentRequest(requestId, localId);

    // Notif retour au demandeur
    const fmtDT = iso => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
    if (req.requesterAgentKey) {
      await DB.sendNotif(`✅ RDV accepté par ${myName} — ${fmtDT(startDT)} au ${localName}`, 'rdv_accepted', req.requesterAgentKey, { requestId, localId });
    }
    showToast(`RDV accepté — réservation créée au ${localName} ✓`);
  }

  // Refus depuis la notif
  window._rdvRefuseFromNotif = async (requestId) => {
    const req = await DB.getAppointmentRequest(requestId);
    if (!req) return;
    const myKey  = sessionStorage.getItem('cpas_current_agent_key');
    const myName = DB.getAgentsWithKeys().find(a => a.key === myKey)?.name || '';
    await DB.refuseAppointmentRequest(requestId);
    if (req.requesterAgentKey) {
      await DB.sendNotif(`❌ RDV refusé par ${myName}`, 'rdv_refused', req.requesterAgentKey, { requestId });
    }
    showToast('Demande refusée.');
  };

  // ═══════════════════════════════════════════════════════════════
  // ─── Panic button ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════
  (function initPanicButton() {
    const btn     = document.getElementById('panicBtn');
    const overlay = document.getElementById('panicConfirmOverlay');
    if (!btn || !overlay) return;

    // Afficher/masquer selon la permission du rôle
    function updatePanicVisibility() {
      btn.classList.toggle('hidden', !DB.hasPermission('panicButton'));
    }
    DB.onConfigChange(updatePanicVisibility);
    updatePanicVisibility();

    // Ouvrir la modale de confirmation
    btn.addEventListener('click', () => overlay.classList.remove('hidden'));

    // Annuler
    document.getElementById('panicCancel')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    // Son d'alarme local (déclenché côté émetteur aussi)
    function _playPanicAlarm() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const tone = (freq, t0, dur, vol = 0.6) => {
          const osc  = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sawtooth'; osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, ctx.currentTime + t0);
          gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + t0 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + dur);
          osc.start(ctx.currentTime + t0);
          osc.stop(ctx.currentTime + t0 + dur + 0.05);
        };
        for (let i = 0; i < 5; i++) {
          tone(1320, i * 0.16, 0.12);
          tone(880,  i * 0.16 + 0.08, 0.08);
        }
      } catch (_) {}
    }

    // Modale d'alerte reçue par les autres agents
    const panicAlertOverlay = document.getElementById('panicAlertOverlay');
    const panicAlertMsg     = document.getElementById('panicAlertMsg');
    window._showPanicAlert = (n) => {
      if (!panicAlertOverlay) return;
      if (panicAlertMsg) panicAlertMsg.textContent = n.message || 'Alerte d\'urgence !';
      panicAlertOverlay.classList.remove('hidden');
    };
    document.getElementById('panicAlertAck')?.addEventListener('click', () => {
      panicAlertOverlay?.classList.add('hidden');
    });

    // Déclencher l'alerte
    document.getElementById('panicConfirm')?.addEventListener('click', async () => {
      overlay.classList.add('hidden');

      const myKey    = sessionStorage.getItem('cpas_current_agent_key');
      const myName   = DB.getAgentsWithKeys().find(a => a.key === myKey)?.name || 'Un agent d\'accueil';
      const localId  = DB.getOpenBureauForCurrentAgent();
      const localLbl = localId ? DB.getLocalLabel(localId) : null;
      const location = localLbl || 'l\'accueil';

      _playPanicAlarm();

      // Broadcast à tous (null = tous les agents)
      await DB.sendNotif(
        `🚨 ALERTE — ${myName} a besoin d'aide immédiate à ${location} !`,
        'panic', null,
        { urgent: true, fromAgentKey: myKey, fromAgentName: myName, local: location }
      );

      showToast('🚨 Alerte envoyée à tous les agents.', 'warn');
    });
  })();

  // ─── Panic démo (pré-prod) ────────────────────────────────────
  (function initPanicDemo() {
    const card    = document.getElementById('hsPanicDemoCard');
    const overlay = document.getElementById('panicDemoOverlay');
    if (!card || !overlay) return;

    // Visible uniquement si : integratorRdvEnabled actif + permission panicButton
    DB._ref('appConfig/integratorRdvEnabled').once('value').then(snap => {
      if (snap.val() === false) return;
      DB.onConfigChange(() => {
        card.style.display = DB.hasPermission('panicDemo') ? 'block' : 'none';
      });
    }).catch(() => {});

    document.getElementById('panicDemoBtn')?.addEventListener('click', () => {
      overlay.classList.remove('hidden');
    });
    document.getElementById('panicDemoCancel')?.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });

    document.getElementById('panicDemoConfirm')?.addEventListener('click', async () => {
      overlay.classList.add('hidden');

      const myKey   = sessionStorage.getItem('cpas_current_agent_key');
      const myName  = DB.getAgentsWithKeys().find(a => a.key === myKey)?.name || 'Un agent';
      const localId = DB.getOpenBureauForCurrentAgent();
      const localLbl = localId ? DB.getLocalLabel(localId) : null;
      const location = localLbl || 'l\'accueil';

      const exampleAlert = `🚨 ALERTE — ${myName} a besoin d'aide immédiate à ${location} !`;
      const demoMsg = `🧪 CECI EST UNE DÉMONSTRATION DU BOUTON PANIQUE.\n\nSi un agent a besoin d'aide urgente (agressivité, malaise…), tous les agents connectés reçoivent une alerte instantanée avec son nom et son local.\n\nExemple d'alerte réelle :\n${exampleAlert}`;

      await DB.sendNotif(demoMsg, 'panic', null, {
        urgent: true, fromAgentKey: myKey, fromAgentName: myName, local: location, isDemo: true,
      });

      showToast('🧪 Démo panic envoyée à tous les agents.', 'info');
    });
  })();

  // ─── Push PWA (Couche D.2) ─────────────────────────────────────
  // Actif seulement si : service worker supporté + VAPID_KEY configuré + feature enablePushNotif
  (function initPushPWA() {
    if (!('serviceWorker' in navigator)) return;
    if (!CONFIG.VAPID_KEY) return; // clé VAPID non configurée → désactivé
    DB.onConfigChange(async () => {
      if (!DB.getFeature('enablePushNotif')) return;
      const agentKey = sessionStorage.getItem('cpas_current_agent_key');
      if (!agentKey) return;

      try {
        const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
        // Importer Firebase Messaging (compat)
        if (!firebase.messaging) return;
        const msg = firebase.messaging();
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return;
        const token = await msg.getToken({ vapidKey: CONFIG.VAPID_KEY, serviceWorkerRegistration: reg });
        if (!token) return;
        // Stocker le token dans agentStatus/{agentKey}/fcmTokens/{hash}
        const tokenId = token.slice(-20); // ID court pour la clé Firebase
        await DB._ref(`agentStatus/${agentKey}/fcmTokens/${tokenId}`).set(token);
      } catch (err) {
        console.warn('[Push PWA] Erreur init :', err.message);
      }
    });
  })();

});
