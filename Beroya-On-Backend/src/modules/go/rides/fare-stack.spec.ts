import { Prisma } from '@/generated/prisma/client';
import { resolveFareStack } from './fare-stack';

const n = (value: Prisma.Decimal) => value.toNumber();

describe('fare stack', () => {
  const gross = new Prisma.Decimal(100);

  it('applies a discount alone', () => {
    const result = resolveFareStack({
      gross,
      discount: new Prisma.Decimal(15),
      compensation: new Prisma.Decimal(0),
      decision: null,
    });
    expect(n(result.payable)).toBe(85);
    expect(result.decision).toBeNull();
    expect(result.consumeDiscount).toBe(true);
    expect(result.releaseDiscount).toBe(false);
  });

  it('applies compensation alone', () => {
    const result = resolveFareStack({
      gross,
      discount: new Prisma.Decimal(0),
      compensation: new Prisma.Decimal(20),
      decision: null,
    });
    expect(n(result.payable)).toBe(80);
    expect(n(result.compensationTotal)).toBe(20);
    expect(result.consumeDiscount).toBe(false);
  });

  it('holds both until staff decides', () => {
    const result = resolveFareStack({
      gross,
      discount: new Prisma.Decimal(15),
      compensation: new Prisma.Decimal(20),
      decision: null,
    });
    expect(n(result.payable)).toBe(100);
    expect(n(result.discountTotal)).toBe(0);
    expect(result.decision).toBe('PENDING');
    expect(result.consumeDiscount).toBe(false);
    expect(result.releaseDiscount).toBe(false);
  });

  it('keeps the hold when the stored decision is still pending', () => {
    const result = resolveFareStack({
      gross,
      discount: new Prisma.Decimal(15),
      compensation: new Prisma.Decimal(20),
      decision: 'PENDING',
    });
    expect(result.decision).toBe('PENDING');
    expect(n(result.payable)).toBe(100);
  });

  it('applies only the discount', () => {
    const result = resolveFareStack({
      gross,
      discount: new Prisma.Decimal(15),
      compensation: new Prisma.Decimal(20),
      decision: 'DISCOUNT_ONLY',
    });
    expect(n(result.payable)).toBe(85);
    expect(n(result.compensationTotal)).toBe(0);
    expect(result.consumeDiscount).toBe(true);
    expect(result.releaseDiscount).toBe(false);
  });

  it('applies only the compensation and releases the code', () => {
    const result = resolveFareStack({
      gross,
      discount: new Prisma.Decimal(15),
      compensation: new Prisma.Decimal(20),
      decision: 'COMPENSATION_ONLY',
    });
    expect(n(result.payable)).toBe(80);
    expect(n(result.discountTotal)).toBe(0);
    expect(result.consumeDiscount).toBe(false);
    expect(result.releaseDiscount).toBe(true);
  });

  it('applies both when staff chooses both', () => {
    const result = resolveFareStack({
      gross,
      discount: new Prisma.Decimal(15),
      compensation: new Prisma.Decimal(20),
      decision: 'BOTH',
    });
    expect(n(result.payable)).toBe(65);
    expect(result.consumeDiscount).toBe(true);
    expect(result.releaseDiscount).toBe(false);
  });
});
