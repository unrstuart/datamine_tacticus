#ifndef __CREATE_RANK_UP_DATA_H__
#define __CREATE_RANK_UP_DATA_H__

#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

// Creates the rank-up data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateRankUpData(const absl::string_view path,
                              const GameConfig& game_config);

}  // namespace dataminer

#endif  // __CREATE_RANK_UP_DATA_H__
