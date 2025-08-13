cc_binary(
    name = "miner",
    srcs = ["miner.cc"],
    deps = [
      ":miner_cc_proto",
      "//libjson:json",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/flags:parse",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/status:statusor",
      "@abseil-cpp//absl/strings",
    ],
    data = [
      "gameconfig_1_31.json",
    ]
)

proto_library(
  name = "miner_proto",
  srcs = ["miner.proto"],
)

cc_proto_library(
  name = "miner_cc_proto",
  deps = [":miner_proto"],
)