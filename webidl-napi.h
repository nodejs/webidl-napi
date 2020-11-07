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
  void Resolve(const T& resolution);
  void Reject();
  void Conclude();
  napi_status Conclude(napi_env env);
 private:
  enum State {
    kPending, kResolved, kRejected
  };
  State state = kPending;
  T resolution;
  napi_env env = nullptr;
  napi_value promise = nullptr;
  napi_deferred deferred = nullptr;
};

template <typename T>
class Converter<Promise<T>> {
 public:
  static napi_status
  ToJS(napi_env env, const Promise<T>& promise, napi_value* result);

  static napi_status
  ToNative(napi_env env, napi_value val, Promise<T>* result);
};

template <typename T>
class sequence : public std::vector<T> {
 public:
  static napi_status
  ToJS(napi_env env, const sequence<T>& seq, napi_value* val);
  static napi_status
  ToNative(napi_env env, napi_value val, sequence<T>* result);
};

template <typename T>
class Converter<sequence<T>> {
 public:
  static napi_status
  ToJS(napi_env env, const sequence<T>& seq, napi_value* result);
  static napi_status
  ToNative(napi_env env, napi_value val, sequence<T>* result);
};

template <typename T>
class FrozenArray : public std::vector<T> {
 public:
  FrozenArray(std::initializer_list<T> lst);
  static napi_status
  ToJS(napi_env env, const FrozenArray<T>& seq, napi_value* result);
  static napi_status
  ToNative(napi_env env, napi_value val, FrozenArray<T>* result);
};

template <typename T>
class Converter<FrozenArray<T>> {
 public:
  static napi_status
  ToJS(napi_env env, const FrozenArray<T>& seq, napi_value* result);
  static napi_status
  ToNative(napi_env env, napi_value val, FrozenArray<T>* result);
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

template <typename T>
class Wrapping {
 public:
  static napi_status Create(napi_env env,
                            napi_value js_rcv,
                            T* cc_rcv,
                            size_t same_obj_count = 0);
  static napi_status Retrieve(napi_env env,
                              napi_value js_rcv,
                              T** cc_rcv,
                              int ref_idx = -1,
                              napi_value* ref = nullptr,
                              Wrapping<T>** wrapping = nullptr);
  template <typename FieldType,
            FieldType T::*FieldName,
            napi_property_attributes attributes,
            int sameObjId,
            bool readonly>
  static napi_property_descriptor InstanceAccessor(const char* utf8name);

  napi_status SetRef(napi_env env, int idx, napi_value same_obj);
 private:
  static void Destroy(napi_env env, void* data, void* hint);
  T* native = nullptr;
  std::vector<napi_ref> refs;

  template <typename FieldType, FieldType T::*FieldName, int sameIdx>
  static napi_value InstanceGetter(napi_env env, napi_callback_info info);

  template <typename FieldType, FieldType T::*FieldName>
  static napi_value InstanceSetter(napi_env env, napi_callback_info info);
};

}  // end of namespace WebIdlNapi

#include "webidl-napi-inl.h"

#endif  // WEBIDL_NAPI_H
