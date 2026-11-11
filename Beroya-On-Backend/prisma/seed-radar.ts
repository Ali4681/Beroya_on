/**
 * Demo data for Beroya Radar and the Command Center (development only).
 *
 * Covers every map legend state:
 *   بلا طلب · طلب أقل→أكثر · طلب متوقع أقل→أكثر · متاح · مشغول · موقع قديم · طلب بانتظار
 *
 *   npm run seed:radar              Damascus + Aleppo (also invoked from npm run seed)
 *   npm run seed:radar -- --aleppo  Aleppo only
 *   npm run seed:radar -- --live    refresh non-stale drivers until Ctrl+C
 *   npm run seed:radar -- --clean   remove RADAR-DEMO rows
 *
 * RADAR-001 (driver app, حلب):
 *   GET /api/v1/go/driver/radar?lat=36.2021&lng=37.1343&radius_m=10000
 * as +963922222226 — expect ≥2 cells with heat ≥ 1.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { latLngToCell } from 'h3-js';
import { Pool } from 'pg';
import 'dotenv/config';
import {
  GoDriverAvailability,
  GoPaymentMethod,
  GoPaymentStatus,
  GoRideOfferStatus,
  GoRideStatus,
  GoRideType,
  GoRole,
  Prisma,
  PrismaClient,
} from '../src/generated/prisma/client';
import { encodePolyline } from '../src/modules/go/rides/polyline';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-radar is demo data and refuses to run with NODE_ENV=production.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PREFIX = 'RADAR-DEMO-';
const CUSTOMER_PHONE = '+963991000000';
/** Known Aleppo staging driver from seed-activity (branch ALEPPO). */
const ALEPPO_STAGING_DRIVER_PHONE = '+963922222226';
const DAYS = 35;
const MIN = 60_000;
const TZ_OFFSET_H = 3;
/** Relative demand by local hour (Damascus, UTC+3). */
const HOURLY = [0.35, 0.25, 0.18, 0.12, 0.12, 0.2, 0.5, 1.0, 1.4, 1.2, 1.0, 1.0, 1.2, 1.3, 1.2, 1.1, 1.3, 1.6, 1.8, 1.7, 1.5, 1.2, 0.9, 0.55];
const HOURLY_SUM = HOURLY.reduce((a, b) => a + b, 0);

type Point = { lat: number; lng: number };
type Hotspot = Point & { name: string; weight: number };
type City = {
  code: string;
  perDay: number;
  hotspots: Hotspot[];
  drivers: { name: string; phone: string }[];
  /** Hotspot names that get waiting requests now (repeat = more requests). */
  waitingAt: string[];
  /**
   * Hotspot names that get explicit recent (last ~45 min) requests for driver heat map.
   * Repeat = more requests in that H3 parent cell. Keeps heat ≥ 1 across several cells.
   */
  recentAt: string[];
  /** Hotspot names where available drivers wait now (prefer quiet spots for «بلا طلب»). */
  availableAt: string[];
  /** Hotspot names for ONLINE drivers with an intentionally stale location («موقع قديم»). */
  staleAt: string[];
  busy: number;
};

/** Fixed probe point near Aleppo centre for repeatable GET /driver/radar checks. */
const ALEPPO_RADAR_ORIGIN: Point = { lat: 36.2021, lng: 37.1343 };

