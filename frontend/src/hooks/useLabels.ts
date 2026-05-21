import { useEffect, useRef, useState } from "react";

interface State {
  labels: string[];
  loading: boolean;
}

export function useLabels(): State {
  const [state, setState] = useState<State>({ labels: [], loading: true });
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    (async () => {
      try {
        const r = await fetch("/api/labels");
        if (!r.ok) {
          setState({ labels: [], loading: false });
          return;
        }
        const body = await r.json();
        setState({ labels: body.labels ?? [], loading: false });
      } catch {
        setState({ labels: [], loading: false });
      }
    })();
  }, []);
  return state;
}
