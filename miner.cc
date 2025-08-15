#include <fstream>
#include <iostream>

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/log/log.h"
#include "absl/status/statusor.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/str_join.h"
#include "absl/strings/str_split.h"
#include "create_character_data.h"
#include "create_rank_up_data.h"
#include "create_recipe_data.h"
#include "libjson/json/reader.h"
#include "libjson/json/value.h"
#include "miner.pb.h"
#include "parse_avatars.h"
#include "parse_units.h"
#include "parse_upgrades.h"

ABSL_FLAG(std::string, game_config, "", "The GameConfig.json file to parse");
ABSL_FLAG(std::string, i18n_strings_json, "",
          "The json file with the i18n'd display strings for things like the "
          "characters' names and titles.");
ABSL_FLAG(std::string, rank_up_unit, "", "The unit to rank up");
ABSL_FLAG(std::string, rank_up_file, "",
          "The file to write rank up information to.");
ABSL_FLAG(std::string, recipe_data, "",
          "If not empty, writes all upgrade recipes to the specified file.");
ABSL_FLAG(std::string, rank_up_data, "",
          "If not empty, writes all rank-up recipes to the specified file.");
ABSL_FLAG(std::string, character_data, "",
          "If not empty, writes all character data to the specified file.");

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

void ExpandMats(
    const std::map<std::string, const Upgrades::Upgrade*>& upgrades_map,
    std::map<std::string, int>& total_mats,
    const absl::string_view upgrade_material) {
  const auto it = upgrades_map.find(std::string(upgrade_material));
  if (it == upgrades_map.end()) {
    LOG(ERROR) << "Material '" << upgrade_material
               << "' not found in upgrades_map.\n";
    return;
  }
  const Upgrades::Upgrade* mat = it->second;
  if (!mat->has_recipe()) {
    total_mats[mat->name()]++;
    total_mats["gold"] += mat->gold();
  } else {
    for (const auto& mat_item : mat->recipe().ingredients()) {
      for (int i = 0; i < mat_item.amount(); ++i) {
        ExpandMats(upgrades_map, total_mats, mat_item.id());
      }
    }
  }
}

std::map<std::string, const Upgrades::Upgrade*> BuildUpgradesMap(
    const GameConfig& config) {
  std::map<std::string, const Upgrades::Upgrade*> upgrades_map;
  for (const auto& upgrade :
       config.client_game_config().upgrades().upgrades()) {
    upgrades_map[upgrade.id()] = &upgrade;
  }
  return upgrades_map;
}

void EmitRankUp(const GameConfig& config, const absl::string_view name,
                const absl::string_view output_path) {
  const Unit* unit = nullptr;
  for (const auto& u : config.client_game_config().units().units()) {
    if (u.name() == name) {
      unit = &u;
      break;
    }
  }
  if (!unit) {
    LOG(ERROR) << "Unit '" << unit << "' not found in GameConfig.\n";
    return;
  }
  const std::map<std::string, const Upgrades::Upgrade*> upgrades_map =
      BuildUpgradesMap(config);
  std::map<std::string, int> total_mats;
  std::map<int, std::map<std::string, int>> per_rank_mats;
  for (int rank = Rank::STONE_1; rank < Rank::ADAMANTINE_1; ++rank) {
    int i = rank - 1;
    if (i >= unit->rank_up_requirements_size()) {
      LOG(ERROR) << "No rank up requirements for rank " << rank << ".\n";
      continue;
    }
    ExpandMats(upgrades_map, per_rank_mats[i],
               unit->rank_up_requirements(i).top_row_health());
    ExpandMats(upgrades_map, per_rank_mats[i],
               unit->rank_up_requirements(i).bottom_row_health());
    ExpandMats(upgrades_map, per_rank_mats[i],
               unit->rank_up_requirements(i).top_row_armor());
    ExpandMats(upgrades_map, per_rank_mats[i],
               unit->rank_up_requirements(i).bottom_row_armor());
    ExpandMats(upgrades_map, per_rank_mats[i],
               unit->rank_up_requirements(i).top_row_damage());
    ExpandMats(upgrades_map, per_rank_mats[i],
               unit->rank_up_requirements(i).bottom_row_damage());
  }
  for (const auto& rank_mats : per_rank_mats) {
    for (const auto& [mat, amount] : rank_mats.second) {
      total_mats[mat] += amount;
    }
  }
  std::ostream* out;
  std::unique_ptr<std::ofstream> file_out;
  if (output_path.empty()) {
    out = &std::cout;
  } else {
    file_out =
        std::make_unique<std::ofstream>(std::string(output_path).c_str());
    out = file_out.get();
  }
  *out << "material";
  for (int i = Rank::STONE_1; i < Rank::ADAMANTINE_1; ++i) {
    *out << "," << Rank::Enum_Name(i) << "->" << Rank::Enum_Name(i + 1);
  }
  *out << "\n";
  for (auto it = total_mats.begin(); it != total_mats.end(); ++it) {
    *out << it->first;
    for (int i = Rank::STONE_1; i < Rank::ADAMANTINE_1; ++i) {
      auto mat_it = per_rank_mats[i - 1].find(it->first);
      if (mat_it != per_rank_mats[i - 1].end()) {
        *out << "," << mat_it->second;
      } else {
        *out << ",";
      }
    }
    *out << "\n";
  }
  if (file_out != nullptr) file_out->close();
}

void Main() {
  GameConfig config;
  {
    Json::Value root;
    Json::Reader reader;

    const std::string input_file = absl::GetFlag(FLAGS_game_config);
    std::ifstream in(input_file);
    if (!reader.parse(in, root)) {
      LOG(ERROR) << "Couldn't parse json file: '" << input_file << "'.";
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
  }

  const std::string rank_up_unit = absl::GetFlag(FLAGS_rank_up_unit);
  if (!rank_up_unit.empty()) {
    EmitRankUp(config, rank_up_unit, absl::GetFlag(FLAGS_rank_up_file));
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
            CreateCharacterData(character_data_file, config);
        !status.ok()) {
      LOG(ERROR) << "Error creating character data: " << status.message();
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
