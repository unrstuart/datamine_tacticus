#ifndef __CREATE_EQUIPMENT_DATA_H__
#define __CREATE_EQUIPMENT_DATA_H__

#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

// Creates the Equipment data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateEquipmentData(const absl::string_view path,
                                 const GameConfig& game_config);

}  // namespace dataminer

#endif  // __CREATE_EQUIPMENT_DATA_H__
