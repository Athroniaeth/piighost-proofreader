import { useMemo, useState } from "react";
import { applyOverrides } from "@/lib/overrides";
import { useLabels } from "@/hooks/useLabels";
import type { AppAction } from "@/hooks/useAppState";
import type { PageDetection, PageSize } from "@/lib/types";
import PdfPanel from "./PdfPanel";
import DetectionsPanel from "./DetectionsPanel";
import LabelPickerModal from "./LabelPickerModal";
import ReviewTopBar from "./ReviewTopBar";
import StepIndicator from "./StepIndicator";

interface Props {
  filename: string;
  pdfBytes: Uint8Array;
  page_sizes: PageSize[];
  detections: PageDetection[];
  pendingOverrides: import("@/lib/types").OverrideEntry[];
  dispatch: (action: AppAction) => void;
}

interface PickerState {
  open: boolean;
  initialText: string;
  page?: number;
  bbox?: [number, number, number, number];
}

export default function ReviewState({
  filename, pdfBytes, page_sizes, detections, pendingOverrides, dispatch,
}: Props) {
  const labelsState = useLabels();
  const finalDetections = useMemo(
    () => applyOverrides(detections, pendingOverrides),
    [detections, pendingOverrides]
  );
  const autoCount = finalDetections.filter((d) => !d.manual).length;
  const manualCount = finalDetections.filter((d) => d.manual).length;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [picker, setPicker] = useState<PickerState>({ open: false, initialText: "" });

  return (
    <div className="min-h-screen flex flex-col max-w-[1280px] mx-auto px-3 sm:px-4 lg:px-6 py-6 lg:py-8">
      <StepIndicator current={1} />
      <ReviewTopBar
        filename={filename}
        autoCount={autoCount}
        manualCount={manualCount}
        onCancel={() => dispatch({ type: "RESET" })}
        onValidate={() => dispatch({ type: "REVIEW_SUBMIT" })}
      />
      <div className="lg:flex-1 flex flex-col lg:flex-row gap-4 lg:min-h-0">
        <div className="lg:flex-[2] overflow-y-auto bg-background-50 border border-base-100 rounded-xl p-4 min-h-[60vh] lg:min-h-0">
          <PdfPanel
            pdfBytes={pdfBytes}
            pageSizes={page_sizes}
            variant="detection"
            enableTextLayer
            onTextSelection={(t, hint) =>
              setPicker({ open: true, initialText: t, page: hint?.page, bbox: hint?.bbox })
            }
            items={finalDetections.map((d) => ({ kind: "detection" as const, d }))}
            activeIndex={activeIndex}
          />
        </div>
        <div className="lg:flex-1 overflow-y-auto bg-background-50 border border-base-100 rounded-xl p-5 min-h-[40vh] lg:min-h-0">
          <DetectionsPanel
            detections={finalDetections}
            labels={labelsState.labels}
            activeIndex={activeIndex}
            onActivate={(i) => setActiveIndex(i === activeIndex ? null : i)}
            onRemove={(d) =>
              dispatch({ type: "OVERRIDE_REMOVE_DETECTION", detection: d })
            }
            onRelabel={(d, newLabel) =>
              dispatch({ type: "OVERRIDE_RELABEL", detection: d, newLabel })
            }
          />
        </div>
      </div>
      <LabelPickerModal
        open={picker.open}
        initialText={picker.initialText}
        labels={labelsState.labels}
        onPick={(text, label) => {
          dispatch({
            type: "OVERRIDE_ADD",
            text,
            label,
            page: picker.page,
            bbox: picker.bbox,
          });
          setPicker({ open: false, initialText: "" });
        }}
        onClose={() => setPicker({ open: false, initialText: "" })}
      />
    </div>
  );
}
