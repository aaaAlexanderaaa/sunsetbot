#!/usr/bin/env python3
"""Inspect or execute regional CDS/ADS requests, with resumable remote job IDs.

The default is a local dry run. --fetch submits the selected plan; --check-auth
checks credentials alone. --prompt-key accepts a hidden, process-local token.
CDSAPI_KEY and the SDK's standard ~/.cdsapirc are also supported. Credentials
never enter plan files, state receipts, download URLs or printed output.
"""
import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
STORES = {
    "reanalysis-era5-pressure-levels": "https://cds.climate.copernicus.eu/api",
    "cams-global-reanalysis-eac4": "https://ads.atmosphere.copernicus.eu/api",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def load_plan(path):
    plan = json.loads(path.read_text())
    if plan.get("version") != 1 or not plan.get("jobs"):
        raise ValueError("plan must contain version 1 and a nonempty jobs array")
    names = set()
    for job in plan["jobs"]:
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", job["id"]) or job["id"] in names:
            raise ValueError("job IDs must be unique safe filenames")
        names.add(job["id"])
        if job["dataset"] not in STORES:
            raise ValueError("only the declared CDS ERA5 and ADS EAC4 datasets are supported")
        request = job["request"]
        if request.get("data_format") != "grib":
            raise ValueError("these requests preserve native GRIB output")
        if request.get("area") != [38, 110, 26, 132]:
            raise ValueError("this plan is bounded to the Shanghai illumination region")
    return plan


def save_state(path, state):
    temporary = path.with_name(path.name + ".partial")
    temporary.write_text(json.dumps(state, indent=2) + "\n")
    temporary.replace(path)


def load_key(prompt=False):
    if prompt:
        key = getpass.getpass("Copernicus personal access token (hidden): ").strip()
    else:
        # The asynchronous SDK has its own configuration convention. Resolve the
        # documented CDS configuration with cdsapi, then pass the token explicitly
        # to both fixed endpoints so a user's standard ~/.cdsapirc works unchanged.
        from cdsapi.api import get_url_key_verify
        try:
            key = get_url_key_verify(STORES["reanalysis-era5-pressure-levels"], None, True)[1]
        except Exception as error:
            raise ValueError("Set CDSAPI_KEY, create ~/.cdsapirc, or use --prompt-key; see docs/reanalysis-access.md") from error
    if not key or any(not 33 <= ord(char) <= 126 for char in key):
        raise ValueError("personal access token must contain nonempty printable ASCII without spaces or line breaks")
    return key


def fetch_job(client, job, directory):
    identity = {"dataset": job["dataset"], "endpoint": STORES[job["dataset"]], "request": job["request"]}
    fingerprint = digest(json.dumps(identity, sort_keys=True).encode())
    target = directory / (job["id"] + ".grib")
    receipt_file = directory / (job["id"] + ".json")
    state = json.loads(receipt_file.read_text()) if receipt_file.exists() else {
        **identity, "request_sha256": fingerprint,
    }
    if state["request_sha256"] != fingerprint:
        raise ValueError(f"saved job identity changed: {job['id']}; use a fresh job ID")
    if state.get("sha256"):
        if not target.exists() or file_hash(target) != state["sha256"]:
            raise ValueError(f"saved data failed integrity check: {target}")
        print(f"{job['id']}: verified existing {state['bytes']:,} bytes", flush=True)
        return
    if state.get("request_id"):
        remote = client.get_remote(state["request_id"])
        print(f"{job['id']}: resuming remote job", flush=True)
    else:
        remote = client.submit(job["dataset"], job["request"])
        state.update(request_id=remote.request_id, submitted_at=datetime.now(timezone.utc).isoformat())
        save_state(receipt_file, state)
        print(f"{job['id']}: submitted; remote ID saved", flush=True)
    temporary = target.with_name(target.name + ".partial")
    remote.download(str(temporary))
    with temporary.open("rb") as stream:
        if stream.read(4) != b"GRIB":
            raise ValueError(f"response is not native GRIB: {job['id']}; partial retained for inspection")
    temporary.replace(target)
    state.update(downloaded_at=datetime.now(timezone.utc).isoformat(), file=target.name,
                 bytes=target.stat().st_size, sha256=file_hash(target))
    save_state(receipt_file, state)
    print(f"{job['id']}: saved {state['bytes']:,} bytes", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, default=ROOT / "config/reanalysis/shanghai-june10-sunrise.json")
    parser.add_argument("--output", type=Path, default=ROOT / "var/reanalysis/official")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--fetch", action="store_true")
    mode.add_argument("--check-auth", action="store_true")
    parser.add_argument("--prompt-key", action="store_true")
    args = parser.parse_args()
    plan = load_plan(args.plan)
    if not (args.fetch or args.check_auth):
        print(json.dumps({"mode": "local dry run; no remote job submitted", **plan,
                          "endpoints": STORES}, indent=2))
        return
    from ecmwf.datastores import Client
    key = load_key(args.prompt_key)
    clients = {}
    for dataset in dict.fromkeys(job["dataset"] for job in plan["jobs"]):
        client = Client(url=STORES[dataset], key=key, progress=False, timeout=60,
                        maximum_tries=3, retry_after=15, sleep_max=30)
        client.check_authentication()
        clients[dataset] = client
        print(f"{STORES[dataset]}: authentication accepted", flush=True)
    if args.check_auth:
        print("Authentication checked. Dataset licences are accepted on the two download pages.")
        return
    args.output.mkdir(parents=True, exist_ok=True)
    for job in plan["jobs"]:
        fetch_job(clients[job["dataset"]], job, args.output)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        print(f"Acquisition stopped: {error}", file=sys.stderr)
        sys.exit(1)