const CITIES: City[] = [
  {
    code: 'DAMASCUS',
    perDay: 120,
    hotspots: [
      { name: 'المرجة', lat: 33.5116, lng: 36.3005, weight: 10 },
      { name: 'الشعلان', lat: 33.518, lng: 36.29, weight: 9 },
      { name: 'المزة', lat: 33.5, lng: 36.245, weight: 8 },
      { name: 'البرامكة', lat: 33.508, lng: 36.288, weight: 7 },
      { name: 'باب توما', lat: 33.513, lng: 36.317, weight: 6 },
      { name: 'أبو رمانة', lat: 33.52, lng: 36.28, weight: 5 },
      { name: 'الميدان', lat: 33.493, lng: 36.3, weight: 5 },
      { name: 'القصاع', lat: 33.518, lng: 36.31, weight: 4 },
      { name: 'كفرسوسة', lat: 33.497, lng: 36.27, weight: 4 },
      { name: 'ركن الدين', lat: 33.533, lng: 36.3, weight: 3 },
      { name: 'جرمانا', lat: 33.487, lng: 36.35, weight: 3 },
      { name: 'دمر', lat: 33.532, lng: 36.23, weight: 2 },
      { name: 'برزة', lat: 33.553, lng: 36.32, weight: 2 },
    ],
    drivers: [
      'سامر حداد', 'خالد العلي', 'نور الدين شامي', 'ماهر سليمان', 'رامي يوسف', 'باسل عيسى', 'وسيم قاسم',
      'إياد نجار', 'طارق حمدان', 'فراس خوري', 'مهند زين', 'جورج نصر', 'أنس مراد', 'هادي الأحمد',
    ].map((name, i) => ({ name, phone: `+963991${String(i + 1).padStart(6, '0')}` })),
    waitingAt: ['المرجة', 'المرجة', 'المرجة', 'الشعلان', 'الشعلان', 'المزة', 'باب توما'],
    recentAt: ['المرجة', 'المرجة', 'الشعلان', 'المزة', 'باب توما', 'كفرسوسة'],
    // Quiet / light areas → green «متاح» on low/zero heat cells («بلا طلب»).
    availableAt: ['أبو رمانة', 'الميدان', 'القصاع', 'ركن الدين', 'جرمانا', 'دمر', 'برزة'],
    staleAt: ['كفرسوسة', 'المزة'],
    busy: 3,
  },
  {
    code: 'ALEPPO',
    perDay: 80,
    hotspots: [
      // Spread across distinct H3 res-8 parents within ~10 km of ALEPPO_RADAR_ORIGIN (driver radar).
      { name: 'العزيزية', lat: 36.21, lng: 37.15, weight: 8 },
      { name: 'الجميلية', lat: 36.206, lng: 37.144, weight: 7 },
      { name: 'باب الفرج', lat: 36.203, lng: 37.156, weight: 6 },
      { name: 'جامعة حلب', lat: 36.211, lng: 37.118, weight: 7 },
      { name: 'الفرقان', lat: 36.215, lng: 37.12, weight: 6 },
      { name: 'السبيل', lat: 36.218, lng: 37.135, weight: 5 },
      { name: 'حلب الجديدة', lat: 36.2, lng: 37.11, weight: 6 },
      { name: 'الشهباء', lat: 36.23, lng: 37.13, weight: 5 },
      { name: 'الحمدانية', lat: 36.18, lng: 37.12, weight: 4 },
      { name: 'السليمانية', lat: 36.212, lng: 37.165, weight: 4 },
      { name: 'الأعظمية', lat: 36.195, lng: 37.16, weight: 3 },
      { name: 'الرامي', lat: 36.225, lng: 37.16, weight: 3 },
    ],
    drivers: ['عمر حلبي', 'محمود قباني', 'زياد عطار', 'يامن دباغ', 'حسام كيالي', 'شادي جابري', 'نبيل صباغ', 'أيمن فارس'].map(
      (name, i) => ({ name, phone: `+963992${String(i + 1).padStart(6, '0')}` }),
    ),
    // Waiting + recent bursts on geographically separated areas → several coloured radar cells.
    waitingAt: [
      'العزيزية',
      'العزيزية',
      'جامعة حلب',
      'جامعة حلب',
      'حلب الجديدة',
      'الشهباء',
      'الحمدانية',
      'السليمانية',
    ],
    recentAt: [
      'العزيزية',
      'العزيزية',
      'العزيزية',
      'جامعة حلب',
      'جامعة حلب',
      'جامعة حلب',
      'حلب الجديدة',
      'حلب الجديدة',
      'الشهباء',
      'الشهباء',
      'الحمدانية',
      'الحمدانية',
      'السليمانية',
      'الأعظمية',
      'الرامي',
      'باب الفرج',
    ],
    // Quiet spots (not in waiting/recent bursts) so some hexes stay «بلا طلب» with a green pin.
    availableAt: ['الفرقان', 'السبيل', 'الجميلية'],
    staleAt: ['الأعظمية', 'باب الفرج'],
    busy: 2,
  },
];

