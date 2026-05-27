export const en = {
  app_name: "ProofReader",
  empty_tagline:
    "Drop a PDF; the LLM flags spelling, grammar, agreement, conjugation and punctuation.",
  empty_dropzone_title: "Drag the CV PDF here or click to browse",
  empty_dropzone_hint: "PDF only · 10 MB max · text (not a scan)",
  empty_browse_button: "Browse my files",
  empty_privacy_note:
    "🔒 No personal data leaves your process. Your CV content is anonymized through piighost-api before being sent to the language model.",
  empty_github_title: "GitHub source code",
  loading_title: "Analysis in progress…",
  loading_eta: "≈ 10 seconds for a one-page CV",
  loading_steps_default: "Extracting text · Anonymizing · Detecting mistakes",
  loading_steps_detect: "Extracting text · Detecting PII",
  loading_steps_proofread: "Anonymizing · Starting analysis",
  mistake_one: "{n} mistake",
  mistake_other: "{n} mistakes",
  entity_one: "{n} entity",
  entity_other: "{n} entities",
} as const;
