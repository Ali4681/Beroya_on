import { Prisma } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { maskPhone, newReference, newStoreCode, parseAmount, parsePhone, rechargeRequestHash } from './store-money';

function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (err) {
    return err instanceof GoException ? (err.getResponse() as { code: string }).code : 'OTHER';
  }
  return null;
}

describe('store-money', () => {
  describe('parseAmount', () => {
    it('accepts positive decimals with up to two fraction digits', () => {
      expect(parseAmount('50000').toFixed(2)).toBe('50000.00');
      expect(parseAmount('12.5').toFixed(2)).toBe('12.50');
      expect(parseAmount(' 7.25 ').toFixed(2)).toBe('7.25');
      expect(parseAmount(1500).toFixed(2)).toBe('1500.00');
    });

    it.each(['0', '0.00', '-5', '-0.01', '1e5', '1.234', '', 'abc', '10,000', '+5'])('rejects %p', (value) => {
      expect(codeOf(() => parseAmount(value))).toBe(GoErrorCode.VALIDATION_ERROR);
    });

    it('rejects non-string, non-number input', () => {
      expect(codeOf(() => parseAmount(null))).toBe(GoErrorCode.VALIDATION_ERROR);
      expect(codeOf(() => parseAmount({ amount: 5 }))).toBe(GoErrorCode.VALIDATION_ERROR);
    });

    it('rejects amounts above the store movement ceiling', () => {
      expect(codeOf(() => parseAmount('1000000000000.01'))).toBe(GoErrorCode.VALIDATION_ERROR);
      expect(parseAmount('1000000000000').toFixed(2)).toBe('1000000000000.00');
    });

    it('keeps exact decimal arithmetic (no float drift)', () => {
      const sum = parseAmount('0.1').plus(parseAmount('0.2'));
      expect(sum.equals(new Prisma.Decimal('0.3'))).toBe(true);
    });
  });

  describe('parsePhone', () => {
    it('normalises Syrian local numbers to E.164', () => {
      expect(parsePhone('0912345678')).toBe('+963912345678');
      expect(parsePhone('912345678')).toBe('+963912345678');
      expect(parsePhone('+963912345678')).toBe('+963912345678');
    });

    it.each(['', '123', 'not-a-phone', null])('rejects %p', (value) => {
      expect(codeOf(() => parsePhone(value))).toBe(GoErrorCode.VALIDATION_ERROR);
    });
  });

  describe('maskPhone', () => {
    it('never returns the full number', () => {
      expect(maskPhone('+963912345678')).toBe('0912***678');
      expect(maskPhone('+963912345678')).not.toContain('2345');
      expect(maskPhone('12345')).toBe('*****');
      expect(maskPhone(null)).toBe('');
    });
  });

  describe('references', () => {
    it('uses the prefix and an unambiguous alphabet', () => {
      for (let i = 0; i < 200; i++) {
        expect(newReference('PR')).toMatch(/^PR-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{10}$/);
      }
      expect(newStoreCode()).toMatch(/^ST-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    });

    it('does not collide in a large sample', () => {
      const refs = new Set(Array.from({ length: 5000 }, () => newReference('SC')));
      expect(refs.size).toBe(5000);
    });
  });

  describe('rechargeRequestHash', () => {
    const base = { mobile_number: '+963912345678', amount: new Prisma.Decimal('5000'), currency: 'SYP' };

    it('is stable for the same business request, whatever the amount spelling', () => {
      expect(rechargeRequestHash(base)).toBe(rechargeRequestHash({ ...base, amount: new Prisma.Decimal('5000.00') }));
    });

    it('changes when any field changes', () => {
      const h = rechargeRequestHash(base);
      expect(rechargeRequestHash({ ...base, amount: new Prisma.Decimal('5000.01') })).not.toBe(h);
      expect(rechargeRequestHash({ ...base, mobile_number: '+963912345679' })).not.toBe(h);
      expect(rechargeRequestHash({ ...base, currency: 'USD' })).not.toBe(h);
    });
  });
});
