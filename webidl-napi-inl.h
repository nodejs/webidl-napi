#ifndef WEBIDL_NAPI_INL_H
#define WEBIDL_NAPI_INL_H

#include "webidl-napi.h"

namespace WebIdlNapi {

namespace details {

template <typename ArrayType, typename T, bool freeze>
static inline napi_status
ArrayToJS(napi_env env, const ArrayType& ar, napi_value* result) {
  napi_status status;
  napi_escapable_handle_scope scope;
  napi_value res;

  // TODO(gabrielschulhof): Once `napi_freeze_object` becomes available in all
  // versions of N-API at least under experimental, we can start using this
  // template param.
  (void) freeze;

  status = napi_open_escapable_handle_scope(env, &scope);
  if (status != napi_ok) return status;

  status = napi_create_array(env, &res);
  if (status != napi_ok) goto fail;

  for (int idx = 0; idx < ar.size(); idx++) {
    napi_value member;

    T item = ar.at(idx);
    status = Converter<T>::ToJS(env, item, &member);
    if (status != napi_ok) goto fail;

    status = napi_set_element(env, res, idx, member);
    if (status != napi_ok) goto fail;
  }

  status = napi_escape_handle(env, scope, res, &res);
  if (status != napi_ok) goto fail;

  status = napi_close_escapable_handle_scope(env, scope);
  if (status != napi_ok) goto fail;

  *result = res;
  return napi_ok;
fail:
  napi_close_escapable_handle_scope(env, scope);
  return status;
}

template <typename ArrayType, typename T>
static inline napi_status
ArrayToNative(napi_env env, napi_value ar, ArrayType* result) {
  napi_status status;
  napi_handle_scope scope;
  ArrayType res{};
  uint32_t size;

  status = napi_open_handle_scope(env, &scope);
  if (status != napi_ok) return status;

  status = napi_get_array_length(env, ar, &size);
  if (status != napi_ok) return status;

  res.resize(size);

  for (int idx = 0; idx < size; idx++) {
    napi_value member;

    status = napi_get_element(env, ar, idx, &member);
    if (status != napi_ok) goto fail;

    status = Converter<T>::ToNative(env, member, &(res.at(idx)));
    if (status != napi_ok) goto fail;
  }

  status = napi_close_handle_scope(env, scope);
  if (status != napi_ok) goto fail;

  *result = res;
  return napi_ok;
fail:
  napi_close_handle_scope(env, scope);
  return status;
}

}  // end of namespace details

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
  return napi_create_string_utf8(env, str.c_str(), NAPI_AUTO_LENGTH, result);
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
inline void Promise<T>::Resolve(const T& result) {
  if (state != kPending) return;
  resolution = result;
  state = kResolved;
  Conclude();
}

template <typename T>
inline void Promise<T>::Reject() {
  if (state != kPending) return;
  state = kRejected;
  Conclude();
}

template <typename T>
inline void Promise<T>::Conclude() {
  if (env) NAPI_CALL_RETURN_VOID(env, Conclude(env));
}

template <typename T>
napi_status Promise<T>::Conclude(napi_env candidate_env) {
  napi_status status;
  env = (env == nullptr ? candidate_env : env);

  if (env == nullptr) return napi_ok;

  if (deferred == nullptr) {
    status = napi_create_promise(env, &deferred, &promise);
    if (status != napi_ok) return status;
  }

  if (state == kResolved) {
    napi_value js_resolution;

    status = Converter<T>::ToJS(env,
                                const_cast<const T&>(resolution),
                                &js_resolution);
    if (status != napi_ok) return status;

    status = napi_resolve_deferred(env, deferred, js_resolution);
    if (status != napi_ok) return status;
  } else if (state == kRejected) {
    napi_value error, message;

    status = napi_create_string_utf8(env,
                                     "Promise rejected",
                                     NAPI_AUTO_LENGTH,
                                     &message);
    if (status != napi_ok) return status;

    status = napi_create_error(env, nullptr, message, &error);
    if (status != napi_ok) return status;

    status = napi_reject_deferred(env, deferred, error);
    if (status != napi_ok) return status;
  }

  return napi_ok;
}

template <typename T>
inline napi_status Promise<T>::ToJS(napi_env env,
                                    const Promise<T>& promise,
                                    napi_value* result) {
  *result = promise.promise;
  return napi_ok;
}

template <typename T>
inline napi_status Converter<Promise<T>>::ToJS(napi_env env,
                                               const Promise<T>& promise,
                                               napi_value* result) {
  return Promise<T>::ToJS(env, promise, result);
}

template <typename T>
inline napi_status Converter<Promise<T>>::ToNative(napi_env env,
                                                   napi_value val,
                                                   Promise<T>* result) {
  return Promise<T>::ToJS(env, val, result);
}

template <typename T>
inline napi_status
sequence<T>::ToJS(napi_env env, const sequence<T>& seq, napi_value* result) {
  return details::ArrayToJS<sequence<T>, T, false>(env, seq, result);
}

template <typename T>
inline napi_status
sequence<T>::ToNative(napi_env env, napi_value val, sequence<T>* result) {
  return details::ArrayToNative<sequence<T>, T>(env, val, result);
}

template <typename T>
inline napi_status
Converter<sequence<T>>::ToJS(napi_env env,
                             const sequence<T>& val,
                             napi_value* result) {
  return sequence<T>::ToJS(env, val, result);
}

template <typename T>
inline napi_status
Converter<sequence<T>>::ToNative(napi_env env,
                                 napi_value val,
                                 sequence<T>* result) {
  return sequence<T>::ToNative(env, val, result);
}

template <typename T>
inline FrozenArray<T>::FrozenArray(std::initializer_list<T> lst):
    std::vector<T>(lst) {}

template <typename T>
inline napi_status
FrozenArray<T>::ToJS(napi_env env, const FrozenArray<T>& seq, napi_value* result) {
  return details::ArrayToJS<FrozenArray<T>, T, true>(env, seq, result);
}

template <typename T>
inline napi_status
FrozenArray<T>::ToNative(napi_env env, napi_value val, FrozenArray<T>* result) {
  return details::ArrayToNative<FrozenArray<T>, T>(env, val, result);
}

template <typename T>
inline napi_status
Converter<FrozenArray<T>>::ToJS(napi_env env,
                                const FrozenArray<T>& val,
                                napi_value* result) {
  return FrozenArray<T>::ToJS(env, val, result);
}

template <typename T>
inline napi_status
Converter<FrozenArray<T>>::ToNative(napi_env env,
                                    napi_value val,
                                    FrozenArray<T>* result) {
  return FrozenArray<T>::ToNative(env, val, result);
}

// We assume that we are in control of the instance data for this add-on. Even
// so, we also assume that there may be multiple generated files bundled into
// this add-on, each of which uses `InstanceData` to manage its state. Thus,
// if no data is set, we set a new instance, and if one is already set, we
// assume it's an instance of `InstanceData` and use that.
// static
inline napi_status
InstanceData::GetCurrent(napi_env env, InstanceData** result) {
  void* data = nullptr;

  napi_status status = napi_get_instance_data(env, &data);
  if (status != napi_ok) return status;

  if (data == nullptr) {
    InstanceData* new_data = new InstanceData;

    data = static_cast<void*>(new_data);
    status = napi_set_instance_data(env, data, DestroyInstanceData, nullptr);
    if (status != napi_ok) {
      delete new_data;
      return status;
    }
  }

  *result = static_cast<InstanceData*>(data);
  return napi_ok;
}

inline void InstanceData::AddConstructor(const char* name, napi_ref ctor) {
  ctors[name] = ctor;
}

inline void
InstanceData::SetData(void* new_data, napi_finalize fin_cb, void* new_hint) {
  data = new_data;
  cb = fin_cb;
  hint = new_hint;
}

inline void* InstanceData::GetData() {
  return data;
}

// static
inline void
InstanceData::DestroyInstanceData(napi_env env, void* data, void* hint) {
  (void) hint;
  static_cast<InstanceData*>(data)->Destroy(env);
}

inline void InstanceData::Destroy(napi_env env) {
  for (std::pair<const char*, napi_ref> ctor: ctors) {
    NAPI_CALL_RETURN_VOID(env, napi_delete_reference(env, ctor.second));
  }

  if (data != nullptr && cb != nullptr) cb(env, data, hint);
}

inline napi_ref InstanceData::GetConstructor(const char* name) {
  return ctors[name];
}

// static
template <typename T>
napi_status Wrapping<T>::Create(napi_env env,
                                napi_value js_rcv,
                                T* cc_rcv,
                                size_t same_obj_count) {
  Wrapping<T>* wrapping = new Wrapping<T>;
  wrapping->native = cc_rcv;
  if (same_obj_count > 0)
    wrapping->refs.resize(same_obj_count, nullptr);
  return napi_wrap(env, js_rcv, wrapping, Destroy, nullptr, nullptr);
}

// static
template <typename T>
napi_status Wrapping<T>::Retrieve(napi_env env,
                                  napi_value js_rcv,
                                  T** cc_rcv,
                                  int ref_idx,
                                  napi_value* ref,
                                  Wrapping<T>** get_wrapping) {
  void* data = nullptr;

  napi_status status = napi_unwrap(env, js_rcv, &data);
  if (status != napi_ok) return status;

  Wrapping<T>*wrapping = static_cast<Wrapping<T>*>(data);

  if (ref_idx >= 0 &&
      ref_idx < wrapping->refs.size() &&
      wrapping->refs[ref_idx] != nullptr) {
    napi_value ref_value = nullptr;

    status = napi_get_reference_value(env, wrapping->refs[ref_idx], &ref_value);
    if (status != napi_ok) return status;

    if (ref != nullptr) *ref = ref_value;
  }

  if (get_wrapping != nullptr) *get_wrapping = wrapping;
  *cc_rcv = wrapping->native;
  return napi_ok;
}

template <typename T>
inline napi_status
Wrapping<T>::SetRef(napi_env env, int idx, napi_value same_obj) {
  napi_ref ref;

  napi_status status = napi_create_reference(env, same_obj, 1, &ref);
  if (status != napi_ok) return status;

  refs[idx] = ref;
  return napi_ok;
}

// static
template <typename T>
void Wrapping<T>::Destroy(napi_env env, void* data, void* hint) {
  (void) hint;
  Wrapping<T>* wrapping = static_cast<Wrapping<T>*>(data);

  for (napi_ref ref: wrapping->refs)
    if (ref != nullptr)
      NAPI_CALL_RETURN_VOID(env, napi_delete_reference(env, ref));
  delete wrapping->native;
  delete wrapping;
}

template <typename T>
template <typename FieldType,
          FieldType T::*FieldName,
          napi_property_attributes attributes,
          int sameObjId,
          bool readonly>
napi_property_descriptor Wrapping<T>::InstanceAccessor(const char* utf8name) {
  napi_property_descriptor desc = napi_property_descriptor();

  desc.utf8name = utf8name;
  desc.getter = &Wrapping<T>::InstanceGetter<FieldType, FieldName, sameObjId>;
  if (!readonly)
    desc.setter = &Wrapping<T>::InstanceSetter<FieldType, FieldName>;
  desc.attributes = attributes;

  return desc;
}

template <typename T>
template <typename FieldType, FieldType T::*FieldName, int sameIdx>
napi_value Wrapping<T>::InstanceGetter(napi_env env, napi_callback_info info) {
  napi_value js_rcv;
  napi_value result = nullptr;
  Wrapping<T>* wrapping;
  T* cc_rcv;

  NAPI_CALL(env,
            napi_get_cb_info(env, info, nullptr, nullptr, &js_rcv, nullptr));

  if (sameIdx >= 0) {
    NAPI_CALL(env, Wrapping<T>::Retrieve(env,
                                         js_rcv,
                                         &cc_rcv,
                                         sameIdx,
                                         &result,
                                         &wrapping));
    if (result != nullptr) return result;
  } else {
    NAPI_CALL(env, Wrapping<T>::Retrieve(env, js_rcv, &cc_rcv));
  }

  NAPI_CALL(env, Converter<FieldType>::ToJS(env, cc_rcv->*FieldName, &result));

  if (sameIdx >= 0) NAPI_CALL(env, wrapping->SetRef(env, sameIdx, result));

  return result;
}

template <typename T>
template <typename FieldType, FieldType T::*FieldName>
napi_value Wrapping<T>::InstanceSetter(napi_env env, napi_callback_info info) {
  napi_value js_rcv;
  napi_value js_new;
  size_t argc = 1;
  T* cc_rcv;

  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, &js_new, &js_rcv, nullptr));
  NAPI_CALL(env, Wrapping<T>::Retrieve(env, js_rcv, &cc_rcv));
  NAPI_CALL(env,
            Converter<FieldType>::ToNative(env, js_new, &(cc_rcv->*FieldName)));

  return nullptr;
}

}  // end of namespace WebIdlNapi
#endif  // WEBIDL_NAPI_INL_H
