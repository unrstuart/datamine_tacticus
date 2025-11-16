#ifndef __CREATE_LE_DATA_H__
#define __CREATE_LE_DATA_H__

#include <map>
#include <string>

#include "absl/status/status.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

// Writes the LE data in JSON to the provided path.
// Returns an error status if the creation fails.
absl::Status CreateLeData(const absl::string_view path,
                          const GameConfig &game_config);

} // namespace dataminer

#endif // __CREATE_LE_DATA_H__
