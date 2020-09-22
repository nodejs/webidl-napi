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

function generateIfaceOperation(iface, opname, sigs) {
  console.log(iface + '::' + opname + ': ' + JSON.stringify(sigs, null, 2));
  return [
    'static napi_value',
    `webidl_napi_interface_${iface}_${opname}(` +
      'napi_env env, napi_callback_info info) {',
    '  return nullptr;',
    '}'
  ].join('\n');
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
  const properties = {};
  for (let idx = 0; idx < tree.length; idx++) {
    const item = tree[idx];
    if (item.type === 'interface') {
      const valueName = `interface_${idx}`;
      properties[item.name] = {
        valueName,
        propDesc: `{ "${item.name}", nullptr, nullptr, nullptr, nullptr, ` +
          `${valueName}, napi_enumerable, nullptr }`,
        initializer: `NAPI_CALL(env, ` +
          `webidl_napi_create_interface_${item.name}(env, &${valueName}))`
      }
    }
  }

  const propArray = Object.values(properties);

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
  ['js_native_api.h']
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
