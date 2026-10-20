"""Builds a single self-contained HTML page of Tacticus Raidman replays: per battle, the player's character
portraits (with stars, rank and ability levels), the repeatable reward and a link to the replay.

Usage (run with -I so nothing is imported from the current directory):
    python3 -I build_gallery.py <gallery.json>

<gallery.json> describes the page - see ../references/config.md and ../examples/. Battle maps are rendered by
render_boards.ts (needs `npx tsx` and the repo's node_modules; skipped with a message if unavailable). Writes one file,
<out_dir>/index.html, with every image and the font embedded - nothing else to upload. Pillow is used to
shrink the images if it is installed; the font is fetched from Google Fonts at build time (the page links to
it instead if that fails).
"""
import base64
import csv
import hashlib
import io
import gzip
import html
import json
import os
import re
import shutil
import sys
import subprocess
import tempfile
import urllib.request

try:
    from PIL import Image
except ImportError:  # images are embedded at full size without it
    Image = None

PORTRAIT_PREFIX = 'ui_image_roundportrait_'
# Rank_N.png is rank N (Stone I-III = 0-2, Iron 3-5, Bronze 6-8, Silver 9-11, Gold 12-14, Diamond 15-17, 18-20 above that).
# Silver III was extracted under a different name; there is no Rank_11.png.
RANK_SPRITE_OVERRIDES = {11: 'IdunTextRRank_11.png'}
# Rarity enum as the replays record it (0-5, Common to Mythic); only these get a halo around the portrait.
HALO_CLASSES = {rarity: f'halo-{rarity}' for rarity in range(6)}   # every rarity gets a halo; colours come from QUEST_TIERS (halo_css)

# StarLevel runs 0-14 over five star slots: levels 1-5 are gold stars, 6-10 turn them red one at a
# time, 11-14 blue. Only the stars of the current colour are shown (3 red for level 8), not the
# leftover slots of the previous colour. (Inferred from the star sprites and the "3 or 4 red stars" these units show.)
STAR_SPRITES = {'gold': 'stars.png', 'red': 'star_epic.png', 'blue': 'star_legendary.png',
                # Level 14 (what would be four blue stars) is the mythic wings emblem instead.
                'wings': 'ui_icon_star_mythic_large_01.png'}
STAR_SLOTS = 5


def star_icons(star_level):
    """[(colour, count)] to draw for a star level: one colour, left to right."""
    if star_level <= 0:
        return []
    if star_level <= STAR_SLOTS:
        return [('gold', star_level)]
    if star_level <= 2 * STAR_SLOTS:
        return [('red', star_level - STAR_SLOTS)]
    if star_level >= 14:
        return [('wings', 1)]
    return [('blue', star_level - 2 * STAR_SLOTS)]


# Look borrowed from tacticus-raidman.com's own theme tokens (dark zinc surfaces, faint white borders, blue accent,
# Chakra Petch), read from its stylesheet - not from the rendered page.
PAGE_CSS = """
:root{--bg:oklch(14.1% .005 285.8);--card:oklch(21% .006 285.9);--border:oklch(100% 0 0/.1);--fg:oklch(98.5% 0 0);
  --muted:oklch(70.5% .015 286);--accent:oklch(70% .17 255);--radius:.625rem}
*{box-sizing:border-box}
i{display:block;flex:none;background:center/contain no-repeat}
body{margin:0;background:var(--bg);color:var(--fg);font-family:'Chakra Petch',ui-sans-serif,system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:32px 20px 48px}
header{margin-bottom:24px}
h1{margin:0;font-size:28px;font-weight:700;letter-spacing:.02em}
h1 .by{font-size:16px;font-weight:500;color:var(--muted);letter-spacing:0}
.roster{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;margin-bottom:24px;
  display:flex;flex-direction:column;align-items:center;gap:14px}
.roster .team{flex-wrap:wrap;row-gap:12px;align-items:flex-start}
.pair{display:flex;align-items:flex-start;gap:4px}
.arrow{align-self:flex-start;margin-top:36px;font-size:22px;line-height:1;color:var(--tier,#e8833a);font-weight:700}
.promo{display:flex;flex-direction:column;align-items:center;gap:4px;margin-bottom:6px}
.promo-label{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.promo-code{font-size:30px;font-weight:700;letter-spacing:.18em;color:#ffc107;padding:6px 22px;border:2px dashed #ffc107;border-radius:12px;
  background:rgba(255,193,7,.08);box-shadow:0 0 18px -6px #ffc107;user-select:all;cursor:copy}
.promo-note{margin-top:4px;font-size:14px;font-weight:500;color:var(--fg)}
.roster-note{margin:-6px 0 0;font-size:12px;color:var(--muted)}
.intro{margin:0;max-width:760px;text-align:center;line-height:1.55;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 20px 18px;
  display:flex;flex-direction:column;gap:14px;transition:border-color .15s;color:inherit;text-decoration:none}
.tier{margin-top:28px;--tier:var(--border)}
.tier h2{margin:0 0 12px;font-size:18px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--tier)}

.card.tiered{border:1.5px solid var(--tier);box-shadow:0 0 10px -3px var(--tier)}
.card:hover{box-shadow:0 0 14px -2px var(--tier)}
.card{position:relative}
.card-title::after{content:'';position:absolute;inset:0;z-index:1}
.map-open{position:absolute;opacity:0;pointer-events:none}
.map-thumb{position:relative;z-index:2;flex:none;cursor:zoom-in;border:1px solid var(--border);border-radius:6px;overflow:hidden;line-height:0}
.map-thumb:hover{border-color:var(--fg)}
.map-thumb i{width:54px;aspect-ratio:var(--ar)}
.lb{display:none;position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.88);flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;cursor:zoom-out}
.map-open:checked ~ .lb{display:flex}
.lb i{height:min(84vh,calc((100vw - 32px) / var(--ar)));aspect-ratio:var(--ar);border-radius:8px;box-shadow:0 8px 40px #000}
.lb-cap{color:#ddd;font-size:13px;text-align:center}
.bonuses{margin:0;padding:10px 0 0;border-top:1px solid var(--border);list-style:none;font-size:13px;color:var(--muted);display:flex;flex-direction:row;flex-wrap:wrap;gap:6px 22px}
.bonuses li{display:flex;align-items:center;gap:6px}
.bonuses li.unmet .req{text-decoration:line-through;text-decoration-thickness:2px;text-decoration-color:#e53935;opacity:.7}
.bonuses li.unmet b{text-decoration:line-through;text-decoration-color:#e53935;opacity:.7}
.bonuses li.unmet .restrict{opacity:.5}
.bonuses .why{color:#ff8a80;font-size:12px}
.warn{display:inline-block;white-space:nowrap;font-size:12px;font-weight:600;color:#ffb4a9;background:#5a1d1a;border:1px solid #e53935;border-radius:999px;padding:1px 9px}
.bonuses b{color:var(--tier,var(--fg))}
.restrict{position:relative;flex:none;width:28px;height:28px}.restrict i{width:28px;height:28px}
.restrict.no::after{content:'\\00d7';position:absolute;right:-3px;bottom:-3px;width:13px;height:13px;border-radius:50%;background:#e53935;
  border:1px solid #1a1a1a;color:#fff;font:700 12px/11px sans-serif;text-align:center}
.card-head{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px;min-height:56px;padding-bottom:10px;border-bottom:1px solid var(--border)}
.card-head .head-left{grid-column:1;display:flex;align-items:center;gap:12px;min-width:0}.card-head .warn{grid-column:2;justify-self:center}.card-head .reward,.card-head .reward-text{grid-column:3;justify-self:end}
.card-title{color:var(--fg);font-size:17px;font-weight:600;text-decoration:none}
.reward{position:relative;flex:none}
.reward i{position:absolute}
.reward.shard{width:60px;height:53px}.reward.shard>i:first-child{inset:0;width:100%;height:100%}
.reward .shard-portrait{width:36px;height:36px;left:12px;top:8.5px;border-radius:50%}
.reward.upgrade{width:52px;height:52px}
.reward .up-bg{inset:3px;width:46px;height:46px}
.reward .up-icon{inset:8px;width:36px;height:36px}
.reward .up-frame{inset:0;width:100%;height:100%}
.reward-text{font-size:12px;color:var(--muted)}
.card:hover .card-title{color:var(--accent)}
.team{display:flex;flex-wrap:wrap;justify-content:center;gap:12px 16px}
.unit{display:flex;flex-direction:column;align-items:center;gap:3px}
.unit i{width:64px;height:64px}
.pic{position:relative;width:64px;height:64px}
.unit i.rank{position:absolute;left:-12px;bottom:-5px;width:34px;height:31px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))}
.abilities{margin-top:3px;display:flex;justify-content:center;gap:6px;font-size:13px;font-weight:600;color:var(--muted)}
.ability{display:flex;flex-direction:column;align-items:center;width:34px}.ability i{width:32px;height:32px}
.stars{display:flex;justify-content:center;width:100%;height:14px}.stars i{width:13px;height:13px}.stars i.wings{width:42px;height:15px}
.missing{width:64px;font-size:10px;word-break:break-all;color:#e88}
.body{display:flex;flex-direction:column;gap:14px}
.rows .grid{grid-template-columns:minmax(0,1fr)}
@media (max-width:640px){.card-head{grid-template-columns:minmax(0,1fr) auto}.card-head .warn{grid-column:1 / -1;grid-row:2;justify-self:center}.card-head .reward,.card-head .reward-text{grid-column:2;grid-row:1}}
@media (max-width:540px){.grid{grid-template-columns:minmax(0,1fr)}.team{gap:12px 8px}.card{padding:12px 14px 14px}}
"""


