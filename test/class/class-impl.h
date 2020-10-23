#ifndef WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H
#define WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H

#include "webidl-napi.h"

class JSClassExample {
 public:
  explicit JSClassExample();
  JSClassExample(unsigned long initial);
  JSClassExample(DOMString initial);
  unsigned long increment();
 private:
  unsigned long value = 0;
};

#endif  // WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H
