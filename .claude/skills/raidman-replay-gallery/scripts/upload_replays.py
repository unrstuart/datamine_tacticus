"""Uploads Tacticus replay files to tacticus-raidman.com and writes a CSV of title, filename and replay URL.

Usage (run with -I so nothing is imported from the current directory):
    python3 -I upload_replays.py <replays_dir> <out.csv> [--upload] [--guild-tag TAG] [--api URL]

Without --upload this is a dry run: each *.replay.txt is decoded and listed (title, mode, board) and nothing is
sent. With --upload each file is POSTed to the site's replay API and the CSV gets the resulting URLs. Uploads go
up UNLISTED (no guild tag) unless --guild-tag is given. They are public to anyone with the link and cannot be
taken back, so only run --upload after the user has said which files and which mode.

Re-uploading the same file is harmless: the server answers with the same hash and alreadyUploaded=true.
"""
import base64
import csv
import glob
import gzip
import json
import os
import sys
import urllib.error
import urllib.request

# The Lambda URL tacticus-raidman.com's own frontend posts to (read from its JS bundle). If uploads start
# failing with 404/403, fetch the site's current assets/index-*.js and look for `/api/replay` to find it again.
DEFAULT_API = 'https://7kirvdjwrfibcitmtpgfcj4tei0supic.lambda-url.ap-southeast-2.on.aws/'
SITE = 'https://tacticus-raidman.com'


def decode(text):
    return json.loads(gzip.decompress(base64.b64decode(text)))


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    flags = {a.split('=')[0]: (a.split('=', 1)[1] if '=' in a else True) for a in argv if a.startswith('--')}
    # "--guild-tag TAG" / "--api URL" given as two words
    for name in ('--guild-tag', '--api'):
        if name in argv and flags.get(name) is True:
            flags[name] = argv[argv.index(name) + 1]
            args.remove(flags[name])
    if len(args) != 2:
        sys.exit(__doc__)
    replays_dir, out_csv = os.path.expanduser(args[0]), os.path.expanduser(args[1])
    upload = '--upload' in flags
    api = (flags.get('--api') or DEFAULT_API).rstrip('/')
    files = sorted(glob.glob(os.path.join(replays_dir, '*.txt')))
    if not files:
        sys.exit(f'no *.txt files in {replays_dir}')

    rows, failures = [], []
    for path in files:
        name = os.path.basename(path)
        body = open(path, 'rb').read()
        try:
            config = decode(body)['BattleConfiguration']
        except Exception:   # any *.txt is tried; notes and other files are skipped
            print(f'{name}: skipped, not a replay file')
            continue
        title = config['Id']
        if not upload:
            print(f"{name}: {title} ({config.get('GameMode')})")
            continue
        headers = {'accept': 'application/json', 'content-type': 'text/plain'}
        if flags.get('--guild-tag'):
            headers['x-guild-tag'] = flags['--guild-tag']
        request = urllib.request.Request(f'{api}/api/replay', data=body, method='POST', headers=headers)
        try:
            reply = json.load(urllib.request.urlopen(request, timeout=60))
        except (urllib.error.URLError, ValueError) as error:
            failures.append((name, str(error)))
            continue
        rows.append({'title': title, 'filename': name, 'url': f"{SITE}/public/replays/{reply['hash']}",
                     'already_uploaded': reply.get('alreadyUploaded')})
        print(f"{name}: {title} -> {rows[-1]['url']}" + (' (already there)' if reply.get('alreadyUploaded') else ''))

    if not upload:
        print(f'\nDry run: {len(files)} replays decoded, nothing sent. Add --upload to publish them.')
        return
    with open(out_csv, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['title', 'filename', 'url'], extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)
    print(f'\n{len(rows)} uploaded, {len(failures)} failed -> {out_csv}')
    for name, error in failures:
        print(f'  FAILED {name}: {error}')


if __name__ == '__main__':
    main(sys.argv[1:])
