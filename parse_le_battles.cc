#include "parse_le_battles.h"

#include "absl/log/log.h"
#include "absl/status/statusor.h"
#include "absl/strings/match.h"
#include "libjson/json/value.h"
#include "miner.pb.h"
#include "re2/re2.h"
#include "status_macros.h"

namespace dataminer {

namespace {

absl::StatusOr<LegendaryEvent::Wave> ParseWave(const Json::Value& root) {
  LegendaryEvent::Wave wave;
  wave.set_round(root["round"].asInt());
  wave.set_power(root["power"].asInt());
  for (const Json::Value& enemy : root["army"]) {
    wave.add_enemies(enemy.asString());
  }
  return wave;
}

absl::StatusOr<LegendaryEvent::Objective> ParseObjective(
    const Json::Value& root) {
  LegendaryEvent::Objective objective;
  objective.set_type(root["objectiveType"].asString());
  objective.set_target(root["objectiveTarget"].asString());
  objective.set_points(root["score"].asInt());
  return objective;
}

absl::StatusOr<LegendaryEvent::Battle> ParseBattle(const Json::Value& root) {
  LegendaryEvent::Battle battle;

  battle.set_map_id(root["boardId"].asString());
  battle.set_number(root["battleNr"].asInt());
  battle.set_power(root["power"].asInt());
  battle.set_tier(root["tier"].asInt());
  for (const Json::Value& faction : root["disallowedFactions"]) {
    battle.add_disallowed_factions(faction.asString());
  }
  for (const Json::Value& wave : root["waves"]) {
    ASSIGN_OR_RETURN(*battle.add_waves(), ParseWave(wave));
  }
  RET_CHECK(root["objectives"].isArray())
      << "Legendary event battle objectives must be an array.";
  for (const Json::Value& objective : root["objectives"]) {
    ASSIGN_OR_RETURN(*battle.add_objectives(), ParseObjective(objective));
  }

  return battle;
}

absl::StatusOr<LegendaryEvent::Track> ParseLane(const Json::Value& root) {
  LegendaryEvent::Track event;
  RET_CHECK(root.isArray()) << "Legendary event must be an array.";
  for (const Json::Value& battle : root) {
    RET_CHECK(battle.isObject())
        << "Legendary event battle entry must be an object.";
    ASSIGN_OR_RETURN(*event.add_battles(), ParseBattle(battle));
  }
  return event;
}

}  // namespace

absl::StatusOr<LegendaryEvents> ParseLeBattles(const Json::Value& root) {
  std::map<std::string, LegendaryEvent::Track> lanes;
  RET_CHECK(root.isObject())
      << "Parsed JSON for 'battles.battleSets' must be an object.";
  for (const std::string& lane : root.getMemberNames()) {
    if (absl::StartsWith(lane, "legendary_event_")) {
      const Json::Value& battle_set_value = root[lane];
      RET_CHECK(battle_set_value.isArray())
          << "Legendary event '" << lane << "' must be an object.";
      ASSIGN_OR_RETURN(lanes[lane], ParseLane(battle_set_value));
    }
  }
  std::map<int, LegendaryEvent> events;
  for (const auto& [lane, track] : lanes) {
    static LazyRE2 pattern = {R"(legendary_event_(\d+)_lane_(\d+))"};
    int event, track_number;
    if (!RE2::FullMatch(lane, *pattern, &event, &track_number)) {
      LOG(WARNING) << "Unexpected legendary event lane format: " << lane;
      continue;
    }
    LOG(INFO) << "Parsed legendary event " << event << " lane " << track_number;
    if (track_number == 1) {
      *events[event].mutable_alpha() = track;
    } else if (track_number == 2) {
      *events[event].mutable_beta() = track;
    } else if (track_number == 3) {
      *events[event].mutable_gamma() = track;
    } else {
      LOG(WARNING) << "Unknown legendary event battle set: " << lane;
    }
  }
  LegendaryEvents ret;
  for (auto& [id, event] : events) {
    event.set_id(id);
    *ret.add_events() = event;

    const auto count_enemies = [](const LegendaryEvent::Battle& battle) {
      int total = 0;
      for (const auto& wave : battle.waves()) {
        total += wave.enemies_size();
      }
      return total;
    };

    const auto defeat_all_score = [](const LegendaryEvent::Battle& battle) {
      int total = 0;
      for (const auto& objective : battle.objectives()) {
        if (objective.type() == "Acing") {
          total += objective.points();
        }
      }
      return total;
    };

    const auto print_track = [&](const LegendaryEvent::Track& track) {
      std::cout << "\"battlesPoints\": [";
      for (const auto& battle : track.battles()) {
        std::cout << count_enemies(battle) << ", ";
      }
      std::cout << "],\n";
      std::cout << "\"defeatAll\": [";
      for (const auto& battle : track.battles()) {
        std::cout << defeat_all_score(battle) << ", ";
      }
      std::cout << "],\n" << std::endl;
    };

    std::cout << "Legendary Event " << id << ":\n";
    std::cout << "  Alpha Track:\n";
    print_track(event.alpha());
    std::cout << "  Beta Track:\n";
    print_track(event.beta());
    std::cout << "  Gamma Track:\n";
    print_track(event.gamma());
  }
  return ret;
}

}  // namespace dataminer
