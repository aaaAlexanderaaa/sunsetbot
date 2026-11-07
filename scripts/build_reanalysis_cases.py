#!/usr/bin/env python3
"""Build explicit frozen-input interventions from public archived GFS + GRIB.

ERA5 cloud fraction and geopotential replace pressure profiles. GFS terrain,
precipitation and visibility stay fixed. EAC4 supplies a separate aerosol
intervention. Native ERA5 water/ice/temperature are retained as diagnostics.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re

import eccodes
import numpy as np

from reanalysis_grib import GribArchive, PARAMETERS, STANDARD_GRAVITY, file_hash

ROOT = Path(__file__).resolve().parents[1]


def save_json(path, value):
    path.write_text(json.dumps(value, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n")


def required_hours(source):
    event = datetime.fromisoformat(source["event"]["time"].replace("Z", "+00:00")).timestamp()
    first = math.floor((event - 40 * 60) / 3600) * 3600
    last = math.ceil((event + 40 * 60) / 3600) * 3600
    return list(range(first, last + 1, 3600))


def build_case(archive, source, original_path, levels, *, require_baseline=False, original_aerosol=False):
    points = source["points"]
    original_times = source["weather"]["data"][0]["hourly"]["time"]
    times = required_hours(source)
    time_indices = [original_times.index(when) for when in times]
    matrices, grids = {}, {}
    for param in (248, 129, 246, 247, 130):
        matrices[param] = np.empty((len(times), len(levels), len(points)))
        for ti, when in enumerate(times):
            for pi, pressure in enumerate(levels):
                values, selected = archive.sample(param, when, pressure, points)
                matrices[param][ti, pi] = values
                if "era5" in grids and grids["era5"] != selected:
                    raise ValueError("ERA5 fields use different selected grids")
                grids["era5"] = selected
    layer_cloud = {}
    if all((param, when, 0) in archive.fields for param in (186, 187, 188) for when in times):
        for name, param in [("low", 186), ("mid", 187), ("high", 188)]:
            layer_cloud[name] = []
            for when in times:
                values, selected = archive.sample(param, when, 0, points)
                if selected != grids["era5"]:
                    raise ValueError("native ERA5 layer cover uses a different selected grid")
                layer_cloud[name].append(100 * values)
    elif require_baseline:
        raise ValueError("native ERA5 layer baseline is incomplete for this event")
    weather = []
    for index, row in enumerate(source["weather"]["data"]):
        if row["hourly"]["time"] != original_times:
            raise ValueError("control weather rows have different UTC time grids")
        hourly = {"time": times}
        units = {"time": "unixtime"}
        for name in ("precipitation", "visibility"):
            if name in row["hourly"]:
                hourly[name] = [row["hourly"][name][i] for i in time_indices]
                units[name] = row["hourly_units"][name]
        for name, values in layer_cloud.items():
            hourly[f"cloud_cover_{name}"] = [float(row[index]) for row in values]
            units[f"cloud_cover_{name}"] = "%"
        for pi, pressure in enumerate(levels):
            cloud, height = f"cloud_cover_{pressure}hPa", f"geopotential_height_{pressure}hPa"
            hourly[cloud] = (100 * matrices[248][:, pi, index]).tolist()
            hourly[height] = (matrices[129][:, pi, index] / STANDARD_GRAVITY).tolist()
            units[cloud], units[height] = "%", "m"
        weather.append({**grids["era5"][index], "utc_offset_seconds": 0, "elevation": row.get("elevation"),
                        "hourly": hourly, "hourly_units": units})
    aod_times = [] if original_aerosol else list(range((times[0] // 10800) * 10800, ((times[-1] + 10799) // 10800) * 10800 + 1, 10800))
    aod = []
    for when in aod_times:
        values, selected = archive.sample(210207, when, 0, points)
        if "eac4" in grids and grids["eac4"] != selected:
            raise ValueError("EAC4 fields use different selected grids")
        grids["eac4"] = selected
        aod.append(values)
    aerosol = None if original_aerosol else [{**grids["eac4"][i], "utc_offset_seconds": 0,
                "hourly_units": {"time": "unixtime", "aerosol_optical_depth": "dimensionless"},
                "hourly": {"time": aod_times, "aerosol_optical_depth": [float(values[i]) for values in aod]}}
               for i in range(len(points))]
    return {
        "kind": "frozen-pressure-profile-intervention" if original_aerosol else "frozen-pressure-profile-and-aerosol-interventions",
        "sourceGfs": {"file": str(original_path.relative_to(ROOT)), "sha256": file_hash(original_path)},
        "observedCase": source["observedCase"], "location": source["location"],
        "event": source["event"], "fanOffsets": source["fanOffsets"], "points": points,
        "era5Weather": weather, "eac4Aerosol": aerosol,
        "fieldProvenance": {
            "pressure_cloud_cover_percent": "ERA5 paramId 248 multiplied by 100",
            "pressure_geopotential_height_m": "ERA5 paramId 129 divided by standard gravity 9.80665 m/s^2",
            "terrain_rain_visibility": "unchanged per-point GFS control input, including missingness",
            "aod550": "original archived CAMS input held fixed" if original_aerosol else "EAC4 paramId 210207, three-hourly total-column dimensionless",
            "spatial_selection": "nearest cell per requested WGS84 point; actual coordinates retained separately for each grid",
            "temporal_interpolation": "unchanged engine interpolation at each five-minute frame",
            "input_window": "hourly brackets of the frozen event +/-40 minute window; original surplus hours remain in the referenced GFS archive",
            "baseline": "unchanged max(mid,high)*(1-low/100) formula; native GFS and native ERA5 aggregate fields reported separately",
        },
        "selectedGrids": grids,
        "nativeDiagnostics": {"dimensions": ["time", "pressure", "point"], "time": times,
                              "pressureHpa": levels, "cloudLiquidKgKg": matrices[246].tolist(),
                              "cloudIceKgKg": matrices[247].tolist(), "temperatureK": matrices[130].tolist(),
                              "scope": "grid-box mean water/ice and temperature archived; frozen engine reads cloud fraction and height"},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--grib-directory", type=Path, default=ROOT / "var/reanalysis/official")
    parser.add_argument("--output", type=Path, default=ROOT / "research/backtests/shanghai-era5-input-2023-06")
    parser.add_argument("--case", help="one archived event ID, for bounded input acceptance")
    parser.add_argument("--require-baseline", action="store_true", help="require native ERA5 low/mid/high cloud fields")
    parser.add_argument("--original-aerosol", action="store_true", help="pressure-only experiment holding original archived CAMS fixed")
    args = parser.parse_args()
    control_directory = ROOT / "research/backtests/shanghai-2023-06-all"
    selection = json.loads((control_directory / "selection.json").read_text())
    records = []
    for receipt in json.loads((control_directory / "manifest.json").read_text()):
        path = (control_directory / receipt["file"]).resolve()
        if file_hash(path) != receipt["sha256"]:
            raise ValueError("preserved GFS control input failed integrity check")
        source = json.loads(path.read_text())
        if args.case is None or source["observedCase"]["id"] == args.case:
            records.append((path, source))
    if not records:
        parser.error("no control events match --case")
    weather_times = set()
    aod_times = set()
    for _, source in records:
        times = required_hours(source)
        weather_times.update(times)
        aod_times.update(range((times[0] // 10800) * 10800, ((times[-1] + 10799) // 10800) * 10800 + 1, 10800))
    paths = args.grib_directory.glob("era5*.grib" if args.original_aerosol else "*.grib")
    archive = GribArchive(paths,
                          {param: aod_times if param == 210207 else weather_times for param in PARAMETERS})
    args.output.mkdir(parents=True, exist_ok=True)
    receipts = []
    for path, source in records:
        levels = sorted((int(re.fullmatch(r"cloud_cover_(\d+)hPa", name)[1])
                         for name in source["weather"]["data"][0]["hourly"]
                         if re.fullmatch(r"cloud_cover_(\d+)hPa", name)), reverse=True)
        case = build_case(archive, source, path, levels, require_baseline=args.require_baseline, original_aerosol=args.original_aerosol)
        target = args.output / (source["observedCase"]["id"] + ".json")
        save_json(target, case)
        receipts.append({"file": target.name, "sha256": file_hash(target)})
        print(f"Built {target.name}: {len(source['points'])} points, {len(levels)} pressure levels", flush=True)
    record = {
        "builtAt": datetime.now(timezone.utc).isoformat(), "controlSelection": selection,
        "modelSha256": hashlib.sha256(b"".join((ROOT / name).read_bytes()
            for name in ["src/engine.mjs", "src/cloud-optics.mjs", "src/astro.mjs"])).hexdigest(),
        "decoder": {"pythonBindings": eccodes.__version__, "library": eccodes.codes_get_api_version()},
        "inputToolSha256": {name: file_hash(ROOT / name)
                            for name in ["scripts/build_reanalysis_cases.py", "scripts/reanalysis_grib.py"]},
        "dependencySha256": {"src/provider.mjs": file_hash(ROOT / "src/provider.mjs"),
                             "package-lock.json": file_hash(ROOT / "package-lock.json")},
        "aerosolIntervention": not args.original_aerosol,
        "design": ("ERA5 pressure-profile intervention; original CAMS and all other consumed inputs fixed to GFS control"
                   if args.original_aerosol else "2x2 ERA5 pressure-profile and EAC4 AOD interventions, all other consumed inputs fixed to GFS control"),
        "rawGrib": [{**receipt, "file": Path(receipt["file"]).name} for receipt in archive.receipts], "cases": receipts,
        "datasets": {"era5": "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-pressure-levels",
                     "era5Layers": "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels",
                     "eac4": "https://ads.atmosphere.copernicus.eu/datasets/cams-global-reanalysis-eac4"},
    }
    for receipt in record["rawGrib"]:
        state_file = args.grib_directory / (Path(receipt["file"]).stem + ".json")
        if state_file.exists():
            state = json.loads(state_file.read_text())
            if state.get("sha256") != receipt["sha256"]:
                raise ValueError("download receipt and decoded raw file differ")
            receipt.update(dataset=state["dataset"], request=state["request"], retrievedAt=state["downloaded_at"])
    if record["modelSha256"] != selection["codeSha256"]:
        raise ValueError("frozen model source differs from the control study")
    save_json(args.output / "manifest.json", record)


if __name__ == "__main__":
    main()
