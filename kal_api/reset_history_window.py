"""Repair the prediction history window without touching MLB/Statcast data.

Required state:
- remove ONLY prediction/history records dated 2026-09-01 and 2026-09-02
- keep/re-register 2026-08-29 and 2026-08-30
- keep 2026-09-03 and future predictions
- never wipe the volume or unrelated raw/model data

This runs at container start because Railway Volumes are mounted at runtime.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path("/app")
DATA = ROOT / "kal_mlb" / "data"
SEED = ROOT / "seed_kal_data"
ARCHIVE = DATA / "results" / "archive_before_reset_20260903"

DELETE_START = date(2026, 9, 1)
DELETE_END = date(2026, 9, 2)
KEEP_START = date(2026, 8, 29)
KEEP_END = date(2026, 8, 30)


def day_of(value: object) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def in_delete_window(value: object) -> bool:
    d = day_of(value)
    return d is not None and DELETE_START <= d <= DELETE_END


def is_keep_day(value: object) -> bool:
    d = day_of(value)
    return d is not None and KEEP_START <= d <= KEEP_END


def read_json(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception as exc:
        print(f"history-repair: could not read {path}: {exc}")
        return []


def write_prediction_formats(rows: list[dict], day: str) -> None:
    if not rows:
        return
    pred_dir = DATA / "predictions"
    pred_dir.mkdir(parents=True, exist_ok=True)
    # Do not deduplicate by game_pk here: the preserved Aug 30 archive contains
    # 19 records that must all be re-registered exactly as preserved.
    df = pd.DataFrame(rows)
    df.to_csv(pred_dir / f"preds_{day}.csv", index=False)
    df.to_json(pred_dir / f"preds_{day}.json", orient="records", date_format="iso")
    try:
        df.to_feather(pred_dir / f"preds_{day}.feather")
    except Exception as exc:
        print(f"history-repair: feather write skipped for {day}: {exc}")


def clean_prediction_files() -> int:
    removed = 0
    pred_dir = DATA / "predictions"
    if not pred_dir.exists():
        return 0
    for p in pred_dir.glob("preds_*"):
        if in_delete_window(p.stem.replace("preds_", "")[:10]):
            try:
                p.unlink()
                removed += 1
            except FileNotFoundError:
                pass
    # Also clean the image seed so a restart cannot reintroduce Sep 1-2.
    seed_pred = SEED / "predictions"
    if seed_pred.exists():
        for p in seed_pred.glob("preds_*"):
            if in_delete_window(p.stem.replace("preds_", "")[:10]):
                try:
                    p.unlink()
                    removed += 1
                except FileNotFoundError:
                    pass
    return removed


def load_current_history() -> list[dict]:
    return [r for r in read_json(DATA / "results" / "graded_predictions.json") if not in_delete_window(r.get("game_date"))]


def archive_rows_for(day: str) -> list[dict]:
    rows = read_json(ARCHIVE / "graded_predictions.json")
    return [r for r in rows if str(r.get("game_date") or "")[:10] == day]


def restore_aug29_from_seed() -> list[dict]:
    src = SEED / "predictions" / "preds_2026-08-29.csv"
    if not src.exists():
        return []
    try:
        df = pd.read_csv(src)
        if "game_date" not in df.columns:
            return []
        df["game_date"] = df["game_date"].astype(str).str[:10]
        rows = df[df["game_date"] == "2026-08-29"].to_dict(orient="records")
        write_prediction_formats(rows, "2026-08-29")
        return rows
    except Exception as exc:
        print(f"history-repair: could not restore Aug 29: {exc}")
        return []


def rebuild_aug30_from_archive() -> list[dict]:
    rows = archive_rows_for("2026-08-30")
    if rows:
        write_prediction_formats(rows, "2026-08-30")
    return rows


def merge_history(rows: list[dict]) -> list[dict]:
    # Deduplicate only exact prediction IDs. Do NOT deduplicate by game_pk:
    # the requirement is to preserve/register every valid archived record.
    out: list[dict] = []
    seen_pred: set[str] = set()
    for r in rows:
        pid = str(r.get("prediction_id") or "")
        if pid and pid in seen_pred:
            continue
        if pid:
            seen_pred.add(pid)
        out.append(r)
    return out


def persist_history(rows: list[dict]) -> None:
    results = DATA / "results"
    results.mkdir(parents=True, exist_ok=True)
    path = results / "graded_predictions.json"
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    df = pd.DataFrame(rows)
    if not df.empty:
        try:
            df.to_feather(results / "graded_predictions.feather")
        except Exception as exc:
            print(f"history-repair: graded feather write skipped: {exc}")
        df.to_csv(results / "graded_predictions.csv", index=False)


def main() -> None:
    removed_files = clean_prediction_files()

    # Keep Sep 3/current history, while removing only Sep 1-2.
    current = load_current_history()

    # Re-register the valid Aug 29 predictions from the preserved seed.
    aug29 = restore_aug29_from_seed()

    # Re-register all preserved Aug 30 predictions from the pre-reset archive.
    aug30 = rebuild_aug30_from_archive()

    merged = merge_history(current + aug29 + aug30)
    persist_history(merged)

    # Force the live API/tracking layer to recalculate from the repaired set.
    for name in ("tracking_panel.json", "last_retrain_check.json"):
        try:
            (DATA / "results" / name).unlink()
        except FileNotFoundError:
            pass

    print(
        "history-repair: removed only 2026-09-01..2026-09-02; "
        f"restored Aug29={len(aug29)}, Aug30={len(aug30)}; "
        f"history_rows={len(merged)}; prediction_files_removed={removed_files}"
    )


if __name__ == "__main__":
    main()
