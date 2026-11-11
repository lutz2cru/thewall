# The Wall · consignes pour Claude Code

Site statique (HTML/CSS/JS pur, **sans build ni dépendance**) publié par GitHub Pages sur
https://lutz2cru.github.io/thewall/. Il regroupe par UV les pages de révision de la promo
FISA01 Informatique de l'UTBM. Les admins le modifient de deux façons : par l'interface
`admin.html` (qui commit via l'API GitHub) ou directement dans ce dépôt.

## Avant et après chaque tâche

- **Toujours `git pull --rebase` avant de modifier quoi que ce soit** : l'admin web commit
  directement sur `main`, la copie locale est donc souvent en retard.
- Travailler sur `main`, en petits commits.
- Messages de commit en français :
  - `wall: …` pour les données, par ex. `wall: ajoute « Fiche TCP » (SR71)`. C'est le même style que l'admin.
  - Un autre préfixe court pour le reste (`design: …`, `admin: …`, `docs: …`).
- Si le `push` est refusé : `git pull --rebase`, puis pousser à nouveau. **Jamais de `--force`.**
- Le site est republié environ une minute après le push.

## Structure

```
index.html / assets/js/wall.js     page publique (lit data/wall.json)
admin.html / assets/js/admin.js    interface admin (lit/écrit data/wall.json via l'API GitHub)
assets/js/github.js                client API GitHub (lecture/écriture du fichier, gestion des conflits)
assets/js/common.js                fonctions partagées : el(), highlight(), isSafeUrl(), normalizeData()…
assets/js/config.js                réglages (dépôt, chemin du JSON, durée du badge « nouveau »)
assets/css/base.css                tokens de couleurs/typo (clair + sombre), boutons, champs
assets/css/wall.css, admin.css     styles propres à chaque page
data/wall.json                     LES DONNÉES DU MUR
tools/serve.mjs                    serveur local de test
```

## Modifier les données (`data/wall.json`)

```json
{
  "site": { "title": "The Wall", "subtitle": "…", "promo": "UTBM · FISA01 Informatique" },
  "updatedAt": "2026-11-11T12:00:00.000Z",
  "uvs": [
    {
      "id": "uv-sr71",
      "code": "SR71",
      "name": "Réseaux",
      "description": "",
      "links": [
        {
          "id": "sr71qcm1",
          "title": "Atelier de révision — QCM",
          "url": "https://gustor1.github.io/sr71-revision-qcm/",
          "description": "…",
          "added": "2026-11-11"
        }
      ]
    }
  ]
}
```

Règles :

- **UV** :
  - `code` unique, en majuscules (ex. `SR71`).
  - `id` unique et stable : pour une nouvelle UV, `uv-<code en minuscules>-<4 caractères hexa aléatoires>` (ex. `uv-if3a-7f2c`).
  - `description` peut rester vide.
- **Page** :
  - `id` unique : 10 caractères hexa aléatoires.
  - `url` en `https://` : l'adresse **GitHub Pages** (`https://<compte>.github.io/<dépôt>/…`), jamais un lien `github.com/…/blob/…` qui afficherait le code source.
  - `description` courte : 300 caractères maximum.
  - `added` = date du jour au format `YYYY-MM-DD`. Elle sert au badge « nouveau » pendant 14 jours.
- Si l'utilisateur ne donne pas le titre ni la description, les déduire de la page elle-même (`<title>`, `meta description`, contenu). Les pages GitHub Pages sont publiques.
- Vérifier que l'URL n'est pas **déjà** sur le mur, même page avec une ancre ou un `/` final différent.
- L'ordre des tableaux est l'ordre d'affichage. La couleur d'une UV dépend de sa position.
- Mettre à jour `updatedAt` (date ISO actuelle) à chaque modification.
- Garder le format de l'admin : indentation de 2 espaces, retour à la ligne final, sinon les diffs deviennent illisibles.
- Valider avant de commit :
  ```bash
  node -e "const d=JSON.parse(require('fs').readFileSync('data/wall.json','utf8'));console.log(d.uvs.map(u=>u.code+' ('+u.links.length+')').join(', '))"
  ```
  Un JSON invalide casse le site public et l'admin.

## Modifier le code

- Pas de framework, pas de build, pas de paquet npm : des modules ES natifs servis tels quels par GitHub Pages.
  Les scripts externes sont interdits, à l'exception des polices Google Fonts déjà utilisées.
- Construire le DOM avec `el()` de `common.js`, jamais `innerHTML` avec des données. Valider les liens avec `isSafeUrl()`.
- Couleurs et typo : utiliser les tokens CSS de `base.css`. Toute nouvelle couleur doit y être définie en mode clair **et** en mode sombre.
- Les textes de l'interface sont en français.
- Le site doit rester utilisable sur téléphone : tester à 375 px de large, sans défilement horizontal.
- Dans `admin.js`, toute modification des données passe par `commit(mutator, message)`.
  Cette fonction relit la dernière version sur GitHub avant d'écrire, ce qui évite d'écraser le travail d'un autre admin. Ne pas la contourner.

## Tester

```bash
node tools/serve.mjs
```

Puis ouvrir http://localhost:4173/. L'admin lancé en local écrit sur le **vrai** dépôt GitHub.
