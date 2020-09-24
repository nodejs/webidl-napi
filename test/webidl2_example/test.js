'use strict';
const buildType = process.config.target_defaults.default_configuration;
const assert = require('assert');
test(require(`./build/${buildType}/example.node`));

function test(binding) {
  const x = binding.WebIDL.parse();
  console.log('Result: ' + JSON.stringify(x, null, 2));
  const y = binding.WebIDLCompiler.compile('abc');
  console.log('Result: ' + JSON.stringify(y, null, 2));
  const z = binding.WebIDLCompiler.compile({ abc: 'def' });
  console.log('Result: ' + JSON.stringify(z, null, 2));
}
