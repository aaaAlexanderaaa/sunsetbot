#!/usr/bin/env python3
"""Capture an explicit public-source list with reproducible provenance."""
import argparse
import hashlib
import json
import urllib.error
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('inventory', type=Path)
    parser.add_argument('--output', type=Path, default=Path('research/sources'))
    args = parser.parse_args()
    sources = json.loads(args.inventory.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    receipts = []
    for item in sources:
        receipt = {**item, 'captured_at': datetime.now(timezone.utc).isoformat()}
        target = args.output / item['file']
        try:
            parts = urllib.parse.urlsplit(item['url'])
            encoded_url = urllib.parse.urlunsplit((parts.scheme, parts.netloc,
                urllib.parse.quote(urllib.parse.unquote(parts.path)), parts.query, parts.fragment))
            request = urllib.request.Request(encoded_url, headers={'User-Agent': 'SunsetbotResearch/0.1 (personal source archive)'})
            with urllib.request.urlopen(request, timeout=30) as response:
                data = response.read(8 * 1024 * 1024 + 1)
                if len(data) > 8 * 1024 * 1024:
                    raise ValueError('source exceeds the 8 MiB capture limit')
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                receipt.update(status=response.status, final_url=response.url,
                               content_type=response.headers.get('Content-Type'),
                               bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        except urllib.error.HTTPError as error:
            receipt.update(status=error.code, error=str(error))
        except (OSError, ValueError, urllib.error.URLError) as error:
            receipt.update(status='failed', error=str(error))
        receipts.append(receipt)
        print(item['file'], receipt['status'], receipt.get('bytes', receipt.get('error')), flush=True)
        if receipt.get('status') == 429:
            break
    manifest = args.output / 'manifest.json'
    manifest.write_text(json.dumps(receipts, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
