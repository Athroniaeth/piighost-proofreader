import { useEffect, useRef, useState } from "react";

interface State {
  labels: string[];
  loading: boolean;
}

// piighost-api's /v1/config can return `labels: null` when the pipeline
// uses regex detectors (no static label registry). Falling back to a
// list of common PII labels lets the manual-override UI work anyway.
const DEFAULT_LABELS = [
  "PERSON",
  "ORGANIZATION",
  "LOCATION",
  "EMAIL",
  "PHONE",
  "URL",
  "IP_ADDRESS",
  "IBAN",
  "CREDIT_CARD",
  "DATE",
  "ID_NUMBER",
];

export function useLabels(): State {
  const [state, setState] = useState<State>({ labels: DEFAULT_LABELS, loading: true });
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    (async () => {
      try {
        const r = await fetch("/api/labels");
        if (!r.ok) {
          setState({ labels: DEFAULT_LABELS, loading: false });
          return;
        }
        const body = await r.json();
        const fetched = (body.labels as string[] | null | undefined) ?? [];
        // Merge backend labels with defaults so the user always has something
        // to pick. Backend labels first, defaults appended (no duplicates).
        const merged = [...fetched, ...DEFAULT_LABELS.filter((l) => !fetched.includes(l))];
        setState({ labels: merged, loading: false });
      } catch {
        setState({ labels: DEFAULT_LABELS, loading: false });
      }
    })();
  }, []);
  return state;
}
