require('dotenv').config();
const { Pool } = require('pg');

const phones = process.argv.slice(2);
if (!phones.length) {
  console.error('usage: node scripts/clear-otp-phones.cjs +963...');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool
  .query('DELETE FROM go_otp_requests WHERE phone = ANY($1::text[])', [phones])
  .then((r) => {
    console.log('deleted otp rows', r.rowCount);
    return pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
