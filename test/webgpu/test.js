'use strict';
const assert = require('assert');
test(require('bindings')({ bindings: 'webgpu', module_root: __dirname }));

async function test(binding) {
  const gpu = new binding.GPU();
  async function testAdapter(options) {
    const adapter =
      await gpu.requestAdapter(options);
    assert(adapter instanceof binding.GPUAdapter);
    assert.strictEqual(adapter.name, 'dummy adapter');
    assert.deepStrictEqual(adapter.extensions, [
      'depth-clamping', 'timestamp-query'
    ]);
  }

  // TODO (gabrielschulhof): Expect a more specific error.
  assert.throws(() => gpu.requestAdapter({powerPreference: 'low-powder'}));

  await testAdapter({ powerPreference: 'high-performance' });
  await testAdapter();
}
