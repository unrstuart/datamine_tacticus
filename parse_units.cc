#include "parse_units.h"

#include "absl/status/statusor.h"
#include "absl/strings/ascii.h"
#include "absl/strings/str_replace.h"
#include "libjson/json/value.h"
#include "miner.pb.h"
#include "parse_enum.h"

namespace dataminer {

namespace {

bool IsMachineOfWar(const absl::string_view id) {
  return id == "adeptExorcist" || id == "astraOrdnanceBattery" ||
         id == "blackForgefiend" || id == "deathCrawler" ||
         id == "tauBroadside" || id == "tyranBiovore" ||
         id == "ultraDreadnought";
}

absl::StatusOr<std::vector<Unit::RankUpRequirements>> ParseRankUpRequirements(
    absl::string_view id, const Json::Value& root) {
  std::vector<Unit::RankUpRequirements> requirements;

  if (!root.isArray()) {
    return absl::InvalidArgumentError(absl::StrCat(
        "RankUpRequirements for unit '", id, "' is not an array."));
  }
  for (const Json::Value& rank_up : root) {
    if (!rank_up.isArray()) {
      return absl::InvalidArgumentError(absl::StrCat(
          "RankUpRequirements entry for unit '", id, "' is not an array."));
    }
    if (rank_up.size() != 6) {
      return absl::InvalidArgumentError(
          absl::StrCat("RankUpRequirements entry for unit '", id,
                       "' does not have exactly 6 elements."));
    }
    for (int i = 0; i < 6; ++i) {
      if (!rank_up[i].isString()) {
        return absl::InvalidArgumentError(
            absl::StrCat("RankUpRequirements entry for unit '", id,
                         "' element ", i, " is not a string."));
      }
    }
    Unit::RankUpRequirements requirement;
    requirement.set_top_row_health(rank_up[0].asString());
    requirement.set_top_row_armor(rank_up[2].asString());
    requirement.set_top_row_damage(rank_up[4].asString());
    requirement.set_bottom_row_health(rank_up[1].asString());
    requirement.set_bottom_row_armor(rank_up[3].asString());
    requirement.set_bottom_row_damage(rank_up[5].asString());
    requirements.push_back(std::move(requirement));
  }

  return requirements;
}

absl::StatusOr<Unit> ParseUnit(const absl::string_view id,
                               const Json::Value& root) {
  Unit unit;

  const auto fields = {"BaseRarity", "FactionId",       "GrandAllianceId",
                       "Movement",   "activeAbilities", "itemSlots",
                       "name",       "stats",           "traits",
                       "upgrades",   "weapons"};
  for (const auto& field : fields) {
    if (!root.isMember(field)) {
      return absl::InvalidArgumentError(
          absl::StrCat("Missing '", field, "' for unit: ", id));
    }
  }

  unit.set_base_rarity(ParseRarity(root["BaseRarity"].asString()));
  unit.set_faction_id(ParseFaction(root["FactionId"].asString()));
  unit.set_alliance(ParseAlliance(root["GrandAllianceId"].asString()));
  unit.set_movement(root["Movement"].asInt());
  for (const Json::Value& ability : root["activeAbilities"]) {
    if (!ability.isString()) {
      return absl::InvalidArgumentError(
          absl::StrCat("Active ability is not a string for unit: ", id));
    }
    unit.add_active_abilities(ability.asString());
  }
  for (const Json::Value& slot : root["itemSlots"]) {
    if (!slot.isString()) {
      return absl::InvalidArgumentError(
          absl::StrCat("Item slot is not a string for unit: ", id));
    }
    // unit.add_item_slots(slot.asString());
  }
  unit.set_name(root["name"].asString());
  unit.set_id(ParseUnitId(unit.name()));

  auto format_unit_id = [](absl::string_view name) {
    return absl::AsciiStrToUpper(
        absl::StrReplaceAll(name, {{" ", "_"}, {"-", "_"}, {"'", "_"}}));
  };
  if (unit.id() == UnitId::UNKNOWN_UNIT_ID) {
    std::cerr << "{UnitId::" << format_unit_id(unit.name()) << ", \""
              << unit.name() << "\" },\n";
  }
  auto upgrades = ParseRankUpRequirements(id, root["upgrades"]);
  if (!upgrades.ok()) {
    return absl::InvalidArgumentError(
        absl::StrCat("Failed to parse rank up requirements for unit '", id,
                     "': ", upgrades.status().message()));
  }
  for (const auto& upgrade : *upgrades) {
    *unit.add_rank_up_requirements() = upgrade;
  }

  return unit;
}

}  // namespace

absl::StatusOr<Units> ParseUnits(const Json::Value& root) {
  if (!root.isObject()) {
    return absl::InvalidArgumentError("Parsed JSON is not an object.");
  }
  if (!root.isMember("lineup")) {
    return absl::InvalidArgumentError("Missing 'lineup' in JSON.");
  }
  if (!root.isMember("damageProfileModifiers")) {
    return absl::InvalidArgumentError(
        "Missing 'damageProfileModifiers' in JSON.");
  }
  if (!root.isMember("xpLevels")) {
    return absl::InvalidArgumentError("Missing 'xpLevels' in JSON.");
  }

  Units units;

  Json::Value lineup = root.get("lineup", {});
  if (!lineup.isObject()) {
    return absl::InvalidArgumentError("'lineup' is not an object.");
  }
  for (const absl::string_view id : lineup.getMemberNames()) {
    Json::Value value = lineup.get(id, {});
    if (!value.isObject()) {
      return absl::InvalidArgumentError(
          absl::StrCat("Lineup entry for '", id, "' is not an object."));
    }
    if (IsMachineOfWar(id)) {
      continue;  // Skip Machine of War units.
    }

    absl::StatusOr<Unit> unit = ParseUnit(id, value);
    if (!unit.ok()) return unit.status();
    *units.add_units() = std::move(*unit);
  }

  if (!root.isMember("xpLevels")) {
    return absl::InvalidArgumentError("Missing 'xpLevels' in JSON.");
  }
  if (!root["xpLevels"].isArray()) {
    return absl::InvalidArgumentError("'xpLevels' is not an array.");
  }
  for (const Json::Value& xp_level : root["xpLevels"]) {
    units.add_xp_levels(xp_level.asInt());
  }
  return units;
}

}  // namespace dataminer
