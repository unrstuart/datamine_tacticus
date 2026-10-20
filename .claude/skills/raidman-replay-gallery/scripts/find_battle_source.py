"""Works out where in the GameConfig a set of replays' battles are defined, and how their titles map to them.

Usage (run with -I so nothing is imported from the current directory):
    python3 -I find_battle_source.py <replays_dir> <GameConfig file>

For every replay it prints the title, game mode, player units and enemy units, then looks through the whole
GameConfig for battle-like records (a `units` list of "unitId:N" strings, `waves[].army` lists, or an `enemies`
list as quests have) whose
enemy units are all among the replay's. The list that matches the most replays is the likely source - e.g.
clientGameConfig/battles/campaigns/Event[7]/battles, or clientGameConfig/battles/battleSets/<name>. It also
checks whether each replay's trailing title number equals the matched list index, which is what
battle_index_regex in a gallery config relies on; when it doesn't, it prints a battle_index_map (title -> index)
for the unambiguous matches instead. Quests keep their battles in per-tier lists (.../tiers[j]/battles); those are
treated as one list in tier order, which is the order the gallery's "linear_hero_event" source uses.

Matching is by enemy units, so it needs distinct enemy line-ups; it says so when several records tie.
"""
import base64
import collections
import glob
import gzip
import json
import os
import re
import sys


def load_replay(path):
    return json.loads(gzip.decompress(base64.b64decode(open(path).read())))


def base_id(unit):
    return unit.split(':')[0]


def replay_facts(data):
    recorded = set(data['RecordedPlayerIds'])
    player = []
    for m in data['Messages']:
        raw = m['Message'].get('MessageJson') or ''
        if '"AddUnitMessage"' in raw:
            msg = json.loads(raw)
            if msg['PlayerId'] in recorded and msg['UnitId'] not in player:
                player.append(msg['UnitId'])
    everything = {u['ConfigId']['PureId'] for u in data['BattleConfiguration']['Units']}
    predefined = {base_id(x['UnitId']) for p in data['BattleConfiguration'].get('PredefinedUnits') or [] for x in p['Units']}
    return {
        'title': data['BattleConfiguration']['Id'],
        'mode': data['BattleConfiguration'].get('GameMode'),
        'meta': data['MetaData'].get('Data'),
        'player': player,
        'enemy': (everything | predefined) - set(player),
    }


def battle_records(node, path=''):
    """Yield (list path, index, set of enemy base ids) for every battle-like record in the config."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from battle_records(v, f'{path}/{k}')
    elif isinstance(node, list):
        for i, item in enumerate(node):
            if isinstance(item, dict):
                ids = set()
                for team in item.get('units') or []:
                    if isinstance(team, list):
                        ids |= {base_id(u) for u in team if isinstance(u, str)}
                ids |= {base_id(u) for u in item.get('enemies') or [] if isinstance(u, str)}
                for wave in item.get('waves') or []:
                    if isinstance(wave, dict):
                        ids |= {base_id(u) for u in wave.get('army') or [] if isinstance(u, str)}
                if ids:
                    yield path, i, ids
            yield from battle_records(item, f'{path}[{i}]' if isinstance(item, (dict, list)) else path)


def resolve(config, path):
    """Follow a path printed by battle_records ('/a/b[3]/c') into the config."""
    node = config
    for key, index in re.findall(r'/([^/\[]+)((?:\[\d+\])*)', path):
        node = node[key]
        for i in re.findall(r'\[(\d+)\]', index):
            node = node[int(i)]
    return node


def flatten(config, path, index):
    """Quest battles live in .../idunLiveEventConfigs[i]/tiers[j]/battles. Return that event's path and the
    battle's position across all its tiers in order; any other list is returned unchanged."""
    match = re.match(r'(.*)/tiers\[(\d+)\]/battles$', path)
    if not match:
        return path, index
    tiers = resolve(config, match.group(1))['tiers']
    return match.group(1), sum(len(t['battles']) for t in tiers[:int(match.group(2))]) + index


