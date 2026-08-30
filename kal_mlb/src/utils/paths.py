"""Path helpers for the KAL project."""

from pathlib import Path

# Project root = kal_mlb/
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def get_raw_dir() -> Path:
    return PROJECT_ROOT / "data" / "raw"


def get_processed_dir() -> Path:
    return PROJECT_ROOT / "data" / "processed"


def get_predictions_dir() -> Path:
    return PROJECT_ROOT / "data" / "predictions"


def get_results_dir() -> Path:
    return PROJECT_ROOT / "data" / "results"


def get_models_dir() -> Path:
    return PROJECT_ROOT / "data" / "models"


def get_config_path() -> Path:
    return PROJECT_ROOT / "config" / "settings.yaml"