/** Deterministic PRNG so every run produces the same city shape. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20261015);
const between = (a: number, b: number) => a + (b - a) * rand();
const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)];
const gauss = () => {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

function weighted(hotspots: Hotspot[]) {
  const total = hotspots.reduce((s, h) => s + h.weight, 0);
  let r = rand() * total;
  for (const h of hotspots) {
    r -= h.weight;
    if (r <= 0) return h;
  }
  return hotspots[hotspots.length - 1];
}

/** ~450 m spread around a point. */
function near(p: Point, sigmaM = 450): Point {
  const dLat = (gauss() * sigmaM) / 111_320;
  const dLng = (gauss() * sigmaM) / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: round7(p.lat + dLat), lng: round7(p.lng + dLng) };
}

function away(p: Point, km: number): Point {
  const angle = rand() * 2 * Math.PI;
  return {
    lat: round7(p.lat + (Math.sin(angle) * km) / 111.32),
    lng: round7(p.lng + (Math.cos(angle) * km) / (111.32 * Math.cos((p.lat * Math.PI) / 180))),
  };
}

const round7 = (n: number) => Math.round(n * 1e7) / 1e7;
const h3 = (p: Point) => latLngToCell(p.lat, p.lng, 9);
const at = (ms: number) => new Date(ms);

type Party = { id: string; userId: string };

async function ensureCustomer(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { phone_role: { phone: CUSTOMER_PHONE, role: GoRole.CUSTOMER } },
    update: {},
    create: { phone: CUSTOMER_PHONE, role: GoRole.CUSTOMER, full_name: 'زبون تجريبي للرادار' },
  });
  const profile = await prisma.goCustomerProfile.upsert({ where: { user_id: user.id }, update: {}, create: { user_id: user.id } });
  return profile.id;
}

async function ensureDriver(name: string, phone: string, branchId: string): Promise<Party> {
  const user = await prisma.user.upsert({
    where: { phone_role: { phone, role: GoRole.DRIVER } },
    update: { full_name: name, branch_id: branchId, is_active: true },
    create: { phone, role: GoRole.DRIVER, full_name: name, branch_id: branchId },
  });
  const profile = await prisma.goDriverProfile.upsert({
    where: { user_id: user.id },
    update: { branch_id: branchId, is_suspended: false, operational_blocked: false },
    create: { user_id: user.id, branch_id: branchId },
  });
  return { id: profile.id, userId: user.id };
}

async function clean() {
  const rides = await prisma.goRide.findMany({ where: { public_number: { startsWith: PREFIX } }, select: { id: true } });
  const ids = rides.map((r) => r.id);
  const phones = CITIES.flatMap((c) => c.drivers.map((d) => d.phone));
  const drivers = await prisma.goDriverProfile.findMany({ where: { user: { phone: { in: phones }, role: GoRole.DRIVER } }, select: { id: true } });
  const driverIds = drivers.map((d) => d.id);
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    await prisma.goOperationalAlert.deleteMany({ where: { ride_id: { in: chunk } } });
    await prisma.goRideOffer.deleteMany({ where: { ride_id: { in: chunk } } });
    await prisma.goRide.deleteMany({ where: { id: { in: chunk } } });
  }
  if (driverIds.length) {
    await prisma.goRideOffer.deleteMany({ where: { driver_id: { in: driverIds } } });
    await prisma.goDriverState.updateMany({
      where: { driver_id: { in: driverIds } },
      data: { availability: GoDriverAvailability.OFFLINE, current_ride_id: null },
    });
  }
  return { rides: ids.length, drivers: driverIds.length };
}

type RideRow = Prisma.GoRideCreateManyInput;
type OfferRow = Prisma.GoRideOfferCreateManyInput;

function fareFor(distanceM: number) {
  return Math.round((2500 + (distanceM / 1000) * 400) / 100) * 100;
}

