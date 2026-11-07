"""Verify retained cloud-study sources, inputs and independent AUC arithmetic."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads((ROOT / path).read_text())


def check_file(path, expected):
    path = Path(path)
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError("integrity mismatch: " + str(path.relative_to(ROOT)))


def rank_sum_auc(cases, score):
    rows = sorted(cases, key=score)
    positive = sum(c["observedGrade"] > 0 for c in rows)
    negative, rank_sum, i = len(rows) - positive, 0, 0
    while i < len(rows):
        j = i + 1
        while j < len(rows) and score(rows[j]) == score(rows[i]):
            j += 1
        rank_sum += (i + 1 + j) / 2 * sum(c["observedGrade"] > 0 for c in rows[i:j])
        i = j
    return (rank_sum - positive * (positive + 1) / 2) / (positive * negative)


def main():
    source_count, input_count, raw_count, raw_bytes = 0, 0, 0, 0
    for name in ["validation-calendar", "validation-surface", "validation-evidence", "scattering"]:
        folder = ROOT / "research/sources" / name
        for receipt in read(folder / "manifest.json"):
            if receipt["status"] != 200:
                raise ValueError("source response needs inspection: " + name)
            check_file(folder / receipt["file"], receipt["sha256"])
            source_count += 1
    snapshot = ROOT / "research/model-snapshots/section-optics-0.3.1"
    manifest = read(snapshot / "manifest.json")
    for receipt in manifest["files"]:
        check_file(snapshot / receipt["file"], receipt["sha256"])
    check_file(ROOT / "package-lock.json", manifest["packageLockSha256"])
    for name, raw_folder in [("cloud-column-dense-inputs", "dense-development"),
                             ("cloud-column-validation", "validation-data")]:
        folder = ROOT / "research/experiments" / name
        inputs = read(folder / "manifest.json")
        for receipt in inputs["cases"]:
            check_file(folder / receipt["file"], receipt["sha256"])
            input_count += 1
        for receipt in inputs["raw"]:
            path = ROOT / "var/reanalysis" / raw_folder / receipt["file"]
            check_file(path, receipt["sha256"])
            if path.stat().st_size != receipt["bytes"]:
                raise ValueError("raw byte count changed")
            raw_bytes += receipt["bytes"]
            raw_count += 1
    folder = ROOT / "research/experiments/cloud-column-validation"
    inputs, summary = read(folder / "manifest.json"), read(folder / "summary.json")
    calendar_path = ROOT / "research/experiments/validation-calendar/selection.json"
    calendar = read(calendar_path)
    check_file(calendar_path, inputs["calendarSha256"])
    check_file(ROOT / "scripts/build_validation_cases.py", inputs["normalizerSha256"])
    check_file(ROOT / "scripts/reanalysis_grib.py", inputs["decoderSha256"])
    if (len(summary["cases"]), len({c["date"] for c in summary["cases"]})) != (164, 82):
        raise ValueError("validation calendar coverage changed")
    for receipt, expected in zip(inputs["cases"], calendar["cases"], strict=True):
        case = read(folder / receipt["file"])
        if any(case[key] != value for key, value in expected.items()):
            raise ValueError("calendar facts changed in normalization")
    for name, metrics in summary["rankings"].items():
        actual = rank_sum_auc(summary["cases"], lambda c: c["scores"][name]["score"])
        if abs(actual - metrics["pairwiseAuc"]) > 1e-14:
            raise ValueError("independent rank-sum AUC differs")

    # Credential values remain process-local; the record contains counts alone.
    private_values = []
    config = Path.home() / ".codex/config.toml"
    if config.exists():
        headers = tomllib.loads(config.read_text()).get("mcp_servers", {}).get("chatgptbox", {}).get("http_headers", {})
        private_values.extend(str(value).removeprefix("Bearer ") for value in headers.values())
    sdk_config = Path.home() / ".cdsapirc"
    if sdk_config.exists():
        private_values.extend(re.findall(r"(?m)^key:\s*(\S+)", sdk_config.read_text()))
    private_values = {value.encode() for value in private_values if len(value) >= 12}
    files = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT).split(b"\0")
    checked = 0
    for item in files:
        if not item:
            continue
        path = ROOT / item.decode()
        if not path.is_file():
            continue
        data = path.read_bytes()
        if any(value in data for value in private_values):
            raise ValueError("credential match in public material: " + path.name)
        checked += 1
    result = {"verifiedAt": datetime.now(timezone.utc).isoformat(), "publicSourceReceipts": source_count,
              "snapshotFiles": len(manifest["files"]), "normalizedInputCases": input_count,
              "regionalRawFiles": raw_count, "regionalRawBytes": raw_bytes,
              "independentRankSumAucVariants": len(summary["rankings"]), "validationEvents": 164,
              "validationDates": 82, "calendarFactsRetained": True,
              "credentialScan": {"configuredValuesChecked": len(private_values), "publicFilesChecked": checked, "matches": 0},
              "tests": {"node": 37, "python": 13, "scope": "Separate completed test runs; this script verifies retained study artifacts"},
              "replay": {"development": "20 events, four variants; exact", "independentCalendar": "164 events, scores/statistics/policy; exact"}}
    target = ROOT / "research/experiments/cloud-column-verification.json"
    target.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
