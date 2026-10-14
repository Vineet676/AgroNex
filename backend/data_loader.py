"""Validated sample data loader used by tests and local scripts."""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"


def load_dataset(directory: Path = DATA_DIR) -> dict:
    data = {}
    for name in ("inventory", "destinations", "transport"):
        with (directory / f"{name}.json").open(encoding="utf-8") as file:
            data[name] = json.load(file)
        if not isinstance(data[name], list):
            raise ValueError(f"{name}.json must contain a JSON array")
    ids = [b["batch_id"] for b in data["inventory"]]
    if len(ids) != len(set(ids)):
        raise ValueError("batch_id values must be unique")
    return data
