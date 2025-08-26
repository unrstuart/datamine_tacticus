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

const Units::Ability* FindAbility(const GameConfig& game_config,
                                  const absl::string_view name) {
  for (const Units::Ability& ability :
       game_config.client_game_config().units().abilities()) {
    if (ability.id() == name) {
      return &ability;
    }
  }
  return nullptr;
}

void EmitAbility(
    std::ofstream& out, const GameConfig& game_config,
    const google::protobuf::RepeatedPtrField<std::string>& abilities,
    const absl::string_view label) {
  std::set<absl::string_view> damage_types;
  for (const absl::string_view name : abilities) {
    const Units::Ability* ability = FindAbility(game_config, name);
    if (ability == nullptr) continue;
    for (const absl::string_view damage_type : ability->damage_types()) {
      if (!damage_type.empty()) {
        damage_types.insert(damage_type);
      }
    }
  }
  if (!damage_types.empty()) {
    out << ",\n";
    out << "        \"" << label << "\": [";
    bool first = true;
    for (const absl::string_view damage_type : damage_types) {
      if (!first) out << ", ";
      first = false;
      out << "\"" << damage_type << "\"";
    }
    out << "]";
  }
}

// The format of the icon path appears to be
// ui_image_portrait_<faction>_<lowername>_01.png. The _01 is because some units
// appear multiple times with different color schemes (tyranids and TSons
// horrors), but we can take the first one for our purpose.
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
  const std::map<std::string, std::string> kOverrides = {
      {"spaceStormcaller",
       R"(snowprint_assets/characters/ui_image_RoundPortrait_space_stormcaller_01.png)"},
  };
  if (const auto it = kOverrides.find(std::string(id));
      it != kOverrides.end()) {
    return it->second;
  }
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

}  // namespace

// Creates the character data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateNpcData(const absl::string_view path,
                           const GameConfig& game_config) {
  std::ofstream out(std::string(path).c_str());

  out << "[";
  bool first = true;

  for (const Npc& npc : game_config.client_game_config().units().npcs()) {
    if (!first) out << ",";
    first = false;
    out << "\n";
    out << "    {\n";
    out << "        \"id\": \"" << npc.id() << "\",\n";
    out << "        \"Name\": \"" << npc.name() << "\",\n";
    out << "        \"Faction\": \"" << npc.faction_id() << "\",\n";
    out << "        \"Alliance\": \"" << npc.alliance() << "\",\n";
    out << "        \"Melee Damage\": \"" << unit.melee_attack().damage_type()
        << "\",\n";
    out << "        \"Melee Hits\": " << unit.melee_attack().hits() << ",\n";
    if (unit.has_ranged_attack()) {
      out << "        \"Ranged Damage\": \""
          << unit.ranged_attack().damage_type() << "\",\n";
      out << "        \"Ranged Hits\": " << unit.ranged_attack().hits()
          << ",\n";
      out << "        \"Distance\": " << unit.ranged_attack().range() << ",\n";
    }
    out << "        \"Movement\": " << unit.movement() << ",\n";
    out << "        \"Traits\": [";
    bool first_trait = true;
    for (const absl::string_view trait : unit.traits()) {
      if (!first_trait) out << ", ";
      first_trait = false;
      out << "\"" << trait << "\"";
    }
    out << "]";
    EmitAbility(out, game_config, unit.active_abilities(), "Active Ability");
    EmitAbility(out, game_config, unit.passive_abilities(), "Passive Ability");
    out << ",\n";
    out << "        \"Icon\": \"" << GetIconPath(unit.id(), game_config)
        << "\",\n";
    out << "        \"RoundIcon\": \""
        << GetRoundIconPath(unit.id(), game_config) << "\"\n";
    out << "    }";
  }
  out << "\n]\n";

  out.close();
  return absl::OkStatus();
}

}  // namespace dataminer
