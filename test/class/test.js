'use strict';
const buildType = process.config.target_defaults.default_configuration;
const assert = require('assert');
test(require('bindings')({ bindings: 'class', module_root: __dirname }));

function test(binding) {
  assert.strictEqual((new binding.JSClassExample(12)).increment(), 13);
  assert.strictEqual((new binding.JSClassExample()).increment(), 1);
  assert.strictEqual((new binding.JSClassExample('5')).increment(), 6);
}
