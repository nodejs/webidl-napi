'use strict';
const { spawnSync } = require('child_process');
const { readdirSync, lstatSync } = require('fs');
const path = require('path');
const repoRoot = require('bindings').getRoot('.');
const cmakeJs = path.join(repoRoot, 'node_modules', '.bin', 'cmake-js');

readdirSync(__dirname).forEach((item) => {
  const testDir = path.join(__dirname, item);
  if (lstatSync(testDir).isDirectory()) {
    const child = spawnSync(cmakeJs, ['compile'], {
      cwd: testDir,
      stdio: 'inherit',
      shell: true
    });
    if (child.signal || child.status != 0) {
      process.exit(1);
    }
  }
});
