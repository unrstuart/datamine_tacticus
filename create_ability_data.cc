#include <sys/stat.h>

#include <cstdio>
#include <fstream>

#include "absl/log/log.h"
#include "absl/status/status.h"
#include "absl/strings/ascii.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

constexpr absl::string_view kIconInterface = R"(interface IconData {
    file: string;
    name: string;
})";

constexpr absl::string_view kRecordStart =
    R"(export const abilityIcons: Record<string, IconData> = {)";

constexpr absl::string_view kRecordEnd = R"(};)";

std::map<absl::string_view, std::string> GetAbilityIconMap(
    const GameConfig& game_config) {
  std::map<absl::string_view, std::string> visuals;
  for (const Unit& unit : game_config.client_game_config().units().units()) {
    for (const absl::string_view ability : unit.active_abilities()) {
      visuals[ability] = "";
    }
    for (const absl::string_view ability : unit.passive_abilities()) {
      visuals[ability] = "";
    }
  }
  for (const Npc& unit : game_config.client_game_config().units().npcs()) {
    for (const absl::string_view ability : unit.active_abilities()) {
      visuals[ability] = "";
    }
    for (const absl::string_view ability : unit.passive_abilities()) {
      visuals[ability] = "";
    }
  }

  for (const auto& visual : visuals) {
    constexpr absl::string_view kPathPrefix =
        "extracted_assets/sprites/ui_icon_ability2_";
    constexpr absl::string_view kPathSuffix = ".png";
    const std::string path =
        absl::StrCat(kPathPrefix, visual.first, kPathSuffix);
    struct stat sbuf;
    const int res = stat(path.c_str(), &sbuf);
    if (res == 0) {
      visuals[visual.first] = path;
    } else {
      LOG(WARNING) << "No icon found for ability " << visual.first;
    }
  }
  return visuals;
}

absl::Status CreateAbilityData(
    const absl::string_view path,
    const std::map<std::string, std::string> ability_names,
    const GameConfig& game_config) {
  std::ofstream out(std::string(path).c_str());

  bool first = true;

  std::map<absl::string_view, std::string> icon_files =
      GetAbilityIconMap(game_config);

  out << "/* eslint-disable import-x/no-internal-modules */" << std::endl;
  for (const auto& icons : icon_files) {
    if (icons.second.empty()) continue;
    out << "import " << icons.first
        << "Icon from "
           "'@/assets/images/snowprint_assets/abilities/ui_icon_ability2_"
        << icons.first << ".png';\n";
  }
  out << "\n" << kIconInterface << "\n";
  out << "\n" << kRecordStart << "\n";
  for (const auto& icons : icon_files) {
    if (icons.second.empty()) {
      LOG(WARNING) << "No icon file found for ability " << icons.first
                   << ", skipping.";
      continue;
    }
    if (ability_names.find(std::string(icons.first)) == ability_names.end()) {
      LOG(WARNING) << "No ability name found for ability " << icons.first
                   << ", skipping.";
      continue;
    }
    if (!first) {
      out << ",\n";
    }
    out << "  " << icons.first << ": { file: " << icons.first
        << "Icon, name: \"" << ability_names.at(std::string(icons.first))
        << "\" }";
    first = false;
  }
  out << "\n" << kRecordEnd << "\n";
  out.close();
  return absl::OkStatus();
}

}  // namespace dataminer
