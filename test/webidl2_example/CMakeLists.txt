cmake_minimum_required(VERSION 3.9)
cmake_policy(SET CMP0042 NEW)
set (CMAKE_CXX_STANDARD 11)

project(example)
include_directories(${CMAKE_JS_INC})
add_library(${PROJECT_NAME} SHARED "example-impl.cc" "init.cc" ${CMAKE_CURRENT_BINARY_DIR}/example.cc ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})
execute_process(
  COMMAND node -p "require('bindings').getRoot('');"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE REPO_ROOT
)
string(REPLACE "\n" "" REPO_ROOT ${REPO_ROOT})
add_custom_command(
    COMMAND node ${REPO_ROOT}/index.js -i example-impl.h -n node_api.h -o ${CMAKE_CURRENT_BINARY_DIR}/example.cc ${CMAKE_CURRENT_SOURCE_DIR}/example.idl
    DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/example.idl ${REPO_ROOT}/index.js
    OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/example.cc
    COMMENT "Generating code for example.idl."
)
target_include_directories(${PROJECT_NAME} PRIVATE ${REPO_ROOT} ${CMAKE_CURRENT_SOURCE_DIR})
add_definitions(-DBUILDING_NODE_EXTENSION)
