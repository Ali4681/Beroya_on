import { Pool } from 'pg';

/** Clears OTP cooldown rows so e2e can re-request on shared seed phones. */
export async function clearOtpPhones(phones: string[]) {
  if (!phones.length) return;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query('DELETE FROM go_otp_requests WHERE phone = ANY($1::text[])', [phones]);
  } finally {
    await pool.end();
  }
}
