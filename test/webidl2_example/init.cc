#include <node_api.h>

napi_value example_init(napi_env env);

NAPI_MODULE_INIT() { return example_init(env); }
