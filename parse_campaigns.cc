#include "parse_campaigns.h"

#include <iostream>

#include "absl/log/log.h"
#include "absl/status/statusor.h"
#include "absl/strings/ascii.h"
#include "absl/strings/match.h"
#include "absl/strings/numbers.h"
#include "calculate_effective_drop_rate.h"
#include "libjson/json/value.h"
#include "miner.pb.h"
#include "status_macros.h"

namespace dataminer {

namespace {

absl::StatusOr<Campaign::Battle::GuaranteedRewardItem>
ParseGuaranteedRewardItem(absl::string_view item) {
  item = absl::StripAsciiWhitespace(item);
  Campaign::Battle::GuaranteedRewardItem reward_item;
  if (item.empty()) {
    return absl::InvalidArgumentError("Reward item cannot be empty.");
  }
  const auto colon_index = item.find(':');
  if (colon_index == absl::string_view::npos) {
    reward_item.set_id(item);
    reward_item.set_min(1);
    reward_item.set_max(1);
  } else {
    reward_item.set_id(item.substr(0, colon_index));
    const auto range_str = item.substr(colon_index + 1);
    const auto dash_index = range_str.find('-');
    if (dash_index == absl::string_view::npos) {
      int amount;
      RET_CHECK(absl::SimpleAtoi(range_str, &amount))
          << "Reward item must be in the format 'item:min-max' or "
             "'item:amount'.";
      reward_item.set_min(amount);
      reward_item.set_max(amount);
    } else {
      const auto min_str = range_str.substr(0, dash_index);
      const auto max_str = range_str.substr(dash_index + 1);
      int min_value = 0;
      int max_value = 0;
      RET_CHECK(absl::SimpleAtoi(min_str, &min_value) &&
                absl::SimpleAtoi(max_str, &max_value))
          << "Reward item must be in the format 'item:min-max'.";
      reward_item.set_min(min_value);
      reward_item.set_max(max_value);
    }
  }
  return reward_item;
}

absl::StatusOr<Campaign::Battle::PotentialRewardItem> ParsePotentialRewardItem(
    const absl::string_view item) {
  Campaign::Battle::PotentialRewardItem ret;
  const auto mod_index = item.find('%');
  RET_CHECK(mod_index != absl::string_view::npos)
      << "Potential reward item must end with '%A/B'.";
  absl::string_view reward = item.substr(0, mod_index);
  ret.set_id(reward);
  absl::string_view chance_str = item.substr(mod_index + 1);
  int chance_numerator = 0;
  int chance_denominator = 0;
  const auto slash_index = chance_str.find('/');
  RET_CHECK(slash_index != absl::string_view::npos)
      << "Potential reward item must be in the format 'item%N/D'.";
  RET_CHECK(
      absl::SimpleAtoi(chance_str.substr(0, slash_index), &chance_numerator))
      << "Invalid numerator in potential reward item.";
  RET_CHECK(
      absl::SimpleAtoi(chance_str.substr(slash_index + 1), &chance_denominator))
      << "Invalid denominator in potential reward item.";
  ret.set_chance_numerator(chance_numerator);
  ret.set_chance_denominator(chance_denominator);
  ret.set_effective_rate(CalculateEffectiveDropRate(ret.chance_numerator(),
                                                    ret.chance_denominator()));
  return ret;
}

absl::StatusOr<Campaign::Battle::Reward> ParseBattleReward(
    const Json::Value& reward) {
  Campaign::Battle::Reward battle_reward;

  if (reward.isMember("base")) {
    const Json::Value& base = reward["base"];
    RET_CHECK(base.isArray()) << "Battle reward 'base' must be an array.";
    for (const Json::Value& item : base) {
      RET_CHECK(item.isString()) << "Each item in 'base' must be a string.";
      ASSIGN_OR_RETURN(*battle_reward.add_base(),
                       ParseGuaranteedRewardItem(item.asString()));
    }
  }
  if (reward.isMember("chanceOf")) {
    const Json::Value& chance_of = reward["chanceOf"];
    RET_CHECK(chance_of.isString())
        << "Battle reward 'chanceOf' must be a string.";
    ASSIGN_OR_RETURN(*battle_reward.mutable_chance_of(),
                     ParsePotentialRewardItem(chance_of.asString()));
  }
  return battle_reward;
}

absl::StatusOr<Campaign::Battle> ParseCampaignBattle(const Json::Value& battle,
                                                     Campaign& campaign) {
  Campaign::Battle campaign_battle;
  RET_CHECK(battle.isObject()) << "Each battle must be an object.";
  RET_CHECK(battle.isMember("battleId") && battle["battleId"].isString())
      << "Each battle must have a 'battleId' string.";
  campaign_battle.set_id(battle["battleId"].asString());
  if (battle.isMember("boss") && battle["boss"].isString()) {
    campaign_battle.set_boss(battle["boss"].asString());
  }
  if (battle.isMember("lightningVictory") &&
      battle["lightningVictory"].isInt()) {
    campaign_battle.set_lightning_victory(battle["lightningVictory"].asInt());
  }
  if (battle.isMember("maxAttempts") && battle["maxAttempts"].isInt()) {
    campaign_battle.set_max_attempts(battle["maxAttempts"].asInt());
  }
  std::vector<int> player_teams;
  RET_CHECK(battle.isMember("playerTeams") && battle["playerTeams"].isArray())
      << "Each battle must have a 'playerTeams' array.";
  for (const Json::Value& team : battle["playerTeams"]) {
    player_teams.push_back(team.asInt());
  }
  if (battle.isMember("requiredUnits") && battle["requiredUnits"].isArray()) {
    for (const Json::Value& unit : battle["requiredUnits"]) {
      RET_CHECK(unit.isString())
          << "Each unit in 'requiredUnits' must be a string.";
      campaign_battle.add_required_units(unit.asString());
    }
  }
  RET_CHECK(battle.isMember("spawnpoints") && battle["spawnpoints"].isInt())
      << "Each battle must have a 'spawnpoints' integer.";
  campaign_battle.set_spawn_points(battle["spawnpoints"].asInt());
  if (battle.isMember("staminaCost") && battle["staminaCost"].isInt()) {
    campaign_battle.set_energy_cost(battle["staminaCost"].asInt());
  }
  if (battle.isMember("units") && battle["units"].isArray()) {
    int index = -1;
    for (const Json::Value& unit_array : battle["units"]) {
      ++index;
      if (player_teams[index] == 1) continue;  // Don't record friendlies.
      RET_CHECK(unit_array.isArray())
          << "Each unit in 'units' must be an array.";
      for (const Json::Value& unit : unit_array) {
        RET_CHECK(unit.isString())
            << "Each unit in 'units[]' must be a string.";
        if (!unit.asString().empty()) {
          campaign_battle.add_enemies(unit.asString());
        }
      }
    }
  }
  if (battle.isMember("loot") && battle["loot"].isObject()) {
    ASSIGN_OR_RETURN(*campaign_battle.mutable_reward(),
                     ParseBattleReward(battle["loot"]));
  }
  return campaign_battle;
}

absl::StatusOr<Campaign> ParseCampaign(const Json::Value& campaign) {
  Campaign ret;

  RET_CHECK(campaign.isObject()) << "Campaign must be an object.";
  RET_CHECK(campaign.isMember("id")) << "Campaign is missing 'id'.";
  RET_CHECK(campaign.isMember("battles")) << "Campaign is missing 'battles'.";
  Json::Value factions = campaign.get("unlockConditions", {})
                             .get("requiredUnits", {})
                             .get("allowedFactions", {});
  RET_CHECK(factions.isArray())
      << "Campaign is missing "
         "'unlockConditions.requiredUnits.allowedFactions'.";
  ret.set_id(campaign["id"].asString());
  for (const Json::Value& faction : factions) {
    RET_CHECK(faction.isString())
        << "Each faction in 'allowedFactions' must be a string.";
    ret.add_allowed_factions(faction.asString());
  }
  Json::Value battles = campaign["battles"];
  RET_CHECK(battles.isArray()) << "Campaign 'battles' must be an array.";
  for (const Json::Value& battle : battles) {
    ASSIGN_OR_RETURN(*ret.add_battles(), ParseCampaignBattle(battle, ret));
  }

  return ret;
}

}  // namespace

absl::StatusOr<Battles> ParseCampaigns(const Json::Value& root) {
  Battles battles;
  RET_CHECK(root.isObject()) << "Parsed JSON for 'battles' must be an object.";
  RET_CHECK(root.isMember("campaigns")) << "Missing 'campaigns' in JSON.";
  const Json::Value& campaignsContainer = root["campaigns"];
  RET_CHECK(campaignsContainer.isObject()) << "'campaigns' must be an object.";
  constexpr absl::string_view kCampaignTypes[] = {
      "Elite", "EliteMirror", "Event", "Mirror", "Standard"};
  for (const absl::string_view type : kCampaignTypes) {
    RET_CHECK(campaignsContainer.isMember(type))
        << "Missing '" << type << "' in 'campaigns'.";
    const Json::Value& campaigns = campaignsContainer[type];
    RET_CHECK(campaigns.isArray()) << "'" << type << "' must be an array.";
    for (const Json::Value& campaign : campaigns) {
      RET_CHECK(campaign.isObject())
          << "Each item in '" << type << "' must be an object.";
      Campaign new_campaign;
      ASSIGN_OR_RETURN(new_campaign, ParseCampaign(campaign));
      if (type == "Elite") {
        *battles.add_elite_campaigns() = new_campaign;
      } else if (type == "EliteMirror") {
        *battles.add_mirror_elite_campaigns() = new_campaign;
      } else if (type == "Event") {
        *battles.add_campaign_events() = new_campaign;
      } else if (type == "Mirror") {
        *battles.add_mirror_campaigns() = new_campaign;
      } else if (type == "Standard") {
        *battles.add_standard_campaigns() = new_campaign;
      }
    }
  }
  return battles;
}

}  // namespace dataminer
