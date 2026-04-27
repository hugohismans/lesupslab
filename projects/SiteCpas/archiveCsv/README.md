# Import CSV → SiteCpas Firebase

Script de migration des anciennes requêtes techniques (CPAS + MRS) vers `orgs/cpas-quaregnon/requests` dans Firebase.

## Source

4 fichiers CSV dans ce dossier :
- `CPASponctuel.csv` — tâches one-shot CPAS (séparateur **virgule**)
- `mrsponctuel.csv` — tâches one-shot MRS (séparateur **virgule**)
- `CPASRecutentes.csv` — tâches récurrentes CPAS (séparateur **point-virgule**)
- `mrsRecurentes.csv` — tâches récurrentes MRS (séparateur **point-virgule**)

## Setup

```bash
cd archiveCsv
npm install        # installe csv-parse
node import.js
```

## Sortie

Le script écrit dans `output/` (gitignored) :
- **`requests-import.json`** — toutes les requêtes au format Firebase, prêtes pour l'import
- **`themes-add.json`** — les nouveaux thèmes techniques à ajouter
- **`themes-defaults-reference.json`** — référence des 12 thèmes seedés par défaut (à NE PAS importer s'ils existent déjà)

## Mapping appliqué

| Source CSV | Cible SiteCpas |
|---|---|
| Numéro tâche `T_PXXXX` / `T_RXXX` | `import_cpas_T_PXXXX` ou `import_mrs_T_PXXXX` (préfixé par org pour éviter collisions) |
| Date de création (Excel serial) | `createdAt` en ms epoch |
| Nom initiatrice | `fromAgentName` (texte libre, pas de matching agent) |
| Site (CPAS / MRS / Roseraie / Magasin / ILA) | `local` |
| Nature de la tâche | `themeId` — mapping vers thème existant ou nouveau auto-créé |
| Description | `description` |
| Service N°1/2/3 mandaté | `workerName` (concaténé "A + B + C") |
| Récurrence : `Toutes les X semaines` ou `tous les X mois` | `recurrence: { unit, interval, nextAt, templateId }` |
| Prochaine date | `recurrence.nextAt` |

**Statut** : tout importé en `'open'`. Les CSVs n'ont pas de colonne d'état (l'ancien système utilisait un code couleur Excel perdu à l'export).

**Type** : tout en `'technique'`.

**Urgence** : niveau 3 (moyen) par défaut.

## Procédure d'import dans Firebase

⚠️ **Toujours faire un backup avant l'import** (bouton "⬇ Exporter JSON" dans SiteCpas → Paramètres admin).

### Étape 1 — Importer les nouveaux thèmes

1. Firebase Console → Realtime Database → naviguer vers `orgs/cpas-quaregnon/appConfig/techThemes`
2. Bouton ⋮ → **Importer JSON** → choisir `output/themes-add.json`
3. Confirmer
4. Vérifier dans SiteCpas → Paramètres → 🏷 Thèmes techniques que les nouveaux thèmes apparaissent

### Étape 2 — Importer les requêtes

1. Firebase Console → Realtime Database → naviguer vers `orgs/cpas-quaregnon/requests`
2. Bouton ⋮ → **Importer JSON** → choisir `output/requests-import.json`
3. ⚠️ **L'import écrase le node ciblé** — assure-toi d'avoir backup des requêtes existantes (export JSON ci-dessus)
4. Confirmer
5. Aller dans SiteCpas → 🛠️ Espace technique → onglet "Toutes les requêtes" → vérifier qu'elles apparaissent (3280 requêtes attendues)

### Étape 3 (optionnel) — Test sur un orgId de staging

Si l'org de prod est sensible, peux tester d'abord sur `orgs/cpas-test/` :
1. Modifier la constante `ORG_ID` en haut de `import.js` → `'cpas-test'`
2. Re-run, importer dans `orgs/cpas-test/`
3. Tester via SiteCpas avec `?org=cpas-test` dans l'URL
4. Quand validé, remettre `'cpas-quaregnon'` et re-run

## Idempotence et rollback

- Les ids générés sont déterministes par `(org, sourceId)` : `import_cpas_T_P1259`, `import_mrs_T_R039`, etc. Re-run = même ids → overwrite, pas de duplication.
- **Rollback** : pour supprimer toutes les requêtes importées, dans Firebase Console naviguer sur `orgs/cpas-quaregnon/requests`, faire un script de filtrage côté client ou utiliser le Worker pour supprimer toutes les clés commençant par `import_*`. (Pas automatisé pour l'instant — à demander si nécessaire.)

## Stats du dernier run

Voir la sortie de `node import.js`. En résumé attendu :
- ~3 280 lignes parsées
- ~3 179 requêtes ponctuelles
- ~101 templates récurrents
- 9 nouveaux thèmes créés (Entretien général, HVAC, Cuisine, Cogénération, etc.)
- 0 erreur

## Limitations connues

- Les colonnes "Journée de la semaine" et "Journée du mois" des récurrentes sont **ignorées** (SiteCpas ne supporte que des intervals, pas un scheduling jour-précis).
- Les services multi-mandatés (Service N°1, N°2, N°3) sont **concaténés** dans `workerName` ("Vincent + Luxpro"). Pas de création de techniciens individuels.
- Les initiateurs ne sont **pas matchés** automatiquement aux comptes agents existants — à faire manuellement après import si besoin.
- Beaucoup de requêtes importées sont en réalité déjà finies dans la vie réelle. Un système de "bulk mark-done" dans SiteCpas est prévu en suivi pour passer plusieurs requêtes en `'done'` d'un coup.

## Hors scope (futur)

- Création des techniciens (Vincent, Luxpro, Pelzer, etc.) depuis les services uniques rencontrés
- Match auto des initiateurs vers `fromAgentKey` (fuzzy match par nom)
- Bulk mark-done pour archivage rapide
