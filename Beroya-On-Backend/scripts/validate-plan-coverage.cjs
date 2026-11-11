/**
 * Fail if any Swagger /api/v1/go operation is missing from FRONTEND-PLAN.md + MOBILE-PLAN.md.
 * Also fail if any GoErrorCode is missing from both plan error tables.
 *
 * Usage: node backend/scripts/validate-plan-coverage.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SWAGGER = path.join(ROOT, 'docs', 'swagger.json');
const FRONTEND = path.join(ROOT, 'docs', 'FRONTEND-PLAN.md');
const MOBILE = path.join(ROOT, 'docs', 'MOBILE-PLAN.md');
const ERRORS_SRC = path.join(ROOT, 'src', 'common', 'errors', 'go-error-codes.ts');

const spec = JSON.parse(fs.readFileSync(SWAGGER, 'utf8'));
const fe = fs.readFileSync(FRONTEND, 'utf8');
const mo = fs.readFileSync(MOBILE, 'utf8');
const combined = fe + '\n' + mo;

const swaggerOps = [];
for (const [p, methods] of Object.entries(spec.paths || {})) {
  for (const method of Object.keys(methods)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    swaggerOps.push(`${method.toUpperCase()} ${p}`);
  }
}

const missingOps = swaggerOps.filter((op) => {
  // Match "METHOD /path" as a dedicated line (plan card header)
  const [method, ...rest] = op.split(' ');
  const route = rest.join(' ');
  const re = new RegExp(`^${method}\\s+${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
  return !re.test(combined);
});

const errSrc = fs.readFileSync(ERRORS_SRC, 'utf8');
const codes = [...errSrc.matchAll(/=\s*'([A-Z0-9_]+)'/g)].map((m) => m[1]);
const missingCodes = codes.filter((c) => !combined.includes('`' + c + '`') && !combined.includes(c));

let failed = false;
if (missingOps.length) {
  failed = true;
  console.error('Missing operations in FRONTEND-PLAN.md / MOBILE-PLAN.md:');
  for (const o of missingOps) console.error('  -', o);
}
if (missingCodes.length) {
  failed = true;
  console.error('Missing GoErrorCode entries in plan error tables:');
  for (const c of missingCodes) console.error('  -', c);
}

if (failed) {
  console.error(
    `\nFAIL: ${missingOps.length} ops missing, ${missingCodes.length} error codes missing (swagger ops=${swaggerOps.length}).`,
  );
  process.exit(1);
}

console.log(
  `OK: ${swaggerOps.length} swagger ops covered; ${codes.length} error codes present in plans.`,
);
