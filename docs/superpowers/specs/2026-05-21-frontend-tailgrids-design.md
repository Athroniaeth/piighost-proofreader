# Frontend TailGrids — design

**Status :** approved (stack revised 2026-05-21)
**Date :** 2026-05-21
**Phase :** 1/3 (frontend) avant FastAPI (phase 2) puis intégration (phase 3)
**Target directory :** `frontend/` à la racine de `piighost-proofreader`
**Stack :** Vite + React 19 + TypeScript + Tailwind CSS 3.4 + TailGrids React primitives + PDF.js

> **Stack revision note (2026-05-21) :** la version initiale de cette spec annonçait du HTML/JS vanilla. Pivot vers React + Vite + TailGrids primitives TSX pour pouvoir exploiter la skill `tailgrids` (38 primitives + 410 blocks pré-composés). Les décisions UX (layouts, états, palette, microcopy) restent inchangées. Voir `docs/superpowers/plans/2026-05-21-frontend-tailgrids-react.md`.

## Goal

Remplacer l'UI Streamlit actuelle par une SPA légère en TailGrids vanilla, single-page, qui ressemble à un produit web propre plutôt qu'à un notebook. Le rendu PDF est entièrement client-side via PDF.js avec des overlays bboxes positionnés en absolute. Le backend (phase 2) renverra du JSON, plus aucune image générée côté serveur.

Cette phase 1 livre **un frontend statique avec données mockées** (fakes). Il sera connecté à FastAPI en phase 3.

## Non-goals

- Pas de SSR ni de Next.js — SPA React pure, builds statiques servables par n'importe quel CDN.
- Pas d'auth, pas de session, pas de cookies. App publique, rate limit côté backend (LiteLLM).
- Pas de stockage côté serveur des PDF (privacy first). Tout en mémoire pendant la requête.
- Pas d'i18n complet en phase 1 : tous les textes en FR « en dur ». L'extraction i18n FR/EN viendra plus tard.
- Pas de dark mode en phase 1.
- Pas d'historique des CV traités, pas de partage par URL.

## Architecture

### Layout général

Single-page. Le layout diffère entre l'état 1 (centrage strict vertical + horizontal d'une card unique, pas de container max-width) et l'état 2 (container max-width 1280 px, padding latéral 32 px, fond gris clair `#f1f5f9` autour pour faire respirer).

```
frontend/
├── index.html                     # Vite entry, mounts <div id="root">
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── package.json                   # vite + react + ts + tailwind + pdfjs-dist + vitest
├── src/
│   ├── main.tsx                   # ReactDOM.createRoot + <App />
│   ├── App.tsx                    # State machine + state-routing
│   ├── index.css                  # @tailwind directives + global custom rules
│   ├── components/
│   │   ├── core/                  # TailGrids primitives installed via CLI (Button, Checkbox, Badge…)
│   │   ├── EmptyState.tsx         # État 1 (upload landing)
│   │   ├── LoadingState.tsx       # Spinner + steps
│   │   ├── ResultsState.tsx       # Container état 2 (TopBar + split panels)
│   │   ├── ErrorState.tsx         # Carte d'erreur réutilisable
│   │   ├── TopBar.tsx             # Filename + counter + "Nouveau PDF"
│   │   ├── PdfPanel.tsx           # PDF.js render + overlay layer
│   │   ├── HighlightOverlay.tsx   # <div> absolute par bbox
│   │   ├── MistakesPanel.tsx      # En-tête + liste
│   │   ├── MistakeCard.tsx        # Une carte (badge + strike + correction + description)
│   │   └── DebugPanel.tsx         # Section debug gated par ?debug=1
│   ├── hooks/
│   │   ├── useAppState.ts         # useReducer pour la state machine
│   │   ├── useMistakesStore.ts    # toggle + active state
│   │   └── useDebugMode.ts        # lit ?debug=1 / ?fake=1
│   ├── lib/
│   │   ├── upload.ts              # validateFile (TDD)
│   │   ├── pdf.ts                 # base64ToBytes, renderPdf (PDF.js wrapper)
│   │   ├── scaling.ts             # scaleBox (bbox PDF pt → px, TDD)
│   │   └── types.ts               # Mistake, ProofreadResult, MistakeType…
│   └── fixtures/
│       └── sample-result.json     # Faux résultat (importé directement, pas via fetch)
└── tests/                         # Vitest + React Testing Library
    ├── upload.test.ts
    ├── scaling.test.ts
    ├── mistakesStore.test.ts
    └── appState.test.ts
```

### Les deux états visuels

**État 1 — accueil (avant upload)**

