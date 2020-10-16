'use strict';
const assert = require('assert');
test(require('bindings')({ bindings: 'webgpu', module_root: __dirname }));

function test(binding) {
  const gpu = new binding.GPU();
  assert.strictEqual(gpu.requestAdapter({powerPreference: 'high-performance'}),
                     undefined);
  // TODO (gabrielschulhof): Expect a more specific error.
  assert.throws(() => gpu.requestAdapter({powerPreference: 'low-powder'}));
  assert.strictEqual(gpu.requestAdapter(), undefined);
}
