#include <stdio.h>
#include "webgpu-impl.h"
Promise<GPUAdapter> GPU::requestAdapter(
                                      const GPURequestAdapterOptions& options) {
  fprintf(stderr,
      "GPU::RequestAdapter with options { powerPreference: %d(%s) }\n",
      static_cast<int>(options.powerPreference),
      options.powerPreference == GPUPowerPreference::Low_power
        ? "Low_power"
        : options.powerPreference == GPUPowerPreference::High_performance
          ? "High_performance"
          : "unknown");
  return Promise<GPUAdapter>();
}
