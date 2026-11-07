#!/usr/bin/env python3
"""Normalize the prespecified calendar with bounded point-stream GRIB storage."""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path

from reanalysis_grib import GribArchive, PARAMETERS, STANDARD_GRAVITY, file_hash

ROOT = Path(__file__).resolve().parents[1]


def surface_series():
    directory = ROOT / "research/sources/validation-surface"
    records, receipts = {}, json.loads((directory / "manifest.json").read_text())
    for receipt in receipts:
        path = directory / receipt["file"]
        if receipt.get("status") != 200 or file_hash(path) != receipt["sha256"]:
            raise ValueError("local ancillary source integrity check failed")
        row = json.loads(path.read_text())
        if row.get("utc_offset_seconds") != 0 or row["hourly_units"] != {
                "time": "unixtime", "precipitation": "mm", "visibility": "m"}:
            raise ValueError("local ancillary source time/units changed")
        h = row["hourly"]
        if any(len(h[field]) != len(h["time"]) for field in ["precipitation", "visibility"]):
            raise ValueError("ancillary arrays are misaligned")
        for i, when in enumerate(h["time"]):
            values = [h["precipitation"][i], h["visibility"][i]]
            if any(v is not None and (not math.isfinite(v) or v < 0) for v in values):
                raise ValueError("ancillary values are invalid")
            if when in records:
                raise ValueError("ancillary date windows overlap")
            records[when] = values
    return records, receipts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "var/reanalysis/validation-staging")
    args = parser.parse_args()
    calendar_file = ROOT / "research/experiments/validation-calendar/selection.json"
    calendar = json.loads(calendar_file.read_text())
    frozen = json.loads((ROOT / "research/experiments/cloud-column-selection.json").read_text())
    if calendar["candidateIdentity"] != frozen["candidateIdentity"]:
        raise ValueError("calendar candidate and source freeze differ")
    plan = json.loads((ROOT / "config/reanalysis/shanghai-validation-jja.json").read_text())
    directory = ROOT / "var/reanalysis/validation-data"
    paths, download_receipts = [], []
    for job in plan["jobs"]:
        receipt = json.loads((directory / (job["id"] + ".json")).read_text())
        path = directory / (job["id"] + ".grib")
        if not receipt.get("sha256") or not path.exists():
            raise ValueError("official task still awaiting download: " + job["id"])
        if file_hash(path) != receipt["sha256"]:
            raise ValueError("official data integrity check failed")
        paths.append(path)
        download_receipts.append({k: receipt[k] for k in ["dataset", "request", "file", "bytes", "sha256", "downloaded_at"]})
    weather_times, aod_times, point_requests = set(), set(), {}
    for case in calendar["cases"]:
        weather_times.update(case["hours"])
        aod_times.update(case["aerosolHours"])
        for when in set(case["hours"] + case["aerosolHours"]):
            if when in point_requests and point_requests[when] != case["points"]:
                raise ValueError("multiple point sets share an input hour")
            point_requests[when] = case["points"]
    terrain_time = int(datetime(2023, 6, 10, tzinfo=timezone.utc).timestamp())
    wanted = {param: set() for param in PARAMETERS}
    for param in [248, 186, 187, 188]:
        wanted[param] = weather_times
    wanted[129] = weather_times | {terrain_time}
    wanted[210207] = aod_times
    archive = GribArchive(paths, wanted, sample_points_by_time=point_requests, full_grid_parameters={(129, 0)})
    surface, surface_receipts = surface_series()
    levels = frozen["candidate"]["levelsHpa"]
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for case in calendar["cases"]:
        points, times = case["points"], case["hours"]
        ground, terrain_grid = archive.sample(129, terrain_time, 0, points)
        ground = ground / STANDARD_GRAVITY
        _, grid = archive.sample(248, times[0], levels[0], points)
        if grid != terrain_grid:
            raise ValueError("terrain and pressure grid differ")
        weather = [{**selected, "elevation": float(ground[i]), "utc_offset_seconds": 0,
                    "hourly": {"time": times, "precipitation": [surface[t][0] for t in times],
                               "visibility": [surface[t][1] for t in times]},
                    "hourly_units": {"time": "unixtime", "precipitation": "mm", "visibility": "m"}}
                   for i, selected in enumerate(grid)]
        fields = [(248, pressure, f"cloud_cover_{pressure}hPa", 100, "%") for pressure in levels]
        fields += [(129, pressure, f"geopotential_height_{pressure}hPa", 1 / STANDARD_GRAVITY, "m") for pressure in levels]
        fields += [(p, 0, "cloud_cover_" + name, 100, "%") for p, name in [(186, "low"), (187, "mid"), (188, "high")]]
        for param, pressure, field, factor, units in fields:
            samples = []
            for when in times:
                values, selected = archive.sample(param, when, pressure, points)
                if selected != grid:
                    raise ValueError("ERA5 variables use different grids")
                samples.append(values * factor)
            for i, row in enumerate(weather):
                row["hourly"][field] = [float(values[i]) for values in samples]
                row["hourly_units"][field] = units
        aerosol_values = []
        for when in case["aerosolHours"]:
            values, selected = archive.sample(210207, when, 0, points)
            aerosol_values.append(values)
        aerosol = [{**selected[i], "utc_offset_seconds": 0,
                    "hourly": {"time": case["aerosolHours"], "aerosol_optical_depth": [float(values[i]) for values in aerosol_values]},
                    "hourly_units": {"time": "unixtime", "aerosol_optical_depth": "dimensionless"}}
                   for i in range(len(points))]
        record = {**case, "weather": weather, "aerosol": aerosol, "pressureHpa": levels,
                  "fieldProvenance": {"cloud_height_layers_terrain": "ERA5 pressure/single levels; terrain uses June-10 static geopotential divided by standard gravity",
                                      "aod": "CAMS EAC4 native total-column AOD550",
                                      "precipitation_visibility": "single-city historical GFS; only observer-local multiplier consumes these fields",
                                      "scope": "paired retrospective structural comparison; original forecast run/lead remains unknown for ancillary GFS fields"}}
        target = args.output / (case["observedCase"]["id"] + ".json")
        target.write_text(json.dumps(record, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n")
        results.append({"file": target.name, "sha256": file_hash(target)})
        print("Validation input", target.name, flush=True)
    manifest = {"builtAt": datetime.now(timezone.utc).isoformat(), "candidateIdentity": frozen["candidateIdentity"],
                "calendarSha256": file_hash(calendar_file), "pressureHpa": levels, "cases": results,
                "raw": download_receipts, "surfaceSources": surface_receipts,
                "normalizerSha256": file_hash(Path(__file__)), "decoderSha256": file_hash(ROOT / "scripts/reanalysis_grib.py"),
                "pointStreamRetention": True, "scope": "164 prespecified calendar source labels; linked and source-only evidence states retained"}
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
