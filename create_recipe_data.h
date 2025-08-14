#ifndef __CREATE_RECIPE_DATA_H__
#define __CREATE_RECIPE_DATA_H__

#include "miner.pb.h"
#include "absl/status/status.h"
#include "absl/strings/string_view.h"

namespace dataminer {

// Creates the recipe data in the provided JSON root.
// Returns an error status if the creation fails.
absl::Status CreateRecipeData(const absl::string_view path,
                              const GameConfig& game_config);

}  // namespace dataminer

#endif  // __ CREATE_RECIPE_DATA_H__