/** One finished ride. Timeline: created → assigned → arrived → started → completed. */
function historicRide(
  seq: number,
  city: City,
  ctx: { branchId: string; customerId: string; categoryId: string; drivers: Party[] },
  createdMs: number,
  nowMs: number,
  rides: RideRow[],
  offers: OfferRow[],
) {
  const pickup = near(weighted(city.hotspots));
  const km = between(1.5, 7);
  const dropoff = away(pickup, km);
  const distanceM = Math.round(km * 1000 * 1.3);
  const durationSec = Math.round(distanceM / between(6, 9));
  const fare = fareFor(distanceM);
  const assignSec = Math.round(between(20, 140) + (rand() < 0.1 ? between(120, 400) : 0));
  const arriveSec = assignSec + Math.round(between(180, 540));
  const startSec = arriveSec + Math.round(between(30, 150));
  const doneSec = startSec + durationSec;
  const roll = rand();
  let status: GoRideStatus = GoRideStatus.COMPLETED;
  if (roll < 0.05) status = GoRideStatus.FAILED_NO_DRIVER;
  else if (roll < 0.13) status = GoRideStatus.CANCELLED_BY_CUSTOMER;
  else if (roll < 0.16) status = GoRideStatus.NO_SHOW;
  if (status === GoRideStatus.COMPLETED && createdMs + doneSec * 1000 > nowMs) return;

  const driver = pick(ctx.drivers);
  const assigned = status === GoRideStatus.COMPLETED || status === GoRideStatus.NO_SHOW || (status === GoRideStatus.CANCELLED_BY_CUSTOMER && rand() < 0.4);
  const t = (sec: number) => at(createdMs + sec * 1000);
  const id = crypto.randomUUID();
  const row: RideRow = {
    id,
    public_number: `${PREFIX}${city.code.slice(0, 3)}-${String(seq).padStart(6, '0')}`,
    customer_id: ctx.customerId,
    driver_id: assigned ? driver.id : null,
    branch_id: ctx.branchId,
    ride_category_id: ctx.categoryId,
    type: GoRideType.IMMEDIATE,
    status,
    payment_method: GoPaymentMethod.CASH,
    payment_status: status === GoRideStatus.COMPLETED ? GoPaymentStatus.COLLECTED : GoPaymentStatus.WAIVED,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    pickup_h3: h3(pickup),
    pickup_address: 'رحلة تجريبية للرادار',
    original_destination_lat: dropoff.lat,
    original_destination_lng: dropoff.lng,
    original_destination_address: 'وجهة تجريبية',
    estimated_distance_m: distanceM,
    estimated_duration_sec: durationSec,
    estimated_fare: fare,
    estimated_route_polyline: encodePolyline([pickup, dropoff]),
    estimated_route_source: 'seed',
    created_at: t(0),
    assigned_at: assigned ? t(assignSec) : null,
  };
  if (status === GoRideStatus.COMPLETED) {
    Object.assign(row, {
      arrived_at: t(arriveSec),
      started_at: t(startSec),
      completed_at: t(doneSec),
      actual_dropoff_lat: dropoff.lat,
      actual_dropoff_lng: dropoff.lng,
      actual_distance_m: distanceM,
      actual_duration_sec: durationSec,
      gross_final_fare: fare,
      customer_payable: fare,
    });
  } else if (status === GoRideStatus.NO_SHOW) {
    Object.assign(row, { arrived_at: t(arriveSec), cancelled_at: t(arriveSec + 300), cancel_reason_code: 'NO_SHOW' });
  } else if (status === GoRideStatus.CANCELLED_BY_CUSTOMER) {
    const when = assigned ? assignSec + between(30, 200) : between(20, 160);
    Object.assign(row, { cancelled_at: t(when), cancel_reason_code: 'CHANGED_MIND' });
  } else {
    Object.assign(row, { cancelled_at: t(300), cancel_reason_code: 'NO_DRIVER' });
  }
  rides.push(row);

  if (!assigned) return;
  const others = ctx.drivers.filter((d) => d.id !== driver.id);
  const misses = rand() < 0.6 ? Math.floor(between(1, 3)) : 0;
  for (let i = 0; i < misses && others.length; i += 1) {
    const other = others.splice(Math.floor(rand() * others.length), 1)[0];
    const offeredSec = Math.max(1, assignSec - 20 * (misses - i));
    offers.push({
      ride_id: id,
      driver_id: other.id,
      batch_number: i + 1,
      radius_m: 1000 + i * 500,
      status: rand() < 0.5 ? GoRideOfferStatus.DECLINED : GoRideOfferStatus.EXPIRED,
      offered_at: t(offeredSec),
      expires_at: t(offeredSec + 15),
      responded_at: t(offeredSec + Math.round(between(3, 15))),
    });
  }
  offers.push({
    ride_id: id,
    driver_id: driver.id,
    batch_number: misses + 1,
    radius_m: 1000 + misses * 500,
    status: GoRideOfferStatus.ACCEPTED,
    offered_at: t(Math.max(0, assignSec - 8)),
    expires_at: t(assignSec + 7),
    responded_at: t(assignSec),
  });
}

