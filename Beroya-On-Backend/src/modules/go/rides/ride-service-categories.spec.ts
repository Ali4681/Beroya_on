import { GoServiceCode } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import {
  assertRideCategoryMatchesService,
  categoryCodesForServiceList,
} from './ride-service-categories';

describe('ride-service-categories', () => {
  it('lists AMBULANCE-only codes for ambulance picker', () => {
    expect(categoryCodesForServiceList(GoServiceCode.AMBULANCE)).toEqual(['AMBULANCE']);
  });

  it('uses default DAILY classes when service_type omitted', () => {
    expect(categoryCodesForServiceList(undefined)).toBe('default');
    expect(categoryCodesForServiceList(GoServiceCode.DAILY)).toBe('default');
    expect(categoryCodesForServiceList(GoServiceCode.INTERCITY)).toBe('default');
  });

  it('requires AMBULANCE category for AMBULANCE service', () => {
    expect(() => assertRideCategoryMatchesService(GoServiceCode.AMBULANCE, 'AMBULANCE')).not.toThrow();
    try {
      assertRideCategoryMatchesService(GoServiceCode.AMBULANCE, 'ECONOMY');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GoException);
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
      expect((err as GoException).extra).toMatchObject({
        errors: [{ field: 'ride_category_id' }],
      });
    }
  });

  it('rejects AMBULANCE category for DAILY', () => {
    try {
      assertRideCategoryMatchesService(GoServiceCode.DAILY, 'AMBULANCE');
      fail('expected throw');
    } catch (err) {
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
  });
});
