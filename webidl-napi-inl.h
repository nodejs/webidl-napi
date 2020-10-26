#ifndef WEBIDL_NAPI_INL_H
#define WEBIDL_NAPI_INL_H

#include "webidl-napi.h"

namespace WebIdlNapi {

template <>
inline napi_status
Converter<uint32_t>::ToNative(napi_env env,
                              napi_value value,
                              uint32_t* result) {
  return napi_get_value_uint32(env, value, result);
}

template <>
inline napi_status
Converter<uint32_t>::ToJS(napi_env env,
                          const uint32_t& value,
                          napi_value* result) {
  return napi_create_uint32(env, value, result);
}

template <>
inline napi_status
Converter<int32_t>::ToNative(napi_env env,
                             napi_value value,
                             int32_t* result) {
  return napi_get_value_int32(env, value, result);
}

template <>
inline napi_status
Converter<int32_t>::ToJS(napi_env env,
                         const int32_t& value,
                         napi_value* result) {
  return napi_create_int32(env, value, result);
}

template <>
inline napi_status
Converter<int64_t>::ToNative(napi_env env,
                             napi_value value,
                             int64_t* result) {
  return napi_get_value_int64(env, value, result);
}

template <>
inline napi_status
Converter<int64_t>::ToJS(napi_env env,
                         const int64_t& value,
                         napi_value* result) {
  return napi_create_int64(env, value, result);
}

template <>
inline napi_status
Converter<double>::ToNative(napi_env env,
                            napi_value value,
                            double* result) {
  return napi_get_value_double(env, value, result);
}

template <>
inline napi_status
Converter<double>::ToJS(napi_env env,
                        const double& value,
                        napi_value* result) {
  return napi_create_double(env, value, result);
}

// TODO(gabrielschulhof): DOMString should be utf16, not utf8.
template <>
inline napi_status
Converter<DOMString>::ToNative(napi_env env,
                               napi_value str,
                               DOMString* result) {
  size_t size;

  napi_status status = napi_get_value_string_utf8(env, str, nullptr, 0, &size);
  if (status != napi_ok) return status;

  result->resize(size + 1);
  status = napi_get_value_string_utf8(env, str,
                                      const_cast<char*>(result->c_str()),
                                      size + 1, &size);
  if (status != napi_ok) return status;

  return napi_ok;
}

template <>
inline napi_status
Converter<DOMString>::ToJS(napi_env env,
                           const DOMString& str,
                           napi_value* result) {
  return napi_create_string_utf8(env, str.c_str(), str.size(), result);
}

template <>
inline napi_status
Converter<object>::ToNative(napi_env env,
                            napi_value val,
                            object* result) {
  *result = static_cast<object>(val);
  return napi_ok;
}

template <>
inline napi_status
Converter<object>::ToJS(napi_env env, const object& val, napi_value* result) {
  *result = static_cast<napi_value>(val);
  return napi_ok;
}

template <>
inline napi_status
Converter<unsigned long>::ToNative(napi_env env,
                                   napi_value val,
                                   unsigned long* result) {
  int64_t from_js;
  napi_status status = Converter<int64_t>::ToNative(env, val, &from_js);
  if (status == napi_ok) *result = static_cast<unsigned long>(from_js);
  return status;
}

template <>
inline napi_status
Converter<unsigned long>::ToJS(napi_env env,
                               const unsigned long& val,
                                   napi_value* result) {
  int64_t to_js = static_cast<int64_t>(val);
  return Converter<int64_t>::ToJS(env, to_js, result);
}

inline napi_status IsConstructCall(napi_env env,
                                   napi_callback_info info,
                                   const char* ifname,
                                   bool* result) {
  napi_value new_target;
  bool res = true;
  napi_status status = napi_get_new_target(env, info, &new_target);
  if (status != napi_ok) return status;

  if (new_target == nullptr) {
    status = napi_throw_error(env,
                              nullptr,
                              (std::string("Non-construct calls to the `") +
                                  ifname + "` constructor are not supported.")
                                  .c_str());
    if (status != napi_ok) return status;
    res = false;
  }

  *result = res;
  return status;
}

template <typename T>
static void ObjectWrapDestructor(napi_env env, void* data, void* hint) {
  (void) env;
  (void) hint;
  delete reinterpret_cast<T*>(data);
}

inline napi_status PickSignature(napi_env env,
                                 size_t argc,
                                 napi_value* argv,
                                 std::vector<webidl_sig> sigs,
                                 int* sig_idx) {
  // Advance through the signatures one argument type at a time and mark those
  // as non-candidates whose signature does not correspond to the sequence of
  // argument types found in the actual arguments.
  for (size_t idx = 0; idx < argc; idx++) {
    napi_valuetype val_type;
    napi_status status = napi_typeof(env, argv[idx], &val_type);
    if (status != napi_ok) return status;
    for (auto& sig: sigs)
      if (sig.candidate)
        if (idx >= sig.sig.size() || sig.sig[idx] != val_type)
          sig.candidate = false;
  }

  // If any signatures are left marked as candidates, return the first one. We
  // do not touch `sig_idx` if we do not find a candidate, so the caller can set
  // it to -1 to be informed after this call completes that no candidate was
  // found.
  for (size_t idx = 0; idx < sigs.size(); idx++)
    if (sigs[idx].candidate) {
      *sig_idx = idx;
      break;
    }

  return napi_ok;
}

template <typename T>
inline napi_status Promise<T>::ToJS(napi_env env,
                                    const Promise<T>& promise,
                                    napi_value* result) {
  return napi_ok;
}

template <typename T>
inline napi_status Promise<T>::ToNative(napi_env env,
                                        napi_value promise,
                                        Promise<T>* result) {
  return napi_ok;
}

template <typename T>
inline napi_status sequence<T>::ToJS(napi_env env,
                                     const sequence<T>& seq,
                                     napi_value* result) {
  return napi_ok;
}


template <typename T>
inline napi_status sequence<T>::ToNative(napi_env env,
                                         napi_value val,
                                         sequence<T>* result) {
  return napi_ok;
}

}  // end of namespace WebIdlNapi
#endif  // WEBIDL_NAPI_INL_H
