'use strict';

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

// Typemap for storing the native return value.
const typemapNativeToWebIDLReturn = {
  // boolean
  'boolean': 'bool',

  // number
  'byte': 'char',
  'octet': 'char',
  'short': 'short',
  'unsigned short': 'unsigned short',
  'long': 'long',
  'unsigned long': 'long',
  'long long': 'long long',
  'unsigned long long': 'unsigned long long',
  'float': 'float',
  'unrestricted float': 'float',
  'double': 'float',
  'unrestricted double': 'float',

  // string
  'DOMString': 'const char*',
  'ByteString': 'const char*',
  'USVString': 'const char*',

  // object
  'object': 'napi_object'
};

const argv = require('yargs')
  .nargs('o', 1)
  .describe('o', 'output file')
  .help('h')
  .alias('h', 'help')
  .describe('I', 'print include directory and exit')
  .describe('i', 'add #include after js_native_api.h')
  .nargs('i', 1)
  .argv;

if (argv.I) {
  console.log(__dirname);
  process.exit(0);
}

const { parse } = require('webidl2');
const fs = require('fs');
const path = require('path');

const file = fs.readFileSync(argv._[0], {encoding: 'utf-8'});
const tree = parse(file);
const parsedPath = path.parse(argv._[0]);
const output = argv.o || parsedPath.name + '.cc';

// Create an initializer list for signature candidates that will be processed by
// `webidl_napi_pick_signature()`. It may look like this:
// { { true, { napi_number, object } }, { true, { napi_string, napi_object } }
function generateSigCandidates(sigs) {
  return [
    '{',
      sigs.map((sig) => [
        '{true, ', [
          '{',
          sig.arguments.map((arg) => typemapWebIDLToNAPI[arg.idlType.idlType]).join(', '),
          '}'
          ].join(''),
        '}'
      ].join('')).join(', '),
    '}'
  ].join('');
}

function generateParamRetrieval(sigs, maxArgs) {
    // We declare variable `sig_idx` only if there are multiple signatures.
  return (sigs.length > 1 ? [ '  int sig_idx = -1;' ] : [])
      .concat([
        `  napi_value argv[${maxArgs}];`,
        `  size_t argc = ${maxArgs};`,
        '  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));',
        // TODO(gabrielschulhof): What if, upon return, argc is greater than maxArgs?
      ])
      // If we have multiple signatures, let's generate the code to figure out
      // which one the JS is trying to call, and then generate the code that
      // assigns the result to `sig_idx`.
      .concat(sigs.length > 1 ? [
        '  NAPI_CALL(env, webidl_napi_pick_signature(env, argc, argv, ' +
          generateSigCandidates(sigs) + ', &sig_idx));',
      ] : []).join('\n');
}

// `convResult` is an out-parameter whose property `canConvert` will be set to
// `false` if not already `false` and if a conversion could not be found. This
// informs the rest of the call-to-native generation.
function generateConversionToNative(arg, index, convResult) {
  const conversions = {
    'napi_string': {
      'DOMString': function() {
        return [
          `std::unique_ptr<char[]> native_arg_${index}_scope;`,
          '{',
          '  size_t size;',
          `  NAPI_CALL(env, napi_get_value_string_utf8(env, argv[${index}], ` +
            'nullptr, 0, &size));',
          `  native_arg_${index}_scope = ` +
            'std::unique_ptr<char[]>(new char[size + 1]);',
          `  NAPI_CALL(env, napi_get_value_string_utf8(env, argv[${index}], ` +
            `native_arg_${index}_scope.get(), size, &size));`,
          '}',
          `char* native_arg_${index} = native_arg_${index}_scope.get();`
        ];
      }
    },
    'napi_object': {
      'object': function() {
        return [
          `napi_value native_arg_${index} = argv[${index}];`,
        ];
      }
    }
  };

  // Find the conversion.
  const napiType = typemapWebIDLToNAPI[arg.idlType.idlType];
  let conversion = conversions[napiType];
  if (conversion) conversion = conversion[arg.idlType.idlType];

  // 
  if (convResult.canConvert) {
    convResult.canConvert = !!conversion;
  }

  // Return the result of the conversion if we have it and generate code for
  // throwing and exception if we do not.
  return (conversion ? conversion() : [
    'NAPI_CALL(env, napi_throw_error(env, NULL, ' +
      `"Conversion from ${napiType} to ${arg.idlType.idlType} not ` +
        'implemented"));',
    'return nullptr;'
  ])
  .join('\n');
}

function generateCall(iface, sig) {
  const convResult = { canConvert: true };
  return sig.arguments
    .map((arg, index) => generateConversionToNative(arg, index, convResult))
    // Don't generate a call to native if we ran into a parameter conversion to
    // native data types that was not implemented.
    .concat(convResult.canConvert ? [
      '',
      // If there's a return value, assign it to a variable.
      ((sig.idlType && sig.idlType.type === 'return-type') ? 'auto ret = '  : '') +
        `${iface}::${sig.name}(` +
          // Generate the arguments: native_arg_0, native_arg_1, ...
          Array.apply(0, Array(sig.arguments.length))
            .map((item, idx) => `native_arg_${idx}`).join(', ') +
        ');'
    ] : [])
    .join('\n');
}

