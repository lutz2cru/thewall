# The Wall · révisions FISA01 Informatique (UTBM)

Une seule page qui regroupe toutes les pages de révision de la promo, rangées par UV, avec une recherche.
Les liens sont gérés depuis une interface admin, sans toucher au code.

- **Site public** : `index.html`, qui lit `data/wall.json` et affiche les pages par UV (recherche sans accents, raccourci `/`, lien partageable `?q=…`, badge « nouveau » pendant 14 jours).
- **Admin** : `admin.html`. On s'y connecte avec un token GitHub. Chaque action (ajouter, modifier, déplacer ou retirer une page ou une UV) crée un commit sur `data/wall.json` dans le dépôt, et GitHub Pages republie le site en environ une minute.

Aucun serveur ni base de données : tout est statique et hébergé gratuitement par GitHub Pages.

```
index.html            page publique
admin.html            interface admin
data/wall.json        la liste des UV et des pages (modifiée par l'admin)
assets/css/           styles (base.css = couleurs et typo communes)
assets/js/config.js   réglages (dépôt, chemin du JSON, durée du badge « nouveau »)
assets/js/wall.js     affichage du mur
assets/js/admin.js    interface admin
assets/js/github.js   petit client pour l'API GitHub
tools/serve.mjs       serveur local pour tester (Node, sans dépendance)
```

## Mettre le site en ligne

1. Crée un dépôt **public** sur GitHub, par exemple `thewall`, sur le compte qui héberge déjà les pages de révision ou sur une organisation de promo (voir plus bas).
2. Envoie les fichiers :

   ```bash
   git init
   git add .
   git commit -m "The Wall"
   git branch -M main
   git remote add origin https://github.com/<compte>/thewall.git
   git push -u origin main
   ```

3. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
4. Le mur est en ligne sur `https://<compte>.github.io/thewall/` et l'admin sur `https://<compte>.github.io/thewall/admin.html`.

Le dépôt et la branche sont détectés automatiquement depuis l'adresse GitHub Pages. Avec un domaine personnalisé, renseigne `owner` et `repo` dans `assets/js/config.js`.

## Donner l'accès admin à plusieurs personnes

Chaque admin utilise **son propre** token GitHub. Les commits sont donc à son nom, et on peut retirer l'accès à une personne sans gêner les autres.

**Option A : organisation GitHub (recommandée dès qu'il y a plusieurs admins)**

1. Crée une organisation gratuite (ex. `fisa01-info-utbm`) et mets le dépôt `thewall` dedans.
2. Ajoute les admins comme membres, avec le rôle **Write** sur le dépôt.
3. Chaque admin crée un [token fine-grained](https://github.com/settings/personal-access-tokens/new) :
   - *Resource owner* : l'organisation
   - *Repository access* : **Only select repositories**, puis `thewall`
   - *Permissions* : **Contents : Read and write**
   - une date d'expiration (par exemple la fin du semestre)

   Si l'organisation exige une validation des tokens, un owner l'approuve dans *Settings → Personal access tokens*.

**Option B : dépôt sur un compte perso**

1. Le propriétaire ajoute les admins dans **Settings → Collaborators → Add people**.
2. Le propriétaire utilise un token fine-grained comme ci-dessus.
3. Si un collaborateur ne voit pas le dépôt dans la liste des tokens fine-grained (c'est le cas pour un dépôt appartenant au compte perso de quelqu'un d'autre), il crée un [token classique](https://github.com/settings/tokens/new?scopes=public_repo&description=The%20Wall%20admin) avec uniquement la case `public_repo` et une date d'expiration. Attention : ce token peut écrire dans tous les dépôts publics auxquels il a accès, il faut donc le garder pour soi.

## Utiliser l'admin

1. Ouvre `…/thewall/admin.html` et colle ton token. Par défaut, il est oublié à la fermeture de l'onglet. Coche « Rester connecté » uniquement sur ton ordinateur perso.
2. **+ Ajouter une UV** : un code (ex. `SR71`) et un nom.
3. **+ Ajouter une page** : colle l'adresse de la page.
   - Le titre et la description sont récupérés automatiquement depuis la page quand c'est possible.
   - Un lien `github.com/…/blob/…` (qui affiche le code source) est détecté, et l'adresse GitHub Pages correspondante t'est proposée.
   - Un avertissement s'affiche si la page est déjà sur le mur.
4. Les flèches réordonnent les UV et les pages, le crayon modifie (y compris pour changer une page d'UV), la corbeille retire l'élément du mur. Les pages elles-mêmes ne sont jamais supprimées.
5. « Dernières modifications » liste les derniers commits, et donc qui a changé quoi.

Si deux admins modifient le mur en même temps, l'admin relit automatiquement la dernière version et réapplique la modification : rien n'est écrasé.

## Format de `data/wall.json`

On peut aussi le modifier à la main sur GitHub :

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

Les `id` sont facultatifs à la main : l'admin en ajoute un à la prochaine modification. Seuls les liens `http(s)://` sont affichés.

## Tester en local

```bash
node tools/serve.mjs
```

Puis ouvre <http://localhost:4173/>. Ouvrir `index.html` par double-clic ne fonctionne pas, car le navigateur bloque la lecture du JSON en `file://`.

En local, l'admin ne peut pas deviner le dépôt : renseigne-le dans le cadre « Dépôt GitHub ». Attention, les modifications sont publiées sur le **vrai** dépôt.

## Sécurité

- Le token n'est envoyé qu'à `api.github.com`. Il est gardé dans le `sessionStorage` (ou le `localStorage` si « Rester connecté » est coché).
- Toutes les pages d'un même `<compte>.github.io` partagent ce stockage. Avec « Rester connecté », n'importe quelle page de ce compte pourrait lire le token. Garde des tokens limités à ce dépôt et avec une date d'expiration.
- Un token compromis se révoque en un clic dans *GitHub → Settings → Developer settings*.
- Le contenu affiché est construit sans `innerHTML` et les adresses `javascript:` sont refusées : un titre ou un lien piégé ne peut pas exécuter de code sur le mur.
