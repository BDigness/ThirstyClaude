#!/usr/bin/env node
// Starts ThirstyClaude in the background and returns to the prompt.
const path = require('path');
const { spawn } = require('child_process');

let electron;
try {
  electron = require('electron');
} catch {
  console.error('Electron is missing. Reinstall ThirstyClaude.');
  process.exit(1);
}

const child = spawn(electron, [path.resolve(__dirname, '..'), ...process.argv.slice(2)], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.on('error', (err) => {
  console.error('Could not start ThirstyClaude:', err.message);
  process.exit(1);
});
child.unref();
console.log('ThirstyClaude is running. Look for the cylinder icon in the tray.');
