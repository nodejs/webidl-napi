#include <stdio.h>
#include "class-impl.h"

JSClassExample::JSClassExample() {}

JSClassExample::JSClassExample(unsigned long initial): value(initial) {}

JSClassExample::JSClassExample(DOMString initial):
    value(std::stoul(initial)) {}

unsigned long JSClassExample::increment() { return ++value; }