def load_terms(i2_path):
    """Term -> English text from an I2Languages_en*.json. Empty if no path is configured."""
    if not i2_path:
        return {}
    data = json.load(open(os.path.expanduser(i2_path)))
    return {t['Term']: t['Languages'][0] for t in data['mSource']['mTerms'] if t.get('Languages')}


def objective_text(terms, objective):
    """(short name, full description) of a battle's bonus objective, in the game's words where it has them.
    NotTrait/NotFaction/NotDamageType/MaxHits/UseNoSummons/... use the legendary-event objective terms (name) and the
    linear-hero-event tooltip (description); NoDamageTakenByAnyHero has no term in the dump, so that wording is ours."""
    kind, target, score = objective.get('ObjectiveType'), str(objective.get('ObjectiveTarget')), objective.get('Score')
    values = {
        'TRAIT_NAME': terms.get(f'Traits/{target}_Name', target),
        'FACTION_NAME': terms.get(f'UnitDetails/Faction_{target}', target),
        'DAMAGE_TYPE': re.sub(r' Damage$', '', terms.get(f'S/{target}_Dmg', target)),
        'HITS': target, 'AMOUNT': str(score), 'ASTERISK': '',
    }

    def fill(text):
        text = re.sub(r'<[^>]+>', '', text)
        text = re.sub(r'\{\[(\w+)\]\}', lambda m: values.get(m.group(1), ''), text).strip()
        return re.sub(r'(\d)(Battle Score)', r'\1 \2', text)   # the tag that wrapped "Battle Score" also held the space

    name = terms.get(f'UI/LegendaryEvent_Objective_Name_{kind}')
    description = terms.get(f'UI/LinearHeroEvent_BPP_InfoTooltip_{kind}')
    if kind == 'NoDamageTakenByAnyHero':
        name, description = 'No damage taken', f'Gain +{score} Battle Score by not letting any hero take damage'
    return fill(name or kind), fill(description or kind)


# Sprite for each kind of bonus requirement, and whether it is a restriction (drawn with a small red cross). Traits and damage
# types and factions pick their own icon from the objective's target; anything not found is simply drawn without one.
TRAIT_ICON_OVERRIDES = {   # trait id -> sprite stem, where the sprite isn't ui_icon_trait_<snake_case>_01
    'TerminatorArmour': 'ui_icon_trait_terminator_amour_01',     # (sic) the game's own spelling
    'Psyker': 'ui_icon_trait_psychic_01',                         # inferred: no psyker-named trait icon
    'FinalJustice': 'ui_icon_uniteffect_final_vengeance',         # inferred: the trait is shown as "Final Vengeance"; no trait icon
}
OBJECTIVE_ICONS = {   # objective type -> (sprite stem or None, restriction?)
    'UseNoSummons': ('ui_icon_trait_summon_01', True),
    'DoNoHealOrRepair': ('ui_icon_trait_healer_01', True),
    'MaxHits': ('ui_icon_quest_score_hits', False),               # inferred
    'MinHits': ('ui_icon_quest_score_hits', False),               # inferred
    'HasRangedAttack': ('ui_icon_stat_rangedattack_01', False),
    'NoDamageTakenByAnyHero': ('damage', True),                   # the plain damage burst, as the user pointed out
}


