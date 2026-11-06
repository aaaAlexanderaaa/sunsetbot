#!/usr/bin/env python3
"""Fetch one bounded, anonymous ARCO ERA5 hour and retain a regional subset.

This reader intentionally supports the inspected pressure-level store's Zarr 2
layout only. Global compressed chunks stay in ignored var/; the small regional
NPZ, coordinates, source hashes and numerical checks are public evidence.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import time
import urllib.request

import numpy as np
from numcodecs import get_codec

ROOT = Path(__file__).resolve().parents[1]
BASE = ("https://storage.googleapis.com/gcp-public-data-arco-era5/ar/"
        "full_37-1h-0p25deg-chunk-1.zarr-v3")
VARIABLES = (
    "fraction_of_cloud_cover", "specific_cloud_liquid_water_content",
    "specific_cloud_ice_water_content", "temperature", "geopotential",
)
LEVELS = (1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150)
AREA = (38, 110, 26, 132)  # north, west, south, east


def sha256(data):
    return hashlib.sha256(data).hexdigest()


class Objects:
    def __init__(self, cache, limit, max_seconds=120):
        self.cache, self.limit, self.max_seconds = cache, limit, max_seconds
        self.transferred = 0
        self.receipts = []

    def get(self, key, byte_range=None):
        target = self.cache / (key + (f".range-{byte_range[0]}-{byte_range[1]}" if byte_range else ""))
        receipt_file = target.with_name(target.name + ".receipt.json")
        if target.exists() and receipt_file.exists():
            data = target.read_bytes()
            receipt = json.loads(receipt_file.read_text())
            if (receipt["sha256"] != sha256(data) or receipt["url"] != f"{BASE}/{key}"
                    or receipt.get("requested_range") != (list(byte_range) if byte_range else None)):
                raise ValueError(f"cached object failed integrity check: {key}")
            self.receipts.append({**receipt, "cache_hit": True})
            return data
        headers = {
            "User-Agent": "SunsetbotResearch/0.1 (anonymous ERA5 sample)",
            "Accept-Encoding": "identity",
        }
        if byte_range:
            headers["Range"] = f"bytes={byte_range[0]}-{byte_range[1]}"
        request = urllib.request.Request(f"{BASE}/{key}", headers=headers)
        start = time.monotonic()
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status != (206 if byte_range else 200):
                raise ValueError(f"unexpected HTTP status {response.status}: {key}")
            if byte_range and not response.headers.get("Content-Range", "").startswith(
                    f"bytes {byte_range[0]}-{byte_range[1]}/"):
                raise ValueError(f"unexpected byte-range response: {key}")
            length = response.headers.get("Content-Length")
            if length and int(length) > self.limit - self.transferred:
                raise ValueError(f"transfer budget would be exceeded by {key} ({length} bytes)")
            blocks = []
            while True:
                if time.monotonic() - start > self.max_seconds:
                    raise TimeoutError(f"object exceeded {self.max_seconds}s; use the regional CDS route: {key}")
                block = response.read(min(64 * 1024, self.limit - self.transferred + 1))
                if not block:
                    break
                self.transferred += len(block)
                if self.transferred > self.limit:
                    raise ValueError("transfer budget exceeded; partial object discarded")
                blocks.append(block)
            data = b"".join(blocks)
            if length and len(data) != int(length):
                raise ValueError(f"truncated object: {key}")
            receipt = {
                "url": f"{BASE}/{key}", "captured_at": datetime.now(timezone.utc).isoformat(),
                "status": response.status, "bytes": len(data), "sha256": sha256(data),
                "etag": response.headers.get("ETag"),
                "generation": response.headers.get("x-goog-generation"),
                "requested_range": list(byte_range) if byte_range else None,
                "content_range": response.headers.get("Content-Range"),
                "elapsed_seconds": round(time.monotonic() - start, 3),
            }
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + ".partial")
        temporary.write_bytes(data)
        temporary.replace(target)
        receipt_file.write_text(json.dumps(receipt, indent=2) + "\n")
        self.receipts.append({**receipt, "cache_hit": False})
        print(f"{key}: {len(data):,} bytes", flush=True)
        return data


def decode_chunk(metadata, name, data):
    spec = metadata[f"{name}/.zarray"]
    if spec["zarr_format"] != 2 or spec["order"] != "C" or spec["filters"]:
        raise ValueError(f"unsupported Zarr layout: {name}")
    if spec.get("dimension_separator", ".") != ".":
        raise ValueError(f"unsupported chunk separator: {name}")
    decoded = get_codec(spec["compressor"]).decode(data) if spec["compressor"] else data
    dtype = np.dtype(spec["dtype"])
    expected = int(np.prod(spec["chunks"])) * dtype.itemsize
    if len(decoded) != expected:
        raise ValueError(f"decoded size mismatch for {name}: {len(decoded)} vs {expected}")
    return np.frombuffer(decoded, dtype=dtype).reshape(spec["chunks"])


def subset_indices(level, latitude, longitude):
    indices = []
    for value in LEVELS:
        matches = np.flatnonzero(level == value)
        if len(matches) != 1:
            raise ValueError(f"pressure level missing or duplicated: {value}")
        indices.append(int(matches[0]))
    north, west, south, east = AREA
    lat = np.flatnonzero((latitude >= south) & (latitude <= north))
    lon = np.flatnonzero((longitude >= west) & (longitude <= east))
    if len(lat) != 49 or len(lon) != 89:
        raise ValueError("regional grid differs from the inspected 0.25 degree grid")
    return np.array(indices), lat, lon


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hour", default="2023-06-09T21:00:00Z")
    parser.add_argument("--metadata", type=Path, default=ROOT / "research/sources/reanalysis-access/arco-zmetadata.json")
    parser.add_argument("--cache", type=Path, default=ROOT / "var/reanalysis/arco/cache")
    parser.add_argument("--output", type=Path, default=ROOT / "research/reanalysis")
    parser.add_argument("--max-mib", type=int, default=200)
    parser.add_argument("--probe-only", action="store_true",
                        help="decode time/grid coordinates and retain only a 128 KiB cloud-object prefix")
    args = parser.parse_args()
    when = datetime.fromisoformat(args.hour.replace("Z", "+00:00"))
    if when.tzinfo is None or when.utcoffset() != timedelta(0) or when.minute or when.second or when.microsecond:
        parser.error("--hour must be an exact UTC hour")
    if args.max_mib <= 0:
        parser.error("--max-mib must be positive")
    metadata_bytes = args.metadata.read_bytes()
    metadata = json.loads(metadata_bytes)["metadata"]
    attrs = metadata[".zattrs"]
    if not attrs["valid_time_start"] <= when.date().isoformat() <= attrs["valid_time_stop"]:
        parser.error("hour is outside the mirror's stable ERA5 coverage")
    objects = Objects(args.cache, args.max_mib * 1024 * 1024)
    coordinates = {}
    for name in ("level", "latitude", "longitude"):
        spec = metadata[f"{name}/.zarray"]
        if spec["shape"] != spec["chunks"]:
            raise ValueError(f"coordinate needs multiple chunks: {name}")
        coordinates[name] = decode_chunk(metadata, name, objects.get(f"{name}/0"))
    if metadata["time/.zattrs"]["units"] != "hours since 1900-01-01 00:00:00":
        raise ValueError("unsupported time epoch")
    epoch = datetime(1900, 1, 1, tzinfo=timezone.utc)
    elapsed_hours = (when - epoch).total_seconds() / 3600
    first = decode_chunk(metadata, "time", objects.get("time/0"))
    if not np.all(np.diff(first) == 1):
        raise ValueError("time coordinate does not advance hourly")
    index = int(elapsed_hours - first[0])
    if not 0 <= index < metadata["time/.zarray"]["shape"][0]:
        raise ValueError("time index outside coordinate")
    chunk_length = metadata["time/.zarray"]["chunks"][0]
    key = f"time/{index // chunk_length}"
    times = first if index < chunk_length else decode_chunk(metadata, "time", objects.get(key))
    if times[index % chunk_length] != elapsed_hours:
        raise ValueError("decoded coordinate disagrees with requested UTC hour")
    level_i, lat_i, lon_i = subset_indices(**coordinates)
    arrays = {
        "pressure_hpa": coordinates["level"][level_i],
        "latitude": coordinates["latitude"][lat_i],
        "longitude": coordinates["longitude"][lon_i],
        "utc_epoch_seconds": np.array(int(when.timestamp()), dtype=np.int64),
    }
    args.output.mkdir(parents=True, exist_ok=True)
    stem = "arco-" + when.strftime("%Y%m%dT%HZ")
    if args.probe_only:
        key = f"fraction_of_cloud_cover/{index}.0.0.0"
        prefix = objects.get(key, (0, 131071))
        prefix_file = args.output / f"{stem}-cloud-prefix.bin"
        prefix_file.write_bytes(prefix)
        grid_file = args.output / f"{stem}-coordinates.npz"
        np.savez_compressed(grid_file, **arrays)
        receipt = {
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "source": BASE, "hour_utc": when.isoformat(), "time_index": index,
            "metadata": {"file": str(args.metadata.relative_to(ROOT)), "sha256": sha256(metadata_bytes)},
            "area_north_west_south_east": list(AREA), "pressure_hpa": list(LEVELS),
            "objects": objects.receipts, "transferred_this_run_bytes": objects.transferred,
            "artifacts": [{"file": p.name, "bytes": p.stat().st_size, "sha256": sha256(p.read_bytes())}
                          for p in (prefix_file, grid_file)],
            "scope": "Decoded time/pressure/latitude/longitude and anonymous cloud-object byte-range access. Numerical cloud fields require a complete compressed chunk.",
        }
        (args.output / f"{stem}-access-probe.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(f"Saved decoded grid and cloud-object access evidence; {objects.transferred:,} bytes transferred.")
        return
    fields = {}
    shanghai_lat_i = int(np.argmin(abs(arrays["latitude"] - 31.2304)))
    shanghai_lon_i = int(np.argmin(abs(arrays["longitude"] - 121.4737)))
    for name in VARIABLES:
        spec = metadata[f"{name}/.zarray"]
        dims = metadata[f"{name}/.zattrs"]["_ARRAY_DIMENSIONS"]
        if dims != ["time", "level", "latitude", "longitude"] or spec["chunks"] != [1, 37, 721, 1440]:
            raise ValueError(f"variable layout differs from inspected store: {name}")
        raw = objects.get(f"{name}/{index}.0.0.0")
        full = decode_chunk(metadata, name, raw)
        regional = full[0][np.ix_(level_i, lat_i, lon_i)].copy()
        del full, raw
        if not np.isfinite(regional).all():
            raise ValueError(f"missing/nonfinite regional data: {name}")
        arrays[name] = regional
        fields[name] = {
            "units": metadata[f"{name}/.zattrs"]["units"], "shape": list(regional.shape),
            "finite_values": int(np.isfinite(regional).sum()),
            "min": float(regional.min()), "max": float(regional.max()),
            "shanghai_nearest_column": regional[:, shanghai_lat_i, shanghai_lon_i].astype(float).tolist(),
        }
    target = args.output / f"{stem}-subset.npz"
    with target.open("wb") as output:
        np.savez_compressed(output, **arrays)
    receipt = {
        "captured_at": datetime.now(timezone.utc).isoformat(), "source": BASE,
        "dataset": "ERA5 reanalysis, ARCO regular 0.25 degree pressure levels",
        "hour_utc": when.isoformat(), "time_index": index,
        "metadata": {"file": str(args.metadata.relative_to(ROOT)), "sha256": sha256(metadata_bytes), "validity": attrs},
        "area_north_west_south_east": list(AREA), "pressure_hpa": list(LEVELS),
        "nearest_shanghai_grid": {"latitude": float(arrays["latitude"][shanghai_lat_i]),
                                  "longitude": float(arrays["longitude"][shanghai_lon_i])},
        "fields": fields, "objects": objects.receipts,
        "objects_total_compressed_bytes": sum(r["bytes"] for r in objects.receipts),
        "transferred_this_run_bytes": objects.transferred,
        "global_decoded_bytes_per_variable_hour": 1 * 37 * 721 * 1440 * 4,
        "regional_raw_bytes_all_fields": sum(arrays[n].nbytes for n in VARIABLES),
        "subset": {"file": target.name, "bytes": target.stat().st_size, "sha256": sha256(target.read_bytes())},
        "scope": "one input hour; frozen model scores and forecast skill remain separate experiments",
    }
    manifest = args.output / f"{stem}-manifest.json"
    manifest.write_text(json.dumps(receipt, indent=2, allow_nan=False) + "\n")
    print(f"Saved {target} ({target.stat().st_size:,} bytes); {objects.transferred:,} bytes transferred.")


if __name__ == "__main__":
    main()
