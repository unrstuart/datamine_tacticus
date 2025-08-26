#include "parse_units.h"

#include "absl/log/log.h"
#include "absl/status/statusor.h"
#include "absl/strings/ascii.h"
#include "absl/strings/match.h"
#include "absl/strings/str_join.h"
#include "absl/strings/str_replace.h"
#include "absl/strings/strip.h"
#include "libjson/json/value.h"
#include "miner.pb.h"
#include "status_macros.h"

namespace dataminer {

namespace {

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
    requirement.set_bottom_row_health(rank_up[1].asString());
    requirement.set_top_row_damage(rank_up[2].asString());
    requirement.set_bottom_row_damage(rank_up[3].asString());
    requirement.set_top_row_armor(rank_up[4].asString());
    requirement.set_bottom_row_armor(rank_up[5].asString());
    requirements.push_back(std::move(requirement));
  }

  return requirements;
}

absl::StatusOr<Unit> ParseUnit(const absl::string_view id,
                               const Json::Value& root) {
  Unit unit;

  const auto fields = {
      "BaseRarity",      "FactionId",        "GrandAllianceId", "Movement",
      "activeAbilities", "passiveAbilities", "itemSlots",       "name",
      "stats",           "traits",           "upgrades",        "weapons",
  };
  RET_CHECK(root.isObject() && root.isMember("traits"))
      << "Missing 'traits' for unit: " << id;
  for (const Json::Value& trait : root["traits"]) {
    RET_CHECK(trait.isString()) << id;
    if (trait.asString() == "Hero") continue;
    if (trait.asString() == "MachineOfWar") {
      return absl::CancelledError("MachineOfWar units are not supported.");
    }
    unit.add_traits(trait.asString());
  }
  for (const auto& field : fields) {
    RET_CHECK(root.isMember(field))
        << absl::StrCat("Missing '", field, "' for unit: ", id);
  }

  unit.set_base_rarity(root["BaseRarity"].asString());
  unit.set_faction_id(root["FactionId"].asString());
  unit.set_alliance(root["GrandAllianceId"].asString());
  RET_CHECK(root["Movement"].isInt())
      << absl::StrCat("Missing movement for unit: ", id);
  unit.set_movement(root["Movement"].asInt());
  for (const Json::Value& ability : root["activeAbilities"]) {
    RET_CHECK(ability.isString()).SetCode(absl::StatusCode::kInvalidArgument)
        << id;
    unit.add_active_abilities(ability.asString());
  }
  for (const Json::Value& ability : root["passiveAbilities"]) {
    RET_CHECK(ability.isString()).SetCode(absl::StatusCode::kInvalidArgument)
        << id;
    unit.add_passive_abilities(ability.asString());
  }
  for (const Json::Value& slot : root["itemSlots"]) {
    RET_CHECK(slot.isString())
        << "equipment slot for '" << id << "' is not a string.";
    unit.add_equipment_slots(slot.asString());
  }
  RET_CHECK(root["stats"].isObject()) << id;
  for (const absl::string_view field : {"Health", "Damage", "FixedArmor"}) {
    RET_CHECK(root["stats"].isMember(field))
        << id << " stats missing field: " << field;
    RET_CHECK(root["stats"][field].isInt())
        << id << " stats field '" << field << "' is not an integer.";
  }
  unit.mutable_stats()->set_health(root["stats"]["Health"].asInt());
  unit.mutable_stats()->set_damage(root["stats"]["Damage"].asInt());
  unit.mutable_stats()->set_armor(root["stats"]["FixedArmor"].asInt());

  RET_CHECK(root.isMember("weapons") && root["weapons"].isArray() &&
            root["weapons"].size() >= 1)
      << "Unit '" << id << "' Missing or invalid weapons.";
  const Json::Value& melee = root["weapons"][0];
  RET_CHECK(melee.isMember("DamageProfile") && melee.isMember("hits") &&
            melee["DamageProfile"].isString() && melee["hits"].isInt())
      << "Unit '" << id
      << "' Melee weapon is missing 'DamageProfile' or 'hits'.";
  unit.mutable_melee_attack()->set_damage_type(
      melee["DamageProfile"].asString());
  unit.mutable_melee_attack()->set_hits(melee["hits"].asInt());
  if (root["weapons"].size() > 1) {
    const Json::Value& ranged = root["weapons"][1];
    RET_CHECK(ranged.isMember("DamageProfile") && ranged.isMember("hits") &&
              ranged.isMember("Range") && ranged["DamageProfile"].isString() &&
              ranged["hits"].isInt() && ranged["Range"].isInt())
        << "Unit '" << id
        << "' Ranged weapon is missing 'DamageProfile', 'hits' or 'Range'.";
    unit.mutable_ranged_attack()->set_damage_type(
        ranged["DamageProfile"].asString());
    unit.mutable_ranged_attack()->set_hits(ranged["hits"].asInt());
    unit.mutable_ranged_attack()->set_range(ranged["Range"].asInt());
  }
  for (const Json::Value& weapon : root["weapons"]) {
    RET_CHECK(weapon.isObject())
        << "Unit '" << id << "' weapon is not an object.";
  }

  unit.set_name(root["name"].asString());
  unit.set_id(id);

  std::vector<Unit::RankUpRequirements> rank_up_requirements;
  ASSIGN_OR_RETURN(rank_up_requirements,
                   ParseRankUpRequirements(id, root["upgrades"]));
  for (const auto& requirement : rank_up_requirements) {
    *unit.add_rank_up_requirements() = requirement;
  }

  return unit;
}

