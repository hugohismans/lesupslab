# Rubik — Webcam → Éditeur → Résolution 3D

Projet découpé en plusieurs fichiers, avec **passage obligatoire par l'éditeur**.

## Lancer en local
Servez le dossier via HTTP (pas `file://`). Par exemple avec VS Code *Live Server* ou :
```bash
python -m http.server 5500
```
Puis ouvrez `http://127.0.0.1:5500` (ou le port proposé).

## Dépendances locales (optionnel mais recommandé)
Placez ces fichiers dans `./lib/` (ils seront utilisés en priorité) :
- `cube.min.js` et `solve.min.js` (lib cubejs / tables du solveur)
- `three.min.js` **ou** `three.module.js` (pour le rendu 3D)

Sans ces fichiers, l'appli tentera un chargement via CDN (peut être bloqué par CORS/MIME suivant votre environnement).

## Flux utilisateur
1. **Démarrer la caméra**, cliquer **Armer** (ou utilisez **📸 Capturer (C)** pour une capture forcée).
2. Suivre l'**overlay** : par face, *centre de la **bonne couleur*** et **orientation** indiquée (par ex. côté F : centre vert et centre blanc en haut ; côté U : centre blanc et face verte en haut ; côté D : face verte en bas).
3. La capture se déclenche **automatiquement** quand tout est OK.
4. L’éditeur est **rempli** à partir des captures (vous pouvez corriger au besoin).
5. Cliquez **Résoudre (éditeur)** : la solution s’affiche et la **3D** l’exécute depuis l’état mélangé.

## Bouton “Effacer / Revenir”
Clic unique : efface la face courante si elle existe.  
Clics répétés : remonte d’une face à la fois (efface et revient).

## Notes techniques
- Détection du **centre conforme** via un classif HSV canonique (robuste pour cubes "stickerless").
- Pour **U/D**, on demande explicitement la face verte **en haut** (U) ou **en bas** (D).
- Solveur en **Web Worker embarqué** (Blob) : pas de blocage de l’UI, pas de problème de MIME/CORS.
- Le viewer 3D part de l’état **mélangé** (scramble = inverse de la solution), puis joue la solution.
