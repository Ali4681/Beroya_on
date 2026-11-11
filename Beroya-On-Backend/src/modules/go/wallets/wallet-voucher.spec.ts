import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { assertValidVoucherCode, normalizeVoucherCode } from './wallet-voucher';

describe('wallet-voucher', () => {
  it('normalizes bare 12 chars to dashed', () => {
    expect(normalizeVoucherCode('abcdefghijkl')).toBe('ABCD-EFGH-IJKL');
  });

  it('accepts dashed uppercase', () => {
    expect(assertValidVoucherCode('AbCd-EfGh-IjKl')).toBe('ABCD-EFGH-IJKL');
  });

  it('rejects empty / bad format', () => {
    try {
      assertValidVoucherCode('  ');
      fail('expected throw');
    } catch (err) {
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
    try {
      assertValidVoucherCode('SHORT');
      fail('expected throw');
    } catch (err) {
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
  });
});
