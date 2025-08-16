#ifndef __STATUS_MACROS_H__
#define __STATUS_MACROS_H__

#include "absl/status/status.h"
#include "status_builder.h"

#define RETURN_IF_ERROR(condition)      \
  do {                                  \
    absl::Status _status = (condition); \
    if (!_status.ok()) {                \
      return _status;                   \
    }                                   \
  } while (0)

#define ASSIGN_OR_RETURN(var, expr) \
  do {                              \
    auto _status_or = (expr);       \
    if (!_status_or.ok()) {         \
      return _status_or.status();   \
    }                               \
    var = *std::move(_status_or);   \
  } while (0)

#define RET_CHECK(condition)                                              \
  while (!(condition))                                                    \
  return StatusBuilder(absl::StatusCode::kInternal,                       \
                       absl::StrCat("Check failed: ", #condition, " at ", \
                                    __FILE__, ":", __LINE__))

#endif  // __STATUS_MACROS_H__
