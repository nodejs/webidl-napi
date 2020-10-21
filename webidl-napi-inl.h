#ifndef WEBIDL_NAPI_INL_H
#define WEBIDL_NAPI_INL_H

#include "webidl-napi.h"

template <>
inline napi_status
WebIdlNapi::Converter<uint32_t>::ToNative(napi_env env,
                                          napi_value value,
                                          uint32_t* result) {
  return napi_get_value_uint32(env, value, result);
}

template <>
inline napi_status
WebIdlNapi::Converter<uint32_t>::ToJS(napi_env env,
                                      const uint32_t& value,
                                      napi_value* result) {
  return napi_create_uint32(env, value, result);
}

template <>
inline napi_status
WebIdlNapi::Converter<int32_t>::ToNative(napi_env env,
                                         napi_value value,
                                         int32_t* result) {
  return napi_get_value_int32(env, value, result);
}

template <>
inline napi_status
WebIdlNapi::Converter<int32_t>::ToJS(napi_env env,
                                     const int32_t& value,
                                     napi_value* result) {
  return napi_create_int32(env, value, result);
}

template <>
inline napi_status
WebIdlNapi::Converter<int64_t>::ToNative(napi_env env,
                                         napi_value value,
                                         int64_t* result) {
  return napi_get_value_int64(env, value, result);
}

template <>
inline napi_status
WebIdlNapi::Converter<int64_t>::ToJS(napi_env env,
                                     const int64_t& value,
                                     napi_value* result) {
  return napi_create_int64(env, value, result);
}

template <>
inline napi_status
WebIdlNapi::Converter<double>::ToNative(napi_env env,
                                        napi_value value,
                                        double* result) {
  return napi_get_value_double(env, value, result);
}

template <>
inline napi_status
WebIdlNapi::Converter<double>::ToJS(napi_env env,
                                    const double& value,
                                    napi_value* result) {
  return napi_create_double(env, value, result);
}

// TODO(gabrielschulhof): DOMString should be utf16, not utf8.
template <>
inline napi_status
WebIdlNapi::Converter<DOMString>::ToNative(napi_env env,
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
WebIdlNapi::Converter<DOMString>::ToJS(napi_env env,
                                       const DOMString& str,
                                       napi_value* result) {
  return napi_create_string_utf8(env, str.c_str(), str.size(), result);
}

template <>
inline napi_status
WebIdlNapi::Converter<object>::ToNative(napi_env env,
                                        napi_value val,
                                        object* result) {
  *result = static_cast<object>(val);
  return napi_ok;
}

template <>
inline napi_status
WebIdlNapi::Converter<object>::ToJS(napi_env env,
                                    const object& val,
                                    napi_value* result) {
  *result = static_cast<napi_value>(val);
  return napi_ok;
}
#endif  // WEBIDL_NAPI_INL_H
