import { Badge } from "@/components/tailgrids/core/badge";
import { Button } from "@/components/tailgrids/core/button";

interface Props {
  filename: string;
  count: number;
  onCancel: () => void;
  onValidate: () => void;
}

export default function ReviewTopBar({
  filename, count, onCancel, onValidate,
}: Props) {
  return (
    <div className="flex items-center justify-between bg-background-50 border border-base-100 rounded-xl px-5 py-3 mb-5">
      <div className="flex items-center gap-3">
        <span className="font-semibold">{filename}</span>
        <Badge color="primary" size="sm">{count} entités à anonymiser</Badge>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" appearance="outline" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button variant="primary" appearance="fill" size="sm" onClick={onValidate}>
          Valider et analyser
        </Button>
      </div>
    </div>
  );
}
