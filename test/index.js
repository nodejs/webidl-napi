'use strict';
const { spawnSync } = require('child_process');
const { readdirSync, lstatSync } = require('fs');
const path = require('path');

readdirSync(__dirname).forEach((item) => {
  const testDir = path.join(__dirname, item);
  if (lstatSync(testDir).isDirectory()) {
    const child = spawnSync(process.execPath, [
      '--expose-gc',
      path.join(testDir, 'test.js')
    ], {
      stdio: 'inherit'
    });
    if (child.signal || child.status != 0) {
      process.exit(1);
    }
  }
});
