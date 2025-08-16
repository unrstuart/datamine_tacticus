#ifndef __PARSE_CAMPAIGNS_H__
#define __PARSE_CAMPAIGNS_H__

#include "absl/status/statusor.h"
#include "libjson/json/value.h"
#include "miner.pb.h"

namespace dataminer {

absl::StatusOr<Battles> ParseCampaigns(const Json::Value& root);

}  // namespace dataminer

#endif  // __PARSE_CAMPAIGNS_H__
