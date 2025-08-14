#include <fstream>
#include <iostream>

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/status/statusor.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/str_join.h"
#include "absl/strings/str_split.h"
#include "create_rank_up_data.h"
#include "create_recipe_data.h"
#include "libjson/json/reader.h"
#include "libjson/json/value.h"
#include "miner.pb.h"
#include "parse_units.h"
#include "parse_upgrades.h"

ABSL_FLAG(std::string, json_file, "", "The JSON file to explore.");
ABSL_FLAG(int, max_depth, 2,
          "Maximum depth to print the JSON structure. "
          "Use 0 for no limit, or a negative number for unlimited depth.");
ABSL_FLAG(int, max_members, 2,
          "The maximum number of members to print for each object/array. ");
ABSL_FLAG(std::string, debug_print_path, "",
          "The dot-separated path to the JSON fields to debug print. ");

namespace dataminer {
namespace {

void ParsePath(const absl::string_view path, std::string& path_comp,
               std::optional<int>& index) {
  path_comp = std::string(path);
  auto ind = path.find('[');
  if (ind != absl::string_view::npos) {
    path_comp = std::string(path.substr(0, ind));
    auto ind_str = path.substr(ind + 1);
    int ind_ret;
    if (!absl::SimpleAtoi(ind_str.substr(0, ind_str.size() - 1), &ind_ret)) {
      std::cerr << "Invalid index in path: " << path << "\n";
      index = std::nullopt;
      return;
    }
    index = ind_ret;
  }
}

void Print(const Json::Value& value, int max_depth, int max_members,
           int current_depth = 0) {
  if (current_depth > max_depth) return;
  if (value.isBool()) {
    std::cout << (value.asBool() ? "true" : "false");
  } else if (value.isInt()) {
    std::cout << value.asInt();
  } else if (value.isUInt()) {
    std::cout << value.asUInt();
  } else if (value.isDouble()) {
    std::cout << value.asDouble();
  } else if (value.isString()) {
    std::cout << '"' << value.asString() << '"';
  } else if (value.isArray()) {
    if (current_depth + 1 > max_depth) {
      std::cout << "[...]";
      return;
    }
    std::cout << "[\n";
    int num_members = 0;
    for (const auto& item : value) {
      if (num_members++ >= max_members) break;
      std::cout << std::string(current_depth * 2 + 2, ' ');
      Print(item, max_depth, max_members, current_depth + 1);
      std::cout << "\n";
    }
    std::cout << std::string(current_depth * 2, ' ') << "]";
  } else if (value.isObject()) {
    if (current_depth + 1 > max_depth) {
      std::cout << "{...}";
      return;
    }
    std::cout << "{\n";
    int num_members = 0;
    for (const auto& key : value.getMemberNames()) {
      if (num_members++ >= max_members) break;
      std::cout << std::string(current_depth * 2 + 2, ' ') << '"' << key
                << "\": ";
      Print(value[key], max_depth, max_members, current_depth + 1);
      std::cout << "\n";
    }
    std::cout << std::string(current_depth * 2, ' ') << "}\n";
  }
}

void PrintDebugPath(Json::Value value) {
  if (!absl::GetFlag(FLAGS_debug_print_path).empty()) {
    for (const absl::string_view path :
        absl::StrSplit(absl::GetFlag(FLAGS_debug_print_path), ".")) {
      std::string path_comp;
      std::optional<int> index;
      ParsePath(path, path_comp, index);
      value = value[path_comp];
      if (index.has_value()) {
        value = value[*index];
      }
    }
  }

  Print(value, absl::GetFlag(FLAGS_max_depth),
        absl::GetFlag(FLAGS_max_members));

  std::cout << "\n";
}

void Main() {
  Json::Value root;
  Json::Reader reader;

  const std::string input_file = absl::GetFlag(FLAGS_json_file);
  std::ifstream in(input_file);
  if (!reader.parse(in, root)) {
    std::cerr << "Couldn't parse json file: '" << input_file << "'.";
  }
  if (!root.isObject()) {
    std::cerr << "Parsed JSON is not an object.";
    return;
  }

  PrintDebugPath(root);
}

}  // namespace
}  // namespace dataminer

int main(int argc, char** argv) {
  absl::ParseCommandLine(argc, argv);
  dataminer::Main();

  return 0;
}