def main(replays_dir, gameconfig_path):
    facts = {}
    for f in sorted(glob.glob(os.path.join(os.path.expanduser(replays_dir), '*.txt'))):
        try:
            facts[f] = replay_facts(load_replay(f))
        except Exception:   # any *.txt is tried; notes and other files are skipped
            print(f'skipping {os.path.basename(f)}: not a replay file')
    files = list(facts)
    config = json.load(open(os.path.expanduser(gameconfig_path)))
    records = [(*flatten(config, path, i), ids) for path, i, ids in battle_records(config)]
    votes, matches = collections.Counter(), {}
    for f, fact in facts.items():
        # Every enemy the config lists must show up in the replay; fewest extras wins (summons add some).
        hits = [(len(fact['enemy'] - ids), path, i) for path, i, ids in records if ids <= fact['enemy'] | set(fact['player'])]
        hits.sort()
        best = hits[0][0] if hits else None
        matches[f] = [(path, i) for extra, path, i in hits if extra == best]
        for path in {path for path, _ in matches[f]}:
            votes[path] += 1
        print(f"{os.path.basename(f)}: {fact['title']} | mode={fact['mode']} | {fact['meta']}")
        print(f"   players: {', '.join(fact['player'])}")
        print(f"   enemies: {', '.join(sorted(fact['enemy']))}")
    if not votes:
        print('\nNo battle-like record in the GameConfig matches these replays. Try the live config or other dumps.')
        return
    print('\nCandidate source lists (replays matched):')
    for path, n in votes.most_common(5):
        print(f'  {n:3d}/{len(files)}  {path}')
    top = votes.most_common(1)[0][0]
    print(f'\nLikely source: {top}')
    parent = resolve(config, top.rsplit('/', 1)[0]) if top.endswith('/battles') else None
    if isinstance(parent, dict) and 'id' in parent:
        print(f"  = the container with id {parent['id']!r}: use \"source\": {{\"type\": \"campaign\", \"id\": \"{parent['id']}\"}}")
    elif isinstance(resolve(config, top), dict) and resolve(config, top).get('eventType') == 'linearHeroEvent':
        event = resolve(config, top)
        print(f"  = a quest (linear hero event) {event['eventName']!r}, featuring {event.get('unitId')}: "
              f"use \"source\": {{\"type\": \"linear_hero_event\", \"id\": \"{event['eventName']}\"}}, \"tiers\": \"quest\"")
    elif '/battleSets/' in top:
        print(f"  = a battle set: use \"source\": {{\"type\": \"battle_set\", \"id\": \"{top.rsplit('/', 1)[1]}\"}}")
    def judge(offset):
        """Per replay: 'exact', 'tied' (several battles share the enemies, the title's is one of them) or 'contradicted',
        assuming list index == title number + offset."""
        verdicts = {}
        for f, fact in facts.items():
            idx = [i for path, i in matches[f] if path == top]
            number = re.search(r'_(\d+)$', fact['title'])
            want = int(number.group(1)) + offset if number else None
            verdicts[f] = 'exact' if len(idx) == 1 and idx[0] == want else 'tied' if want in idx else 'contradicted'
        return verdicts

    results = {offset: judge(offset) for offset in (0, -1)}
    for offset, verdicts in results.items():
        counts = collections.Counter(verdicts.values())
        name = 'title number' + (f' {offset:+d}' if offset else '')
        print(f"{name} == list index: {counts['exact']} exact, {counts['tied']} tied with other battles but consistent, "
              f"{counts['contradicted']} contradicted (of {len(files)}).")
    offset = min(results, key=lambda o: sum(v == 'contradicted' for v in results[o].values()))
    outliers = [facts[f]['title'] for f, v in results[offset].items() if v == 'contradicted']
    print(f'Best fit: "battle_index_regex": "_(\\\\d+)$"' + (f', "battle_index_offset": {offset}' if offset else '') + '.')
    if outliers:
        print(f'{len(outliers)} replay(s) do not fit: {", ".join(sorted(set(outliers)))}.')
        print('If most replays fit, those probably belong to a different battle source (leave them out of the gallery, or')
        print('run the finder on them separately); if few fit, the titles do not encode the index - use "battle_index_map":')
        index_map = {fact['title']: [i for path, i in matches[f] if path == top][0]
                     for f, fact in facts.items() if len([1 for path, _ in matches[f] if path == top]) == 1}
        print('  ' + json.dumps(index_map, indent=2).replace('\n', '\n  '))
    print('Ties mean the enemies cannot tell battles apart, so spot-check a couple of replays against the source.')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
