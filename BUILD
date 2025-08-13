cc_binary(
    name = "miner",
    srcs = ["miner.cc"],
    deps = [
      ":miner_cc_proto",
      ":parse_enum",
      ":parse_upgrades",
      ":parse_units",
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

cc_library(
  name = "parse_enum",
  srcs = ["parse_enum.cc"],
  hdrs = ["parse_enum.h"],
  deps = [
      ":miner_cc_proto",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "parse_units",
  srcs = ["parse_units.cc"],
  hdrs = ["parse_units.h"],
  deps = [
      ":miner_cc_proto",
      ":parse_enum",
      "//libjson:json",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/flags:parse",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/status:statusor",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "parse_upgrades",
  srcs = ["parse_upgrades.cc"],
  hdrs = ["parse_upgrades.h"],
  deps = [
      ":miner_cc_proto",
      ":parse_enum",
      "//libjson:json",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/flags:parse",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/status:statusor",
      "@abseil-cpp//absl/strings",
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