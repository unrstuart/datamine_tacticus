import * as fs from 'fs';

export interface LeObjective {
    type: string;
    target: string;
    points: number;
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
        objectives: (raw.objectives ?? []).map((objective: any) => ({
            type: objective.objectiveType,
            target: objective.objectiveTarget ?? '',
            points: objective.score,
        })),
    };
}

function parseLane(raw: any[]): LeTrack {
    return { battles: raw.map(parseBattle) };
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

    const legendaryEvents: LeEvent[] = [...eventTracks.entries()]
        .sort(([a], [b]) => a - b)
        .map(([id, tracks]) => ({
            id: String(id),
            alpha: tracks.alpha ?? { battles: [] },
            beta: tracks.beta ?? { battles: [] },
            gamma: tracks.gamma ?? { battles: [] },
        }));

    return { legendaryEvents };
}
