'use strict';

const argv = require('yargs')
  .nargs('o', 1)
  .describe('o', 'output file')
  .help('h')
  .alias('h', 'help')
  .describe('I', 'print include directory and exit')
  .describe('i', 'add #include after js_native_api.h')
  .nargs('i', 1)
  .argv;

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

const typeConversions = {
  'napi_string': {
    'DOMString': function(source, destination) {
      return [
        `std::string ${destination};`,
        `NAPI_CALL(`,
        `    env,`,
        `    webidl_napi_js_to_native_string(`,
        `        env,`,
        `        ${source},`,
        `        &${destination}));`,
      ];
    }
  },
  'napi_object': {
    'object': function(source, destination) {
      return [
        `napi_value ${destination} = ${source};`,
      ];
    }
  }
};

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
    `static napi_status`,
    `${enumDef.name}_toNative(`,
    `    napi_env env,`,
    `    napi_value val,`,
    `    ${enumDef.name}* result) {`,
    `  std::string str_val;`,
    `  napi_status status = webidl_napi_js_to_native_string(env, val, &str_val);`,
    `  if (status != napi_ok) return status;`,
    ``,
    // Generate an if-statement for each possible enum value, and one for the
    // case where the value is not in the list. Join the statements with `else`.
    [
      ...enumDef.values.map((val) => [
        `  if (str_val == "${val.value}") {`,
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
    `static napi_status`,
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

function generateDictionaryMaps(dictDef) {
  console.log('generateDictionaryMaps: ' + JSON.stringify(dictDef, null, 2));
}

// Create an initializer list for signature candidates that will be processed by
// `webidl_napi_pick_signature()`. It may look like this:
// { { true, { napi_number, object } }, { true, { napi_string, napi_object } }
function generateSigCandidates(sigs) {
  return generateInitializerList(
    sigs.map((sig) => [
      true,
      sig.arguments.map((arg) => typemapWebIDLToNAPI[arg.idlType.idlType])
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

// `convResult` is an out-parameter whose property `canConvert` will be set to
// `false` if not already `false` and if a conversion could not be found. This
// informs the rest of the call-to-native generation.
function generateConversionToNative(arg, index, convResult, indent) {
  // Find the conversion.
  const napiType = typemapWebIDLToNAPI[arg.idlType.idlType];
  let conversion = typeConversions[napiType];
  if (conversion) conversion = conversion[arg.idlType.idlType];

  // If not found, and `canConvert` is still `true`, set it to `false`.
  convResult.canConvert = convResult.canConvert && !!conversion;

  // Return the result of the conversion if we have it and generate code for
  // throwing and exception if we do not.
  return (conversion
    ? conversion(`argv[${index}]`, `native_arg_${index}`)
    : [
      `NAPI_CALL(`,
      `    env,`,
      `    napi_throw_error(`,
      `        env,`,
      `        NULL,`,
      `        "Conversion "`,
      `            "from ${napiType} "`,
      `            "to ${arg.idlType.idlType} "`,
      `            "not implemented"));`,
      `return nullptr;`
    ])
    .map((item) => (indent + item))
    .join('\n');
}

function generateCall(ifname, sig, indent) {
  const convResult = { canConvert: true };
  return [
    ...sig.arguments.map((arg, index) =>
      generateConversionToNative(arg, index, convResult, indent)),
    // Only generate a call to native if we found an implementation for the
    // parameter conversion to the native data types.
    ...(convResult.canConvert ? [
      '',
      // If there's a return value, assign it to a variable.
      indent + ((sig.idlType && sig.idlType.type === 'return-type')
        ? 'ret = '
        : '') + `${ifname}::${sig.name}(` +
          // Generate the arguments: native_arg_0, native_arg_1, ...
          Array.apply(0, Array(sig.arguments.length))
            .map((item, idx) => `native_arg_${idx}`).join(', ') +
        ');'
    ] : [])
  ].join('\n');
}

const returnValueConversions = {
  'object': {
    nativeType: 'napi_value',
    converter() { return [
      `  js_ret = ret;`
    ]; }
  },
  'Promise': {
    nativeType: 'napi_value',
    converter() { return [
      `  js_ret = ret;`
    ]; }
  },
  'DOMString': {
    nativeType: 'std::string',
    converter() {
      return [
        `  NAPI_CALL(`,
        `      env,`,
        `      napi_create_string_utf8(`,
        `          env,`,
        `          ret.c_str(),`,
        `          ret.size(),`,
        `          &js_ret));`
      ];
    }
  }
};

function generateIfaceOperation(ifname, opname, sigs) {
  const maxArgs =
    sigs.reduce((soFar, item) => Math.max(soFar, item.arguments.length), 0);
  const hasReturn = (sigs[0].idlType && sigs[0].idlType.type === 'return-type');

  let webIDLReturnType = sigs[0].idlType.idlType;
  if (typeof webIDLReturnType === 'object' && sigs[0].idlType.generic) {
    webIDLReturnType = sigs[0].idlType.generic;
  }

  return [
    `static napi_value`,
    `webidl_napi_interface_${ifname}_${opname}(`,
    `    napi_env env,`,
    `    napi_callback_info info) {`,
    `  napi_value js_ret = nullptr;`,
    // If the op has a return value that we don't know how to compute because
    // the conversion was not found in `returnValueConversions`, we generate
    // code that throws an error.
    ...((!(hasReturn && (webIDLReturnType in returnValueConversions))) ? [
      `  NAPI_CALL(`,
      `      env,`,
      `      napi_throw_error(`,
      `          env,`,
      `          NULL,`,
      `          "Return value conversion for type "`,
      `              "${webIDLReturnType}"`,
      `              " not implemented"));`,
      `  return js_ret;`,
      `}`
    ] : [
      // If we have args, then generate the arg retrieval code, and decide which
      // signature to call.
      ...((maxArgs === 0) ? [] : [ generateParamRetrieval(sigs, maxArgs) ]),
      // If we have a return value declare the variable that stores the return
      // value from the call to the native function.
      ...(hasReturn
        ? [ `  ${returnValueConversions[webIDLReturnType].nativeType} ret;` ]
        : []),
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
      ...(hasReturn ? returnValueConversions[webIDLReturnType].converter() : []),
      `  return js_ret;`,
      `}`
    ])
  ].join('\n');
}

function generateIfaceInit(ifname, ops) {
  return [
    // Generate the constructor for the JS class.
    'static napi_value',
    `webidl_napi_interface_${ifname}_constructor(`,
    `    napi_env env,`,
    `    napi_callback_info info) {`,
    `  return nullptr;`,
    `}`,
    ``,
    // Generate the init method that defines the JS class.
    'static napi_status',
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
  const propArray = tree
    .filter((item) => (item.type === 'interface'))
    .map((item, idx) => ({
      valueName: `interface_${idx}`,
        propDesc: [
          `"${item.name}"`,
          `nullptr`,
          `nullptr`,
          `nullptr`,
          `nullptr`,
          `interface_${idx}`,
          `napi_enumerable`,
          `nullptr`
        ],
        initializer: [
          `NAPI_CALL(`,
          `    env,`,
          `    webidl_napi_create_interface_${item.name}(`,
          `        env,`,
          `        &interface_${idx}))`
        ].join('\n')
    }));

  return [
    `////////////////////////////////////////////////////////////////////////////////`,
    `// Init module \`${moduleName}\``,
    `////////////////////////////////////////////////////////////////////////////////`,
    ``,
    `napi_value`,
    `${moduleName}_init(`,
    `    napi_env env) {`,
    `  napi_value`,
    `    ${propArray.map((item) => (item.valueName)).join(',\n    ')};`,
    ``,
    `  ${propArray.map((item) => (item.initializer)).join(';\n  ') };`,
    ``,
    `  napi_property_descriptor props[] =`,
    `${generateInitializerList(propArray.map((item) => (item.propDesc)), '    ')};`,
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

if (argv.I) {
  console.log(__dirname);
  process.exit(0);
}

const file = fs.readFileSync(argv._[0], { encoding: 'utf-8' });
const tree = parse(file);
const parsedPath = path.parse(argv._[0]);
const outputFile = argv.o || parsedPath.name + '.cc';

fs.writeFileSync(outputFile, [
  [
    'js_native_api.h',
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
