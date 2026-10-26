import { HitGroup } from '../engine/calc';
import { AttackReport } from '../engine/attacks';
import { Action } from '../engine/plan';
import { Enemy } from '../engine/state';
import { ActorName } from '../engine/units';
import { Constraint } from '../core/constraints';
import { Cell } from '../core/hex';
import { UNITS } from './units';

export const actorName = (a: ActorName): string => (a === 'zkar' ? "Z'kar" : UNITS[a].name);

const where = (c: Cell): string => `(${c.col}, ${c.row})`;

export const enemyName = (e: Enemy): string => (e.kind === 'boss' ? 'the boss' : `the minion at ${where(e.cell)}`);

export const fmt = (n: number): string => Math.round(n).toLocaleString();

export function describeAction(a: Action): string {
    switch (a.type) {
        case 'move':
            return `${actorName(a.unit)} moves to ${where(a.to)}`;
        case 'pass':
            return `${actorName(a.unit)} does not attack`;
        case 'deploy':
            return `Z'kar is deployed at ${where(a.at)}`;
        case 'abaddonActive':
            return 'Abaddon uses his active';
        case 'attack': {
            const kind = a.kind === 'active' ? 'uses his active on' : a.kind === 'ranged' ? 'shoots' : a.kind === 'physical' ? 'strikes' : 'attacks';
            return `${actorName(a.unit)} ${kind} ${enemyName(a.target)}${a.extra ? `, then ${enemyName(a.extra)}` : ''}`;
        }
    }
}

/** What each flat buff and modifier is called in the breakdown. */
export const SOURCE_LABELS: Record<string, string> = {
    abaddonPassive: "Abaddon's passive",
    psychicStalkFlat: 'Psychic Stalk',
    nornCrown: 'Norn Crown',
    neuroparasite: 'Neuroparasite',
    bookOfFate: 'Book of Fate',
    hunterOfSouls: 'Hunter of Souls',
    highGround: 'high ground',
    psychicStalk: 'Psychic Stalk',
    cabal: 'Cabal of Sorcerers',
};

const pct = (m: number): string => `+${Math.round((m - 1) * 100)}%`;

/** One group of hits, as a line: "5 hits of 2,001 +652 (Abaddon's passive) vs armor 1,000, high ground +50% = 11,000 to the boss". */
export function describeGroup(g: HitGroup): string {
    const flat = g.flat.map((f) => `+${fmt(f.amount)} ${SOURCE_LABELS[f.id] ?? f.id}`).join(' ');
    const mods = g.modifiers.map((m) => `${SOURCE_LABELS[m.id] ?? m.id} ${pct(m.multiplier)}`).join(', ');
    return `${g.label}: ${g.hits} ${g.hits === 1 ? 'hit' : 'hits'} of ${fmt(g.base)}${flat ? ` ${flat}` : ''} against armor ${fmt(g.armor)}${mods ? `, ${mods}` : ''} = ${fmt(g.damage)} to ${enemyName(g.target)}`;
}

export function describeReport(r: AttackReport): string {
    const who = actorName(r.actor);
    const why = r.trigger ? { deploy: 'on deploying', archimatos: "after Archimatos's attack", abraxas: "after Abraxas's attack", nextRound: 'at the start of next round' }[r.trigger] : '';
    const what = r.targets.length > 0 ? ` hits ${r.targets.map(enemyName).join(' and ')}${r.smite ? ` (smite: ${enemyName(r.smite)})` : ''}` : '';
    const head = r.extra ? `${who}'s extra attack` : who;
    return `${head}${why ? ` ${why}` : ''}${what}${r.note ? ` (${r.note})` : ''}: ${fmt(r.damage)} damage to the boss`;
}

/** A rule, as a sentence. */
export function describeConstraint(c: Constraint): string {
    switch (c.kind) {
        case 'pin':
            return `${actorName(c.unit)} is on ${where(c.cell)} when attacking`;
        case 'zkarAt':
            return `Z'kar is deployed at ${where(c.cell)}`;
        case 'mustAttack':
            return `${actorName(c.unit)} must attack`;
        case 'mustNotAttack':
            return `${actorName(c.unit)} does not attack`;
        case 'attackKind':
            return `${actorName(c.unit)} uses a ${c.attack === 'active' ? 'active' : c.attack} attack`;
        case 'order':
            return `${actorName(c.unit)} attacks ${c.position}`;
        case 'before':
            return `${actorName(c.unit)} attacks before ${actorName(c.other)}`;
        case 'nextToBoss':
            return `${actorName(c.unit)} is next to the boss when attacking`;
        case 'highGround':
            return `${actorName(c.unit)} is on high ground when attacking`;
        case 'adjacent':
            return `${actorName(c.unit)} is next to ${actorName(c.other)} when attacking`;
    }
}
