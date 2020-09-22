'use strict';
const buildType = process.config.target_defaults.default_configuration;
const assert = require('assert');
test(require(`./build/${buildType}/example.node`));

function test(binding) {
  console.log(binding);
}
