import { AttackReport, BuffId } from '../engine/attacks';
import { Action } from '../engine/plan';
import { Enemy } from '../engine/state';
import { ActorName } from '../engine/units';
import { Cell } from '../core/hex';
import { UNITS } from './units';

export const actorName = (a: ActorName): string => (a === 'zkar' ? "Z'kar" : UNITS[a].name);

const where = (c: Cell): string => `(${c.col}, ${c.row})`;

export const enemyName = (e: Enemy): string => (e.kind === 'boss' ? 'the boss' : `the minion at ${where(e.cell)}`);

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
            const kind = a.kind === 'active' ? "uses his active on" : a.kind === 'ranged' ? 'shoots' : a.kind === 'physical' ? 'strikes' : 'attacks';
            return `${actorName(a.unit)} ${kind} ${enemyName(a.target)}${a.extra ? `, then ${enemyName(a.extra)}` : ''}`;
        }
    }
}

export const BUFF_LABELS: Record<BuffId, string> = {
    abaddon: "Abaddon's buff",
    ahriman: "Ahriman's fire bonus",
    neurothrope: "Neurothrope's buff",
    abraxas: "Abraxas's extra psychic hit",
    zkar: "Z'kar's buff",
    highGround: 'high ground',
    hexEffect: 'hex effect',
    neuroStack: 'neuroparasite stack',
    abaddonStack: "Abaddon's stack",
};

export function describeReport(r: AttackReport): string {
    const who = actorName(r.actor);
    const why = r.trigger ? { deploy: 'on deploying', archimatos: "after Archimatos's attack", abraxas: "after Abraxas's attack", nextRound: 'at the start of next round' }[r.trigger] : '';
    const what = r.targets.length > 0 ? ` hits ${r.targets.map(enemyName).join(' and ')}${r.smite ? ` (smite: ${enemyName(r.smite)})` : ''}` : '';
    const buffs = r.buffs.map((b) => `${BUFF_LABELS[b.id]}${b.points > 1 ? ` +${b.points}` : ''}`).join(', ') || 'no buffs';
    const head = r.extra ? `${who}'s extra attack` : who;
    return `${head}${why ? ` ${why}` : ''}${what}${r.note ? ` (${r.note})` : ''}: ${buffs} = ${r.score}`;
}
