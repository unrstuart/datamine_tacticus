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

namespace {

std::string GetIconPath(const absl::string_view id,
                        const GameConfig& game_config) {
  constexpr absl::string_view img_prefix = "ui_image_portrait_";
  constexpr absl::string_view img_suffix = ".png";
  std::string img = "";
  for (const Avatars::Avatar& avatar :
       game_config.client_game_config().avatars().avatars()) {
    if (avatar.unit_id() == id) {
      img = avatar.id();
      break;
    }
  }

  img = absl::StrCat(img_prefix, img, img_suffix);
  const std::string full_path = absl::StrCat("assets/characters/", img);
  struct stat sbuf;
  const int res = stat(full_path.c_str(), &sbuf);
  if (res != 0) {
    LOG(ERROR) << "Couldn't find avatar icon for {\"" << id << "\", \"\"}";
  }

  return absl::StrCat("snowprint_assets/characters/", img);
}

// TODO: refactor this with GetIconPath and GetCharacterNumber.
std::string GetRoundIconPath(const absl::string_view id,
                             const GameConfig& game_config) {
  constexpr absl::string_view img_prefix = "ui_image_RoundPortrait_";
  constexpr absl::string_view img_suffix = ".png";
  std::string img = "";
  for (const Avatars::Avatar& avatar :
       game_config.client_game_config().avatars().avatars()) {
    if (avatar.unit_id() == id) {
      img = avatar.id();
      break;
    }
  }

  img = absl::StrCat(img_prefix, img, img_suffix);
  const std::string full_path = absl::StrCat("assets/characters/", img);
  struct stat sbuf;
  const int res = stat(full_path.c_str(), &sbuf);
  if (res != 0) {
    LOG(ERROR) << "Couldn't find avatar icon for {\"" << id << "\", \"\"}";
  }

  return absl::StrCat("snowprint_assets/characters/", img);
}

void EmitAbility(std::ostream& out, const MachineOfWar::Ability& ability,
                 const std::string& label) {
  if (ability.name().empty()) return;

  out << "        \"" << label << "\": {\n";
  out << "            \"Name\": \"" << ability.name() << "\",\n";
  out << "            \"Recipes\": [";
  bool first = true;
  for (const MachineOfWar::Ability::UpgradeRecipe& recipe :
       ability.upgrade_recipes()) {
    if (!first) out << ",";
    first = false;
    out << "\n";
    out << "                [\"" << recipe.mat1() << "\", \"" << recipe.mat2()
        << "\", \"" << recipe.mat3() << "\"]";
  }
  out << "\n            ]\n";
  out << "        },\n";
}

}  // namespace

absl::Status CreateMowData(const absl::string_view path,
                           const GameConfig& game_config) {
  std::ofstream out(std::string(path).c_str());

  out << "[";
  bool first = true;

  for (const MachineOfWar& mow :
       game_config.client_game_config().units().mows()) {
    if (!first) out << ",";
    first = false;
    out << "\n";
    out << "    {\n";
    out << "        \"snowprintId\": \"" << mow.id() << "\",\n";
    out << "        \"Name\": \"" << mow.name() << "\",\n";
    out << "        \"Faction\": \"" << mow.faction_id() << "\",\n";
    out << "        \"Alliance\": \"" << mow.alliance() << "\",\n";
    EmitAbility(out, mow.active_ability(), "ActiveAbility");
    EmitAbility(out, mow.passive_ability(), "PassiveAbility");
    out << "        \"Icon\": \"" << GetIconPath(mow.id(), game_config)
        << "\",\n";
    out << "        \"RoundIcon\": \""
        << GetRoundIconPath(mow.id(), game_config) << "\"\n";
    out << "    }";
  }
  out << "\n]\n";

  // out.close();
  return absl::OkStatus();
}

}  // namespace dataminer
