#include "create_recipe_data.h"

#include <fstream>
#include <iostream>
#include <map>

#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

namespace {

std::string ConvertStat(const absl::string_view stat_type) {
  if (stat_type == "fixedArmor") return "Armour";
  if (stat_type == "dmg") return "Damage";
  if (stat_type == "hp") return "Health";
  std::cerr << "Unknown stat type: " << stat_type << "\n";
  return "unknown";
}

}  // namespace

// Creates the recipe data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateRecipeData(const absl::string_view path,
                              const GameConfig& game_config) {
  std::ofstream out(std::string(path).c_str());

  out << "{";
  bool first = true;
  for (const Upgrades::Upgrade& recipe :
       game_config.client_game_config().upgrades().upgrades()) {
    if (!first) out << ",";
    out << "\n";
    first = false;
    out << "    \"" << recipe.id() << "\": {\n";
    out << "        \"material\": \"" << recipe.name() << "\",\n";
    out << "        \"snowprintId\": \"" << recipe.id() << "\",\n";
    out << "        \"rarity\": \"" << recipe.rarity() << "\",\n";
    out << "        \"stat\": \"" << ConvertStat(recipe.stat_type()) << "\",\n";
    out << "        \"icon\": \"snowprint_assets/upgrade_materials/"
        << recipe.id() << ".png\",\n";
    out << "        \"craftable\": "
        << (recipe.has_recipe() ? "true" : "false");
    if (recipe.has_recipe()) {
      out << ",\n";
      out << "        \"recipe\": [";
      bool first_ingredient = true;
      for (const auto& ingredient : recipe.recipe().ingredients()) {
        if (!first_ingredient) out << ",";
        first_ingredient = false;
        out << "\n";
        out << "            {\n";
        out << "                \"material\": \"" << ingredient.id() << "\",\n";
        out << "                \"count\": " << ingredient.amount() << "\n";
        out << "            }";
      }
      out << "\n        ]";
    }
    out << "\n    }";
  }
  out << "\n}\n";

  out.close();
  return absl::OkStatus();
}

}  // namespace dataminer
