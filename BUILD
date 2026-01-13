cc_binary(
    name = "parse_onslaught",
    srcs = ["parse_onslaught.cc"],
    deps = [
      ":miner_cc_proto",
      "//libjson:json",
      "@abseil-cpp//absl/debugging:stacktrace",
      "@abseil-cpp//absl/debugging:symbolize",
      "@abseil-cpp//absl/log:initialize",
      "@abseil-cpp//absl/log:log",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/flags:parse",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/status:statusor",
      "@abseil-cpp//absl/strings",
    ],
    data = [
      "gameconfig_1_31.json",
      "gameconfig_1_32.json",
      "gameconfig_1_35.1.json",
      "I2Languages_en.json",
      "out/text_assets/GameConfig",
    ]
)

cc_binary(
    name = "json_explorer",
    srcs = ["json_explorer.cc"],
    deps = [
      ":miner_cc_proto",
      "//libjson:json",
      "@abseil-cpp//absl/debugging:stacktrace",
      "@abseil-cpp//absl/debugging:symbolize",
      "@abseil-cpp//absl/log:initialize",
      "@abseil-cpp//absl/log:log",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/flags:parse",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/status:statusor",
      "@abseil-cpp//absl/strings",
    ],
    data = [
      "gameconfig_1_31.json",
      "gameconfig_1_32.json",
      "gameconfig_1_35.1.json",
      "I2Languages_en.json",
      "out/text_assets/GlobalGameConfig",
      "out/text_assets/GameConfig",
    ]
)
cc_binary(
    name = "miner",
    srcs = ["miner.cc"],
    deps = [
      ":create_campaign_data",
      ":create_character_data",
      ":create_equipment_data",
      ":create_le_data",
      ":create_mow_data",
      ":create_npc_data",
      ":create_rank_up_data",
      ":create_recipe_data",
      ":miner_cc_proto",
      ":parse_avatars",
      ":parse_campaigns",
      ":parse_items",
      ":parse_le_battles",
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
      "drop_rate_config.binaryproto",
      "gameconfig_1_29.json",
      "gameconfig_1_30.json",
      "gameconfig_1_31.json",
      "gameconfig_1_32.json",
      "gameconfig_1_33.json",
      "gameconfig_1_34.json",
      "gameconfig_1_35.json",
      "gameconfig_1_35.1.json",
      "I2Languages_en.json",
      "I2Languages_en.1.33.json",
      "I2Languages_en.1.34.json",
      "I2Languages_en.1.35.json",
      "I2Languages_en.1.35.1.json",
      "visuals.csv",
      "visuals_1.34.csv",
      "visuals_1.35.csv",
      "visuals_1.35.1.csv",
    ] + glob(["assets/**"]) + glob(["extracted_assets/**"])
)

cc_library(
  name = "calculate_effective_drop_rate",
  srcs = ["calculate_effective_drop_rate.cc"],
  hdrs = ["calculate_effective_drop_rate.h"],
  deps = [
      ":miner_cc_proto",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/log:check",
  ]
)

cc_library(
  name = "create_campaign_data",
  srcs = ["create_campaign_data.cc"],
  hdrs = ["create_campaign_data.h"],
  deps = [
      ":miner_cc_proto",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "create_character_data",
  srcs = ["create_character_data.cc"],
  hdrs = ["create_character_data.h"],
  deps = [
      ":miner_cc_proto",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "create_equipment_data",
  srcs = ["create_equipment_data.cc"],
  hdrs = ["create_equipment_data.h"],
  deps = [
      ":miner_cc_proto",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "create_le_data",
  srcs = ["create_le_data.cc"],
  hdrs = ["create_le_data.h"],
  deps = [
      ":miner_cc_proto",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "create_mow_data",
  srcs = ["create_mow_data.cc"],
  hdrs = ["create_mow_data.h"],
  deps = [
      ":miner_cc_proto",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "create_npc_data",
  srcs = ["create_npc_data.cc"],
  hdrs = ["create_npc_data.h"],
  deps = [
      ":miner_cc_proto",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/strings",
  ],
  data = glob(["out/sprites/**"])
)

cc_library(
  name = "create_rank_up_data",
  srcs = ["create_rank_up_data.cc"],
  hdrs = ["create_rank_up_data.h"],
  deps = [
      ":miner_cc_proto",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "create_recipe_data",
  srcs = ["create_recipe_data.cc"],
  hdrs = ["create_recipe_data.h"],
  deps = [
      ":miner_cc_proto",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "parse_avatars",
  srcs = ["parse_avatars.cc"],
  hdrs = ["parse_avatars.h"],
  deps = [
      ":miner_cc_proto",
      ":status_builder",
      ":status_macros",
      "//libjson:json",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/flags:parse",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/status:statusor",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "parse_campaigns",
  srcs = ["parse_campaigns.cc"],
  hdrs = ["parse_campaigns.h"],
  deps = [
      ":calculate_effective_drop_rate",
      ":miner_cc_proto",
      ":status_builder",
      ":status_macros",
      "//libjson:json",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/flags:parse",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/status:statusor",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "parse_items",
  srcs = ["parse_items.cc"],
  hdrs = ["parse_items.h"],
  deps = [
      ":miner_cc_proto",
      ":status_macros",
      "//libjson:json",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/flags:parse",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/status:statusor",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "parse_le_battles",
  srcs = ["parse_le_battles.cc"],
  hdrs = ["parse_le_battles.h"],
  deps = [
      ":miner_cc_proto",
      ":status_macros",
      "//libjson:json",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/flags:parse",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/status:statusor",
      "@abseil-cpp//absl/strings",
      "@re2//:re2",
  ]
)

cc_library(
  name = "parse_units",
  srcs = ["parse_units.cc"],
  hdrs = ["parse_units.h"],
  deps = [
      ":miner_cc_proto",
      ":status_macros",
      "//libjson:json",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/flags:parse",
      "@abseil-cpp//absl/log",
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
      ":status_macros",
      "//libjson:json",
      "@abseil-cpp//absl/flags:flag",
      "@abseil-cpp//absl/flags:parse",
      "@abseil-cpp//absl/log",
      "@abseil-cpp//absl/status:status",
      "@abseil-cpp//absl/status:statusor",
      "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "status_builder",
  hdrs = ["status_builder.h"],
  deps = [
    "@abseil-cpp//absl/status:status",
    "@abseil-cpp//absl/strings",
  ]
)

cc_library(
  name = "status_macros",
  hdrs = ["status_macros.h"],
  deps = [
    ":status_builder",
    "@abseil-cpp//absl/status:status",
    "@abseil-cpp//absl/status:statusor",
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
