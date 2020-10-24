#include <node_api.h>

napi_value promise_init(napi_env env);

NAPI_MODULE_INIT() { return promise_init(env); }
