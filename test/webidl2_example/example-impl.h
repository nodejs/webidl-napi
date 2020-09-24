#ifndef WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H
#define WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H

#include <string>
#include "js_native_api.h"

class WebIDLCompiler {
 public:
  static std::string compile(const char* string);
  static std::string compile(napi_value dataTree);
};

class WebIDL {
 public:
  static napi_value parse();
};

#endif  // WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H
