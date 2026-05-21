import { useEffect, useState } from "react";
import { Button } from "@/components/tailgrids/core/button";

interface Props {
  open: boolean;
  text: string;
  labels: string[];
  onPick: (label: string) => void;
  onClose: () => void;
}

export default function LabelPickerModal({
  open, text, labels, onPick, onClose,
}: Props) {
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (open) setSelected("");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground-100/50"
      onClick={onClose}
    >
      <div
        className="bg-background-50 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-2">Anonymiser comme&nbsp;:</h3>
        <p className="bg-background-soft-50 rounded p-2 text-sm mb-4 break-words">
          {text}
        </p>
        <div className="max-h-48 overflow-y-auto mb-4 space-y-1">
          {labels.map((label) => (
            <label
              key={label}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-background-soft-50 cursor-pointer"
            >
              <input
                type="radio"
                name="label"
                value={label}
                checked={selected === label}
                onChange={() => setSelected(label)}
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="primary" appearance="outline" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            appearance="fill"
            size="sm"
            onClick={() => selected && onPick(selected)}
            disabled={!selected}
          >
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  );
}
