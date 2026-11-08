#!/usr/bin/env python3
"""Retrieve the fixed calendar's public labels after source/prediction freeze."""
from datetime import date, timedelta
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    selection_path = ROOT / 'research/experiments/scattering-selection.json'
    selection = json.loads(selection_path.read_text())
    prediction_directory = ROOT / 'research/experiments/scattering-validation-predictions'
    predictions = json.loads((prediction_directory / 'manifest.json').read_text())
    if (predictions['candidateIdentity'] != selection['candidateIdentity']
            or predictions['selectionSha256'] != sha(selection_path) or len(predictions['cases']) != 122):
        raise ValueError('Matching complete prospective predictions are required before label retrieval')
    for receipt in predictions['cases']:
        if sha(prediction_directory / receipt['file']) != receipt['sha256']:
            raise ValueError('Prospective prediction integrity changed')
    sources, first, last = [], date(2023, 9, 1), date(2023, 10, 31)
    while first <= last:
        # The original public response has a bounded row count: use at most
        # ten calendar days per request, retaining both sunrise and sunset.
        end = min(first + timedelta(days=9), last)
        parameters = {'city_name': '上海', 'start_date': first.isoformat(), 'end_date': end.isoformat(),
                      'event': '0', 'cloud': '0', 'color': '0', 'quality': '0', 'sky': '0', 'url': '0', 'intend': 'select_event'}
        sources.append({'url': 'https://sunsetbot.top/reanalysis/?' + urlencode(parameters),
                        'file': f'shanghai-{first.isoformat()}_{end.isoformat()}.json',
                        'kind': 'frozen-independent-calendar-source-records',
                        'requested_range': [first.isoformat(), end.isoformat()],
                        'candidateIdentity': selection['candidateIdentity'], 'sourceFrozenAt': selection['frozenAt']})
        first = end + timedelta(days=1)
    directory = ROOT / 'research/sources/scattering-validation-calendar'
    if (directory / 'manifest.json').exists():
        raise ValueError('Existing label capture remains immutable; reuse its receipts')
    inventory = ROOT / 'research/source-inventories/scattering-validation-labels.json'
    inventory.write_text(json.dumps(sources, indent=2, ensure_ascii=False) + '\n')
    subprocess.run([sys.executable, str(ROOT / 'scripts/capture_sources.py'), str(inventory),
                    '--output', str(directory)], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
