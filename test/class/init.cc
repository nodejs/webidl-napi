#include <node_api.h>

napi_value class_init(napi_env env);

NAPI_MODULE_INIT() { return class_init(env); }
