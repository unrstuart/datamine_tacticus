import * as fs from 'fs';

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

export interface RealMoneyProductMatch {
    name: string;
    category: string;
    price: number | string;
    rewards: string;
}

export interface FindRealMoneyProductsParams {
    gameconfigPath: string;
    globPattern: string;
}

export function findRealMoneyProducts({ gameconfigPath, globPattern }: FindRealMoneyProductsParams): RealMoneyProductMatch[] {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const products = data.clientGameConfig.shop.realMoneyProducts as Record<string, any>;
    const regex = globToRegex(globPattern);

    const matches = Object.entries(products).filter(([key]) => regex.test(key));

    return matches.map(([name, product]: [string, any]) => ({
        name,
        category: product.category ?? '',
        price: product.price ?? '',
        rewards: formatRewards(product.rewards ?? []),
    }));
}
