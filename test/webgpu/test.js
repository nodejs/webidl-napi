'use strict';
const buildType = process.config.target_defaults.default_configuration;
const assert = require('assert');
test(require(`./build/${buildType}/webgpu.node`));

function test(binding) {
  const gpu = new binding.GPU();
  {
    const x = gpu.requestAdapter({powerPreference: 'high-performance'});
    console.log("Result: " + JSON.stringify(x, null, 2));
  }
  {
    try {
      const x = gpu.requestAdapter({powerPreference: 'low-powder'});
    } catch (e) {
      console.log(e);
    }
  }
  {
    const x = gpu.requestAdapter();
    console.log("Result: " + JSON.stringify(x, null, 2));
  }
}
