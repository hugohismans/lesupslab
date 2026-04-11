// ═══════════════════════════════════════════════════════════════════
// gender.js — Utilitaires pour l'accord en genre des textes
// ═══════════════════════════════════════════════════════════════════
// Genre stocké dans sessionStorage: 'm' | 'f' | 'n' (neutre)
// ───────────────────────────────────────────────────────────────────

(function () {
  // ── Lecture / écriture ───────────────────────────────────────────
  window.getGender = function () {
    return sessionStorage.getItem('mc_agent_gender') || 'm';
  };
  window.setGender = function (g) {
    sessionStorage.setItem('mc_agent_gender', g);
  };

  // ── G(masculin, féminin, neutre?) — formes explicites ───────────
  // Utiliser quand la dérivation automatique ne fonctionne pas
  // ex: G('Directeur', 'Directrice') | G('Le', 'La')
  window.G = function (m, f, n) {
    const g = window.getGender();
    if (g === 'f') return f !== undefined ? f : m;
    if (g === 'n') return n !== undefined ? n : m;
    return m;
  };

  // ── genf(text) — traite la notation inclusive ·suffix ────────────
  // Exemples :
  //   connecté·e  → m: connecté   | f: connectée
  //   Chef·fe     → m: Chef       | f: Cheffe
  //   technicien·ne → m: technicien | f: technicienne
  //   Directeur·ice → m: Directeur | f: Directrice
  //   Le·la       → m: Le         | f: La
  //   premier·ère → m: premier    | f: première
  //   un·e        → m: un         | f: une
  window.genf = function (text) {
    if (!text) return text;
    const g = window.getGender();

    if (g === 'm') {
      return text
        // eur·ice → eur  (Directeur·ice → Directeur)
        .replace(/eur·ice/gi, 'eur')
        // Le·la / le·la → Le / le
        .replace(/\bLe·la\b/g, 'Le')
        .replace(/\ble·la\b/g, 'le')
        // Cas général : supprimer ·suffixe
        .replace(/·[a-zA-ZÀ-ÿœæ]+/g, '');
    }

    if (g === 'f') {
      return text
        // eur·ice → rice  (Directeur·ice → Directrice)
        .replace(/eur·ice/gi, 'rice')
        // Le·la / le·la → La / la
        .replace(/\bLe·la\b/g, 'La')
        .replace(/\ble·la\b/g, 'la')
        // Cas général : remplacer ·suffixe par suffixe
        .replace(/·([a-zA-ZÀ-ÿœæ]+)/g, '$1');
    }

    // Neutre : garder la forme inclusive telle quelle
    return text;
  };
})();
