#include <fstream>

#include "absl/log/log.h"
#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

// Creates the character data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateCharacterData(const absl::string_view path,
                                 const GameConfig& game_config) {
  std::ofstream out(std::string(path).c_str());

  out << "[";
  bool first = true;

  for (const Unit& unit : game_config.client_game_config().units().units()) {
    if (!first) out << ",";
    first = false;
    out << "\n";
    out << "    {\n";
    out << "        \"id\": \"" << unit.id() << "\",\n";
    out << "        \"Name\": \"" << unit.name() << "\",\n";
    out << "        \"Title\": \"" << unit.title() << "\",\n";
    out << "        \"Full Name\": \"" << unit.full_name() << "\",\n";
    out << "        \"Short Name\": \"" << unit.short_name() << "\",\n";
    out << "        \"Extra Short Name\": \"" << unit.extra_short_name()
        << "\",\n";
    out << "        \"Faction\": \"" << unit.faction_id() << "\",\n";
    out << "        \"Alliance\": \"" << unit.alliance() << "\",\n";
    out << "        \"Health\": \"" << unit.stats().health() << "\",\n";
    out << "        \"Damage\": \"" << unit.stats().damage() << "\",\n";
    out << "        \"Armor\": \"" << unit.stats().armor() << "\",\n";
    out << "        \"Initial rarity\": \"" << unit.base_rarity() << "\",\n";
    out << "        \"Melee Damage\": \"" << unit.melee_attack().damage_type()
        << "\",\n";
    out << "        \"Melee Hits\": \"" << unit.melee_attack().hits()
        << "\",\n";
    if (unit.has_ranged_attack()) {
      out << "        \"Ranged Damage\": \""
          << unit.ranged_attack().damage_type() << "\",\n";
      out << "        \"Ranged Hits\": \"" << unit.ranged_attack().hits()
          << "\",\n";
      out << "        \"Distance\": \"" << unit.ranged_attack().range()
          << "\",\n";
    }
    out << "        \"Movement\": \"" << unit.movement() << "\",\n";
    out << "        \"Equipment1\": \"" << unit.equipment_slots(0) << "\",\n";
    out << "        \"Equipment2\": \"" << unit.equipment_slots(1) << "\",\n";
    out << "        \"Equipment3\": \"" << unit.equipment_slots(2) << "\",\n";
    out << "        \"Traits\": [";
    bool first_trait = true;
    for (const absl::string_view trait : unit.traits()) {
      if (!first_trait) out << ", ";
      first_trait = false;
      out << "\"" << trait << "\"";
    }
    out << "]\n";
    // Number
    // ForcedSummons
    // RequiredInCampaign
    // Icon
    out << "    }";
  }
  out << "\n]\n";

  out.close();
  return absl::OkStatus();
}

}  // namespace dataminer
