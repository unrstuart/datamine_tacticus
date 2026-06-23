import * as fs from 'fs';
import * as path from 'path';

function getArgs() {
    const args: Record<string, string> = {};
    process.argv.slice(2).forEach((val, index, array) => {
        if (val.startsWith('--')) {
            const key = val.slice(2);
            const nextValue = array[index + 1];
            if (nextValue && !nextValue.startsWith('--')) {
                args[key] = nextValue;
            }
        }
    });
    return args;
}

function globToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
}

function formatRewards(rewards: string[]): string {
    // Merge duplicates: gold:43000 + gold:1000 => gold:44000
    const totals: Map<string, number> = new Map();
    for (const reward of rewards) {
        const colon = reward.lastIndexOf(':');
        const type = reward.slice(0, colon);
        const amount = parseInt(reward.slice(colon + 1), 10);
        totals.set(type, (totals.get(type) ?? 0) + amount);
    }
    return [...totals.entries()].map(([type, amount]) => `${amount}x ${type}`).join(', ');
}

function main() {
    const flags = getArgs();
    const input = flags.input;
    const glob_pattern = flags.glob_pattern;

    if (!input || !glob_pattern) {
        console.error('Usage: npx ts-node extract_real_money_products.ts --input <file.json> --glob_pattern <glob>');
        console.error('Example: npx ts-node extract_real_money_products.ts --input data.json --glob_pattern "*july_2026*"');
        process.exit(1);
    }

    try {
        const data = JSON.parse(fs.readFileSync(input, 'utf-8'));
        const products = data.clientGameConfig.shop.realMoneyProducts as Record<string, any>;
        const regex = globToRegex(glob_pattern);

        const matches = Object.entries(products).filter(([key]) => regex.test(key));

        if (matches.length === 0) {
            console.log(`No products matched pattern: ${glob_pattern}`);
            return;
        }

        for (const [name, product] of matches) {
            const category = product.category ?? '';
            const price = product.price ?? '';
            const rewards = formatRewards(product.rewards ?? []);
            console.log(`${name}  category=${category}  price=${price}  rewards=${rewards}`);
        }
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
