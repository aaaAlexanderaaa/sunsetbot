#!/usr/bin/env python3
"""Finish the queued EAC4 experiment once the existing downloader saves inputs.

This process watches local receipts, makes no new data requests, and preserves
the frozen cloud-only experiment. The full comparison is built and replayed in
ignored staging before its directory is promoted into the public research tree.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "var/reanalysis/study-pipeline.json"
TARGET = ROOT / "research/backtests/shanghai-era5-input-2023-06"


def save_state(status, **details):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE.with_suffix(".partial")
    temporary.write_text(json.dumps({"updatedAt": datetime.now(timezone.utc).isoformat(),
                                     "status": status, **details}, indent=2) + "\n")
    temporary.replace(STATE)


def missing_inputs():
    missing = []
    for plan_file in ["shanghai-20230601-10.json", "shanghai-cloud-baseline-20230601-10.json"]:
        plan = json.loads((ROOT / "config/reanalysis" / plan_file).read_text())
        for job in plan["jobs"]:
            directory = ROOT / "var/reanalysis/official"
            receipt_file = directory / (job["id"] + ".json")
            if not receipt_file.exists():
                missing.append(job["id"])
                continue
            receipt = json.loads(receipt_file.read_text())
            target = directory / (job["id"] + ".grib")
            if not receipt.get("sha256") or not target.exists() or target.stat().st_size != receipt.get("bytes"):
                missing.append(job["id"])
    return missing


def run(command):
    subprocess.run(command, cwd=ROOT, check=True)


def compare_cloud_control(directory):
    cloud = json.loads((ROOT / "research/backtests/shanghai-era5-cloud-2023-06/summary.json").read_text())
    full = json.loads((directory / "summary.json").read_text())
    expected = {c["id"]: c["modes"]["era5_cams"]["score"] for c in cloud["cases"]}
    actual = {c["id"]: c["modes"]["era5_cams"]["score"] for c in full["cases"]}
    if expected != actual:
        raise ValueError("ERA5 cloud control changed between staged and full aerosol experiments")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wait-hours", type=float, default=12)
    args = parser.parse_args()
    if args.wait_hours <= 0:
        parser.error("--wait-hours must be positive")
    deadline = time.monotonic() + args.wait_hours * 3600
    while missing := missing_inputs():
        save_state("waiting_for_downloaded_inputs", missing=missing, dataRequestsSubmittedByThisProcess=0)
        if time.monotonic() >= deadline:
            raise TimeoutError("existing official data task is still queued; rerun this local continuation after receipt completion")
        time.sleep(min(30, max(0.01, deadline - time.monotonic())))
    python = str(ROOT / "var/reanalysis-venv/bin/python")
    if TARGET.exists():
        run(["node", "scripts/backtest-reanalysis.mjs", "--directory", str(TARGET)])
        compare_cloud_control(TARGET)
        save_state("complete", result=str(TARGET.relative_to(ROOT)), replayVerified=True)
        return
    staging = ROOT / "var/reanalysis" / ("full-study-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S"))
    save_state("normalizing", staging=str(staging.relative_to(ROOT)))
    run([python, "scripts/build_reanalysis_cases.py", "--require-baseline", "--output", str(staging)])
    save_state("evaluating", staging=str(staging.relative_to(ROOT)))
    run(["node", "scripts/backtest-reanalysis.mjs", "--evaluate", "--directory", str(staging)])
    run(["node", "scripts/backtest-reanalysis.mjs", "--directory", str(staging)])
    compare_cloud_control(staging)
    staging.rename(TARGET)
    save_state("complete", result=str(TARGET.relative_to(ROOT)), replayVerified=True)
    print("Full frozen reanalysis comparison completed and replayed.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        save_state("stopped", error=str(error), errorType=type(error).__name__)
        raise
