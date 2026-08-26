// ---------------------------------------------------------------------------
// Shared helpers for the "seasonalEvent" idunLiveEventConfigs entries - used by both
// extract_shop_event.ts (weeks with a merchantId) and extract_survival_events.ts (events with
// includesSurvival: true). The two are mutually exclusive on a given event today, but both read
// the same underlying tables (loot.tieredProgressRewards, loot.chests, quests.groups), so the
// resolution logic lives here once rather than drifting apart in two copies.
// ---------------------------------------------------------------------------

function niceLabel(id: string): string {
    // Splits a camelCase/PascalCase identifier into words, e.g. "TreasureBeach" -> "Treasure Beach".
    return id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

// ---------------------------------------------------------------------------
// Reward formatting - moved here (from extract_shop_event.ts) so milestone/chest/mission
// resolution can share it too, rather than leaving those rewards as raw unconverted strings.
// ---------------------------------------------------------------------------

export function convertReward(reward: string, data: any): string {
    const characters = data.clientGameConfig.units.lineup;
    const upgrades = data.clientGameConfig.upgrades;
    const equipment = data.clientGameConfig.items;

    const colon = reward.lastIndexOf(':');
    const type = colon === -1 ? reward : reward.slice(0, colon);
    const quantity = colon === -1 ? '1' : reward.slice(colon + 1);

    if (type in equipment) return `${quantity}x ${equipment[type].name}`;

    if (type.startsWith('upgrades')) {
        const rarity = type.substring('upgrades'.length);
        return `${quantity}x ${rarity} Upgrade Material (Random)`;
    }
    if (type.startsWith('upg')) {
        const upgrade = upgrades[type];
        if (upgrade) return `${quantity}x ${upgrade.name}`;
    }

    if (type.startsWith('draft_abilityTokens')) {
        const rarity = type.substring('draft_abilityTokens'.length);
        return `${quantity}x ${rarity} Ability Badges (Draft)`;
    }
    if (type.startsWith('draft_ascensionOrbs')) {
        const rarity = type.substring('draft_ascensionOrbs'.length);
        return `${quantity}x ${rarity} Ascension Orb (Draft)`;
    }
    if (type === 'draft_machinesOfWarTokens') {
        return `${quantity}x Machines of War Tokens (Draft)`;
    }

    if (type.startsWith('itemAscensionResource_')) {
        const rarity = type.substring('itemAscensionResource_'.length);
        return `${quantity}x ${rarity} Forge Badges`;
    }

    let match = type.match(/^abilityToken(\w+?)_(\w+)$/);
    if (match) {
        const [, rarity, alliance] = match;
        return `${quantity}x ${rarity} ${alliance} Ability Badges`;
    }
    if (type.startsWith('abilityTokens')) {
        const rarity = type.substring('abilityTokens'.length);
        return `${quantity}x ${rarity} Ability Badges (Any Alliance)`;
    }

    match = type.match(/^heroAscensionOrb(\w+?)_(\w+)$/);
    if (match) {
        const [, rarity, alliance] = match;
        return `${quantity}x ${rarity} ${alliance} Ascension Orb`;
    }
    if (type.startsWith('ascensionOrbs')) {
        const rarity = type.substring('ascensionOrbs'.length);
        return `${quantity}x ${rarity} Ascension Orb (Any Alliance)`;
    }

    if (type === 'machinesOfWarAmmo') return `${quantity}x Munitions`;
    match = type.match(/^machinesOfWarToken_(\w+)$/);
    if (match) return `${quantity}x ${match[1]} Machines of War Token`;

    if (type.startsWith('items')) {
        const rarity = type.substring('items'.length);
        if (['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'].includes(rarity)) {
            return `${quantity}x ${rarity} Equipment (Random)`;
        }
    }

    match = type.match(/^mythicShards_(\w+)$/);
    if (match) {
        const unit = characters[match[1]];
        return `${quantity}x ${unit ? unit.name : match[1]} Mythic Shards`;
    }
    match = type.match(/^shards_(\w+)$/);
    if (match) {
        const unit = characters[match[1]];
        return `${quantity}x ${unit ? unit.name : match[1]} Shards`;
    }

    if (type === 'ShardsAll') return `${quantity}x Random Shards (Any Character)`;
    if (type === 'ShardsIfUnlocked') return `${quantity}x Shards of Unlocked Character`;
    if (type === 'ShardsMoW') return `${quantity}x Random MoW Shards`;
    match = type.match(/^Shards(\w+)$/);
    if (match) return `${quantity}x Random ${match[1]} Shards`;

    if (type === 'mythicDust') return `${quantity}x Mythic Salvage`;
    if (type === 'dust') return `${quantity}x Salvage`;
    if (type === 'gold') return `${quantity}x Gold`;
    if (type === 'gems') return `${quantity}x Blackstone`;
    if (type === 'raidTicket') return `${quantity}x Raid Ticket`;
    if (type === 'summoningToken') return `${quantity}x Req Order`;
    match = type.match(/^eventSummoningToken_(\w+)$/);
    if (match) return `${quantity}x ${niceLabel(match[1])} Event Req Order`;
    if (type === 'specialSummoningToken') return `${quantity}x Blessed Req Order`;
    if (type === 'intel') return `${quantity}x Intel`;
    if (type === 'crusadeBomb') return `${quantity}x Ordnance`;
    if (type === 'crusadeNpc') return `${quantity}x Forces`;

    match = type.match(/^[Ss]tamina(?:_(\w+))?$/);
    if (match) {
        return match[1] ? `${quantity}x Energy (${niceLabel(match[1])})` : `${quantity}x Energy`;
    }

    match = type.match(/^seasonalEventCurrency(\D+?)(\d{4})$/);
    if (match) {
        const [, month, year] = match;
        return `${quantity}x ${month} ${year} Event Currency`;
    }

    match = type.match(/^playerProfileTheme_(\w+)$/);
    if (match) return `${quantity}x ${niceLabel(match[1])} Profile Theme`;

    // Points that fill a seasonalEvent's milestone bar (maxPoints) - distinct from the spendable
    // seasonalEventCurrency<Month><Year> resource above, which is what the milestone bar pays out.
    if (type === 'xp_seasonal') return `${quantity}x Event Points`;
    // Battle-pass XP - distinct from xp_seasonal even on the "bp_se_*" battlepass_daily quests that
    // pay both at once (those dailies double-dip: they progress the battle pass AND the seasonal
    // event's milestone bar in the same claim).
    if (type === 'xp_battlepass') return `${quantity}x Battle Pass XP`;
    // The featured hero's stat-boost currency, paid out by seasonal_seasonal (free) mission chains.
    if (type === 'survivalBoost_stats') return `${quantity}x Survival Stat Boost`;

    if (type.startsWith('xp')) {
        const rarity = type.substring(2);
        return `${quantity}x ${rarity} XP Book`;
    }

    console.error('Unknown reward type: ', reward);
    return reward;
}

// ---------------------------------------------------------------------------
// Tiered progress rewards (loot.tieredProgressRewards) - shared by two distinct tracks:
//   - a seasonalEvent's rewardProgressId (the "milestone" bar, requiredProgress vs. maxPoints)
//   - a shop week's merchantProgressRewardId (a purchase-progress ladder)
// In both cases each tier's chestRewardId is either a direct reward string ("gold:600") or a chest
// id that must be resolved a second hop through loot.chests. Some tables (observed on
// se_milestones_august_2026) contain the same tier list repeated twice back-to-back - dedupe by
// requiredProgress, keeping the first occurrence, rather than assuming the array is clean.
// ---------------------------------------------------------------------------

// Rewards are left raw ("gold:600-660", "seasonalEventCurrencyAugust2026:20", ...), NOT run through
// convertReward - callers that want human-readable text (e.g. printShopEventText) convert at render
// time. This matches how the rest of this codebase's reward strings are stored (see ShopProduct.reward
// in the tacticusplanner frontend, and shop-resolve.ts's parseReward): raw and machine-parseable, so a
// consumer can resolve its own icon/label rather than getting baked-in English text.
export interface ChestVariant {
    type?: string;
    rewards: string[];
}

export function resolveChestContents(data: any, chestId: string): ChestVariant[] {
    const chestDefs: any[] = data.clientGameConfig.loot.chests[chestId] ?? [];
    return chestDefs.map((entry) => ({
        type: entry.type,
        rewards: entry.rewards ?? [],
    }));
}

export interface ProgressRewardTier {
    requiredProgress: number;
    reward?: string;
    chest?: ChestVariant[];
}

export function resolveTieredProgressRewards(data: any, tieredProgressRewardsId: string): ProgressRewardTier[] {
    const raw: { requiredProgress: number; chestRewardId: string }[] =
        data.clientGameConfig.loot.tieredProgressRewards[tieredProgressRewardsId] ?? [];

    const seen = new Set<number>();
    const deduped = raw.filter((tier) => {
        if (seen.has(tier.requiredProgress)) return false;
        seen.add(tier.requiredProgress);
        return true;
    });

    const chests = data.clientGameConfig.loot.chests;
    return deduped.map((tier) => {
        const chestId = tier.chestRewardId.includes(':') ? tier.chestRewardId.split(':')[0] : tier.chestRewardId;
        if (chests[chestId]) {
            return { requiredProgress: tier.requiredProgress, chest: resolveChestContents(data, chestId) };
        }
        return { requiredProgress: tier.requiredProgress, reward: tier.chestRewardId };
    });
}

// ---------------------------------------------------------------------------
// Missions - quest chains that feed a seasonalEvent's milestone bar (xp_seasonal). Quest names
// encode which event/week they belong to (e.g. "august_2026_week1_daily_01",
// "may_2026_free_1_chain_01") because quests.groups.seasonal_daily/seasonal_seasonal/
// seasonal_seasonal_premium are reused every cycle and accumulate every month's quests in the same
// array rather than being replaced. deriveEventPrefix + the startsWith filter below scope a lookup
// down to just the relevant event/week.
//
// battlepass_daily is included unconditionally alongside whatever questGroups names, even though
// a seasonalEvent's own questGroups field never lists it: battle-pass dailies prefixed "bp_se_"
// have long paid into the seasonal milestone bar too (maxPayouts.points.battlePass on the shop
// side, .survivalFree/.survivalPremium don't apply here but the same bp_se_ prefix convention
// holds), confirmed by "bp_se_june_2026_week1_daily_s_block_01" paying xp_battlepass +
// machinesOfWarAmmo + xp_seasonal all at once. The other ~117 "bp_x3_daily_*" entries in that same
// group are the evergreen battle pass dailies with no seasonal tie-in and are excluded by the
// prefix filter.
// ---------------------------------------------------------------------------

export interface SeasonalMissionTask {
    name: string;
    target?: number;
    locaKey?: string;
    taskParameters?: Record<string, string>;
}

export interface SeasonalMission {
    name: string;
    rewards: string[];
    tasks: SeasonalMissionTask[];
}

export interface SeasonalMissions {
    daily: SeasonalMission[];
    free: SeasonalMission[];
    premium: SeasonalMission[];
    battlePass: SeasonalMission[];
}

export interface SeasonalQuestGroupRef {
    groupName: string;
    category: string;
}

function toMission(q: any): SeasonalMission {
    return {
        name: q.name,
        rewards: q.rewards ?? [],
        tasks: (q.tasks ?? []).map((t: any) => ({
            name: t.name,
            target: t.target,
            locaKey: t.locaKey,
            taskParameters: t.taskParameters,
        })),
    };
}

// prefix is the event's theme, optionally with "_week{N}" appended - see deriveEventPrefix.
export function extractSeasonalMissions(data: any, prefix: string, questGroups: SeasonalQuestGroupRef[]): SeasonalMissions {
    const groups = data.clientGameConfig.quests.groups;
    const matchesPrefix = (name: string) => name.startsWith(`${prefix}_`);

    const result: SeasonalMissions = { daily: [], free: [], premium: [], battlePass: [] };

    for (const { groupName, category } of questGroups) {
        const group = groups[groupName];
        if (!group) continue;
        const quests = (group.quests ?? []).filter((q: any) => matchesPrefix(q.name)).map(toMission);

        if (category === 'daily') result.daily.push(...quests);
        else if (group.questType === 'premium') result.premium.push(...quests);
        else result.free.push(...quests);
    }

    const battlePassGroup = groups['battlepass_daily'];
    if (battlePassGroup) {
        const bpPrefix = `bp_se_${prefix}_`;
        result.battlePass = (battlePassGroup.quests ?? []).filter((q: any) => q.name.startsWith(bpPrefix)).map(toMission);
    }

    return result;
}

// theme is already in "{month}_{year}" form (e.g. "august_2026") on every seasonalEvent config
// seen so far. Weekly shop events additionally scope quest names with "_week{N}"; single-week/
// survival events (e.g. May) don't.
export function deriveEventPrefix(theme: string, week?: number): string {
    return week ? `${theme}_week${week}` : theme;
}
