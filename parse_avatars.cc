
#include "parse_avatars.h"

#include "absl/status/statusor.h"
#include "libjson/json/value.h"
#include "miner.pb.h"
#include "status_builder.h"
#include "status_macros.h"

namespace dataminer {

absl::StatusOr<Avatars> ParseAvatars(const Json::Value& root) {
  Avatars ret;
  RET_CHECK(root.isArray()) << "Parsed JSON for 'avatars' must be an array.";
  for (const Json::Value& avatar : root) {
    RET_CHECK(avatar.isObject() && avatar.isMember("avatarId") &&
              avatar.isMember("value"))
        << "Each avatar must be an object with 'avatarId' and 'value' fields.";
    const std::string avatar_id = avatar["avatarId"].asString();
    if (avatar.isMember("effect") && avatar["effect"].isString() &&
    avatar["effect"].asString() == "premium") {
      // Skip premium avatars.
      continue;
    }
    Avatars::Avatar& new_avatar = *ret.add_avatars();
    new_avatar.set_id(avatar["avatarId"].asString());
    new_avatar.set_unit_id(avatar["value"].asString());
  }
  return ret;
}

}  // namespace dataminer
