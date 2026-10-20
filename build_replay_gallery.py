"""Builds a single self-contained HTML page of Tacticus Raidman replays: per battle, the player's character
portraits (with stars, rank and ability levels), the repeatable reward and a link to the replay.

Usage (run with -I so nothing is imported from the current directory):
    python3 -I build_replay_gallery.py <replays_dir> <extracted_assets_dir> <replays.csv> <out_dir>

<replays_dir> holds the *.replay.txt files (base64 -> gzip -> JSON), <extracted_assets_dir> is an
extracted_assets* folder (its sprites/ holds the icons, its text_assets/GameConfig names each unit's
abilities and the campaign's battles), <replays.csv> has title,filename,url columns. Writes one file,
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
HALO_CLASSES = {3: 'halo-epic', 4: 'halo-legendary'}

# StarLevel runs 0-14 over five star slots: levels 1-5 are gold stars, 6-10 turn them red one at a
# time, 11-14 blue. Only the stars of the current colour are shown (3 red for level 8), not the
# leftover slots of the previous colour. (Inferred from the star sprites and the "3 or 4 red stars" these units show.)
STAR_SPRITES = {'gold': 'stars.png', 'red': 'star_epic.png', 'blue': 'star_legendary.png'}
STAR_SLOTS = 5


def star_icons(star_level):
    """[(colour, count)] to draw for a star level: one colour, left to right."""
    if star_level <= 0:
        return []
    if star_level <= STAR_SLOTS:
        return [('gold', star_level)]
    if star_level <= 2 * STAR_SLOTS:
        return [('red', star_level - STAR_SLOTS)]
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
.roster .team{flex-wrap:wrap;row-gap:12px}
.intro{margin:0;max-width:760px;text-align:center;line-height:1.55;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 20px 18px;
  display:flex;flex-direction:column;gap:14px;transition:border-color .15s;color:inherit;text-decoration:none}
.tier{margin-top:28px;--tier:var(--border)}
.tier h2{margin:0 0 12px;font-size:18px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--tier)}
.tier-epic{--tier:#ffc107}.tier-legendary{--tier:#00e5ff}.tier-mythic{--tier:#e8833a}
.card.tier-epic,.card.tier-legendary,.card.tier-mythic{border:1.5px solid var(--tier);box-shadow:0 0 10px -3px var(--tier)}
.card:hover{box-shadow:0 0 14px -2px var(--tier)}
.card-head{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:56px;padding-bottom:10px;border-bottom:1px solid var(--border)}
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
.team{display:flex;justify-content:center;gap:16px}
.unit{display:flex;flex-direction:column;align-items:center;gap:2px}
.halo-legendary{border-radius:50%;box-shadow:0 0 8px 3px #00e5ff}
.halo-epic{border-radius:50%;box-shadow:0 0 8px 3px #ffc107}
.unit i{width:64px;height:64px}.unit i.rank{width:40px;height:36px}
.abilities{display:flex;justify-content:center;gap:6px;font-size:13px;font-weight:600;color:var(--muted)}
.ability{display:flex;flex-direction:column;align-items:center;width:34px}.ability i{width:32px;height:32px}
.stars{display:flex;justify-content:center;width:100%;height:14px}.stars i{width:13px;height:13px}
.missing{width:64px;font-size:10px;word-break:break-all;color:#e88}
@media (max-width:540px){.grid{grid-template-columns:1fr}.team{gap:8px}}
"""


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


def load_ability_ids(gameconfig_path):
    """unit id -> (active ability id, passive ability id) from clientGameConfig.units.lineup. The replays
    only carry the passive's name (the active is a number), so both come from the config."""
    lineup = json.load(open(gameconfig_path))['clientGameConfig']['units']['lineup']
    return {
        unit: ((cfg.get('activeAbilities') or [None])[0], (cfg.get('passiveAbilities') or [None])[0])
        for unit, cfg in lineup.items()
    }


# The campaign these replays belong to (the Death Guard Extremis, Sisterhood/Black Templars as the player's
# factions). Replay id Extremis_N is index N of its `battles` list, which includes the 03B/13B/25B bonus battles.
CAMPAIGN_ID = 'eventExtremis4'

