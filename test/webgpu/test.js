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

  // Make sure the `gpu` property is `SameObject`.
  const nav = new binding.Navigator();
  const gpu1 = nav.gpu;
  const gpu2 = nav.gpu;
  assert.strictEqual(gpu1, gpu2);
}
