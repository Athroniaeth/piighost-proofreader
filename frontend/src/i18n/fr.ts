import type { TranslationKey } from "./types";

export const fr: Record<TranslationKey, string> = {
  app_name: "ProofReader",
  empty_tagline:
    "Glissez un PDF, le LLM repère orthographe, grammaire, accord, conjugaison et ponctuation.",
  empty_dropzone_title: "Glissez le PDF du CV ou cliquez pour parcourir",
  empty_dropzone_hint: "PDF uniquement · 10 Mo max · texte (pas un scan)",
  empty_browse_button: "Parcourir mes fichiers",
  empty_privacy_note:
    "🔒 Aucune donnée personnelle ne sort de votre processus. Le contenu de votre CV est anonymisé via piighost-api avant d'être envoyé au modèle de langage.",
  empty_github_title: "Code source GitHub",
  loading_title: "Analyse en cours…",
  loading_eta: "≈ 10 secondes pour un CV d'une page",
  loading_steps_default: "Extraction du texte · Anonymisation · Détection des fautes",
  loading_steps_detect: "Extraction du texte · Détection des PII",
  loading_steps_proofread: "Anonymisation · Lancement de l'analyse",
  mistake_one: "{n} faute",
  mistake_other: "{n} fautes",
  entity_one: "{n} entité",
  entity_other: "{n} entités",
};
