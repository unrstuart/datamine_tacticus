#include <fstream>
#include <iostream>
#include <optional>

#include "absl/debugging/stacktrace.h"
#include "absl/debugging/symbolize.h"
#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/log/initialize.h"
#include "absl/log/log.h"
#include "absl/status/statusor.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/str_join.h"
#include "absl/strings/str_split.h"
#include "libjson/json/reader.h"
#include "libjson/json/value.h"
#include "miner.pb.h"

ABSL_FLAG(std::string, json_file, "", "The JSON file to explore.");

namespace dataminer {
namespace {

std::string ToRomanNumeral(int number) {
  const std::vector<std::pair<int, std::string>> kRomanNumerals = {
      {1000, "M"}, {900, "CM"}, {500, "D"}, {400, "CD"}, {100, "C"},
      {90, "XC"},  {50, "L"},   {40, "XL"}, {10, "X"},   {9, "IX"},
      {5, "V"},    {4, "IV"},   {1, "I"},
  };
  std::string result;
  for (const auto& [value, numeral] : kRomanNumerals) {
    while (number >= value) {
      result += numeral;
      number -= value;
    }
  }
  return result.empty() ? absl::StrCat(number) : result;
}

void PrintData(const absl::string_view label, const Json::Value& track) {
  int sector_index = 0;
  std::cout << label << std::endl;
  for (const Json::Value& sector : track) {
    ++sector_index;
    std::cout << ToRomanNumeral(sector_index) << ',';
    for (const Json::Value& zone : sector["battles"]) {
      int enemy_count = 0;
      for (const Json::Value& wave : zone["waves"]) {
        enemy_count += wave["enemies"]["defaultGroup"].size();
      }
      std::cout << enemy_count << ',';
    }
    std::cout << std::endl;
  }
}

void PrintHonorYourHeroes(const Json::Value& rewards_by_tier) {
  std::cout << "\nhonorYourHeroes rewardsByTier" << std::endl;
  std::cout << "maxTierIndex,maxProgressionIndex,rewards" << std::endl;
  for (const Json::Value& tier : rewards_by_tier) {
    const int max_tier_index = tier["maxTierIndex"].asInt();
    for (const Json::Value& progression :
         tier["rewardsByProgressionIndex"]) {
      const int max_prog_index =
          progression["maxProgressionIndex"].asInt();
      std::cout << max_tier_index << ',' << max_prog_index;
      for (const Json::Value& reward : progression["rewards"]) {
        std::cout << ',' << reward.asString();
      }
      std::cout << std::endl;
    }
  }
}

void Main() {
  Json::Value root;
  Json::Reader reader;

  const std::string input_file = absl::GetFlag(FLAGS_json_file);
  std::ifstream in(input_file);
  if (!reader.parse(in, root)) {
    LOG(ERROR) << "Couldn't parse json file: '" << input_file << "'. "
               << reader.getFormattedErrorMessages();
    return;
  }
  if (!root.isObject()) {
    LOG(ERROR) << "Parsed JSON is not an object.";
    return;
  }

  PrintData("imperial",
            root["clientGameConfig"]["battles"]["waves"]["tracks"][0]["tiers"]);
  PrintData("xenos",
            root["clientGameConfig"]["battles"]["waves"]["tracks"][1]["tiers"]);
  PrintData("chaos",
            root["clientGameConfig"]["battles"]["waves"]["tracks"][2]["tiers"]);

  PrintHonorYourHeroes(root["clientGameConfig"]["battles"]["waves"]
                           ["honorYourHeroes"]["rewardsByTier"]);
}

}  // namespace
}  // namespace dataminer

int main(int argc, char** argv) {
  absl::ParseCommandLine(argc, argv);
  absl::InitializeSymbolizer(argv[0]);
  absl::InitializeLog();
  dataminer::Main();

  return 0;
}