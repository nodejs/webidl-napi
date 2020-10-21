#!/usr/bin/env node
'use strict';

const yargs = require('yargs');
const argv = yargs
  .help('h')
  .alias('h', 'help')
  .usage('Usage: $0 [options] filename.idl')
  .describe('I', 'print include directory and exit')
  .describe('i', 'add #include after js_native_api.h')
  .nargs('i', 1)
  .describe('n', 'N-API include file')
  .default('n', 'js_native_api.h')
  .nargs('o', 1)
  .describe('o', 'output file')
  .argv;

if (argv._.length === 0) {
  yargs.showHelp();
  process.exit(1);
}

if (argv.I) {
  console.log(__dirname);
  process.exit(0);
}

const { parse } = require('webidl2');
const fs = require('fs');
const path = require('path');

// Typemap for validating incoming JS parameters.
const typemapWebIDLToNAPI = {
  // boolean
  'boolean': 'napi_boolean',

  // number
  'byte': 'napi_number',
  'octet': 'napi_number',
  'short': 'napi_number',
  'unsigned short': 'napi_number',
  'long': 'napi_number',
  'unsigned long': 'napi_number',
  'long long': 'napi_number',
  'unsigned long long': 'napi_number',
  'float': 'napi_number',
  'unrestricted float': 'napi_number',
  'double': 'napi_number',
  'unrestricted double': 'napi_number',

  // string
  'DOMString': 'napi_string',
  'ByteString': 'napi_string',
  'USVString': 'napi_string',

  // object
  'object': 'napi_object'
};

function generateNativeType(idlType) {
  return ((typeof idlType.idlType === 'string')
    ? idlType.idlType
    : `${idlType.generic}<${idlType.idlType[0].idlType}>`);
}

function generateConversionToJS(retType, source, destination, indent) {
  // If it's a templated type, like `Promise<Something>`, use :: for the
  // converter.
  const connector = ((typeof retType.idlType === 'object' && !!retType.generic)
    ? '::'
    : '_');
  return [
    `${generateNativeType(retType)}${connector}toJS(`,
    `    env,`,
    `    ${source},`,
    `    ${destination})`
  ]
  .map((item) => (indent + item))
  .join('\n');
}

function generateInitializerList(list, indent) {
  indent = indent || '';
  return (Array.isArray(list)
    ? [
      indent + '{',
      list.map((item) => generateInitializerList(item, indent + '  ')).join(',\n'),
      indent + '}'
    ].join('\n')
    : indent + list);
}

function generateEnumMaps(enumDef) {
  const valueMap = enumDef.values.reduce((soFar, item) => Object.assign(soFar, {
    // For the native enum value, if the string is empty, generate `_empty`.
    // Otherwise, the generated value is obtained by uppercasing the first
    // letter and replacing anything that's not an ASCII letter or a number
    // with an underscore.
    [item.value]: (item.value === ''
      ? '_empty'
      : item.value[0].toUpperCase() +
        item.value.slice(1).replace(/[^0-9a-zA-Z]/g, '_'))
  }), {});

  return [
    //
    // The conversion to native
    //
    `static inline napi_status`,
    `${enumDef.name}_toNative(`,
    `    napi_env env,`,
    `    napi_value val,`,
    `    ${enumDef.name}* result) {`,
    `  std::string str_val;`,
    `  napi_status status = DOMString_toNative(env, val, &str_val);`,
    `  if (status != napi_ok) return status;`,
    ``,
    // Generate an if-statement for each possible enum value, and one for the
    // case where the value is not in the list. Join the statements with `else`.
    [
      ...enumDef.values.map((val) => [
        `  if (!strncmp(str_val.c_str(), "${val.value}", str_val.size())) {`,
        `    *result = ${enumDef.name}::${valueMap[val.value]};`,
        `  }`,
      ].join('\n')),
      `    { status = napi_invalid_arg; }`
    ].join('\n  else\n'),
    `  return status;`,
    `}`,
    ``,
    //
    // The conversion to JS
    //
    `static inline napi_status`,
    `${enumDef.name}_toJS(`,
    `    napi_env env,`,
    `    ${enumDef.name} val,`,
    `    napi_value* result) {`,
    `  napi_status status = napi_ok;`,
    ``,
    // Generate an if-statement for each possible enum value, and one for the case
    // where the value is not in the list. Join the statements with `else`.
    [
      ...enumDef.values.map((val) => [
        `  if (val == ${enumDef.name}::${valueMap[val.value]}) {`,
        `    status = napi_create_string_utf8(`,
        `        env,`,
        `        "${val.value}",`,
        `        NAPI_AUTO_LENGTH,`,
        `        result);`,
        `  }`,
      ].join('\n')),
      `    { status = napi_invalid_arg; }`
    ].join('\n  else\n'),
    `  return status;`,
    `}`
  ].join('\n');
}

