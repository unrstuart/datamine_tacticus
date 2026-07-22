import * as fs from 'fs';

function getRewardDescription(reward: string): string {
    const lastColon = reward.lastIndexOf(':');
    if (lastColon === -1) return reward;
    const desc = reward.substring(0, lastColon);
    if (desc === 'seasonalEventCurrencyApril2026') return 'Survival Event Currency';
    if (desc === 'ShardsAll') return 'Random Shards of Any Character';
    if (desc === 'stamina') return 'Energy';
    if (desc === 'raidTicket') return 'Raid Ticket';
    if (desc === 'summoningToken') return 'Normal Req Order';
    if (desc === 'specialSummoningToken') return 'Blessed Req Order';
    if (desc.startsWith('xp')) {
        return desc.substr(2) + ' XP Book';
    }
    if (desc.startsWith('ascensionOrbs')) {
        return desc.substr(14) + ' Orb (Random Alliance)';
    }
    if (desc.startsWith('heroAscensionOrb')) {
        const orbType = desc.substr(16);
        const alliance = orbType.substr(orbType.indexOf('_') + 1);
        const rarity = orbType.substr(0, orbType.indexOf('_'));
        return `${rarity} ${alliance} Orb`;
    }
    if (desc.startsWith('abilityToken')) {
        const tokenType = desc.substr(12);
        const alliance = tokenType.substr(tokenType.indexOf('_') + 1);
        const rarity = tokenType.substr(0, tokenType.indexOf('_'));
        return `${rarity} ${alliance} Badge`;
    }
    if (desc === 'ShardsMoW') return 'Random MoW Shards';
    if (desc === 'machinesOfWarAmmo') return 'Munitions';
    if (desc.startsWith('itemAscensionResource')) {
        return desc.substr(22) + ' Forge Badge';
    }
    if (desc === 'gems') return 'Blackstone';
    if (desc === 'gold') return 'Gold';
    if (desc === 'dust') return 'Salvage';
    if (desc === 'mythicDust') return 'Mythic Salvage';
    if (desc === 'ShardsIfUnlocked') return 'Shards of Unlocked Character';
    console.error('unknown reward desc: ', desc);
    return desc;
}

function getRewardQuantity(reward: string): string {
    const parts = reward.split(':');
    return parts[parts.length - 1];
}

export interface SurvivalOfferReward {
    quantity: string;
    description: string;
}

export interface SurvivalOffer {
    key: string;
    priceDollars: string;
    rewards: SurvivalOfferReward[];
}

export interface SurvivalOfferDay {
    day: number;
    offers: SurvivalOffer[];
}

export interface SurvivalPlaymoreOffer {
    key: string;
    priceDollars: string;
    rewards: string[];
}

export interface ExtractSurvivalOffersParams {
    gameconfigPath: string;
}

export interface SurvivalOffersResult {
    byDay: SurvivalOfferDay[];
    playmore: SurvivalPlaymoreOffer[];
}

export function extractSurvivalOffers({ gameconfigPath }: ExtractSurvivalOffersParams): SurvivalOffersResult {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));
    const offers = data.clientGameConfig.shop.realMoneyProducts;

    const byDay: SurvivalOfferDay[] = [];
    for (const day of [1, 2, 3, 4, 5, 6, 7, 0]) {
        const dayOffers: SurvivalOffer[] = [];
        for (const key of Object.keys(offers)) {
            const match = key.match(/day_(\d+)/);
            if (!match || parseInt(match[1], 10) !== day) {
                if (day !== 0) continue;
                if (match !== undefined) continue;
            }
            if (key.includes('product_calendar_seasonal_event_april_2026')) {
                const offer = offers[key];
                dayOffers.push({
                    key,
                    priceDollars: (offer.price / 100).toFixed(2),
                    rewards: offer.rewards.map((reward: string) => ({
                        quantity: getRewardQuantity(reward),
                        description: getRewardDescription(reward),
                    })),
                });
            }
        }
        byDay.push({ day, offers: dayOffers });
    }

    const playmore: SurvivalPlaymoreOffer[] = [];
    for (const key of Object.keys(offers)) {
        const offer = offers[key];
        if (key.includes('playmore')) {
            playmore.push({
                key,
                priceDollars: Math.ceil(offer.price / 100).toFixed(2),
                rewards: offer.rewards,
            });
        }
    }

    return { byDay, playmore };
}
