#ifndef __PARSE_UNITS_H__
#define __PARSE_UNITS_H__

#include "absl/status/statusor.h"
#include "libjson/json/value.h"
#include "miner.pb.h"

namespace dataminer {

absl::StatusOr<Units> ParseUnits(const Json::Value& root);

}  // namespace dataminer

#endif  // __PARSE_UNITS_H__
