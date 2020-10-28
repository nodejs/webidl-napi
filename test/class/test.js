'use strict';
const buildType = process.config.target_defaults.default_configuration;
const assert = require('assert');
test(require('bindings')({ bindings: 'class', module_root: __dirname }));

function test(binding) {
  {
    assert.strictEqual((new binding.Incrementor(12)).increment(), 13);
    assert.strictEqual((new binding.Incrementor()).increment(), 1);
    assert.strictEqual((new binding.Incrementor('5')).increment(), 6);
  }
  {
    const inc = new binding.Incrementor(39);
    const dec = inc.getDecrementor();
    assert.strictEqual(inc.increment(), 40);
    assert.strictEqual(dec.decrement(), 39);
  }
  global.gc();
  global.gc();
  global.gc();

  // Give the gc time to act.
  setTimeout(() => {}, 1000);
}
