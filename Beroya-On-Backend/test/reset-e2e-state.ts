import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';

/** Clears volatile auth state on the test DB between full e2e runs. */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  await prisma.goIdempotencyKey.deleteMany();
  await prisma.goOtpRequest.deleteMany();
  await prisma.goUserSession.deleteMany();
  // Clear ride FKs on driver state before deleting rides
  await prisma.goDriverState.updateMany({
    data: { current_ride_id: null, next_ride_id: null, availability: 'OFFLINE' },
  });
  try {
    await prisma.goOperationalAlert.deleteMany();
  } catch {
    /* table may not exist on first migrate */
  }
  await prisma.goRideOffer.deleteMany().catch(() => undefined);
  await prisma.goRide.deleteMany();
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
