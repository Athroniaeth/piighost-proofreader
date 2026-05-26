---
title: "Comment laisser GPT-5.5 corriger un CV sans jamais lui montrer un seul nom"
published: false
description: "Un proofreader de CV qui n'envoie aucune PII au LLM, et qui replace pourtant ses corrections au bon endroit dans le PDF. Trois écueils techniques rencontrés en route."
tags: python, llm, privacy, pdf
canonical_url:
cover_image:
---

## TL;DR

Un proofreader de CV doit comprendre du texte (donc parler à un LLM) **et** ne jamais exposer les données perso de la personne. C'est la tension que ce projet — `piighost-proofreader` — résout.

Le pipeline fait quatre choses dans l'ordre :

```mermaid
flowchart LR
  PDF[PDF du CV] --> Markdown
  Markdown -->|anonymise + thread_id| Anon[Markdown anonymisé]
  Anon --> LLM[GPT-5.5]
  LLM --> Mistakes[Erreurs avec placeholders]
  Mistakes -->|deanonymize_entities| Clear[Erreurs en clair]
  Clear -->|locator + PyMuPDF bbox| PDF2[PDF + overlays rouges]
```

> 📸 *(screenshot du rendu final ici — voir Task 8)*

Le LLM ne voit jamais un seul nom, une seule date de naissance, un seul employeur. À la sortie, les corrections atterrissent au bon mot sur le bon PDF.

Et entre les deux, j'ai dû résoudre trois trucs vicieux. C'est l'objet de cet article.

<!-- Section 1 — La promesse naïve -->

<!-- Section 2 — Le piège deanonymize entities -->

<!-- Section 3 — Le locator -->

<!-- Section 4 — Bilan + CTA -->
