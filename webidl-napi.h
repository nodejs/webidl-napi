#ifndef WEBIDL_NAPI_H
#define WEBIDL_NAPI_H

#include <string.h>
#include <string>
#include <map>
#include <memory>
#include <vector>

// TODO(gabrielschulhof): Once we no longer support Node.js 10, we can
// unconditionally switch to the js_native_api.h header.
#define NAPI_EXPERIMENTAL
#if defined(BUILDING_NODE_EXTENSION)
#include "node_api.h"
#else
#include "js_native_api.h"
#endif

// Empty value so that macros here are able to return NULL or void
#define NAPI_RETVAL_NOTHING  // Intentionally blank #define

// A line that looks like a stack frame from a JS exception
#define SOURCE_LOCATION                                        \
  (std::string("\n    at ") + std::string(__func__) +          \
   std::string(" (" __FILE__ ":") + std::to_string(__LINE__) + \
   std::string(")"))

#define GET_AND_THROW_LAST_ERROR(env)                                    \
  do {                                                                   \
    const napi_extended_error_info *error_info;                          \
    napi_get_last_error_info((env), &error_info);                        \
    bool is_pending;                                                     \
    napi_is_exception_pending((env), &is_pending);                       \
    /* If an exception is already pending, don't rethrow it */           \
    if (!is_pending) {                                                   \
      const char* error_message = error_info->error_message != NULL ?    \
        error_info->error_message :                                      \
        "empty error message";                                           \
      napi_throw_error((env), NULL, (std::string(error_message) +        \
          SOURCE_LOCATION).c_str());                                     \
    }                                                                    \
  } while (0)

#define NAPI_CALL_BASE(env, the_call, ret_val)                           \
  do {                                                                   \
    if ((the_call) != napi_ok) {                                         \
      GET_AND_THROW_LAST_ERROR((env));                                   \
      return ret_val;                                                    \
    }                                                                    \
  } while (0)

// Returns NULL if the_call doesn't return napi_ok.
#define NAPI_CALL(env, the_call)                                         \
  NAPI_CALL_BASE(env, the_call, NULL)

// Returns empty if the_call doesn't return napi_ok.
#define NAPI_CALL_RETURN_VOID(env, the_call)                             \
  NAPI_CALL_BASE(env, the_call, NAPI_RETVAL_NOTHING)

struct webidl_sig {
  bool candidate;
  std::vector<napi_valuetype> sig;
};

using DOMString = std::string;
using USVString = std::string;
using object = napi_value;
using bool_t = bool;

namespace WebIdlNapi {

static napi_status
PickSignature(napi_env env,
              size_t argc,
              napi_value* argv,
              std::vector<webidl_sig> sigs,
              int* sig_idx);

static napi_status IsConstructCall(napi_env env,
                                   napi_callback_info info,
                                   const char* ifname,
                                   bool* result);

template <typename T>
static void ObjectWrapDestructor(napi_env env, void* data, void* hint);

template <typename T>
class Converter {
 public:
  static napi_status ToNative(napi_env env,
                              napi_value value,
                              T* result);
  static napi_status ToJS(napi_env env,
                          const T& value,
                          napi_value* result);
};

template <typename T>
class Promise {
 public:
  static napi_status ToJS(napi_env env,
                          const Promise<T>& promise,
                          napi_value* val);
  static napi_status ToNative(napi_env env,
                              napi_value value,
                              Promise<T>* promise);
};

template <typename T>
class sequence {
 public:
  static napi_status
  ToJS(napi_env env, const sequence<T>& seq, napi_value* val);
  static napi_status
  ToNative(napi_env env, napi_value val, sequence<T>* result);
};

class InstanceData {
 public:
  static napi_status GetCurrent(napi_env env, InstanceData** result);
  void AddConstructor(const char* name, napi_ref ctor);
  napi_ref GetConstructor(const char* name);
  void SetData(void* data, napi_finalize fin_cb, void* hint);
  void* GetData();
 private:
  static void DestroyInstanceData(napi_env env, void* raw, void* hint);
  void Destroy(napi_env env);
  std::map<const char*, napi_ref> ctors;
  void* data = nullptr;
  void* hint = nullptr;
  napi_finalize cb = nullptr;
};

}  // end of namespace WebIdlNapi

#include "webidl-napi-inl.h"

#endif  // WEBIDL_NAPI_H
