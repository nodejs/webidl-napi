#include <node_api.h>

napi_value webgpu_init(napi_env env);

NAPI_MODULE_INIT() {
  return webgpu_init(env);
}
