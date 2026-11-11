import * as bcrypt from 'bcryptjs';
import {
  GoLedgerDirection,
  GoRole,
  GoStoreLedgerType,
  GoStoreStatus,
  PrismaClient,
} from '../src/generated/prisma/client';

export type SeedStoreDef = {
  code: string;
  name: string;
  owner_name: string;
  mobile_number: string;
  address: string;
  branchCode: string;
  lat: number;
  lng: number;
  openingBalance: number;
  operators: { email: string; phone: string; full_name: string }[];
};

/** Demo POS stores + cashiers (same staff password as desk accounts). */
export const SEED_STORES: SeedStoreDef[] = [
  {
    code: 'ALP-01',
    name: 'متجر حلب — العزيزية',
    owner_name: 'صاحب متجر حلب',
    mobile_number: '+963933030010',
    address: 'العزيزية، حلب',
    branchCode: 'ALEPPO',
    lat: 36.206,
    lng: 37.15,
    openingBalance: 500000,
    operators: [
      {
        email: 'store.aleppo@beroyaon.com',
        phone: '+9639330301',
        full_name: 'كاشير حلب ١',
      },
      {
        email: 'store.aleppo2@beroyaon.com',
        phone: '+9639330302',
        full_name: 'كاشير حلب ٢',
      },
    ],
  },
  {
    code: 'DAM-01',
    name: 'متجر دمشق — المزة',
    owner_name: 'صاحب متجر دمشق',
    mobile_number: '+963933010010',
    address: 'المزة، دمشق',
    branchCode: 'DAMASCUS',
    lat: 33.51,
    lng: 36.27,
    openingBalance: 500000,
    operators: [
      {
        email: 'store.damascus@beroyaon.com',
        phone: '+9639330101',
        full_name: 'كاشير دمشق ١',
      },
    ],
  },
];

export async function seedStores(
  prisma: PrismaClient,
  input: { branchIds: Record<string, string>; password: string },
) {
  const password_hash = await bcrypt.hash(input.password, 10);
  const admin =
    (await prisma.user.findUnique({ where: { email: 'admin@beroyaon.com' } })) ??
    (await prisma.user.findFirst({ where: { role: GoRole.ADMIN } })) ??
    (await prisma.user.findFirst({ where: { role: GoRole.SUPER_ADMIN } }));
  if (!admin) throw new Error('seedStores: admin user missing');

  let stores = 0;
  let operators = 0;

  for (const def of SEED_STORES) {
    const branchId = input.branchIds[def.branchCode];
    if (!branchId) {
      console.warn(`seedStores: skip ${def.code} — branch ${def.branchCode} missing`);
      continue;
    }

    const store = await prisma.goStore.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        owner_name: def.owner_name,
        mobile_number: def.mobile_number,
        address: def.address,
        branch_id: branchId,
        status: GoStoreStatus.ACTIVE,
        latitude: def.lat,
        longitude: def.lng,
        low_balance_threshold: 100000,
      },
      create: {
        code: def.code,
        name: def.name,
        owner_name: def.owner_name,
        mobile_number: def.mobile_number,
        address: def.address,
        branch_id: branchId,
        status: GoStoreStatus.ACTIVE,
        latitude: def.lat,
        longitude: def.lng,
        balance: 0,
        low_balance_threshold: 100000,
        created_by_id: admin.id,
      },
    });
    stores += 1;

    const creditRef = `SEED-SC-${def.code}`;
    const existingCredit = await prisma.goStoreLedgerEntry.findUnique({ where: { reference: creditRef } });
    if (!existingCredit) {
      const before = Number(store.balance);
      const amount = def.openingBalance;
      const after = before + amount;
      await prisma.goStore.update({ where: { id: store.id }, data: { balance: after } });
      await prisma.goStoreLedgerEntry.create({
        data: {
          reference: creditRef,
          store_id: store.id,
          type: GoStoreLedgerType.ADMIN_CREDIT,
          direction: GoLedgerDirection.CREDIT,
          amount,
          balance_before: before,
          balance_after: after,
          note: 'Opening balance for test environment',
          performed_by_id: admin.id,
          idempotency_key: creditRef,
          request_hash: creditRef,
        },
      });
    } else if (Number(store.balance) < def.openingBalance) {
      await prisma.goStore.update({ where: { id: store.id }, data: { balance: def.openingBalance } });
    }

    for (const op of def.operators) {
      const email = op.email.trim().toLowerCase();
      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { phone: op.phone, role: GoRole.STORE_OPERATOR }],
        },
      });
      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            role: GoRole.STORE_OPERATOR,
            email,
            phone: op.phone,
            full_name: op.full_name,
            password_hash,
            branch_id: branchId,
            store_id: store.id,
            is_active: true,
          },
        });
      } else {
        await prisma.user.create({
          data: {
            role: GoRole.STORE_OPERATOR,
            email,
            phone: op.phone,
            full_name: op.full_name,
            password_hash,
            branch_id: branchId,
            store_id: store.id,
            is_active: true,
          },
        });
      }
      operators += 1;
    }
  }

  console.log(`Stores: ${stores} POS + ${operators} operators.`);
  return { stores, operators };
}

export function formatStoreDirectory(password: string) {
  const lines = ['', '── Store POS operators (same password as staff) ──', `Password: ${password}`];
  for (const s of SEED_STORES) {
    lines.push(`${s.code} ${s.name} (${s.branchCode}):`);
    for (const op of s.operators) {
      lines.push(`  ${op.email} · ${op.phone} · ${op.full_name}`);
    }
  }
  return lines.join('\n');
}
