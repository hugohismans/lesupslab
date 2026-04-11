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
      const svc = escapeHtml(imminent.service === 'Autre' ? imminent.serviceCustom : imminent.service);
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
      const svc = escapeHtml(nextSoon.service === 'Autre' ? nextSoon.serviceCustom : nextSoon.service);
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
  _hasSaidBonjourToday(agentKey) { return !!localStorage.getItem(this._bonjourKey(agentKey)); },
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

    // ─ Raccourcis ────────────────────────────────────────────────────
    document.getElementById('hsGoCalendar').addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'day'));
      _showCalView('day');
    });
    document.getElementById('hsGoLive').addEventListener('click', () => LIVE.open());
    document.getElementById('hsGoNew').addEventListener('click', () => {
      this._requireBonjour(() => {
        const btnNew = document.getElementById('btnNew');
        if (btnNew) btnNew.click();
      });
    });
    document.getElementById('hsGoStatus').addEventListener('click', () => {
      const btnSt = document.getElementById('btnPresenceHd');
      if (btnSt) btnSt.click();
    });

    // ─ Se déclarer dans un bureau ────────────────────────────────────
    document.getElementById('hsDeclLieu').addEventListener('change', () => this._fillDeclLocals());
    document.getElementById('hsDeclBtn').addEventListener('click', () => {
      this._requireBonjour(async () => {
      const localId = parseInt(document.getElementById('hsDeclLocal').value);
      if (!localId) return;
      if (DB.getFeature('enableBackoffice') && DB.isLocalBackoffice(localId)) {
        const prevLocal = DB.getAgentCurrentBackofficeLocal();
        if (prevLocal !== null && prevLocal !== localId) {
          showBureauConfirm({
            title: 'Changement de bureau',
            info:  `Vous étiez dans <strong>${escapeHtml(DB.getLocalLabel(prevLocal))}</strong>. Vous avez quitté ce bureau ?`,
            okLabel: 'Oui, je suis parti',
            onOk: async () => {
              await DB.setAgentPresence(prevLocal, false);
              await DB.setAgentPresence(localId, true);
              this.render();
            },
          });
          return;
        }
        await DB.setAgentPresence(localId, true);
        this.render();
      } else {
        // Ouvrir bureau via confirmation modale (même logique que la vue Live)
        const alreadyOpen = DB.getOpenBureauForCurrentAgent();
        if (alreadyOpen !== null && alreadyOpen !== localId) {
          showBureauConfirm({
            icon: '⚠️', title: 'Bureau déjà ouvert',
            info: `<div class="lv-bm-empty" style="color:#fbbf24">Vous êtes déjà dans <strong>${escapeHtml(DB.getLocalLabel(alreadyOpen))}</strong>.<br>Fermez ce bureau d'abord.</div>`,
            okLabel: null
          });
          return;
        }
        await DB.openBureau(localId);
        // Notif accueil
        if (DB.getFeature('enableNotif')) {
          const _lieuName  = DB.getLocalLieuName(localId);
          const _localName = DB.getLocalLabel(localId);
          const _grp       = DB.getLocalGroup(localId);
          let _msg = `🟢 ${_localName}${_lieuName ? ` (${_lieuName})` : ''} vient d'ouvrir.`;
          if (!_grp) _msg += ` ⚠️ Pas de file partagée.`;
          await Promise.all(DB.getAccueilAgentKeys().map(k => DB.sendNotif(_msg, 'info', k)));
        }
        this.render();
      }
      }); // fin _requireBonjour
    });
    document.getElementById('hsDeclLeaveBtn').addEventListener('click', async () => {
      const localId = parseInt(document.getElementById('hsDeclLocal').value);
      if (!localId) return;
      if (DB.getFeature('enableBackoffice') && DB.isLocalBackoffice(localId)) {
        await DB.setAgentPresence(localId, false);
      } else {
        await DB.closeBureau(localId);
      }
      this.render();
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
      } else if (myBureauLabel) {
        icon = '🟢'; text = `Bureau ouvert — ${myBureauLabel}${myBureauLieu ? ` · ${myBureauLieu}` : ''}`; cls = 'hs-status-open';
      } else if (boLabel) {
        icon = '🏢'; text = `En backoffice — ${boLabel}`; cls = 'hs-status-bo';
      } else {
        icon = '✅'; text = 'Présent aujourd\'hui'; cls = 'hs-status-present';
      }

      myStatusEl.className = `hs-my-status ${cls}`;
      myStatusEl.innerHTML = `<span class="hs-status-icon">${icon}</span><span class="hs-status-text">${text}</span>`;
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
          return a === agentName;
        })
        .sort((a, b) => (a._start||0) - (b._start||0));

      // ─ Bulle mascotte ────────────────────────────────────────────
      this._updateBubble(agentName, todays);
      if (todays.length === 0) {
        agendaEl.innerHTML = '<div class="hs-agenda-empty">Aucune réservation aujourd\'hui</div>';
      } else {
        agendaEl.innerHTML = todays.map(r => {
          const svc = r.service === 'Autre' ? r.serviceCustom : r.service;
          const loc = DB.getLocalLabel(r.localId);
          const hm  = r._start?.toLocaleTimeString('fr-BE', { hour:'2-digit', minute:'2-digit' }) || '';
          const hme = r._end?.toLocaleTimeString('fr-BE',   { hour:'2-digit', minute:'2-digit' }) || '';
          const now = new Date();
          const active = r._start <= now && (r._end === null || r._end >= now);
          return `<div class="hs-agenda-item${active ? ' hs-agenda-active' : ''}">
            <div class="hs-agenda-time">${hm}${hme ? ` – ${hme}` : ''}</div>
            <div class="hs-agenda-info">
              <span class="hs-agenda-svc">${escapeHtml(svc)}</span>
              <span class="hs-agenda-loc">📍 ${escapeHtml(loc)}</span>
            </div>
          </div>`;
        }).join('');
      }
    } else {
      agendaEl.innerHTML = '<div class="hs-agenda-empty">Connectez-vous pour voir votre agenda</div>';
    }

    // ─ Bureau d'accueil (local caché) ───────────────────────────────
    const deskLocalId = DB.getAccueilDeskLocalId();
    const deskCard    = document.getElementById('hsAccueilDeskCard');
    if (deskCard) {
      if (deskLocalId !== null) {
        const deskPresence = DB.getBackofficePresence(deskLocalId);
        const deskKeys     = Object.keys(deskPresence);
        const deskNames    = deskKeys.map(k => agents.find(a => a.key === k)?.name || k);
        const iAmAtDesk    = agentKey && !!deskPresence[agentKey];
        deskCard.innerHTML = `
          <h3 class="hs-card-title">🪟 Bureau d'accueil</h3>
          <div class="hs-bo-presence">
            ${deskNames.length
              ? deskNames.map(n => `<span class="hs-pres-chip${n === agentName ? ' hs-chip-me' : ''}">${escapeHtml(n)}</span>`).join('')
              : '<span class="hs-bo-nobody">Personne actuellement</span>'}
          </div>
          <button class="hs-desk-btn${iAmAtDesk ? ' hs-desk-leave' : ''}" id="hsAccueilDeskBtn" data-present="${iAmAtDesk ? '1' : '0'}" data-local="${deskLocalId}">
            ${iAmAtDesk ? '🚪 Je quitte l\'accueil' : '🪟 Je suis à l\'accueil'}
          </button>`;
        deskCard.classList.remove('hidden');
        // Binder le bouton à chaque render
        document.getElementById('hsAccueilDeskBtn')?.addEventListener('click', async () => {
          const btn  = document.getElementById('hsAccueilDeskBtn');
          const lid  = parseInt(btn.dataset.local);
          const here = btn.dataset.present === '1';
          if (!here) {
            const prevLocal = DB.getAgentCurrentBackofficeLocal();
            if (prevLocal !== null && prevLocal !== lid) {
              showBureauConfirm({
                title: 'Changement de bureau',
                info:  `Vous étiez dans <strong>${escapeHtml(DB.getLocalLabel(prevLocal))}</strong>. Vous avez quitté ce bureau ?`,
                okLabel: 'Oui, je suis parti',
                onOk: async () => {
                  await DB.setAgentPresence(prevLocal, false);
                  await DB.setAgentPresence(lid, true);
                  this.render();
                },
              });
              return;
            }
          }
          await DB.setAgentPresence(lid, !here);
          this.render();
        });
      } else {
        deskCard.classList.add('hidden');
      }
    }

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
            if (openKey) _assignedKeys.add(openKey);
            presRows.push(`<div class="hs-pres-row${isMe ? ' hs-pres-me' : ''}">
              <span class="hs-pres-local">🟢 ${escapeHtml(localLabel)}</span>
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

    // Agents en mission ou formation (absents du bureau mais au travail)
    const _today = new Date().toISOString().slice(0, 10);
    const _missionAgents = [];
    const _formationAgents = [];
    agents.forEach(({ key, name }) => {
      if (_assignedKeys.has(key)) return; // déjà affiché dans un bureau
      const absEntry = DB.getAgentAbsenceOn(key, _today);
      if (!absEntry) return;
      const [, abs] = absEntry;
      if (abs.motif === 'mission') _missionAgents.push({ name, comment: abs.comment || null });
      else if (abs.motif === 'formation') _formationAgents.push({ name, comment: abs.comment || null });
    });
    if (_missionAgents.length > 0) {
      presRows.push(`<div class="hs-pres-row hs-pres-mission">
        <span class="hs-pres-local">🚗 En mission</span>
        <span class="hs-pres-lieu">Hors bureau</span>
        <span class="hs-pres-agents">${_missionAgents.map(a => `<span class="hs-pres-chip hs-pres-chip-mission" title="${escapeHtml(a.comment || '')}">${escapeHtml(a.name)}</span>`).join('')}</span>
      </div>`);
    }
    if (_formationAgents.length > 0) {
      presRows.push(`<div class="hs-pres-row hs-pres-formation">
        <span class="hs-pres-local">📚 En formation</span>
        <span class="hs-pres-lieu">Hors bureau</span>
        <span class="hs-pres-agents">${_formationAgents.map(a => `<span class="hs-pres-chip hs-pres-chip-formation" title="${escapeHtml(a.comment || '')}">${escapeHtml(a.name)}</span>`).join('')}</span>
      </div>`);
    }

    presEl.innerHTML = presRows.length
      ? presRows.join('')
      : '<div class="hs-agenda-empty">Aucun bureau ouvert</div>';

    // ─ Sélecteurs déclaration présence ──────────────────────────────
    this._fillDeclLieux();
  },

  _fillDeclLieux() {
    const sel = document.getElementById('hsDeclLieu');
    if (!sel) return;
    const lieux = DB.getLieux();
    const entries = Object.entries(lieux);
    if (sel.innerHTML === '' || sel.dataset.filled !== JSON.stringify(entries.map(([id]) => id))) {
      sel.innerHTML = entries.map(([id, l]) =>
        `<option value="${id}">${escapeHtml(l.name)}</option>`).join('');
      sel.dataset.filled = JSON.stringify(entries.map(([id]) => id));
    }
    this._fillDeclLocals();
  },

  _fillDeclLocals() {
    const lieuSel  = document.getElementById('hsDeclLieu');
    const localSel = document.getElementById('hsDeclLocal');
    if (!lieuSel || !localSel) return;
    const lieuId = lieuSel.value;
    const lieux  = DB.getLieux();
    const lieu   = lieux[lieuId];
    if (!lieu) { localSel.innerHTML = ''; return; }

    const agentKey = sessionStorage.getItem('cpas_current_agent_key');
    localSel.innerHTML = lieu.localIds.map(id => {
      const label = DB.getLocalLabel(id);
      return `<option value="${id}">${escapeHtml(label)}</option>`;
    }).join('');

    // Mise à jour du bouton selon l'état courant
    const localId = parseInt(localSel.value);
    if (localId) {
      const isBO    = DB.getFeature('enableBackoffice') && DB.isLocalBackoffice(localId);
      const iAmHere = isBO
        ? agentKey && DB.isAgentPresentInLocal(localId, agentKey)
        : agentKey && DB.getBureauAgentKey(localId) === agentKey;
      document.getElementById('hsDeclBtn').classList.toggle('hidden', !!iAmHere);
      document.getElementById('hsDeclLeaveBtn').classList.toggle('hidden', !iAmHere);
      document.getElementById('hsDeclStatus').textContent = iAmHere
        ? `✅ Vous êtes déclaré dans ${DB.getLocalLabel(localId)}`
        : '';
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
  show('pubDdWrap',           DB.getFeature('enablePublicView'));
  show('btnPresenceHd',       DB.getFeature('enablePresence'));
  show('btnAnalytics',        DB.getFeature('enableAnalytics'));
  show('notifBell',           DB.getFeature('enableNotif'));
  show('btnDnd',              DB.getFeature('enableNotif'));
  show('btnCalendarExport',   DB.getFeature('enableCalendarSync') && !!sessionStorage.getItem('cpas_current_agent_key'));
  // Raccourcis home screen
  show('hsGoLive',            DB.getFeature('enableTickets'));
  show('hsGoStatus',          DB.getFeature('enablePresence'));
  // Bouton météo (visible uniquement si météo activée et coords configurées)
  const wxBtn = document.getElementById('hsAskWeather');
  if (wxBtn) {
    const { lat, lon } = DB.getOrgCoords();
    const wxData = typeof WEATHER !== 'undefined' ? WEATHER.get() : null;
    wxBtn.classList.toggle('hidden', !DB.getFeature('enableWeather') || !wxData);
  }

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
    const svc   = res.service === 'Autre' ? res.serviceCustom : res.service;
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
  // Visibilité : accueil ou admin
  DB.onConfigChange(() => {
    const myKey  = sessionStorage.getItem('cpas_current_agent_key');
    const myRole = myKey ? DB.getAgentPermRole(myKey) : null;
    const canBC  = myRole === '__accueil__' || myRole === '__admin__' || myRole === '__direction__' || myRole === '__chef_service__';
    const btnBC  = document.getElementById('btnBroadcast');
    if (btnBC) btnBC.style.display = canBC ? '' : 'none';
  });

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
      await DB.setAgentStatus(key, status, time);
      if (!isMyOwn && DB.getFeature('enableNotifAuto')) {
        const lbl = { late: `J'arrive ! (arrivée prévue ${time || '?'})`, absent: 'Absent(e)' };
        await DB.sendNotif(`Votre statut a été mis à jour : ${lbl[status] || 'Présent(e)'}.`, 'info', key);
      }
      document.getElementById('presenceOverlay').classList.add('hidden');
      if (!status || status === 'present') {
        window.MascotBrain?.triggerAgentArrived?.(agentName);
        await _revokeMyTempAdmin(myKey, agentName);
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

  // ─── Dropdown Vue Publique ─────────────────────────────────────
  function updatePublicDropdown() {
    const orgParam  = ORG_ID !== 'cpas-quaregnon' ? `?org=${ORG_ID}` : '';
    const sep       = orgParam ? '&' : '?';
    const screens   = DB.getScreens();
    const menu      = document.getElementById('pubDdMenu');
    if (!menu) return;
    menu.innerHTML  = `
      <a class="pub-dd-item" href="public.html${orgParam}" target="_blank">🌐 Tous les locaux</a>
      ${screens.length ? '<div class="pub-dd-sep"></div>' : ''}
      ${screens.map(s =>
        `<a class="pub-dd-item" href="public.html${orgParam}${sep}screen=${s.id}" target="_blank">
          🖥 ${escapeHtml(s.name)}
        </a>`
      ).join('')}`;
  }

  // Rafraîchir le dropdown quand la config change
  DB.onConfigChange(updatePublicDropdown);

  // Ouvrir/fermer le dropdown
  document.getElementById('btnPublic').addEventListener('click', e => {
    e.stopPropagation();
    const menu = document.getElementById('pubDdMenu');
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    document.getElementById('pubDdMenu')?.classList.add('hidden');
  });

  // Bouton ajout écran → géré dans modal.js (_initSettings)

  // ═══════════════════════════════════════════════════════════════
  // ─── "Ne veut voir qu'un agent" — circuit préférentiel ────────
  // ═══════════════════════════════════════════════════════════════

  // Initialiser les listeners preferredPending pour les locaux visibles
  DB.onConfigChange(() => {
    const lieux  = DB.getLieux();
    const locals = Object.values(lieux).flatMap(l => l.localIds || []).map(Number);
    if (locals.length) DB.initPreferredPending(locals);
  });

  // Nettoyer les données sensibles expirées au démarrage
  DB.cleanExpiredPreferredData?.();

  // ── Modal A : Accueil — créer une demande préférentielle ────────
  window._openPreferredRequestModal = (grpId) => {
    const overlay  = document.getElementById('preferredRequestOverlay');
    const agentSel = document.getElementById('prefAgentSelect');
    const placeSel = document.getElementById('prefPublicPlaceSelect');
    const benefIn  = document.getElementById('prefBenefName');
    if (!overlay || !agentSel || !placeSel) return;

    // Peupler agents connectés aujourd'hui (hors accueil)
    const myKey   = sessionStorage.getItem('cpas_current_agent_key');
    const agents  = DB.getConnectedTodayAgents().filter(k => k !== myKey);
    agentSel.innerHTML = '<option value="">— Choisir un agent —</option>' +
      agents.map(k => {
        const info = DB.getAgentsWithKeys().find(a => a.key === k);
        return `<option value="${escapeHtml(k)}">${escapeHtml(info?.name || k)}</option>`;
      }).join('');

    // Peupler lieux publics
    const places = DB.getPublicPlaces();
    placeSel.innerHTML = '<option value="">— Aucun lieu précis —</option>' +
      places.map(p =>
        `<option value="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">${escapeHtml(p.name)}${p.description ? ' — ' + p.description : ''}</option>`
      ).join('');

    if (benefIn) benefIn.value = '';
    overlay.dataset.grp = grpId || '';
    overlay.classList.remove('hidden');
    setTimeout(() => benefIn?.focus(), 80);
  };

  document.getElementById('prefRequestConfirm')?.addEventListener('click', async () => {
    const overlay   = document.getElementById('preferredRequestOverlay');
    const benefName = (document.getElementById('prefBenefName')?.value || '').trim();
    const agentKey  = document.getElementById('prefAgentSelect')?.value;
    const placeOpt  = document.getElementById('prefPublicPlaceSelect');
    const placeId   = placeOpt?.value || null;
    const placeName = placeId ? (placeOpt?.selectedOptions[0]?.dataset?.name || '') : null;

    if (!benefName) { showToast('Veuillez saisir le nom du bénéficiaire.'); return; }
    if (!agentKey)  { showToast('Veuillez sélectionner un agent.'); return; }

    // Vérifier si cible est chef_service / direction → confirmer d'abord (Modal D)
    const targetRole = DB.getAgentPermRole(agentKey);
    if (targetRole === '__chef_service__' || targetRole === '__direction__') {
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
    const roleMap   = { '__chef_service__': 'Chef de service', '__direction__': 'Direction' };
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

    // Vérifier si un preferredPending existe déjà pour ce bureau
    if (localId !== null) {
      const existingPending = DB.getPreferredPending(localId);
      if (existingPending) {
        showToast(`${agentName} a déjà un bénéficiaire en attente — impossible d'envoyer une 2ème demande.`);
        return;
      }
    }

    // Vérifier le statut DND
    const agentStatus = DB.getAgentStatus(targetAgentKey);
    const isDnd        = agentStatus?.status === 'dnd';

    // Calculer displayName (prénom ou ticket# selon config)
    const enableNamed = DB.getFeature('enableNamedTickets');
    const displayName = enableNamed ? (benefName.split(' ')[0] || benefName) : 'Bénéficiaire';

    // Déterminer le public name de l'agent cible
    const now2  = new Date();
    const dayS2 = new Date(now2); dayS2.setHours(0,0,0,0);
    const dayE2 = new Date(now2); dayE2.setHours(23,59,59,999);
    const occ   = DB.getInRange(dayS2, dayE2).find(o =>
      Number(o.localId) === localId && o._start <= now2 && (o._end === null || o._end >= now2)
    );
    const agentPublicName = DB.getAgentPublicName(targetAgentKey);

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
        { requestId }
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

    await DB.respondToPreferredRequest(reqId, response, etaMin, comment, localId, myPublicName, displayName);

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
    }

    await DB.sendNotif(replyMsg, 'preferred_reply_accueil', req.accueilAgentKey, { requestId: reqId });
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

  window._openPreferredBypassModal = (reqId, localId, displayName, onYes) => {
    const overlay = document.getElementById('preferredBypassOverlay');
    if (!overlay) return;
    const nameEl = document.getElementById('prefBypassName');
    if (nameEl) nameEl.textContent = displayName;
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

  // Re-render vue Direct quand preferredPending change
  DB.onConfigChange(() => {
    const lieux  = DB.getLieux();
    const locals = Object.values(lieux).flatMap(l => l.localIds || []).map(Number);
    locals.forEach(localId => DB.onPreferredPending(localId, () => LIVE.render()));
  });

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
