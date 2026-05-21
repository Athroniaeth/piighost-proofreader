import { Badge } from "@/components/tailgrids/core/badge";
import { Button } from "@/components/tailgrids/core/button";

interface Props {
  filename: string;
  mistakeCount: number;
  onReset: () => void;
}

export default function TopBar({ filename, mistakeCount, onReset }: Props) {
  return (
    <div className="flex items-center justify-between bg-background-50 border border-base-100 rounded-xl px-5 py-3 mb-5">
      <div className="flex items-center gap-3">
        <span className="font-semibold">{filename}</span>
        {mistakeCount === 0 ? (
          <Badge color="success" size="sm">aucune faute</Badge>
        ) : (
          <Badge color="primary" size="sm">{mistakeCount} fautes</Badge>
        )}
      </div>
      <Button variant="primary" appearance="outline" size="sm" onClick={onReset}>
        ↻ Nouveau PDF
      </Button>
    </div>
  );
}
