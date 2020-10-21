#ifndef WEBIDL_NAPI_TEST_WEBGPU_WEBGPU_IMPL_H
#define WEBIDL_NAPI_TEST_WEBGPU_WEBGPU_IMPL_H

#include "webidl-napi-inl.h"

enum GPUPowerPreference {
  Low_power,
  High_performance
};

struct GPUDevice {
};

struct GPURequestAdapterOptions {
  GPUPowerPreference powerPreference = static_cast<GPUPowerPreference>(0xfff);
};

enum GPUExtensionName {
  Depth_clamping,
  Depth24unorm_stencil8,
  Depth32float_stencil8,
  Pipeline_statistics_query,
  Texture_compression_bc,
  Timestamp_query
};

typedef unsigned long GPUSize32;

struct GPUObjectDescriptorBase {
  USVString label;
};

struct GPULimits {
  GPUSize32 maxBindGroups = 4;
  GPUSize32 maxDynamicUniformBuffersPerPipelineLayout = 8;
  GPUSize32 maxDynamicStorageBuffersPerPipelineLayout = 4;
  GPUSize32 maxSampledTexturesPerShaderStage = 16;
  GPUSize32 maxSamplersPerShaderStage = 16;
  GPUSize32 maxStorageBuffersPerShaderStage = 4;
  GPUSize32 maxStorageTexturesPerShaderStage = 4;
  GPUSize32 maxUniformBuffersPerShaderStage = 12;
  GPUSize32 maxUniformBufferBindingSize = 16384;
};

struct GPUDeviceDescriptor {
  USVString label;
  WebIdlNapi::sequence<GPUExtensionName> extensions;
  GPULimits limits;
};

struct GPUAdapter {
  static WebIdlNapi::Promise<GPUDevice> requestDevice(const GPUDeviceDescriptor& descriptor);
};

class GPU {
 public:
  static WebIdlNapi::Promise<GPUAdapter> requestAdapter(const GPURequestAdapterOptions& options);
};

struct Navigator {
  GPU gpu;
};

struct WorkerNavigator {
  GPU gpu;
};

#endif  // WEBIDL_NAPI_TEST_WEBGPU_WEBGPU_IMPL_H
