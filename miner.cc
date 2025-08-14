#include <fstream>
#include <iostream>

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/status/statusor.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/str_join.h"
#include "absl/strings/str_split.h"
#include "create_rank_up_data.h"
#include "create_recipe_data.h"
#include "libjson/json/reader.h"
#include "libjson/json/value.h"
#include "miner.pb.h"
#include "parse_units.h"
#include "parse_upgrades.h"

ABSL_FLAG(std::string, game_config, "", "The GameConfig.json file to parse");
ABSL_FLAG(int, max_depth, 2,
          "Maximum depth to print the JSON structure. "
          "Use 0 for no limit, or a negative number for unlimited depth.");
ABSL_FLAG(int, max_members, 2,
          "The maximum number of members to print for each object/array. ");
ABSL_FLAG(std::string, debug_print_path, "",
          "The dot-separated path to the JSON fields to debug print. ");
ABSL_FLAG(std::string, rank_up_unit, "", "The unit to rank up");
ABSL_FLAG(std::string, starting_rank, "STONE_1",
          "The starting rank for the unit. 1 = stone 1, 4 = iron 1, etc.");
ABSL_FLAG(std::string, ending_rank, "ADAMANTINE_1",
          "The ending rank for the unit. 2 = stone 2, 4 = iron 1, etc.");
ABSL_FLAG(std::string, rank_up_file, "/dev/null",
          "The file to write rank up information to.");
ABSL_FLAG(std::string, recipe_data, "",
          "If not empty, writes all upgrade recipes to the specified file.");
ABSL_FLAG(std::string, rank_up_data, "",
          "If not empty, writes all rank-up recipes to the specified file.");

