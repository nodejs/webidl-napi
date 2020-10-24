#ifndef WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H
#define WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H

#include "webidl-napi.h"

using namespace WebIdlNapi;

struct FulfillsPromise {
  DOMString name;
};

struct ReturnsPromise {
  Promise<FulfillsPromise> requestPromise(DOMString name);
};

#endif  // WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H
