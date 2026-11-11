import { execSync } from 'child_process';
import { config } from 'dotenv';
import { resolve } from 'path';

export default async function globalSetup() {
  config({ path: resolve(__dirname, '../.env.test'), override: true });
  const cwd = resolve(__dirname, '..');
  execSync('npx prisma migrate deploy', { cwd, stdio: 'inherit', env: process.env });
  execSync('npx ts-node test/reset-e2e-state.ts', { cwd, stdio: 'inherit', env: process.env });
  execSync('npx ts-node prisma/seed.ts', { cwd, stdio: 'inherit', env: process.env });
}
