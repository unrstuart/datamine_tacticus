
#include "parse_upgrades.h"

#include "absl/status/statusor.h"
#include "absl/strings/string_view.h"
#include "libjson/json/value.h"
#include "miner.pb.h"
#include "parse_enum.h"

namespace dataminer {

namespace {

absl::StatusOr<Upgrades::Upgrade::Recipe> ParseUpgradeRecipe(
    const absl::string_view id, const Json::Value& recipe) {
  Upgrades::Upgrade::Recipe upgrade_recipe;
  if (!recipe.isArray()) {
    return absl::InvalidArgumentError(
        absl::StrCat(id, ": Recipe is not an array."));
  }
  for (const Json::Value& item : recipe) {
    if (!item.isObject()) {
      return absl::InvalidArgumentError(
          absl::StrCat(id, ": Recipe item is not an object."));
    }
    Upgrades::Upgrade::Recipe::Ingredient recipe_item;
    if (!item.isMember("id")) {
      return absl::InvalidArgumentError(
          absl::StrCat(id, ": Recipe item is missing 'id'."));
    }
    if (!item.isMember("amount")) {
      return absl::InvalidArgumentError(
          absl::StrCat(id, ": Recipe item is missing 'amount'."));
    }
    recipe_item.set_id(item["id"].asString());
    recipe_item.set_amount(item["amount"].asInt());
    *upgrade_recipe.add_ingredients() = std::move(recipe_item);
  }
  return upgrade_recipe;
}

}  // namespace

absl::StatusOr<Upgrades> ParseUpgrades(const Json::Value& root) {
  Upgrades upgrades;
  if (!root.isObject()) {
    return absl::InvalidArgumentError("Parsed JSON is not an object.");
  }
  for (const absl::string_view id : root.getMemberNames()) {
    Json::Value value = root.get(id, {});
    Upgrades::Upgrade& upgrade = *upgrades.add_upgrades();
    upgrade.set_id(id);
    if (!value.isMember("gold")) {
      return absl::InvalidArgumentError(
          absl::StrCat("Missing 'gold' in upgrade: ", id));
    }
    if (!value.isMember("name")) {
      return absl::InvalidArgumentError(
          absl::StrCat("Missing 'name' in upgrade: ", id));
    }
    if (!value.isMember("rarity")) {
      return absl::InvalidArgumentError(
          absl::StrCat("Missing 'rarity' in upgrade: ", id));
    }
    if (!value.isMember("statType")) {
      return absl::InvalidArgumentError(
          absl::StrCat("Missing 'statType' in upgrade: ", id));
    }
    upgrade.set_gold(value.get("gold", {}).asInt());
    upgrade.set_name(value.get("name", {}).asString());
    upgrade.set_rarity(ParseRarity(value.get("rarity", {}).asString()));
    upgrade.set_stat_type(value.get("statType", {}).asString());
    if (value.isMember("crafting")) {
      Json::Value recipe = value["crafting"];
      absl::StatusOr<Upgrades::Upgrade::Recipe> recipe_status =
          ParseUpgradeRecipe(id, recipe);
      if (!recipe_status.ok()) {
        return recipe_status.status();
      }
      *upgrade.mutable_recipe() = std::move(*recipe_status);
    }
  }
  return upgrades;
}

}  // namespace dataminer
