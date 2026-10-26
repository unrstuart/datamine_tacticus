import { MAX_ABADDON_STACKS, MAX_NEURO_STACKS } from '../core/setup';
import { Context, State, burning, distanceBetween, enemyCells, listEnemies } from '../engine/state';
import { UNIT_DEFS, hasTag } from '../engine/units';
import { Statics, attackRange } from './analysis';

/**
 * The most the rest of a plan could possibly add to its score from `state`, or more. A branch whose score so far plus this
 * is still below the best found cannot win, so the search drops it. It has to be an overestimate to be safe, so it adds up
 * the most each remaining attack could be worth if every helper were in the right place, then caps what is capped:
 * Abaddon's stacks at 13 and the parasite at 16 (and nothing from the parasite while it is uninfected and Neurothrope
 * can't infect it). Penalties only subtract, so they are ignored.
 */
export function upperBound(ctx: Context, state: State, statics: Statics, zkarCanBeDeployed: boolean): number {
    const here = (id: keyof State['units']) => state.units[id] !== undefined;
    // Could it still attack? It has not finished and is within its movement plus its range of an enemy. Walking can only be
    // longer than the straight hex distance, so this never says no when the answer is yes, whoever moves out of the way later.
    const enemies = listEnemies(state).map((e) => enemyCells(state, e));
    const todo = (id: keyof State['units']) => {
        const u = state.units[id];
        if (!u || u.attacked) return false;
        const reach = (u.moved ? 0 : UNIT_DEFS[id].movement) + attackRange(id);
        return enemies.some((cells) => distanceBetween([u.cell], cells) <= reach);
    };

    const fireLikely = here('ahriman') && (burning(state, state.bossCells) || state.minions.some((m) => burning(state, [m])) || (!state.units.ahriman!.attacked) || (here('abraxas') && !state.units.abraxas!.attacked));
    const zkarPossible = state.zkar !== undefined || zkarCanBeDeployed;
    const high = statics.highGroundPossible ? 1 : 0;
    const capNeuro = MAX_NEURO_STACKS - state.neuroStacks;
    const capAbaddon = MAX_ABADDON_STACKS - state.abaddonStacks;
    const extraAttack = state.abaddonExtra !== 'off';

    // What every attacker of `tags` can get from the others on the board, per attack (not counting the parasite or high ground).
    const helps = (chaos: boolean, psyker: boolean, summon: boolean, psychicOrFlame: boolean, self: string) =>
        (chaos && here('abaddon') && self !== 'abaddon' ? 1 : 0) +
        (psychicOrFlame && fireLikely ? 1 : 0) +
        (here('neurothrope') && (psyker || summon) && self !== 'neurothrope' ? 1 : 0) +
        (chaos && here('abraxas') && self !== 'abraxas' ? 1 : 0) +
        (zkarPossible && psyker ? 1 : 0);

    let total = 0;
    let stackable = 0; // attacks that could add a parasite stack
    for (const id of ['archimatos', 'abraxas', 'ahriman', 'neurothrope'] as const) {
        if (!todo(id)) continue;
        total += helps(hasTag(id, 'chaos'), true, false, true, id) + high + (id === 'archimatos' ? 1 : 0);
        stackable++;
    }
    if (todo('abaddon')) {
        // Melee: a stack for every enemy hit (relic and extra attack), and the hex bonus and high ground on each of its reports.
        const reports = extraAttack ? 2 : 1;
        const melee = Math.min(Math.max(capAbaddon, 0), extraAttack ? 4 : 3) + reports * (1 + high);
        // Ranged: a stack, plus what Abraxas's added psychic hit brings (his buff, Ahriman's bonus), the hex bonus and high ground.
        const ranged = Math.min(Math.max(capAbaddon, 0), 1) + (here('abraxas') ? 1 + (fireLikely ? 1 : 0) : 0) + 1 + high;
        total += Math.max(melee, ranged);
        if (here('abraxas')) stackable++;
    }

    // Z'kar's attacks: each could carry every helper there is.
    const archi = here('archimatos') && !state.units.archimatos!.attacked && !state.zkar?.triggered.archimatos ? 1 : 0;
    const abrax = here('abraxas') && !state.units.abraxas!.attacked && !state.zkar?.triggered.abraxas ? 1 : 0;
    const zkarAttacks = !zkarPossible ? 0 : state.zkar ? archi + abrax + 1 : 1 + archi + abrax + 1;
    const anyPsyker = here('ahriman') || here('abraxas') || here('archimatos') || here('neurothrope');
    const perZkar = (here('abaddon') ? 1 : 0) + (fireLikely ? 1 : 0) + (here('neurothrope') ? 1 : 0) + (here('abraxas') ? 1 : 0) + (anyPsyker ? 1 : 0) + high;
    total += zkarAttacks * perZkar;
    stackable += zkarAttacks;

    // The parasite: one stack per psychic attack on the boss, up to 16, and none while uninfected unless Neurothrope can infect it.
    const canInfect = state.neuroStacks > 0 || (here('neurothrope') && todo('neurothrope'));
    total += canInfect && capNeuro > 0 ? Math.min(stackable, capNeuro) : 0;
    void ctx;
    return total;
}
