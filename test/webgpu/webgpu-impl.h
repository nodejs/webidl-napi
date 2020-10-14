#ifndef WEBIDL_NAPI_TEST_WEBGPU_WEBGPU_IMPL_H
#define WEBIDL_NAPI_TEST_WEBGPU_WEBGPU_IMPL_H

#include "webidl-napi-inl.h"

enum GPUPowerPreference {
  Low_power,
  High_performance
};

struct GPURequestAdapterOptions {
  GPUPowerPreference powerPreference = static_cast<GPUPowerPreference>(0xfff);
};

class GPU {
 public:
  static Promise requestAdapter(const GPURequestAdapterOptions& options);
};

#endif  // WEBIDL_NAPI_TEST_WEBGPU_WEBGPU_IMPL_H
