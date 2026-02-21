// This is the main program that drives datamining. Before running this, you
// need datamine the i18n JSON file and the gameconfig JSON file. The
// gameconfig contains all the nerdy stuff we care about, and the i18n
// contains the display data, internationalized obviously, but we only
// extract english.
//
// Once you have the files extracted, you need to add them to the data array
// in the cc_binary build rule in the BUILD file. Then, you can run the
// following command to generate the new files for the planner.
//
// This assumes that you have an environment variable called MINING_OUTPUT
// that lists the directory where you want to dump the mined json.
//

/*
bazel run -c opt :miner -- \
  --game_config=gameconfig.1.36.json \
  --i18n_strings_json=I2Languages_en.1.36.json \
  --visuals_file=visuals_1.36.csv \
  --recipe_data=$MINING_OUTPUT/newRecipeData.json \
  --rank_up_data=$MINING_OUTPUT/newRankUpData.json \
  --character_data=$MINING_OUTPUT/newCharacterData.json \
  --campaign_data=$MINING_OUTPUT/newCampaignData.json \
  --le_data=$MINING_OUTPUT/newLeData.json \
  --mow_data=$MINING_OUTPUT/newMowData.json \
  --npc_data=$MINING_OUTPUT/newNpcData.json \
  --le_data=$MINING_OUTPUT/newLeBattlesData.json \
  --equipment_data=$MINING_OUTPUT/newEquipmentData.json \
  --ability_icon_file=$MINING_OUTPUT/ability-icons.ts \
  --drop_rate_config_path=drop_rate_config.binaryproto \
  --effective_rate_simulation_runs=10000000
*/

//
// The drop-rate config above is used to cache the results of calculating
// effective drop rates. Instead of implementing a bunch of matrix math, we
// simulate many, many raids of a node with a specific chanceOf and memoize
// the results. Persisting the data ensures file stability across multiple
// runs.
//
// If you don't have a drop-rate config, you can specify
// --allow_empty_drop_rate_config, which allows the miner to bootstrap the
// config.
//
// The config can hold different effective rates based on the number of
// simulations you want to run, with the default being 1B per chanceOf. If you
// want to calculate effective rates for a different amount, you can change the
// numver of sims per chanceOf with --effective_rate_simulation_runs.
//
// When you're done, you just need to copy the new files into the planner
// directory, overwriting the previous files (don't worry, we use version
// control for a reason).

#include <fstream>
#include <iostream>

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/log/log.h"
#include "absl/status/statusor.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/str_join.h"
#include "absl/strings/str_split.h"
#include "create_ability_data.h"
#include "create_campaign_data.h"
#include "create_character_data.h"
#include "create_equipment_data.h"
#include "create_le_data.h"
#include "create_mow_data.h"
#include "create_npc_data.h"
#include "create_rank_up_data.h"
#include "create_recipe_data.h"
#include "libjson/json/reader.h"
#include "libjson/json/value.h"
#include "miner.pb.h"
#include "parse_avatars.h"
#include "parse_campaigns.h"
#include "parse_items.h"
#include "parse_le_battles.h"
#include "parse_units.h"
#include "parse_upgrades.h"
#include "status_macros.h"

ABSL_FLAG(std::string, game_config, "", "The GameConfig.json file to parse");
ABSL_FLAG(std::string, i18n_strings_json, "",
          "The json file with the i18n'd display strings for things like the "
          "characters' names and titles.");
ABSL_FLAG(std::string, visuals_file, "",
          "CSV file mapping visual IDs to image filenames.");
ABSL_FLAG(std::string, rank_up_file, "",
          "The CSV file to write rank up information to.");
ABSL_FLAG(std::string, recipe_data, "",
          "If not empty, writes all upgrade recipes to the specified file.");
ABSL_FLAG(std::string, rank_up_data, "",
          "If not empty, writes all rank-up recipes to the specified file.");
ABSL_FLAG(std::string, character_data, "",
          "If not empty, writes all character data to the specified file.");
ABSL_FLAG(std::string, campaign_data, "",
          "If not empty, writes all campaign data to the specified file.");
ABSL_FLAG(std::string, mow_data, "",
          "If not empty, writes all mow data to the specified file.");
ABSL_FLAG(std::string, equipment_data, "",
          "If not empty, writes all equipment data to the specified file.");
ABSL_FLAG(std::string, npc_data, "",
          "If not empty, writes all NPC data to the specified file.");
ABSL_FLAG(std::string, le_data, "",
          "If not empty, writes all legendary event battle data to the "
          "specified file.");
ABSL_FLAG(std::string, ability_icon_file, "",
          "If not empty, writes all ability icon data to the specified file.");

