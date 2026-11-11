/**
 * Wipe dist + incremental build info so Prisma client always fully re-emits.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targets = [
  path.join(root, 'dist'),
  path.join(root, 'tsconfig.build.tsbuildinfo'),
  path.join(root, 'tsconfig.tsbuildinfo'),
];

for (const t of targets) {
  if (!fs.existsSync(t)) continue;
  fs.rmSync(t, { recursive: true, force: true });
  console.log('[clean-dist] removed', path.relative(root, t));
}
