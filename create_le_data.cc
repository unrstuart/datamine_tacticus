#include <sys/stat.h>

#include <cstdio>
#include <fstream>

#include "absl/log/log.h"
#include "absl/status/status.h"
#include "absl/strings/ascii.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/string_view.h"
#include "miner.pb.h"

namespace dataminer {

namespace {

void EmitObjective(std::ofstream& out,
                   const LegendaryEvent::Objective& objective) {
  out << "          {\n";
  out << "            \"type\": \"" << objective.type() << "\",\n";
  out << "            \"target\": \"" << objective.target() << "\",\n";
  out << "            \"points\": " << objective.points() << "\n";
  out << "          }";
}

void EmitWave(std::ofstream& out, const LegendaryEvent::Wave& wave) {
  out << "            {\n";
  out << "              \"enemies\": [\n";
  bool first_enemy = true;
  for (const std::string& enemy : wave.enemies()) {
    if (!first_enemy) out << ",\n";
    first_enemy = false;
    out << "                \"" << enemy << "\"";
    ;
  }
  out << "\n              ],\n";
  out << "              \"power\": " << wave.power() << ",\n";
  out << "              \"round\": " << wave.round() << "\n";
  out << "            }";
}

void EmitBattle(std::ofstream& out, const LegendaryEvent::Battle& battle) {
  out << "          \"mapId\": \"" << battle.map_id() << "\",\n";
  out << "          \"number\": " << battle.number() << ",\n";
  out << "          \"power\": " << battle.power() << ",\n";
  out << "          \"tier\": " << battle.tier() << ",\n";
  out << "          \"disallowedFactions\": [\n";
  bool first_faction = true;
  for (const std::string& faction : battle.disallowed_factions()) {
    if (!first_faction) out << ",\n";
    first_faction = false;
    out << "            \"" << faction << "\"";
  }
  out << "\n          ],\n";
  out << "          \"waves\": [\n";
  bool first_wave = true;
  for (const LegendaryEvent::Wave& wave : battle.waves()) {
    if (!first_wave) out << ",\n";
    first_wave = false;
    EmitWave(out, wave);
  }
  out << "\n          ],\n";
  out << "          \"objectives\": [\n";
  bool first_objective = true;
  for (const LegendaryEvent::Objective& objective : battle.objectives()) {
    if (!first_objective) out << ",\n";
    first_objective = false;
    EmitObjective(out, objective);
  }
  out << "\n          ]\n";
}

void EmitTrack(std::ofstream& out, const LegendaryEvent::Track& track) {
  bool first_battle = true;
  out << "        \"battles\": [\n";
  for (const LegendaryEvent::Battle& battle : track.battles()) {
    if (!first_battle) out << ",\n";
    first_battle = false;
    out << "          {\n";
    EmitBattle(out, battle);
    out << "\n          }";
  }
  out << "\n         ]\n";
}

void EmitEvent(std::ofstream& out, const LegendaryEvent& event) {
  out << "    {\n";
  out << "      \"id\": \"" << event.id() << "\",\n";
  out << "      \"alpha\": {\n";
  EmitTrack(out, event.alpha());
  out << "\n";
  out << "      },\n";
  out << "      \"beta\": {\n";
  EmitTrack(out, event.beta());
  out << "\n";
  out << "      },\n";
  out << "      \"gamma\": {\n";
  EmitTrack(out, event.gamma());
  out << "\n";
  out << "      }\n";
  out << "    }";
}

}  // namespace

absl::Status CreateLeData(const absl::string_view path,
                          const GameConfig& game_config) {
  std::ofstream out(std::string(path).c_str());

  out << "{\n";
  out << "  \"legendaryEvents\": [\n";
  bool first_event = true;
  for (const LegendaryEvent& event :
       game_config.client_game_config().legendary_events().events()) {
    if (!first_event) out << ",";
    first_event = false;
    EmitEvent(out, event);
  }
  out << "    ],\n";
  out << "}";
  return absl::OkStatus();
}

}  // namespace dataminer