absl::StatusOr<Npc> ParseNpc(const absl::string_view id,
                             const Json::Value& root) {
  Npc npc;
  npc.set_id(id);
  constexpr absl::string_view kRequiredFields[] = {
      "activeAbilities", "name", "passiveAbilities", "traits", "weapons"};

  for (const absl::string_view field : kRequiredFields) {
    if (!root.isMember(field)) {
      return absl::InvalidArgumentError(
          absl::StrCat("Missing '", field, "' for NPC: ", id));
    }
  }
  if (root.isMember("FactionId") && root["FactionId"].isString()) {
    npc.set_faction_id(root["FactionId"].asString());
  }
  if (root.isMember("GrandAllianceId") && root["GrandAllianceId"].isString()) {
    npc.set_alliance(root["GrandAllianceId"].asString());
  }
  if (root.isMember("Movement") && root["Movement"].isInt()) {
    npc.set_movement(root["Movement"].asInt());
  }
  if (root.isMember("name") && root["name"].isString()) {
    npc.set_name(root["name"].asString());
  }
  if (root.isMember("visualId") && root["visualId"].isString()) {
    npc.set_visual_id(root["visualId"].asString());
  }
  if (root.isMember("activeAbilities") && root["activeAbilities"].isArray()) {
    for (const Json::Value& ability : root["activeAbilities"]) {
      RET_CHECK(ability.isString()).SetCode(absl::StatusCode::kInvalidArgument)
          << id;
      npc.add_active_abilities(ability.asString());
    }
  }
  if (root.isMember("passiveAbilities") && root["passiveAbilities"].isArray()) {
    for (const Json::Value& ability : root["passiveAbilities"]) {
      RET_CHECK(ability.isString()).SetCode(absl::StatusCode::kInvalidArgument)
          << id;
      npc.add_passive_abilities(ability.asString());
    }
  }
  if (root.isMember("traits") && root["traits"].isArray()) {
    for (const Json::Value& trait : root["traits"]) {
      RET_CHECK(trait.isString()) << id;
      if (trait.asString() == "Hero") continue;
      npc.add_traits(trait.asString());
    }
  }
  if (root.isMember("stats") && root["stats"].isArray()) {
    for (const Json::Value& json_stats : root["stats"]) {
      Npc::Stats& stats = *npc.add_stats();
      stats.set_level(json_stats["AbilityLevel"].asInt());
      stats.set_damage(json_stats["Damage"].asInt());
      stats.set_health(json_stats["Health"].asInt());
      stats.set_armor(json_stats["FixedArmor"].asInt());
      stats.set_progression_index(json_stats["ProgressionIndex"].asInt());
      stats.set_rank(json_stats["Rank"].asInt());
      stats.set_stars(json_stats["StarLevel"].asInt());
    }
  }

  return npc;
}

