#include <stdio.h>
#include "js_native_api.h"
#include "example-impl.h"

std::string WebIDLCompiler::compile(const std::string& string) {
  fprintf(stderr, "WebIDLCompiler::compile(\"%s\");\n", string.c_str());
  return std::string("compile a string");
}

std::string WebIDLCompiler::compile(napi_value dataTree) {
  fprintf(stderr, "WebIDLCompiler::compile(%p);\n", dataTree);
  return std::string("compile an object");
}

napi_value WebIDL::parse() {
  fprintf(stderr, "WebIDL::parse()\n");
  return nullptr;
}
