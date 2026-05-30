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

void EmitAbilityDamageTypes(
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

void EmitAbilities(
    std::ofstream& out, const GameConfig& game_config,
    const google::protobuf::RepeatedPtrField<std::string>& abilities,
    const absl::string_view label) {
  std::set<absl::string_view> ability_ids;
  for (const absl::string_view name : abilities) {
    const Units::Ability* ability = FindAbility(game_config, name);
    if (ability == nullptr) {
      LOG(ERROR) << "couldn't find ability \"" << name << "\"";
      continue;
    }
    ability_ids.insert(ability->id());
  }
  if (!ability_ids.empty()) {
    out << ",\n";
    out << "        \"" << label << "\": [";
    bool first = true;
    for (const absl::string_view ability_id : ability_ids) {
      if (!first) out << ", ";
      first = false;
      out << "\"" << ability_id << "\"";
    }
    out << "]";
  }
}

// The format of the icon path appears to be
// ui_image_portrait_<faction>_<lowername>_01.png. The _01 is because some units
// appear multiple times with different color schemes (tyranids and TSons
// horrors), but we can take the first one for our purpose.
std::string GetIconPath(const absl::string_view assets_dir,
                        const absl::string_view id,
                        const GameConfig& game_config,
                        const std::map<std::string, std::string>& visuals) {
  const std::map<std::string, std::string> kOverrides = {
      {"deathNpc3Nurglings", "death_nurgling_01"},
      {"necroSmnSwarm", "necro_scarab_01"},
      {"orksRukkatrukk", "orkss_rukkatruk_01"},
      {"GuildBoss2Npc2TyranRipperSwarmKronos", "tyran_ripper_01"},
      {"GuildBoss2Npc3TyranRipperSwarmGorgon", "tyran_ripper_01"},
      {"GuildBoss2Npc3TyranRipperSwarmGorgon", "tyran_ripper_01"},
      {"ultraNpc3Intercessor", "ultra_inceptor_02"},
  };
  const std::string img_prefix = "ui_image_portrait_";
  const std::string img_suffix = ".png";

  auto it = kOverrides.find(std::string(id));
  if (it == kOverrides.end()) {
    it = visuals.find(std::string(id));
    if (it == visuals.end()) {
      LOG(ERROR) << "Couldn't find sprite for \"" << id << "\"";
      return "";
    }
  }

  const std::string img = absl::StrCat(img_prefix, it->second, img_suffix);
  const std::string full_path = absl::StrCat(assets_dir, "/sprites/", img);
  struct stat sbuf;
  const int res = stat(full_path.c_str(), &sbuf);
  if (res != 0) {
    LOG(ERROR) << "Couldn't find sprite for {\"" << id << "\"} at { '"
               << full_path << "' }";
  }

  return absl::StrCat("snowprint_assets/characters/", img);
}

void EmitStats(std::ofstream& out,
               const google::protobuf::RepeatedPtrField<Npc::Stats>& stats) {
  out << ",\n";
  out << "        \"Stats\": [\n";
  bool first = true;
  for (const Npc::Stats& stat : stats) {
    if (!first) {
      out << ",\n";
    }
    first = false;
    out << "          {\n";
    out << "            \"AbilityLevel\": " << stat.ability_level() << ",\n";
    out << "            \"Damage\": " << stat.damage() << ",\n";
    out << "            \"Armor\": " << stat.armor() << ",\n";
    out << "            \"Health\": " << stat.health() << ",\n";
    out << "            \"ProgressionIndex\": " << stat.progression_index()
        << ",\n";
    out << "            \"Rank\": " << stat.rank() << ",\n";
    out << "            \"Stars\": " << stat.stars() << "\n";
    out << "          }";
  }
  out << "\n        ]";
}

}  // namespace

// Creates the character data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateNpcData(const absl::string_view assets_dir,
                           const absl::string_view path,
                           const GameConfig& game_config,
                           const std::map<std::string, std::string>& visuals) {
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
    out << "        \"Melee Damage\": \"" << npc.melee_attack().damage_type()
        << "\",\n";
    out << "        \"Melee Hits\": " << npc.melee_attack().hits() << ",\n";
    if (npc.has_ranged_attack()) {
      out << "        \"Ranged Damage\": \""
          << npc.ranged_attack().damage_type() << "\",\n";
      out << "        \"Ranged Hits\": " << npc.ranged_attack().hits() << ",\n";
      out << "        \"Distance\": " << npc.ranged_attack().range() << ",\n";
    }
    out << "        \"Movement\": " << npc.movement() << ",\n";
    out << "        \"Traits\": [";
    bool first_trait = true;
    for (const absl::string_view trait : npc.traits()) {
      if (!first_trait) out << ", ";
      first_trait = false;
      out << "\"" << trait << "\"";
    }
    out << "]";
    EmitStats(out, npc.stats());
    EmitAbilityDamageTypes(out, game_config, npc.active_abilities(),
                           "Active Ability Damage");
    EmitAbilityDamageTypes(out, game_config, npc.passive_abilities(),
                           "Passive Ability Damage");
    EmitAbilities(out, game_config, npc.active_abilities(), "Active Abilities");
    EmitAbilities(out, game_config, npc.passive_abilities(),
                  "Passive Abilities");
    out << ",\n";
    out << "        \"Icon\": \""
        << GetIconPath(assets_dir, npc.visual_id(), game_config, visuals)
        << "\"\n";
    out << "    }";
  }
  out << "\n]\n";

  out.close();
  return absl::OkStatus();
}

}  // namespace dataminer
