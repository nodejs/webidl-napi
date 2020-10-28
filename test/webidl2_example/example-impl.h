#ifndef WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H
#define WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H

#include <string>
#include "webidl-napi.h"

class WebIDLCompiler {
 public:
  static std::string compile(const std::string& string);
  static std::string compile(object dataTree);
};

class WebIDL {
 public:
  static napi_value parse();
};

#endif  // WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H
