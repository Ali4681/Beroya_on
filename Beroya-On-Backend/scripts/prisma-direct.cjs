#!/usr/bin/env node
/**
 * Run a Prisma CLI command using DIRECT_URL (Postgres :5432) when available.
 * Usage: node scripts/prisma-direct.cjs migrate deploy
 *
 * Ensures `npm run build` / migrate never hit PgBouncer (:6432).
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load .env manually so DIRECT_URL is visible even if shell didn't export it.
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const direct = (process.env.DIRECT_URL || '').trim();
if (direct) {
  process.env.DATABASE_URL = direct;
  const safe = direct.replace(/:([^:@/]+)@/, ':***@');
  console.log(`[prisma-direct] using DIRECT_URL → ${safe}`);
} else {
  console.log('[prisma-direct] DIRECT_URL empty — using DATABASE_URL as-is');
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node scripts/prisma-direct.cjs <prisma-args...>');
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', ...args], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
  cwd: path.join(__dirname, '..'),
});

process.exit(result.status ?? 1);
