load("@rules_cc//cc:defs.bzl", "cc_binary")
load("@rules_cc//cc:defs.bzl", "cc_library")

cc_library(
    name = "json",
    visibility = [
      "//visibility:public",
    ],
    srcs = [
      "json_value.cc",
      "json_reader.cc",
      "json_writer.cc",
    ],
    hdrs = [
      "json_valueiterator.inl",
      "json_tool.h",
      "json/allocator.h",
      "json/assertions.h",
      "json/config.h",
      "json/forwards.h",
      "json/json.h",
      "json/json_features.h",
      "json/reader.h",
      "json/value.h",
      "json/version.h",
      "json/writer.h",
    ],
    deps = [
      "@abseil-cpp//absl/strings",
      "@abseil-cpp//absl/debugging:stacktrace",
      "@abseil-cpp//absl/debugging:symbolize",
    ],
)
