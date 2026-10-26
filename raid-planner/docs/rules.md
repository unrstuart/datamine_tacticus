# Raid planner: rules sheet (draft, for the Abaddon / Z'kar comp)

Goal: for one guild raid round, search every legal sequence of moves, deployments and attacks, score each by the
buffs it applies, and report all plans tied for the top score.

Items marked **(?)** are my reading of something you didn't say outright. Please correct them.

## 1. Units

| Unit | Move | Flies | Attacks | Tags |
|---|---|---|---|---|
| Abaddon | 3 | no | ranged bolter, range 2; melee power with his relic (see 7) | chaos |
| Abraxas | 3 | no | ranged psychic, range 2; melee flame | chaos, psyker |
| Archimatos | 3 | no | ranged psychic (1 hit), range 2; melee psychic (2 hits) | chaos, psyker |
| Ahriman | 3 | yes | ranged psychic, range 2; melee flame; active (see 7) | chaos, psyker |
| Neurothrope | 2 | yes | ranged psychic, range 3 (no melee); active (see 7) | xenos, psyker |
| Z'kar | 0 | no | melee psychic (4 hits); ranged psychic (3 hits), range 2 | summon, psyker, demon, chaos |

Z'kar is a three-hex summon (see `zkar-deployment.md`). All damage types: bolter = bolter, "psychic",
"flame". Distances are hex distance and ignore elevation. For multi-hex units, distance and adjacency use the
nearest hex.

## 2. Round model

- Each unit may **move once** (up to its movement, all in one go), then **attack once**. Attacking ends that unit's
  turn even if it hasn't moved. A unit may move and never attack.
- Units act in **any order**. Moves, attacks and the Z'kar deployment can be interleaved freely.
- Only this round is planned, plus Z'kar's one attack at the start of the next round (see 5). No other unit acts
  in the next round.

## 3. Movement

- Walkers can pass through friendly units, not through enemies; nobody may end on an occupied hex.
- A walker steps one hex at a time and each step costs 1 movement. A step is allowed only if the two hexes' elevations
  differ by **at most 1**. So E1 -> E2 -> E3 -> E4 is fine, E1 -> E1 -> E2 -> E1 is fine, E1 -> E3 is not. The
  walker may need a longer path, spending more of its movement.
- Impassable hexes can't be entered by walkers. **Fliers** may pass over impassable hexes and over enemy units
  (and ignore fire), but can't stop on an impassable hex or an occupied one. Fliers ignore elevation completely when moving.
- Fire hexes: a unit **may stand on** one. A walker that starts on fire can move away freely. A walker that
  enters a fire hex while moving must **stop there**. Fliers ignore fire.

## 4. Who a unit may attack

- A unit **adjacent to any enemy** must attack an enemy in melee; the player chooses which adjacent enemy.
  Units may move out of melee range first (usually Abraxas and Ahriman, who prefer ranged).
- A unit adjacent to no enemy attacks at range, within its range.
- Neurothrope has no melee attack. When he is adjacent to an enemy, a normal attack must target an adjacent enemy and
  does only a little **physical** damage (not psychic, so no parasite stack and no Ahriman buff). His active (see 7)
  lets him attack the boss anyway.
- Z'kar is the exception: the player does **not** choose his target. For scoring he attacks a minion if one is in
  reach, killing it in one attack, and otherwise the boss. This is the conservative case.
- Minions die in one Z'kar attack. They block movement and attacks like any enemy, and a boss may stand adjacent
  to a minion.

## 4b. Smite (splash)