absl::StatusOr<MachineOfWarUpgradeCosts> ParseUpgradeCost(
    const Json::Value& root) {
  MachineOfWarUpgradeCosts costs;
  if (!root.isObject()) {
    return absl::InvalidArgumentError("Upgrade cost is not an object.");
  }
  for (const absl::string_view member : root.getMemberNames()) {
    RET_CHECK(root[member].isInt()) << "Invalid type for " << member;
    if (member == "gold") {
      costs.set_gold(root[member].asInt());
    } else if (member == "dust") {
      costs.set_salvage(root[member].asInt());
    } else if (member == "machinesOfWarToken") {
      costs.set_components(root[member].asInt());
    } else if (absl::StartsWith(member, "itemAscensionResource_")) {
      MachineOfWarUpgradeCosts::Badges& badges = *costs.mutable_forge_badges();
      badges.set_rarity(absl::StripPrefix(member, "itemAscensionResource_"));
      badges.set_amount(root[member].asInt());
    } else if (absl::StartsWith(member, "abilityToken")) {
      MachineOfWarUpgradeCosts::Badges& badges = *costs.mutable_badges();
      badges.set_rarity(absl::StripPrefix(member, "abilityToken"));
      badges.set_amount(root[member].asInt());
    } else {
      return absl::InvalidArgumentError(
          absl::StrCat("Unknown upgrade cost type: ", member));
    }
  }
  return costs;
}

}  // namespace

