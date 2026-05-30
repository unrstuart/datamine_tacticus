#ifndef __CREATE_ABILITY_DATA_H__
#define __CREATE_ABILITY_DATA_H__

#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

// Creates the ability icons file in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateAbilityData(
    const absl::string_view assets_dir,
    const absl::string_view path,
    const std::map<std::string, std::string> ability_names,
    const GameConfig& game_config);

}  // namespace dataminer

#endif  // __CREATE_ABILITY_DATA_H__