- Page centrée verticalement et horizontalement.
- Titre `ProofReader` (32 px, font-weight 700, letter-spacing -0.3 px).
- Sous-titre court qui décrit le service.
- Dropzone large (border 2px dashed, border-radius 16 px, fond `bg-secondary`) avec icône 📄, texte « Glissez votre CV ici », bouton « Parcourir mes fichiers », info « PDF · 10 Mo max · texte (pas un scan) ».
- Disclaimer privacy sous la dropzone, ton sobre, mentionne anonymisation via piighost-api.
- Footer minimaliste : juste un logo GitHub cliquable (SVG inline), 22 px, couleur `muted`.

**État intermédiaire — loader**

Affiché juste après l'upload, avant de recevoir le résultat. Centré strictement (flex align-items + justify-content + max-width sur le bloc texte) pour rester ancré même si la fenêtre s'agrandit.

- Spinner CSS 48 px (border-radius 50%, border-top bleu, animation spin 1 s).
- Titre « Analyse en cours… ».
- Sous-titre énumérant les étapes : « Extraction du texte · Anonymisation · Détection des fautes ».
- ETA approximative en dessous (« ≈ 10 secondes pour un CV d'une page »).

**État 2 — résultats**

- Barre supérieure (card blanche, border-radius 10 px) avec nom du fichier, compteur de fautes, bouton « ↻ Nouveau PDF » (reset direct, pas de confirmation).
- Sous la barre : split 50/50 horizontal, gap 20 px, chaque panneau en card blanche avec border et border-radius 10 px.
- Hauteur des panneaux : `calc(100vh - 160px)` (le 160 px couvre la barre supérieure + padding container), panneaux indépendamment scrollables avec scrollbars internes.

### Panneau PDF (gauche)

Rendu PDF.js (`pdfjs-dist` chargé en static depuis `public/pdfjs/`).

- Chaque page rendue dans un `<canvas>`.
- Au-dessus du canvas, un `<div>` overlay positionné en absolute, contenant un `<div>` par highlight bbox.
- Chaque highlight div a deux classes possibles :
  - `.highlight-default` (rouge semi-transparent, `rgba(235,30,30,0.35)`)
  - `.highlight-active` (jaune semi-transparent, `rgba(255,230,0,0.55)` + outline jaune `#f59e0b`)
- Hidden via `display: none` quand la faute est décochée.
- Conversion des coords PDF→pixel : la viewport PDF.js donne le scale, on multiplie les bboxes serveur par ce scale.
- Pages stackées verticalement, scroll vertical dans le panneau.

### Panneau liste (droite)

Liste scrollable, items en cards (border 1 px, border-radius 8 px, padding 10 px, margin-bottom 8 px).

- En-tête de panneau : checkbox « Tout cocher / décocher » + compteur « N visibles ».
- Chaque card faute contient :
  - Checkbox à gauche (cochée par défaut).
  - Badge de type coloré en haut : `PONCTUATION`, `ORTHOGRAPHE`, `ACCORD`, `GRAMMAIRE`, `CONJUGAISON`. Chacun avec sa palette (rouge, orange, etc.), font-size 10 px, padding 1×6, border-radius 4.
  - Ligne principale : `error_text` en strikethrough rouge `#dc2626`, flèche `→`, `correction` en bold vert `#16a34a`.
  - Description en dessous, font-size 11 px, couleur muted.
- Trois états visuels par card :
  - **Cochée standard** : border gris, fond blanc. Highlight rouge sur le PDF.
  - **Active** (clic sur la ligne, pas la checkbox) : border 2 px jaune `#f59e0b`, fond `#fffbeb`, petit badge « 🎯 ACTIVE » dans le coin haut-droit. Highlight jaune sur le PDF, scroll-into-view du PDF jusqu'à la bbox.
  - **Décochée** : opacity 60 %, fond `#f9fafb`. Highlight masqué (`display:none`) sur le PDF.
- Sémantique du toggle (option B validée en brainstorming) :
  - Cocher / décocher = afficher / masquer le highlight.
  - Cliquer sur le corps de la card (pas la checkbox) = bascule en mode active.
  - Si tu cliques une 2e card, l'ancienne perd son état active et redevient « cochée standard ».

### Section debug (gated)

Cachée par défaut. Active uniquement si :
- `?debug=1` dans l'URL, OU
- Bouton 🔧 discret en bas à droite de l'écran (position fixed bottom-4 right-4, 32 × 32 px, opacity 0.4 par défaut, 1.0 au hover) — toggle visibilité de la section.

Contenu (identique au Streamlit actuel) :
- Stat-line : langue détectée, thread_id, raw mistakes / located / unlocatable.
- Accordéons : Markdown raw, Markdown anonymisé, raw LLM mistakes (table), deanonymized mistakes (table), word stream par page (table avec bboxes).
- Bouton « Download pipeline dump (JSON) ».

## Erreurs et empty states

| Cas | UX |
|---|---|
| PDF > 10 Mo | Rejet client-side immédiat (pas d'upload). Dropzone passe en mode rouge avec icône ⚠️, message « Fichier trop volumineux · 14,3 Mo · limite 10 Mo », bouton « Choisir un autre fichier ». |
| PDF sans couche texte | Affichage erreur rouge centré, icône 📄❌, message « PDF non lisible · Aucun texte trouvé · Le PDF semble être un scan, l'OCR n'est pas supporté ». |
| Backend indisponible | Affichage erreur orange centré, icône 🔌, message « Service indisponible · Réessayez dans quelques instants · Si ça persiste, signalez sur GitHub », bouton « Réessayer ». |
| Rate limit LiteLLM | Affichage erreur orange centré, icône ⏳, message « Trop de requêtes · Quota atteint pour cette IP · Réessayez dans 2 minutes », bouton retry désactivé avec compteur live (décrémente seconde par seconde). |
| 0 fautes détectées | Layout état 2 **conservé** (PDF affiché normalement à gauche). Le panneau droit affiche un message centré : ✅ « Aucune faute détectée · Le LLM a analysé votre CV et n'a rien trouvé à corriger ». Barre supérieure affiche « ✓ aucune faute » en vert au lieu du compteur. |

## Mobile

Stack vertical (option B validée). En dessous de 1024 px de largeur :

- Container max-width: 100 %, padding: 16 px.
- Barre supérieure conservée (full width).
- Panneau PDF en haut, panneau liste en dessous (flex-direction: column).
- Scroll global de la page, pas de scroll indépendant.
- Hauteur des deux panneaux: contenu auto.

## Données mockées (phase 1)

Pour développer le frontend sans backend, un fichier `src/js/fakes/sample-result.json` fournit un résultat type avec :

- `language`: "fr"
- `mistakes`: 5 fautes de types variés (ortho, accord, grammaire, ponctuation), avec `error_text`, `correction`, `description`, `type`, `bbox: [x0, y0, x1, y1]`, `page: 0`.
- `pdf_base64`: un petit PDF d'une page (sample CV en base64, ≤ 100 KB) inline pour les tests sans upload.

Un toggle dev (`?fake=1`) court-circuite l'upload et charge directement ce JSON. Permet de tester le rendu sans backend.

## Stack technique

**Build & dev :**
- Vite 5.x avec template `react-ts` pour le bootstrap.
- React 19 + TypeScript 5.
- Tailwind CSS 3.4 (PostCSS via plugin Vite, pas de CLI séparé).
- `tailwind.config.js` avec les couleurs custom (rouge/jaune highlights, vert validation).
- Dev server : `npm run dev` (hot reload natif Vite, port 5173 par défaut).
- Build prod : `npm run build` → `dist/` static servable par n'importe quel CDN ou Coolify.
- Tests : Vitest + `@testing-library/react` pour la logique (validation, store, scaling), smoke manuel pour PDF.js et layout.

**TailGrids React primitives** : 38 primitives TSX installables via la CLI TailGrids dans `src/components/core/`. Primitives attendues : `Button`, `Checkbox`, `Badge`, `Modal` (ou `Dialog`), `Alert`, `Spinner`/`Skeleton`, `Tooltip` (éventuel). Les sections complexes (file-upload card, notification list) peuvent être fetchées depuis le catalogue `application/file-upload-1` et `dashboard/notifications-3` puis adaptées.

**State management** : React `useReducer` pour la state machine (empty / loading / results / error) et un store dérivé pour les mistakes (toggle + active). Pas de Redux, pas de Zustand — la complexité ne le justifie pas.

**PDF.js** : `pdfjs-dist` installé via npm (`pdfjs-dist@^4`), worker chargé via `?url` import Vite-natif. Pas de download manuel.

## Validation phase 1

Avant de passer à la phase 2 (FastAPI), critères d'acceptation manuels :

1. Charger `index.html` dans Chrome → état 1 visible, dropzone centrée, dimensions correctes à 1440 px et 1024 px.
2. Drag un PDF > 10 Mo → erreur immédiate sans upload.
3. Drag un PDF valide → loader s'affiche puis fake JSON se charge → état 2 affiché.
4. Le PDF s'affiche à gauche avec 5 highlights rouges aux bonnes positions.
5. Décocher une faute → highlight disparaît du PDF.
6. Cliquer une card → bordure jaune + highlight jaune + scroll PDF jusqu'à la bbox.
7. Cliquer une 2e card → l'ancienne perd son état active.
8. `?debug=1` → section debug visible avec le contenu du JSON mocké.
9. Redimensionner la fenêtre < 1024 px → stack vertical sans bug de scroll.
10. Cliquer « Nouveau PDF » → retour direct à l'état 1 sans confirmation.

## Hors scope, à considérer plus tard

- Traduction EN (extraction i18n, switch FR / EN dans header).
- Dark mode (toggle système + variantes Tailwind `dark:`).
- Animations / transitions soignées entre états (état 1 → loader → état 2).
- Export des corrections (PDF annoté téléchargeable, ou liste markdown).
- Multi-PDF, comparaison, historique.
- Auth + quota par utilisateur.
