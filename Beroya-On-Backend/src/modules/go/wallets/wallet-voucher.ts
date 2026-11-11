import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';

/** Figma format: XXXX-XXXX-XXXX (letters/digits). */
export const WALLET_VOUCHER_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Normalize to uppercase dashed form; strips spaces. */
export function normalizeVoucherCode(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (WALLET_VOUCHER_CODE_RE.test(compact)) return compact;
  const bare = compact.replace(/-/g, '');
  if (/^[A-Z0-9]{12}$/.test(bare)) {
    return `${bare.slice(0, 4)}-${bare.slice(4, 8)}-${bare.slice(8, 12)}`;
  }
  return compact;
}

export function assertValidVoucherCode(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'code', messages: ['code is required'] }],
    });
  }
  const code = normalizeVoucherCode(raw);
  if (!WALLET_VOUCHER_CODE_RE.test(code)) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [{ field: 'code', messages: ['code must look like XXXX-XXXX-XXXX'] }],
    });
  }
  return code;
}
