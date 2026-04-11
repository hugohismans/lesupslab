// ═══════════════════════════════════════════════════════════════════
// mascots.js — Collection de mascottes + fonction d'application DOM
// Chargé dans index.html ET app.html
// ═══════════════════════════════════════════════════════════════════

const MASCOTS = {
  poulpe: {
    label: 'Poulpe 🐙', name: 'Bulbi', viewBox: '0 0 100 118', shadowColor: 'rgba(109,40,217,.25)',
    svg: `<path class="mc-t mc-t1" d="M24 74 Q16 89 22 104 Q26 112 20 118" stroke="#5b21b6" stroke-width="8.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t2" d="M37 80 Q32 95 36 110 Q38 116 34 118" stroke="#5b21b6" stroke-width="8.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t3" d="M50 83 Q50 98 52 111 Q53 116 50 118" stroke="#5b21b6" stroke-width="8.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t4" d="M63 80 Q68 95 64 110 Q62 116 66 118" stroke="#5b21b6" stroke-width="8.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t5" d="M76 74 Q84 89 78 104 Q74 112 80 118" stroke="#5b21b6" stroke-width="8.5" stroke-linecap="round" fill="none"/>
<ellipse cx="50" cy="40" rx="34" ry="38" fill="#7c3aed"/>
<ellipse cx="37" cy="20" rx="13" ry="8" fill="#a78bfa" opacity=".35" transform="rotate(-18 37 20)"/>
<ellipse cx="21" cy="50" rx="8" ry="5" fill="#c4b5fd" opacity=".6"/>
<ellipse cx="79" cy="50" rx="8" ry="5" fill="#c4b5fd" opacity=".6"/>
<circle cx="37" cy="38" r="10.5" fill="white"/>
<circle cx="63" cy="38" r="10.5" fill="white"/>
<circle cx="39" cy="40" r="6.5" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="65" cy="40" r="6.5" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="41" cy="37" r="2.5" fill="white"/>
<circle cx="67" cy="37" r="2.5" fill="white"/>
<path d="M41 55 Q50 63 59 55" stroke="#5b21b6" stroke-width="2.5" stroke-linecap="round" fill="none"/>`
  },

  chat: {
    label: 'Chat 🐱', name: 'Mochi', viewBox: '0 0 100 108', shadowColor: 'rgba(217,119,6,.22)',
    svg: `<polygon points="16,48 6,10 36,36" fill="#f59e0b"/>
<polygon points="84,48 94,10 64,36" fill="#f59e0b"/>
<polygon points="18,46 11,16 33,35" fill="#fde68a"/>
<polygon points="82,46 89,16 67,35" fill="#fde68a"/>
<ellipse cx="50" cy="62" rx="34" ry="35" fill="#f59e0b"/>
<ellipse cx="37" cy="40" rx="12" ry="7" fill="#fcd34d" opacity=".38" transform="rotate(-18 37 40)"/>
<circle cx="37" cy="57" r="9.5" fill="white"/>
<circle cx="63" cy="57" r="9.5" fill="white"/>
<circle cx="38" cy="58" r="6" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="64" cy="58" r="6" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="40" cy="56" r="2.2" fill="white"/>
<circle cx="66" cy="56" r="2.2" fill="white"/>
<ellipse cx="50" cy="69" rx="4.5" ry="3" fill="#92400e"/>
<line x1="16" y1="66" x2="43" y2="70" stroke="#92400e" stroke-width="1.5" stroke-linecap="round"/>
<line x1="16" y1="72" x2="43" y2="72" stroke="#92400e" stroke-width="1.5" stroke-linecap="round"/>
<line x1="57" y1="70" x2="84" y2="66" stroke="#92400e" stroke-width="1.5" stroke-linecap="round"/>
<line x1="57" y1="72" x2="84" y2="72" stroke="#92400e" stroke-width="1.5" stroke-linecap="round"/>
<path d="M44 77 Q50 84 56 77" stroke="#92400e" stroke-width="2.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t1" d="M54 93 Q72 98 76 106" stroke="#f59e0b" stroke-width="7" stroke-linecap="round" fill="none"/>`
  },

  robot: {
    label: 'Robot 🤖', name: 'Pixo', viewBox: '0 0 100 118', shadowColor: 'rgba(37,99,235,.22)',
    svg: `<line x1="50" y1="5" x2="50" y2="17" stroke="#64748b" stroke-width="3.5" stroke-linecap="round"/>
<circle cx="50" cy="4" r="4.5" fill="#94a3b8"/>
<rect x="11" y="17" width="78" height="62" rx="13" fill="#3b82f6"/>
<rect x="17" y="23" width="66" height="50" rx="10" fill="#2563eb"/>
<rect x="17" y="23" width="32" height="22" rx="8" fill="white"/>
<rect x="51" y="23" width="32" height="22" rx="8" fill="white"/>
<circle cx="33" cy="34" r="8" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="67" cy="34" r="8" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="36" cy="31" r="3" fill="white"/>
<circle cx="70" cy="31" r="3" fill="white"/>
<rect x="27" y="52" width="46" height="14" rx="7" fill="#1d4ed8"/>
<circle cx="38" cy="59" r="3.5" fill="#60a5fa"/>
<circle cx="50" cy="59" r="3.5" fill="#34d399"/>
<circle cx="62" cy="59" r="3.5" fill="#f87171"/>
<path class="mc-t mc-t1" d="M12 62 Q2 72 6 86 Q8 94 4 100" stroke="#3b82f6" stroke-width="7.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t2" d="M88 62 Q98 72 94 86 Q92 94 96 100" stroke="#3b82f6" stroke-width="7.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t3" d="M34 79 Q30 93 32 108 Q33 114 30 118" stroke="#3b82f6" stroke-width="7.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t4" d="M66 79 Q70 93 68 108 Q67 114 70 118" stroke="#3b82f6" stroke-width="7.5" stroke-linecap="round" fill="none"/>`
  },

  renard: {
    label: 'Renard 🦊', name: 'Roux', viewBox: '0 0 100 108', shadowColor: 'rgba(234,88,12,.22)',
    svg: `<polygon points="22,52 4,8 40,38" fill="#ea580c"/>
<polygon points="78,52 96,8 60,38" fill="#ea580c"/>
<polygon points="24,50 11,16 37,37" fill="#fed7aa"/>
<polygon points="76,50 89,16 63,37" fill="#fed7aa"/>
<ellipse cx="50" cy="62" rx="35" ry="36" fill="#ea580c"/>
<ellipse cx="50" cy="70" rx="20" ry="18" fill="#fef3c7"/>
<ellipse cx="37" cy="40" rx="12" ry="7" fill="#fb923c" opacity=".4" transform="rotate(-18 37 40)"/>
<circle cx="36" cy="56" r="9.5" fill="white"/>
<circle cx="64" cy="56" r="9.5" fill="white"/>
<circle cx="37" cy="57" r="6" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="65" cy="57" r="6" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="39" cy="55" r="2.2" fill="white"/>
<circle cx="67" cy="55" r="2.2" fill="white"/>
<ellipse cx="50" cy="71" rx="5.5" ry="4" fill="#1c1917"/>
<path d="M44 79 Q50 86 56 79" stroke="#1c1917" stroke-width="2.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t1" d="M28 94 Q18 101 22 108" stroke="#ea580c" stroke-width="7.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t2" d="M72 94 Q82 101 78 108" stroke="#ea580c" stroke-width="7.5" stroke-linecap="round" fill="none"/>`
  },

  singe: {
    label: 'Singe 🐒', name: 'Coco', viewBox: '0 0 100 108', shadowColor: 'rgba(120,53,15,.22)',
    svg: `<circle cx="16" cy="50" r="17" fill="#78350f"/>
<circle cx="84" cy="50" r="17" fill="#78350f"/>
<circle cx="16" cy="50" r="10" fill="#d97706"/>
<circle cx="84" cy="50" r="10" fill="#d97706"/>
<ellipse cx="50" cy="56" rx="34" ry="38" fill="#78350f"/>
<ellipse cx="37" cy="32" rx="12" ry="7" fill="#92400e" opacity=".5" transform="rotate(-18 37 32)"/>
<ellipse cx="50" cy="70" rx="18" ry="14" fill="#fde68a"/>
<circle cx="37" cy="52" r="9.5" fill="white"/>
<circle cx="63" cy="52" r="9.5" fill="white"/>
<circle cx="38" cy="53" r="6" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="64" cy="53" r="6" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="40" cy="51" r="2.2" fill="white"/>
<circle cx="66" cy="51" r="2.2" fill="white"/>
<ellipse cx="46" cy="69" rx="3" ry="2.5" fill="#92400e"/>
<ellipse cx="54" cy="69" rx="3" ry="2.5" fill="#92400e"/>
<path d="M42 77 Q50 85 58 77" stroke="#92400e" stroke-width="2.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t1" d="M22 88 Q12 97 16 107" stroke="#78350f" stroke-width="9" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t2" d="M78 88 Q88 97 84 107" stroke="#78350f" stroke-width="9" stroke-linecap="round" fill="none"/>`
  },

  ourson: {
    label: 'Ourson 🐻', name: 'Nounours', viewBox: '0 0 100 108', shadowColor: 'rgba(120,53,15,.22)',
    svg: `<circle cx="23" cy="28" r="20" fill="#92400e"/>
<circle cx="77" cy="28" r="20" fill="#92400e"/>
<circle cx="23" cy="28" r="13" fill="#b45309"/>
<circle cx="77" cy="28" r="13" fill="#b45309"/>
<ellipse cx="50" cy="63" rx="35" ry="36" fill="#92400e"/>
<ellipse cx="50" cy="72" rx="20" ry="17" fill="#d97706"/>
<ellipse cx="37" cy="40" rx="12" ry="7" fill="#b45309" opacity=".5" transform="rotate(-18 37 40)"/>
<circle cx="36" cy="57" r="10" fill="white"/>
<circle cx="64" cy="57" r="10" fill="white"/>
<circle cx="37" cy="58" r="6.5" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="65" cy="58" r="6.5" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="39" cy="56" r="2.5" fill="white"/>
<circle cx="67" cy="56" r="2.5" fill="white"/>
<ellipse cx="50" cy="71" rx="7" ry="5" fill="#1c1917"/>
<path d="M43 80 Q50 88 57 80" stroke="#1c1917" stroke-width="2.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t1" d="M20 88 Q10 97 14 107" stroke="#92400e" stroke-width="9" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t2" d="M80 88 Q90 97 86 107" stroke="#92400e" stroke-width="9" stroke-linecap="round" fill="none"/>`
  },

  cori: {
    label: 'Cori ❤️', name: 'Cori', viewBox: '0 0 100 118', shadowColor: 'rgba(220,38,38,.25)',
    svg: `<!-- Swoosh arc — inspiré du logo CPAS Quaregnon -->
<path d="M 18 36 Q 50 3 82 36" stroke="#991b1b" stroke-width="4.5" stroke-linecap="round" fill="none"/>
<!-- Corps en cœur -->
<path d="M 50 28 C 45 13 11 14 11 40 C 11 62 34 73 50 91 C 66 73 89 62 89 40 C 89 14 55 13 50 28 Z" fill="#ef4444"/>
<!-- Reflet lumineux -->
<ellipse cx="34" cy="37" rx="11" ry="7" fill="#fca5a5" opacity=".45" transform="rotate(-22 34 37)"/>
<!-- Yeux -->
<circle cx="37" cy="52" r="9.5" fill="white"/>
<circle cx="63" cy="52" r="9.5" fill="white"/>
<circle cx="38" cy="53" r="6" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="64" cy="53" r="6" fill="#1e1b4b" class="mc-pupil"/>
<circle cx="40" cy="51" r="2.2" fill="white"/>
<circle cx="66" cy="51" r="2.2" fill="white"/>
<!-- Sourire -->
<path d="M 43 65 Q 50 73 57 65" stroke="#b91c1c" stroke-width="2.5" stroke-linecap="round" fill="none"/>
<!-- Joues rosées -->
<ellipse cx="26" cy="62" rx="7.5" ry="4.5" fill="#fca5a5" opacity=".6"/>
<ellipse cx="74" cy="62" rx="7.5" ry="4.5" fill="#fca5a5" opacity=".6"/>
<!-- Bras -->
<path class="mc-t mc-t3" d="M 13 51 Q 3 61 5 75" stroke="#ef4444" stroke-width="7.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t4" d="M 87 51 Q 97 61 95 75" stroke="#ef4444" stroke-width="7.5" stroke-linecap="round" fill="none"/>
<!-- Jambes -->
<path class="mc-t mc-t1" d="M 41 89 Q 35 101 37 113 Q 38 116 34 118" stroke="#ef4444" stroke-width="7.5" stroke-linecap="round" fill="none"/>
<path class="mc-t mc-t2" d="M 59 89 Q 65 101 63 113 Q 62 116 66 118" stroke="#ef4444" stroke-width="7.5" stroke-linecap="round" fill="none"/>`
  },
};

