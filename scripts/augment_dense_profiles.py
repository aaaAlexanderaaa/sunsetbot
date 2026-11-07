#!/usr/bin/env python3
"""Add dense ERA5 pressure fields while preserving the frozen case controls."""
import json
from pathlib import Path

import numpy as np

from reanalysis_grib import GribArchive, PARAMETERS, STANDARD_GRAVITY, file_hash

ROOT = Path(__file__).resolve().parents[1]


def main():
    base = ROOT / "research/backtests/shanghai-era5-input-2023-06"
    manifest = json.loads((base / "manifest.json").read_text())
    cases = []
    wanted = set()
    for item in manifest["cases"]:
        path = base / item["file"]
        if file_hash(path) != item["sha256"]:
            raise ValueError("frozen base bundle failed integrity check")
        case = json.loads(path.read_text())
        cases.append((path, case))
        wanted.update(case["era5Weather"][0]["hourly"]["time"])
    directory = ROOT / "var/reanalysis/dense-development"
    archive = GribArchive(directory.glob("*.grib"), {param: wanted for param in PARAMETERS})
    grids = [{pressure for param, time, pressure in archive.fields if param == 248 and time == when} for when in sorted(wanted)]
    if not grids or len(grids[0]) != 37 or any(levels != grids[0] for levels in grids):
        raise ValueError("dense ERA5 pressure/time coverage is incomplete")
    levels = sorted(grids[0], reverse=True)
    output = ROOT / "research/experiments/cloud-column-dense-inputs"
    output.mkdir(parents=True, exist_ok=True)
    receipts = []
    for path, base_case in cases:
        rows = json.loads(json.dumps(base_case["era5Weather"]))
        times = rows[0]["hourly"]["time"]
        points = base_case["points"]
        coarse = set(base_case["nativeDiagnostics"]["pressureHpa"])
        for pressure in levels:
            clouds, heights = [], []
            for when in times:
                cloud, selected = archive.sample(248, when, pressure, points)
                z, height_grid = archive.sample(129, when, pressure, points)
                if selected != base_case["selectedGrids"]["era5"] or selected != height_grid:
                    raise ValueError("dense and frozen grids differ")
                clouds.append(100 * cloud)
                heights.append(z / STANDARD_GRAVITY)
            for index, row in enumerate(rows):
                cc, height = f"cloud_cover_{pressure}hPa", f"geopotential_height_{pressure}hPa"
                cover_values = [float(v[index]) for v in clouds]
                height_values = [float(v[index]) for v in heights]
                if pressure in coarse:
                    if not (np.allclose(cover_values, row["hourly"][cc], rtol=0, atol=1e-10)
                            and np.allclose(height_values, row["hourly"][height], rtol=0, atol=1e-9)):
                        raise ValueError("dense acquisition changed an overlapping coarse field")
                row["hourly"][cc], row["hourly"][height] = cover_values, height_values
                row["hourly_units"][cc], row["hourly_units"][height] = "%", "m"
        record = {"base": {"file": str(path.relative_to(ROOT)), "sha256": file_hash(path)},
                  "pressureHpa": levels, "coarseOverlapMatches": True, "denseEra5Weather": rows,
                  "scope": "Only pressure density changes; all native-layer baseline/terrain/rain/visibility fields retain the exact base values."}
        target = output / path.name
        target.write_text(json.dumps(record, separators=(",", ":"), allow_nan=False) + "\n")
        receipts.append({"file": target.name, "sha256": file_hash(target)})
        print("Dense input", target.name, flush=True)
    (output / "manifest.json").write_text(json.dumps({"pressureHpa": levels, "cases": receipts,
        "raw": [{**r, "file": Path(r["file"]).name} for r in archive.receipts]}, indent=2) + "\n")


if __name__ == "__main__":
    main()
