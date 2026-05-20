# piighost-proofreader, design

**Status :** approved
**Date :** 2026-05-20
**Target repo :** `~/PycharmProjects/piighost-proofreader/`
**Stack :** Streamlit, opendataloader-pdf, PyMuPDF, piighost-api, LiteLLM, LangChain ≥1.2, Pydantic

## Goal

App web qui prend un CV au format PDF en entrée et qui renvoie une liste de fautes (orthographe, grammaire, conjugaison, accord, ponctuation) détectées par un LLM. L'utilisateur visualise le PDF dans la page, voit les fautes surlignées en rouge, et un clic sur un élément de la liste passe la faute correspondante en jaune.

Cas d'usage principal, vérifier son propre CV avant envoi sans devoir l'envoyer à un service tiers en clair. Le LLM cloud ne reçoit que du texte anonymisé via `piighost-api`.

## Non-goals

- Pas de modification du PDF (lecture seule, on n'écrit pas de PDF corrigé).
- Pas de moteur d'orthographe maison (LLM via LiteLLM uniquement).
- Pas de persistance des PDF uploadés (traitement en mémoire, oublié à la fin de la session).
- Pas d'auth applicative (rate limit géré par LiteLLM, app publique).
- Pas de chunking (un PDF = un appel LLM).
- Pas d'OCR (le PDF doit avoir une couche texte).
- Pas de comparaison multi-PDF ni d'historique.
- Pas d'export des corrections (scope initial).

## Architecture

```
piighost-proofreader/
├── app.py                          # Streamlit entrypoint
├── proofreader/
│   ├── __init__.py
│   ├── models.py                   # Pydantic Mistake schema
│   ├── pdf_extraction.py           # opendataloader → markdown
│   ├── pdf_render.py               # PyMuPDF → page images + word bboxes + LRU
│   ├── highlight.py                # PIL overlay (jaune actif, rouge autres)
│   ├── anonymize.py                # piighost-api HTTP client
│   ├── llm.py                      # LiteLLM router + structured output
│   ├── locator.py                  # error_text + context → (page, bbox)
│   └── language.py                 # détection via lingua-py
├── tests/                          # pytest, smoke-tests des modules purs
├── samples/                        # 3-5 CV fictifs multi-langues
├── pyproject.toml
├── README.md
├── Dockerfile                      # multi-stage Java + Python
├── compose.yaml                    # pour Coolify
└── docs/
    └── superpowers/
        └── specs/2026-05-20-piighost-proofreader-design.md
```

## Components

### Pydantic schema (`models.py`)

```python
from typing import Literal
from pydantic import BaseModel, Field

class Mistake(BaseModel):
    error_text: str = Field(description="Substring exact à surligner, copié tel quel du Markdown.")
    correction: str = Field(description="Version corrigée proposée.")
    description: str = Field(description="Explication courte, max 15 mots, dans la langue du document.")
    type: Literal["orthographe", "grammaire", "conjugaison", "accord", "ponctuation"]
    context_before: str = Field(description="3 à 5 mots qui précèdent l'erreur, pour désambiguïser.")

class ProofreadResult(BaseModel):
    mistakes: list[Mistake]
```

### PDF extraction (`pdf_extraction.py`)

Lit le PDF avec `opendataloader_pdf` en mode local. Renvoie le Markdown structuré (titres, paragraphes, listes) qui servira d'input LLM, plus le JSON brut (paragraph bboxes) gardé pour debug. Lève une exception explicite si le PDF n'a pas de couche texte ou si Java n'est pas disponible.

### PDF render + word bboxes (`pdf_render.py`)

Utilise PyMuPDF (`fitz`) en parallèle, pour deux raisons distinctes que opendataloader-pdf ne couvre pas :

1. **Rendu image par page** via `page.get_pixmap(dpi=150)` puis encodage PNG.
2. **Word stream** via `page.get_text("words")` qui renvoie `[(x0, y0, x1, y1, text, block, line, word)]` exploitable pour la localisation des fautes.

Les deux opérations passent par un cache `functools.lru_cache` (clé = hash du PDF bytes + numéro de page) pour éviter de rerendre à chaque interaction Streamlit.

### Highlight overlay (`highlight.py`)

Reçoit une image PNG d'une page + une liste de `(bbox, is_active)` et renvoie une nouvelle image PNG avec rectangles semi-transparents superposés via PIL. Jaune pour `is_active=True`, rouge pour les autres. L'image originale reste en cache, on ne dessine que les overlays.

### Anonymisation (`anonymize.py`)

Wrapper HTTP autour de `piighost-api`. Fonctions `anonymize(text, thread_id)` et `deanonymize(text, thread_id)`. Le `thread_id` est généré par session Streamlit pour que les placeholders restent cohérents entre l'input et la désanonymisation des fautes.

Note importante, le LLM reçoit du Markdown avec `<<PERSON:1>>` à la place des noms, donc il ne peut pas détecter une faute sur un nom propre. C'est accepté.

### LLM (`llm.py`)

Construit un chain LangChain avec `ChatLiteLLM` (provider configurable via env var `LITELLM_MODEL`) et `.with_structured_output(ProofreadResult, method="json_schema")`. Le prompt système précise :

- la langue détectée (passée en variable)
- le rôle (proofreader expert)
- le schéma attendu (auto-injecté par LangChain)
- les types de fautes à chercher
- la consigne d'inclure `context_before` exact (5 mots ou moins, copiés du Markdown)

### Mistake locator (`locator.py`)

Algorithme :

1. Reconstruit un texte plat depuis le word stream PyMuPDF (`" ".join` des mots, en gardant la map `char_offset → (page_num, word_idx, bbox)`).
2. Pour chaque `Mistake`, désanonymise `error_text` et `context_before`.
3. Cherche `context_before + " " + error_text` dans le texte plat (recherche stricte, sensible à la casse).
4. Si match unique, renvoie la bbox du mot `error_text`. Si match multiple, garde le premier après le `context_before` exact. Si zero match, marque la faute `unlocatable` (visible dans la liste mais sans highlight PDF).

Le cas « 2e occurrence de j'avais fautive » est résolu par le `context_before` qui localise la bonne occurrence sans ambiguïté.

### Détection de langue (`language.py`)

`lingua-py` sur les 1000 premiers caractères du Markdown extrait. Renvoie un code ISO (`fr`, `en`, `es`, `de`, `it`…) injecté dans le prompt système LLM. Fallback `en` si la détection a une confiance faible.

## Flux de données

1. **Upload** : `st.file_uploader` accepte un PDF, lit les bytes, valide la taille (≤ 5 MB) et le nombre de pages (≤ 20 via PyMuPDF).
2. **Extraction** : opendataloader-pdf produit le Markdown. PyMuPDF rend les pages PNG et extrait le word stream (les deux mis en LRU).
3. **Détection langue** : `lingua-py` sur le Markdown.
4. **Anonymisation** : `piighost-api` reçoit le Markdown, renvoie la version anonymisée + maintient le mapping pour la désanonymisation.
5. **Appel LLM** : LiteLLM via LangChain, prompt + Markdown anonymisé, output structuré en `ProofreadResult`.
6. **Désanonymisation** : chaque `error_text` et `context_before` est désanonymisé via `piighost-api`.
7. **Localisation** : pour chaque `Mistake`, le locator trouve la bbox dans le word stream PyMuPDF.
8. **Affichage** :
   - colonne gauche, pages PNG empilées avec tous les highlights rouges (overlay PIL)
   - colonne droite, liste cliquable des fautes avec `type` + `description` + `correction`
   - clic sur un item, l'item devient sélectionné, la page concernée se re-render avec la faute correspondante en jaune et les autres restent rouges

## Erreurs prévues

| Cas | Comportement |
|---|---|
| PDF > 5 MB ou > 20 pages | `st.warning`, abort |
| PDF sans couche texte (scan) | `st.error("OCR not supported, upload a text-based PDF.")` |
| Java 11+ absent du conteneur | échec au boot du conteneur, log explicite, pas un crash runtime |
| `piighost-api` injoignable | `st.error`, fail closed, on n'envoie pas de texte brut au LLM |
| LiteLLM rate limit | `st.error("Try again in a few minutes.")` avec le retry-after si renvoyé |
| Structured output invalide | un retry, puis `st.error` |
| Locator échoue à matcher | la faute reste visible dans la liste avec badge `unlocatable`, pas de highlight PDF |

## Déploiement Coolify

- `Dockerfile` multi-stage, base `eclipse-temurin:21-jre` pour Java, install Python 3.12 par-dessus.
- `compose.yaml` expose le port Streamlit (8501), monte `.env` pour `LITELLM_API_KEY`, `LITELLM_MODEL`, `PIIGHOST_API_URL`.
- Coolify gère le reverse proxy HTTPS + le redémarrage automatique.
- Image attendue, ~600 MB (Python + Java + libs PDF).

## Validation manuelle

Avant merge, parcours d'acceptance sur 3 CV fictifs en `samples/` :

1. CV FR, 1 page, avec 4-5 fautes plantées (orthographe + accord + conjugaison). Vérifier que toutes sortent dans la liste, que les highlights rouges sont au bon endroit, et que le clic met bien en jaune sans bouger les rouges.
2. CV EN, 2 pages, avec une faute en double occurrence (la 1re correcte, la 2e fautive). Vérifier que le locator surligne uniquement la 2e.
3. CV ES ou DE, 1 page, pour valider la détection de langue + descriptions traduites.

Edge cases à vérifier :

- PDF avec sections multi-colonnes, vérifier que les bboxes word PyMuPDF tiennent.
- PDF avec polices custom embarquées.
- PDF avec ligatures (`fi`, `fl`) qui peuvent décaler le matching.

## Hors scope, à considérer après

- Export des fautes en JSON / CSV.
- Mode comparaison avant / après correction.
- Suggestion appliquable directement dans le PDF rendu.
- OCR via opendataloader-pdf en mode hybrid pour les PDF scannés.
- Auth utilisateur si on dépasse l'usage perso.
