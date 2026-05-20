"""Tests for the Mistake / ProofreadResult schema."""
import pytest
from pydantic import ValidationError

from proofreader.models import Mistake, ProofreadResult


def test_mistake_minimal_fields():
    m = Mistake(
        error_text="exemple",
        correction="exemples",
        description="Le pluriel manque.",
        type="accord",
        context_before="voici un",
    )
    assert m.type == "accord"
    assert m.context_before == "voici un"


def test_mistake_rejects_unknown_type():
    with pytest.raises(ValidationError):
        Mistake(
            error_text="exemple",
            correction="exemples",
            description="x",
            type="not_a_real_type",
            context_before="x",
        )


def test_proofread_result_holds_list():
    result = ProofreadResult(
        mistakes=[
            Mistake(
                error_text="a",
                correction="à",
                description="accent grave manquant",
                type="orthographe",
                context_before="il va",
            )
        ]
    )
    assert len(result.mistakes) == 1
