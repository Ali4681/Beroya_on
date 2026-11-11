/**
 * Fail the build if Prisma client JS artifacts are missing from dist.
 * Prevents PM2 boot with: Cannot find module './enums'
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'dist', 'generated', 'prisma');
const required = ['client.js', 'enums.js', 'models.js', 'commonInputTypes.js', 'browser.js'];

if (!fs.existsSync(dir)) {
  console.error(`[verify-prisma-dist] missing directory: ${dir}`);
  process.exit(1);
}

const missing = required.filter((f) => !fs.existsSync(path.join(dir, f)));
if (missing.length) {
  console.error('[verify-prisma-dist] missing files in dist/generated/prisma:');
  for (const f of missing) console.error('  -', f);
  console.error('Fix: rm -rf dist && npx prisma generate && npx tsc -p tsconfig.build.json && npx tsc-alias -p tsconfig.build.json');
  process.exit(1);
}

console.log('[verify-prisma-dist] ok:', required.join(', '));
