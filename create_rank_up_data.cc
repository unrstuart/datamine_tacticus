#include "create_rank_up_data.h"

#include <fstream>

#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

namespace {

constexpr absl::string_view kRanks[] = {
    "Stone I",      "Stone II",      "Stone III",       //
    "Iron I",       "Iron II",       "Iron III",        //
    "Bronze I",     "Bronze II",     "Bronze III",      //
    "Silver I",     "Silver II",     "Silver III",      //
    "Gold I",       "Gold II",       "Gold III",        //
    "Diamond I",    "Diamond II",    "Diamond III",     //
    "Adamantine I", "Adamantine II", "Adamantine III",  //
};

}

// Creates the rank-up data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateRankUpData(const absl::string_view path,
                              const GameConfig& game_config) {
  std::cout << "writing rank-up data to " << path << "\n";

  std::ofstream out(std::string(path).c_str());

  out << "{";
  bool first = true;
  for (const Unit& unit : game_config.client_game_config().units().units()) {
    if (!first) out << ",";
    first = false;
    out << "\n";
    out << "    \"" << unit.id() << "\": {\n";
    for (int i = 0; i < unit.rank_up_requirements_size(); ++i) {
      const Unit::RankUpRequirements& req = unit.rank_up_requirements(i);
      out << "        \"" << kRanks[i] << "\": [\n";
      out << "            \"" << req.top_row_health() << "\",\n";
      out << "            \"" << req.bottom_row_health() << "\",\n";
      out << "            \"" << req.top_row_damage() << "\",\n";
      out << "            \"" << req.bottom_row_damage() << "\",\n";
      out << "            \"" << req.top_row_armor() << "\",\n";
      out << "            \"" << req.bottom_row_armor() << "\"\n";
      out << "        ]";
      if (i < unit.rank_up_requirements_size() - 1) out << ",";
      out << "\n";
    }
    out << "\n    }";
  }
  out << "\n}\n";

  out.close();
  return absl::OkStatus();
}

}  // namespace dataminer
