import type { ProofreadResult } from "@/lib/types";
import { Button } from "@/components/tailgrids/core/button";

interface Props {
  data: ProofreadResult;
}

export default function DebugPanel({ data }: Props) {
  const downloadDump = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const slug = data.thread_id?.slice(0, 8) ?? "fake";
    a.download = `proofreader-dump-${slug}.json`;
    a.click();
  };

  return (
    <aside className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-12 pb-12">
      <div className="bg-background-50 border border-base-100 rounded-xl p-5 mt-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Debug</h2>
          <Button variant="primary" appearance="outline" size="sm" onClick={downloadDump}>
            Télécharger le dump (JSON)
          </Button>
        </div>
        <p className="text-xs text-text-100 mb-3">
          language={data.language} · pages={data.page_count} · mistakes=
          {data.mistakes.length}
          {data.thread_id ? ` · thread_id=${data.thread_id}` : ""}
        </p>
        <details className="mb-2">
          <summary className="text-xs font-semibold cursor-pointer">
            Markdown extrait
          </summary>
          <pre className="text-[11px] bg-background-soft-50 p-2 mt-1 rounded overflow-auto max-h-60 whitespace-pre-wrap">
            {data.markdown_raw ?? "—"}
          </pre>
        </details>
        <details className="mb-2">
          <summary className="text-xs font-semibold cursor-pointer">
            Markdown anonymisé (envoyé au LLM)
          </summary>
          <pre className="text-[11px] bg-background-soft-50 p-2 mt-1 rounded overflow-auto max-h-60 whitespace-pre-wrap">
            {data.markdown_anonymized ?? "—"}
          </pre>
        </details>
        <details className="mb-2">
          <summary className="text-xs font-semibold cursor-pointer">
            Fautes (JSON)
          </summary>
          <pre className="text-[11px] bg-background-soft-50 p-2 mt-1 rounded overflow-auto max-h-60">
            {JSON.stringify(data.mistakes, null, 2)}
          </pre>
        </details>
        <details>
          <summary className="text-xs font-semibold cursor-pointer">
            Word stream (PyMuPDF)
          </summary>
          <pre className="text-[11px] bg-background-soft-50 p-2 mt-1 rounded overflow-auto max-h-60">
            {JSON.stringify(data.word_stream ?? [], null, 2)}
          </pre>
        </details>
      </div>
    </aside>
  );
}
