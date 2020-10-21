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
const typemapWebIDLBasicTypesToNAPI = {
  // boolean
  'boolean': { type: 'napi_boolean', converter: 'bool' },

  // number
  'byte': { type: 'napi_number', converter: 'uint32' },
  'octet': { type: 'napi_number', converter: 'uint32' },
  'short': { type: 'napi_number', converter: 'int32' },
  'unsigned short': { type: 'napi_number', converter: 'uint32' },
  'long': { type: 'napi_number', converter: 'uint32' },
  'unsigned long': { type: 'napi_number', converter: 'uint32' },
  'long long': { type: 'napi_number', converter: 'int64' },
  'unsigned long long': { type: 'napi_number', converter: 'int64' },
  'float': { type: 'napi_number', converter: 'double' },
  'unrestricted float':  { type: 'napi_number', converter: 'double' },
  'double':  { type: 'napi_number', converter: 'double' },
  'unrestricted double':  { type: 'napi_number', converter: 'double' },

  // string
  'DOMString': { type: 'napi_string', converter: 'DOMString' },
  'ByteString': { type: 'napi_string', converter: 'ByteString' },
  'USVString': { type: 'napi_string', converter: 'USVString' },

  // object
  'object': { type: 'napi_object', converter: 'object' }
};

function generateForwardDeclaration(decl) {
  return [
    `template <>`,
    `inline napi_status`,
    `WebIdlNapi::Converter<${decl.name}>::ToNative(`,
    `    napi_env env,`,
    `    napi_value val,`,
    `    ${decl.name}* result);`,
    ``,
    `template <>`,
    `inline napi_status`,
    `WebIdlNapi::Converter<${decl.name}>::ToJS(`,
    `    napi_env env,`,
    `    const ${decl.name}& val,`,
    `    napi_value* result);`
  ].join('\n');
}

function generateBasicTypeMaps(typedef) {
  const converter =
    typemapWebIDLBasicTypesToNAPI[generateNativeType(typedef.idlType)]
      .converter;
  return [
    `template <>`,
    `inline napi_status`,
    `WebIdlNapi::Converter<${typedef.name}>::ToJS(`,
    `    napi_env env,`,
    `    const ${typedef.name}& val,`,
    `    napi_value* result) {`,
    `  return WebIdlNapi::Converter<${converter}_t>::ToJS(`,
    `      env,`,
    `      static_cast<${converter}_t>(val),`,
    `      result);`,
    `}`,
    ``,
    `template <>`,
    `inline napi_status`,
    `WebIdlNapi::Converter<${typedef.name}>::ToNative(`,
    `    napi_env env,`,
    `    napi_value val,`,
    `    ${typedef.name}* result) {`,
    `  ${converter}_t res;`,
    `  napi_status status = WebIdlNapi::Converter<${converter}_t>::ToNative(`,
    `      env,`,
    `      val,`,
    `      &res);`,
    `  if (status != napi_ok) return status;`,
    ``,
    `  *result = static_cast<${typedef.name}>(res);`,
    `  return napi_ok;`,
    `}`,
  ].join('\n');
}

// Render generics as templated types.
function generateNativeType(idlType) {
  return ((typeof idlType.idlType === 'string')
    ? idlType.idlType
    : `WebIdlNapi::${idlType.generic}<${idlType.idlType[0].idlType}>`);
}

