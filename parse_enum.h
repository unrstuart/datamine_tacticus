#ifndef __PARSE_UNIT_ID_H__
#define __PARSE_UNIT_ID_H__

#include "miner.pb.h"

namespace dataminer {

Alliance::Enum ParseAlliance(const absl::string_view alliance);
Faction::Enum ParseFaction(const absl::string_view faction);
Rarity::Enum ParseRarity(const absl::string_view rarity);

}  // namespace dataminer

#endif  // __PARSE_UNIT_ID_H__
