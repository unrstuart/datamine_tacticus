import * as fs from 'fs';

interface MeleeAttack {
    hitCount: number;
    pierce: string;
}

interface RangedAttack {
    hitCount: number;
    pierce: string;
    range: number;
}

interface Stats {
    damage: number;
    armor: number;
    health: number;
    initialProgressionIndex: number;
}

export interface IUnit {
    id: string;
    name: string;
    faction: string;
    alliance: string;
    movement: number;
    activeAbilityId: string;
    passiveAbilityIds: string;
    traits: string[];
    itemSlots: string[];
    statIncreases: number[][];
    relicSlot: number;
    meleeAttack: MeleeAttack;
    rangedAttack?: RangedAttack;
    initialStats: Stats;
}

export interface ExtractHeroesParams {
    gameconfigPath: string;
}

export function extractHeroes({ gameconfigPath }: ExtractHeroesParams): IUnit[] {
    const rawData = fs.readFileSync(gameconfigPath, 'utf-8');
    const data = JSON.parse(rawData);

    const rawUnits: Record<string, any> = data.clientGameConfig.units.lineup;

    return Object.entries(rawUnits)
        .map(([id, unit]: [string, any]): IUnit | undefined => {
            if ((unit.Movement ?? 0) === 0) return undefined;
            return {
                id: id,
                name: unit.name,
                faction: unit.FactionId,
                alliance: unit.GrandAllianceId,
                movement: unit.Movement ?? 0,
                activeAbilityId: unit.activeAbilities[0],
                passiveAbilityIds: unit.passiveAbilities[0],
                traits: unit.traits,
                itemSlots: unit.itemSlots,
                relicSlot: unit.itemSlotsRelic[0],
                initialStats: {
                    damage: unit.stats.Damage,
                    armor: unit.stats.FixedArmor,
                    health: unit.stats.Health,
                    initialProgressionIndex: unit.stats.ProgressionIndex,
                },
                statIncreases: unit.upgradesStatIncrease,
                meleeAttack: {
                    hitCount: unit.weapons[0].hits,
                    pierce: unit.weapons[0].DamageProfile,
                },
                rangedAttack:
                    unit.weapons.length < 2
                        ? undefined
                        : {
                              hitCount: unit.weapons[1].hits,
                              pierce: unit.weapons[1].DamageProfile,
                              range: unit.weapons[1].Range,
                          },
            };
        })
        .filter((unit): unit is IUnit => !!unit);
}
