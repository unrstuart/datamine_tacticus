import * as fs from 'fs';

export interface LeObjective {
    type: string;
    target: string;
    points: number;
    // Every objective type resolves through this same generic i2 template regardless of event
    // (e.g. "UI/LegendaryEvent_Objective_Name_DamageType" -> "Full-{[DAMAGE_TYPE]} Damage
    // lineup{[ASTERISK]}", filled in from `target`/`points`) - handing back the locaKey rather than
    // pre-resolved text since the frontend already owns i2/style-tag rendering for everything else.
    nameLocaKey: string;
    descriptionLocaKey: string;
}

export interface LeWave {
    enemies: string[];
    power: number;
    round: number;
}

export interface LeBattle {
    mapId: string;
    number: number;
    power: number;
    tier: number;
    disallowedFactions: string[];
    waves: LeWave[];
    objectives: LeObjective[];
}

export interface LeTrack {
    battles: LeBattle[];
    // Derived convenience fields (all recomputable from `battles` above, but kept here since
    // consumers - team-suggestion scoring, the points table, shard/ascension forecasting - read
    // them directly rather than re-deriving them):
    battlesPoints: number[]; // max Kill Score per battle = total enemy count in that battle's waves
    defeatAll: number[]; // the "Acing" (defeat-all-enemies) objective's bonus score, per battle
    killPoints: number; // the plateau defeatAll value (every battle but the last uses this)
    // The 5 non-Acing objectives are identical across all battles in a lane (confirmed for every
    // lane of every current event) - deduped here instead of making consumers scan every battle.
    // This is also each lane's player-roster restriction: the same faction/alliance exclusion the
    // hand-maintained .le.ts files express as filter(unitsData).byAlliance(...)/.byFaction(...).
    bonusObjectives: LeObjective[];
    disallowedFactions: string[];
}

export interface LeEvent {
    id: string;
    alpha: LeTrack;
    beta: LeTrack;
    gamma: LeTrack;
}

export interface LeData {
    legendaryEvents: LeEvent[];
}

export interface ExtractLeDataParams {
    gameconfigPath: string;
}

function parseObjective(raw: any): LeObjective {
    const type = raw.objectiveType;
    return {
        type,
        target: raw.objectiveTarget ?? '',
        points: raw.score,
        nameLocaKey: `UI/LegendaryEvent_Objective_Name_${type}`,
        descriptionLocaKey: `UI/LegendaryEvent_Objective_Description_${type}`,
    };
}

function parseBattle(raw: any): LeBattle {
    return {
        mapId: raw.boardId,
        number: raw.battleNr,
        power: raw.power,
        tier: raw.tier,
        disallowedFactions: raw.disallowedFactions ?? [],
        waves: (raw.waves ?? []).map((wave: any) => ({
            enemies: wave.army ?? [],
            power: wave.power,
            round: wave.round,
        })),
        objectives: (raw.objectives ?? []).map(parseObjective),
    };
}

function parseLane(raw: any[]): LeTrack {
    const battles = raw.map(parseBattle);
    const battlesPoints = battles.map((battle) => battle.waves.reduce((sum, wave) => sum + wave.enemies.length, 0));
    const defeatAll = battles.map((battle) => battle.objectives.find((o) => o.type === 'Acing')?.points ?? 0);
    const bonusObjectives = (battles[0]?.objectives ?? []).filter((o) => o.type !== 'Acing');
    const disallowedFactions = battles[0]?.disallowedFactions ?? [];
    return { battles, battlesPoints, defeatAll, killPoints: defeatAll[0] ?? 0, bonusObjectives, disallowedFactions };
}

export function extractLeData({ gameconfigPath }: ExtractLeDataParams): LeData {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const battleSets: Record<string, any> = data.clientGameConfig.battles.battleSets;

    const eventTracks = new Map<number, Partial<Record<'alpha' | 'beta' | 'gamma', LeTrack>>>();
    for (const [lane, value] of Object.entries(battleSets)) {
        if (!lane.startsWith('legendary_event_')) continue;
        const match = lane.match(/^legendary_event_(\d+)_lane_(\d+)$/);
        if (!match) {
            console.error(`Unexpected legendary event lane format: ${lane}`);
            continue;
        }
        const event = parseInt(match[1], 10);
        const trackNumber = parseInt(match[2], 10);
        const track = parseLane(value as any[]);

        if (!eventTracks.has(event)) eventTracks.set(event, {});
        const tracks = eventTracks.get(event)!;
        if (trackNumber === 1) tracks.alpha = track;
        else if (trackNumber === 2) tracks.beta = track;
        else if (trackNumber === 3) tracks.gamma = track;
        else console.error(`Unknown legendary event battle set: ${lane}`);
    }

    const emptyTrack: LeTrack = { battles: [], battlesPoints: [], defeatAll: [], killPoints: 0, bonusObjectives: [], disallowedFactions: [] };
    const legendaryEvents: LeEvent[] = [...eventTracks.entries()]
        .sort(([a], [b]) => a - b)
        .map(([id, tracks]) => ({
            id: String(id),
            alpha: tracks.alpha ?? emptyTrack,
            beta: tracks.beta ?? emptyTrack,
            gamma: tracks.gamma ?? emptyTrack,
        }));

    return { legendaryEvents };
}