async function seedCity(city: City, customerId: string, categoryId: string, nowMs: number) {
  const branch = await prisma.goBranch.findUnique({ where: { code: city.code } });
  if (!branch) throw new Error(`Branch ${city.code} not found — run "npm run seed" first.`);
  const drivers: Party[] = [];
  for (const d of city.drivers) drivers.push(await ensureDriver(d.name, d.phone, branch.id));
  const ctx = { branchId: branch.id, customerId, categoryId, drivers };

  const rides: RideRow[] = [];
  const offers: OfferRow[] = [];
  let seq = 0;
  const startHour = Math.floor(nowMs / 3_600_000) * 3_600_000 - DAYS * 24 * 3_600_000;
  for (let hourMs = startHour; hourMs < nowMs; hourMs += 3_600_000) {
    const local = new Date(hourMs + TZ_OFFSET_H * 3_600_000);
    const weekday = local.getUTCDay();
    const dayFactor = weekday === 5 ? 0.7 : weekday === 4 ? 1.15 : 1;
    const rate = (city.perDay * HOURLY[local.getUTCHours()] * dayFactor) / HOURLY_SUM;
    const count = Math.floor(rate) + (rand() < rate % 1 ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      const created = hourMs + Math.floor(rand() * 3_600_000);
      if (created > nowMs - 2 * MIN) continue;
      seq += 1;
      historicRide(seq, city, ctx, created, nowMs, rides, offers);
    }
  }
  // A busier last hour so the default "last hour" view has real shading.
  for (let i = 0; i < Math.round(city.perDay / 5); i += 1) {
    seq += 1;
    historicRide(seq, city, ctx, nowMs - between(25, 60) * MIN, nowMs, rides, offers);
  }

  const spot = (name: string) => city.hotspots.find((h) => h.name === name)!;

  // Explicit recent demand pinned to named hotspots (driver radar heat map — RADAR-001).
  // Tight sigma keeps each hotspot in its own display cell (res 8) more reliably than weighted random.
  for (const name of city.recentAt) {
    seq += 1;
    const pickup = near(spot(name), 80);
    const dropoff = away(pickup, between(2, 5));
    const distanceM = Math.round(between(2000, 6000));
    const doneSec = Math.round(distanceM / between(6, 9));
    // Finish before "now": create far enough back that assign → arrive → start → complete fit.
    const tripMs = (5 * MIN) + doneSec * 1000;
    const created = nowMs - between(tripMs + 2 * MIN, 50 * MIN);
    const status = rand() < 0.15 ? GoRideStatus.FAILED_NO_DRIVER : GoRideStatus.COMPLETED;
    const id = crypto.randomUUID();
    const driver = pick(ctx.drivers);
    const fare = fareFor(distanceM);
    const row: RideRow = {
      id,
      public_number: `${PREFIX}${city.code.slice(0, 3)}-${String(seq).padStart(6, '0')}`,
      customer_id: customerId,
      driver_id: status === GoRideStatus.COMPLETED ? driver.id : null,
      branch_id: branch.id,
      ride_category_id: categoryId,
      type: GoRideType.IMMEDIATE,
      status,
      payment_method: GoPaymentMethod.CASH,
      payment_status: status === GoRideStatus.COMPLETED ? GoPaymentStatus.COLLECTED : GoPaymentStatus.WAIVED,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      pickup_h3: h3(pickup),
      pickup_address: `طلب حديث للرادار — ${name}`,
      original_destination_lat: dropoff.lat,
      original_destination_lng: dropoff.lng,
      original_destination_address: 'وجهة تجريبية',
      estimated_distance_m: distanceM,
      estimated_duration_sec: doneSec,
      estimated_fare: fare,
      estimated_route_polyline: encodePolyline([pickup, dropoff]),
      estimated_route_source: 'seed',
      created_at: at(created),
      assigned_at: status === GoRideStatus.COMPLETED ? at(created + 60_000) : null,
    };
    if (status === GoRideStatus.COMPLETED) {
      Object.assign(row, {
        arrived_at: at(created + 4 * MIN),
        started_at: at(created + 5 * MIN),
        completed_at: at(created + tripMs),
        actual_dropoff_lat: dropoff.lat,
        actual_dropoff_lng: dropoff.lng,
        actual_distance_m: distanceM,
        actual_duration_sec: doneSec,
        gross_final_fare: fare,
        customer_payable: fare,
      });
    } else {
      Object.assign(row, { cancelled_at: at(created + 3 * MIN), cancel_reason_code: 'NO_DRIVER' });
    }
    rides.push(row);
  }

  // Requests searching for a driver right now.
  for (const name of city.waitingAt) {
    seq += 1;
    const pickup = near(spot(name), 120);
    const dropoff = away(pickup, between(2, 6));
    const distanceM = Math.round(between(2500, 7500));
    rides.push({
      public_number: `${PREFIX}${city.code.slice(0, 3)}-${String(seq).padStart(6, '0')}`,
      customer_id: customerId,
      branch_id: branch.id,
      ride_category_id: categoryId,
      type: GoRideType.IMMEDIATE,
      status: GoRideStatus.SEARCHING,
      payment_method: GoPaymentMethod.CASH,
      payment_status: GoPaymentStatus.PENDING,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      pickup_h3: h3(pickup),
      pickup_address: `طلب تجريبي — ${name}`,
      original_destination_lat: dropoff.lat,
      original_destination_lng: dropoff.lng,
      original_destination_address: 'وجهة تجريبية',
      estimated_distance_m: distanceM,
      estimated_duration_sec: Math.round(distanceM / 7),
      estimated_fare: fareFor(distanceM),
      estimated_route_polyline: encodePolyline([pickup, dropoff]),
      estimated_route_source: 'seed',
      created_at: at(nowMs - between(1, 6) * MIN),
    });
  }

  // Rides in progress, each with a busy driver.
  const busy = drivers.slice(0, city.busy);
  const activeRideIds = new Map<string, string>();
  for (const driver of busy) {
    seq += 1;
    const pickup = near(weighted(city.hotspots));
    const dropoff = away(pickup, between(3, 6));
    const distanceM = Math.round(between(3500, 8000));
    const id = crypto.randomUUID();
    activeRideIds.set(driver.id, id);
    const created = nowMs - between(14, 22) * MIN;
    rides.push({
      id,
      public_number: `${PREFIX}${city.code.slice(0, 3)}-${String(seq).padStart(6, '0')}`,
      customer_id: customerId,
      driver_id: driver.id,
      branch_id: branch.id,
      ride_category_id: categoryId,
      type: GoRideType.IMMEDIATE,
      status: GoRideStatus.IN_PROGRESS,
      payment_method: GoPaymentMethod.CASH,
      payment_status: GoPaymentStatus.CASH_EXPECTED,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      pickup_h3: h3(pickup),
      pickup_address: 'رحلة جارية تجريبية',
      original_destination_lat: dropoff.lat,
      original_destination_lng: dropoff.lng,
      original_destination_address: 'وجهة تجريبية',
      estimated_distance_m: distanceM,
      estimated_duration_sec: Math.round(distanceM / 7),
      estimated_fare: fareFor(distanceM),
      estimated_route_polyline: encodePolyline([pickup, dropoff]),
      estimated_route_source: 'seed',
      created_at: at(created),
      assigned_at: at(created + 60_000),
      arrived_at: at(created + 6 * MIN),
      started_at: at(nowMs - between(3, 7) * MIN),
    });
  }

  for (let i = 0; i < rides.length; i += 1000) await prisma.goRide.createMany({ data: rides.slice(i, i + 1000) });
  for (let i = 0; i < offers.length; i += 2000) await prisma.goRideOffer.createMany({ data: offers.slice(i, i + 2000), skipDuplicates: true });

  // Driver states covering the command-center legend:
  // مشغول = BUSY + ride · متاح = ONLINE fresh · موقع قديم = ONLINE with old last_location_at · rest OFFLINE.
  const now = at(nowMs);
  const staleAgeMs = 5 * MIN; // > default stale_location_seconds (60)
  const busyDrivers = drivers.slice(0, city.busy);
  const staleDrivers = drivers.slice(city.busy, city.busy + city.staleAt.length);
  const availableDrivers = drivers.slice(city.busy + city.staleAt.length);

  for (const [index, driver] of drivers.entries()) {
    const rideId = activeRideIds.get(driver.id);
    const staleSpot = !rideId ? city.staleAt[index - city.busy] : undefined;
    const availableSpot = !rideId && !staleSpot ? city.availableAt[index - city.busy - city.staleAt.length] : undefined;
    const position = rideId
      ? near(weighted(city.hotspots), 300)
      : staleSpot
        ? near(spot(staleSpot), 200)
        : availableSpot
          ? near(spot(availableSpot), 200)
          : near(weighted(city.hotspots), 600);
    const availability = rideId
      ? GoDriverAvailability.BUSY
      : staleSpot || availableSpot
        ? GoDriverAvailability.ONLINE
        : GoDriverAvailability.OFFLINE;
    const data = {
      availability,
      last_lat: position.lat,
      last_lng: position.lng,
      h3_index: h3(position),
      last_location_at: staleSpot ? at(nowMs - staleAgeMs) : now,
      current_ride_id: rideId ?? null,
    };
    await prisma.goDriverState.upsert({ where: { driver_id: driver.id }, update: data, create: { driver_id: driver.id, ...data } });
  }

  const statuses = rides.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  const recentCells = new Set(
    rides
      .filter((r) => r.created_at && (r.created_at as Date).getTime() >= nowMs - 60 * MIN)
      .map((r) => r.pickup_h3)
      .filter(Boolean),
  );
  console.log(`${city.code}: ${rides.length} rides, ${offers.length} offers`, statuses);
  console.log(
    `  last-hour H3(res9): ${recentCells.size}; waiting: ${city.waitingAt.length}; busy: ${busyDrivers.length}; available: ${availableDrivers.length}; stale: ${staleDrivers.length}`,
  );
}

