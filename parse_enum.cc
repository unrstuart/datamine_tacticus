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

UnitId::Enum ParseUnitId(const absl::string_view id) {
  static std::map<std::string, UnitId::Enum> known_units = {
      {"Abaddon", UnitId::ABADDON},
      {"Abraxas", UnitId::ABRAXAS},
      {"Actus", UnitId::ACTUS},
      {"Aesoth", UnitId::AESOTH},
      {"Aethana", UnitId::AETHANA},
      {"Ahriman", UnitId::AHRIMAN},
      {"Aleph-Null", UnitId::ALEPH_NULL},
      {"Anuphet", UnitId::ANUPHET},
      {"Angrax", UnitId::ANGRAX},
      {"Arjac", UnitId::ARJAC},
      {"Archimatos", UnitId::ARCHIMATOS},
      {"Asmodai", UnitId::ASMODAI},
      {"Atlacoya", UnitId::ATLACOYA},
      {"Aun'Shi", UnitId::AUN_SHI},
      {"Azkor", UnitId::AZKOR},
      {"Azrael", UnitId::AZRAEL},
      {"Baraqiel", UnitId::BARAQIEL},
      {"Bellator", UnitId::BELLATOR},
      {"Burchard", UnitId::BURCHARD},
      {"Calandis", UnitId::CALANDIS},
      {"Calgar", UnitId::CALGAR},
      {"Celestine", UnitId::CELESTINE},
      {"Certus", UnitId::CERTUS},
      {"Corrodius", UnitId::CORRODIUS},
      {"Creed", UnitId::CREED},
      {"Dante", UnitId::DANTE},
      {"Darkstrider", UnitId::DARKSTRIDER},
      {"Deathleaper", UnitId::DEATHLEAPER},
      {"Eldryon", UnitId::ELDRYON},
      {"Exitor-Rho", UnitId::EXITOR_RHO},
      {"Forcas", UnitId::FORCAS},
      {"Gibbascrapz", UnitId::GIBBASCRAPZ},
      {"Godswyl", UnitId::GODSWYL},
      {"Gulgortz", UnitId::GULGORTZ},
      {"Haarken", UnitId::HAARKEN},
      {"Helbrecht", UnitId::HELBRECHT},
      {"Hollan", UnitId::HOLLAN},
      {"Imospekh", UnitId::IMOSPEKH},
      {"Incisus", UnitId::INCISUS},
      {"Isaak", UnitId::ISAAK},
      {"Isabella", UnitId::ISABELLA},
      {"Jaeger", UnitId::JAEGER},
      {"Jain Zar", UnitId::JAIN_ZAR},
      {"Judh", UnitId::JUDH},
      {"Kariyan", UnitId::KARIYAN},
      {"Kharn", UnitId::KHARN},
      {"Kut", UnitId::KUT},
      {"Lucien", UnitId::LUCIEN},
      {"Lucius", UnitId::LUCIUS},
      {"Macer", UnitId::MACER},
      {"Makhotep", UnitId::MAKHOTEP},
      {"Maladus", UnitId::MALADUS},
      {"Mataneo", UnitId::MATANEO},
      {"Maugan Ra", UnitId::MAUGAN_RA},
      {"Mephiston", UnitId::MEPHISTON},
      {"Morvenn Vahl", UnitId::MORVENN_VAHL},
      {"Nauseous", UnitId::NAUSEOUS},
      {"Neurothrope", UnitId::NEUROTHROPE},
      {"Nicodemus", UnitId::NICODEMUS},
      {"Njal", UnitId::NJAL},
      {"Parasite of Mortrex", UnitId::PARASITE_OF_MORTREX},
      {"Pestillian", UnitId::PESTILLIAN},
      {"Ragnar", UnitId::RAGNAR},
      {"Re'vas", UnitId::RE_VAS},
      {"Roswitha", UnitId::ROSWITHA},
      {"Sarquael", UnitId::SARQUAEL},
      {"Shadowsun", UnitId::SHADOWSUN},
      {"Shiron", UnitId::SHIRON},
      {"Sho'syl", UnitId::SHO_SYL},
      {"Sibyll", UnitId::SIBYLL},
      {"Snappawrecka", UnitId::SNAPPAWRECKA},
      {"Snotflogga", UnitId::SNOTFLOGGA},
      {"Sy-gex", UnitId::SY_GEX},
      {"Tan Gi'da", UnitId::TAN_GI_DA},
      {"Tanksmasha", UnitId::TANKSMASHA},
      {"Tarvakh", UnitId::TARVAKH},
      {"Tertius", UnitId::TITUS},
      {"Thaumachus", UnitId::THAUMACHUS},
      {"Thaddeus", UnitId::THADDEUS},
      {"The Patermine", UnitId::THE_PATERMINE},
      {"Thoread", UnitId::THOREAD},
      {"Thutmose", UnitId::THUTMOSE},
      {"Tigurius", UnitId::TIGURIUS},
      {"Titus", UnitId::TITUS},
      {"Tjark", UnitId::TJARK},
      {"Trajann", UnitId::TRAJANN},
      {"Toth", UnitId::TOTH},
      {"Typhus", UnitId::TYPHUS},
      {"Tyrant Guard", UnitId::TYRANT_GUARD},
      {"Ulf", UnitId::ULF},
      {"Vindicta", UnitId::VINDICTA},
      {"Vitruvius", UnitId::VITRUVIUS},
      {"Volk", UnitId::VOLK},
      {"Winged Prime", UnitId::WINGED_PRIME},
      {"Wrask", UnitId::WRASK},
      {"Xybia", UnitId::XYBIA},
      {"Yarrick", UnitId::YARRICK},
      {"Yazaghor", UnitId::YAZAGHOR},
  };
  const auto it = known_units.find(std::string(id));
  if (it != known_units.end()) {
    return it->second;
  }
  std::cerr << "Unknown unit id: " << id << "\n";
  return UnitId::UNKNOWN_UNIT_ID;
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
