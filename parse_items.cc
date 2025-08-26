#include "parse_items.h"

#include <functional>
#include <iostream>

#include "absl/log/log.h"
#include "absl/status/statusor.h"
#include "absl/strings/ascii.h"
#include "absl/strings/match.h"
#include "absl/strings/numbers.h"
#include "libjson/json/value.h"
#include "miner.pb.h"
#include "status_macros.h"

namespace dataminer {

absl::StatusOr<Item::Stats> ParseLevelStats(const absl::string_view item_name,
                                            const Json::Value& root) {
  struct Stat {
    absl::string_view name;
    std::function<void(Item::Stats&, int)> setter;
  };
  const Stat kStats[] = {
      {"blockChance", std::mem_fn(&Item::Stats::set_block_chance)},
      {"blockDmg", std::mem_fn(&Item::Stats::set_block_damage)},
      {"blockChanceBonus", std::mem_fn(&Item::Stats::set_block_chance_bonus)},
      {"blockDmgBonus", std::mem_fn(&Item::Stats::set_block_damage_bonus)},
      {"critChance", std::mem_fn(&Item::Stats::set_crit_chance)},
      {"critDmg", std::mem_fn(&Item::Stats::set_crit_damage)},
      {"critChanceBonus", std::mem_fn(&Item::Stats::set_crit_chance_bonus)},
      {"critDmgBonus", std::mem_fn(&Item::Stats::set_crit_damage_bonus)},
      {"fixedArmor", std::mem_fn(&Item::Stats::set_fixed_armor)},
      {"hp", std::mem_fn(&Item::Stats::set_hp)},
  };
  Item::Stats stats;
  for (const Stat& stat : kStats) {
    if (root.isMember(stat.name)) {
      RET_CHECK(root[stat.name].isInt())
          << stat.name << " must be an integer. item=" << item_name << ";";
      stat.setter(stats, root[stat.name].asInt());
    }
  }
  return stats;
}

absl::Status ParseLevels(Item& item, const Json::Value& array) {
  struct Cost {
    absl::string_view name;
    std::function<void(Item::Level&, int)> setter;
  };
  const Cost kCosts[] = {
      {"dustCost", std::mem_fn(&Item::Level::set_salvage_cost)},
      {"mythicDustCost", std::mem_fn(&Item::Level::set_mythic_salvage_cost)},
      {"goldCost", std::mem_fn(&Item::Level::set_gold_cost)},
  };
  for (const Json::Value& level : array) {
    RET_CHECK(level.isObject());
    Item::Level& item_level = *item.add_levels();
    for (const Cost& cost : kCosts) {
      if (level.isMember(cost.name)) {
        const Json::Value value = level[cost.name];
        RET_CHECK(value.isInt())
            << cost.name << " must be an int - item=" << item.id();
        cost.setter(item_level, value.asInt());
      }
    }

    RET_CHECK(level.isMember("stats") && level["stats"].isObject())
        << "Item level stats must be an object - item" << item.id();
    ASSIGN_OR_RETURN(*item_level.mutable_stats(),
                     ParseLevelStats(item.id(), level["stats"]));
  }
  return absl::OkStatus();
}

absl::StatusOr<Item> ParseItem(const absl::string_view item_name,
                               const Json::Value& root) {
  Item item;
  item.set_id(item_name);
  if (root.isMember("abilityId")) {
    RET_CHECK(root["abilityId"].isString())
        << "Item abilityId must be a string - item=" << item_name;
    item.set_ability_id(root["abilityId"].asString());
  }

  if (root.isMember("allowedFactions")) {
    const Json::Value& factions = root["allowedFactions"];
    RET_CHECK(factions.isArray())
        << "allowedFactions must be an array - item=" << item_name;
    for (const Json::Value& faction : factions) {
      RET_CHECK(faction.isString())
          << "faction must be a string - item=" << item_name;
      item.add_allowed_factions(faction.asString());
    }
  }

  if (root.isMember("allowedUnits")) {
    const Json::Value& units = root["allowedUnits"];
    RET_CHECK(units.isArray())
        << "allowedUnits must be an array - item=" << item_name;
    for (const Json::Value& unit : units) {
      RET_CHECK(unit.isString())
          << "unit must be a string - item=" << item_name;
      item.add_allowed_units(unit.asString());
    }
  }

  RET_CHECK(root.isMember("itemType") && root["itemType"].isString())
      << "itemType must be a string member of the item - item=" << item_name;
  item.set_equipment_type(root["itemType"].asString());

  RET_CHECK(root.isMember("name") && root["name"].isString())
      << "name must be a string member of the item - item=" << item_name;
  item.set_name(root["name"].asString());

  RET_CHECK(root.isMember("rarity") && root["rarity"].isString())
      << "rarity must be a string member of the item - item=" << item_name;
  item.set_rarity(root["rarity"].asString());

  if (root.isMember("isRelic")) {
    item.set_is_relic(root["isRelic"].asBool());
  }
  if (root.isMember("isUniqueRelic")) {
    item.set_is_unique_relic(root["isUniqueRelic"].asBool());
  }

  RET_CHECK(root.isMember("levels") && root["levels"].isArray())
      << "levels of item must be an array - item=" << item_name;
  RETURN_IF_ERROR(ParseLevels(item, root["levels"]));
  return item;
}

absl::StatusOr<Items> ParseItems(const Json::Value& root) {
  Items items;
  RET_CHECK(root.isObject()) << "Parsed JSON for 'battles' must be an object.";
  for (const absl::string_view item_name : root.getMemberNames()) {
    Item& item = *items.add_items();
    ASSIGN_OR_RETURN(item, ParseItem(item_name, root[item_name]));
  }
  return items;
}

}  // namespace dataminer
