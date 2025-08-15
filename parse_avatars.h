#ifndef __PARSE_AVATARS_H__
#define __PARSE_AVATARS_H__

#include "absl/status/statusor.h"
#include "libjson/json/value.h"
#include "miner.pb.h"

namespace dataminer {

absl::StatusOr<Avatars> ParseAvatars(const Json::Value& root);

}  // namespace dataminer

#endif  // __PARSE_AVATARS_H__
