#include <iostream>
#include <fstream>

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "libjson/json/reader.h"
#include "libjson/json/value.h"

ABSL_FLAG(std::string, game_config, "", "The GameConfig.json file to parse");

int main(int argc, char** argv) {
  absl::ParseCommandLine(argc, argv);

  Json::Value root;
  Json::Reader reader;

  const std::string input_file = absl::GetFlag(FLAGS_game_config);
  std::ifstream in(input_file);
  if (!reader.parse(in, root)) {
    std::cerr << "Couldn't parse json file: '" << input_file << "'.";
  }

  return 0;
}