absl::StatusOr<Units> ParseUnits(const Json::Value& root) {
  RET_CHECK(root.isObject()) << "Parsed JSON is not an object.";
  RET_CHECK(root.isMember("lineup")) << "Missing 'lineup' in JSON.";
  RET_CHECK(root.isMember("abilities")) << "Missing 'abilities' in JSON.";
  RET_CHECK(root.isMember("abilityUpgradeCostsMoW"))
      << "Missing 'abilityUpgradeCostsMoW' in JSON.";
  RET_CHECK(root.isMember("damageProfileModifiers"))
      << "Missing 'damageProfileModifiers' in JSON.";
  RET_CHECK(root.isMember("xpLevels")) << "Missing 'xpLevels' in JSON.";

  Units units;

  std::set<std::string> mows;
  Json::Value lineup = root.get("lineup", {});
  RET_CHECK(lineup.isObject()) << "'lineup' is not an object.";
  for (const absl::string_view id : lineup.getMemberNames()) {
    Json::Value value = lineup.get(id, {});
    RET_CHECK(value.isObject())
        << "Lineup entry for '" << id << "' must be an object.";

    absl::StatusOr<Unit> unit = ParseUnit(id, value);
    if (absl::IsCancelled(unit.status())) {
      // Machine of War units are not supported.
      mows.insert(std::string(id));
      continue;
    }
    ASSIGN_OR_RETURN(*units.add_units(), unit);
  }

  if (!mows.empty()) {
    for (const auto& mow_id : mows) {
      Json::Value mow_value = lineup.get(mow_id, {});
      RET_CHECK(mow_value.isObject())
          << "Machine of War entry for '" << mow_id << "' must be an object.";
      MachineOfWar& mow = *units.add_mows();
      mow.set_id(mow_id);
      RET_CHECK(mow_value.isMember("FactionId") &&
                mow_value["FactionId"].isString())
          << "FactionId for Machine of War entry '" << mow_id
          << "' is missing or not a string.";
      mow.set_faction_id(mow_value["FactionId"].asString());
      RET_CHECK(mow_value.isMember("name") && mow_value["name"].isString())
          << "Name for Machine of War entry '" << mow_id
          << "' is missing or not a string.";
      mow.set_name(mow_value["name"].asString());
      RET_CHECK(mow_value.isMember("GrandAllianceId") &&
                mow_value["GrandAllianceId"].isString())
          << "GrandAllianceId for Machine of War entry '" << mow_id
          << "' is missing or not a string.";
      mow.set_alliance(mow_value["GrandAllianceId"].asString());
      RET_CHECK(mow_value.isMember("activeAbilities") &&
                mow_value["activeAbilities"].isArray() &&
                mow_value["activeAbilities"].size() == 2)
          << "activeAbilities for Machine of War entry '" << mow_id
          << "' is missing or does not have exactly 2 abilities.";
      std::vector<MachineOfWar::Ability*> abilities;
      abilities.push_back(mow.mutable_active_ability());
      abilities.push_back(mow.mutable_passive_ability());
      for (int i = 0; i < 2; ++i) {
        RET_CHECK(mow_value["activeAbilities"][i].isString())
            << "activeAbilities[" << i << "] for Machine of War entry '"
            << mow_id << "' is missing or not a string.";
        abilities[i]->set_name(mow_value["activeAbilities"][i].asString());
        Json::Value ability =
            root.get("abilities", {})
                .get(abilities[i]->name(), Json::Value(Json::objectValue));
        RET_CHECK(ability.isObject()) << "Ability '" << abilities[i]->name()
                                      << "' for Machine of War entry '"
                                      << mow_id << "' is not an object.";
        RET_CHECK(ability.isMember("upgrades") && ability["upgrades"].isArray())
            << "Ability '" << abilities[i]->name()
            << "' for Machine of War entry '" << mow_id
            << "' is missing or not an array.";
        const Json::Value upgrades = ability["upgrades"];
        if (upgrades.size() < 54) {
          LOG(ERROR) << "Ability '" << abilities[i]->name()
                     << "' for Machine of War entry '" << mow_id
                     << "' does not have at least 54 upgrades. Some features "
                    << "will not work or may break. - "
                     << upgrades.size();
        }
        for (int j = 0; j < upgrades.size(); ++j) {
          RET_CHECK(upgrades[j].isArray() && upgrades[j].size() == 3)
              << "Upgrade '" << j << "' for Ability '" << abilities[i]->name()
              << "' is not an array.";
          MachineOfWar::Ability::UpgradeRecipe& recipe =
              *abilities[i]->add_upgrade_recipes();
          recipe.set_mat1(upgrades[j][0].asString());
          recipe.set_mat2(upgrades[j][1].asString());
          recipe.set_mat3(upgrades[j][2].asString());
        }
      }
    }
  }

  Json::Value npcs = root.get("npc", {});
  RET_CHECK(npcs.isObject()) << "'npc' is not an object.";
  for (const absl::string_view id : npcs.getMemberNames()) {
    Json::Value value = npcs.get(id, {});
    RET_CHECK(value.isObject())
        << "NPC entry for '" << id << "' must be an object.";
    ASSIGN_OR_RETURN(*units.add_npcs(), ParseNpc(id, value));
  }

  RET_CHECK(root["xpLevels"].isArray()) << "'xpLevels' is not an array.";
  for (const Json::Value& xp_level : root["xpLevels"]) {
    units.add_xp_levels(xp_level.asInt());
  }

  RET_CHECK(root["abilities"].isObject()) << "'abilities' is not an object.";
  for (const absl::string_view id : root["abilities"].getMemberNames()) {
    Json::Value ability = root["abilities"].get(id, {});
    if (!ability.isObject() || !ability.isMember("constants")) {
      // skip for now.
      continue;
    }
    Units::Ability& new_ability = *units.add_abilities();
    new_ability.set_id(id);

    Json::Value constants = ability["constants"];
    RET_CHECK(constants.isObject())
        << "Ability constants for '" << id << "' must be an object.";
    for (const absl::string_view field : constants.getMemberNames()) {
      if (absl::StartsWith(field, "damageProfile")) {
        Json::Value damage_profile = constants[field];
        RET_CHECK(damage_profile.isString())
            << "Damage profile for ability '" << id << "' field '" << field
            << "' is not a string.";
        new_ability.add_damage_types(damage_profile.asString());
      }
    }
  }

  RET_CHECK(root["abilityUpgradeCostsMoW"].isArray())
      << "'abilityUpgradeCostsMoW' is not an array.";
  for (const Json::Value& cost : root["abilityUpgradeCostsMoW"]) {
    RET_CHECK(cost.isObject())
        << "'abilityUpgradeCostsMoW' entry is not an object.";
    MachineOfWarUpgradeCosts& new_cost = *units.add_mow_upgrade_costs();
    ASSIGN_OR_RETURN(new_cost, ParseUpgradeCost(cost));
  }

  return units;
}

