# Mes petits projets — GitHub Pages

Ce dépôt héberge une collection de mini‑projets (p5.js, Three.js, etc.).  
Pour ajouter un projet :
1. Crée un dossier dans `projects/mon-projet/` avec un `index.html` qui fonctionne en local.
2. Ajoute une entrée dans `projects/projects.json` :
```json
{
  "title": "Mon projet",
  "folder": "mon-projet",
  "description": "Petit résumé…",
  "tags": ["p5.js"],
  "thumbnail": "thumb.jpg",
  "date": "2025‑08‑24"
}
```
3. Push sur la branche **main**. GitHub Pages publie automatiquement le site.

Astuce : ajoute un fichier `.nojekyll` à la racine (déjà inclus) pour éviter les soucis de ressources avec GitHub Pages.