function generateIfaceOperation(iface, opname, sigs) {
  const maxArgs =
    sigs.reduce((soFar, item) => Math.max(soFar, item.arguments.length), 0);

  return [
    'static napi_value',
    `webidl_napi_interface_${iface}_${opname}(` +
      'napi_env env, napi_callback_info info) {',
  ]
  // If we have args, then generate the arg retrieval code, and decide which
  // signature to call.
  .concat(maxArgs === 0
    ? []
    : [ generateParamRetrieval(sigs, maxArgs) ])
  .concat([
    '',
  ])
  .concat(sigs.length > 1 ? [ sigs.map((sig, index) => [
  `  if (sig_idx == ${index}) {`,
  generateCall(iface, sig),
  '  }'
  ].join('\n')).join('\n  else\n') ] : [ generateCall(iface, sigs[0]) ])
  .concat([
    '  return nullptr;',
    '}'
  ]).join('\n');
}

function generateIfaceOperations(iface) {
  return Object.entries(iface.collapsedOps)
    // Object.entries() turns the operations as collapsed by name back into an
    // array of [opname, sigs] tuples, each of which we pass to
    // `generateIfaceOperation`. That way, only one binding is generated for all
    // signatures of an operation.
    .map(([opname, sigs]) => generateIfaceOperation(iface.name, opname, sigs))
    .join('\n\n');
}

function generateIfaceInit(iface) {
  return [
    'static napi_value',
    `webidl_napi_interface_${iface.name}_constructor(napi_env env, ` +
      'napi_callback_info info) {',
    '  return nullptr;',
    '}',
    '',
    'static napi_status',
    `webidl_napi_create_interface_${iface.name}(` +
      'napi_env env, napi_value* result) {',
    '  napi_property_descriptor props[] = {',
    '    ' + Object
      .keys(iface.collapsedOps)
      .map((opname) => (`{ "${opname}", nullptr, ` +
        `webidl_napi_interface_${iface.name}_${opname}, nullptr, nullptr, ` +
        'nullptr, ' +
          'static_cast<napi_property_attributes>(' + [ 'napi_enumerable' ]
            // Or in `napi_static` for static methods.
            .concat(iface.collapsedOps[opname][0].special === 'static'
              ? [ 'napi_static' ]
              : [])
            .join(' | ') +
        '), nullptr }')).join(',\n    '),
    '  };',
    '',
    `  return napi_define_class(env, "${iface.name}", NAPI_AUTO_LENGTH, ` +
      `webidl_napi_interface_${iface.name}_constructor, nullptr, ` +
      'sizeof(props) / sizeof(*props), props, result);',
    '}'
  ].join('\n');
}

function generateIface(iface) {
  // Convert the list of operations to an object where a key is the name of
  // the operation and its value is an array of signatures the operation might
  // have.
  iface.collapsedOps = iface.members
    .filter((item) => (item.type === 'operation'))
    .reduce((soFar, item) => Object.assign(soFar, {
      [item.name]: (soFar[item.name] || []).concat([item])
    }), {});
  return [
    [
      '////////////////////////////////////////////////////////////////////////////////',
      `// Interface ${iface.name}`,
      '////////////////////////////////////////////////////////////////////////////////'
    ].join('\n')
  ].concat([
    generateIfaceOperations(iface),
    generateIfaceInit(iface)
  ]).join('\n\n');
}

function generateInit(tree, moduleName) {
  // Hash of tree[idx].name => {
  //   valueName: string (name of variable used in propDesc)
  //   initializer: string (call to webidl_napi_create_interface)
  //   propDesc: string (C initializer: {
  //     "interfaceName", nullptr, nullptr, nullptr, nullptr, valueName,
  //     napi_enumerable, nullptr
  //   })
  // }

  const propArray = Object.values(tree
    .filter((item) => (item.type === 'interface'))
    .reduce((soFar, item, idx) => {
      const valueName = `interface_${idx}`;
      soFar[item.name] = {
        valueName,
        propDesc: `{ "${item.name}", nullptr, nullptr, nullptr, nullptr, ` +
          `${valueName}, napi_enumerable, nullptr }`,
        initializer: `NAPI_CALL(env, ` +
          `webidl_napi_create_interface_${item.name}(env, &${valueName}))`
      };
      return soFar;
    }, {}));

  return [
    '////////////////////////////////////////////////////////////////////////////////',
    `// Init module \`${moduleName}\``,
    '////////////////////////////////////////////////////////////////////////////////',
    '',
    'napi_value',
    `${moduleName}_init(napi_env env, napi_value exports) {`,
    '  napi_value ' + propArray.map((item) => (item.valueName)).join(',\n    ') + ';',
    '',
    '  ' + propArray.map((item) => (item.initializer)).join(';\n  ') + ';',
    '',
    '  napi_property_descriptor props[] = {',
    '    ' + propArray.map((item) => (item.propDesc)).join(',\n    '),
    '  };',
    '',
    '  NAPI_CALL(env, napi_define_properties(env, exports, sizeof(props) / sizeof(*props), props));',
    '  return exports;',
    '}'
  ].join('\n');
}

fs.writeFileSync(output,
  [ 'js_native_api.h', 'webidl-napi-inl.h' ]
    // If the user requested extra includes, add them as `#include "extra-include.h"`.
    // argv.i may be absent, may be a string, or it may be an array.
    .concat((argv.i
      ? (typeof argv.i === 'string'
        ? [ argv.i ]
        : argv.i)
      : []))
    .map((item) => `#include "${item}"`)
    .concat(tree.filter((item) => (item.type === 'interface')).map(generateIface))
    .concat([
      generateInit(tree, parsedPath.name),
    ]).join('\n\n') + '\n');