UPGRADE_RARITIES = {'C': 'common', 'U': 'uncommon', 'R': 'rare', 'E': 'epic', 'L': 'legendary', 'M': 'mythic'}


AUTHOR = 'Kharnage'
INTRO = (
    'This is a walkthrough of the Death Guard Extremis campaign event, using gold 1 35/35 Celestine and '
    'gold 1 48/35 Roswitha. This does not cover the challenge battles, nor does it give you a lightning '
    'victory in every battle. It does, however, give a 3-star clear in every battle, and it gives a '
    "lightning victory against Mortarion, netting you Typhus's relic. "
    'Also, the first six battles were simple enough that I did not bother copying the replays for them.'
)


def best_of(records):
    """Highest rank, rarity, star level and ability levels a unit had over its replays - each taken on its own,
    not from one record. A value no replay recorded stays None. Records are [rank, stars, active, passive, rarity]."""
    return [max((r[k] for r in records if r[k] is not None), default=None) for k in range(5)]


def load_campaign_battles(gameconfig_path):
    campaigns = json.load(open(gameconfig_path))['clientGameConfig']['battles']['campaigns']['Event']
    return next(c for c in campaigns if c['id'] == CAMPAIGN_ID)['battles']


# Difficulty tiers by the adjusted battle number (the one shown on the page): (label, css class, last battle in it).
TIERS = [('Epic Tier', 'epic', 11), ('Legendary Tier', 'legendary', 22), ('Mythic Tier', 'mythic', 30)]


def tier_of(number):
    return next((t for t in TIERS if number <= t[2]), TIERS[-1])


def battle_number(title):
    """Extremis battle number shown on the page, from a title like CampaignEvent_Extremis_8. The ids in the
    replays skip some numbers (nothing was played on 14 or 27) and are zero based, so: subtract 1 from id 3
    on, 1 more from id 14 on, 1 more from id 27 on, then add 1."""
    n = int(re.search(r'_(\d+)$', title).group(1))
    return n + 1 - (n >= 3) - (n >= 14) - (n >= 27)


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