function generateDictionaryMaps(dict) {
  return [
  `static inline napi_status`,
  `${dict.name}_toNative(`,
  `    napi_env env,`,
  `    napi_value val,`,
  `    ${dict.name}* result) {`,
  `  napi_status status;`,
  ...dict.members.reduce((soFar, member) => soFar.concat([
    `  {`,
    `    napi_value js_member;`,
    `    status = napi_get_named_property(env,`,
    `        val,`,
    `        "${member.name}",`,
    `        &js_member);`,
    `    if (status != napi_ok) return status;`,
    ``,
    `    status = ${member.idlType.idlType}_toNative(`,
    `        env,`,
    `        js_member,`,
    `        &(result->${member.name}));`,
    `    if (status != napi_ok) return status;`,
    `  }`,
  ]), []),
  `  return napi_ok;`,
  `}`,
  ``,
  `static inline napi_status`,
  `${dict.name}_toJS(`,
  `    napi_env env,`,
  `    ${dict.name}* val,`,
  `    napi_value* result) {`,
  `  napi_status status;`,
  `  napi_value ret;`,
  // Declare a `napi_value` `js_prop_0`, `js_prop_1`, ... for each member.
  `  napi_value`,
  `    ${dict.members.map((item, idx) => `js_prop_${idx}`).join(',\n    ')};`,
  ``,
  // Create a statement that converts from the native type of the native member
  // to a `napi_value`, stored in `js_prop_0`, ...
  ...dict.members.reduce((soFar, member, idx) => soFar.concat([
    `  status = ${member.idlType.idlType}_toJS(`,
    `      env,`,
    `      val->${member.name},`,
    `      &js_prop_${idx});`,
    `  if (status != napi_ok) return status;`,
    ``
  ]), []),
  // Create a `napi_property_descriptor` array with a descriptor for each
  // member.
  `  napi_property_descriptor props[] =`,
  generateInitializerList(dict.members.map((member, idx) => [
    `"${member.name}"`,
    `nullptr`,
    `nullptr`,
    `nullptr`,
    `nullptr`,
    `js_prop_${idx}`,
    `napi_enumerable`,
    `nullptr`
  ]), '  ') + ';',
  ``,
  // Create the object that will hold the properties, assign the properties, and
  // return the object by assigning it to `*result`.
  `  status = napi_create_object(`,
  `      env,`,
  `      &ret);`,
  `  if (status != napi_ok) return status;`,
  ``,
  `  status = napi_define_properties(`,
  `      env,`,
  `      ret,`,
  `      sizeof(props) / sizeof(*props),`,
  `      props);`,
  `  if (status != napi_ok) return status;`,
  ``,
  `  *result = ret;`,
  `  return napi_ok;`,
  `}`,
  ].join('\n');
}

// Create an initializer list for signature candidates that will be processed by
// `webidl_napi_pick_signature()`. It may look like this:
// { { true, { napi_number, object } }, { true, { napi_string, napi_object } }
function generateSigCandidates(sigs) {
  return generateInitializerList(
    sigs.map((sig) => [
      true,
      sig.arguments.map((arg) =>
        typemapWebIDLToNAPI[generateNativeType(arg.idlType)])
    ]), '          ');
}

function generateParamRetrieval(sigs, maxArgs) {
  return [
    // We declare variable `sig_idx` only if there are multiple signatures.
    ...(sigs.length > 1 ? [ `  int sig_idx = -1;` ] : []),
    `  napi_value argv[${maxArgs}];`,
    `  size_t argc = ${maxArgs};`,
    `  NAPI_CALL(`,
    `      env,`,
    `      napi_get_cb_info(`,
    `          env,`,
    `          info,`,
    `          &argc,`,
    `          argv,`,
    `          nullptr,`,
    `          nullptr));`,
    // If we have multiple signatures, let's generate the code to figure out
    // which one the JS is trying to call, and then generate the code that
    // assigns the result to `sig_idx`.
    ...(sigs.length > 1 ? [
    `  NAPI_CALL(`,
    `      env,`,
    `      webidl_napi_pick_signature(`,
    `          env,`,
    `          argc,`,
    `          argv,`,
    `${generateSigCandidates(sigs)},`,
    `          &sig_idx));`,
    ] : []),
    // TODO(gabrielschulhof): What if, upon return, argc is greater than maxArgs?
  ].join('\n');
}

