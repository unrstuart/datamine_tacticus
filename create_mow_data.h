#ifndef __CREATE_MOW_DATA_H__
#define __CREATE_MOW_DATA_H__

#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

// Creates the MoW data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateMowData(const absl::string_view path,
                           const GameConfig& game_config);

}  // namespace dataminer

#endif  // __CREATE_MOW_DATA_H__
