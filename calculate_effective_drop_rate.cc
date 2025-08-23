#include <cstdio>
#include <map>
#include <random>
#include <vector>

#include "absl/flags/flag.h"
#include "absl/log/check.h"
#include "absl/log/log.h"
#include "miner.pb.h"

ABSL_FLAG(int, effective_rate_simulation_runs, 1'000'000'000,
          "Number of simulation runs for effective rate calculation");
ABSL_FLAG(std::string, drop_rate_config_path, "",
          "The file that stores persisted drop rates. New rates will be "
          "committed here.");
ABSL_FLAG(bool, allow_empty_drop_rate_config, false,
          "If true, allows the drop rate config file to be empty or missing, "
          "thus allowing the program to bootstrap the config.");

namespace dataminer {

namespace {

// Simulates SP's mercy system to determine the effective rate of a reward.
// The mercy system reduces the denominator by 1 every time you fail to get a
// reward, ensuring that you eventually get one. This also significantly
// increases the chance of certain rewards. The lower the denominator, the much
// higher the effective rate is compared to the calculated rate.
float Calculate(const int num_runs, const int num, const int denom) {
  if (num_runs <= 0) {
    LOG(ERROR) << "Invalid number of simulation runs: " << num_runs;
    return 0.0f;
  }

  int success = 0;
  // SP reduces the denominator by 1 every time you fail to get a reward,
  // ensuring that you eventually get one.
  int adjust = 0;
  std::cerr << std::flush;
  std::cerr << "Calculating effective rate of " << num << "/" << denom
            << " -       ";
  std::random_device rd;
  std::mt19937 gen(rd());
  int64_t last_output = -1;
  for (int i = 0; i < num_runs; ++i) {
    std::uniform_int_distribution<> dis(0, denom - adjust - 1);
    int chance = dis(gen);
    const int64_t output = static_cast<int64_t>(i * 10000) / num_runs;
    if (output > last_output) {
      last_output = output;
      std::cerr << "\b\b\b\b\b\b"
                << absl::StrFormat("%5.2f%%",
                                   static_cast<float>(output) / 100.0f);
      if (output % 100 == 0) std::cerr << std::flush;
    }
    if (chance < num) {
      ++success;
      adjust = 0;
    } else {
      ++adjust;
    }
  }
  std::cerr << "\b\b\b\b\b\b"
            << absl::StrFormat("100%% - rate = %5.2f%%",
                               static_cast<float>(success) / num_runs * 100.0)
            << "\n";
  return static_cast<float>(success) / num_runs;
}

class RateStorage {
 public:
  static void Init() { rate_storage_.InitImpl(); }

  static void Add(const int num_sims, const int num, const int denom,
                  const int ratex1000) {
    rate_storage_.AddImpl(num_sims, num, denom, ratex1000);

    rate_storage_.Persist();
  }

  static std::optional<int> Get(const int num_sims, const int num,
                                const int denom) {
    Init();
    const auto& inner_map = rate_storage_.rates_[num_sims][num];
    const auto it = inner_map.find(denom);
    if (it != inner_map.end()) return it->second;
    return std::nullopt;
  }

 private:
  RateStorage() {}

  DropRateConfig Convert() {
    InitImpl();
    DropRateConfig config;
    for (const auto& [num_sims, outer_map] : rates_) {
      DropRateConfig::Config& inner_config = *config.add_config();
      inner_config.set_num_sims_per_calc(num_sims);
      for (const auto& [num, inner_map] : outer_map) {
        for (const auto& [denom, ratex1000] : inner_map) {
          DropRateConfig::Rate& rate = *inner_config.add_rates();
          rate.set_num(num);
          rate.set_denom(denom);
          rate.set_rate_times_1000(ratex1000);
        }
      }
    }
    return config;
  }

  void AddImpl(const int num_sims, const int num, const int denom,
               const int ratex1000) {
    InitImpl();
    std::map<int, int>& inner_map = rates_[num_sims][num];
    auto it = inner_map.find(denom);
    if (it != inner_map.end()) {
      // Silently drop duplicates.
      return;
    }
    inner_map[denom] = ratex1000;
  }

  void Persist() {
    const std::string path = absl::GetFlag(FLAGS_drop_rate_config_path);
    if (path.empty()) {
      // Do nothing if we don't have persistent storage.
      return;
    }
    FILE* fp = fopen(path.c_str(), "w");
    CHECK(fp != nullptr) << "Failed to open '" << path
                         << "' to write drop rates.";
    std::string out = rate_storage_.Convert().SerializeAsString();
    fwrite(out.data(), 1, out.size(), fp);
    fclose(fp);
  }

  void InitImpl() {
    if (is_initted_) return;
    is_initted_ = true;
    const std::string path = absl::GetFlag(FLAGS_drop_rate_config_path);
    if (path.empty()) return;

    FILE* f = fopen(path.c_str(), "rb");
    CHECK(f != nullptr || absl::GetFlag(FLAGS_allow_empty_drop_rate_config))
        << "Failed to open file '" << path << ".";
    if (f == nullptr) return;

    // Get file size
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    CHECK(size > 0 || absl::GetFlag(FLAGS_allow_empty_drop_rate_config))
        << "Failed to get file size for '" << path << "'.";
    fseek(f, 0, SEEK_SET);

    // Read file contents into a buffer
    std::vector<char> buffer(size);
    fread(buffer.data(), size, 1, f);
    fclose(f);

    DropRateConfig config;
    CHECK(config.ParseFromArray(buffer.data(), size))
        << "Failed to parse " << path << " as DropRateConfig proto.";
    rates_.clear();
    for (const DropRateConfig::Config& config_per_sim : config.config()) {
      std::map<int, std::map<int, int>>& inner_map =
          rates_[config_per_sim.num_sims_per_calc()];
      for (const DropRateConfig::Rate& rate : config_per_sim.rates()) {
        inner_map[rate.num()][rate.denom()] = rate.rate_times_1000();
      }
    }
  }

  // num_sims -> <num, -> <denom, rate*1000>>>
  std::map<int, std::map<int, std::map<int, int>>> rates_;
  bool is_initted_ = false;

  static RateStorage rate_storage_;
};

RateStorage RateStorage::rate_storage_;

}  // namespace

float CalculateEffectiveDropRate(const int num, const int denom) {
  static const int num_sims =
      absl::GetFlag(FLAGS_effective_rate_simulation_runs);
  if (const std::optional<int> rate = RateStorage::Get(num_sims, num, denom);
      rate.has_value()) {
    return *rate / 1000.0f;
  }
  const float rate = Calculate(num_sims, num, denom);
  RateStorage::Add(num_sims, num, denom, static_cast<int>(rate * 1000));

  return rate;
}

}  // namespace dataminer
