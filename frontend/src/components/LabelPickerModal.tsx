import { useEffect, useState } from "react";
import { Button } from "@/components/tailgrids/core/button";
import { useT } from "@/i18n/LanguageContext";

interface Props {
  open: boolean;
  /** Initial value of the text input. Empty when opening from the
   *  "+ Ajouter" button, pre-filled when opening from a PDF selection. */
  initialText: string;
  labels: string[];
  onPick: (text: string, label: string) => void;
  onClose: () => void;
}

export default function LabelPickerModal({
  open, initialText, labels, onPick, onClose,
}: Props) {
  const { t } = useT();
  const [text, setText] = useState<string>("");
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setSelected(labels[0] ?? "");
  }, [open, initialText, labels]);

  if (!open) return null;

  const canSubmit = text.trim().length >= 2 && selected.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground-100/50"
      onClick={onClose}
    >
      <div
        className="bg-background-50 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-2">
          {t("modal_title")}
        </h3>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("modal_input_placeholder")}
          className="w-full bg-background-soft-50 border border-base-100 rounded p-2 text-sm mb-1 focus:outline-none focus:border-primary-500"
          autoFocus
        />
        <p className="text-[11px] text-text-200 italic mb-4">
          {t("modal_all_occurrences_note")}
        </p>
        <h3 className="text-sm font-semibold mb-2">{t("modal_label_heading")}</h3>
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
            {t("modal_cancel")}
          </Button>
          <Button
            variant="primary"
            appearance="fill"
            size="sm"
            onClick={() => canSubmit && onPick(text.trim(), selected)}
            disabled={!canSubmit}
          >
            {t("modal_add_button")}
          </Button>
        </div>
      </div>
    </div>
  );
}
