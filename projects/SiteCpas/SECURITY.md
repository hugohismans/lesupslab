# SECURITY — SiteCpas / moncompagnon.be

> Dernière mise à jour : 2026-04-22 (Phase 5)
> Contact responsable : hugo.hismans@gmail.com
> Repo : https://github.com/hugohismans/lesupslab (privé)

Ce document décrit l'architecture de sécurité de SiteCpas (outil interne de gestion des locaux et files d'attente de CPAS), les mesures de protection en place, et la procédure de signalement d'une vulnérabilité.

---

## 1. Périmètre

SiteCpas est une application web **interne** utilisée par les agents de CPAS (Centres Publics d'Action Sociale) pour gérer :
- la réservation des locaux (bureaux de permanence, salles),
- les files d'attente de bénéficiaires (émission de tickets),
- les statuts de présence des agents,
- des commentaires libres accompagnant les réservations.

L'outil **ne stocke pas de données bénéficiaires identifiantes structurées** (pas de nom complet, adresse, numéro national, dossier social). Seuls des commentaires libres peuvent contenir du contexte — ces champs sont chiffrés au repos (voir §4.3).

### Acteurs
| Rôle | Origine | Périmètre |
|---|---|---|
| **Agent** | Personnel CPAS | Gère ses propres réservations + vue de l'équipe |
| **Admin org** | Agent avec rôle `__admin__` | Modifie config (lieux, horaires, rôles, agents) |
| **Superadmin** | Hugo Hismans uniquement | Créé/supprime les orgs, gère infra |
| **Bénéficiaire** | Public CPAS | Émet un ticket via la borne publique kiosk (non auth) |
| **Écran public** | Affichage salle d'attente | Lecture seule des files d'attente |

---

## 2. Modèle de menaces

### 2.1 Menaces adressées
- **Accès direct à Firebase sans session (dump base)** — Rules + service account sur les paths sensibles.
- **Vol de session agent** — `validateSession` côté client, déconnexion auto 60s après reset mdp / suppression.
- **Brute force du mot de passe** — hash côté serveur, le hash stocké n'est plus lisible publiquement (Phase 3bis).
- **Élévation de privilège** (agent → admin) — rôles strictement contrôlés côté Worker (authz `agentRoles` refuse `__admin__` en self-set).
- **Attaquant avec accès base (exfiltration)** — chiffrement AES-GCM 256 des 4 champs bénéficiaires sensibles, clé détenue uniquement par le Worker.
- **Flood de tickets kiosk** — rate limit 30/min/IP côté Worker.
- **XSS / injection via CSP** — Content-Security-Policy strict (voir §4.1).
- **Actions non tracées** — audit log signé côté serveur (Worker) sur toutes les écritures CRUD.

### 2.2 Menaces NON adressées (out of scope)
- **Attaquant physique sur poste agent** (keylogger, écran non verrouillé). À traiter par la DSI client.
- **Compromission du compte Cloudflare ou du service account Firebase.** Effondrement catastrophique — requiert MFA côté Cloudflare et rotation régulière du service account.
- **Attaques par déni de service à grande échelle** (DDoS sur Firebase ou Cloudflare). Reposent sur la protection anti-DDoS de Cloudflare.
- **Vulnérabilité dans Firebase, Cloudflare Workers, ou jose (npm).** Responsabilité upstream ; suivi des CVE manuel.
- **Social engineering** (un agent qui donne son mdp à un collègue). Éducation utilisateur.

### 2.3 Données classées par sensibilité
| Donnée | Emplacement | Sensibilité | Mitigation |
|---|---|---|---|
| Noms des agents | Firebase `orgs/*/appConfig/agents` | Faible (public interne) | Auth requise pour lire |
| Mots de passe agents | Firebase `orgs/*/appConfig/agentPasswords` | **Critique** | SHA-256 + Rules `.write: false`, lecture via service account uniquement |
| Hash mdp superadmin | Firebase `superadmin/passwordHash` | **Critique** | SHA-256 + Rules `.read: false, .write: false` |
| Rôles agents | Firebase `orgs/*/appConfig/agentRoles` | Moyenne | Rules durcies, anti auto-promotion |
| Commentaires de réservation | Firebase `orgs/*/reservations/*/comment` | **Élevée** (contexte bénéficiaire potentiel) | **Chiffrement AES-GCM 256 au repos** |
| Messages de RDV | `orgs/*/appState/appointmentRequests/*/message` | Élevée | Chiffrement AES-GCM 256 |
| Descriptions requests/planning | `orgs/*/requests/*/description`, `planning/*/description` | Élevée | Chiffrement AES-GCM 256 |
| Audit log | `orgs/*/audit` + `superadmin/audit` | Moyenne (forensique) | Append-only côté client, signé côté Worker |
| Tickets kiosk | `orgs/*/queues/{date}/*` | Faible (éphémère, purge quotidienne) | Auth requise, rate limit |

---

## 3. Architecture

### 3.1 Vue d'ensemble
```
[Navigateur agent / kiosk]
        │ HTTPS
        ▼
[Vercel static hosting]   (cpasquaregnon.vercel.app)
  - index.html / app.html / etc.
  - CSP strict, HSTS, X-Frame-Options
        │
        │ lecture temps réel direct Firebase (Rules auth != null)
        │
        ▼
[Firebase Realtime Database]   (cpasquaregnon-70f59)
  - orgs/{orgId}/... (données métier)
  - superadmin/... (config globale)
  - Rules : auth != null pour lecture, .write: false sur paths sensibles
        ▲
        │ Service account bypass (écritures sensibles)
        │
[Cloudflare Worker]   (sitecpas-worker.hugo-hismans.workers.dev)
  - POST /auth/login, /auth/set-password
  - POST /superadmin/login
  - POST /data/write, /data/decrypt
  - POST /kiosk/issue-ticket (non auth + rate limit)
  - Secrets : FIREBASE_SERVICE_ACCOUNT, ENCRYPTION_KEY
        ▲
        │ HTTPS
[Navigateur agent]
```

### 3.2 Flow d'authentification agent
1. Agent sélectionne son nom sur `/index.html`, saisit son mdp
2. Client → `POST /auth/login` avec `{orgId, agentKey, password}`
3. Worker :
   - Lit `agentPasswords/{agentKey}` via Firebase REST + service account
   - Compare SHA-256 en constant-time
   - Si OK : génère un customToken RS256 avec claims `{orgId, role}`
4. Client → `firebase.auth().signInWithCustomToken(customToken)`
5. Toutes les requêtes ultérieures au Worker utilisent `Authorization: Bearer <idToken>` (Firebase ID token standard)
6. Worker vérifie chaque ID token via Google JWK set (`securetoken@system.gserviceaccount.com`)

### 3.3 Flow d'authentification superadmin
Identique mais via `/superadmin/login`, claim `superadmin: true` qui bypass l'authz normal pour toutes les routes `/data/*`.

### 3.4 Flow kiosk (borne publique)
Pas d'authentification utilisateur. Le Worker :
- Valide `{orgId, groupId, name?}` (format regex strict)
- Vérifie que `appConfig/features/enableKiosk === true`
- Rate-limit 30 req/min par IP (via `CF-Connecting-IP`)
- Incrémente `queues/{today}/tick_{groupId}` via service account

---

## 4. Mesures de protection

### 4.1 Transport & headers
- **HTTPS obligatoire** (Vercel + Cloudflare, HSTS 1 an + includeSubDomains)
- **CSP strict** :
  ```
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://www.gstatic.com https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://*.firebaseio.com https://*.firebasedatabase.app
              https://*.googleapis.com https://api.open-meteo.com https://www.gstatic.com
              wss://*.firebasedatabase.app https://*.workers.dev;
  img-src 'self' data: blob: https:;
  frame-ancestors 'none';
  object-src 'none';
  ```
  `'unsafe-inline'` sur script-src reste nécessaire pour certains handlers inline (à éliminer en Phase 6).
- **X-Frame-Options: DENY** (anti clickjacking)
- **Referrer-Policy: strict-origin-when-cross-origin**
- **Permissions-Policy** restrictive (geolocation=(self), rest désactivé)

### 4.2 Authentification & session
- **Pas de mot de passe unique pour l'org** — chaque agent a son propre hash SHA-256.
- **Session Firebase nominative** (uid = agentKey) après signInWithCustomToken.
- **validateSession** côté client : re-vérifie toutes les 60s + au retour de focus que :
  - L'agent existe toujours
  - Son mdp n'a pas été réinitialisé
  - Le tempAdminGrant n'a pas expiré
  Si invalide → clear sessionStorage + redirect login avec raison.
- **tempAdminGrant** avec `grantEnd` = prochaine fin de journée (endOfDayHour par org). Auto-révocation Firebase + fallback immédiat sur rôle normal dans `getAgentPermRole` même avant propagation.
- **Pas de fallback hash local** depuis Phase 3 : si le Worker est down, login impossible (fail secure).

### 4.3 Chiffrement au repos (AES-GCM 256)
- Clé `ENCRYPTION_KEY` stockée en **secret Cloudflare** (`wrangler secret put`). Ne quitte jamais le Worker.
- Format : `enc:v1:<nonceBase64>:<ciphertextBase64>` (versionné pour rotation future).
- Nonce aléatoire 12 bytes par chiffrement (Web Crypto `getRandomValues`).
- 4 champs chiffrés :
  - `reservations/*/comment`
  - `appState/appointmentRequests/*/message`
  - `requests/*/description`
  - `planning/*/description`
- Le déchiffrement est **exclusivement côté serveur** (endpoint `/data/decrypt` batch). Le client n'a JAMAIS la clé.
- Les données antérieures à Phase 3 (avril 2026) restent en clair — pas de migration rétroactive.

### 4.4 Autorisation (Worker `authz.js`)
Deux couches de règles :
- **SCOPED_RULES** — matchs exacts avec params (`/:agentKey`). Gère les cas self-scope :
  - Mdp agent : self ou admin
  - Rôles agent : admin, OU self **sauf si value === `__admin__`** (anti auto-promotion)
  - Couleur / emoji / genre / nom public agent : self ou admin
- **ZONE_RULES** — prefix-based, catch-all :
  - `reservations`, `appState/*`, `queues`, `agentStatus`, `notifications`, `requests`, `planning`, `absences` → tout agent authentifié
  - `appConfig/*` → admin uniquement
  - `audit` → push seulement
- **Superadmin bypass** — claim `superadmin: true` → autorise toute op.

### 4.5 Firebase Rules
Defense in depth (le service account du Worker bypass toujours, mais en cas de compromission d'un client) :
- `/orgs/.read: auth != null`, `/.write: false` sur les paths sensibles :
  - `reservations`, `requests`, `planning`, `appState/appointmentRequests`
  - `appConfig/agent{Passwords,Roles,Colors,Emojis,Genders,PublicNames,PermRoles}`
- `/orgs/*/audit/$entry/.write: "!data.exists()"` — append-only strict.
- `/superadmin/.read: auth != null`, `.write: false`.
- `/superadmin/passwordHash/.read: false` (anti-bruteforce offline).
- `/superadmin/passwordHash/.write: "auth != null && !data.exists()"` — bootstrap du 1er mdp uniquement.

### 4.6 Audit log
- **Client-side** (`js/audit.js`) — push direct Firebase append-only pour login/logout agent et actions contextuelles.
- **Server-side** (Worker `/data/write`) — log AUTOMATIQUE de toute écriture avec `ts, action, actor, details, origin: 'worker'`. Non falsifiable côté client.
- Actions loggées : CRUD réservations/RDV, login/logout agent, login/login.failed superadmin, reset mdp, purges, grants, feature toggles, création org.
- Vue admin « Journal » avec filtre texte (200 dernières entrées).

### 4.7 Rate limiting
- Kiosk : 30 req/min/IP (via `CF-Connecting-IP`) côté Worker.
- Autres endpoints : pas de rate-limit dédié ; s'appuie sur les quotas Cloudflare Workers (100k req/jour gratuit, scaling auto).

### 4.8 Secrets management
| Secret | Lieu | Rotation |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` (JSON clé privée) | `wrangler secret put` | Manuelle via Firebase Console → Paramètres → Comptes de service |
| `ENCRYPTION_KEY` (AES-256 base64) | `wrangler secret put` | Versionnement `enc:v1:...` prévu pour rotation (pas encore utilisé) |
| Firebase Web API Key | `js/config.js` (public) | Pas un secret — identifie le projet, pas un credential |
| Mdp superadmin | Firebase `superadmin/passwordHash` | Via Firebase Console (pas d'endpoint Worker dédié) |
| Mdp agents | Firebase `orgs/*/appConfig/agentPasswords/*` | Via `/auth/set-password` (après reset admin) |

---

## 5. OWASP Top 10 — couverture

| # | Risque | Statut | Mitigation |
|---|---|---|---|
| A01 | Broken Access Control | ✅ | authz Worker + Rules Firebase + validateSession |
| A02 | Cryptographic Failures | ✅ | TLS partout + AES-GCM field-level + SHA-256 mdp + JWT RS256 |
| A03 | Injection | ✅ | Pas de SQL (Firebase NoSQL). Paths regex-validés. JSON parsing standard. |
| A04 | Insecure Design | ⚠️ | Threat model documenté (§2). Pen-test pas encore externe. |
| A05 | Security Misconfiguration | ✅ | Headers CSP/HSTS, secrets hors repo, Rules durcies |
| A06 | Vulnerable Components | ⚠️ | `npm audit` donne 4 vulnérabilités dans les deps wrangler (non critiques). Firebase / jose à jour. Suivi manuel. |
| A07 | Auth & Session Failures | ✅ | Session nominative Firebase, validateSession auto, hash server-side, rate limit login (à renforcer) |
| A08 | Software & Data Integrity | ✅ | Audit log signé côté serveur, non falsifiable client. Chiffrement intégrité via GCM. |
| A09 | Logging & Monitoring Failures | ⚠️ | Audit log complet en place. Monitoring (alertes, dashboard) reporté à Phase 4 future. |
| A10 | Server-Side Request Forgery | ✅ | Worker ne fait que des appels vers Firebase (whitelist domaine). Pas d'URL user-controlled. |

---

## 6. Scénarios de pen-test manuels

À exécuter en navigation privée / avec compte test. Tous doivent **échouer** (retour `denied`, `unauthorized`, `forbidden`, ou erreur visible).

### 6.1 Tentatives d'élévation de privilège
```js
// Connecté en agent non-admin, dans la console :
// 1. Essayer de se promouvoir admin
await WORKER.write('set', 'appConfig/agentRoles/<votre-clé>', '__admin__');
// ATTENDU : 403 forbidden (authz_denied scoped_denied)

// 2. Essayer de reset le mdp d'un autre agent
await WORKER.write('remove', 'appConfig/agentPasswords/<clé-autre-agent>');
// ATTENDU : 403 forbidden

// 3. Essayer d'écrire dans /superadmin/*
await WORKER.write('set', 'superadmin/test', 'hack', { absolute: true });
// ATTENDU : 403 forbidden (pas de claim superadmin)
```

### 6.2 Tentatives d'accès direct Firebase
Ouvrir la console Firebase REST sans session :
```bash
# Sans token → doit refuser (auth != null)
curl https://cpasquaregnon-70f59-default-rtdb.europe-west1.firebasedatabase.app/orgs.json
# ATTENDU : 401 Unauthorized

# Avec token anonymous → peut lire mais pas écrire sur paths durcis
# Test indirect : tenter `db.ref('orgs/cpas-quaregnon/reservations').push({...})` en console
# ATTENDU : PERMISSION_DENIED
```

### 6.3 Tentatives d'exfiltration du hash superadmin
```bash
# Via REST avec token anonymous
# ATTENDU : 401 PERMISSION_DENIED (Rule .read: false)
```

### 6.4 Flood kiosk
Lancer 50 requêtes kiosk en moins de 60s depuis la même IP :
- Les 30 premières OK
- Les suivantes → 429 rate_limited

### 6.5 Bruteforce login agent
Taper 20 fois un mdp faux via le formulaire `/index.html` :
- Chaque échec retourne 401 invalid_credentials
- **Aucun rate limit actuellement** — à ajouter en Phase 4 (limit 5/min/IP via Durable Object Cloudflare).

### 6.6 Manipulation client side
Dans la console, modifier `CONFIG.WORKER_CRUD = false` et tenter un write direct Firebase :
- Les writes sur les paths durcis seront rejetés par Firebase Rules même avec anon auth
- Seuls les paths non-durcis (notifications, audit, agentStatus, queues...) continueront de fonctionner — comportement attendu, niveau de confiance plus bas pour ces données peu sensibles

### 6.7 Token expiré ou falsifié
```js
// Envoyer un Bearer token bidon
fetch('https://sitecpas-worker.hugo-hismans.workers.dev/data/write', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer invalid.jwt.here', 'Content-Type': 'application/json' },
  body: JSON.stringify({ op: 'set', path: 'test', value: 'x' }),
});
// ATTENDU : 401 unauthorized
```

---

## 7. Responsible disclosure

Si vous découvrez une vulnérabilité :
1. **Ne la divulguez pas publiquement** (GitHub issue, réseaux sociaux, etc.) avant contact.
2. Écrivez à **hugo.hismans@gmail.com** avec :
   - Description de la faille
   - Étapes de reproduction
   - Impact estimé
   - Votre nom/pseudo pour remerciement (optionnel)
3. Délai de réponse cible : **72h** pour accusé de réception.
4. Délai de correction cible : **30 jours** pour vulnérabilités critiques (RCE, exfiltration massive), **90 jours** pour le reste.
5. Vous serez crédité (si souhaité) dans le changelog sécurité (`CHANGELOG_SECURITY.md` à venir).

Pas de bug bounty monétaire à ce stade (projet non commercial).

---

## 8. Limitations connues / dette technique

| Item | Phase de résolution prévue |
|---|---|
| `migrate.html` cassé par design (lit racine Firebase hors /orgs/) | Suppression prévue |
| `'unsafe-inline'` dans CSP script-src | Phase 6 (extraction handlers inline) |
| Notifications contact-admin (user non auth) passent toujours en direct Firebase | Acceptable (notif triviale, non sensible) |
| Aucun rate limit sur login agent | Phase 4 (Durable Object Cloudflare) |
| Pas de backup auto Firebase | Phase 4 (snapshots vers R2) |
| Rotation `ENCRYPTION_KEY` non automatisée (format `enc:v1:` prévu mais unused) | Quand rotation réelle nécessaire |
| Dashboard audit / alertes email | Phase 4 |
| Pen-test externe professionnel | À budgéter avant déploiement multi-org |

---

## 9. Changelog sécurité

### 2026-04-22 — Phase 3ter
- Onboarding agent (couleur, emoji, genre) migré sur Worker avec signIn nominatif immédiat post-create
- Choix de rôle welcome.html via Worker avec authz anti-auto-promotion (`value !== '__admin__'`)
- Détection session stale (Firebase anonymous + flag agent) → redirect login auto

### 2026-04-22 — Phase 3bis
- `superadmin.html` + `kiosk.html` + `rdv-integrateur.html` migrés sur Worker
- `/superadmin/login` endpoint, JWT customToken avec claim superadmin
- `/kiosk/issue-ticket` non-auth + rate limit 30/min/IP
- Rules : `/superadmin/passwordHash/.read: false` (anti-bruteforce offline)

### 2026-04-22 — Phase 3
- Tous les writes sensibles passent par Cloudflare Worker
- Chiffrement field-level AES-GCM 256 sur comments/messages/descriptions
- Retrait du fallback hash local (fail secure)
- Rules durcies : `.write: false` sur reservations, requests, planning, agentPasswords

### 2026-04-22 — Phase 2
- Worker Cloudflare avec `/auth/login` → customToken Firebase nominatif
- uid Firebase = agentKey (plus anonymous)
- jose JWT RS256, service account en secret Cloudflare

### 2026-04-22 — Phase 1
- Worker squelette déployé sur sitecpas-worker.hugo-hismans.workers.dev

### 2026-04-22 — Phase 0 complète
- Headers CSP/HSTS (vercel.json)
- Firebase Anonymous Auth
- Rules Firebase strictes (`auth != null`)
- Audit log minimal (`/orgs/*/audit`) + vue Journal admin
- `validateSession` périodique + `grantEnd` tempAdminGrant
