# UTub Short Kill

[![CI](https://github.com/WicktorB/YouTube-Short-Kill/actions/workflows/ci.yml/badge.svg)](https://github.com/WicktorB/YouTube-Short-Kill/actions/workflows/ci.yml)

Supprime les **YouTube Shorts** de partout — accueil, abonnements, recherche,
recommandations, barre latérale, barre de navigation mobile — **sauf sur la page
d'une chaîne de créateur**. Pour ouvrir un Short, il faut **répondre manuellement à
3 questions** : juste assez de friction pour ne pas s'y perdre.

Deux façons de l'installer, à partir du même dépôt :
un **userscript** (iPhone, et tout navigateur avec Tampermonkey) et une
**extension Chrome** à charger en « unpacked » (Chrome, Dia, Edge, Brave…).

## Ce que ça fait

| Objectif | Comment |
| --- | --- |
| Ne plus voir les Shorts | Masquage des étagères, items, onglets et boutons « Shorts » |
| Ne pas y accéder facilement | Toute page `/shorts/…` est bloquée par 3 questions |
| Exception : les chaînes | Sur `/@chaine`, `/channel/…`, les Shorts restent visibles/accessibles |
| Gagner du temps | Bouton « Quitter » bien en évidence ; option lecteur normal sans scroll infini |
| Rester conscient du temps | Minuteur discret en haut de l'écran (translucide, non bloquant) + re-verrouillage automatique |

## Installation

| Où | Quoi installer |
| --- | --- |
| **Ordinateur — Chrome, Dia, Edge, Brave** | l'**extension Chrome** (`dist/chrome`), sans Tampermonkey |
| **iPhone — Safari** | le **userscript**, via l'app Userscripts |
| Autres navigateurs (Firefox, Safari macOS) | le **userscript**, via Tampermonkey |

### Ordinateur — extension Chrome (Chrome, Dia, Edge, Brave)

1. Récupère le dépôt (à faire une fois) :
   ```bash
   git clone https://github.com/WicktorB/YouTube-Short-Kill.git
   ```
2. Ouvre `chrome://extensions`, active le **mode développeur**, clique
   *Charger l'extension non empaquetée* et choisis le dossier **`dist/chrome`**.
3. Recharge tes onglets YouTube. Épingle l'icône : un clic dessus ouvre les réglages.

**Mettre à jour** : `git pull` dans le dossier, puis le bouton ↻ de l'extension
dans `chrome://extensions`.

- **Ne déplace pas le dossier** une fois l'extension chargée : son identifiant
  dépend du chemin, et tes réglages avec.
- Si tu utilisais le userscript sur ce navigateur, **désactive-le dans
  Tampermonkey** (sinon les deux tournent en même temps). Ses réglages ne sont
  pas repris : à ressaisir une fois dans le panneau.

### Userscript

Il **se met à jour tout seul**. Lien du script (à ouvrir / coller) :

```
https://raw.githubusercontent.com/WicktorB/YouTube-Short-Kill/main/dist/utub-short-kill.user.js
```

#### Ordinateur — Firefox, Safari (ou Chrome si tu préfères Tampermonkey)
1. Installe **Tampermonkey** (gratuit) depuis le magasin d'extensions de ton navigateur.
2. Ouvre le lien du script ci-dessus → Tampermonkey affiche une page **« Installer »** → clique **Installer**.
3. Va sur `youtube.com` et recharge la page.

#### iPhone — Safari
Installe l'app gratuite **« Userscripts »**, active-la dans *Réglages → Safari →
Extensions*, puis colle le script. Guide pas-à-pas :
**[`userscript/README.md`](userscript/README.md)**.

> **Réglages (dans tous les cas)** : un bouton **⚙️** apparaît en bas à droite des
> pages YouTube et ouvre le panneau d'options (persistant, il survit aux mises à jour).

<details>
<summary><b>Alternative — extension générique pour Firefox / Safari (Xcode)</b></summary>

Une seconde extension, bâtie sur le même code que le userscript, est buildée dans
**`dist/extension/`** (à ne pas confondre avec `dist/chrome`).

- **Firefox** : `about:debugging#/runtime/this-firefox` → *Charger un module temporaire* → `dist/extension/manifest.json` (à refaire à chaque redémarrage de Firefox).
- **Safari macOS / iPhone (Xcode)** : voir **[`safari/README.md`](safari/README.md)**.
</details>

## Réglages (bouton ⚙️)

> Par choix (outil de self-control), les interrupteurs qui **neutralisent** la
> protection — *masquage des Shorts* et *3 questions* — ne sont **pas** dans le
> panneau. Pour tout désactiver, il faut passer par l'app **Userscripts** sur
> iPhone, ou par `chrome://extensions` sur ordi : un geste volontairement plus
> difficile.

- **Afficher le minuteur** — pastille discrète (haut-centre, translucide, sans
  blocage des clics/taps) ; passe en rouge et pulse dans les 30 dernières
  secondes, puis re-verrouille automatiquement.
- **Autoriser depuis les chaînes** — laisse les Shorts d'un créateur accessibles.
- **Ouverture d'un Short débloqué** :
  - *Lecteur Shorts* — format vertical habituel une fois débloqué.
  - *Lecteur normal* — redirige `/shorts/ID` → `/watch?v=ID` : même vidéo, **sans
    le scroll infini**.
- **Durée de déblocage** — minutes d'accès accordées après réussite (défaut : 5).
- **Longueur minimale des réponses** — friction ajustable (défaut : 15).
- **Les 3 questions** — entièrement personnalisables.
- **Verrouiller maintenant** — coupe l'accès immédiatement.

## Comment marche le blocage

- Au chargement d'une page `/shorts/…`, le lecteur est masqué et la vidéo mise en
  pause tant que les questions ne sont pas validées (aucun flash).
- Réponses valides → déblocage temporisé stocké localement.
- YouTube étant une application monopage, la navigation interne est suivie
  (History API + événements `yt-navigate-*` + filet de sécurité).
- Un Short ouvert **depuis une chaîne** n'est pas bloqué (exception voulue).

## Architecture

Deux cœurs, qui partagent les réglages par défaut et la feuille de style :

- **`src/core/`** — le cœur d'origine, portable (Safari iOS compris). Il produit
  le userscript et l'extension générique.
- **`src/chrome/`** — le cœur de l'extension Chrome, qui s'appuie sur ce que
  Chromium fournit : CSS injecté par le navigateur, masquage 100 % CSS
  (`:has()`), API Navigation, `chrome.storage`. Il ne fait tourner **aucun
  minuteur permanent ni `MutationObserver`** : il ne s'exécute que lors d'un
  changement de page, et chaque seconde pendant un déblocage.

```
src/
  core/config.js        Réglages par défaut (partagé)
  styles/index.css      Tout le CSS (partagé)
  core/app.js           Cœur d'origine : masquage, garde, minuteur, panneau ⚙️
  platform/             Stockage du cœur d'origine (localStorage / chrome.storage)
  entry/                Points d'entrée du cœur d'origine
  chrome/               Extension Chrome :
    manifest.json         manifest (et numéro de version de l'extension Chrome)
    content.js            état, navigation, verrou, minuteur
    ui.js                 fenêtre des 3 questions, réglages, minuteur, ⚙️
    store.js  config.js   chrome.storage, validation des réglages
    background.js         clic sur l'icône → ouvre les réglages
    extra.css             règles CSS en plus de index.css
    icons/                icon.svg + PNG générés
build/build.mjs         esbuild → dist/
dist/                   Sorties GÉNÉRÉES (commitées pour l'install) :
  utub-short-kill.user.js   le userscript
  chrome/                   l'extension Chrome (unpacked)
  extension/                l'extension générique (Firefox, Safari)
icons/  tools/  tests/  safari/
```

> Le userscript et `dist/chrome` ont **chacun leur numéro de version**
> (`package.json` pour le premier, `src/chrome/manifest.json` pour la seconde) :
> faire évoluer l'extension Chrome ne modifie pas le userscript, donc ne
> déclenche aucune mise à jour sur le téléphone.

## Développement

```bash
npm install
npm run build                     # régénère dist/ (userscript + les deux extensions)
npx playwright install chromium   # 1re fois
npm test                          # syntaxe + manifests + tests des trois sorties
```

- **On n'édite jamais `dist/`** (généré) — on modifie `src/`, puis `npm run build`.
- La CI (`.github/workflows/ci.yml`) rebuild, vérifie que `dist/` est à jour, et rejoue les tests à chaque push / PR.
- `tests/chrome.test.mjs` charge `dist/chrome` dans un vrai Chromium, comme en
  « unpacked » (les pages YouTube sont simulées localement).
- Un changement de sélecteur YouTube se fait dans `src/styles/index.css` (les deux
  cœurs en profitent) ; les vignettes isolées sont aussi listées dans
  `src/core/app.js` (userscript) et `src/chrome/extra.css` (extension Chrome).
- Régénérer les icônes : `node tools/make_chrome_icons.mjs` (extension Chrome),
  `python3 tools/make_icons.py` (extension générique).

### Diagnostic des sélecteurs

YouTube change régulièrement son HTML. Pour vérifier ce que le script attrape sur
**ton** YouTube : ouvre la console (F12) sur une page YouTube et colle le contenu de
[`tools/diagnose.js`](tools/diagnose.js). Il liste les vrais conteneurs de Shorts
à cibler — utile pour ajuster `src/styles/index.css` / `src/core/app.js`.

## Limites connues

- Vise **YouTube dans le navigateur** (y compris Safari iOS), **pas l'application
  YouTube native** — une app installée ne peut pas être modifiée.
- Le déblocage repose sur de la friction volontaire, pas sur un verrou
  infranchissable (désactivable depuis les réglages).
