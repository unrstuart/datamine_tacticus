#include <fstream>

#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "create_rank_up_data.h"
#include "miner.pb.h"

namespace dataminer {

// Creates the character data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateCharacterData(const absl::string_view path,
                                 const GameConfig& game_config) {
  std::cout << "writing character data to " << path << "\n";

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
    out << "        \"Title\": \"" << unit.name() << "\",\n";
    out << "        \"Full Name\": \"" << GetFullName(unit.id()) << "\",\n";
    out << "        \"Short Name\": \"" << GetShortName(unit.id()) << "\",\n";
    out << "        \"Faction\": \"" << FactionToString(unit.faction_id()) << "\",\n";
    out << "        \"Alliance\": \"" << AllianceToString(unit.alliance()) << "\",\n";
    out << "        \"Health\": \"" << unit.stats().health() << "\",\n";
    out << "        \"Damage\": \"" << unit.stats().damage() << "\",\n";
    out << "        \"Armor\": \"" << unit.stats().armor() << "\",\n";
    out << "        \"Initial rarity\": \"" << RarityToString(unit.base_rarity()) << "\",\n";
    out << "        \"Melee Damage\": \"" << unit.melee_attack().damage_type() << "\",\n";
    out << "        \"Melee Hits\": \"" << unit.melee_attack().hits() << "\",\n";
    if (unit.has_ranged_attack()) {
      out << "        \"Ranged Damage\": \"" << unit.ranged_attack().damage_type() << "\",\n";
      out << "        \"Ranged Hits\": \"" << unit.ranged_attack().hits() << "\",\n";
      out << "        \"Distance\": \"" << unit.ranged_attack().distance() << "\",\n";
    }
    out << "        \"Movement\": \"" << unit.movement() << "\",\n";
    out << "        \"Equipment1\": \"" << unit.equipment_slots(0).name() << "\",\n";
    out << "        \"Equipment2\": \"" << unit.equipment_slots(1).name() << "\",\n";
    out << "        \"Equipment3\": \"" << unit.equipment_slots(2).name() << "\",\n";
    out << "    }";
  }
  out << "\n]\n";

  out.close();
  return absl::OkStatus();
}

}  // namespace dataminer
