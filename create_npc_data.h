#ifndef __CREATE_NPC_DATA_H__
#define __CREATE_NPC_DATA_H__

#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

// Writes the NPC data in JSON to the provided path.
// Returns an error status if the creation fails.
absl::Status CreateNpcData(const absl::string_view path,
                           const GameConfig& game_config);

}  // namespace dataminer

#endif  // __CREATE_NPC_DATA_H__