- Only a **normal ranged psychic attack** has smite: Abraxas, Archimatos, Ahriman, Neurothrope and Z'kar's ranged
  attack. Not ability attacks (Ahriman's and Neurothrope's actives) and not non-psychic attacks
  (Abaddon's bolter shot, even with Abraxas's added psychic hit; Neurothrope's physical adjacent attack).
- After hitting its target, the attack also hits **one other enemy adjacent to the original target**, for less
  damage. The smite target can never be the original target.
- The smite target is chosen **randomly**. For scoring, take the conservative case: if the original target has a
  minion adjacent to it, smite hits a minion; the boss is smited only when no other enemy is adjacent to the
  original target.
- Smite counts like a hit for everything else: it can infect the boss and add a neuroparasite stack, it counts for
  Ahriman's buff (target on a burning hex), and Ahriman's attack's smite target's hexes are **set on fire** too.
- Still at most **one** neuroparasite stack per attack, however many targets it hit.
- So shooting a minion next to the boss can infect or stack the boss through smite, if the boss is the only
  enemy adjacent to that minion.

## 5. Fire

- A hex has **at most one effect at a time**: fire (two kinds, below), **despoiled ground** or **contaminated**.
  The user places them; a new effect replaces the old one. **Contaminated** is a hex effect that matters to Abaddon
  and Archimatos only; it isn't modelled yet beyond being a marker.
- Two kinds of fire, placed by the user: **burns this round and next**, and **burns this round only**.
- Any attack by **Ahriman** (ranged or melee) or **Abraxas's melee** sets **all** of the target's hexes on fire for
  this round and the next, even if they were already burning (it refreshes). Ahriman's active does not light fire.
- Fire matters for Ahriman's buff (see 8) and for walking (see 3). Z'kar's start-of-next-round attack only gets
  the fire buff if the hexes still burn then.

## 6. Z'kar

- Deployed by clicking a hex (any free hex with room, see `zkar-deployment.md`). He cannot move.
- He attacks **when deployed next to a psyker**, and again each time **Archimatos** or **Abraxas** attacks while
  adjacent to him (once each per summon). Thaumachus also triggers him but is out of scope. He attacks once more at
  the start of the next round if an enemy is in reach, then leaves.
- Each of these is a separate full attack with its own buffs and its own neuroparasite stack.
- Melee (4 hits) when an enemy is adjacent to him, otherwise ranged (3 hits, range 2).
- **Undesirable hexes:** a unit ending on one is assumed killed before the next round (Abaddon survives by default,
  see 8). For Z'kar that means he does **not** get the next-round attack. For other units it means they stop buffing
  that attack.
- Deploy on **high ground** above the enemy when possible (see 8).

## 7. Special abilities

- **Abaddon's relic** is part of his normal **melee** attack: it hits its target, then up to two more enemies adjacent to
  both him and that target. Each enemy actually hit adds one Abaddon stack (to a maximum of 13); there are no phantom
  targets. Like all his attacks it gets the hex-effect bonus (see 8). Ranged attacks have no relic.
- **Abaddon's active:** once per battle, costs him health, and from the turn it is used until the battle ends, each normal
  melee attack is followed by a **second melee attack** on an adjacent enemy (his choice). The second attack has no relic.
  So a turn is 1 to 4 attacks: the first, up to two relic hits, and the extra one; the extra one is missing when the first
  attack killed the only enemy beside him. The setup says whether the active is available, already used in an earlier
  turn, or not to be used.
- **Ahriman's active:** once per battle; range 1 or 2; psychic damage; does **not** light fire. Gets every buff
  except Abraxas's (his bonus hit is for normal attacks only).
- **Neurothrope's active:** once per battle; a **range 3** attack that lets him attack the boss even when adjacent
  to a minion; does not remove his adjacency penalty (see 8). It can set up the first infection.
- The user can mark each active as already used.

## 8. Buffs (each is +1 per buffed attack, unless stated)

An "attack" is one action, however many hits it has. Each (attack, buff) pair scores once.

| Buff | Gives to | Condition | Notes |
|---|---|---|---|
| Abaddon | friendly **chaos** units (everyone but Neurothrope) | within 2 hexes of Abaddon | Not Neurothrope (xenos). His own stacks grow per attack but the score is 1 per buffed attack. |
| Ahriman | any friendly attack that deals **psychic or flame** damage | the target stands on a **burning** hex | Of Abaddon's attacks it applies only to his ranged bolter shot when Abraxas adds a psychic hit; nothing else of his (not his melee, not the relic). Also applies to Z'kar's attacks. |
| Neurothrope | friendly **psykers and summons** | within 2 hexes of Neurothrope | Z'kar is both but counts once. |
| Abraxas | **ranged** attacks of adjacent chaos units; **ranged and melee** attacks of adjacent chaos demons (Z'kar) | adjacent to Abraxas; normal attacks only, not abilities | Adds one psychic hit. Counts as a buff. Adds a neuroparasite stack only if the original attack wasn't already psychic or flame. |
| Z'kar | friendly psykers (here everyone except Abaddon, and including Z'kar himself) | adjacent to another psyker, or to Z'kar | |
| High ground | an attack | attacker stands higher than the target | Weighted the same as the others for now; likely to be weighted more later. All hexes of a multi-hex unit share one elevation, so there is nothing to choose. |
| Hex-effect bonus | **all** of Abaddon's attacks (ranged, melee, the extra melee attack) and **Archimatos's** attacks | the target stands on a hex with an effect: fire, despoiled ground or contaminated | +1 per attack (a hex has only one effect, so never +2). Ahriman's buff is separate and does not apply to the relic. |
| Abaddon stack | Abaddon | each enemy he hits, to a maximum of 13 | **+1 for every stack added.** Not a buff on someone else's attack: it is the passive he is building. |
| Neuroparasite stack | the boss | each psychic attack on the infected enemy adds a stack; the first Neurothrope attack infects (0 = not yet infected) | **+1 for every stack added** (this is the only way the parasite scores). Max 16. Neurothrope's own attacks add a stack too; the parasite's bonus on his attacks is not counted as a buff. |

**Abaddon's passive stacks** (0 to 13, set on the board) score **+1 for every stack added**. Every enemy he hits adds
one, so a melee attack with the relic and the extra attack can add up to 4, and a ranged shot adds 1. This replaces the
earlier 2/1/0 rule of thumb.

**Penalty:** Neurothrope loses damage if he is adjacent to any enemy at any point in his turn, and again next round
if he stays adjacent (this round and the next). Scored as a soft penalty; the size is user-set, like the undesirable-hex penalty (suggested default 3).

**Undesirable hexes:** the user sets the penalty per plan. A unit ending its turn on one is **assumed dead** next
round, except **Abaddon**, who is very tanky and is assumed to survive by default. The user can switch that to "he
won't survive".

## 9. Output

- Show every plan tied for the highest score, as a step-by-step sequence: for each action, who moves where and who
  attacks what, listing the buffs each attack received, then the total.
- If two plans apply the same buffs **and** end with every unit on the same hexes, keep one. Otherwise keep both.
- While searching, show a spinner and the number of tied-best plans found so far. A few seconds is fine.

## 10. Inputs the user provides

1. Boss, then the map for it (guild raid boards).
2. Boss and minion positions (boss footprint 1, 3 or 7 hexes).
3. Hex modifiers: fire (two kinds) and despoiled ground.
4. Undesirable hexes (single hexes for now; lines and groups later).
5. Neuroparasite stacks on the boss, 0 to 16, and Abaddon's stacks, 0 to 13, and whether his active is available.
6. Starting positions of the five characters (any hex; no deployment zones).
7. Whether each once-per-battle active is still available.

## 11. How the engine reads the rules (`src/engine/`)

Decisions made while building it, beyond what the sections above say. Tell me where one is wrong.

- **Adjacent** means *connected*: neighbours on the grid, and a bridge hex only to the hexes at its two ends. **Range** is
  plain hex distance (to the nearest hex of a multi-hex unit), connection and elevation ignored. A unit that is not
  adjacent to any enemy but is at distance 1 across a bridge's side may still shoot.
- **Minions:** a character's attack kills the minion it hits (and any minions the relic hits). Smite does not kill.
  Z'kar kills the minion he hits. Minions block walkers and are in the way of Neurothrope.
- **Z'kar's target** is a minion when one is in reach (adjacent if any enemy is adjacent, otherwise within 2), else the
  boss. A trigger with nothing in reach is spent for nothing.
- **Z'kar's triggers:** landing next to a psyker (Ahriman, Abraxas, Archimatos or Neurothrope; not Abaddon), and
  Archimatos or Abraxas attacking next to him, once each. Ahriman or Neurothrope *attacking* beside him do not.
- **The parasite:** at 0 stacks only a Neurothrope psychic attack that hits the boss (directly or by smite) infects it
  (0 -> 1). At 1 or more every psychic attack that hits the boss adds one, to a maximum of 16. Flame, physical and
  bolter attacks add none, except that Abraxas's added psychic hit makes an Abaddon bolter shot psychic.
- **Ahriman's buff** is judged before the attack lands, so his own fire-lighting hit does not get it. It applies to a
  psychic or flame attack when any hex of what it hit (target or smite) is burning.
- **Fire** that an attack lights is always the two-round kind (it replaces whatever effect was there). Fire placed as
  "this round only" is gone for Z'kar's start-of-next-round attack.
- **Abaddon's own attacks** score one per stack added (every enemy he hits), plus the usual buffs on the attack (ranged
  beside Abraxas is the +1 Abraxas buff, and with Ahriman, the parasite or a hex effect more). His relic hits are
  automatic: up to two more enemies adjacent to both him and the target. If his active is on, the second melee attack is
  forced when an enemy is still adjacent (it is never worth skipping).
- **Abaddon buffs** chaos units within 2 other than himself. **Neurothrope buffs** psykers and summons within 2 other than
  himself. **Z'kar's buff** needs him on the board and goes to a psyker beside another psyker or beside him.
- **Neurothrope's penalty** applies once per plan if he is next to an enemy after a move, when he attacks, or at the end.
- **Order within one move:** a character moves at most once, before attacking; attacking ends its turn.