/** Pin the known Aleppo staging driver near the radar origin so the mobile app gets a stable probe. */
async function pinAleppoStagingDriver(nowMs: number) {
  const branch = await prisma.goBranch.findUnique({ where: { code: 'ALEPPO' } });
  if (!branch) {
    console.warn('ALEPPO branch missing — skip staging driver pin (run npm run seed first).');
    return;
  }
  const user = await prisma.user.upsert({
    where: { phone_role: { phone: ALEPPO_STAGING_DRIVER_PHONE, role: GoRole.DRIVER } },
    update: { full_name: 'فادي عمر', branch_id: branch.id, is_active: true },
    create: {
      phone: ALEPPO_STAGING_DRIVER_PHONE,
      role: GoRole.DRIVER,
      full_name: 'فادي عمر',
      branch_id: branch.id,
    },
  });
  const profile = await prisma.goDriverProfile.upsert({
    where: { user_id: user.id },
    update: { branch_id: branch.id, is_suspended: false, operational_blocked: false },
    create: { user_id: user.id, branch_id: branch.id },
  });
  const data = {
    availability: GoDriverAvailability.ONLINE,
    last_lat: ALEPPO_RADAR_ORIGIN.lat,
    last_lng: ALEPPO_RADAR_ORIGIN.lng,
    h3_index: h3(ALEPPO_RADAR_ORIGIN),
    last_location_at: at(nowMs),
    current_ride_id: null,
  };
  await prisma.goDriverState.upsert({
    where: { driver_id: profile.id },
    update: data,
    create: { driver_id: profile.id, ...data },
  });
  console.log(
    `Aleppo staging driver ${ALEPPO_STAGING_DRIVER_PHONE} ONLINE at ${ALEPPO_RADAR_ORIGIN.lat},${ALEPPO_RADAR_ORIGIN.lng} (no active ride).`,
  );
}

