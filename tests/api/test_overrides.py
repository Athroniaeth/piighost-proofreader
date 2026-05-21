"""Tests for apply_overrides pure logic."""

from proofreader.api.overrides import OverrideEntry, apply_overrides


INITIAL = [
    {"text": "Pierre", "label": "PERSON", "start_pos": 0, "end_pos": 6, "confidence": 0.99},
    {"text": "Lyon", "label": "LOCATION", "start_pos": 30, "end_pos": 34, "confidence": 0.88},
]
MARKDOWN = "Pierre travaille à Lyon. Pierre est ingénieur. Et Acme corp."


def test_no_overrides_returns_initial():
    assert apply_overrides(INITIAL, [], markdown=MARKDOWN) == INITIAL


def test_add_override_finds_all_occurrences():
    out = apply_overrides(
        INITIAL,
        [OverrideEntry(text="Acme corp", label="ORG")],
        markdown=MARKDOWN,
    )
    added = [d for d in out if d["label"] == "ORG"]
    assert len(added) == 1
    assert added[0]["text"] == "Acme corp"
    assert MARKDOWN[added[0]["start_pos"]:added[0]["end_pos"]] == "Acme corp"


def test_add_override_with_multiple_occurrences():
    out = apply_overrides(
        INITIAL,
        [OverrideEntry(text="Pierre", label="PERSON_OVERRIDE")],
        markdown=MARKDOWN,
    )
    added = [d for d in out if d["label"] == "PERSON_OVERRIDE"]
    assert len(added) == 2
    assert MARKDOWN[added[0]["start_pos"]:added[0]["end_pos"]] == "Pierre"
    assert MARKDOWN[added[1]["start_pos"]:added[1]["end_pos"]] == "Pierre"


def test_remove_override_filters_matching_initial():
    out = apply_overrides(
        INITIAL,
        [OverrideEntry(text="Pierre", label="PERSON", remove=True)],
        markdown=MARKDOWN,
    )
    assert all(d["text"] != "Pierre" for d in out)
    assert any(d["text"] == "Lyon" for d in out)


def test_remove_override_with_no_match_is_noop():
    out = apply_overrides(
        INITIAL,
        [OverrideEntry(text="Nope", label="PERSON", remove=True)],
        markdown=MARKDOWN,
    )
    assert out == INITIAL


def test_relabel_via_remove_then_add():
    out = apply_overrides(
        INITIAL,
        [
            OverrideEntry(text="Pierre", label="PERSON", remove=True),
            OverrideEntry(text="Pierre", label="EMPLOYEE"),
        ],
        markdown=MARKDOWN,
    )
    assert all(d["label"] != "PERSON" or d["text"] != "Pierre" for d in out)
    employees = [d for d in out if d["label"] == "EMPLOYEE"]
    assert len(employees) == 2
