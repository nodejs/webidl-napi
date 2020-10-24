#include <stdio.h>
#include "promise-impl.h"

Promise<FulfillsPromise>
ReturnsPromise::requestPromise(DOMString name) {
  FulfillsPromise result{name};
  Promise<FulfillsPromise> promise;
  promise.Resolve(result);
  return promise;
}