def objective_icon(sprite_files, objective):
    """(sprite file name or None, restriction?) for a bonus objective. Restrictions (NotTrait, NotDamageType, NotFaction,
    UseNoSummons, DoNoHealOrRepair) are drawn with a small red cross over the icon of the thing that is banned."""
    kind, target = objective.get('ObjectiveType'), str(objective.get('ObjectiveTarget'))
    snake = re.sub(r'(?<!^)(?=[A-Z])', '_', target).lower()
    if kind in ('NotTrait',):
        stem, restriction = TRAIT_ICON_OVERRIDES.get(target, f'ui_icon_trait_{snake}_01'), True
    elif kind in ('NotDamageType', 'DamageType'):
        stem, restriction = f'ui_icon_damage_profile2_{target}', kind == 'NotDamageType'
    elif kind == 'NotFaction':
        # faction ids and sprite names differ in spelling (Ultramarines / ultramarine, BloodAngels / bloodangels): compare
        # lower-case names with a possible trailing "s" dropped
        wanted = normalize(target).rstrip('s')
        stem = next((f[:-4] for key, f in sprite_files.items() if key.startswith('ui_icon_trait_faction_')
                     and normalize(re.sub(r'^ui_icon_trait_faction_|(_01)?\.png$', '', key)).rstrip('s') == wanted), None)
        restriction = True
    else:
        stem, restriction = OBJECTIVE_ICONS.get(kind, (None, False))
    sprite = sprite_files.get(f'{stem}.png'.lower()) if stem else None
    return sprite, restriction


def load_unit_facts(gameconfig_path):
    """unit id -> what bonus objectives can be checked from the unit alone, read from clientGameConfig.units the way
    extract_character_data.ts does: traits, faction, the damage types it deals (melee weapon, ranged weapon, and the
    `damageProfile*` constants of its active and passive abilities), whether it has a ranged attack, and its hits
    (the ranged attack's if it has one, else the melee attack's - the game's wording for the max/min hits bonuses)."""
    units = json.load(open(gameconfig_path))['clientGameConfig']['units']
    abilities = units['abilities']
    facts = {}
    for unit_id, unit in units['lineup'].items():
        weapons = unit.get('weapons') or []   # machines of war and some NPC entries have none
        damage = {w['DamageProfile'] for w in weapons}
        for ability in list(unit.get('activeAbilities') or []) + list(unit.get('passiveAbilities') or []):
            for key, value in (abilities.get(ability, {}).get('constants') or {}).items():
                if key.startswith('damageProfile') and isinstance(value, str) and value:
                    damage.add(value)
        facts[unit_id] = {'traits': set(unit.get('traits') or []), 'faction': unit.get('FactionId'), 'damage': damage,
                          'ranged': len(weapons) > 1, 'hits': (weapons[-1]['hits'] if len(weapons) > 1 else weapons[0]['hits'] if weapons else None)}
    return facts


def check_objective(objective, lineup, facts):
    """(status, violating unit ids) of a bonus objective against the units deployed. Status is "met", "unmet", or
    "assumed" for the ones that depend on what happens in the battle (damage taken, summons, healing) - those would
    need the replay's event log, so they are taken as met rather than guessed at. A unit missing from the config
    can't be judged and is skipped."""
    kind, target = objective.get('ObjectiveType'), str(objective.get('ObjectiveTarget'))
    known = [(u, facts[u]) for u in lineup if u in facts]
    bad = {
        'NotTrait': lambda f: target in f['traits'],
        'NotFaction': lambda f: f['faction'] == target,
        'NotDamageType': lambda f: target in f['damage'],
        'DamageType': lambda f: target not in f['damage'],
        'HasRangedAttack': lambda f: not f['ranged'],
        'MaxHits': lambda f: f['hits'] is not None and f['hits'] > int(target),
        'MinHits': lambda f: f['hits'] is not None and f['hits'] < int(target),
    }.get(kind)
    if bad is None:
        return 'assumed', []
    violators = [u for u, f in known if bad(f)]
    return ('unmet' if violators else 'met'), violators


def plain_unit_id(unit):
    """Quest units are deployed as e.g. votanChampion_LHE; their portrait and abilities are the plain unit's. (Assumed from
    the quest battles' `deployedUnit`; not yet checked against a real quest replay.)"""
    return unit[:-4] if unit.endswith('_LHE') else unit


