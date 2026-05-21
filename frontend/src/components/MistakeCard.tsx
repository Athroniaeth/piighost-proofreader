import type { LocatedMistake } from "@/lib/types";
import { Checkbox } from "@/components/tailgrids/core/checkbox";

interface Props {
  mistake: LocatedMistake;
  enabled: boolean;
  active: boolean;
  onToggle: () => void;
  onActivate: () => void;
}

export default function MistakeCard({
  mistake,
  enabled,
  active,
  onToggle,
  onActivate,
}: Props) {
  const ring = active
    ? "border border-amber-200 bg-amber-50"
    : "border border-base-100 bg-background-50";
  const opacity = enabled ? "" : "opacity-60 bg-background-soft-50";
  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        if (!enabled) return;
        onActivate();
      }}
      className={`flex items-start gap-3 p-3 rounded-lg mb-2 cursor-pointer transition-colors ${ring} ${opacity}`}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={enabled} onChange={onToggle} />
      </div>
      <div className="flex-1 text-xs min-w-0">
        <div className="break-words leading-snug">
          <s>{mistake.error_text}</s>
          <span className="text-text-200"> → </span>
          <b>{mistake.correction}</b>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-text-100 text-[11px] leading-snug flex-1">
            {mistake.description}
          </div>
          <div className="text-text-200 text-[10px] flex-shrink-0 italic">
            {mistake.type}
          </div>
        </div>
      </div>
    </div>
  );
}
