import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { assertIntercityCityPairIds } from './ride-intercity';

describe('assertIntercityCityPairIds', () => {
  it('allows omitting both', () => {
    expect(assertIntercityCityPairIds({})).toBeNull();
  });

  it('requires both when one is set', () => {
    try {
      assertIntercityCityPairIds({ pickup_city_id: 'a' });
      fail('expected throw');
    } catch (err) {
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
  });

  it('rejects same city', () => {
    try {
      assertIntercityCityPairIds({
        pickup_city_id: 'same',
        destination_city_id: 'same',
      });
      fail('expected throw');
    } catch (err) {
      expect((err as GoException).code).toBe(GoErrorCode.VALIDATION_ERROR);
    }
  });

  it('accepts distinct cities', () => {
    expect(
      assertIntercityCityPairIds({
        pickup_city_id: 'pickup',
        destination_city_id: 'dest',
      }),
    ).toEqual({ pickup_city_id: 'pickup', destination_city_id: 'dest' });
  });
});
