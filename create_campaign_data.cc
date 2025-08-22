#include "create_campaign_data.h"

#include <cstdlib>
#include <fstream>
#include <tuple>

#include "absl/log/log.h"
#include "absl/status/status.h"
#include "absl/strings/match.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

namespace {

std::string GetCampaignName(const Campaign& campaign) {
  const std::map<std::string, std::string> kCampaignNames = {
      {"campaign1", "Indomitus"},
      {"campaign2", "Fall of Cadia"},
      {"campaign3", "Octarius"},
      {"campaign4", "Saim-Hann"},
      {"mirror1", "Indomitus Mirror"},
      {"mirror2", "Fall of Cadia Mirror"},
      {"mirror3", "Octarius Mirror"},
      {"mirror4", "Saim-Hann Mirror"},
      {"elite1", "Indomitus Elite"},
      {"elite2", "Fall of Cadia Elite"},
      {"elite3", "Octarius Elite"},
      {"elite4", "Saim-Hann Elite"},
      {"eliteMirror1", "Indomitus Mirror Elite"},
      {"eliteMirror2", "Fall of Cadia Mirror Elite"},
      {"eliteMirror3", "Octarius Mirror Elite"},
      {"eliteMirror4", "Saim-Hann Mirror Elite"},
      {"eventStandard1", "Adeptus Mechanicus Standard"},
      {"eventStandard2", "Tyranids Standard"},
      {"eventStandard3", "T'au Empire Standard"},
      {"eventExtremis1", "Adeptus Mechanicus Extremis"},
      {"eventExtremis2", "Tyranids Extremis"},
      {"eventExtremis3", "T'au Empire Extremis"},
  };
  auto it = kCampaignNames.find(campaign.id());
  if (it == kCampaignNames.end()) {
    LOG(ERROR) << "Unknown campaign id: " << campaign.id();
    return "Unknown Campaign";
  }
  return it->second;
}

std::string GetCampaignType(const Campaign& campaign,
                            const Campaign::Battle& battle) {
  if (GetCampaignName(campaign) == "Indomitus") {
    int battle_number;
    if (!absl::SimpleAtoi(battle.id(), &battle_number)) {
      LOG(ERROR) << "Invalid battle id: " << battle.id();
      return "Normal";
    }
    if (battle_number < 15) {
      return "SuperEarly";
    }
    if (battle_number < 30) {
      return "Early";
    }
  }
  if (absl::StartsWith(campaign.id(), "campaign")) return "Normal";
  if (absl::StartsWith(campaign.id(), "mirror")) return "Mirror";
  if (absl::StartsWith(campaign.id(), "elite")) return "Elite";
  if (absl::StartsWith(campaign.id(), "eventStandard")) return "Normal";
  if (absl::StartsWith(campaign.id(), "eventExtremis")) return "Extremis";
  LOG(ERROR) << "Unknown campaign type for id: " << campaign.id();
  return "Unknown";
}

std::string GetBattleId(const Campaign& campaign,
                        const Campaign::Battle& battle) {
  const std::map<std::string, std::string> kCampaignPrefixes = {
      {"campaign1", "I"},        {"campaign2", "FoC"},
      {"campaign3", "O"},        {"campaign4", "SH"},
      {"mirror1", "IM"},         {"mirror2", "FoCM"},
      {"mirror3", "OM"},         {"mirror4", "SHM"},
      {"elite1", "IE"},          {"elite2", "FoCE"},
      {"elite3", "OE"},          {"elite4", "SHE"},
      {"eliteMirror1", "IME"},   {"eliteMirror2", "FoCME"},
      {"eliteMirror3", "OME"},   {"eliteMirror4", "SHME"},
      {"eventStandard1", "AMS"}, {"eventStandard2", "TS"},
      {"eventStandard3", "TAS"}, {"eventExtremis1", "AME"},
      {"eventExtremis2", "TE"},  {"eventExtremis3", "TAE"},
  };
  if (absl::EndsWith(battle.id(), "B")) {
    return absl::StrCat(kCampaignPrefixes.at(campaign.id()), "C", battle.id());
  }
  return absl::StrCat(kCampaignPrefixes.at(campaign.id()), battle.id());
}

void EmitBattleRewards(std::ostream& out,
                       const Campaign::Battle::Reward& reward) {
  out << "        \"rewards\": {\n";
  {
    bool first = true;
    out << "            \"guaranteed\": [";
    for (const Campaign::Battle::GuaranteedRewardItem& reward : reward.base()) {
      if (!first) out << ",";
      out << "\n";
      first = false;
      out << "                {\n";
      out << "                    \"id\": \"" << reward.id() << "\",\n";
      out << "                    \"min\": " << reward.min() << ",\n";
      out << "                    \"max\": " << reward.max() << "\n";
      out << "                }";
    }
  }
  out << "\n            ],\n";
  out << "            \"potential\": [\n";
  out << "                {\n";
  out << "                    \"id\": \"" << reward.chance_of().id() << "\",\n";
  out << "                    \"chance_numerator\": "
      << reward.chance_of().chance_numerator() << ",\n";
  out << "                    \"chance_denominator\": "
      << reward.chance_of().chance_denominator() << ",\n";
  out << "                    \"effective_rate\": "
      << absl::StrFormat("%.3f", reward.chance_of().effective_rate()) << "\n";
  out << "                }\n";
  out << "\n            ]\n";
  out << "        },\n";
}

const std::map<std::string, const Npc*>& GetNpcMap(const GameConfig& config) {
  static std::map<std::string, const Npc*> npc_map;
  if (npc_map.empty()) {
    for (const auto& npc : config.client_game_config().units().npcs()) {
      npc_map[npc.id()] = &npc;
    }
  }
  return npc_map;
}

struct EnemyDetails {
  std::string id;
  std::string name;
  int rank;
  int stars;
  bool operator<(const EnemyDetails& other) const {
    return std::tie(id, rank, stars) <
           std::tie(other.id, other.rank, other.stars);
  }
  bool operator==(const EnemyDetails& other) const {
    return std::tie(id, rank, stars) ==
           std::tie(other.id, other.rank, other.stars);
  }
};

void CollectEnemyInfo(const std::map<std::string, int>& enemies,
                      const GameConfig& config,
                      std::set<std::string>& alliances,
                      std::set<std::string>& factions,
                      std::map<EnemyDetails, int>& enemy_details) {
  const std::map<std::string, const Npc*>& npc_map = GetNpcMap(config);
  for (const auto& [enemy, count] : enemies) {
    const auto index = enemy.find(':');
    if (enemy == "powupHealth") continue;
    if (index == std::string::npos) {
      LOG(ERROR) << "Invalid enemy format: " << enemy;
      continue;
    }
    const std::string npc_id = enemy.substr(0, index);
    int level;
    if (!absl::SimpleAtoi(enemy.substr(index + 1), &level)) {
      LOG(ERROR) << "Invalid level format for enemy: " << enemy;
    }
    if (auto it = enemy.find("Boss"); it != std::string::npos) {
      // For whatever reason, SP made the boss indices 1-based, but the
      // normal-NPC indices 0 based.
      level -= 1;
    }
    if (npc_id == "necroNpc1TutWarriorFTUEtest") {
      // Some random NPC goes out of bounds.
      level -= 1;
    }
    auto it = npc_map.find(npc_id);
    if (it == npc_map.end()) {
      LOG(ERROR) << "Unknown NPC id: " << npc_id;
      continue;
    }
    const Npc* npc = it->second;
    if (level < 0 || level >= npc->stats_size()) {
      if (level < 0) {
        LOG(ERROR) << "NPC " << npc_id << " has negative level: " << level;
        continue;
      }
      // The T'au bosses in the T'au Extremis challenge 25B go out of bounds.
      if (level >= npc->stats_size()) level = npc->stats_size() - 1;
    }
    alliances.insert(npc->alliance());
    factions.insert(npc->faction_id());
    EnemyDetails details = {
        .id = npc->id(),
        .name = npc->name(),
        .rank = npc->stats(level).rank(),
        .stars = npc->stats(level).stars(),
    };
    auto it2 = enemy_details.insert({details, count});
    if (!it2.second) it2.first->second += count;
  }
}

int GetEnemyCount(const std::map<EnemyDetails, int>& details) {
  int total = 0;
  for (const auto& [enemy_details, count] : details) {
    total += count;
  }
  return total;
}

std::set<std::string> GetEnemyTypes(
    const std::map<EnemyDetails, int>& details) {
  std::set<std::string> types;
  for (const auto& [enemy_details, count] : details) {
    types.insert(enemy_details.name);
  }
  return types;
}

template <typename T>
void EmitArray(std::ostream& out, const T& items, bool one_line = false,
               const std::string& indent = "  ") {
  if (items.empty()) return;
  if (one_line) {
    bool first = true;
    for (const auto& item : items) {
      if (!first) out << ", ";
      first = false;
      out << "\"" << item << "\"";
    }
    return;
  }
  bool first = true;
  for (const auto& item : items) {
    if (!first) out << ",";
    first = false;
    out << "\n" << indent << "\"" << item << "\"";
  }
}

std::string RankToString(int rank) {
  switch (rank) {
    case 0:
      return "Stone 1";
    case 1:
      return "Stone 2";
    case 2:
      return "Stone 3";
    case 3:
      return "Iron 1";
    case 4:
      return "Iron 2";
    case 5:
      return "Iron 3";
    case 6:
      return "Bronze 1";
    case 7:
      return "Bronze 2";
    case 8:
      return "Bronze 3";
    case 9:
      return "Silver 1";
    case 10:
      return "Silver 2";
    case 11:
      return "Silver 3";
    case 12:
      return "Gold 1";
    case 13:
      return "Gold 2";
    case 14:
      return "Gold 3";
    case 15:
      return "Diamond 1";
    case 16:
      return "Diamond 2";
    case 17:
      return "Diamond 3";
    case 18:
      return "Adamantine 1";
    case 19:
      return "Adamantine 2";
    case 20:
      return "Adamantine 3";
    default:
      LOG(ERROR) << "Unknown rank: " << rank;
      return "Unknown Rank";
  }
}

void EmitEnemies(std::ostream& out, const GameConfig& config,
                 const Campaign::Battle& battle) {
  std::set<std::string> alliances, factions;
  std::map<EnemyDetails, int> enemy_details;
  std::map<std::string, int> enemies;
  for (const std::string& enemy : battle.enemies()) {
    enemies[enemy]++;
  }
  CollectEnemyInfo(enemies, config, alliances, factions, enemy_details);
  out << "        \"enemiesAlliances\": [";
  EmitArray(out, alliances, /*one_line=*/true);
  out << "],\n";
  out << "        \"enemiesFactions\": [";
  EmitArray(out, factions, /*one_line=*/true);
  out << "],\n";
  out << "        \"enemiesTotal\": " << GetEnemyCount(enemy_details) << ",\n";
  out << "        \"enemiesTypes\": [";
  EmitArray(out, GetEnemyTypes(enemy_details), /*one_line=*/false,
            "            ");
  out << "\n        ],\n";
  out << "        \"detailedEnemyTypes\": [";
  bool first = true;
  for (const auto& [enemy_details, count] : enemy_details) {
    if (!first) out << ",";
    first = false;
    out << "\n";
    out << "            {\n";
    out << "                \"id\": \"" << enemy_details.id << "\",\n";
    out << "                \"name\": \"" << enemy_details.name << "\",\n";
    out << "                \"count\": " << count << ",\n";
    out << "                \"stars\": " << enemy_details.stars << ",\n";
    out << "                \"rank\": \"" << RankToString(enemy_details.rank)
        << "\"\n";
    out << "            }";
  }
  out << "\n        ]\n";
}

void EmitCampaignBattle(std::ostream& out, const GameConfig& config,
                        const Campaign& campaign,
                        const Campaign::Battle& battle) {
  out << "    \"" << GetBattleId(campaign, battle) << "\": {\n";
  out << "        \"campaign\": \"" << GetCampaignName(campaign) << "\",\n";
  out << "        \"campaignType\": \"" << GetCampaignType(campaign, battle)
      << "\",\n";
  out << "        \"energyCost\": " << battle.energy_cost() << ",\n";
  int node_number;
  absl::string_view battle_id = battle.id();
  if (absl::EndsWith(battle.id(), "B")) {
    battle_id = battle_id.substr(0, battle_id.size() - 1);
  }
  if (!absl::SimpleAtoi(battle_id, &node_number)) {
    LOG(ERROR) << "Invalid battle id: " << battle.id();
    node_number = -1;
  }
  out << "        \"nodeNumber\": " << node_number << ",\n";
  out << "        \"slots\": " << battle.spawn_points() << ",\n";
  out << "        \"requiredCharacterSnowprintIds\": [";
  bool first = true;
  for (const absl::string_view unit : battle.required_units()) {
    if (!first) out << ",";
    first = false;
    out << "\"" << unit << "\"";
  }
  out << "],\n";
  EmitBattleRewards(out, battle.reward());
  EmitEnemies(out, config, battle);
  out << "    }";
}

void EmitCampaignBattles(std::ostream& out, const GameConfig& config,
                         const Campaign& campaign, bool& first) {
  for (const Campaign::Battle& battle : campaign.battles()) {
    if (!first) out << ",";
    first = false;
    out << "\n";
    EmitCampaignBattle(out, config, campaign, battle);
  }
}

}  // namespace

absl::Status CreateCampaignData(const absl::string_view path,
                                const GameConfig& game_config) {
  std::ofstream out(std::string(path).c_str());
  // std::ostream& out = std::cout;  // debug

  out << "{";
  bool first = true;

  for (const Campaign& campaign :
       game_config.client_game_config().battles().standard_campaigns()) {
    EmitCampaignBattles(out, game_config, campaign, first);
  }
  for (const Campaign& campaign :
       game_config.client_game_config().battles().mirror_campaigns()) {
    EmitCampaignBattles(out, game_config, campaign, first);
  }
  for (const Campaign& campaign :
       game_config.client_game_config().battles().elite_campaigns()) {
    EmitCampaignBattles(out, game_config, campaign, first);
  }
  for (const Campaign& campaign :
       game_config.client_game_config().battles().mirror_elite_campaigns()) {
    EmitCampaignBattles(out, game_config, campaign, first);
  }
  for (const Campaign& campaign :
       game_config.client_game_config().battles().campaign_events()) {
    EmitCampaignBattles(out, game_config, campaign, first);
  }
  out << "\n}\n";
  return absl::OkStatus();
}

}  // namespace dataminer
