"""One-time/idempotent cleanup for the bad prediction-history window.

The August 2–29, 2026 records were known to contain bad grading/prediction
history. They must not be visible to the API or used by tracking/retraining.
This script runs before uvicorn on every container start and is intentionally
idempotent.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

ROOT = Path("/app")
DATA = ROOT / "kal_mlb" / "data"
SEED = ROOT / "seed_kal_data"
START = date(2026, 8, 2)
END = date(2026, 8, 29)


def in_bad_window(value: object) -> bool:
    try:
        d = date.fromisoformat(str(value)[:10])
        return START <= d <= END
    except (TypeError, ValueError):
        return False


def clean_prediction_files(base: Path) -> int:
    removed = 0
    pred_dir = base / "predictions"
    if not pred_dir.exists():
        return 0
    for p in pred_dir.glob("preds_*"):
        # File names are preds_YYYY-MM-DD.ext; only delete exact dates in range.
        day = p.stem.replace("preds_", "")[:10]
        if in_bad_window(day):
            try:
                p.unlink()
                removed += 1
            except FileNotFoundError:
                pass
    return removed


def filter_graded_file(path: Path) -> int:
    if not path.exists():
        return 0
    try:
        if path.suffix == ".json":
            rows = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(rows, list):
                return 0
            kept = [r for r in rows if not in_bad_window(r.get("game_date"))]
            removed = len(rows) - len(kept)
            if removed:
                path.write_text(json.dumps(kept, ensure_ascii=False, indent=2), encoding="utf-8")
            return removed

        import pandas as pd
        df = pd.read_feather(path) if path.suffix == ".feather" else pd.read_csv(path)
        if "game_date" not in df.columns:
            return 0
        mask = df["game_date"].map(in_bad_window)
        removed = int(mask.sum())
        if removed:
            kept = df.loc[~mask].copy()
            if path.suffix == ".feather":
                kept.to_feather(path)
            else:
                kept.to_csv(path, index=False)
        return removed
    except Exception as exc:
        print(f"reset-history: could not filter {path}: {exc}")
        return 0


def clean_tree(base: Path) -> dict[str, int]:
    counts = {"predictions": clean_prediction_files(base), "graded": 0}
    results = base / "results"
    counts["graded"] += filter_graded_file(results / "graded_predictions.json")
    counts["graded"] += filter_graded_file(results / "graded_predictions.feather")
    counts["graded"] += filter_graded_file(results / "graded_predictions.csv")

    # Force the panel/retrain checks to be rebuilt from the cleaned prediction set.
    for name in ("tracking_panel.json", "last_retrain_check.json"):
        p = results / name
        try:
            p.unlink()
        except FileNotFoundError:
            pass
    return counts


def main() -> None:
    # Clean the persistent volume and the image seed so bootstrap cannot restore
    # the deleted bad dates on the next API startup.
    total = {"predictions": 0, "graded": 0}
    for base in (DATA, SEED):
        c = clean_tree(base)
        total["predictions"] += c["predictions"]
        total["graded"] += c["graded"]
    print(f"reset-history: removed {total['predictions']} prediction files and {total['graded']} graded rows from 2026-08-02..2026-08-29")


if __name__ == "__main__":
    main()
