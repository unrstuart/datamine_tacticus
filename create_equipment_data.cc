#ifndef __CREATE_EQUIPMENT_DATA_H__
#define __CREATE_EQUIPMENT_DATA_H__

#include <fstream>
#include <functional>

#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

template <typename LevelsContainer>
void EmitLevels(std::ostream& out, const LevelsContainer& array) {
  struct Prop {
    absl::string_view name;
    std::function<bool(const Item::Stats&)> has_fn;
    std::function<int(const Item::Stats&)> get_fn;
  };
  const Prop props[] = {
      {"blockChance", std::mem_fn(&Item::Stats::has_block_chance),
       std::mem_fn(&Item::Stats::block_chance)},
      {"blockDamage", std::mem_fn(&Item::Stats::has_block_damage),
       std::mem_fn(&Item::Stats::block_damage)},
      {"blockChanceBonus", std::mem_fn(&Item::Stats::has_block_chance_bonus),
       std::mem_fn(&Item::Stats::block_chance_bonus)},
      {"blockDamageBonus", std::mem_fn(&Item::Stats::has_block_damage_bonus),
       std::mem_fn(&Item::Stats::block_damage_bonus)},
      {"critChance", std::mem_fn(&Item::Stats::has_crit_chance),
       std::mem_fn(&Item::Stats::crit_chance)},
      {"critDamage", std::mem_fn(&Item::Stats::has_crit_damage),
       std::mem_fn(&Item::Stats::crit_damage)},
      {"critChanceBonus", std::mem_fn(&Item::Stats::has_crit_chance_bonus),
       std::mem_fn(&Item::Stats::crit_chance_bonus)},
      {"critDamageBonus", std::mem_fn(&Item::Stats::has_crit_damage_bonus),
       std::mem_fn(&Item::Stats::crit_damage_bonus)},
      {"armor", std::mem_fn(&Item::Stats::has_fixed_armor),
       std::mem_fn(&Item::Stats::fixed_armor)},
      {"hp", std::mem_fn(&Item::Stats::has_hp), std::mem_fn(&Item::Stats::hp)},
  };
  bool first = true;
  for (const Item::Level level : array) {
    if (!first) out << ",";
    first = false;
    out << "\n";
    out << "            {\n";
    out << "                \"goldCost\": " << level.gold_cost() << ",\n";
    out << "                \"salvageCost\": " << level.salvage_cost() << ",\n";
    out << "                \"mythicSalvageCost\": "
        << level.mythic_salvage_cost() << ",\n";
    out << "                \"stats\": {";
    bool first2 = true;
    for (const Prop& prop : props) {
      if (prop.has_fn(level.stats())) {
        if (!first2) out << ",";
        first2 = false;
        out << "\n";
        out << "                    \"" << prop.name << "\": ";
        out << prop.get_fn(level.stats());
      }
    }
    out << "\n";
    out << "                }\n";
    out << "            }";
  }
}

template <typename Array>
void EmitArray(std::ostream& out, const Array& array) {
  bool first = true;
  for (const absl::string_view s : array) {
    if (!first) out << ",";
    first = false;
    out << "\n";
    out << "            \"" << s << "\"";
  }
}

void EmitItem(std::ostream& out, const Item& item) {
  out << "    \"" << item.id() << "\": {\n";
  out << "        \"name\": \"" << item.name() << "\",\n";
  out << "        \"rarity\": \"" << item.rarity() << "\",\n";
  out << "        \"type\": \"" << item.equipment_type() << "\",\n";
  out << "        \"abilityId\": \"" << item.ability_id() << "\",\n";
  out << "        \"isRelic\": " << (item.is_relic() ? "true" : "false")
      << ",\n";
  out << "        \"isUniqueRelic\": "
      << (item.is_unique_relic() ? "true" : "false") << ",\n";
  out << "        \"allowedUnits\": [";
  EmitArray(out, item.allowed_units());
  out << "\n";
  out << "        ],\n";
  out << "        \"allowedFactions\": [";
  EmitArray(out, item.allowed_factions());
  out << "\n";
  out << "        ],\n";
  out << "        \"levels\": [";
  EmitLevels(out, item.levels());
  out << "\n";
  out << "        ]\n";
  out << "    }";
}

// Creates the Equipment data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateEquipmentData(const absl::string_view path,
                                 const GameConfig& game_config) {
  std::ofstream out(std::string(path).c_str());

  out << "{";
  bool first = true;
  for (const Item& item : game_config.client_game_config().items().items()) {
    if (!first) out << ",";
    first = false;
    out << "\n";
    EmitItem(out, item);
  }
  out << "\n}\n";

  out.close();
  return absl::OkStatus();
}

}  // namespace dataminer

#endif  // __CREATE_EQUIPMENT_DATA_H__
