import * as fs from 'fs';

export interface BattleGoldMedal {
    campaignBattleId: string;
    goldMedal: string;
}

export interface CampaignGoldMedalRewards {
    factionId: string;
    standard: BattleGoldMedal[];
    extremis: BattleGoldMedal[];
}

export interface ExtractCeGoldMedalRewardsParams {
    gameconfigPath: string;
}

export function extractCeGoldMedalRewards({ gameconfigPath }: ExtractCeGoldMedalRewardsParams): CampaignGoldMedalRewards[] {
    const data = JSON.parse(fs.readFileSync(gameconfigPath, 'utf-8'));

    return data.clientGameConfig.liveEvents.idunLiveEventConfigs[1095].campaigns.map((campaign: any) => ({
        factionId: campaign.factionId,
        standard: campaign.standardBattles.map((battle: any) => ({
            campaignBattleId: battle.campaignBattleId,
            goldMedal: battle.loot.goldMedal,
        })),
        extremis: campaign.extremisBattles.map((battle: any) => ({
            campaignBattleId: battle.campaignBattleId,
            goldMedal: battle.loot.goldMedal,
        })),
    }));
}
