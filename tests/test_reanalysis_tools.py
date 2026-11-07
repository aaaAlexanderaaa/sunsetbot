"""Offline checks for source schemas, UTC coverage and bounded acquisition."""
from datetime import datetime, timedelta
import hashlib
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from fetch_arco_sample import Objects
from fetch_reanalysis import load_plan, fetch_job, load_key


def captured_widgets(filename):
    class NextData(HTMLParser):
        active = False
        text = ""

        def handle_starttag(self, tag, attrs):
            if tag == "script" and dict(attrs).get("id") == "__NEXT_DATA__":
                self.active = True

        def handle_data(self, value):
            if self.active:
                self.text += value

        def handle_endtag(self, tag):
            if tag == "script":
                self.active = False
    parser = NextData()
    parser.feed((ROOT / filename).read_text())
    widgets = {}

    def visit(value):
        if isinstance(value, dict):
            if "name" in value and "details" in value and "type" in value:
                widgets[value["name"]] = value
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(json.loads(parser.text))
    return widgets


class ReanalysisChecks(unittest.TestCase):
    def test_standard_cds_config_is_shared_with_both_fixed_store_clients(self):
        with tempfile.TemporaryDirectory() as directory:
            rc = Path(directory) / "cdsapirc"
            rc.write_text("url: https://cds.climate.copernicus.eu/api\nkey: test-only-local-token\n")
            with patch.dict(os.environ, {"CDSAPI_RC": str(rc)}):
                os.environ.pop("CDSAPI_KEY", None)
                self.assertEqual(load_key(), "test-only-local-token")
            with patch.dict(os.environ, {"CDSAPI_RC": str(rc), "CDSAPI_KEY": "test-only-env-token"}):
                self.assertEqual(load_key(), "test-only-env-token")

    def test_request_choices_match_official_captured_forms(self):
        forms = {
            "reanalysis-era5-pressure-levels": captured_widgets("research/sources/history-copernicus/era5-pressure-levels.html"),
            "reanalysis-era5-single-levels": captured_widgets("research/sources/era5-baseline/era5-single-levels.html"),
            "cams-global-reanalysis-eac4": captured_widgets("research/sources/history-copernicus/cams-eac4.html"),
        }
        for path in (ROOT / "config/reanalysis").glob("*.json"):
            for job in load_plan(path)["jobs"]:
                form = forms[job["dataset"]]
                for name, value in job["request"].items():
                    self.assertIn(name, form, (path, name))
                    allowed = form[name]["details"].get("values")
                    if form[name]["type"] in ("StringListWidget", "StringChoiceWidget"):
                        for choice in value if isinstance(value, list) else [value]:
                            self.assertIn(choice, allowed, (path, name, choice))

    def test_full_plan_brackets_all_twenty_preserved_event_windows(self):
        plan = load_plan(ROOT / "config/reanalysis/shanghai-20230601-10.json")
        hours, aerosol_hours = set(), set()
        for job in plan["jobs"]:
            request = job["request"]
            if job["dataset"] == "reanalysis-era5-pressure-levels":
                for year in request["year"]:
                    for month in request["month"]:
                        for day in request["day"]:
                            for hour in request["time"]:
                                hours.add(datetime.fromisoformat(f"{year}-{month}-{day}T{hour}:00+00:00"))
            else:
                start, stop = map(datetime.fromisoformat, request["date"].split("/"))
                while start <= stop:
                    for hour in request["time"]:
                        aerosol_hours.add(datetime.fromisoformat(f"{start.date()}T{hour}:00+00:00"))
                    start += timedelta(days=1)
        folder = ROOT / "research/backtests/shanghai-2023-06-all"
        manifest = json.loads((folder / "manifest.json").read_text())
        self.assertEqual(len(manifest), 20)
        for entry in manifest:
            event = json.loads((folder / entry["file"]).read_text())
            when = datetime.fromisoformat(event["event"]["time"].replace("Z", "+00:00"))
            for minute in range(-40, 41, 5):
                frame = when + timedelta(minutes=minute)
                floor_hour = frame.replace(minute=0, second=0, microsecond=0)
                for hour in (floor_hour, floor_hour + timedelta(hours=1)):
                    self.assertIn(hour, hours, event["observedCase"]["id"])
                floor_aerosol = floor_hour.replace(hour=(floor_hour.hour // 3) * 3)
                for hour in (floor_aerosol, floor_aerosol + timedelta(hours=3)):
                    self.assertIn(hour, aerosol_hours, event["observedCase"]["id"])
            for point in event["points"]:
                self.assertTrue(26 <= point["lat"] <= 38 and 110 <= point["lon"] <= 132)

    def test_oversized_object_stops_before_body_or_cache_write(self):
        class Response:
            status = 200
            headers = {"Content-Length": "101"}

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, size):
                raise AssertionError("oversized response body should remain unread")
        with tempfile.TemporaryDirectory() as directory:
            objects = Objects(Path(directory), 100)
            with patch("fetch_arco_sample.urllib.request.urlopen", return_value=Response()):
                with self.assertRaisesRegex(ValueError, "budget"):
                    objects.get("example/0")
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_anonymous_probe_preserves_grid_time_and_object_identity(self):
        receipt_file = ROOT / "research/reanalysis/arco-20230609T21Z-access-probe.json"
        receipt = json.loads(receipt_file.read_text())
        for artifact in receipt["artifacts"]:
            target = receipt_file.parent / artifact["file"]
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), artifact["sha256"])
        target = receipt_file.parent / "arco-20230609T21Z-coordinates.npz"
        with np.load(target, allow_pickle=False) as sample:
            self.assertEqual(sample["pressure_hpa"].tolist(), [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150])
            self.assertEqual(len(sample["latitude"]), 49)
            self.assertEqual(len(sample["longitude"]), 89)
            self.assertEqual(set(np.diff(sample["latitude"])), {-0.25})
            self.assertEqual(set(np.diff(sample["longitude"])), {0.25})
            self.assertEqual(sample["utc_epoch_seconds"].item(), int(datetime.fromisoformat(receipt["hour_utc"]).timestamp()))
            self.assertEqual(receipt["hour_utc"], "2023-06-09T21:00:00+00:00")
        prefix = receipt["objects"][-1]
        self.assertEqual(prefix["status"], 206)
        self.assertEqual(prefix["bytes"], 131072)
        self.assertEqual(prefix["content_range"], "bytes 0-131071/26486167")

    def test_interrupted_official_download_resumes_saved_job_and_checks_data(self):
        class Remote:
            request_id = "test-remote-job"
            interrupted = True

            def download(self, target):
                if self.interrupted:
                    self.interrupted = False
                    raise TimeoutError("simulated transport interruption")
                Path(target).write_bytes(b"GRIB-fake-payload-for-transport-test")

        class Client:
            submitted = 0
            resumed = 0
            remote = Remote()

            def submit(self, dataset, request):
                self.submitted += 1
                return self.remote

            def get_remote(self, request_id):
                assert request_id == self.remote.request_id
                self.resumed += 1
                return self.remote
        client = Client()
        job = load_plan(ROOT / "config/reanalysis/shanghai-june10-sunrise.json")["jobs"][0]
        with tempfile.TemporaryDirectory() as directory, redirect_stdout(io.StringIO()):
            folder = Path(directory)
            with self.assertRaises(TimeoutError):
                fetch_job(client, job, folder)
            fetch_job(client, job, folder)
            fetch_job(client, job, folder)
            self.assertEqual(client.submitted, 1)
            self.assertEqual(client.resumed, 1)
            (folder / (job["id"] + ".grib")).write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "integrity"):
                fetch_job(client, job, folder)


if __name__ == "__main__":
    unittest.main()