namespace dataminer {
namespace {

void Print(const Json::Value& value, int max_depth, int max_members,
           int current_depth = 0) {
  if (current_depth > max_depth) return;
  if (value.isBool()) {
    std::cout << (value.asBool() ? "true" : "false");
  } else if (value.isInt()) {
    std::cout << value.asInt();
  } else if (value.isUInt()) {
    std::cout << value.asUInt();
  } else if (value.isDouble()) {
    std::cout << value.asDouble();
  } else if (value.isString()) {
    std::cout << '"' << value.asString() << '"';
  } else if (value.isArray()) {
    if (current_depth + 1 > max_depth) {
      std::cout << "[...]";
      return;
    }
    std::cout << "[\n";
    int num_members = 0;
    for (const auto& item : value) {
      if (num_members++ >= max_members) break;
      std::cout << std::string(current_depth * 2 + 2, ' ');
      Print(item, max_depth, max_members, current_depth + 1);
      std::cout << "\n";
    }
    std::cout << std::string(current_depth * 2, ' ') << "]";
  } else if (value.isObject()) {
    if (current_depth + 1 > max_depth) {
      std::cout << "{...}";
      return;
    }
    std::cout << "{\n";
    int num_members = 0;
    for (const auto& key : value.getMemberNames()) {
      if (num_members++ >= max_members) break;
      std::cout << std::string(current_depth * 2 + 2, ' ') << '"' << key
                << "\": ";
      Print(value[key], max_depth, max_members, current_depth + 1);
      std::cout << "\n";
    }
    std::cout << std::string(current_depth * 2, ' ') << "}\n";
  }
}

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

void ParsePath(const absl::string_view path, std::string& path_comp,
               std::optional<int>& index) {
  path_comp = std::string(path);
  auto ind = path.find('[');
  if (ind != absl::string_view::npos) {
    path_comp = std::string(path.substr(0, ind));
    auto ind_str = path.substr(ind + 1);
    int ind_ret;
    if (!absl::SimpleAtoi(ind_str.substr(0, ind_str.size() - 1), &ind_ret)) {
      std::cerr << "Invalid index in path: " << path << "\n";
      index = std::nullopt;
      return;
    }
    index = ind_ret;
  }
}

void ExpandMats(
    const std::map<std::string, const Upgrades::Upgrade*>& upgrades_map,
    std::map<std::string, int>& total_mats,
    const absl::string_view upgrade_material) {
  const auto it = upgrades_map.find(std::string(upgrade_material));
  if (it == upgrades_map.end()) {
    std::cerr << "Material '" << upgrade_material
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
                const Rank::Enum starting_rank, const Rank::Enum ending_rank,
                const absl::string_view output_path) {
  const Unit* unit = nullptr;
  for (const auto& u : config.client_game_config().units().units()) {
    if (u.name() == name) {
      unit = &u;
      break;
    }
  }
  if (!unit) {
    std::cerr << "Unit '" << unit << "' not found in GameConfig.\n";
    return;
  }
  const std::map<std::string, const Upgrades::Upgrade*> upgrades_map =
      BuildUpgradesMap(config);
  if (starting_rank < 1 || ending_rank < 1 || starting_rank > ending_rank ||
      ending_rank > unit->rank_up_requirements_size()) {
    std::cerr << "Invalid rank range: " << starting_rank << " to "
              << ending_rank << ".\n";
    return;
  }
  std::map<std::string, int> total_mats;
  std::map<int, std::map<std::string, int>> per_rank_mats;
  for (int i = starting_rank - 1; i < ending_rank - 1; ++i) {
    if (i >= unit->rank_up_requirements_size()) {
      std::cerr << "No rank up requirements for rank " << i + 1 << ".\n";
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
  std::ofstream out(std::string(output_path).c_str());
  out << "material";
  for (int i = starting_rank; i < ending_rank; ++i) {
    out << "," << Rank::Enum_Name(i) << "->" << Rank::Enum_Name(i + 1);
  }
  out << "\n";
  for (auto it = total_mats.begin(); it != total_mats.end(); ++it) {
    out << it->first;
    for (int i = starting_rank; i < ending_rank; ++i) {
      auto mat_it = per_rank_mats[i - 1].find(it->first);
      if (mat_it != per_rank_mats[i - 1].end()) {
        out << "," << mat_it->second;
      } else {
        out << ",";
      }
    }
    out << "\n";
  }
  out.close();
}

void Main() {
  Json::Value root;
  Json::Reader reader;

  const std::string input_file = absl::GetFlag(FLAGS_game_config);
  std::ifstream in(input_file);
  if (!reader.parse(in, root)) {
    std::cerr << "Couldn't parse json file: '" << input_file << "'.";
  }
  if (!root.isObject()) {
    std::cerr << "Parsed JSON is not an object.";
    return;
  }
  auto config = ParseGameConfig(root);
  if (!config.ok()) {
    std::cerr << "Error parsing GameConfig: " << config.status().message();
    return;
  }
  // std::cout << "\nParsed GameConfig:\n";
  // std::cout << "\n" << config->DebugString() << "\n";
  Json::Value value = root;
  for (const absl::string_view path :
       absl::StrSplit(absl::GetFlag(FLAGS_debug_print_path), ".")) {
    std::string path_comp;
    std::optional<int> index;
    ParsePath(path, path_comp, index);
    value = value[path_comp];
    if (index.has_value()) {
      value = value[*index];
    }
  }

  Print(value, absl::GetFlag(FLAGS_max_depth),
        absl::GetFlag(FLAGS_max_members));
  std::cout << "\n";

  const std::string rank_up_unit = absl::GetFlag(FLAGS_rank_up_unit);
  if (!rank_up_unit.empty()) {
    Rank::Enum starting_rank;
    if (!Rank::Enum_Parse(absl::GetFlag(FLAGS_starting_rank), &starting_rank)) {
      std::cerr << "Invalid starting rank: "
                << absl::GetFlag(FLAGS_starting_rank) << "\n";
      return;
    }
    Rank::Enum ending_rank;
    if (!Rank::Enum_Parse(absl::GetFlag(FLAGS_ending_rank), &ending_rank)) {
      std::cerr << "Invalid ending rank: " << absl::GetFlag(FLAGS_ending_rank)
                << "\n";
      return;
    }
    if (starting_rank >= ending_rank) {
      std::cerr << "Starting rank must be less than ending rank.\n";
      return;
    }
    EmitRankUp(*config, rank_up_unit, starting_rank, ending_rank,
               absl::GetFlag(FLAGS_rank_up_file));
  }

  const std::string recipe_data_file = absl::GetFlag(FLAGS_recipe_data);
  if (!recipe_data_file.empty()) {
    if (const absl::Status status = CreateRecipeData(recipe_data_file, *config);
        !status.ok()) {
      std::cerr << "Error adjusting recipe data: " << status.message() << "\n";
    }
  }

  const std::string rank_up_data_file = absl::GetFlag(FLAGS_rank_up_data);
  if (!rank_up_data_file.empty()) {
    if (const absl::Status status =
            CreateRankUpData(rank_up_data_file, *config);
        !status.ok()) {
      std::cerr << "Error creating rank up data: " << status.message() << "\n";
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