function generateCall(ifname, sig, indent) {
  function argToNativeCall(idlType, index, indent) {
    return [
      `NAPI_CALL(`,
      `    env,`,
      `    ${idlType}_toNative(env,`,
      `        argv[${index}],`,
      `        &native_arg_${index}));`,
    ].map((item) => (indent + item));
  }
  return [
    // Convert arguments to native data types. This assumes that the DOM type
    // is a real C++ type and that a function of the name `DOMType_toNative`
    // exists.
    ...sig.arguments.reduce((soFar, arg, index) => soFar.concat([
      `${generateNativeType(arg.idlType)} native_arg_${index};`,
      // If the argument is optional, we check that we have it first.
      ...(arg.optional
        ? [
            `bool have_arg_${index} = false;`,
            `{`,
            `  napi_valuetype val_type;`,
            `  NAPI_CALL(`,
            `      env,`,
            `      napi_typeof(`,
            `          env,`,
            `          argv[${index}],`,
            `          &val_type));`,
            `  have_arg_${index} = (val_type != napi_undefined);`,
            `}`,
            `if (have_arg_${index}) {`,
            ...argToNativeCall(arg.idlType.idlType, index, '  '),
            `}`,
          ]
        : argToNativeCall(arg.idlType.idlType, index, '')),
    ]), []),
    ``,
    // If there's a return value, assign it to a variable.
    ((sig.idlType && sig.idlType.type === 'return-type')
      ? 'ret = '
      : '') + `${ifname}::${sig.name}(` +
        // Generate the arguments: native_arg_0, native_arg_1, ...
        Array.apply(0, Array(sig.arguments.length))
          .map((item, idx) => `native_arg_${idx}`).join(', ') +
      ');',
    ``
  ]
  .map((item) => ((item == '') ? item : (indent + item)))
  .join('\n');
}

function generateIfaceOperation(ifname, opname, sigs) {
  const maxArgs =
    sigs.reduce((soFar, item) => Math.max(soFar, item.arguments.length), 0);
  const retType = sigs[0].idlType;
  const hasReturn = (retType && retType.type === 'return-type');

  return [
    `static napi_value`,
    `webidl_napi_interface_${ifname}_${opname}(`,
    `    napi_env env,`,
    `    napi_callback_info info) {`,
    `  napi_value js_ret = nullptr;`,
    // If we have args, then generate the arg retrieval code, and decide which
    // signature to call.
    ...((maxArgs === 0) ? [] : [ generateParamRetrieval(sigs, maxArgs) ]),
    // If we have a return value, declare the variable that stores the return
    // value from the call to the native function.
    ...(hasReturn ? [ `  ${generateNativeType(retType)} ret;` ] : []),
    ``,
    // If we have multiple signatures we generate calls for each signature and
    // choose at runtime which overload to call via an `if ... else if ...`.
    ...(sigs.length > 1
      ? [ sigs.map((sig, index) => [
          `  if (sig_idx == ${index}) {`,
          generateCall(ifname, sig, '    '),
          '  }'
        ].join('\n')).join('\n  else\n') ]
      : [ generateCall(ifname, sigs[0], '  ') ]),
    // If the op has a return type, compute it and store the resulting
    // `napi_value` in `js_ret`.
    ...(hasReturn ? [
      `  NAPI_CALL(`,
      `      env,`,
      `${generateConversionToJS(retType, 'ret', '&js_ret', '      ')});`,
    ] : []),
    `  return js_ret;`,
    `}`
  ].join('\n');
}

function generateIfaceInit(ifname, ops) {
  return [
    // Generate the constructor for the JS class.
    `static napi_value`,
    `webidl_napi_interface_${ifname}_constructor(`,
    `    napi_env env,`,
    `    napi_callback_info info) {`,
    `  return nullptr;`,
    `}`,
    ``,
    // Generate the init method that defines the JS class.
    `static inline napi_status`,
    `webidl_napi_create_interface_${ifname}(`,
    `    napi_env env,`,
    `    napi_value* result) {`,
    `  napi_property_descriptor props[] =`,
    generateInitializerList(Object
      .keys(ops)
      .map((opname) => ([
        `"${opname}"`,
        `nullptr`,
        `webidl_napi_interface_${ifname}_${opname}`,
        `nullptr`,
        `nullptr`,
        `nullptr`,
        `static_cast<napi_property_attributes>(` + [
          'napi_enumerable',
          // Or in `napi_static` for static methods.
          ...(ops[opname][0].special === 'static' ? [ 'napi_static' ] : [])
        ].join(' | ') + ')',
        `nullptr`
      ])), '    ') + ';',
    '',
    `  return napi_define_class(`,
    `      env,`,
    `      "${ifname}",`,
    `      NAPI_AUTO_LENGTH,`,
    `      webidl_napi_interface_${ifname}_constructor,`,
    `      nullptr,`,
    `      sizeof(props) / sizeof(*props),`,
    `      props,`,
    `      result);`,
    `}`
  ].join('\n');
}

