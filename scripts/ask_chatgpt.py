#!/usr/bin/env python3
"""Use the configured ChatGPTBox MCP without persisting credentials.

Each question is an isolated conversation. Supply a self-contained public
question; the result file contains the final MCP response and provenance.
"""
import argparse
import getpass
import json
import os
import tomllib
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--list', action='store_true')
    p.add_argument('--query-file', type=Path)
    p.add_argument('--output', type=Path)
    p.add_argument('--key-stdin', action='store_true')
    args = p.parse_args()
    config = Path.home() / '.codex/config.toml'
    server = tomllib.loads(config.read_text()).get('mcp_servers', {}).get('chatgptbox', {}) if config.exists() else {}
    url = os.environ.get('CHATGPT_MCP_URL', server.get('url'))
    if not url:
        p.error('Set CHATGPT_MCP_URL or configure mcp_servers.chatgptbox')
    headers = {**server.get('http_headers', {}), 'Content-Type': 'application/json',
               'Accept': 'application/json, text/event-stream'}
    key = getpass.getpass('MCP key (hidden): ') if args.key_stdin else os.environ.get('CHATGPT_MCP_TOKEN')
    if key:
        headers['Authorization'] = 'Bearer ' + key
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def call(method, params=None, ident=None):
        payload = {'jsonrpc': '2.0', 'method': method}
        if params is not None:
            payload['params'] = params
        if ident is not None:
            payload['id'] = ident
        request = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers)
        with opener.open(request, timeout=75) as response:
            session = response.headers.get('Mcp-Session-Id')
            if session:
                headers['Mcp-Session-Id'] = session
            if response.status == 202:
                return None
            if 'text/event-stream' in response.headers.get('Content-Type', ''):
                for line in response:
                    if line.startswith(b'data: '):
                        result = json.loads(line[6:])
                        if result.get('id') == ident:
                            return result
                raise RuntimeError('MCP stream ended before its result; preserve the existing turn')
            return json.load(response)

    init = call('initialize', {'protocolVersion': '2024-11-05', 'capabilities': {},
                              'clientInfo': {'name': 'sunsetbot-research', 'version': '0.1'}}, 1)
    if 'error' in init:
        raise RuntimeError(init['error'])
    call('notifications/initialized')
    listing = call('tools/list', {}, 2)
    tool = next((t for t in listing.get('result', {}).get('tools', []) if t['name'] == 'ask_chatgpt'), None)
    if tool is None:
        raise RuntimeError('Configured MCP does not advertise ask_chatgpt')
    if args.list:
        print(json.dumps(tool, ensure_ascii=False, indent=2))
        return
    if args.query_file is None or args.output is None:
        p.error('Provide --query-file and --output')
    if set(tool.get('inputSchema', {}).get('properties', {})) != {'query'}:
        raise RuntimeError('MCP query schema changed; inspect --list before continuing')
    print('Sending one research question; waiting for the final MCP result.', flush=True)
    result = call('tools/call', {'name': 'ask_chatgpt', 'arguments': {'query': args.query_file.read_text()}}, 3)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'captured_at': datetime.now(timezone.utc).isoformat(),
                                     'query_file': str(args.query_file), 'response': result}, ensure_ascii=False, indent=2) + '\n')
    print('Saved MCP response to', args.output, flush=True)
    for block in result.get('result', {}).get('content', []):
        if block.get('type') == 'text':
            print(block['text'], flush=True)
    if 'error' in result or result.get('result', {}).get('isError'):
        raise RuntimeError('Ask ChatGPT MCP returned an error; the exact response is preserved in the output file')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, urllib.error.URLError) as error:
        print(type(error).__name__ + ': ' + str(error), flush=True)
        raise SystemExit(1)
