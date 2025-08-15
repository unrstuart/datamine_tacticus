#ifndef __STATUS_BUILDER_H__
#define __STATUS_BUILDER_H__

#include "absl/status/status.h"
#include "absl/status/statusor.h"
#include "absl/strings/str_cat.h"

namespace dataminer {

class StatusBuilder {
 public:
  // Constructs a StatusBuilder with an initial status.
  explicit StatusBuilder(absl::Status initial_status)
      : code_(initial_status.code()), message_(initial_status.message()) {}

      StatusBuilder(absl::StatusCode code, absl::string_view message)
      : code_(code), message_(message) {}

  // Sets the status code.
  StatusBuilder& SetCode(absl::StatusCode code) {
    code_ = code;
    return *this;
  }

  // Sets the status message.
  StatusBuilder& SetMessage(const absl::string_view message) {
    message_ = std::string(message);
    return *this;
  }

  // Builds the final status.
  absl::Status Build() const {
    return absl::Status(code_, message_);
  }

  operator absl::Status() const { return Build(); }

  StatusBuilder& operator<<(const absl::string_view message) {
    message_ = absl::StrCat(message_, " ", message);
    return *this;
  }

 private:
  absl::StatusCode code_;
  std::string message_;
};

}  // namespace dataminer

#endif  // __STATUS_BUILDER_H__
