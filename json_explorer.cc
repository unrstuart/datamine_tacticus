#include <fstream>
#include <iostream>

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
ABSL_FLAG(int, max_depth, 0,
          "Maximum depth to print the JSON structure. "
          "Use 0 for no limit, or a negative number for unlimited depth.");
ABSL_FLAG(int, max_members, 0,
          "The maximum number of members to print for each object/array. ");
ABSL_FLAG(std::string, debug_print_path, "(none)",
          "The dot-separated path to the JSON fields to debug print. ");
ABSL_FLAG(std::string, search_string, "",
          "If non-empty, searches the JSON for any value containing this "
          "string, and prints the path to every node.");

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
  if (absl::GetFlag(FLAGS_debug_print_path) == "(none)") return;
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

  Print(value, absl::GetFlag(FLAGS_max_depth),
        absl::GetFlag(FLAGS_max_members));

  std::cout << "\n";
}

void PrintPathsToSearchString(const Json::Value& value,
                              const absl::string_view search_string,
                              std::vector<std::string> current_path = {}) {
  if (search_string.empty()) return;

  if (value.isObject()) {
    for (const auto& key : value.getMemberNames()) {
      const std::string value_str = absl::AsciiStrToLower(key);
      if (value_str.find(search_string) != std::string::npos) {
        std::cout << absl::StrJoin(current_path, "") << "." << key << "\n";
      }
      Json::Value child_value = value[key];
      std::vector<std::string> new_path = current_path;
      if (!new_path.empty()) new_path.push_back(".");
      new_path.push_back(key);
      PrintPathsToSearchString(child_value, search_string, new_path);
    }
  } else if (value.isArray()) {
    for (Json::ArrayIndex i = 0; i < value.size(); ++i) {
      Json::Value child_value = value[i];
      std::vector<std::string> new_path = current_path;
      new_path.push_back(absl::StrCat("[", i, "]"));
      PrintPathsToSearchString(child_value, search_string, new_path);
    }
  } else if (value.isString()) {
    const std::string value_str = absl::AsciiStrToLower(value.asString());
    if (value_str.find(search_string) != std::string::npos) {
      std::cout << absl::StrJoin(current_path, "") << ": " << value.asString()
                << "\n";
    }
  }
}

void Main() {
  Json::Value root;
  Json::Reader reader;

  const std::string input_file = absl::GetFlag(FLAGS_json_file);
  std::ifstream in(input_file);
  if (!reader.parse(in, root)) {
    LOG(ERROR) << "Couldn't parse json file: '" << input_file << "'.";
    return;
  }
  if (!root.isObject()) {
    LOG(ERROR) << "Parsed JSON is not an object.";
    return;
  }

  PrintDebugPath(root);
  PrintPathsToSearchString(root, absl::GetFlag(FLAGS_search_string));
}

}  // namespace
}  // namespace dataminer

int main(int argc, char** argv) {
  absl::ParseCommandLine(argc, argv);
  absl::InitializeLog();
  dataminer::Main();

  return 0;
}