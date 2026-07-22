import * as fs from 'fs';

interface MythicQuestTask {
    locaKey?: string;
    name: string;
    target?: number;
    taskParameters?: Record<string, string>;
}

interface MythicQuest {
    number: number;
    name: string;
    rewards: string[];
    tasks: MythicQuestTask[];
}

export interface MythicCharacterQuests {
    characterId: string;
    characterName: string;
    quests: MythicQuest[];
}

interface I2Term {
    Term: string;
    Languages: string[];
}

function loadI2Terms(i2Path: string): Map<string, I2Term> {
    const raw = fs.readFileSync(i2Path, 'utf-8');
    const data = JSON.parse(raw);
    const terms: I2Term[] = data.mSource.mTerms;
    const map = new Map<string, I2Term>();
    for (const term of terms) {
        if (term.Languages && term.Languages.length > 0) {
            map.set(term.Term, { Term: term.Term, Languages: term.Languages });
        }
    }
    return map;
}

function groupMythicQuestsByCharacter(data: any): MythicCharacterQuests[] {
    const quests: any[] = data.clientGameConfig?.quests?.groups?.hero?.quests ?? [];
    const characters: Record<string, any> = data.clientGameConfig?.units?.lineup ?? {};

    const byCharacter = new Map<string, MythicQuest[]>();

    for (const quest of quests) {
        const match = (quest.name ?? '').match(/^mythic_(.+)_(\d+)$/);
        if (!match) continue;

        const [, characterId, numStr] = match;
        const list = byCharacter.get(characterId) ?? [];
        list.push({
            number: parseInt(numStr, 10),
            name: quest.name,
            rewards: quest.rewards ?? [],
            tasks: (quest.tasks ?? []).map((task: any) => ({
                locaKey: task.locaKey,
                name: task.name,
                target: task.target,
                taskParameters: task.taskParameters,
            })),
        });
        byCharacter.set(characterId, list);
    }

    const result: MythicCharacterQuests[] = [];
    for (const [characterId, quests] of byCharacter) {
        quests.sort((a, b) => a.number - b.number);
        result.push({
            characterId,
            characterName: characters[characterId]?.name ?? characterId,
            quests,
        });
    }

    result.sort((a, b) => a.characterName.localeCompare(b.characterName));
    return result;
}

function collectDescriptionTerms(
    characters: MythicCharacterQuests[],
    i2Terms: Map<string, I2Term>,
    ignoreMissing: boolean
): I2Term[] {
    const terms = new Map<string, I2Term>();

    for (const character of characters) {
        for (const quest of character.quests) {
            for (const task of quest.tasks) {
                const key = task.locaKey ? `Quests/${task.locaKey}` : undefined;
                const term = key ? i2Terms.get(key) : undefined;

                if (term) {
                    terms.set(term.Term, term);
                    continue;
                }

                const message = [
                    `Missing I2 description term for a mythic quest task.`,
                    `  Character: ${character.characterId} (${character.characterName})`,
                    `  Quest: ${quest.name} (quest ${quest.number})`,
                    `  Task: ${task.name}`,
                    `  Expected I2 term: ${key ?? '(no locaKey on task)'}`,
                    `  taskParameters: ${JSON.stringify(task.taskParameters ?? {})}`,
                ].join('\n');

                if (ignoreMissing) {
                    console.error(`WARNING: ${message}`);
                } else {
                    throw new Error(`${message}\n\nPass ignoreMissingDescriptions to skip this check and continue.`);
                }
            }
        }
    }

    return Array.from(terms.values());
}

function formatTask(task: MythicQuestTask): string {
    const params = Object.entries(task.taskParameters ?? {})
        .filter(([key]) => key !== 'heroId')
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
    return params ? `${task.name}(${params})` : task.name;
}

export function formatMythicQuestsText(characters: MythicCharacterQuests[]): string {
    const lines: string[] = [];
    for (const character of characters) {
        lines.push(character.characterName);
        for (const quest of character.quests) {
            const rewards = quest.rewards.join(', ');
            const tasks = quest.tasks.map(formatTask).join('; ');
            lines.push(`  ${quest.number}: ${rewards} | ${tasks}`);
        }
    }
    return lines.join('\n');
}

export interface ExtractMythicQuestsParams {
    gameconfigPath: string;
    i2Path: string;
    ignoreMissingDescriptions?: boolean;
}

export interface MythicQuestsResult {
    quests: MythicCharacterQuests[];
    terms: I2Term[];
}

export function extractMythicQuests({ gameconfigPath, i2Path, ignoreMissingDescriptions = false }: ExtractMythicQuestsParams): MythicQuestsResult {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const i2Terms = loadI2Terms(i2Path);
    const quests = groupMythicQuestsByCharacter(data);
    const terms = collectDescriptionTerms(quests, i2Terms, ignoreMissingDescriptions);

    return { quests, terms };
}
