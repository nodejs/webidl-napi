#ifndef WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H
#define WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H

#include "webidl-napi.h"

typedef struct value__* Value;
class Incrementor;

struct Properties {
  DOMString name;
  unsigned long count;
};

class Decrementor {
 public:
  void operator=(const Decrementor& other);
  Decrementor();
  Decrementor(const Incrementor& inc);
  ~Decrementor();
  unsigned long decrement();
 private:
  Value val = nullptr;
};

class Incrementor {
 public:
  explicit Incrementor();
  Incrementor(unsigned long initial);
  Incrementor(DOMString initial);
  unsigned long increment();

  Properties props;
  Properties settableProps;

  Decrementor getDecrementor();
  friend class Decrementor;
  ~Incrementor();
 private:
  Value val;
};

#endif  // WEBIDL_NAPI_TEST_WEBIDL2_EXAMPLE_EXAMPLE_IMPL_H
