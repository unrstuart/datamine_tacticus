#include "parse_enum.h"

#include "miner.pb.h"

namespace dataminer {

Alliance::Enum ParseAlliance(const absl::string_view alliance) {
  if (alliance == "Imperial") {
    return Alliance::IMPERIAL;
  } else if (alliance == "Chaos") {
    return Alliance::CHAOS;
  } else if (alliance == "Xenos") {
    return Alliance::XENOS;
  }
  std::cerr << "Unknown alliance: " << alliance << "\n";
  return Alliance::UNKNOWN_ALLIANCE;
}

Faction::Enum ParseFaction(const absl::string_view faction) {
  static std::map<std::string, Faction::Enum> known_factions = {
      {"Sisterhood", Faction::ADEPTA_SORORITAS},
      {"Custodes", Faction::ADEPTUS_CUSTODES},
      {"AdeptusMechanicus", Faction::ADEPTUS_MECHANICUS},
      {"Aeldari", Faction::AELDARI},
      {"AstraMilitarum", Faction::ASTRA_MILITARUM},
      {"BlackLegion", Faction::BLACK_LEGION},
      {"BlackTemplars", Faction::BLACK_TEMPLARS},
      {"BloodAngels", Faction::BLOOD_ANGELS},
      {"DarkAngels", Faction::DARK_ANGELS},
      {"DeathGuard", Faction::DEATH_GUARD},
      {"EmperorsChildren", Faction::EMPERORS_CHILDREN},
      {"Genestealers", Faction::GENESTEALER_CULTS},
      {"Necrons", Faction::NECRONS},
      {"Orks", Faction::ORKS},
      {"SpaceWolves", Faction::SPACE_WOLVES},
      {"Tau", Faction::TAU_EMPIRE},
      {"ThousandSons", Faction::THOUSAND_SONS},
      {"Tyranids", Faction::TYRANIDS},
      {"Ultramarines", Faction::ULTRAMARINES},
      {"WorldEaters", Faction::WORLD_EATERS},
  };
  const auto it = known_factions.find(std::string(faction));
  if (it != known_factions.end()) {
    return it->second;
  }
  std::cerr << "Unknown faction: " << faction << "\n";
  return Faction::UNKNOWN_FACTION;
}

Rarity::Enum ParseRarity(const absl::string_view rarity) {
  if (rarity == "Common") {
    return Rarity::COMMON;
  } else if (rarity == "Uncommon") {
    return Rarity::UNCOMMON;
  } else if (rarity == "Rare") {
    return Rarity::RARE;
  } else if (rarity == "Epic") {
    return Rarity::EPIC;
  } else if (rarity == "Legendary") {
    return Rarity::LEGENDARY;
  } else if (rarity == "Mythic") {
    return Rarity::MYTHIC;
  }
  std::cerr << "Unknown rarity: " << rarity << "\n";
  return Rarity::UNKNOWN_RARITY;
}

}  // namespace dataminer
