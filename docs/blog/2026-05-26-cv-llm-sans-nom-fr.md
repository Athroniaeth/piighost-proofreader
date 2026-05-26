---
title: "Comment laisser GPT-5.5 corriger un CV sans jamais lui montrer un seul nom"
published: false
description: "Un proofreader de CV qui n'envoie aucune PII au LLM, et qui replace pourtant ses corrections au bon endroit dans le PDF. Trois écueils techniques rencontrés en route."
tags: python, llm, privacy, pdf
canonical_url:
cover_image:
---

## TL;DR

Pour relire ton CV avant un envoi important, tu peux le confier à un LLM. Quelques secondes, et tu as une liste de fautes. Sauf que tu viens aussi de donner ton nom, ton adresse, tes employeurs et tes dates à un service tiers.

`piighost-proofreader` corrige ce travers. Le CV passe par une anonymisation locale avant le LLM, puis les corrections sont reposées au bon mot sur le PDF d'origine :

```mermaid
flowchart LR
  PDF[PDF du CV] --> Markdown
  Markdown -->|anonymise + thread_id| Anon[Markdown anonymisé]
  Anon --> LLM[GPT-5.5]
  LLM --> Mistakes[Erreurs avec placeholders]
  Mistakes -->|deanonymize_entities| Clear[Erreurs en clair]
  Clear -->|locator + PyMuPDF bbox| PDF2[PDF + overlays rouges]
```