/** Phones reserved for the «موقع قديم» legend — live mode must not refresh them. */
function stalePhones() {
  return CITIES.flatMap((city) =>
    city.drivers.slice(city.busy, city.busy + city.staleAt.length).map((d) => d.phone),
  );
}

/** Keeps non-stale demo drivers' locations fresh so they stay available/busy (not stale). */
async function live() {
  const keepStale = new Set(stalePhones());
  const phones = CITIES.flatMap((c) => c.drivers.map((d) => d.phone)).filter((p) => !keepStale.has(p));
  console.log('Live mode: refreshing fresh demo drivers every 15 s (stale legend pins kept old). Ctrl+C to stop.');
  let stop = false;
  process.on('SIGINT', () => {
    stop = true;
  });
  while (!stop) {
    const states = await prisma.goDriverState.findMany({
      where: {
        availability: { in: [GoDriverAvailability.ONLINE, GoDriverAvailability.BUSY] },
        driver: { user: { phone: { in: phones }, role: GoRole.DRIVER } },
      },
      select: { driver_id: true, last_lat: true, last_lng: true },
    });
    const now = new Date();
    for (const s of states) {
      if (s.last_lat == null || s.last_lng == null) continue;
      const p = near({ lat: Number(s.last_lat), lng: Number(s.last_lng) }, 25);
      await prisma.goDriverState.update({
        where: { driver_id: s.driver_id },
        data: { last_lat: p.lat, last_lng: p.lng, h3_index: h3(p), last_location_at: now },
      });
    }
    process.stdout.write(`\r${now.toLocaleTimeString()} — ${states.length} demo drivers refreshed   `);
    for (let i = 0; i < 15 && !stop; i += 1) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('\nLive mode stopped.');
}

export type SeedRadarOptions = {
  /** Limit to Aleppo only (default: Damascus + Aleppo). */
  aleppoOnly?: boolean;
  /** Skip wipe of previous RADAR-DEMO rows. */
  skipClean?: boolean;
};

/** Seed command-center legend: بلا طلب, طلب/توقع أقل→أكثر, متاح, مشغول, موقع قديم, طلب بانتظار. */
export async function seedRadarDemo(options: SeedRadarOptions = {}) {
  if (!options.skipClean) {
    const removed = await clean();
    if (removed.rides || removed.drivers) {
      console.log(`Removed previous radar demo: ${removed.rides} rides, demo drivers set offline.`);
    }
  }

  const category = await prisma.goRideCategory.findFirst({ where: { code: 'ECONOMY' } });
  if (!category) throw new Error('Category ECONOMY not found — run "npm run seed" first.');
  const customerId = await ensureCustomer();
  const nowMs = Date.now();
  const cities = options.aleppoOnly ? CITIES.filter((c) => c.code === 'ALEPPO') : CITIES;
  if (!cities.length) throw new Error('No cities selected for radar seed.');
  for (const city of cities) await seedCity(city, customerId, category.id, nowMs);
  await pinAleppoStagingDriver(nowMs);
  console.log(
    [
      'Radar legend ready:',
      '  بلا طلب / طلب أقل→أكثر (observed heat + quiet available cells)',
      '  طلب متوقع أقل→أكثر (35 days history → forecast ok)',
      '  متاح · مشغول · موقع قديم · طلب بانتظار',
    ].join('\n'),
  );
  console.log(
    `RADAR-001 probe: GET /api/v1/go/driver/radar?lat=${ALEPPO_RADAR_ORIGIN.lat}&lng=${ALEPPO_RADAR_ORIGIN.lng}&radius_m=10000`,
  );
  console.log(`  as driver ${ALEPPO_STAGING_DRIVER_PHONE} — expect ≥2 cells with heat ≥ 1.`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--clean')) {
    const removed = await clean();
    console.log(`Removed radar demo: ${removed.rides} rides, ${removed.drivers} drivers offline.`);
    return;
  }

  await seedRadarDemo({ aleppoOnly: args.has('--aleppo') });
  if (args.has('--live')) await live();
}

const isDirectRun = require.main === module;
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
      await pool.end();
    });
}
