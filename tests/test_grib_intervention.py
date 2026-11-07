"""Actual GRIB acceptance and scientific input-isolation checks, entirely offline."""
from contextlib import redirect_stdout
from datetime import datetime, timezone
import io
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from reanalysis_grib import Grid, GribArchive, PARAMETERS, STANDARD_GRAVITY, file_hash
from build_reanalysis_cases import build_case, required_hours
import ask_chatgpt


class GridChecks(unittest.TestCase):
    def test_scanning_order_and_nearest_cell_preserve_the_geographic_field(self):
        grid = Grid([2, 1, 2, 1], [11, 11, 10, 10])
        field = grid.canonical([211, 111, 210, 110])
        np.testing.assert_array_equal(field, [[110, 111], [210, 211]])
        lat_i, lon_i, selected = grid.select([{"lat": 1.9, "lon": 10.1}])
        self.assertEqual(field[lat_i, lon_i].tolist(), [210])
        self.assertEqual(selected, [{"latitude": 2.0, "longitude": 10.0}])
        with self.assertRaisesRegex(ValueError, "beyond"):
            grid.select([{"lat": 2.1, "lon": 10.1}])
        with self.assertRaisesRegex(ValueError, "complete"):
            Grid([2, 2, 1, 1], [11, 11, 10, 10])


class OfficialSampleChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        folder = ROOT / "research/sources/reanalysis-acceptance"
        paths = []
        for receipt in json.loads((folder / "manifest.json").read_text()):
            path = folder / receipt["file"]
            assert file_hash(path) == receipt["sha256"]
            paths.append(path)
        cls.source_path = ROOT / "research/backtests/shanghai-2023-06-all/2023-06-10-sunrise.json"
        cls.source = json.loads(cls.source_path.read_text())
        cls.times = cls.source["weather"]["data"][0]["hourly"]["time"]
        aod_times = {int(datetime(2023, 6, 9, 18, tzinfo=timezone.utc).timestamp()),
                     int(datetime(2023, 6, 9, 21, tzinfo=timezone.utc).timestamp()),
                     int(datetime(2023, 6, 10, 0, tzinfo=timezone.utc).timestamp())}
        with redirect_stdout(io.StringIO()):
            cls.archive = GribArchive(paths, {p: aod_times if p == 210207 else set(cls.times) for p in PARAMETERS})
        cls.levels = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150]

    def test_actual_message_counts_valid_units_and_reference_values(self):
        self.assertEqual(sorted(r["messages"] for r in self.archive.receipts), [6, 165])
        when = self.times[1]
        points = [{"lat": 31.2304, "lon": 121.4737}]
        z, selected = self.archive.sample(129, when, 1000, points)
        self.assertEqual(selected, [{"latitude": 31.25, "longitude": 121.5}])
        self.assertEqual(z.tolist(), [191.154541015625])
        liquid, _ = self.archive.sample(246, when, 700, points)
        self.assertEqual(liquid.tolist(), [4.76837158203125e-07])
        ice, _ = self.archive.sample(247, when, 300, points)
        self.assertEqual(ice.tolist(), [2.86102294921875e-06])

    def test_intervention_converts_profiles_and_holds_consumed_ancillary_inputs(self):
        case = build_case(self.archive, self.source, self.source_path, self.levels)
        for original, new in zip(self.source["weather"]["data"], case["era5Weather"]):
            self.assertEqual(original.get("elevation"), new["elevation"])
            for field in ["time", "precipitation", "visibility"]:
                self.assertEqual(original["hourly"].get(field), new["hourly"].get(field))
        center = 18
        self.assertAlmostEqual(case["era5Weather"][center]["hourly"]["geopotential_height_1000hPa"][1],
                               191.154541015625 / STANDARD_GRAVITY)
        self.assertEqual(case["era5Weather"][center]["hourly"]["cloud_cover_250hPa"][1], 13.28125)
        self.assertNotIn("cloud_cover_low", case["era5Weather"][center]["hourly"])
        self.assertEqual(len(case["eac4Aerosol"][center]["hourly"]["time"]), 3)
        self.assertEqual(np.asarray(case["nativeDiagnostics"]["cloudLiquidKgKg"]).shape, (3, 11, 42))
        with self.assertRaisesRegex(ValueError, "baseline"):
            build_case(self.archive, self.source, self.source_path, self.levels, require_baseline=True)

    def test_incomplete_pressure_data_stops_the_intervention(self):
        key = (248, self.times[0], 1000)
        field = self.archive.fields.pop(key)
        try:
            with self.assertRaisesRegex(ValueError, "required GRIB field missing"):
                build_case(self.archive, self.source, self.source_path, self.levels)
        finally:
            self.archive.fields[key] = field

    def test_surplus_control_hours_are_trimmed_with_ancillary_values_preserved(self):
        source = copy.deepcopy(self.source)
        extra = list(range(self.times[0] - 24 * 3600, self.times[-1] + 24 * 3600 + 1, 3600))
        for row in source["weather"]["data"]:
            original = row["hourly"]
            expanded = {"time": extra}
            for field, values in original.items():
                if field != "time":
                    expanded[field] = [values[self.times.index(when)] if when in self.times else -999 for when in extra]
            row["hourly"] = expanded
        self.assertEqual(required_hours(source), self.times)
        result = build_case(self.archive, source, self.source_path, self.levels, original_aerosol=True)
        self.assertIsNone(result["eac4Aerosol"])
        for original, new in zip(self.source["weather"]["data"], result["era5Weather"]):
            for field in ("time", "precipitation", "visibility"):
                self.assertEqual(original["hourly"].get(field), new["hourly"].get(field))


class McpFailureChecks(unittest.TestCase):
    def test_remote_tool_error_is_archived_and_propagated(self):
        replies = [
            {"result": {"protocolVersion": "2024-11-05"}},
            {"result": {"tools": [{"name": "ask_chatgpt", "inputSchema": {"properties": {"query": {"type": "string"}}}}]}},
            {"result": {"isError": True, "content": [{"type": "text", "text": "simulated runtime unavailable"}]}},
        ]

        class Response:
            status = 200
            headers = {"Content-Type": "application/json"}

            def __init__(self, value):
                self.value = value

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps(self.value).encode()

        class Opener:
            def open(self, request, timeout):
                payload = json.loads(request.data)
                if payload["method"] == "notifications/initialized":
                    return Response({})
                return Response(replies.pop(0))

        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            query, output = folder / "question.txt", folder / "answer.json"
            query.write_text("A local simulated substantive question.")
            with patch.object(ask_chatgpt.Path, "home", return_value=folder), \
                    patch.dict(ask_chatgpt.os.environ, {"CHATGPT_MCP_URL": "http://example.invalid/mcp"}), \
                    patch.object(ask_chatgpt.urllib.request, "build_opener", return_value=Opener()), \
                    patch.object(sys, "argv", ["ask_chatgpt.py", "--query-file", str(query), "--output", str(output)]), \
                    redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, "returned an error"):
                    ask_chatgpt.main()
            self.assertTrue(json.loads(output.read_text())["response"]["result"]["isError"])


if __name__ == "__main__":
    unittest.main()
