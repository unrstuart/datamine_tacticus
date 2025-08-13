#ifndef __ADJUST_RECIPE_DATA_H__
#define __ADJUST_RECIPE_DATA_H__

#include "miner.pb.h"
#include "absl/status/status.h"
#include "absl/strings/string_view.h"

namespace dataminer {

// Adjusts the recipe data in the provided JSON root.
// Returns an error status if the adjustment fails.
absl::Status AdjustRecipeData(const absl::string_view path,
                              const GameConfig& game_config);

}  // namespace dataminer

#endif  // __ADJUST_RECIPE_DATA_H__
