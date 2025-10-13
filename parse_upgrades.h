#ifndef __PARSE_UPGRADES_H__
#define __PARSE_UPGRADES_H__

#include "absl/status/statusor.h"
#include "libjson/json/value.h"
#include "miner.pb.h"

namespace dataminer {

absl::StatusOr<Upgrades> ParseUpgrades(const Json::Value& root);

absl::Status AmendUpgradeMaterialsWithDisplayStrings(const Json::Value& root,
                                                     Upgrades* upgrades);

}  // namespace dataminer

#endif  // __PARSE_UPGRADES_H__
