import { GoErrorCode } from './go-error-codes';
import { localizeErrorMessage, resolveAcceptLanguage } from './error-i18n';

describe('error i18n', () => {
  it('resolves Accept-Language to ar or en', () => {
    expect(resolveAcceptLanguage(undefined)).toBe('ar');
    expect(resolveAcceptLanguage('ar-SY,ar;q=0.9')).toBe('ar');
    expect(resolveAcceptLanguage('en-US,en;q=0.9')).toBe('en');
  });

  it('localizes discount area messages with code_detail', () => {
    expect(
      localizeErrorMessage(GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA, 'ar', {
        code_detail: 'BRANCH',
        name_ar: 'دمشق',
        name_en: 'Damascus',
      }),
    ).toBe('هذا الكود خاص بمحافظة دمشق');
    expect(
      localizeErrorMessage(GoErrorCode.DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA, 'en', {
        code_detail: 'BRANCH',
        name_ar: 'دمشق',
        name_en: 'Damascus',
      }),
    ).toBe('This code is only valid in Damascus governorate');
  });
});
