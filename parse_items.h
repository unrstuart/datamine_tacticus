#ifndef __PARSE_ITEMS_H__
#define __PARSE_ITEMS_H__

#include "absl/status/statusor.h"
#include "libjson/json/value.h"
#include "miner.pb.h"

namespace dataminer {

absl::StatusOr<Items> ParseItems(const Json::Value& root);

}  // namespace dataminer

#endif  // __PARSE_ITEMS_H__