namespace dataminer {
namespace {

absl::StatusOr<std::vector<Achievement::Milestone>> ParseMilestones(
    const Json::Value& milestones) {
  std::vector<Achievement::Milestone> result;
  if (!milestones.isArray()) {
    return absl::InvalidArgumentError("Milestones must be an array.");
  }
  for (const Json::Value& milestone : milestones) {
    if (!milestone.isObject()) {
      return absl::InvalidArgumentError("Each milestone must be an object.");
    }
    Achievement::Milestone m;
    if (milestone.isMember("goal")) {
      m.set_goal(milestone.get("goal", {}).asInt());
    }
    if (milestone.isMember("reward")) {
      m.set_reward(milestone.get("reward", {}).asString());
    }
    result.push_back(std::move(m));
  }
  return result;
}

absl::StatusOr<std::vector<Achievement>> ParseAchievements(
    const Json::Value& achievements) {
  std::vector<Achievement> result;
  if (!achievements.isArray()) {
    return absl::InvalidArgumentError("Achievements must be an array.");
  }
  for (const Json::Value& achievement : achievements) {
    if (!achievement.isObject()) {
      return absl::InvalidArgumentError("Each achievement must be an object.");
    }
    Achievement a;
    if (!achievement.isMember("achievementId")) {
      return absl::InvalidArgumentError(
          "Each achievement must have an 'achievementId' field.");
    }
    a.set_id(achievement.get("achievementId", "").asString());
    if (!achievement.isMember("taskId")) {
      return absl::InvalidArgumentError(
          "Each achievement must have a 'taskId' field.");
    }
    a.set_task_id(achievement.get("taskId", "").asString());
    if (achievement.isMember("milestones")) {
      auto milestones = ParseMilestones(achievement["milestones"]);
      if (!milestones.ok()) {
        return absl::InvalidArgumentError(absl::StrCat(
            "Error parsing milestones: ", milestones.status().message()));
      }
      for (Achievement::Milestone& milestone : *milestones) {
        *a.add_milestones() = std::move(milestone);
      }
    }
    result.push_back(std::move(a));
  }
  return result;
}

absl::StatusOr<ClientGameConfig> ParseClientGameConfig(
    const Json::Value& root) {
  std::vector<ClientGameConfig> config;
  if (!root.isObject()) {
    return absl::InvalidArgumentError("Parsed JSON is not an object.");
  }
  if (!root.isMember("achievements")) {
    return absl::InvalidArgumentError("Missing 'achievements' in JSON.");
  }
  auto achievements = ParseAchievements(root.get("achievements", {}));
  if (!achievements.ok()) {
    return absl::InvalidArgumentError(absl::StrCat(
        "Error parsing achievements: ", achievements.status().message()));
  }

  ClientGameConfig client_config;
  for (const Achievement& achievement : *achievements) {
    *client_config.add_achievements() = std::move(achievement);
  }

  absl::StatusOr<Upgrades> upgrades = ParseUpgrades(root.get("upgrades", {}));
  if (!upgrades.ok()) {
    return absl::InvalidArgumentError(
        absl::StrCat("Error parsing upgrades: ", upgrades.status().message()));
  }
  *client_config.mutable_upgrades() = std::move(*upgrades);

  absl::StatusOr<Units> units = ParseUnits(root.get("units", {}));
  if (!units.ok()) {
    return absl::InvalidArgumentError(
        absl::StrCat("Error parsing units: ", units.status().message()));
  }
  *client_config.mutable_units() = std::move(*units);

  absl::StatusOr<Avatars> avatars = ParseAvatars(root.get("avatars", {}));
  if (!avatars.ok()) {
    return absl::InvalidArgumentError(
        absl::StrCat("Error parsing avatars: ", avatars.status().message()));
  }
  *client_config.mutable_avatars() = std::move(*avatars);

  ASSIGN_OR_RETURN(*client_config.mutable_battles(),
                   ParseCampaigns(root.get("battles", {})));

  ASSIGN_OR_RETURN(*client_config.mutable_items(),
                   ParseItems(root.get("items", {})));

  ASSIGN_OR_RETURN(*client_config.mutable_items(),
                   ParseItems(root.get("items", {})));

  ASSIGN_OR_RETURN(
      *client_config.mutable_legendary_events(),
      ParseLeBattles(root.get("battles", {}).get("battleSets", {})));

  return client_config;
}

absl::StatusOr<GameConfig> ParseGameConfig(Json::Value& root) {
  GameConfig config;
  auto client_config = ParseClientGameConfig(root["clientGameConfig"]);
  if (!client_config.ok()) {
    return absl::InvalidArgumentError(absl::StrCat(
        "Error parsing ClientGameConfig: ", client_config.status().message()));
  }
  *config.mutable_client_game_config() = std::move(*client_config);
  if (!root.isObject()) {
    return absl::InvalidArgumentError("Parsed JSON is not an object.");
  }

  if (!root.isMember("clientGameConfigVersion")) {
    return absl::InvalidArgumentError(
        "Missing 'clientGameConfigVersion' in JSON.");
  }
  if (!root.isMember("fullConfig")) {
    return absl::InvalidArgumentError("Missing 'fullConfig' in JSON.");
  }
  if (!root.isMember("fullConfigHash")) {
    return absl::InvalidArgumentError("Missing 'fullConfigHash' in JSON.");
  }
  config.set_client_game_config_version(
      root["clientGameConfigVersion"].asString());
  config.set_full_config(root["fullConfig"].asBool());
  config.set_full_config_hash(root["fullConfigHash"].asString());

  return config;
}

struct UpgradePtrLess {
  bool operator()(const Upgrades::Upgrade* lhs,
                  const Upgrades::Upgrade* rhs) const {
    if (lhs->rarity() != rhs->rarity()) return lhs->rarity() < rhs->rarity();
    return lhs->id() < rhs->id();
  }
};

// Expands the materials required for upgrading a unit, recursively expanded
// recipes if necessary. `upgrade_material` is the snowprint ID of the material
// to expand.
void ExpandMats(
    const std::map<std::string, const Upgrades::Upgrade*>& upgrades_map,
    std::map<const Upgrades::Upgrade*, int, UpgradePtrLess>& total_mats,
    const absl::string_view upgrade_material) {
  const auto it = upgrades_map.find(std::string(upgrade_material));
  if (it == upgrades_map.end()) {
    LOG(ERROR) << "Material '" << upgrade_material
               << "' not found in upgrades_map.\n";
    return;
  }
  const Upgrades::Upgrade* mat = it->second;
  if (!mat->has_recipe()) {
    total_mats[mat]++;
    return;
  }
  for (const Upgrades::Upgrade::Recipe::Ingredient& mat_item :
       mat->recipe().ingredients()) {
    for (int i = 0; i < mat_item.amount(); ++i) {
      ExpandMats(upgrades_map, total_mats, mat_item.id());
    }
  }
}

// Returns a map from the snowprint ID of the upgrade material to the Upgrade
// object.
std::map<std::string, const Upgrades::Upgrade*> BuildUpgradesMap(
    const GameConfig& config) {
  std::map<std::string, const Upgrades::Upgrade*> upgrades_map;
  for (const auto& upgrade :
       config.client_game_config().upgrades().upgrades()) {
    upgrades_map[upgrade.id()] = &upgrade;
  }
  return upgrades_map;
}

void EmitRankUp(const GameConfig& config, const absl::string_view output_path) {
  std::ostream* out;
  std::unique_ptr<std::ofstream> file_out;
  if (output_path.empty()) {
    out = &std::cout;
  } else {
    file_out =
        std::make_unique<std::ofstream>(std::string(output_path).c_str());
    out = file_out.get();
  }
  *out << "unit,target_rank,quantity,upgrade_material,rarity\n";
  for (const Unit& unit : config.client_game_config().units().units()) {
    const std::map<std::string, const Upgrades::Upgrade*> upgrades_map =
        BuildUpgradesMap(config);
    std::map<const Upgrades::Upgrade*, int, UpgradePtrLess> total_mats;
    std::map<int, std::map<const Upgrades::Upgrade*, int, UpgradePtrLess>>
        per_rank_mats;
    for (int rank = Rank::STONE_1; rank < Rank::ADAMANTINE_1; ++rank) {
      int i = rank - 1;
      if (i >= unit.rank_up_requirements_size()) {
        LOG(ERROR) << "No rank up requirements for " << unit.id() << ":"
                   << Rank::Enum_Name(rank) << ".\n";
        continue;
      }
      ExpandMats(upgrades_map, per_rank_mats[i],
                 unit.rank_up_requirements(i).top_row_health());
      ExpandMats(upgrades_map, per_rank_mats[i],
                 unit.rank_up_requirements(i).bottom_row_health());
      ExpandMats(upgrades_map, per_rank_mats[i],
                 unit.rank_up_requirements(i).top_row_armor());
      ExpandMats(upgrades_map, per_rank_mats[i],
                 unit.rank_up_requirements(i).bottom_row_armor());
      ExpandMats(upgrades_map, per_rank_mats[i],
                 unit.rank_up_requirements(i).top_row_damage());
      ExpandMats(upgrades_map, per_rank_mats[i],
                 unit.rank_up_requirements(i).bottom_row_damage());
    }
    for (int i = Rank::STONE_1; i < Rank::ADAMANTINE_1; ++i) {
      for (const auto& mat : per_rank_mats[i - 1]) {
        *out << unit.id() << "," << Rank::Enum_Name(i + 1) << "," << mat.second
             << "," << mat.first->id() << "," << mat.first->rarity() << "\n";
      }
    }
  }
  if (file_out != nullptr) file_out->close();
}

absl::StatusOr<std::map<std::string, std::string>> LoadVisuals() {
  const std::string visuals_file = absl::GetFlag(FLAGS_visuals_file);
  std::ifstream in(visuals_file);
  if (!in.is_open()) {
    return absl::InvalidArgumentError(
        absl::StrCat("Couldn't open visuals file: '", visuals_file, "'."));
  }
  std::map<std::string, std::string> visuals_map;
  std::string line;
  while (std::getline(in, line)) {
    std::vector<std::string> parts = absl::StrSplit(line, ',');
    if (parts.size() != 2) {
      return absl::InvalidArgumentError(
          absl::StrCat("Invalid line in visuals file: '", line, "'."));
    }
    for (std::string& part : parts) part = absl::StripAsciiWhitespace(part);
    if (!absl::EndsWith(parts[0], "_visual")) {
      return absl::InvalidArgumentError(
          absl::StrCat("Invalid visual ID in visuals file: '", parts[0], "'."));
    }
    parts[0] =
        parts[0].substr(0, parts[0].size() - 7);  // Remove _visual suffix
    visuals_map[parts[0]] = parts[1];
  }

  std::cout << "visuals: \n";
  for (const auto& pair : visuals_map) {
    std::cout << "  " << pair.first << " => " << pair.second << "\n";
  }
  std::cout << std::endl;

  return visuals_map;
}

std::map<std::string, std::string> ExtractAbilityNames(
    const Json::Value& root) {
  std::map<std::string, std::string> ability_names;
  for (const Json::Value& value : root["mTerms"]) {
    if (!value.isObject()) continue;
    if (!value.isMember("Term") || !value["Term"].isString()) continue;
    if (!value.isMember("Languages") || !value["Languages"].isArray()) continue;
    const std::string term = value["Term"].asString();
    if (!absl::StartsWith(term, "Abilities/") || !absl::EndsWith(term, "_Name"))
      continue;
    const Json::Value& languages = value["Languages"];
    if (languages.empty()) continue;
    if (!languages[0].isString()) continue;
    const std::string name = languages[0].asString();
    const std::string ability_id = term.substr(
        10, term.size() - 15);  // Remove "Abilities/" prefix and "_Name" suffix
    ability_names[ability_id] = name;
  }
  return ability_names;
}

void Main() {
  GameConfig config;
  absl::StatusOr<std::map<std::string, std::string>> visuals = LoadVisuals();
  if (!visuals.ok()) {
    LOG(ERROR) << "Error loading visuals: " << visuals.status().message();
    return;
  }
  {
    Json::Value root;
    Json::Reader reader;

    const std::string input_file = absl::GetFlag(FLAGS_game_config);
    std::ifstream in(input_file);
    if (!reader.parse(in, root)) {
      LOG(ERROR) << "Couldn't parse json file: '" << input_file << "'.";
      LOG(ERROR) << reader.getFormattedErrorMessages();
      LOG(ERROR)
          << "It's quite likely that you added a new gameconfig.json file. If "
             "so, you need to go to the cc_binary rule in the BUILD file and "
             "add the json file to the data array. Sorry, it's a bazel thing.";
      return;
    }
    if (!root.isObject()) {
      LOG(ERROR) << "Parsed JSON is not an object.";
      return;
    }
    auto parsed_config = ParseGameConfig(root);
    if (!parsed_config.ok()) {
      LOG(ERROR) << "Error parsing GameConfig: "
                 << parsed_config.status().message();
      return;
    }
    config = std::move(*parsed_config);
  }

  std::map<std::string, std::string> ability_names;
  {
    Json::Value root;
    Json::Reader reader;

    const std::string input_file = absl::GetFlag(FLAGS_i18n_strings_json);
    std::ifstream in(input_file);
    if (!reader.parse(in, root)) {
      LOG(ERROR) << "Couldn't parse json file: '" << input_file << "'.";
    }
    if (!root.isObject()) {
      LOG(ERROR) << "Parsed JSON is not an object.";
      return;
    }
    absl::Status status = AmendUnitsWithDisplayStrings(
        root, config.mutable_client_game_config()->mutable_units());
    if (!status.ok()) {
      LOG(ERROR) << "Error parsing i18n strings: " << status.message() << "\n";
      return;
    }

    status = AmendUpgradeMaterialsWithDisplayStrings(
        root, config.mutable_client_game_config()->mutable_upgrades());
    if (!status.ok()) {
      LOG(ERROR) << "Error parsing i18n strings: " << status.message() << "\n";
      return;
    }

    ability_names = ExtractAbilityNames(root);
  }

  const std::string rank_up_file = absl::GetFlag(FLAGS_rank_up_file);
  if (!rank_up_file.empty()) {
    LOG(INFO) << "Writing rank up CSV: " << rank_up_file;
    EmitRankUp(config, rank_up_file);
  }

  const std::string recipe_data_file = absl::GetFlag(FLAGS_recipe_data);
  if (!recipe_data_file.empty()) {
    LOG(INFO) << "Writing recipe data to: " << recipe_data_file;
    if (const absl::Status status = CreateRecipeData(recipe_data_file, config);
        !status.ok()) {
      LOG(ERROR) << "Error adjusting recipe data: " << status.message();
    }
  }

  const std::string rank_up_data_file = absl::GetFlag(FLAGS_rank_up_data);
  if (!rank_up_data_file.empty()) {
    LOG(INFO) << "Writing rank up data to: " << rank_up_data_file;
    if (const absl::Status status = CreateRankUpData(rank_up_data_file, config);
        !status.ok()) {
      LOG(ERROR) << "Error creating rank up data: " << status.message();
    }
  }

  const std::string character_data_file = absl::GetFlag(FLAGS_character_data);
  if (!character_data_file.empty()) {
    LOG(INFO) << "Writing character data to: " << character_data_file;
    if (const absl::Status status =
            CreateCharacterData(character_data_file, config, *visuals);
        !status.ok()) {
      LOG(ERROR) << "Error creating character data: " << status.message();
    }
  }

  const std::string campaign_data_file = absl::GetFlag(FLAGS_campaign_data);
  if (!campaign_data_file.empty()) {
    LOG(INFO) << "Writing campaign data to: " << campaign_data_file;
    if (const absl::Status status =
            CreateCampaignData(campaign_data_file, config);
        !status.ok()) {
      LOG(ERROR) << "Error creating campaign data: " << status.message();
    }
  }

  const std::string equipment_data_file = absl::GetFlag(FLAGS_equipment_data);
  if (!equipment_data_file.empty()) {
    LOG(INFO) << "Writing equipment data to: " << equipment_data_file;
    if (const absl::Status status =
            CreateEquipmentData(equipment_data_file, config);
        !status.ok()) {
      LOG(ERROR) << "Error creating equipment data: " << status.message();
    }
  }

  const std::string mow_data_file = absl::GetFlag(FLAGS_mow_data);
  if (!mow_data_file.empty()) {
    LOG(INFO) << "Writing MoW data to: " << mow_data_file;
    if (const absl::Status status = CreateMowData(mow_data_file, config);
        !status.ok()) {
      LOG(ERROR) << "Error creating MoW data: " << status.message();
    }
  }

  const std::string npc_data_file = absl::GetFlag(FLAGS_npc_data);
  if (!npc_data_file.empty()) {
    LOG(INFO) << "Writing NPC data to: " << npc_data_file;
    if (const absl::Status status =
            CreateNpcData(npc_data_file, config, *visuals);
        !status.ok()) {
      LOG(ERROR) << "Error creating NPC data: " << status.message();
    }
  }

  const std::string le_data_file = absl::GetFlag(FLAGS_le_data);
  if (!le_data_file.empty()) {
    LOG(INFO) << "Writing legendary event battle data to: " << le_data_file;
    if (const absl::Status status = CreateLeData(le_data_file, config);
        !status.ok()) {
      LOG(ERROR) << "Error creating legendary event battle data: "
                 << status.message();
    }
  }

  const std::string ability_icon_file = absl::GetFlag(FLAGS_ability_icon_file);
  if (!ability_icon_file.empty()) {
    LOG(INFO) << "Writing ability icon data to: " << ability_icon_file;
    if (const absl::Status status =
            CreateAbilityData(ability_icon_file, ability_names, config);
        !status.ok()) {
      LOG(ERROR) << "Error creating ability icon data: " << status.message();
    }
  }
}

}  // namespace
}  // namespace dataminer

int main(int argc, char** argv) {
  absl::ParseCommandLine(argc, argv);
  dataminer::Main();

  return 0;
}
