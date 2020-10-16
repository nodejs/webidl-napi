'use strict';
const buildType = process.config.target_defaults.default_configuration;
const assert = require('assert');
test(require('bindings')({ bindings: 'example', module_root: __dirname }));

function test(binding) {
  assert.strictEqual(binding.WebIDL.parse(), undefined);
  assert.strictEqual(binding.WebIDLCompiler.compile('abc'), 'compile a string');
  assert.strictEqual(binding.WebIDLCompiler.compile({ abc: 'def' }),
                     'compile an object');
}
