#include <stdio.h>
#include "webgpu-impl.h"

GPUAdapter::GPUAdapter():
    name("dummy adapter"),
    extensions({
      GPUExtensionName::Depth_clamping,
      GPUExtensionName::Timestamp_query
    }) {}

WebIdlNapi::Promise<GPUAdapter> GPU::requestAdapter(
                                      const GPURequestAdapterOptions& options) {
  fprintf(stderr,
      "GPU::requestAdapter with options { powerPreference: %d(%s) }\n",
      static_cast<int>(options.powerPreference),
      options.powerPreference == GPUPowerPreference::Low_power
        ? "Low_power"
        : options.powerPreference == GPUPowerPreference::High_performance
          ? "High_performance"
          : "unknown");

  WebIdlNapi::Promise<GPUAdapter> result;
  result.Resolve({});
  return result;
}

WebIdlNapi::Promise<GPUDevice> GPUAdapter::requestDevice(
                                        const GPUDeviceDescriptor& descriptor) {
  WebIdlNapi::Promise<GPUDevice> result;
  result.Resolve({});
  return result;
}
