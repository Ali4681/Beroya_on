const { spawn } = require('child_process');
const path = require('path');

const register = path.join('scripts', 'register-paths.js');
const existing = process.env.NODE_OPTIONS ?? '';
const env = {
  ...process.env,
  NODE_OPTIONS: `${existing} --require ./${register.replace(/\\/g, '/')}`.trim(),
};

const nestBin = path.join(__dirname, '..', 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
const child = spawn(process.execPath, [nestBin, 'start', '--watch'], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => process.exit(code ?? 0));