function generateIface(iface) {
  // Convert the list of operations to an object where a key is the name of
  // the operation and its value is an array of signatures the operation might
  // have.
  const collapsedOps = iface.members
    .filter((item) => (item.type === 'operation'))
    .reduce((soFar, item) => Object.assign(soFar, {
      [item.name]: [...(soFar[item.name] || []), item ]
    }), {});

  return [
    [
      '////////////////////////////////////////////////////////////////////////////////',
      `// Interface ${iface.name}`,
      '////////////////////////////////////////////////////////////////////////////////'
    ].join('\n'),
    // Object.entries() turns the operations as collapsed by name back into an
    // array of [opname, sigs] tuples, each of which we pass to
    // `generateIfaceOperation`. That way, only one binding is generated for all
    // signatures of an operation.
    ...Object.entries(collapsedOps).map(([opname, sigs]) =>
      generateIfaceOperation(iface.name, opname, sigs)),
    generateIfaceInit(iface.name, collapsedOps)
  ].join('\n\n');
}

function generateInit(tree, moduleName) {
  // Array of {
  //   valueName: string (name of variable used in propDesc)
  //   initializer: string (call to webidl_napi_create_interface)
  //   propDesc: string (C initializer: {
  //     "interfaceName", nullptr, nullptr, nullptr, nullptr, valueName,
  //     napi_enumerable, nullptr
  //   })
  // }
  const interfaces = tree.filter((item) => (item.type === 'interface'));

  return [
    `/////////////////////////////////////////////////////////////////////////`,
      `///////`,
    `// Init module \`${moduleName}\``,
    `/////////////////////////////////////////////////////////////////////////`,
      `///////`,
    ``,
    `napi_value`,
    `${moduleName}_init(`,
    `    napi_env env) {`,
    // Declare a `napi_value` `interface_0`, `interface_1`, ... for each
    // interface found.
    `  napi_value`,
    `    ${interfaces.map((item, idx) => (`interface_${idx}`)).join(',\n    ')};`,
    ``,
    // Initialize each `interface_0`, ... value.
    ...interfaces.reduce((soFar, item, idx) => soFar.concat([
      `  NAPI_CALL(`,
      `      env,`,
      `      webidl_napi_create_interface_${item.name}(`,
      `          env,`,
      `          &interface_${idx}));`
    ]), []),
    ``,
    // Place all `interface_0`, ... values into an array of property
    // descriptors.
    `  napi_property_descriptor props[] =`,
    generateInitializerList(interfaces.map((item, idx) => [
      `"${item.name}"`,
      `nullptr`,
      `nullptr`,
      `nullptr`,
      `nullptr`,
      `interface_${idx}`,
      `napi_enumerable`,
      `nullptr`
    ]), '  ') + ';',
    `  napi_value exports;`,
    ``,
    `  NAPI_CALL(`,
    `      env,`,
    `      napi_create_object(`,
    `          env,`,
    `          &exports));`,
    ``,
    `  NAPI_CALL(`,
    `      env,`,
    `      napi_define_properties(`,
    `          env,`,
    `          exports,`,
    `          sizeof(props) / sizeof(*props),`,
    `          props));`,
    `  return exports;`,
    `}`
  ].join('\n');
}

const file = fs.readFileSync(argv._[0], { encoding: 'utf-8' });
const tree = parse(file);
const parsedPath = path.parse(argv._[0]);
const outputFile = argv.o || parsedPath.name + '.cc';

fs.writeFileSync(outputFile, [
  [
    argv.n,
    'webidl-napi-inl.h',
    // If the user requested extra includes, add them as `#include "extra-include.h"`.
    // argv.i may be absent, may be a string, or it may be an array.
    ...(argv.i ? (typeof argv.i === 'string' ? [ argv.i ] : argv.i) : [])
  ].map((item) => `#include "${item}"`).join('\n'),
  ...tree.filter((item) => (item.type === 'enum')).map(generateEnumMaps),
  ...tree.filter((item) => (item.type === 'dictionary')).map(generateDictionaryMaps),
  ...tree.filter((item) => (item.type === 'interface')).map(generateIface),
  generateInit(tree, parsedPath.name)
].join('\n\n') + '\n');
