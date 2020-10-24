'use strict';
const buildType = process.config.target_defaults.default_configuration;
const assert = require('assert');
test(require('bindings')({ bindings: 'promise', module_root: __dirname }));

async function test(binding) {
  const retPro = new binding.ReturnsPromise();
  const result = await retPro.requestPromise("something");
  assert.deepStrictEqual(result, { name: "something" });
}
