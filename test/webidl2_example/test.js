'use strict';
const buildType = process.config.target_defaults.default_configuration;
const assert = require('assert');
test(require(`./build/${buildType}/example.node`));

function test(binding) {
  const x = binding.WebIDL.parse();
  const y = binding.WebIDLCompiler.compile('abc');
  const z = binding.WebIDLCompiler.compile({ abc: 'def' });
}
