#!/usr/bin/env python3
"""Compare 11/37-level ERA5 representation at fixed diagnostic snapshots."""
from datetime import datetime, timezone
import json
from pathlib import Path

import numpy as np

from reanalysis_grib import GribArchive, PARAMETERS, STANDARD_GRAVITY

ROOT = Path(__file__).resolve().parents[1]


def main():
    directory = ROOT / "var/reanalysis/vertical-diagnostic"
    raw = directory / "era5-vertical-diagnostic-20230603-09.grib"
    ids = ["2023-06-03-sunset", "2023-06-09-sunset", "2023-06-10-sunrise"]
    study = ROOT / "research/backtests/shanghai-era5-input-2023-06"
    cases = [json.loads((study / (case_id + ".json")).read_text()) for case_id in ids]
    hours = [int((datetime.fromisoformat(c["event"]["time"].replace("Z", "+00:00")).timestamp() + 1800) // 3600) * 3600 for c in cases]
    aggregate_paths = sorted((ROOT / "var/reanalysis/official").glob("era5-cloud-baseline-*.grib"))
    archive = GribArchive([raw, *aggregate_paths], {param: set(hours) for param in PARAMETERS})
    outputs = []
    for case, when in zip(cases, hours):
        points = case["points"]
        levels = sorted((level for param, time, level in archive.fields if param == 248 and time == when), reverse=True)
        coarse_levels = case["nativeDiagnostics"]["pressureHpa"]
        coarse_indices = [levels.index(p) for p in coarse_levels]
        values = {}
        for param, name, factor in [(248, "cloudPercent", 100), (129, "heightM", 1 / STANDARD_GRAVITY),
                                    (246, "liquidKgKg", 1), (247, "iceKgKg", 1), (130, "temperatureK", 1)]:
            values[name] = np.array([archive.sample(param, when, level, points)[0] * factor for level in levels])
        dense_cloud = values["cloudPercent"]
        coarse_cloud = dense_cloud[coarse_indices]
        # Both datasets contain the exact same coarse fields at this hour.
        ti = case["era5Weather"][0]["hourly"]["time"].index(when)
        for pi, pressure in enumerate(coarse_levels):
            expected = np.array([row["hourly"][f"cloud_cover_{pressure}hPa"][ti] for row in case["era5Weather"]])
            if not np.allclose(expected, coarse_cloud[pi], rtol=0, atol=1e-10):
                raise ValueError("dense source differs from the frozen experiment at an overlapping pressure level")
        fan_count = len(case["fanOffsets"])
        if len(points) % fan_count:
            raise ValueError("diagnostic fan has inconsistent point counts")
        width = len(points) // fan_count
        start = (fan_count // 2) * width
        center = start + min(range(width), key=lambda i:
            (points[start + i]["lat"] - case["location"]["lat"]) ** 2 +
            (points[start + i]["lon"] - case["location"]["lon"]) ** 2)
        layer_cover = {name: (100 * archive.sample(param, when, 0, points)[0]).tolist()
                       for param, name in [(186, "low"), (187, "mid"), (188, "high")]}
        ground = np.array([row["elevation"] or 0 for row in case["era5Weather"]])
        above = values["heightM"] >= ground
        coarse_max = np.where(above[coarse_indices], coarse_cloud, 0).max(axis=0)
        dense_max = np.where(above, dense_cloud, 0).max(axis=0)
        peak = int(np.argmax(np.where(above[:, center], dense_cloud[:, center], 0)))
        outputs.append({"id": case["observedCase"]["id"], "sourceGrade": case["observedCase"]["observedGrade"],
                        "hourUtc": datetime.fromtimestamp(when, timezone.utc).isoformat(), "pressureHpa": levels,
                        "requestedPoints": points, "selectedGrid": archive.sample(248, when, levels[0], points)[1],
                        "dimensions": ["pressure", "point"], "fields": {k: v.tolist() for k, v in values.items()},
                        "nativeLayerCoverPercent": layer_cover, "coarseOverlapMatches": True,
                        "coarseMaximumPercent": coarse_max.tolist(), "denseMaximumPercent": dense_max.tolist(),
                        "local": {"coarseMaximumPercent": float(coarse_max[center]), "denseMaximumPercent": float(dense_max[center]),
                                  "densePeakPressureHpa": levels[peak], "densePeakHeightM": float(values["heightM"][peak, center]),
                                  "nativeLayerCoverPercent": {k: v[center] for k, v in layer_cover.items()}}})
        print(case["observedCase"]["id"], json.dumps(outputs[-1]["local"]), flush=True)
    source = json.loads((directory / "era5-vertical-diagnostic-20230603-09.json").read_text())
    receipt = {"generatedAt": datetime.now(timezone.utc).isoformat(),
               "source": {"dataset": source["dataset"], "request": source["request"], "sha256": source["sha256"],
                          "bytes": source["bytes"], "retrievedAt": source["downloaded_at"]},
               "scope": "Three nearest-hour input snapshots; frozen event scores remain unchanged. Native layer cover and pressure-level maxima represent different vertical sampling/aggregation statistics.",
               "cases": outputs}
    target = ROOT / "research/reanalysis/vertical-resolution.json"
    target.write_text(json.dumps(receipt, separators=(",", ":"), allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
