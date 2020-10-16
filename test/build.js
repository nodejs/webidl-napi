'use strict';
const { spawnSync } = require('child_process');
const { readdirSync, lstatSync } = require('fs');
const path = require('path');

readdirSync(__dirname).forEach((item) => {
  const testDir = path.join(__dirname, item);
  if (lstatSync(testDir).isDirectory()) {
    spawnSync('node-gyp', ['rebuild'], {
      cwd: testDir,
      stdio: 'inherit'
    });
  }
});