def build_page(replays_dir, assets_dir, csv_path, out_dir):
    """The page's HTML, referencing the sprites it copies into out_dir/<portraits|ranks|stars|abilities|rewards>/."""
    sprites_dir = os.path.join(assets_dir, 'sprites')
    portraits = load_portraits(sprites_dir)
    sprite_files = {f.lower(): f for f in os.listdir(sprites_dir)}
    ability_ids = load_ability_ids(os.path.join(assets_dir, 'text_assets', 'GameConfig'))
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
    os.makedirs(os.path.join(out_dir, 'stars'), exist_ok=True)
    for name in STAR_SPRITES.values():
        shutil.copyfile(os.path.join(sprites_dir, name), os.path.join(out_dir, 'stars', name))
    battles = load_campaign_battles(os.path.join(assets_dir, 'text_assets', 'GameConfig'))
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
            portrait = portraits.get(normalize(shard.group(2)))
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
        sprite = portraits.get(normalize(unit))
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
                f'<img src="stars/{STAR_SPRITES[colour]}">' * count for colour, count in star_icons(star_level)
            )
            stars_html = f'<div class="stars" title="star level {star_level}">{slots}</div>'
        # Active ability on the left, passive on the right (the tertiary level is 0 for every unit here).
        abilities_html = ''
        if active_level is not None and passive_level is not None:
            active_id, passive_id = ability_ids.get(unit, (None, None))
            abilities_html = (
                f'<div class="abilities">{ability_html(active_id, active_level, "active")}'
                f'{ability_html(passive_id, passive_level, "passive")}</div>'
            )
        return f'<div class="unit">{stars_html}{portrait}{rank_html}{abilities_html}</div>'

    cards, missing, missing_ranks = [], set(), set()
    roster_seen = {}   # unit id -> [[rank, stars, active, passive, rarity], ...] over the replays shown
    with open(csv_path, newline='') as f:
        rows = list(csv.DictReader(f))
    replays = [load_replay(os.path.join(replays_dir, row['filename'])) for row in rows]
    # Several replays of one battle: keep only the most recently recorded.
    latest = {}
    for i, (row, data) in enumerate(zip(rows, replays)):
        if row['title'] not in latest or recorded_at(data) > recorded_at(replays[latest[row['title']]]):
            latest[row['title']] = i
    skipped = len(rows) - len(latest)
    for i in sorted(latest.values()):
        row = rows[i]
        replay_units = player_units(replays[i])
        for unit, *stats in replay_units:
            roster_seen.setdefault(unit, []).append(stats)
        imgs = [unit_html(unit, *stats) for unit, *stats in replay_units]
        number = battle_number(row['title'])
        cards.append((number, f'<a class="card tier-{tier_of(number)[1]}" href="{html.escape(row["url"])}"><div class="card-head"><span class="card-title">'
            f'Death Guard Extremis Battle {number}</span>'
            f'{reward_html(battles[int(re.search(r"_(\d+)$", row["title"]).group(1))]["loot"]["chanceOf"])}</div>'
            f'<div class="team">{"".join(imgs)}</div></a>'
        ))
    # The best each unit reached in any replay shown, in the order the units first appear.
    roster_html = ''.join(unit_html(unit, *best_of(records)) for unit, records in roster_seen.items())
    tier_sections = ''.join(
        f'<section class="tier tier-{css}"><h2>{label}</h2><div class="grid">'
        + ''.join(card for number, card in sorted(cards) if tier_of(number)[1] == css)
        + '</div></section>'
        for label, css, _ in TIERS
        if any(tier_of(number)[1] == css for number, _ in cards)
    )
    page = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Death Guard Extremis by Kharnage</title>'
        '<link rel="preconnect" href="https://fonts.googleapis.com">'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap">'
        f'<style>{PAGE_CSS}</style></head><body><main>'
        f'<header><h1>Death Guard Extremis <span class="by">by {AUTHOR}</span></h1></header>'
        f'<section class="roster"><div class="team">{roster_html}</div><p class="intro">{html.escape(INTRO)}</p></section>'
        f'{tier_sections}</main></body></html>'
    )
    print(f'{len(cards)} replays ({skipped} earlier attempts at the same battle left out)')
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
IMAGE_MAX_PX = {'portraits': 192, 'ranks': 128, 'stars': 48, 'abilities': 96, 'rewards': 192}
FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&display=swap'
FONT_LINK_TAGS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    f'<link rel="stylesheet" href="{FONT_CSS_URL}">'
)


def image_bytes(path, folder):
    data = open(path, 'rb').read()
    if Image is None:
        return data
    img = Image.open(io.BytesIO(data))
    img.thumbnail((IMAGE_MAX_PX[folder],) * 2, Image.LANCZOS)  # only ever shrinks
    out = io.BytesIO()
    img.save(out, 'PNG', optimize=True)
    return out.getvalue()


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
        data = image_bytes(os.path.join(work_dir, src), src.split('/')[0])
        key = hashlib.sha1(data).hexdigest()
        if key not in classes:
            classes[key] = f'img-{len(classes)}'
            rules.append(f'.{classes[key]}{{background-image:url(data:image/png;base64,{base64.b64encode(data).decode()})}}')
        out = f'<i class="{(attrs.get("class") + " " if attrs.get("class") else "")}{classes[key]}" role="img"'
        if 'alt' in attrs:
            out += f' aria-label="{attrs["alt"]}"'
        if 'title' in attrs:
            out += f' title="{attrs["title"]}"'
        return out + '></i>'

    page = re.sub(r'<img\b([^>]*)>', swap, page)
    font_css = embedded_font_css()
    if font_css:
        page = page.replace(FONT_LINK_TAGS, '')
    return page.replace('</style>', ''.join(rules) + (font_css or '') + '</style>', 1)


def main(replays_dir, assets_dir, csv_path, out_dir):
    with tempfile.TemporaryDirectory() as work_dir:
        page = make_self_contained(build_page(replays_dir, assets_dir, csv_path, work_dir), work_dir)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'index.html')
    with open(out_path, 'w') as f:
        f.write(page)
    print(f'{len(page) / 1e6:.1f} MB -> {out_path}')


if __name__ == '__main__':
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(*sys.argv[1:])
