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
  topbar_new_pdf: "↻ Nouveau PDF",
  topbar_streaming: "{n} fautes · en cours…",
  topbar_no_mistakes: "aucune faute",
  review_cancel: "Annuler",
  review_analyze_button: "Analyser le CV →",
  review_entities_badge: "{n} entité(s) à anonymiser",
  error_too_large_title: "Fichier trop volumineux",
  error_too_large_body: "{sizeMb} Mo · limite 10 Mo",
  error_not_pdf_title: "Format non supporté",
  error_not_pdf_body: "Uniquement les fichiers PDF sont acceptés.",
  error_no_text_layer_title: "PDF non lisible",
  error_no_text_layer_body:
    "Aucun texte trouvé. Le PDF semble être un scan, l'OCR n'est pas supporté.",
  error_backend_down_title: "Service indisponible",
  error_backend_down_body:
    "Réessayez dans quelques instants. Si ça persiste, signalez sur GitHub.",
  error_rate_limit_title: "Trop de requêtes",
  error_rate_limit_body:
    "Quota atteint pour cette IP. Réessayez dans {retryInSec} secondes.",
  error_internal_title: "Erreur interne",
  error_internal_body: "Une erreur inattendue s'est produite.",
  error_choose_another_file: "Choisir un autre fichier",
  error_try_another_pdf: "Essayer un autre PDF",
  error_retry_button: "Réessayer",
  error_back_button: "Retour",
  detections_title: "Anonymisation des données",
  detections_intro_before:
    "Vos données personnelles ont été détectées et seront anonymisées avant l'envoi au modèle d'analyse. Si une donnée à protéger a été oubliée, ",
  detections_intro_bold: "sélectionnez-la directement sur le PDF",
  detections_intro_after: " pour l'ajouter à la liste.",
  detections_help:
    "En cas d'erreur, cliquez la croix de la carte concernée pour la retirer, ou son label pour changer de catégorie.",
  detections_empty_title: "Aucune entité détectée",
  detections_empty_body:
    "piighost-api n'a rien repéré. Sélectionnez du texte sur le PDF pour anonymiser manuellement.",
  detections_manual_badge: "manuel",
  detections_remove: "Retirer cette détection",
};