![Rendu final : le PDF du CV avec les rectangles rouges sur les erreurs détectées](https://placehold.co/1200x675?text=Replace+with+real+screenshot)

Le LLM ne voit jamais un nom, une date, une adresse. À la sortie, les corrections atterrissent au bon mot sur le bon PDF.

Entre les deux, il a fallu résoudre trois trucs vicieux. C'est l'objet de l'article.

## 1. Pourquoi pas juste une regex ?

Première idée évidente : avant d'envoyer le CV au LLM, on remplace les données sensibles par une bonne grosse regex. Ça marche pour les emails et les numéros de téléphone, qui ont des formats reconnaissables. Pour le reste, c'est mort.

- Un nom n'a aucune forme syntaxique distinctive. `Paul Martin` ressemble à n'importe quels deux mots capitalisés ; rien dans le texte ne dit à une regex que c'est un nom.
- `Orange` est une entreprise. C'est aussi un fruit. `Mars`, `Apple`, `Carrefour`, pareil.
- Une date dans un CV peut être une naissance, un diplôme, un changement de poste. Le format est le même.

Il faut un détecteur entraîné, pas un pattern. `piighost` en fournit un, accessible via une API simple :

```python
# src/proofreader/anonymize.py
async def anonymize(self, text: str, *, thread_id: str) -> str:
    return await self._call(
        "/v1/anonymize", text, thread_id, response_key="anonymized_text"
    )
```

Le `thread_id` (une UUID par upload) sert à garder côté serveur un mapping entre chaque entité réelle et son placeholder. C'est ce qui permettra de re-substituer plus tard, au retour du LLM. On voit pourquoi dans la section suivante.

## 2. Le piège du « le LLM ne renvoie pas ce qu'on lui a donné »

Une fois le Markdown anonymisé envoyé au LLM, on s'attend à recevoir des corrections truffées de `<<PERSON:1>>`, `<<EMAIL:3>>`, et il *« suffit »* de re-substituer pour finir. C'est ce que j'ai fait au premier essai.

Premier appel à `/v1/deanonymize` → **404 Not Found**.

Pourquoi ? Parce que le LLM ne renvoie *pas* le texte anonymisé en intégralité. Le schéma de sortie structuré demande, pour chaque erreur, des champs comme `error_text`, `context_before`, `correction`, `description`. Le LLM y met des **sous-extraits** : 5 mots ici, une phrase paraphrasée là, parfois avec une virgule déplacée. Aucun de ces champs n'est verbatim l'anonymisé.

Or `/v1/deanonymize` est cache-keyed sur le hash du texte anonymisé complet. Il sait dé-anonymiser ce qu'il a anonymisé, mais pas un sous-extrait qu'il n'a jamais vu. D'où le 404.

`piighost` expose un deuxième endpoint pour exactement ce cas : `/v1/deanonymize/entities`. Au lieu de chercher la clé du texte complet, il fait un remplacement par entité présente dans le sous-extrait (les `<<LABEL:N>>` qu'il y trouve sont résolus contre le mapping du `thread_id`).

```python
# src/proofreader/anonymize.py
async def deanonymize(self, text: str, *, thread_id: str) -> str:
    # /v1/deanonymize/entities does token-based replacement on any text,
    # while /v1/deanonymize is cache-keyed on the full anonymized text
    # and 404s on substrings. We pass substrings (Mistake.error_text,
    # context_before, correction, description), so we need the entity
    # endpoint.
    return await self._call(
        "/v1/deanonymize/entities", text, thread_id, response_key="text"
    )
```

Concrètement, pour chaque `Mistake` que le LLM renvoie, je rappelle `deanonymize` sur chacun de ses quatre champs textuels. C'est plus de round-trips, mais c'est ce qui rend le pipeline robuste aux paraphrasages.

À retenir : quand tu fais passer du texte anonymisé dans un LLM, le « retour » de l'anonymisation doit pouvoir gérer des fragments du texte original, pas le texte entier. Si ton outil d'anonymisation ne fait pas la distinction, tu vas te cogner contre ce mur.

## 3. Le retour sur PDF : quatre stratégies de fallback

À ce stade, j'ai pour chaque erreur un `error_text` en clair (post-deanon), un `correction`, un `context_before`, et une `description`. Le LLM, lui, n'a jamais vu un seul pixel du PDF : il travaillait sur le Markdown extrait. Aucun champ ne contient des coordonnées.

Or l'utilisateur veut voir les corrections sur le PDF d'origine, pas un texte plat dans une page de résultats. Donc il faut, pour chaque erreur, retrouver le mot dans le PDF.

Du côté du PDF, j'utilise PyMuPDF, qui me donne un *word stream* : la liste de tous les mots de la page avec leurs `bbox` (rectangles en points). Le problème devient : *« trouver la fenêtre `[mot1, mot2, …]` dans cette liste »*. Sauf que le LLM et PyMuPDF tokenisent légèrement différemment, qu'il y a des apostrophes typographiques qui drifent, et que sur les CVs multi-colonnes le LLM hallucine parfois son `context_before`.

D'où quatre stratégies essayées en cascade, chacune absorbant un mode d'échec spécifique de la précédente :

```python
# src/proofreader/locator.py
def locate_mistake(mistake: Mistake, *, words: list[Word]) -> LocatedMistake | None:
    err_tokens = mistake.error_text.split()
    if not err_tokens:
        return None
    ctx_tokens = mistake.context_before.split()

    # Strategy 1: strict whole-word match.
    matched = _match_window(ctx_tokens, err_tokens, words, normalize=False)
    if matched is not None:
        return _build_located(mistake, matched)

    # Strategy 2: punctuation-tolerant (casefold + ASCII quotes + strip punct).
    matched = _match_window(ctx_tokens, err_tokens, words, normalize=True)
    if matched is not None:
        return _build_located(mistake, matched)

    # Strategy 3: error_text alone if it appears exactly once on the page.
    # Catches LLM context drift in multi-column layouts.
    matched = _find_error_alone_if_unique(err_tokens, words)
    if matched is not None:
        return _build_located(mistake, matched)

    # Strategy 4: substring of the concatenated normalised stream. Handles LLM
    # tokenisation drift like `d'une` → `d' + une`, where the standalone word
    # has no PyMuPDF token equivalent.
    matched = _find_error_as_substring_if_unique(err_tokens, words)
    if matched is not None:
        return _build_located(mistake, matched)

    return None
```

Pourquoi cet ordre exact :

1. **Strict.** La fenêtre `context_before + error_text` matche au mot près, sans normalisation. C'est le cas heureux : le LLM cite le PDF parfaitement, on évite les faux positifs. Quand ça marche, on a la confiance maximale.

2. **Tolérant.** Le LLM capitalise le premier mot d'une phrase, ou remplace `'` par `'` (apostrophe typographique). `_normalize` casefold le tout, remappe les guillemets et apostrophes typographiques vers leur version ASCII, et strippe la ponctuation que PyMuPDF colle aux tokens.

3. **Error-only unique.** Sur les CVs en deux colonnes, le `context_before` que le LLM produit est parfois pioché dans la *mauvaise* colonne (les modèles linéarisent maladroitement le multi-colonne). Si l'`error_text` n'apparaît qu'une fois sur la page, on prend, peu importe le contexte. C'est statistiquement sûr.

4. **Substring du stream concaténé.** Cas tordu : `d'une` est un mot pour le LLM, mais PyMuPDF le tokenise en `d'` + `une`. Le LLM peut renvoyer `error_text="une"` comme mot isolé, sans token PyMuPDF correspondant. Solution : concaténer tous les tokens de la page en une seule string et chercher en sous-chaîne. On gate par `_MIN_SUBSTRING_CHARS = 5`, parce que sans ça un `error_text="une"` matche dans `commune`, `lacune`, `tribune`. Bonjour les faux positifs.

Si aucune des quatre ne matche, l'erreur passe dans une section *« Non localisées »* du résultat plutôt que d'être silencieusement perdue. Une erreur visible que l'utilisateur peut lire mais qui n'a pas son rectangle rouge, c'est moins grave qu'une erreur dont on prétend qu'elle est ailleurs.

## Bilan

Anonymiser pour un LLM, ce n'est pas une opération en un coup. C'est un cycle :

1. **Détecter les entités, pas leur format.** Une regex ne suffit pas pour les noms, entreprises ou dates. Il faut un détecteur entraîné.
2. **Pouvoir dé-anonymiser des fragments.** Le LLM ne renvoie pas le texte qu'on lui a donné ; il renvoie des morceaux paraphrasés. Si ton outil ne sait dé-anonymiser qu'un texte entier, tu vas le découvrir à la dure.
3. **Reconnecter le résultat à la source.** Si tu travailles sur des documents (PDF, OCR, scans), le LLM perd les coordonnées. Tu dois les retrouver après coup, et accepter que ce ne sera pas toujours possible.

`piighost` couvre les deux premiers points out of the box. Le troisième est spécifique à mon projet, mais le code est ouvert.

- **piighost** : [github.com/Athroniaeth/piighost](https://github.com/Athroniaeth/piighost), la lib d'anonymisation utilisée ici.
- **piighost-proofreader** : [github.com/Athroniaeth/piighost-proofreader](https://github.com/Athroniaeth/piighost-proofreader), le projet complet, démo en ligne, locator inclus.

Issues et PR bienvenues. Si tu as un pipeline LLM qui touche des documents perso, les trois points ci-dessus vont probablement te concerner. N'hésite pas à ouvrir une discussion.

<!--
SCREENSHOT TODO (avant publication):
1. uv run python samples/build_samples.py
2. uv run streamlit run app.py
3. upload samples/cv_fr.pdf in the UI
4. wait for the run to finish, take a screenshot of the rendered first page with overlays
5. upload the screenshot to dev.to (drag-and-drop in the editor — Forem hosts it)
6. replace the placehold.co URL above with the dev.to-hosted URL
7. (optional) take a second screenshot of the "Non localisées" section for the end of section 3 — same upload flow
-->
