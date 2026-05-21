"""Override logic for HITL anonymisation review.

Given the initial detections from piighost-api and a list of user
edits (add / remove / relabel), produce the final detections list to
push back via override_detections().
"""

from pydantic import BaseModel


class OverrideEntry(BaseModel):
    text: str
    label: str
    remove: bool = False


def _find_all_occurrences(needle: str, haystack: str) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    start = 0
    while True:
        idx = haystack.find(needle, start)
        if idx == -1:
            return out
        out.append((idx, idx + len(needle)))
        start = idx + 1


def apply_overrides(
    initial: list[dict], overrides: list[OverrideEntry], *, markdown: str
) -> list[dict]:
    """Apply the user-edited overrides to the initial detections list.

    - Removes are matched on (text, label). All matching initial detections
      are filtered out.
    - Adds expand to one detection per occurrence of `text` found in markdown.
    """
    remove_keys = {
        (o.text, o.label) for o in overrides if o.remove
    }
    kept = [
        d for d in initial if (d["text"], d["label"]) not in remove_keys
    ]
    added: list[dict] = []
    for o in overrides:
        if o.remove:
            continue
        for start, end in _find_all_occurrences(o.text, markdown):
            added.append(
                {
                    "text": o.text,
                    "label": o.label,
                    "start_pos": start,
                    "end_pos": end,
                    "confidence": 1.0,
                }
            )
    return kept + added
