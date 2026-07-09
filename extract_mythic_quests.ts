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

interface MythicCharacterQuests {
    characterId: string;
    characterName: string;
    quests: MythicQuest[];
}

function getArgs() {
    const args: Record<string, string> = {};
    process.argv.slice(2).forEach((val, index, array) => {
        if (val.startsWith('--')) {
            const key = val.slice(2);
            const nextValue = array[index + 1];
            if (nextValue && !nextValue.startsWith('--')) {
                args[key] = nextValue;
            } else {
                args[key] = 'true';
            }
        }
    });
    return args;
}

function extractMythicQuests(data: any): MythicCharacterQuests[] {
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

function formatTask(task: MythicQuestTask): string {
    const params = Object.entries(task.taskParameters ?? {})
        .filter(([key]) => key !== 'heroId')
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
    return params ? `${task.name}(${params})` : task.name;
}

function emitText(characters: MythicCharacterQuests[]) {
    for (const character of characters) {
        console.log(character.characterName);
        for (const quest of character.quests) {
            const rewards = quest.rewards.join(', ');
            const tasks = quest.tasks.map(formatTask).join('; ');
            console.log(`  ${quest.number}: ${rewards} | ${tasks}`);
        }
    }
}

function emitJson(characters: MythicCharacterQuests[]) {
    console.log(JSON.stringify(characters, null, 2));
}

function main() {
    const flags = getArgs();
    const inputPath = flags.input;

    if (!inputPath) {
        console.error('Usage: npx tsx extract_mythic_quests.ts --input <file.json> [--json]');
        process.exit(1);
    }

    try {
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
        const characters = extractMythicQuests(data);

        if ('json' in flags) {
            emitJson(characters);
        } else {
            emitText(characters);
        }
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
