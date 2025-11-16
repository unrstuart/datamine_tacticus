#ifndef __PARSE_LE_BATTLES_H__
#define __PARSE_LE_BATTLES_H__

#include <map>

#include "absl/status/statusor.h"
#include "libjson/json/value.h"
#include "miner.pb.h"

namespace dataminer {

absl::StatusOr<LegendaryEvents> ParseLeBattles(const Json::Value& root);

}  // namespace dataminer

#endif  // __PARSE_LE_BATTLES_H__