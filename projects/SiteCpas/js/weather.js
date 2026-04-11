// ═══════════════════════════════════════════════════════════════════
// weather.js — Météo contextuelle via Open-Meteo (gratuit, sans clé)
// Données stockées dans Firebase — un seul fetch/heure pour toute l'org
// ═══════════════════════════════════════════════════════════════════

const WEATHER = (() => {
  let _cache     = null;
  let _fetchedAt = 0;
  const CACHE_MS  = 60 * 60 * 1000; // 1 heure
  const _cbs      = [];

  // ── Lecture Firebase (appelé par DB.initWeather) ─────────────────
  function _loadFromFirebase(data) {
    if (!data) return;
    _cache     = data;
    _fetchedAt = data.fetchedAt || 0;
    _cbs.forEach(fn => fn(_cache));
    console.log('[WEATHER] chargé depuis Firebase :', _cache);
  }

  function onChange(fn) { _cbs.push(fn); }

  // Codes WMO → type + emoji + libellé
  const WMO_MAP = [
    [0,  0,  'sunny',        '☀️',  'grand soleil'],
    [1,  1,  'mostlyClear',  '🌤️', 'peu nuageux'],
    [2,  2,  'partlyCloudy', '⛅',  'partiellement nuageux'],
    [3,  3,  'cloudy',       '☁️',  'couvert'],
    [45, 48, 'foggy',        '🌫️', 'brouillard'],
    [51, 55, 'drizzle',      '🌦️', 'bruine'],
    [61, 65, 'rainy',        '🌧️', 'pluie'],
    [71, 75, 'snowy',        '❄️',  'neige'],
    [77, 77, 'snowy',        '❄️',  'grésil'],
    [80, 82, 'showery',      '🌦️', 'averses'],
    [85, 86, 'snowshower',   '🌨️', 'averses de neige'],
    [95, 95, 'stormy',       '⛈️',  'orage'],
    [96, 99, 'stormy',       '⛈️',  'orage avec grêle'],
  ];

  function _getWmo(code) {
    for (const [min, max, type, emoji, label] of WMO_MAP) {
      if (code >= min && code <= max) return { type, emoji, label };
    }
    return { type: 'unknown', emoji: '🌡️', label: '' };
  }

  // ── Fetch API → écrit dans Firebase si données fraîches (<1h) ────
  async function fetchWeather(lat, lon) {
    if (!lat || !lon) return null;
    const now = Date.now();
    // Si le cache Firebase est encore valide, ne pas refetcher
    if (_cache && now - _fetchedAt < CACHE_MS) return _cache;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code,wind_speed_10m,precipitation&timezone=auto&forecast_days=1`;
      console.log('[WEATHER] → fetch API', url);
      const res  = await window.fetch(url);
      console.log('[WEATHER] ← réponse HTTP', res.status, res.statusText);
      if (!res.ok) { console.warn('[WEATHER] API error', res.status, res.statusText); return _cache; }
      const data = await res.json();
      console.log('[WEATHER] ← données brutes', data.current);
      const cur  = data.current;
      // Support ancien + nouveau nom de champ
      const code = cur.weather_code ?? cur.weathercode ?? 0;
      const wind = cur.wind_speed_10m ?? cur.windspeed_10m ?? 0;
      const wmo  = _getWmo(code);
      const fresh = {
        temp:      Math.round(cur.temperature_2m),
        code,
        wind:      Math.round(wind),
        precip:    Math.round((cur.precipitation || 0) * 10) / 10,
        type:      wmo.type,
        emoji:     wmo.emoji,
        label:     wmo.label,
        fetchedAt: now,
        lat, lon,
      };
      // Écrire dans Firebase pour partager avec tous les clients
      if (typeof DB !== 'undefined') {
        DB.setWeatherCache(fresh).catch(() => {});
      }
      _cache     = fresh;
      _fetchedAt = now;
      _cbs.forEach(fn => fn(_cache));
      console.log('[WEATHER] fetchAPI →', _cache);
      return _cache;
    } catch (e) {
      console.warn('[WEATHER] indisponible :', e.message);
      return _cache; // retourner les données Firebase si dispo
    }
  }

  function get() { return _cache; }

  // ── Phrases météo (pool selon contexte) ──────────────────────────
  function getPhrases(prenom) {
    const w = _cache;
    if (!w) return [];
    const n  = prenom ? ` ${prenom}` : '';
    const np = prenom ? `${prenom}, ` : '';
    const t  = w.temp;
    const pool = [];

    // ── Beau soleil ──────────────────────────────────────────────
    if (w.type === 'sunny' || w.type === 'mostlyClear') {
      pool.push({ id: 'wx_sun1', text: `${w.emoji} Il fait beau dehors${n} ! Profites-en à la pause ☀️` });
      pool.push({ id: 'wx_sun2', text: `Grand soleil aujourd'hui${n} — les gens arrivent de meilleure humeur par ce temps 😊` });
      pool.push({ id: 'wx_sun3', text: `${w.emoji} ${t}°C et du soleil${n} — belle journée pour être utile aux autres 🌟` });
      pool.push({ id: 'wx_sun4', text: `${np}le soleil brille — c'est bon signe pour la journée ☀️` });
      pool.push({ id: 'wx_sun5', text: `Belle luminosité dehors${n} — même au bureau, ça met de bonne humeur 😊` });
    }

    // ── Partiellement nuageux ────────────────────────────────────
    if (w.type === 'partlyCloudy') {
      pool.push({ id: 'wx_pc1', text: `${w.emoji} ${w.label} aujourd'hui${n} — ni trop ni trop peu, parfait 😊` });
      pool.push({ id: 'wx_pc2', text: `Quelques nuages${n} mais rien d'alarmant. Belle journée quand même ! ⛅` });
      pool.push({ id: 'wx_pc3', text: `Temps mitigé dehors${n} — heureusement qu'on est bien ici 😄` });
    }

    // ── Couvert ──────────────────────────────────────────────────
    if (w.type === 'cloudy') {
      pool.push({ id: 'wx_cl1', text: `${w.emoji} Ciel couvert aujourd'hui${n} — ambiance cosy au bureau ☕` });
      pool.push({ id: 'wx_cl2', text: `Gris dehors mais chaleureux ici${n} — c'est l'essentiel 😊` });
      pool.push({ id: 'wx_cl3', text: `${np}nuages à l'horizon mais le moral reste au beau fixe ici 💪` });
      pool.push({ id: 'wx_cl4', text: `Ciel gris${n} — un bon café et c'est réglé ☕` });
    }

    // ── Brouillard ───────────────────────────────────────────────
    if (w.type === 'foggy') {
      pool.push({ id: 'wx_fog1', text: `🌫️ Brouillard ce matin${n} — prudence sur la route !` });
      pool.push({ id: 'wx_fog2', text: `${np}visibilité réduite dehors — les bénéficiaires peuvent avoir du retard ce matin ` });
      pool.push({ id: 'wx_fog3', text: `Brouillard matinal${n} — il se lèvera dans la journée, promis 🌤️` });
    }

    // ── Bruine ───────────────────────────────────────────────────
    if (w.type === 'drizzle') {
      pool.push({ id: 'wx_dr1', text: `🌦️ Petite bruine dehors${n} — rien de grave mais prévois un parapluie à la pause` });
      pool.push({ id: 'wx_dr2', text: `${np}bruine légère aujourd'hui — au moins on n'a pas chaud 😄` });
      pool.push({ id: 'wx_dr3', text: `Bruine ce matin${n} — les bénéficiaires arrivent peut-être un peu humides 💙` });
    }

    // ── Pluie ────────────────────────────────────────────────────
    if (w.type === 'rainy' || w.type === 'showery') {
      pool.push({ id: 'wx_rain1', text: `🌧️ Il pleut dehors${n} — attention aux parapluies dans l'entrée !` });
      pool.push({ id: 'wx_rain2', text: `Mauvais temps aujourd'hui${n} — les bénéficiaires apprécieront d'autant plus ton accueil chaleureux 💙` });
      pool.push({ id: 'wx_rain3', text: `${w.emoji} ${t}°C et de la pluie — une bonne raison d'apprécier d'être bien au chaud ici${n} 😊` });
      pool.push({ id: 'wx_rain4', text: `${np}pluie en vue — n'oublie pas le parapluie pour ce midi !` });
      pool.push({ id: 'wx_rain5', text: `Journée pluvieuse${n} — le genre de temps où un sourire à l'accueil compte double 😊` });
      pool.push({ id: 'wx_rain6', text: `🌧️ La pluie ne nous arrête pas${n} — go ! 💪` });
    }

    // ── Neige ────────────────────────────────────────────────────
    if (w.type === 'snowy' || w.type === 'snowshower') {
      pool.push({ id: 'wx_snow1', text: `❄️ Il neige dehors${n} ! Prévois des retards possibles ce matin` });
      pool.push({ id: 'wx_snow2', text: `Neige en vue${n} — sois prudent·e sur le chemin et prévois plus de temps ❄️` });
      pool.push({ id: 'wx_snow3', text: `❄️ ${t}°C et de la neige${n} — au chaud ici, c'est parfait pour accueillir les gens 😊` });
      pool.push({ id: 'wx_snow4', text: `${np}journée enneigée ! Les bénéficiaires auront peut-être du retard — sois patient·e ❄️` });
    }

    // ── Orage ────────────────────────────────────────────────────
    if (w.type === 'stormy') {
      pool.push({ id: 'wx_storm1', text: `⛈️ Orage en cours${n} — les bénéficiaires peuvent arriver trempés, garde des serviettes ? 😄` });
      pool.push({ id: 'wx_storm2', text: `${np}orage dehors ! Heureusement qu'on est bien à l'intérieur ⛈️` });
      pool.push({ id: 'wx_storm3', text: `⛈️ Temps orageux${n} — les arrivées peuvent être perturbées ce matin` });
    }

    // ── Température extrême (hors saison) ────────────────────────
    if (t >= 28) {
      pool.push({ id: 'wx_hot1', text: `🥵 ${t}°C aujourd'hui${n} — hydrate-toi bien ! 💧` });
      pool.push({ id: 'wx_hot2', text: `Canicule${n} — ${t}°C dehors ! Un verre d'eau toutes les heures, s'il te plaît 💧` });
      pool.push({ id: 'wx_hot3', text: `${np}${t}°C ce matin — les bénéficiaires ont peut-être eu chaud pour venir. Accueil avec de l'eau ? 😊` });
      if (t >= 32) pool.push({ id: 'wx_hot4', text: `🌡️ ${t}°C ! C'est la canicule${n} — prends soin de toi et des autres 💙` });
    }
    if (t <= 2) {
      pool.push({ id: 'wx_cold1', text: `🥶 ${t}°C dehors${n} — bien content·e d'être au chaud ici !` });
      pool.push({ id: 'wx_cold2', text: `Brr, ${t}°C${n} ! Le café est encore plus nécessaire ce matin ☕` });
      pool.push({ id: 'wx_cold3', text: `${np}températures glaciales dehors — heureusement que les bureaux sont chauffés 🧣` });
    }

    // ── Vent fort ────────────────────────────────────────────────
    if (w.wind >= 40) {
      pool.push({ id: 'wx_wind1', text: `💨 Vent fort aujourd'hui${n} (${w.wind} km/h) — les coiffures risquent d'en prendre un coup 😄` });
      pool.push({ id: 'wx_wind2', text: `${np}grosse bourrasque dehors ! Accroche-toi bien en sortant 💨` });
    }

    return pool;
  }

  async function forceRefresh(lat, lon) {
    _fetchedAt = 0; // invalider le cache pour forcer l'appel API
    return fetchWeather(lat, lon);
  }

  return { fetch: fetchWeather, forceRefresh, get, getPhrases, onChange, _loadFromFirebase };
})();