def normalize(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def load_portraits(sprites_dir):
    """normalized unit name -> sprite filename (the plain `_NN` file wins over copies like `_01 1`)."""
    best = {}
    for f in sorted(os.listdir(sprites_dir)):
        low = f.lower()
        if not (low.startswith(PORTRAIT_PREFIX) and low.endswith('.png')):
            continue
        stem = f[len(PORTRAIT_PREFIX):-4]
        key = normalize(re.sub(r'_\d+( \d+)?$', '', stem))
        is_copy = bool(re.search(r' \d+$', stem))
        if key not in best or (best[key][1] and not is_copy):
            best[key] = (f, is_copy)
    return {k: v[0] for k, v in best.items()}


def rank_sprite(rank):
    return RANK_SPRITE_OVERRIDES.get(rank, f'Rank_{rank}.png')


def load_avatar_ids(gameconfig_path):
    """unit id -> avatar id from clientGameConfig.avatars (`{"avatarId": "ultra_inceptor_01", "condition": "hasUnit",
    "value": "ultraInceptorSgt"}`); the round portrait is ui_image_RoundPortrait_<avatarId>.png. This is how the game
    picks a unit's portrait - the unit id and the portrait name don't always match (ultraInceptorSgt -> ultra_inceptor_01).
    Premium variants are skipped, as extract_character_data.ts does."""
    avatars = json.load(open(gameconfig_path))['clientGameConfig']['avatars']
    result = {}
    for avatar in avatars:
        if avatar.get('condition') == 'hasUnit' and 'premium' not in avatar['avatarId'].lower():
            result.setdefault(avatar['value'], avatar['avatarId'])
    return result


def load_ability_ids(gameconfig_path):
    """unit id -> (active ability id, passive ability id) from clientGameConfig.units.lineup. The replays
    only carry the passive's name (the active is a number), so both come from the config."""
    lineup = json.load(open(gameconfig_path))['clientGameConfig']['units']['lineup']
    return {
        unit: ((cfg.get('activeAbilities') or [None])[0], (cfg.get('passiveAbilities') or [None])[0])
        for unit, cfg in lineup.items()
    }


UPGRADE_RARITIES = {'C': 'common', 'U': 'uncommon', 'R': 'rare', 'E': 'epic', 'L': 'legendary', 'M': 'mythic'}


def repo_root():
    """The datamine repo root (it has hex_map_core.ts and node_modules). This skill lives in <root>/.claude/skills/<name>/."""
    here = os.path.dirname(os.path.abspath(__file__))
    for _ in range(6):
        if os.path.exists(os.path.join(here, 'hex_map_core.ts')):
            return here
        here = os.path.dirname(here)
    return None


def render_maps(assets_dir, out_dir, wanted, scale):
    """Render the battle maps for a set of (board id, spawn set) with scripts/render_boards.ts (the repo's hex_map_core:
    board texture cropped to the playable hexes, hex grid, deploy tiles blue, enemy spawns yellow) into out_dir/maps/.
    Returns {(board, spawn set): (relative path, width / height)} for the ones rendered; boards that couldn't be rendered
    are reported and simply get no map. Boards missing from the dump need extracting from a build that has them."""
    root = repo_root()
    npx = shutil.which('npx')
    if not (root and npx and Image):
        print('maps skipped: need the datamine repo (hex_map_core.ts), npx/tsx and Pillow')
        return {}
    maps_dir = os.path.join(out_dir, 'maps')
    os.makedirs(maps_dir, exist_ok=True)
    request_path = os.path.join(out_dir, 'boards.json')
    json.dump([{'board': b, 'spawnSet': n} for b, n in sorted(wanted)], open(request_path, 'w'))
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render_boards.ts')
    done = subprocess.run([npx, 'tsx', script, assets_dir, maps_dir, request_path, str(scale)],
                          cwd=root, capture_output=True, text=True, timeout=600)
    result = next((json.loads(line) for line in reversed(done.stdout.splitlines()) if line.startswith('{')), None)
    if done.returncode != 0 or result is None:
        print('maps skipped: the board renderer failed:', (done.stderr or done.stdout).strip()[-400:])
        return {}
    for problem in result['problems']:
        print(f"map problem, {problem['board']}: {problem['why']}")
    maps = {}
    for name in result['rendered']:
        board, spawn = name.rsplit('_s', 1)
        with Image.open(os.path.join(maps_dir, f'{name}.png')) as img:
            maps[(board, int(spawn))] = (f'maps/{name}.png', round(img.width / img.height, 4))
    return maps


def best_of(records):
    """Highest rank, rarity, star level and ability levels a unit had over its replays - each taken on its own,
    not from one record. A value no replay recorded stays None. Records are [rank, stars, active, passive, rarity]."""
    return [max((r[k] for r in records if r[k] is not None), default=None) for k in range(5)]


def load_source_battles(cfg, gameconfig_path):
    """The ordered battle list the replays' titles index into, or None when cfg['source'] is {"type": "none"}.
    type "campaign": clientGameConfig.battles.campaigns.<any type>[id == source.id].battles
    type "battle_set": clientGameConfig.battles.battleSets[source.id]
    type "linear_hero_event" (a quest): the battles of every tier of the clientGameConfig.liveEvents.idunLiveEventConfigs
        entry whose eventType is linearHeroEvent and whose eventName or unitId is source.id, in tier order; each battle
        gets a `_tier` (the tier's index) and `_pos` (its 1-based position inside the tier)."""
    source = cfg.get('source', {'type': 'none'})
    client = json.load(open(gameconfig_path))['clientGameConfig']
    if source['type'] == 'campaign':
        for campaigns in client['battles']['campaigns'].values():
            for campaign in campaigns:
                if campaign['id'] == source['id']:
                    return campaign['battles']
        sys.exit(f"campaign {source['id']!r} not found in {gameconfig_path}")
    if source['type'] == 'battle_set':
        if source['id'] not in client['battles']['battleSets']:
            sys.exit(f"battle set {source['id']!r} not found in {gameconfig_path}")
        return client['battles']['battleSets'][source['id']]
    if source['type'] == 'linear_hero_event':
        for event in client['liveEvents']['idunLiveEventConfigs']:
            if event.get('eventType') == 'linearHeroEvent' and source['id'] in (event.get('eventName'), event.get('unitId')):
                return [dict(battle, _tier=tier.get('index', t), _pos=k + 1)
                        for t, tier in enumerate(event['tiers']) for k, battle in enumerate(tier['battles'])]
        sys.exit(f"linear hero event {source['id']!r} (an eventName or unitId) not found in {gameconfig_path}")
    return None


def source_index(cfg, title):
    """Index into the source battle list for a replay title: cfg['battle_index_map'][title] if given (for titles that
    don't carry the index), else the first group of cfg['battle_index_regex'] plus cfg['battle_index_offset'] (-1 when
    the title's number is 1-based, as for linear hero events)."""
    if title in cfg.get('battle_index_map', {}):
        return int(cfg['battle_index_map'][title])
    return int(re.search(cfg['battle_index_regex'], title).group(1)) + cfg.get('battle_index_offset', 0)


def battle_number(cfg, battles, title):
    """The number shown for a battle. With a source it is the first of cfg['number_keys'] (default battleNr,
    battleId) the source battle has - so bonus battles like campaign 03B don't shift the numbering - else the
    position in the list + 1; without a source it is the regex's number itself."""
    index = source_index(cfg, title)
    if battles is None:
        return index - cfg.get('battle_index_offset', 0)
    for key in cfg.get('number_keys', ['battleNr', 'battleId']):
        found = re.match(r'\d+', str(battles[index].get(key, '')))
        if found:
            return int(found.group())
    return index + 1


# "tiers": "quest": a linear hero event's six tiers are, in order, these rarities (the tier sizes 3/3/5/3/2/1 match
# the Common 1-3 ... Mythic 1 naming players use). Shown highest first. Colours: brown, bronze, silver, gold, cyan, orange.
QUEST_TIERS = [('Common', '#8d6e63'), ('Uncommon', '#cd7f32'), ('Rare', '#c0c0c0'),
               ('Epic', '#ffc107'), ('Legendary', '#00e5ff'), ('Mythic', '#e8833a')]
TIER_PALETTE = ['#ffc107', '#00e5ff', '#e8833a', '#b388ff', '#69f0ae', '#ff6e90']


def tier_defs(cfg, battles):
    """The tier sections: cfg['tiers'] (ascending by 'last' = highest battle number in the tier), or with
    "tiers": "source" one section per `_tier` of the source battles (quest tiers), or none."""
    tiers = cfg.get('tiers')
    if tiers == 'quest':
        indexes = sorted({b['_tier'] for b in battles or [] if '_tier' in b})
        return [{'label': f'{QUEST_TIERS[t][0]} Tier', 'name': QUEST_TIERS[t][0], 'color': QUEST_TIERS[t][1], 'source_tier': t} for t in indexes]
    if tiers == 'source':
        indexes = sorted({b['_tier'] for b in battles or [] if '_tier' in b})
        return [{'label': f'Tier {i + 1}', 'color': TIER_PALETTE[i % len(TIER_PALETTE)], 'source_tier': t} for i, t in enumerate(indexes)]
    return tiers or []


def descending(cfg):
    """Quest pages list the hardest battles first: tiers and the battles within them run high to low."""
    return cfg.get('tiers') == 'quest'


def tier_of(cfg, defs, number, battle=None):
    """(index, tier dict) of the tier a battle falls in, or None. Source tiers use the battle's `_tier`; listed tiers
    use its number (numbers past the last tier land in it)."""
    for i, tier in enumerate(defs):
        if 'source_tier' in tier:
            if battle is not None and battle.get('_tier') == tier['source_tier']:
                return i, tier
        elif number <= tier['last']:
            return i, tier
    return (len(defs) - 1, defs[-1]) if defs and 'source_tier' not in defs[-1] else None


def load_replay(replay_path):
    return json.loads(gzip.decompress(base64.b64decode(open(replay_path).read())))


def recorded_at(data):
    """When the replay was recorded, as .NET ticks. StartingTimestamp is 0 in these files, so this is the
    first message's timestamp; unlike the filename it sorts correctly across days."""
    stamps = [m['Timestamp'] for m in data['Messages'] if m.get('Timestamp')]
    return min(stamps) if stamps else 0


def player_units(data):
    """[(unit id, rank, star level, active ability level, passive ability level, rarity)] for the recording player's
    units, in the order they were added. Anything the replay doesn't record is None."""
    recorded = set(data['RecordedPlayerIds'])
    ranks = data['MetaData'].get('UnitMetaData', {})
    stats = {u['ConfigId']['PureId']: u for u in data['BattleConfiguration']['Units']}
    units = []
    for m in data['Messages']:
        raw = m['Message'].get('MessageJson') or ''
        if '"AddUnitMessage"' not in raw:
            continue
        msg = json.loads(raw)
        unit = msg['UnitId']
        if msg['PlayerId'] in recorded and unit not in [u[0] for u in units]:
            stat = stats.get(unit, {})
            units.append((unit, ranks.get(unit, {}).get('rank'), stat.get('StarLevel'),
                          stat.get('ActiveAbilityLevel'), stat.get('PassiveAbilityLevel'), stat.get('Rarity')))
    return units


def build_page(cfg, replays_dir, assets_dir, csv_path, out_dir):
    """The page's HTML, referencing the sprites it copies into out_dir/<portraits|ranks|stars|abilities|rewards>/."""
    sprites_dir = os.path.join(assets_dir, 'sprites')
    portraits = load_portraits(sprites_dir)
    sprite_files = {f.lower(): f for f in os.listdir(sprites_dir)}
    ability_ids = load_ability_ids(os.path.join(assets_dir, 'text_assets', 'GameConfig'))
    avatar_ids = load_avatar_ids(os.path.join(assets_dir, 'text_assets', 'GameConfig'))

    def portrait_file(unit):
        """The round-portrait sprite for a unit: the config's avatar for it, else the best name match."""
        for candidate in (unit, plain_unit_id(unit)):
            avatar = avatar_ids.get(candidate)
            if avatar and f'ui_image_roundportrait_{avatar}.png'.lower() in sprite_files:
                return sprite_files[f'ui_image_roundportrait_{avatar}.png'.lower()]
        return portraits.get(normalize(unit)) or portraits.get(normalize(plain_unit_id(unit)))
    os.makedirs(os.path.join(out_dir, 'abilities'), exist_ok=True)
    missing_abilities = set()

    def ability_html(ability_id, level, kind):
        """An ability's icon above its level; just the level when the icon can't be found."""
        sprite = sprite_files.get(f'ui_icon_ability2_{ability_id}.png'.lower()) if ability_id else None
        icon = ''
        if sprite:
            shutil.copyfile(os.path.join(sprites_dir, sprite), os.path.join(out_dir, 'abilities', sprite))
            icon = f'<img src="abilities/{html.escape(sprite)}" alt="{html.escape(ability_id)}" title="{html.escape(ability_id)}">'
        else:
            missing_abilities.add(ability_id)
        return f'<div class="ability">{icon}<span title="{kind} ability level">{level}</span></div>'
    os.makedirs(os.path.join(out_dir, 'portraits'), exist_ok=True)
    os.makedirs(os.path.join(out_dir, 'ranks'), exist_ok=True)
    os.makedirs(os.path.join(out_dir, 'bonuses'), exist_ok=True)
    os.makedirs(os.path.join(out_dir, 'stars'), exist_ok=True)
    for name in STAR_SPRITES.values():
        shutil.copyfile(os.path.join(sprites_dir, name), os.path.join(out_dir, 'stars', name))
    battles = load_source_battles(cfg, os.path.join(assets_dir, 'text_assets', 'GameConfig'))
    missing_rewards = set()
    os.makedirs(os.path.join(out_dir, 'rewards'), exist_ok=True)

    def reward_sprite(name):
        """Copy a sprite into rewards/ and return its relative path, or None if it isn't in the dump."""
        sprite = sprite_files.get(name.lower())
        if not sprite:
            return None
        shutil.copyfile(os.path.join(sprites_dir, sprite), os.path.join(out_dir, 'rewards', sprite))
        return f'rewards/{html.escape(sprite)}'

    def reward_html(chance_of):
        """The battle's repeatable drop (`chanceOf`: an upgrade, unit shards or mythic shards) as stacked sprites."""
        item, _, odds = chance_of.partition('%')
        tip = html.escape(f'{item} ({odds})' if odds else item)
        shard = re.match(r'(shards|mythicShards)_(\w+)$', item)
        upgrade = re.match(r'upg(?:Hp|Arm|Dmg)([CURELM])\d', item)
        if shard:
            mythic = shard.group(1) == 'mythicShards'
            portrait = portrait_file(shard.group(2))
            layers = [
                reward_sprite('ui_icon_character_shard_mythic.png' if mythic else 'ui_icon_character_shard_default.png'),
                portrait and reward_sprite(portrait),
            ]
            if all(layers):
                return f'<div class="reward shard" title="{tip}"><img src="{layers[0]}"><img class="shard-portrait" src="{layers[1]}"></div>'
        elif upgrade:
            layers = [
                reward_sprite('ui_underlay_upgrades.png'),
                reward_sprite(f'ui_icon_upgrade_{item}.png'),
                reward_sprite(f'ui_frame_upgrades_{UPGRADE_RARITIES[upgrade.group(1)]}.png'),
            ]
            if all(layers):
                return (f'<div class="reward upgrade" title="{tip}"><img class="up-bg" src="{layers[0]}">'
                        f'<img class="up-icon" src="{layers[1]}"><img class="up-frame" src="{layers[2]}"></div>')
        missing_rewards.add(item)
        return f'<div class="reward-text" title="{tip}">{html.escape(item)}</div>'

    def unit_html(unit, rank, star_level, active_level, passive_level, rarity):
        """One unit: stars, rarity-haloed portrait, rank icon, then its two ability icons and levels."""
        sprite = portrait_file(unit)
        if not sprite:
            missing.add(unit)
            portrait = f'<span class="missing" title="{html.escape(unit)}">{html.escape(unit)}</span>'
        else:
            shutil.copyfile(os.path.join(sprites_dir, sprite), os.path.join(out_dir, 'portraits', sprite))
            portrait = f'<img class="{HALO_CLASSES.get(rarity, "")}" src="portraits/{html.escape(sprite)}" alt="{html.escape(unit)}" title="{html.escape(unit)}">'
        rank_html = ''
        if rank is not None:
            rsprite = rank_sprite(rank)
            if os.path.exists(os.path.join(sprites_dir, rsprite)):
                shutil.copyfile(os.path.join(sprites_dir, rsprite), os.path.join(out_dir, 'ranks', rsprite))
                rank_html = f'<img class="rank" src="ranks/{rsprite}" alt="rank {rank}" title="rank {rank}">'
            else:
                missing_ranks.add(rank)
                rank_html = f'<span class="missing">rank {rank}</span>'
        stars_html = ''
        if star_level is not None:
            slots = ''.join(
                (f'<img class="wings" src="stars/{STAR_SPRITES[colour]}">' if colour == 'wings' else f'<img src="stars/{STAR_SPRITES[colour]}">') * count for colour, count in star_icons(star_level)
            )
            stars_html = f'<div class="stars" title="star level {star_level}">{slots}</div>'
        # Active ability on the left, passive on the right (the tertiary level is 0 for every unit here).
        abilities_html = ''
        if active_level is not None and passive_level is not None:
            active_id, passive_id = ability_ids.get(unit) or ability_ids.get(plain_unit_id(unit), (None, None))
            abilities_html = (
                f'<div class="abilities">{ability_html(active_id, active_level, "active")}'
                f'{ability_html(passive_id, passive_level, "passive")}</div>'
            )
        return f'<div class="unit">{stars_html}<div class="pic">{portrait}{rank_html}</div>{abilities_html}</div>'

    tiers = tier_defs(cfg, battles)
    cards, missing, missing_ranks = [], set(), set()
    roster_seen = {}   # unit id -> [[rank, stars, active, passive, rarity], ...] over the replays shown
    boost = cfg.get('roster_boost') or {}
    boost_seen = {}    # same, over the replays named in cfg['roster_boost']['replays'] (kept out of roster_seen)
    with open(csv_path, newline='') as f:
        rows = list(csv.DictReader(f))
    replays = [load_replay(os.path.join(replays_dir, row['filename'])) for row in rows]
    # Several replays of one battle: keep only the most recently recorded - except replays named in cfg["variant_labels"]
    # ({"<csv filename>": "label"}), which are different takes on the same battle and are all kept.
    variants = cfg.get('variant_labels', {})
    latest = {}
    for i, (row, data) in enumerate(zip(rows, replays)):
        key = (row['title'], row['filename']) if row['filename'] in variants else (row['title'], None)
        if key not in latest or recorded_at(data) > recorded_at(replays[latest[key]]):
            latest[key] = i
    skipped = len(rows) - len(latest)
    terms = load_terms(cfg.get('i2_path'))
    map_files = {}
    if battles and cfg.get('maps', True):
        wanted = set()
        for i in latest.values():
            battle = battles[source_index(cfg, rows[i]['title'])]
            if battle.get('BoardId') or battle.get('boardId'):
                wanted.add((battle.get('BoardId') or battle.get('boardId'), battle.get('SpawnPointsSet', 0)))
        map_files = render_maps(assets_dir, out_dir, wanted, cfg.get('map_scale', 0.4))
    unit_facts = load_unit_facts(os.path.join(assets_dir, 'text_assets', 'GameConfig'))
    short_name = lambda unit: terms.get(f'Units/{unit}_ExtraShortName') or terms.get(f'Units/{unit}_ShortName') or unit
    for i in sorted(latest.values()):
        row = rows[i]
        replay_units = player_units(replays[i])
        for unit, *stats in replay_units:
            (boost_seen if row['filename'] in boost.get('replays', []) else roster_seen).setdefault(unit, []).append(stats)
        imgs = [unit_html(unit, *stats) for unit, *stats in replay_units]
        number = battle_number(cfg, battles, row['title'])
        source_battle = battles[source_index(cfg, row['title'])] if battles else None
        tier = tier_of(cfg, tiers, number, source_battle)
        chance_of = battles and battles[source_index(cfg, row['title'])].get('loot', {}).get('chanceOf')
        reward = reward_html(chance_of) if chance_of else ''
        label = cfg.get('label', '{title} Battle {n}').format(
            title=cfg['title'], n=number, tier=(tier[1].get('name') or '') if tier else '', k=(source_battle or {}).get('_pos', number))
        if row['filename'] in variants:
            label += f' ({variants[row["filename"]]})'
        bonuses, warning = '', ''
        if source_battle and source_battle.get('Objectives'):
            items, unmet = [], []
            lineup = [unit for unit, *_ in replay_units]
            for objective in source_battle['Objectives']:
                name, description = objective_text(terms, objective)
                status, violators = check_objective(objective, lineup, unit_facts)
                sprite, restriction = objective_icon(sprite_files, objective)
                if sprite:
                    shutil.copyfile(os.path.join(sprites_dir, sprite), os.path.join(out_dir, 'bonuses', sprite))
                    icon = f'<span class="restrict{" no" if restriction else ""}"><img src="bonuses/{html.escape(sprite)}" alt=""></span>'
                else:
                    icon = '<span class="restrict blank"></span>'
                who = ', '.join(short_name(u) for u in violators)
                if status == 'unmet':
                    unmet.append((name, who))
                    description += f' - NOT MET in this replay: {who}'
                elif status == 'assumed':
                    description += ' (not checked: it depends on what happens in the battle)'
                items.append(f'<li class="{status}" title="{html.escape(description)}">{icon}<b>+{objective.get("Score")}</b> '
                             f'<span class="req">{html.escape(name)}</span>'
                             + (f' <span class="why">{html.escape(who)}</span>' if status == 'unmet' else '') + '</li>')
            if terms:
                bonuses = f'<ul class="bonuses" title="Bonus requirements">{"".join(items)}</ul>'
            if unmet:
                tip = '; '.join(f'{name}: {who}' for name, who in unmet)
                warning = (f'<span class="warn" title="{html.escape(tip)}">\u26a0 '
                           f'{len(unmet)} bonus{"es" if len(unmet) > 1 else ""} not met</span>')
        map_toggle = map_thumb = map_overlay = ''
        if source_battle:
            board = source_battle.get('BoardId') or source_battle.get('boardId')
            found = map_files.get((board, source_battle.get('SpawnPointsSet', 0)))
            if found:
                path_, ratio = found
                toggle = f'map-{i}'
                picture = f'src="{path_}" alt="Map {html.escape(board)}" style="--ar:{ratio}"'
                map_toggle = f'<input type="checkbox" id="{toggle}" class="map-open" aria-label="Show the map of {html.escape(board)}">'
                map_thumb = f'<label class="map-thumb" for="{toggle}" title="Show the map"><img class="map" {picture}></label>'
                map_overlay = (f'<label class="lb" for="{toggle}"><img class="map-full" {picture}>'
                               f'<span class="lb-cap">{html.escape(board)} \u00b7 blue: where you deploy \u00b7 yellow: enemy spawns \u00b7 click to close</span></label>')
        # The title link is stretched over the whole card (see .card-title::after) so the card is clickable, while the map
        # thumbnail sits above it as its own control - a link can't contain another interactive element.
        cards.append((number, tier and tier[0], f'<div class="card{" tiered tier-%d" % tier[0] if tier else ""}">{map_toggle}'
            f'<div class="card-head"><div class="head-left">{map_thumb}<a class="card-title" href="{html.escape(row["url"] or "#")}">{html.escape(label)}</a></div>{warning}{reward}</div>'
            f'<div class="body"><div class="team">{"".join(imgs)}</div>{bonuses}</div>{map_overlay}</div>'
        ))
    # The best each unit reached in any replay shown, in the order the units first appear.
    # With cfg["roster_boost"] = {"replays": [...], "label": "Super juiced"}: the roster shows each unit's normal best, and
    # for units that are better in the boosted replays, an arrow to that boosted version. Units that only appear boosted
    # are shown boosted (there is no normal version to point from); units whose stats don't differ get no arrow.
    boost_label = boost.get('label', 'Boosted')
    slots = 0
    parts = []
    for unit, records in roster_seen.items():
        normal = best_of(records)
        boosted = best_of(boost_seen[unit]) if unit in boost_seen else None
        if boosted and boosted != normal:
            parts.append(f'<div class="pair">{unit_html(unit, *normal)}<span class="arrow" title="{html.escape(boost_label)} version">\u2192</span>'
                         f'<div class="boosted" title="{html.escape(boost_label)} version">{unit_html(unit, *boosted)}</div></div>')
            slots += 2.4
        else:
            parts.append(unit_html(unit, *normal))
            slots += 1
    for unit, records in boost_seen.items():
        if unit not in roster_seen:
            parts.append(f'<div class="boosted" title="{html.escape(boost_label)} version only">{unit_html(unit, *best_of(records))}</div>')
            slots += 1
    roster_html = ''.join(parts)
    # Wrap a long roster into evenly filled rows (12 units -> 6 + 6, not 11 + 1): each unit column is ~90px with its gap.
    rows_needed = max(1, -(-int(slots + .5) // 8))
    # (one unit of slack: arrow pairs are atomic and wouldn't pack into a width of exactly slots / rows)
    roster_style = f' style="max-width:{(-(-int(slots + .5) // rows_needed) + 1) * 90}px"' if rows_needed > 1 else ''
    roster_note = ''
    if boost_seen:
        roster_note = f'<p class="roster-note">\u2192 points to the {html.escape(boost_label.lower())} version of a character</p>'
    high_first = descending(cfg)
    layout = cfg.get('layout', 'rows' if high_first else 'grid')   # quests list one battle per row, like the in-game quest screen
    if tiers:
        tier_sections = ''.join(
            f'<section class="tier tier-{i}"><h2>{html.escape(tier["label"])}</h2><div class="grid">'
            + ''.join(card for number, index, card in sorted(cards, key=lambda c: c[0], reverse=high_first) if index == i)
            + '</div></section>'
            for i, tier in (reversed(list(enumerate(tiers))) if high_first else enumerate(tiers))
            if any(index == i for _, index, _ in cards)
        )
    else:
        tier_sections = '<section class="tier"><div class="grid">' + ''.join(c for _, _, c in sorted(cards, key=lambda c: c[0])) + '</div></section>'
    # The halo around a portrait is its rarity's colour - the same palette as the quest tiers (Common brown ... Mythic orange).
    halo_css = ''.join(f'.halo-{i}{{border-radius:50%;box-shadow:0 0 8px 3px {color}}}' for i, (_, color) in enumerate(QUEST_TIERS))
    tier_css = ''.join(f'.tier-{i}{{--tier:{tier["color"]}}}' for i, tier in enumerate(tiers))
    byline = f' <span class="by">by {html.escape(cfg["author"])}</span>' if cfg.get('author') else ''
    page_title = html.escape(cfg['title'] + (f' by {cfg["author"]}' if cfg.get('author') else ''))
    promo = (f'<div class="promo"><span class="promo-label">{html.escape(cfg.get("promo_label", "Promo code"))}</span>'
             f'<span class="promo-code" title="Click to select, then copy">{html.escape(cfg["promo_code"])}</span>'
             + (f'<span class="promo-note">{html.escape(cfg["promo_note"])}</span>' if cfg.get('promo_note') else '') + '</div>') if cfg.get('promo_code') else ''
    intro = f'<p class="intro">{html.escape(cfg["intro"])}</p>' if cfg.get('intro') else ''
    page = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width, initial-scale=1"><title>{page_title}</title>'
        '<link rel="preconnect" href="https://fonts.googleapis.com">'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap">'
        f'<style>{PAGE_CSS}{tier_css}{halo_css}</style></head><body><main{" class=rows" if layout == "rows" else ""}>'
        f'<header><h1>{html.escape(cfg["title"])}{byline}</h1></header>'
        f'<section class="roster">{promo}<div class="team"{roster_style}>{roster_html}</div>{roster_note}{intro}</section>'
        f'{tier_sections}</main></body></html>'
    )
    print(f'{len(cards)} replays ({skipped} earlier attempts at the same battle left out)')
    if any(not row['url'] for row in rows):
        print('some replays have no URL yet: their cards link to "#" until the replays are uploaded and the CSV is filled in')
    if missing:
        print('no portrait for:', ', '.join(sorted(missing)))
    if missing_rewards:
        print('no reward icon for:', sorted(missing_rewards))
    if missing_abilities:
        print('no ability icon for:', sorted(a for a in missing_abilities if a))
    if missing_ranks:
        print('no rank icon for ranks:', sorted(missing_ranks))
    return page


# Longest side (px) to shrink each sprite folder's images to: about twice the size they're drawn at.
IMAGE_MAX_PX = {'portraits': 192, 'ranks': 128, 'stars': 128, 'abilities': 96, 'rewards': 192, 'bonuses': 96, 'maps': 700}
MAP_WEBP_QUALITY = 72   # battle maps are photographic textures: WebP is ~8x smaller than PNG and the hex overlay survives it
FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap'
FONT_LINK_TAGS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    f'<link rel="stylesheet" href="{FONT_CSS_URL}">'
)


def image_bytes(path, folder):
    """(bytes, mime type) of an image ready to embed: shrunk to about twice its display size when Pillow is there,
    and battle maps re-encoded as WebP."""
    data = open(path, 'rb').read()
    if Image is None:
        return data, 'image/png'
    img = Image.open(io.BytesIO(data))
    img.thumbnail((IMAGE_MAX_PX[folder],) * 2, Image.LANCZOS)  # only ever shrinks
    out = io.BytesIO()
    if folder == 'maps':
        img.convert('RGB').save(out, 'WEBP', quality=MAP_WEBP_QUALITY, method=6)
        return out.getvalue(), 'image/webp'
    img.save(out, 'PNG', optimize=True)
    return out.getvalue(), 'image/png'


def embedded_font_css():
    """@font-face rules for the latin subset of Chakra Petch with the font files inlined, or None on any failure."""
    try:
        # A browser user agent makes Google serve woff2 files.
        fetch = lambda url: urllib.request.urlopen(urllib.request.Request(
            url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0'}), timeout=30).read()
        css = fetch(FONT_CSS_URL).decode()
        faces = []
        for block in re.findall(r'/\* latin \*/\s*@font-face\s*\{(.*?)\}', css, re.S):
            url = re.search(r'url\((https://[^)]+)\)', block).group(1)
            data = base64.b64encode(fetch(url)).decode()
            faces.append('@font-face{' + block.replace(url, f'data:font/woff2;base64,{data}').strip() + '}')
        return ''.join(faces) or None
    except Exception as e:
        print('could not embed the font, linking Google Fonts instead:', e)
        return None


def make_self_contained(page, work_dir):
    """Swap every <img> for an <i> drawn with a CSS background and put each distinct image in the stylesheet once
    as a data URI (the same portraits and icons repeat on every card), then inline the font."""
    classes, rules = {}, []   # sha1 of image bytes -> css class

    def swap(match):
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', match.group(1)))
        src = html.unescape(attrs['src'])
        data, mime = image_bytes(os.path.join(work_dir, src), src.split('/')[0])
        key = hashlib.sha1(data).hexdigest()
        if key not in classes:
            classes[key] = f'img-{len(classes)}'
            rules.append(f'.{classes[key]}{{background-image:url(data:{mime};base64,{base64.b64encode(data).decode()})}}')
        out = f'<i class="{(attrs.get("class") + " " if attrs.get("class") else "")}{classes[key]}" role="img"'
        if 'alt' in attrs:
            out += f' aria-label="{attrs["alt"]}"'
        if 'title' in attrs:
            out += f' title="{attrs["title"]}"'
        if 'style' in attrs:   # e.g. a map's aspect ratio
            out += f' style="{attrs["style"]}"'
        return out + '></i>'

    page = re.sub(r'<img\b([^>]*)>', swap, page)
    font_css = embedded_font_css()
    if font_css:
        page = page.replace(FONT_LINK_TAGS, '')
    return page.replace('</style>', ''.join(rules) + (font_css or '') + '</style>', 1)


def main(config_path):
    config_path = os.path.expanduser(config_path)
    cfg = json.load(open(config_path))
    base = os.path.dirname(os.path.abspath(config_path))
    path = lambda key: os.path.join(base, os.path.expanduser(cfg[key]))   # relative paths are relative to the config
    with tempfile.TemporaryDirectory() as work_dir:
        page = make_self_contained(build_page(cfg, path('replays_dir'), path('assets_dir'), path('csv'), work_dir), work_dir)
    out_dir = path('out_dir')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'index.html')
    with open(out_path, 'w') as f:
        f.write(page)
    print(f'{len(page) / 1e6:.1f} MB -> {out_path}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