function generateConverter(idlType) {
  // If it's a templated type, like `Promise<Something>`, use `::` for the
  // converter, otherwise use `WebIdlNapi::Converter<type>::`.
  const ret = ((typeof idlType.idlType === 'object' && !!idlType.generic)
    ? `${generateNativeType(idlType)}`
    : `WebIdlNapi::Converter<${generateNativeType(idlType)}>`);
  return ret;
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
    `template <>`,
    `inline napi_status`,
    `WebIdlNapi::Converter<${enumDef.name}>::ToNative(`,
    `    napi_env env,`,
    `    napi_value val,`,
    `    ${enumDef.name}* result) {`,
    `  DOMString str_val;`,
    `  napi_status status = WebIdlNapi::Converter<DOMString>::ToNative(`,
    `      env,`,
    `      val,`,
    `      &str_val);`,
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
    `template <>`,
    `inline napi_status`,
    `WebIdlNapi::Converter<${enumDef.name}>::ToJS(`,
    `    napi_env env,`,
    `    const ${enumDef.name}& val,`,
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
  `template <>`,
  `inline napi_status`,
  `WebIdlNapi::Converter<${dict.name}>::ToNative(`,
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
    `    status = ${generateConverter(member.idlType)}::ToNative(`,
    `        env,`,
    `        js_member,`,
    `        &(result->${member.name}));`,
    `    if (status != napi_ok) return status;`,
    `  }`,
  ]), []),
  `  return napi_ok;`,
  `}`,
  ``,
  `template <>`,
  `inline napi_status`,
  `WebIdlNapi::Converter<${dict.name}>::ToJS(`,
  `    napi_env env,`,
  `    const ${dict.name}& val,`,
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
    `  status = ${generateConverter(member.idlType)}::ToJS(`,
    `      env,`,
    `      val.${member.name},`,
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
// `WebIdlNapi::PickSignature()`. It may look like this:
// { { true, { napi_number, object } }, { true, { napi_string, napi_object } }
function generateSigCandidates(sigs) {
  return generateInitializerList(
    sigs.map((sig) => [
      true,
      sig.arguments.map((arg) =>
        typemapWebIDLBasicTypesToNAPI[generateNativeType(arg.idlType)].type)
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
      `      WebIdlNapi::PickSignature(`,
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
      `    ${generateConverter(idlType)}::ToNative(env,`,
      `        argv[${index}],`,
      `        &native_arg_${index}));`,
    ].map((item) => (indent + item));
  }
  return [
    // Convert arguments to native data types. This assumes that the DOM type
    // is a real C++ type and that a function named
    // `WebIdl::Converter<DOM type>::ToNative` exists.
    ...sig.arguments.reduce((soFar, arg, index) => soFar.concat([
      `${generateNativeType(arg.idlType)} native_arg_${index};`,
      // If the argument is optional, we check that we have it first.
      ...(arg.optional ? [
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
        ...argToNativeCall(arg.idlType, index, '  '),
        `}`,
      ] : argToNativeCall(arg.idlType, index, '')),
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
      `      ${generateConverter(retType)}::ToJS(`,
      `          env,`,
      `          ret,`,
      `          &js_ret));`,
    ] : []),
    `  return js_ret;`,
    `}`
  ].join('\n');
}

function generateIfaceInit(ifname, ops) {
  const opCount = Object.keys(ops).length;
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
    ...((opCount > 0) ? [
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
      ] : []),
    '',
    `  return napi_define_class(`,
    `      env,`,
    `      "${ifname}",`,
    `      NAPI_AUTO_LENGTH,`,
    `      webidl_napi_interface_${ifname}_constructor,`,
    `      nullptr,`,
    ...((opCount > 0) ? [
      `      sizeof(props) / sizeof(*props),`,
      `      props,`,
    ] : [
      `      0,`,
      `      nullptr,`,
    ]),
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
      `//////////////////////////////////////////////////////////////////////` +
        '//////////',
      `// Interface ${iface.name}`,
      `//////////////////////////////////////////////////////////////////////` +
        `//////////`
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
    `/////////////////////////////////////////////////////////////////////////` +
      `///////`,
    `// Init module \`${moduleName}\``,
    `/////////////////////////////////////////////////////////////////////////` +
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

// Save the interfaces as an object with properties keyed on the interface name.
const ifaces = tree.reduce((soFar, item) => Object.assign(soFar,
  (item.type === 'interface' && item.partial === false)
    ? { [item.name]: item }
    : {}), {});

// Save the mixins as an object with properties keyed on the mixin name.
const mixins = tree.reduce((soFar, item) => Object.assign(soFar,
  (item.type === 'interface mixin') ? { [item.name]: item } : {}), {});

const partials = tree.filter((item) =>
  (item.type === 'interface' && item.partial === true));
const includes = tree.filter((item) => (item.type === 'includes'));

// Save the dictionaries as an object with properties keyed on the dictionary
// name.
const dicts = tree.reduce((soFar, item) => Object.assign(soFar,
  (item.type === 'dictionary') ? { [item.name]: item } : {}), {});

// Split up typedefs by whether they have a pre-defined converter.
const { basicTypedefs, extendedTypedefs } = tree.reduce((soFar, item) => {
  if (item.type === 'typedef') {
    if (item.idlType.idlType in typemapWebIDLBasicTypesToNAPI) {
      soFar.basicTypedefs.push(item);
    } else {
      soFar.extendedTypedefs.push(item);
    }
  }
  return soFar;
}, { basicTypedefs: [], extendedTypedefs: [] });

const enums = tree.filter((item) => (item.type === 'enum'));

// Merge inherited dictionaries into their parents.
Object.values(dicts).forEach((dict) => {
  if (dict.inheritance) {
    if (!dicts[dict.inheritance]) {
      throw new Error(`Cannot find dictionary ${dict.inheritance} which is ` +
        `inherited by dictionary ${dict.name}`);
    }
    dict.members.concat(dicts[dict.inheritance].members);
  }
});

// Merge all mixins into existing interfaces.
includes.forEach((include) => {
  if (!ifaces[include.target] && mixins[include.includes]) {
    throw new Error(`Cannot include ${include.includes} into ` +
      `${include.target} because the latter was not found`);
  }
  ifaces[include.target].members.concat(mixins[include.includes].members);
});

// Unlike mixins, partials do not require that an interface also be declared.
partials.forEach((partial) => {
  if (ifaces[partial.name]) {
    ifaces[partial.name].members.concat(partial.members);
  } else {
    ifaces[partial.name] = partial;
  }
});

const dictionaries = Object.values(dicts);
const interfaces = Object.values(ifaces);

fs.writeFileSync(outputFile, [
  [
    argv.n,
    'webidl-napi.h',
    // If the user requested extra includes, add them as `#include "extra-include.h"`.
    // argv.i may be absent, may be a string, or it may be an array.
    ...(argv.i ? (typeof argv.i === 'string' ? [ argv.i ] : argv.i) : [])
  ].map((item) => `#include "${item}"`).join('\n'),
  ...[...basicTypedefs, ...enums, ...dictionaries, ...interfaces]
    .map(generateForwardDeclaration),
  ...enums.map(generateEnumMaps),
  ...basicTypedefs.map(generateBasicTypeMaps),
  ...dictionaries.map(generateDictionaryMaps),
  ...interfaces.map(generateIface),
  generateInit(tree, parsedPath.name)
].join('\n\n') + '\n');
