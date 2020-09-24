#include <stdio.h>
#include "js_native_api.h"
#include "example-impl.h"

napi_value WebIDLCompiler::compile(const char* string) {
  fprintf(stderr, "WebIDLCompiler::compile(\"%s\");\n", string);
  return nullptr;
}

napi_value WebIDLCompiler::compile(napi_value dataTree) {
  fprintf(stderr, "WebIDLCompiler::compile(%p);\n", dataTree);
  return nullptr;
}

napi_value WebIDL::parse() {
  fprintf(stderr, "WebIDL::parse()\n");
  return nullptr;
}
