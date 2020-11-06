#include "class-impl.h"

struct value__ {
  value__(unsigned long initial): val(initial) {}
  unsigned long val = 0;
  size_t refcount = 1;
  inline void Ref() { refcount++; }
  inline void Unref() {
    if (refcount == 0) abort();
    if (--refcount == 0) delete this;
  }
};

void Decrementor::operator=(const Decrementor& other) {
  val = other.val;
  val->Ref();
}

Decrementor::Decrementor() {}

Decrementor::Decrementor(const Incrementor& inc) {
  val = inc.val;
  val->Ref();
}

Decrementor::~Decrementor() { val->Unref(); }

unsigned long Decrementor::decrement() { return --(val->val); }

Incrementor::Incrementor(): Incrementor(0) {}

Incrementor::Incrementor(DOMString initial_value)
    : Incrementor(std::stoul(initial_value)) {}

Incrementor::Incrementor(unsigned long initial_value): props{"blah", 42} {
  val = new value__(initial_value);
  val->val = initial_value;
}

unsigned long Incrementor::increment() { return ++(val->val); }

Decrementor Incrementor::getDecrementor() { return Decrementor(*this); }

Incrementor::~Incrementor() { val->Unref(); }
