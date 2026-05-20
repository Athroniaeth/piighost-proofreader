"""Shared test fixtures."""
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SAMPLES_DIR = REPO_ROOT / "samples"


@pytest.fixture
def samples_dir() -> Path:
    return SAMPLES_DIR