absl::Status AmendUnitsWithDisplayStrings(const Json::Value& root,
                                          Units* units) {
  std::map<std::string, std::string> full_names, short_names, shorter_names,
      titles, descs;
  static std::map<std::string, std::map<std::string, std::string>*> suffixes = {
      {"_Name", &full_names},
      {"_ShortName", &short_names},
      {"_ExtraShortName", &shorter_names},
      {"_Title", &titles},
      {"_Description", &descs}};
  RET_CHECK(root.isObject()) << "Parsed JSON is not an object.";
  RET_CHECK(root.isMember("mSource")) << "Missing 'mSource' in JSON.";
  const Json::Value& source = root["mSource"];
  RET_CHECK(source.isObject()) << "'mSource' is not an object.";
  RET_CHECK(source.isMember("mTerms")) << "Missing 'mTerms' in 'mSource'.";
  const Json::Value& terms = source["mTerms"];
  RET_CHECK(terms.isArray()) << "'mTerms' is not an array.";
  for (const Json::Value& term_entry : terms) {
    RET_CHECK(term_entry.isObject()) << "'mTerms' entry is not an object.";
    RET_CHECK(term_entry.isMember("Term"))
        << "'mTerms' entry does not have 'Term' field.";
    RET_CHECK(term_entry.isMember("Languages"))
        << "'mTerms' entry does not have 'Languages' field.";
    const Json::Value& term = term_entry["Term"];
    RET_CHECK(term.isString())
        << "'mTerms' entry 'Term' field is not a string.";
    const Json::Value& languages = term_entry["Languages"];
    RET_CHECK(languages.isArray() && languages.size() > 0)
        << "'mTerms' entry 'Languages' field is not an array or is empty.";
    const Json::Value& english = languages[0];
    RET_CHECK(english.isString())
        << "'mTerms' entry 'Languages' field is not a string.";
    const std::string key = term.asString();
    const std::string value = english.asString();
    for (const auto& [suffix, map] : suffixes) {
      if (!absl::EndsWith(key, suffix)) continue;
      std::string base_key = key.substr(0, key.size() - suffix.size());
      if (!absl::StartsWith(base_key, "Units/")) continue;  // not a character.
      base_key = base_key.substr(6);  // Remove "Units/" prefix.
      map->insert({base_key, value});
    }
  }
  for (MachineOfWar& mow : *units->mutable_mows()) {
    const std::string id = mow.id();
    auto it = short_names.find(id);
    if (it != short_names.end()) {
      mow.set_short_name(it->second);
    } else {
      LOG(ERROR) << "No short name for mow: " << id;
    }
    it = titles.find(id);
    if (it != titles.end()) {
      mow.set_title(it->second);
    } else {
      LOG(ERROR) << "No title for mow: " << id;
    }
  }
  for (Unit& unit : *units->mutable_units()) {
    const std::string id = unit.id();
    auto it = full_names.find(id);
    if (it != full_names.end()) {
      unit.set_full_name(it->second);
    } else {
      LOG(ERROR) << "No full name for unit: " << id;
    }
    it = short_names.find(id);
    if (it != short_names.end()) {
      unit.set_short_name(it->second);
    } else {
      LOG(ERROR) << "No short name for unit: " << id;
    }
    it = shorter_names.find(id);
    if (it != shorter_names.end()) {
      unit.set_extra_short_name(it->second);
    } else {
      LOG(ERROR) << "No extra short name for unit: " << id;
    }
    it = titles.find(id);
    if (it != titles.end()) {
      unit.set_title(it->second);
    } else {
      LOG(ERROR) << "No title for unit: " << id;
    }
    it = descs.find(id);
    if (it != descs.end()) {
      unit.set_description(it->second);
    } else {
      LOG(ERROR) << "No description for unit: " << id;
    }
  }
  return absl::OkStatus();
}

}  // namespace dataminer