// ── Appliquer la mascotte dans le DOM ──────────────────────────────
// Met à jour tous les SVG de mascotte présents dans la page
function _applyMascot(id) {
  if (id) sessionStorage.setItem('mc_last_mascot', id);
  const m = MASCOTS[id] || MASCOTS.poulpe;
  // Page d'accueil (app.html)
  const hsSvg = document.getElementById('hsMascotSvg');
  if (hsSvg) {
    hsSvg.setAttribute('viewBox', m.viewBox);
    hsSvg.innerHTML = m.svg;
    const wrap = hsSvg.closest('.hs-mascot-wrap');
    if (wrap) wrap.style.filter = `drop-shadow(0 6px 14px ${m.shadowColor})`;
    // Réinitialise les données pour le suivi des yeux
    hsSvg.querySelectorAll('.mc-pupil').forEach(p => {
      delete p.dataset.origCx; delete p.dataset.origCy;
    });
  }
  // Page de connexion (index.html)
  const loginSvg = document.getElementById('loginMascotSvg');
  if (loginSvg) {
    loginSvg.setAttribute('viewBox', m.viewBox);
    loginSvg.innerHTML = m.svg;
    const wrap = loginSvg.closest('.mascot-wrap');
    if (wrap) wrap.style.filter = `drop-shadow(0 6px 18px ${m.shadowColor})`;
  }
  // Écran de chargement (app.html)
  const loadSvg = document.getElementById('loadMascotSvg');
  if (loadSvg) {
    loadSvg.setAttribute('viewBox', m.viewBox);
    loadSvg.innerHTML = m.svg;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   MASCOT_ACCESSORIES — Éléments HTML/SVG injectés par MascotBrain
═══════════════════════════════════════════════════════════════════ */
const MASCOT_ACCESSORIES = {

  coffee: `<svg viewBox="0 0 60 52" class="ms-acc-svg">
    <rect x="6" y="16" width="34" height="28" rx="5" fill="#92400e"/>
    <rect x="8" y="18" width="30" height="24" rx="4" fill="#c2410c"/>
    <rect x="8" y="18" width="30" height="9" rx="4" fill="#fde68a" opacity=".85"/>
    <path d="M40 24 Q52 24 52 32 Q52 40 40 40" stroke="#92400e" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path class="ms-steam ms-s1" d="M16 14 Q18 8 16 2"  stroke="#94a3b8" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path class="ms-steam ms-s2" d="M23 12 Q25 6 23 0"  stroke="#94a3b8" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path class="ms-steam ms-s3" d="M30 14 Q32 8 30 2"  stroke="#94a3b8" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`,

  zzz: `<div class="ms-zzz-wrap">
    <span class="ms-z ms-z1">z</span>
    <span class="ms-z ms-z2">z</span>
    <span class="ms-z ms-z3">Z</span>
  </div>`,

  sweat: `<svg viewBox="0 0 36 56" class="ms-sweat-svg">
    <ellipse class="ms-sweat ms-sw1" cx="9"  cy="10" rx="4"   ry="6.5" fill="#60a5fa" opacity=".85"/>
    <ellipse class="ms-sweat ms-sw2" cx="22" cy="20" rx="3.5" ry="5.5" fill="#93c5fd" opacity=".7"/>
    <ellipse class="ms-sweat ms-sw3" cx="13" cy="34" rx="3"   ry="5"   fill="#60a5fa" opacity=".75"/>
  </svg>`,

  hearts: `<div class="ms-hearts-wrap">
    <span class="ms-heart ms-h1">💜</span>
    <span class="ms-heart ms-h2">💙</span>
    <span class="ms-heart ms-h3">💜</span>
  </div>`,

  stars: `<div class="ms-stars-wrap">
    <span class="ms-star ms-st1">⭐</span>
    <span class="ms-star ms-st2">✨</span>
    <span class="ms-star ms-st3">⭐</span>
  </div>`,

  moon: `<svg viewBox="0 0 50 54" class="ms-moon-svg">
    <path d="M32 6 Q14 12 12 28 Q10 46 28 50 Q12 46 10 30 Q8 12 26 6Z" fill="#fde68a"/>
    <circle cx="40" cy="10" r="2.2" fill="#fde68a" opacity=".7"/>
    <circle cx="46" cy="22" r="1.6" fill="#fde68a" opacity=".5"/>
    <circle cx="42" cy="36" r="1.2" fill="#fde68a" opacity=".4"/>
  </svg>`,

  snow: `<div class="ms-snow-wrap">
    <span class="ms-flake ms-f1">❄️</span>
    <span class="ms-flake ms-f2">❄️</span>
    <span class="ms-flake ms-f3">❄️</span>
  </div>`,

  thought: `<div class="ms-thought-wrap">
    <div class="ms-thought-bubble">
      <span class="ms-thought-dots"><span></span><span></span><span></span></span>
    </div>
  </div>`,

  sparkles: `<div class="ms-stars-wrap">
    <span class="ms-star ms-st1">✨</span>
    <span class="ms-star ms-st2">⭐</span>
    <span class="ms-star ms-st3">✨</span>
  </div>`,
};
